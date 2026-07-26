#!/usr/bin/env bun
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  assertCurrentPatternProducerClaim,
  buildEbnfParserNodeMap,
  type ParserProducerClaim,
} from "../src/cheng_ebnf_parser_node_map.ts";
import {
  assertCurrentPatternBindingTypeSyntaxJoin,
  assertCurrentPatternFormalShape,
  type CurrentPatternFormalShape,
  type CurrentPatternFormalShapeToken,
} from "../tools/grammar_receipt_bind.ts";

const fusionRoot = resolve(import.meta.dir, "..");
const chengRoot = "/Users/lbcheng/cheng-lang";
const claimsPath = resolve(
  fusionRoot,
  "fixtures/semantic/ebnf_parser_producer_claims.json",
);
const patternProductions = [
  "pattern",
  "variantPattern",
  "rangePattern",
  "objectPattern",
  "patternArg",
  "literalPattern",
] as const;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function token(
  index: number,
  kindText: string,
  text: string,
  start: number,
  end: number,
): CurrentPatternFormalShapeToken {
  return {index, kindText, text, start, end};
}

function assertShapeMutationHardRed(
  source: CurrentPatternFormalShape,
  mutate: (copy: any) => void,
  label: string,
): void {
  const copy = clone(source);
  mutate(copy);
  assert.throws(
    () => assertCurrentPatternFormalShape(copy),
    /driver pattern formal shape invalid/,
    `${label} mutation 必须 hard-red`,
  );
}

