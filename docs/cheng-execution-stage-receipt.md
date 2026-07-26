# Cheng execution-stage receipt validator

`src/cheng_execution_stage_receipt_validator.ts` is an independent consumer of
`compiler_execution_stage_receipt.cheng`. It recomputes the Cheng binary hash
domains and big-endian framing; JSON is only the canonical cross-language wire.

The wire is one recursively key-sorted, minified JSON object followed by exactly
one LF. Its top-level keys are `schema`, `runnerKind`, `identity`,
`observedIdentityPaths`, `parserReceiptRaw32`, `parserSemanticRaw32`, `stages`,
`sevenStageRootRaw32`, and `receiptSha256`. `receiptSha256` is SHA-256 of the
UTF-8 canonical top-level object with only `receiptSha256` omitted and without
the final LF.

The identity object has the exact ten Cheng fields. The path object has seven
paths, one for every input hash: source bundle, materializer, grammar obligation,
compiler source closure, driver, toolchain manifest, and command manifest. Every
stage has the exact eighteen Cheng fields plus `producerSourcePath`. The stage array
must contain, in order, `typed_expr`, `csg`, `lowering`, `primary`,
`primary_regalloc`, `backend2`, and `backend2_regalloc`.

The validator reads every identity input, producer source, semantic sidecar, and
artifact through a canonical relative path under an externally pinned evidence
root. The policy independently pins both path and raw SHA-256 for every sidecar
and artifact; re-sealing a receipt after changing a regalloc action, fragment, or
ingress artifact therefore still fails. It uses `O_NOFOLLOW`, compares the
opened file identity before and after streaming SHA-256, and rejects absent,
empty, aliased, changed, or unpinned bytes.

Release preflight additionally requires every stage producer path/hash to be an
exact member of the current source manifest, and requires the receipt identity
to name that manifest's raw bytes, the official driver bytes, and the fixed
target. The policy hash, receipt hash, execution root, and seven-stage root then
enter the same final binding tuple as the backend2 epoch and the jobs,
exec-diff, target-emit, and GEN3 locks.
`outputSemanticRaw32` must equal SHA-256 of the raw sidecar bytes. Predecessor
receipt and input-semantic edges use the fixed Cheng DAG, including the lowering
fork into primary and backend2. Each execution, stage, seven-stage, bundle, and
raw receipt-file hash is independently recomputed.

`src/cheng_current_official_seven_stage_runner.ts` is the production current
consumer. It reruns current parser ingress admission, binds its exact report and
admitted map to the parser prerequisite roots, requires the same frozen source
manifest and official driver in `executionRaw32`, then independently projects
all seven ingress/action/fragment/object columns. The upstream manifest must say
`implemented=true` and `status=COMPLETE`. Missing upstream receipts still
produce `HARD_RED` with zero verified stages; a low-level validator fixture is
never an official-runner completion claim.

Run the focused test:

```sh
bun run test/item28_execution_stage_receipt_validator.ts
bun run test/item28_current_official_seven_stage_runner.ts
```

Run strict type checking with the workspace TypeScript runtime:

```sh
/Users/lbcheng/cheng-lang/ts-csg/node_modules/.bin/tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --typeRoots /Users/lbcheng/cheng-lang/ts-csg/node_modules/@types src/cheng_execution_stage_receipt_validator.ts test/item28_execution_stage_receipt_validator.ts
```
