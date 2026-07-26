#!/usr/bin/env bun
// grammar_span_receipt.ts — production parser receipt 的精确 token/span 校验器。
//
// 职责(S1 规格 3.2.3/3.3):
//   1) 直接消费 production receipt tokens 的 canonical kind、全局 index、
//      sourceTextId 与原始 UTF-8 byte span，不重分词、不包围字面量;
//   2) preflightParserSpanReceipts: 对 driver 未来发射的 GrammarParserSpanReceipt[]
//      做逐项诊断(source/span/obligation 三项绑定 + 自洽 hash + provenance 形态),
//      按 receipt 收集 issue 而非首错即抛(driver 联调期定位用);
//   3) bindDriverReceipts: 干净 receipt 装配 GrammarSourceWitness 并交给
//      m9024 buildGrammarSourceCoverageReceipt(唯一权威门禁)产出覆盖回执。
//      driver receipt 一到, 调这一个函数即可接线。
//
import {
  CHENG_GRAMMAR_PARSER_SPAN_RECEIPT_SCHEMA,
  buildGrammarSourceCoverageReceipt,
  grammarParserCanonicalTokenSpanSha256,
  type ChengGrammarObligationContract,
  type GrammarParserCanonicalToken,
  type GrammarParserSpanReceipt,
  type GrammarSourceCoverageReceipt,
  type GrammarSourceWitness,
} from "../src/cheng_semantic_pipeline_matrix_m9024.ts";
import {canonicalJson, sha256} from "../src/cheng_semantic_matrix_m9023.ts";

function hashCanonical(value: unknown): string {
  return sha256(canonicalJson(value));
}

// ---------------------------------------------------------------- source-plan lint token 模型
// 仅供 source-plan/lint 自测；parser receipt 证据禁止调用本模型。
function chengCodeWithoutCommentsAndLiteralsForLint(source: string): string {
  let out = "";
  let index = 0;
  while (index < source.length) {
    const ch = source[index];
    if (ch === undefined) break;
    if (ch === "#") {
      while (index < source.length && source[index] !== "\n") {
        out += " ";
        index += 1;
      }
      continue;
    }
    if (ch === '"') {
      const triple = source.slice(index, index + 3) === '"""';
      const width = triple ? 3 : 1;
      out += " ".repeat(width);
      index += width;
      while (index < source.length) {
        if (triple && source.slice(index, index + 3) === '"""') {
          out += "   ";
          index += 3;
          break;
        }
        const current = source[index];
        if (!triple && current === "\\") {
          out += "  ";
          index += 2;
          continue;
        }
        out += current === "\n" ? "\n" : " ";
        index += 1;
        if (!triple && current === '"') break;
      }
      continue;
    }
    if (ch === "'") {
      out += " ";
      index += 1;
      while (index < source.length) {
        const current = source[index];
        if (current === "\\") {
          out += "  ";
          index += 2;
          continue;
        }
        out += " ";
        index += 1;
        if (current === "'") break;
      }
      continue;
    }
    out += ch;
    index += 1;
  }
  return out;
}

