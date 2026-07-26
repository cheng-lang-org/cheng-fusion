#!/usr/bin/env bun
import assert from "node:assert/strict";
import {
  assertCurrentTupleTypeSyntaxSurface,
  type CurrentTupleTypeSyntaxSurface,
} from "../tools/grammar_receipt_bind.ts";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const tuple: CurrentTupleTypeSyntaxSurface = {
  row: 2,
  spanStart: 100,
  spanEnd: 119,
  markerTokenIndex: 20,
  markerKindText: "ParserValueTokenTuple",
  markerStart: 100,
  openTokenIndex: 21,
  openKindText: "ParserValueTokenLeftBracket",
  openEnd: 106,
  closeTokenIndex: 25,
  closeKindText: "ParserValueTokenRightBracket",
  closeStart: 118,
  closeEnd: 119,
  separatorCount: 1,
  children: [
    {spanStart: 106, spanEnd: 111, ownerTokenAccepted: true},
    {spanStart: 113, spanEnd: 118, ownerTokenAccepted: true},
  ],
};

assert.doesNotThrow(
  () => assertCurrentTupleTypeSyntaxSurface(tuple),
);

for (const [label, mutate] of [
  ["marker", (copy: any) => {
    copy.markerKindText = "ParserValueTokenIdentifier";
  }],
  ["open identity", (copy: any) => {
    copy.openTokenIndex += 1;
  }],
  ["close", (copy: any) => {
    copy.closeKindText = "ParserValueTokenRightParen";
  }],
  ["separator", (copy: any) => {
    copy.separatorCount = 0;
  }],
  ["child order", (copy: any) => {
    copy.children.reverse();
  }],
  ["child owner", (copy: any) => {
    copy.children[0].ownerTokenAccepted = false;
  }],
  ["empty", (copy: any) => {
    copy.children = [];
  }],
] as const) {
  const copy = clone(tuple);
  mutate(copy);
  assert.throws(
    () => assertCurrentTupleTypeSyntaxSurface(copy),
    /driver Tuple TypeSyntax authority invalid: 2/,
    `${label} mutation 必须 hard-red`,
  );
}

console.log(
  "item25 current Tuple TypeSyntax authority: PASS mutations=7",
);
