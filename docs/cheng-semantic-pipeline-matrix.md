# Cheng bounded grammar and semantic pipeline matrix (m9024)

`src/cheng_semantic_pipeline_matrix_m9024.ts` extends m9023. `src/cheng_semantic_pipeline_gate_m9025.ts` runs the complete structural model in a private child, and `cheng_regalloc_preflight_m9022.ts` treats its structural receipt plus the still-missing parser/seven-stage receipts as required source/release checks. m9023/m9024/m9025 are proof components of `cheng_regalloc_preflight`, not extra MCP tools.

## What is mechanically covered

The module reads the single `ebnf` fence in `docs/cheng-formal-spec.md`, parses every production, and emits stable obligations for productions, every choice arm, optional absence/presence, repetition boundary points, and recursive-production depth boundary points. Recursive productions are found with linear-time strongly connected components, so mutually recursive grammar graphs cannot trigger exponential path enumeration. The current formal spec produces 1,130 obligations: 971 required source witnesses and 159 bounded exclusions. Every exclusion binds a stable reason code and declared boundary (`repetition: 0/1/8/+1`, recursion depth `0/1/3/+1`).

This phase does **not** claim grammar closure. The deterministic 29-source corpus assigns exactly one source to every required obligation, but the checked-in parser receipt map is stale until a frozen-source dual-driver run admits the current sources. Without those receipts, all 971 required obligations remain missing and `requireGrammarSourceClosure` hard-fails. The unique current coverage schema rejects a source-token span by itself: every witness must carry a parser-stage receipt bound to the exact production, structural path, variant and bound, the exact source/token bytes, parser node identity/trace roots, driver bytes and toolchain manifest. This prevents one arbitrary token span from being replayed across grammar obligations. Embedding `grammarObligationRootSha256` in a semantic source bundle is provenance only; it is not counted as grammar coverage.

The semantic profile joins all 1,584 legal m9023 cases with 2,520 assignments over:

- use site: binding, assign, call argument, return, condition, element, field initializer;
- target place: local, global, inline field, implicit `var T` boundary, index;
- ABI boundary: internal, importc, export;
- lifetime: straight, branch, loop, defer;
- regalloc pressure: low, call-live, parallel-copy, 12-live register boundary, 13-live +1 spill, implicit-borrow address escape.

That is 3,991,680 bounded joined assignments. Two non-calling constraint classifiers agree on every assignment; 285,336 are legal. Critical projections are exhaustive in the constrained legal domain, all 17 joined axes have independent pairwise obligations, and ABI/register boundaries have declared higher-order projections. Importc/export public cases are stable rejects under the default no-pointer gate rather than fake legal sources. Seven constraints each have a unique isolated single-violation witness.

## Real Cheng source materialization

Every legal m9023 case produces a deterministic main module and, when exact imported-call identity is required, a deterministic support module. The materializer uses formal Cheng forms for objects, nested managed objects, `str[]`, managed object sequences, `str[2]`, and `Result[str]` (`import std/result`, `Ok[str](...)`). It does not generate `ptr`, `ref`, `&`, `@importc`, `@exportc`, removed container syntax, or invented compiler/layout identities.

Every selected profile witness also produces source. Use-site, target-place, internal ABI call, lifetime, and pressure templates are inserted into the executed function—not recorded only as labels. The address-escape pressure template passes a local through a formal `var` parameter, so it creates a real address-taken/borrow boundary without raw-pointer syntax. Each axis witness records the source file plus an exact normalized-token span and witness hash. Construction hard-fails unless every generated file passes the formal/public-surface token lint.

Each bundle manifest binds:

- m9023 case ID and semantic hash;
- optional m9024 profile case ID and hash;
- raw source-file hashes and lint-receipt hashes;
- the live m9024 materializer file hash;
- formal-spec hash and grammar-obligation root;
- expected runtime marker and its hash;
- profile source-witness span root.

Mutations of source bytes, case binding, materializer binding, grammar root, or profile span all fail canonical validation. The deterministic reducer accepts only legal profile cases.

## What remains RED

There is no compiler-owned command that emits one source-bound execution identity across real TypedExpr, CSG, lowering, primary, primary regalloc, backend2, and backend2 regalloc structured receipts. `executeSourceBoundSevenStageRunner` therefore always throws `REAL_PIPELINE_RUNNER_REQUIRED`, including when handed an oracle echo. Primary/backend2 agreement alone is never accepted.

Formal grammar closure is independently RED until all 971 required obligations carry validated source bytes plus parser/source token spans. Therefore m9024 is a source-producing bounded semantic matrix and a precise missing-evidence gate, not a claim that the whole Cheng grammar or seven-stage compiler pipeline has completed.

## Verification

```sh
/Users/lbcheng/cheng-lang/ts-csg/node_modules/.bin/tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --typeRoots /Users/lbcheng/cheng-lang/ts-csg/node_modules/@types src/cheng_semantic_pipeline_matrix_m9024.ts test/item24_semantic_pipeline_matrix.ts

/Users/lbcheng/.bun/bin/bun run test:item24

PATH=/opt/miniconda3/bin:/opt/homebrew/bin:/usr/bin:/bin \
  /Users/lbcheng/cheng-lang/tools/beat_c_process_group_guard.sh \
  --rss-limit:1073741824 --timeout:180 \
  --report-out:/private/tmp/m9024.guard.report \
  --stdout:/private/tmp/m9024.guard.stdout \
  --stderr:/private/tmp/m9024.guard.stderr -- \
  /Users/lbcheng/.bun/bin/bun run test/item24_semantic_pipeline_matrix.ts
```

The current-source item24 structural verification completed with rc=0. Its output is 1,130 grammar obligations, 971 required grammar witnesses, 3,991,680 joined assignments, 285,336 legal joins, 2,927 selected cases, 1,584 base bundles and 2,920 profile bundles. The current formal-spec obligation root is `92b0d9ebcc10909b617fcb9ffb57248db41a2ab75d211b7d5c0dfdf43177b93e`. This is structural evidence only; it is not a current exact-1-GiB release receipt.

The release subgate does not trust the item24 console summary. m9025 emits one canonical JSON receipt binding the grammar obligation/parser-evidence roots, all exact counts and matrix/source-bundle roots, the formal-spec hash, private source-set hash, cold driver, Bun, guard and actual private-toolchain manifest. m9022 requires the child to run under the exact process-tree guard, independently parses the exact field set and canonical bytes, recomputes the full receipt hash and retains a parent receipt binding argv, isolated environment, guard and stream identities. The structural row is GREEN; parser evidence and the real seven-stage compiler receipt remain required RED, so this bounded model cannot make the release green by itself.

Earlier m9025 source-mode receipts are invalid for the current formal/parser/tool hashes and are not release evidence. A current guarded receipt must be regenerated after the parser map and seven-stage producer receipts close on one frozen source identity.

For the cold planning/validation budget, measure matrix generation separately from the exhaustive source-emission test:

```sh
/usr/bin/time -p /Users/lbcheng/.bun/bin/bun -e 'import {generatePipelineMatrix,validatePipelineMatrix} from "./src/cheng_semantic_pipeline_matrix_m9024.ts"; const matrix=generatePipelineMatrix("m9024-cold"); validatePipelineMatrix(matrix); console.log(matrix.cases.length)'
```