const PUBLIC_TOKEN_PATTERN = /@[A-Za-z_][A-Za-z0-9_]*|->|&&|\|\||\.\.<|\.\.|[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|\S/g;

export interface PublicToken {
  readonly text: string;
  readonly start: number; // 源字符偏移(strip 保偏移, 与原始 source 对齐)
  readonly end: number;
}

export function chengPublicTokensWithOffsets(source: string): readonly PublicToken[] {
  const code = chengCodeWithoutCommentsAndLiteralsForLint(source);
  const out: PublicToken[] = [];
  for (const match of code.matchAll(PUBLIC_TOKEN_PATTERN)) {
    out.push({text: match[0], start: match.index, end: match.index + match[0].length});
  }
  return out;
}

export function chengPublicTokensLocal(source: string): readonly string[] {
  return chengPublicTokensWithOffsets(source).map((entry) => entry.text);
}

export interface ProductionParserToken {
  readonly index: number;
  readonly kind: number;
  readonly sourceTextId: number;
  readonly start: number;
  readonly end: number;
}

export interface CanonicalParserTokenSpan {
  readonly tokenStart: number;
  readonly tokenEnd: number;
  readonly spanStartByte: number;
  readonly spanEndByte: number;
  readonly canonicalTokens: readonly GrammarParserCanonicalToken[];
  readonly tokenSha256: string;
}

export function canonicalParserTokenSpanFromReceipt(
  source: string,
  receiptTokens: readonly ProductionParserToken[],
  tokenKindNames: readonly string[],
  spanStartByte: number,
  spanEndByte: number,
): CanonicalParserTokenSpan {
  const sourceByteLength = Buffer.byteLength(source, "utf8");
  if (!Number.isInteger(spanStartByte) ||
      !Number.isInteger(spanEndByte) ||
      spanStartByte < 0 ||
      spanEndByte <= spanStartByte ||
      spanEndByte > sourceByteLength) {
    throw new Error(
      `production parser byte span 越界: ` +
      `[${spanStartByte}, ${spanEndByte}) / bytes=${sourceByteLength}`,
    );
  }
  const overlapping = receiptTokens.filter((token) =>
    token.sourceTextId === 0 &&
    token.end > spanStartByte &&
    token.start < spanEndByte);
  if (overlapping.length === 0 ||
      overlapping[0]!.start !== spanStartByte ||
      overlapping[overlapping.length - 1]!.end !== spanEndByte) {
    throw new Error(
      `production parser byte span 未精确落在 token 边界: ` +
      `[${spanStartByte}, ${spanEndByte})`,
    );
  }
  const canonicalTokens = overlapping.map((token, offset) => {
    if (!Number.isInteger(token.index) ||
        token.index < 0 ||
        receiptTokens[token.index] !== token ||
        (offset > 0 &&
          token.index !== overlapping[offset - 1]!.index + 1) ||
        !Number.isInteger(token.kind) ||
        token.kind <= 0 ||
        !Number.isInteger(token.start) ||
        !Number.isInteger(token.end) ||
        token.start < spanStartByte ||
        token.end <= token.start ||
        token.end > spanEndByte) {
      throw new Error("production parser token row invalid");
    }
    const kindText = tokenKindNames[token.kind];
    if (kindText === undefined ||
        !/^ParserValueToken[A-Za-z0-9_]+$/.test(kindText)) {
      throw new Error(
        `production parser token kind 不在 canonical enum: ${token.kind}`,
      );
    }
    return {
      index: token.index,
      kind: token.kind,
      kindText,
      sourceTextId: token.sourceTextId,
      startByte: token.start,
      endByte: token.end,
    };
  });
  const tokenSha256 = grammarParserCanonicalTokenSpanSha256(
    source,
    spanStartByte,
    spanEndByte,
    canonicalTokens,
  );
  return {
    tokenStart: canonicalTokens[0]!.index,
    tokenEnd: canonicalTokens[canonicalTokens.length - 1]!.index + 1,
    spanStartByte,
    spanEndByte,
    canonicalTokens,
    tokenSha256,
  };
}

// ---------------------------------------------------------------- 校验
export type ReceiptIssueCode =
  | "GSR01_SCHEMA"
  | "GSR02_RECEIPT_HASH"
  | "GSR03_OBLIGATION_BINDING"
  | "GSR04_SOURCE_BINDING"
  | "GSR05_TOKEN_SPAN"
  | "GSR06_TOKEN_HASH"
  | "GSR07_PROVENANCE"
  | "GSR08_PROVENANCE_ANCHOR";

export interface ReceiptIssue {
  readonly code: ReceiptIssueCode;
  readonly obligationId: string;
  readonly detail: string;
}

const HEX64 = /^[0-9a-f]{64}$/;

// ---------------------------------------------------------------- provenance 锚定(GAP-2)
// GSR07 只验 64-hex 形状; 本层把三/四个 provenance 哈希对到发布钉住的锚上,
// 全自洽伪造/过期工具链盐在此拒绝。锚来源: fixtures/semantic/toolchain_anchor.json。
export interface ProvenanceAnchor {
  readonly driverBytesSha256: string;
  readonly toolchainManifestSha256: string;
  // 可选: sourceSha256 -> parserTraceRootSha256 交叉核对表(driver 端 trace 根回执)
  readonly traceRootBySourceSha256?: Readonly<Record<string, string>>;
  // 合成 receipt 仅在显式测试模式放行(item26/27 自测); 生产校验绝不传 true
  readonly allowSynthetic?: boolean;
}

export const SYNTHETIC_DRIVER_BYTES_SHA256 = sha256("synthetic:driver-bytes(dev-only)");
export const SYNTHETIC_TOOLCHAIN_MANIFEST_SHA256 = sha256("synthetic:toolchain-manifest(dev-only)");

export function verifyProvenanceAnchors(
  receipts: readonly GrammarParserSpanReceipt[],
  anchor: ProvenanceAnchor,
): readonly ReceiptIssue[] {
  const issues: ReceiptIssue[] = [];
  for (const receipt of receipts) {
    const id = receipt.obligationId;
    const isSynthetic =
      receipt.driverBytesSha256 === SYNTHETIC_DRIVER_BYTES_SHA256 ||
      receipt.toolchainManifestSha256 === SYNTHETIC_TOOLCHAIN_MANIFEST_SHA256;
    if (isSynthetic) {
      if (anchor.allowSynthetic !== true) {
        issues.push({code: "GSR08_PROVENANCE_ANCHOR", obligationId: id,
          detail: "synthetic:* 派生 provenance 仅允许测试模式(allowSynthetic)"});
      }
      continue;
    }
    if (receipt.driverBytesSha256 !== anchor.driverBytesSha256) {
      issues.push({code: "GSR08_PROVENANCE_ANCHOR", obligationId: id,
        detail: "driverBytesSha256 未锚定(不等于发布钉住的 driver 字节 sha)"});
    }
    if (receipt.toolchainManifestSha256 !== anchor.toolchainManifestSha256) {
      issues.push({code: "GSR08_PROVENANCE_ANCHOR", obligationId: id,
        detail: "toolchainManifestSha256 未锚定(不等于发布钉住的 toolchain manifest sha)"});
    }
    const traceRoot = anchor.traceRootBySourceSha256?.[receipt.sourceSha256];
    if (traceRoot !== undefined && receipt.parserTraceRootSha256 !== traceRoot) {
      issues.push({code: "GSR08_PROVENANCE_ANCHOR", obligationId: id,
        detail: "parserTraceRootSha256 与 driver 端 trace 根回执不符"});
    }
  }
  return issues;
}

export function preflightParserSpanReceipts(
  grammar: ChengGrammarObligationContract,
  receipts: readonly GrammarParserSpanReceipt[],
  sourceFiles: readonly Readonly<{relativePath: string; source: string}>[],
  anchor: ProvenanceAnchor | null = null,
): readonly ReceiptIssue[] {
  const issues: ReceiptIssue[] = [];
  const obligationById = new Map(grammar.obligations.map((entry) => [entry.obligationId, entry]));
  const sourceByPath = new Map(sourceFiles.map((entry) => [entry.relativePath, entry.source]));
  const seen = new Set<string>();
  for (const receipt of receipts) {
    const id = receipt.obligationId;
    if (seen.has(id)) issues.push({code: "GSR03_OBLIGATION_BINDING", obligationId: id, detail: "重复 receipt"});
    seen.add(id);
    if (receipt.schema !== CHENG_GRAMMAR_PARSER_SPAN_RECEIPT_SCHEMA || receipt.stage !== "parser") {
      issues.push({code: "GSR01_SCHEMA", obligationId: id, detail: `schema=${receipt.schema} stage=${receipt.stage}`});
      continue; // schema 不对则后续字段不可信
    }
    const {receiptSha256, ...identity} = receipt;
    if (receiptSha256 !== hashCanonical(identity)) {
      issues.push({code: "GSR02_RECEIPT_HASH", obligationId: id, detail: "receiptSha256 与 canonical identity 不符"});
    }
    const obligation = obligationById.get(id);
    if (obligation === undefined || obligation.disposition !== "required") {
      issues.push({code: "GSR03_OBLIGATION_BINDING", obligationId: id, detail: "obligationId 不在合同 required 集"});
    } else if (
      receipt.production !== obligation.production ||
      receipt.kind !== obligation.kind ||
      receipt.structuralPath !== obligation.structuralPath ||
      receipt.variant !== obligation.variant ||
      receipt.bound !== obligation.bound
    ) {
      issues.push({code: "GSR03_OBLIGATION_BINDING", obligationId: id, detail: "production/kind/structuralPath/variant/bound 与合同不一致"});
    }
    const source = sourceByPath.get(receipt.relativePath);
    if (source === undefined) {
      issues.push({code: "GSR04_SOURCE_BINDING", obligationId: id, detail: `source 缺失: ${receipt.relativePath}`});
      continue; // 无 source 则 span 无从校验
    }
    if (!HEX64.test(receipt.sourceSha256) || sha256(source) !== receipt.sourceSha256) {
      issues.push({code: "GSR04_SOURCE_BINDING", obligationId: id, detail: "sourceSha256 与源字节不符"});
    }
    const canonicalTokens = Array.isArray(receipt.canonicalTokens)
      ? receipt.canonicalTokens
      : [];
    let canonicalTokenSha256 = "";
    try {
      canonicalTokenSha256 = grammarParserCanonicalTokenSpanSha256(
        source,
        receipt.spanStartByte,
        receipt.spanEndByte,
        canonicalTokens,
      );
    } catch (error) {
      issues.push({code: "GSR05_TOKEN_SPAN", obligationId: id,
        detail: error instanceof Error ? error.message :
          "canonical parser token span invalid"});
    }
    const firstCanonicalToken = canonicalTokens[0];
    const finalCanonicalToken =
      canonicalTokens[canonicalTokens.length - 1];
    if (!Number.isInteger(receipt.tokenStart) ||
        !Number.isInteger(receipt.tokenEnd) ||
        firstCanonicalToken === undefined ||
        finalCanonicalToken === undefined ||
        receipt.tokenStart !== firstCanonicalToken.index ||
        receipt.tokenEnd !== finalCanonicalToken.index + 1) {
      issues.push({code: "GSR05_TOKEN_SPAN", obligationId: id,
        detail: "tokenStart/tokenEnd 未绑定 canonical production token indexes"});
    }
    if (canonicalTokenSha256 !== "" &&
        canonicalTokenSha256 !== receipt.tokenSha256) {
      issues.push({code: "GSR06_TOKEN_HASH", obligationId: id,
        detail: "tokenSha256 与 canonical kind/raw byte span 不符"});
    }
    if (receipt.parserNodeKind.length === 0 ||
        !HEX64.test(receipt.parserNodeIdentitySha256) ||
        !HEX64.test(receipt.parserTraceRootSha256) ||
        !HEX64.test(receipt.driverBytesSha256) ||
        !HEX64.test(receipt.toolchainManifestSha256)) {
      issues.push({code: "GSR07_PROVENANCE", obligationId: id, detail: "parserNodeKind 为空或 provenance hash 非 64-hex"});
    }
  }
  if (anchor !== null) issues.push(...verifyProvenanceAnchors(receipts, anchor));
  return issues;
}

// receipt → witness(witness 源字段与 receipt 逐字段相等, 由 m9024 复核)
export function receiptsToWitnesses(
  receipts: readonly GrammarParserSpanReceipt[],
): readonly GrammarSourceWitness[] {
  return receipts.map((receipt) => {
    const identity = {
      obligationId: receipt.obligationId,
      relativePath: receipt.relativePath,
      sourceSha256: receipt.sourceSha256,
      tokenStart: receipt.tokenStart,
      tokenEnd: receipt.tokenEnd,
      tokenSha256: receipt.tokenSha256,
      parserSpanReceipt: receipt,
    };
    return {...identity, witnessSha256: hashCanonical(identity)};
  });
}

export interface BindResult {
  readonly issues: readonly ReceiptIssue[];
  readonly witnesses: readonly GrammarSourceWitness[];
  readonly coverage: GrammarSourceCoverageReceipt | null;
}

// driver receipt 一到即调此函数: 预检 → 装配 → m9024 权威覆盖回执。
// anchor 提供时预检含 GSR08 provenance 锚定(生产必须传; 仅测试自测可省略)。
export function bindDriverReceipts(
  grammar: ChengGrammarObligationContract,
  receipts: readonly GrammarParserSpanReceipt[],
  sourceFiles: readonly Readonly<{relativePath: string; source: string}>[],
  anchor: ProvenanceAnchor | null = null,
): BindResult {
  const issues = preflightParserSpanReceipts(grammar, receipts, sourceFiles, anchor);
  if (issues.length > 0) return {issues, witnesses: [], coverage: null};
  const witnesses = receiptsToWitnesses(receipts);
  const coverage = buildGrammarSourceCoverageReceipt(grammar, witnesses, sourceFiles);
  return {issues: [], witnesses, coverage};
}

// ---------------------------------------------------------------- 合成 receipt(仅测试用)
// 自证校验器用的合成 driver receipt: provenance 全部由 "synthetic:*" 文本派生,
// 明确非真实 driver 证据; 用于正例过/三负例拒的校验器自测, 绝不用于真绿。
export function makeSyntheticReceipt(
  obligation: {
    readonly obligationId: string; readonly production: string; readonly kind: GrammarParserSpanReceipt["kind"];
    readonly structuralPath: string; readonly variant: string; readonly bound: number | null;
  },
  relativePath: string,
  source: string,
  charStart: number,
  charEnd: number,
): GrammarParserSpanReceipt {
  const sourceSha256 = sha256(source);
  if (!Number.isInteger(charStart) ||
      !Number.isInteger(charEnd) ||
      charStart < 0 ||
      charEnd <= charStart ||
      charEnd > source.length) {
    throw new Error("synthetic receipt source span invalid");
  }
  const spanStartByte = Buffer.byteLength(source.slice(0, charStart), "utf8");
  const spanEndByte = Buffer.byteLength(source.slice(0, charEnd), "utf8");
  const raw = source.slice(charStart, charEnd);
  const kind = raw.startsWith('"') ? 4 :
    raw.startsWith("'") ? 5 :
      /^[0-9]/.test(raw) ? 2 : 1;
  const kindText = kind === 4 ? "ParserValueTokenString" :
    kind === 5 ? "ParserValueTokenChar" :
      kind === 2 ? "ParserValueTokenInteger" :
        "ParserValueTokenIdentifier";
  const canonicalTokens: readonly GrammarParserCanonicalToken[] = [{
    index: 0,
    kind,
    kindText,
    sourceTextId: 0,
    startByte: spanStartByte,
    endByte: spanEndByte,
  }];
  const tokenStart = 0;
  const tokenEnd = 1;
  const tokenSha256 = grammarParserCanonicalTokenSpanSha256(
    source,
    spanStartByte,
    spanEndByte,
    canonicalTokens,
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
    sourceSha256,
    tokenStart,
    tokenEnd,
    spanStartByte,
    spanEndByte,
    canonicalTokens,
    tokenSha256,
    parserNodeKind: "SyntheticNode(dev-only)",
    parserNodeIdentitySha256: sha256(`synthetic:node:${obligation.obligationId}`),
    parserTraceRootSha256: sha256(`synthetic:trace:${sourceSha256}`),
    driverBytesSha256: sha256("synthetic:driver-bytes(dev-only)"),
    toolchainManifestSha256: sha256("synthetic:toolchain-manifest(dev-only)"),
  };
  return {...identity, receiptSha256: hashCanonical(identity)};
}