function main(): void {
  const claimsDocument = JSON.parse(
    readFileSync(claimsPath, "utf8"),
  ) as {schema: string; rows: ParserProducerClaim[]};
  assert.equal(
    claimsDocument.schema,
    "cheng_ebnf_parser_producer_declarations",
  );
  const claims = new Map(
    claimsDocument.rows.map((claim) => [claim.name, claim]),
  );
  for (const name of patternProductions) {
    const claim = claims.get(name);
    assert.ok(claim !== undefined);
    assertCurrentPatternProducerClaim(claim);
    for (const field of ["parserFunctions", "nodeKinds"] as const) {
      for (let index = 0; index < claim[field].length; index += 1) {
        const copy: any = clone(claim);
        copy[field] = copy[field].filter(
          (_entry: string, entryIndex: number) => entryIndex !== index,
        );
        assert.throws(
          () => assertCurrentPatternProducerClaim(copy),
          new RegExp(
            `${name} current Pattern producer declaration invalid`),
          `${name} ${field}[${index}] 删除必须 hard-red`,
        );
      }
    }
    const spanMutation: any = clone(claim);
    spanMutation.spanModel = "region_span";
    assert.throws(
      () => assertCurrentPatternProducerClaim(spanMutation),
      new RegExp(`${name} current Pattern producer declaration invalid`),
      `${name} spanModel mutation 必须 hard-red`,
    );
  }

  const shapes: CurrentPatternFormalShape[] = [
    {
      row: 0,
      kindText: "ParserPatternBinding",
      nameTokenIndex: 0,
      spanStart: 0,
      spanEnd: 1,
      tokens: [
        token(0, "ParserValueTokenIdentifier", "x", 0, 1),
      ],
      children: [],
    },
    {
      row: 1,
      kindText: "ParserPatternWildcard",
      nameTokenIndex: 0,
      spanStart: 0,
      spanEnd: 1,
      tokens: [
        token(0, "ParserValueTokenIdentifier", "_", 0, 1),
      ],
      children: [],
    },
    {
      row: 2,
      kindText: "ParserPatternLiteral",
      nameTokenIndex: 0,
      spanStart: 0,
      spanEnd: 1,
      tokens: [
        token(0, "ParserValueTokenInteger", "1", 0, 1),
      ],
      children: [],
    },
    {
      row: 3,
      kindText: "ParserPatternTuple",
      nameTokenIndex: -1,
      spanStart: 0,
      spanEnd: 5,
      tokens: [
        token(0, "ParserValueTokenLeftParen", "(", 0, 1),
        token(1, "ParserValueTokenIdentifier", "x", 1, 2),
        token(2, "ParserValueTokenComma", ",", 2, 3),
        token(3, "ParserValueTokenIdentifier", "y", 3, 4),
        token(4, "ParserValueTokenRightParen", ")", 4, 5),
      ],
      children: [
        {spanStart: 1, spanEnd: 2},
        {spanStart: 3, spanEnd: 4},
      ],
    },
    {
      row: 4,
      kindText: "ParserPatternSequence",
      nameTokenIndex: -1,
      spanStart: 0,
      spanEnd: 2,
      tokens: [
        token(0, "ParserValueTokenLeftBracket", "[", 0, 1),
        token(1, "ParserValueTokenRightBracket", "]", 1, 2),
      ],
      children: [],
    },
    {
      row: 5,
      kindText: "ParserPatternObject",
      nameTokenIndex: -1,
      spanStart: 0,
      spanEnd: 5,
      tokens: [
        token(0, "ParserValueTokenLeftBrace", "{", 0, 1),
        token(1, "ParserValueTokenIdentifier", "x", 1, 2),
        token(2, "ParserValueTokenComma", ",", 2, 3),
        token(3, "ParserValueTokenIdentifier", "y", 3, 4),
        token(4, "ParserValueTokenRightBrace", "}", 4, 5),
      ],
      children: [
        {spanStart: 1, spanEnd: 2},
        {spanStart: 3, spanEnd: 4},
      ],
    },
    {
      row: 6,
      kindText: "ParserPatternConstructor",
      nameTokenIndex: 0,
      spanStart: 0,
      spanEnd: 7,
      tokens: [
        token(0, "ParserValueTokenIdentifier", "Some", 0, 4),
        token(1, "ParserValueTokenLeftParen", "(", 4, 5),
        token(2, "ParserValueTokenIdentifier", "x", 5, 6),
        token(3, "ParserValueTokenRightParen", ")", 6, 7),
      ],
      children: [{spanStart: 5, spanEnd: 6}],
    },
    {
      row: 7,
      kindText: "ParserPatternNamedField",
      nameTokenIndex: 0,
      spanStart: 0,
      spanEnd: 7,
      tokens: [
        token(0, "ParserValueTokenIdentifier", "field", 0, 5),
        token(1, "ParserValueTokenColon", ":", 5, 6),
        token(2, "ParserValueTokenIdentifier", "x", 6, 7),
      ],
      children: [{spanStart: 6, spanEnd: 7}],
    },
    {
      row: 8,
      kindText: "ParserPatternRange",
      nameTokenIndex: -1,
      spanStart: 0,
      spanEnd: 5,
      tokens: [
        token(0, "ParserValueTokenIdentifier", "x", 0, 1),
        token(1, "ParserValueTokenRangeExclusive", "..<", 1, 4),
        token(2, "ParserValueTokenIdentifier", "y", 4, 5),
      ],
      children: [
        {spanStart: 0, spanEnd: 1},
        {spanStart: 4, spanEnd: 5},
      ],
    },
  ];
  for (const shape of shapes) {
    assert.doesNotThrow(
      () => assertCurrentPatternFormalShape(shape),
      `${shape.kindText} current formal shape 必须接受`,
    );
  }
  assert.doesNotThrow(() =>
    assertCurrentPatternBindingTypeSyntaxJoin(
      0, "ParserPatternBinding", 3, 7, 7));
  assert.doesNotThrow(() =>
    assertCurrentPatternBindingTypeSyntaxJoin(
      1, "ParserPatternBinding", 4, -1, -1));
  assert.throws(
    () => assertCurrentPatternBindingTypeSyntaxJoin(
      2, "ParserPatternBinding", 5, 7, 8),
    /driver pattern binding TypeSyntax join invalid: 2/,
    "binding Pattern 与 declaration 的 TypeSyntax root 分叉必须 hard-red",
  );
  assert.throws(
    () => assertCurrentPatternBindingTypeSyntaxJoin(
      3, "ParserPatternNamedField", 5, -1, -1),
    /driver pattern binding TypeSyntax join invalid: 3/,
    "非 binding Pattern 持有 declaration 必须 hard-red",
  );
  assertShapeMutationHardRed(
    shapes[0]!,
    (copy) => {
      copy.tokens[0].kindText = "ParserValueTokenInteger";
    },
    "binding token kind",
  );
  assertShapeMutationHardRed(
    shapes[1]!,
    (copy) => {
      copy.tokens[0].text = "x";
    },
    "wildcard text",
  );
  assertShapeMutationHardRed(
    shapes[2]!,
    (copy) => {
      copy.tokens[0].kindText = "ParserValueTokenColon";
    },
    "literal token kind",
  );
  assertShapeMutationHardRed(
    shapes[3]!,
    (copy) => {
      copy.tokens[2].kindText = "ParserValueTokenSemicolon";
    },
    "tuple separator",
  );
  assertShapeMutationHardRed(
    shapes[4]!,
    (copy) => {
      copy.children.push({spanStart: 1, spanEnd: 1});
    },
    "sequence child span",
  );
  assertShapeMutationHardRed(
    shapes[5]!,
    (copy) => {
      copy.tokens[4].kindText = "ParserValueTokenRightBracket";
    },
    "object delimiter",
  );
  assertShapeMutationHardRed(
    shapes[6]!,
    (copy) => {
      copy.tokens.pop();
    },
    "constructor close",
  );
  assertShapeMutationHardRed(
    shapes[7]!,
    (copy) => {
      copy.tokens[1].kindText = "ParserValueTokenAssign";
    },
    "named-field separator",
  );
  assertShapeMutationHardRed(
    shapes[8]!,
    (copy) => {
      copy.tokens[1].kindText = "ParserValueTokenColon";
    },
    "range operator",
  );

  const map = buildEbnfParserNodeMap(
    readFileSync(resolve(chengRoot, "docs/cheng-formal-spec.md")),
    readFileSync(resolve(chengRoot, "src/core/lang/parser.cheng")),
    readFileSync(claimsPath),
    {receiptEvidence: []},
  );
  for (const name of patternProductions) {
    const row = map.rows.find((entry) => entry.name === name);
    assert.ok(row !== undefined);
    assert.equal(row.status, "PARTIAL");
    assert.equal(row.receipt_ready, false);
    assert.equal(row.witnessed_required_count, 0);
    assert.equal(
      row.missing_required_count,
      row.required_obligation_count,
    );
    assert.deepEqual(row.witness_projections, []);
    assert.deepEqual(row.witness_receipt_sha256s, []);
  }
  assert.equal(map.counts.MAPPED, 0);
  assert.equal(map.counts.witnessedRequiredCount, 0);
  assert.equal(
    map.counts.missingRequiredCount,
    map.counts.requiredObligationCount,
  );
  assert.equal(
    readFileSync(
      resolve(
        fusionRoot,
        "fixtures/semantic/ebnf_parser_node_map.json",
      ),
      "utf8",
    ),
    JSON.stringify(map, null, 2) + "\n",
    "current unwitnessed map 必须逐字节由当前 spec/parser/claims 生成",
  );
  console.log(
    "item25 current Pattern receipt: PASS " +
    "kinds=9 producerMutations=all witnessed=0 status=PARTIAL",
  );
}

main();
