#!/usr/bin/env bun
import assert from "node:assert/strict";
import {readFileSync, realpathSync} from "node:fs";
import {join} from "node:path";

const CHENG_ROOT = realpathSync.native(
  process.env.CHENG_TOOLCHAIN_ROOT ||
  process.env.CHENG_ROOT ||
  "/Users/lbcheng/cheng-lang",
);
const LOWERING_PATH = join(
  CHENG_ROOT,
  "src/core/backend/lowering_plan.cheng",
);

function functionSource(source: string, name: string) {
  const start = source.indexOf(`fn ${name}(`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const next = source.indexOf("\nfn ", start + name.length + 4);
  return source.slice(start, next < 0 ? source.length : next);
}

function fixedPointContractIssues(source: string) {
  const issues: string[] = [];
  const canonicalCall =
    /\btexpr\.TypedExprIrAliasTarget\s*\(\s*plan\.typedIr\s*,\s*ownerSourcePath\s*,\s*declaredType\s*,\s*visitedOwners\s*,\s*visitedNames\s*,\s*aliasOwnerSourcePath\s*,\s*aliasTarget\s*,\s*aliasCycle\s*\)/s;
  if (!canonicalCall.test(source)) {
    issues.push("canonical_owner_alias_edge_missing");
  }
  if (source.includes("TypedExprIrLookupTypeDefAliasTargetType")) {
    issues.push("one_layer_text_alias_lookup_present");
  }
  if (!/\bvar\s+visitedOwners\s*:\s*str\[\]\s*\n\s*var\s+visitedNames\s*:\s*str\[\]/.test(source)) {
    issues.push("visited_owner_alias_identity_missing");
  }
  if (!/\bwhile\s+true\s*:/.test(source)) {
    issues.push("unbounded_fixed_point_missing");
  }

  const callAt = source.search(canonicalCall);
  const cycleAt = source.search(
    /\bif\s+aliasCycle\s*:\s*\n\s*panic\s*\(/,
  );
  const ambiguousAt = source.search(
    /\bif\s+aliasState\s*==\s*texpr\.TypedExprBuildIndexAmbiguous\s*:\s*\n\s*panic\s*\(/,
  );
  const missingAt = source.search(
    /\bif\s+aliasState\s*!=\s*texpr\.TypedExprBuildIndexUnique\s*:\s*\n\s*return\s+false\b/,
  );
  const normalizedAt = source.search(
    /\blet\s+normalizedTarget\s*=\s*texpr\.TypedExprNormalizeTypeText\s*\(\s*texpr\.TypedExprStripVarType\s*\(\s*aliasTarget\s*\)\s*\)/s,
  );
  const incompleteAt = source.search(
    /\bif\s+aliasOwnerSourcePath\s*==\s*""\s*\|\|\s*normalizedTarget\s*==\s*""\s*:\s*\n\s*panic\s*\(/,
  );
  const ownerAdvanceAt = source.search(
    /\bownerSourcePath\s*=\s*aliasOwnerSourcePath\b/,
  );
  const typeAdvanceAt = source.search(
    /\bdeclaredType\s*=\s*normalizedTarget\b/,
  );
  const terminalPattern =
    /\bif\s+texpr\.TypedExprTypeTextIsFnPtr\s*\(\s*declaredType\s*\)\s*:\s*\n\s*return\s+true\b/;
  const terminalRelativeAt = typeAdvanceAt < 0
    ? -1
    : source.slice(typeAdvanceAt + 1).search(terminalPattern);
  const terminalAt = terminalRelativeAt < 0
    ? -1
    : typeAdvanceAt + 1 + terminalRelativeAt;
  if (!(callAt >= 0 &&
        cycleAt > callAt &&
        ambiguousAt > cycleAt &&
        missingAt > ambiguousAt &&
        normalizedAt > missingAt &&
        incompleteAt > normalizedAt &&
        ownerAdvanceAt > incompleteAt &&
        typeAdvanceAt > ownerAdvanceAt &&
        terminalAt > typeAdvanceAt)) {
    issues.push("fixed_point_validation_or_advance_order_invalid");
  }
  return issues;
}

const loweringSource = readFileSync(LOWERING_PATH, "utf8");
const production = functionSource(
  loweringSource,
  "LoweringTypeTextResolvesToFnPtr",
);
assert.deepEqual(fixedPointContractIssues(production), []);

const twoHopCapMutation = production.replace(
  "    while true:",
  "    for aliasDepth in 0..<2:",
);
assert.notEqual(twoHopCapMutation, production);
assert.ok(
  fixedPointContractIssues(twoHopCapMutation).includes(
    "unbounded_fixed_point_missing",
  ),
);

const cycleMutation = production.replace(
  /\s*if aliasCycle:\n\s*panic\(Fmt"lowering: function pointer alias cycle[^"]*"\)\n/,
  "\n",
);
assert.notEqual(cycleMutation, production);
assert.ok(
  fixedPointContractIssues(cycleMutation).includes(
    "fixed_point_validation_or_advance_order_invalid",
  ),
);

const incompletePayloadMutation = production.replace(
  /\s*if aliasOwnerSourcePath == "" \|\| normalizedTarget == "":\n\s*panic\(Fmt"lowering: incomplete function pointer alias payload[^"]*"\)\n/,
  "\n",
);
assert.notEqual(incompletePayloadMutation, production);
assert.ok(
  fixedPointContractIssues(incompletePayloadMutation).includes(
    "fixed_point_validation_or_advance_order_invalid",
  ),
);

console.log("item22_regalloc_alias_fixed_point: PASS");
