# TS CSG

`ts-csg` extracts deterministic TypeScript semantic facts for the Cheng CSG pipeline.

This is not a source-to-source rewriter. It freezes TypeScript semantics into
`ts-csg.semantic` facts that a later Cheng lowering pass can consume. The
production facts cargo is binary CSGC (`.csgc` / `.csgwebc`); JSONL is only a
debug/export compatibility surface.
It also emits project-level `csg-core` facts as the language-neutral bridge
before Cheng ABI mapping. A strict Cheng source writer remains for the closed
subset; CSGC bytes, roots, validation, and
diffs are owned by the pure Cheng `tools/csg` implementation. `csg-js` extends
`csg-core` with structured JavaScript semantic references and open runtime
requirements. `csg-web` builds on the same path for the pure Cheng Web kernel;
it preserves JS/React/Web runtime requirements without lowering JSX directly to
native GUI calls.

## Command

```sh
npm install
npm run build
node dist/cli.js --project fixtures/basic/tsconfig.json --out tmp/basic.csgc
node dist/cli.js --emit csg-core --project fixtures/basic/tsconfig.json --runtime node,browser --entry-root src/main.ts --out tmp/basic.core.csgc --summary-out tmp/basic.summary.json --index-out tmp/basic.idx.json
node dist/cli.js --emit csg-js --project fixtures/basic/tsconfig.json --runtime node,browser --out tmp/basic.js.csgc --report-out tmp/basic.js.report.json
node dist/cli.js --emit csg-web --project fixtures/cheng-source-jsx-unsupported/tsconfig.json --runtime node,browser --out tmp/jsx.csgwebc --report-out tmp/jsx.web.report.json
node dist/cli.js --emit runtime-closure --project fixtures/basic/tsconfig.json --runtime node,browser --out tmp/runtime-closure.json
../tools/csg validate tmp/basic.core.csgc
../tools/csg root tmp/basic.core.csgc
../tools/csg diff tmp/basic.core.csgc tmp/basic.core.csgc
node dist/cli.js --emit cheng-source --project fixtures/csg/tsconfig.json --out tmp/main.cheng
```

## Contract

- Input is TypeScript checked by the TypeScript compiler API.
- Production output is deterministic CSGC binary when `--out` ends in
  `.csgc` or `.csgwebc`; JSONL text is only for explicit debug/export paths.
  Logical facts still use stable IDs and canonical field ordering before
  binary encoding.
- Unsupported dynamic JavaScript semantics hard-fail instead of producing invalid facts.
- Facts describe modules, imports/exports, declarations, types, calls, control flow,
  JSX nodes, and explicit unsupported diagnostics.
- `--emit csg-core` emits language-neutral facts plus an optional production
  summary containing `standard:"csg_core::v1"`, `profiles`,
  `profile_set_cid`, `facts_root`, coverage counts,
  and closure counts. Full `--report-out` is a debug artifact containing runtime
  requirements, external symbols, and unsupported semantics. A summary or report with
  `complete:false` is a blocked lowering state, not a successful native
  artifact. The report also includes `runtimeClosure`, a deterministic grouped
  closure list by runtime, kind, source, requirement name, and external symbol.
- `--index-out` writes an external query index for file/symbol/function/call
  hot paths. It is bound to the same `facts_root` but does not participate in
  root calculation and can be regenerated from `.csgc`.
- `csg validate/root/diff` reads CSG-Core/profile facts without caring whether
  they came from TypeScript, Rust, Cheng, or a later domain profile. It is the
  shared conformance surface, not a TypeScript-only lowering pass.
  The root `tools/csg` entry is the pure Cheng reference CLI; `ts-csg` no longer
  depends on the `@cheng-lang/csg-core` npm package.
- `--emit runtime-closure` emits only that grouped closure JSON. It is the
  provider implementation queue for JS Core, DOM, Node, React, and external
  package surfaces. Closure groups carry `providerStatus:"closed"` only when a
  real lowering/provider path exists; unsupported surfaces stay open.
  `candidateProvider` means a narrower downstream proof may close it later, not
  that CSG-Core itself is complete.
  JS Core namespace globals and supported builtin property accesses can be
  marked as `cheng-source.js-core.namespace-proof`; the actual call or value
  still has to pass the strict Cheng-source proof.
- `--emit cheng-source` emits Cheng source only when CSG-Core is complete and
  the code is inside the closed int32/control/direct-call subset, or when every
  open runtime item has an explicit Cheng-source candidate provider and the
  Cheng-source pass proves the narrower shape. No placeholder Cheng is emitted.
- Legacy `--emit cheng-csg` is rejected. TypeScript has no independent physical
  CSG writer; binary output is delegated to the pure Cheng CSGC implementation.
- `--emit csg-js` emits self-contained JS semantic facts: the full `CSG-Core`
  stream plus `csg.js.*` records for project, function refs, call refs with
  receiver/member/argument shape, classes, class heritage, module imports,
  runtime requirements, external symbols, and unsupported refs. Its report uses
  schema `csg-js.report` and keeps `complete:false` until the real Cheng JS
  runtime is closed. It does not emit Cheng, runtime code, fallbacks, or stubs.
- `--emit csg-web` emits self-contained Web-kernel facts: the full `CSG-Core`
  stream plus `csg.web.*` records for JS functions/calls/classes, JSX nodes,
  module imports, runtime requirements, external symbols, and unsupported refs.
  Its report uses schema `csg-web.report`, keeps `runtimeIndependent:true` and
  `engineDependency:"none"`, and stays `complete:false` while Cheng JS/Web
  runtime requirements remain open. It never emits `__gui_button_create` or any
  other direct JSX-to-native-GUI lowering.

## Current Scope

Supported:

- strict TypeScript modules
- imports/exports
- functions, parameters, generics, async/generator flags
- async functions and `await` as CSG facts plus explicit Promise runtime requirements
- variables
- object and array destructuring binding facts
- Cheng-source candidate lowering for local int32 Math, async/await sync erase,
  local int32 array literals, constant array indexing, `.length`, and local
  int32 object field reads, including string-literal object indexing
- Cheng-source candidate lowering for `Array.from(array-lite)` as a copied
  int32 fixed array
- Cheng-source candidate lowering for `array-lite.includes(int32)` as a bool
- Cheng-source candidate lowering for `array-lite.at(literalIndex)` as int32
- Cheng-source candidate lowering for `array-lite.indexOf/lastIndexOf(int32)`
  as int32
- Cheng-source candidate lowering for `array-lite.findIndex(namedPredicate)`
  as int32
- Cheng-source candidate lowering for `array-lite.some/every(namedPredicate)`
  as bool
- Cheng-source candidate lowering for
  `array-lite.filter(namedPredicate).length` as int32
- Cheng-source candidate lowering for `array-lite.map(namedNumberFn)` as a
  copied int32 array-lite value
- Cheng-source candidate lowering for `array-lite.slice(literalStart,
  literalEnd)` as a copied int32 array-lite value
- Cheng-source candidate lowering for `array-lite.concat(arrayLite...)` as a
  copied int32 array-lite value
- Cheng-source candidate lowering for `array-lite.reverse()` as a copied
  reversed int32 array-lite value with local receiver state updated
- Cheng-source candidate lowering for
  `array-lite.sort(namedNumberComparator)` as a local int32 sort
- Cheng-source candidate lowering for local `array-lite.push/pop/shift/unshift`
  and `array-lite.fill(value)` with proven non-empty int32 state
- Cheng-source candidate lowering for `array-lite.reduce(namedReducer,
  initialInt32)` as an int32 expression
- Cheng-source candidate lowering for proven local string literal methods by
  compile-time materialization
- Cheng-source candidate lowering for `for...of` over local int32 array-lite
- Cheng-source candidate lowering for `Array.isArray(array-lite)` and
  `Object.freeze(array/object-lite)`
- Cheng-source candidate lowering for `Object.assign({}, object-lite...)`
- Cheng-source candidate lowering for `Object.values(array/object-lite)` and
  `Object.isFrozen(array/object-lite)`
- Cheng-source candidate lowering for
  `Object.keys(array/object-lite).length` and
  `Object.entries(array/object-lite).length`
- Cheng-source candidate lowering for
  `Number.isFinite/isInteger/isSafeInteger(int32)` as bool predicates
- Cheng-source candidate lowering for `Number(int32/bool)` as int32 conversion
- Cheng-source candidate lowering for `Boolean(int32/bool)`;
  general JavaScript truthiness is not included
- classes, constructors, methods, properties, heritage facts
- interfaces, type aliases, enums
- calls, `new`, `await`, return/throw/control statements
- JSX element and expression facts plus explicit JSX runtime requirements
- spread, iterator loops, and exception regions as facts plus explicit runtime requirements
- project-level CSG-Core facts:
  - modules, imports, exports, symbols, types
  - function, block, term, op, call, data, debug map
  - method-call ops with structured `receiver` and `memberName`
  - Node, Browser DOM, ECMAScript builtin, and external package requirements
  - deterministic coverage report

Hard-fail:

- TypeScript semantic diagnostics
- `any` in project declarations/expressions
- `eval(...)`
- non-literal `require(...)`
- non-literal dynamic `import(...)`
- non-literal computed declaration names
- prototype mutation assignments
- legacy `--emit cheng-csg` requests
- `cheng-source` input with unsupported runtime requirements, unsupported
  external symbols, unsupported CSG-Core ops, non-int32 types, invalid Cheng
  identifiers, loops, object/array operations outside the strict lite subsets,
  mutation expressions, generator/generic functions, non-direct calls, or async
  calls that are not consumed by exactly one explicit `await`

## Output

The first record is always:

```json
{"kind":"csg.schema","language":"typescript","schema":"ts-csg.semantic","features":["typescript-semantic-facts"]}
```

Every later record is a fact with a stable `id` and optional source location.

`--emit csg-core --out *.csgc` writes CSGC binary facts. The decoded/debug JSONL
view begins with:

```json
{"kind":"csg.core.schema","language":"typescript","schema":"csg_core","features":["core-facts","runtime-closure"]}
```

When `--summary-out` is present, the production summary schema is:

```json
{"schema":"csg-core.summary","standard":"csg_core::v1","profiles":["csg_core"],"profile_set_cid":"sha256:...","facts_root":"sha256:...","features":["core-facts","runtime-closure"],"complete":false}
```

The summary uses snake_case and does not include the full unsupported/runtime
requirement/external symbol arrays. Production admission should read
`summary.json` plus `.csgc`; query paths may also load `*.idx.json`; full
reports are for debug.

When `--index-out` is present, the external index schema is:

```json
{"schema":"csg-core.index","standard":"csg_core::v1","profiles":["csg_core"],"profile_set_cid":"sha256:...","facts_root":"sha256:...","counts":{"files":1,"symbols":1,"functions":1,"calls":1}}
```

When `--report-out` is present, the full debug report schema is:

```json
{"schema":"csg-core.report","standard":"csg_core::v1","profiles":["csg_core"],"profile_set_cid":"sha256:...","factsRoot":"sha256:...","facts_root":"sha256:...","features":["core-facts","runtime-closure"],"complete":false}
```

`--emit csg-core` writes summary/report only when the matching explicit output
flag is present. If `complete:false`, downstream Cheng-ABI/native generation
must stop.
`--entry-root` is repeatable and only appears in the report when the file is
part of the checked TypeScript program.
`runtimeClosure.complete` is true only when every runtime requirement and
external symbol has `providerStatus:"closed"`; otherwise it is the exact
provider closure queue.

The fixed project gate is:

```sh
npm run smoke:csg-core-conformance
npm run smoke:projects
npm run smoke:web-projects
../tools/csg_core_conformance_test.sh
```

It checks:

- `/Users/lbcheng/cursor-restored/cursor-agents-window` with `tsconfig.json`.
- `/Users/lbcheng/UniMaker/React.js` with root `tsconfig.json` and
  `./node_modules/.bin/tsc --noEmit -p tsconfig.json`.

Each gate exports CSG-Core twice and requires byte-identical CSGC facts, summaries, indexes, and reports.
The debug report must expose unsupported/runtime requirements instead of claiming
blank completion. It also requires non-empty `runtimeClosure` buckets for
project gates that still need JS/DOM/Node/React providers.

`npm run smoke:web-projects` repeats the same two-project gate for `csg-web`.
It requires byte-identical facts/reports, `engineDependency:"none"`, open Web
runtime requirements, and no direct JSX-to-Cheng-GUI lowering. `npm run
smoke:csg-js` covers fixture-level CSG-JS determinism, `csg-js.report`,
`complete:false`, open runtime requirements, schema failures, truncated CSGC,
and unknown `csg.js.*` records. `npm run smoke:csg-web` covers schema,
truncated input, unknown `csg.web.*` records, and fixture-level determinism.
`npm run smoke:js-runtime` and `npm run
smoke:web-runtime` are hard-fail sentinels until real Cheng runtime providers
exist.

The retired `CHENG_CSG` text writer is not part of `ts-csg`. Production physical
facts use the unique CSGC format implemented by Cheng; the TypeScript layer only
extracts and projects semantic facts before invoking that implementation.

`--emit cheng-source` materializes the same checked subset as readable Cheng:

```cheng
fn main(): int32 =
    return 0
```

The smoke gate compiles this generated Cheng through
`artifacts/backend_driver/cheng system-link-exec` and checks that its exit code
matches the original TypeScript fixture.

The first Cheng-source JS Core candidate provider is
`cheng-source.js-core.math-i32`, covering integer
`Math.max/min/abs/floor/ceil/trunc/round` after the Cheng-source pass proves the
scalar int32 shape. It does not claim general JavaScript `number` or
floating-point semantics. CSG-Core still reports these requirements as open.
`cheng-source.js-core.async-sync-i32` remains the open candidate for the async
function state-machine itself. A direct `await localAsyncPromiseNumber()` whose
callee is a local `async function ...: Promise<number>` is closed by
`cheng/core/runtime/js_promise_runtime.await-sync-i32`; broader Promise and
async semantics still stay open.
`cheng-source.js-core.number-predicate-i32` covers only
`Number.isFinite/isInteger/isSafeInteger` on already-proven pure int32
expressions; it lowers to `true` because int32 has no `NaN`, infinity, or
unsafe integer range. Non-int32 or effectful arguments hard-fail.
`cheng-source.js-core.number-convert-i32` covers only `Number(int32)` and
`Number(bool)`. `int32` is preserved and `bool` lowers to `cond ? 1 : 0`.
Strings, objects, arrays, nullish values, and general JavaScript numeric
coercion hard-fail.
`cheng-source.js-core.boolean-i32` covers only `Boolean(int32)` and
`Boolean(bool)`. `int32` lowers to `x != 0`, `bool` is preserved. Strings,
objects, arrays, nullish values, and general JavaScript truthiness hard-fail.
`cheng-source.js-core.string-length-lite` covers only the `.length` projection
on `String(int32)`, `String(bool)`, and `String(stringLiteral)`. It computes
decimal length for int32, lowers bool to `4`/`5`, and folds string literal
lengths at compile time. Materialized strings, dynamic string ABI, locale,
custom `toString`, nullish coercion, and general JavaScript string objects
hard-fail.
`cheng-source.js-core.array-lite-i32` and
`cheng-source.js-core.object-lite-i32` are also candidate-only providers. The
array path accepts only non-empty local int32 literals, constant in-bounds
indexes, and `.length`. The object path accepts only local object literals whose
fields are int32 expressions, then decomposes fields into hidden int32 locals.
Object property access supports dot access and string/number literal indexing
only. Arrays and objects are not passed as values; dynamic indexing, spreads,
computed properties, mutation, methods, and general JS object identity still
hard-fail.
`cheng-source.js-core.array-from-lite` covers only `Array.from` on array-lite
values and materializes a fresh fixed int32 array copy. General iterables,
strings, mapping callbacks, sparse arrays, and mutation semantics hard-fail.
`cheng-source.js-core.array-includes-lite-i32` covers only
`localArray.includes(int32)` where the receiver is a proven local int32
array-lite value and the argument is a pure int32 expression. It expands to
fixed comparisons over the known array length. String includes, dynamic
receivers, effectful arguments, sparse arrays, and SameValueZero edge cases
outside int32 hard-fail.
`cheng-source.js-core.array-at-lite-i32` covers only `localArray.at(index)`
where the receiver is a proven local int32 array-lite value and `index` is a
literal in-bounds int32, including negative literal indexes. It lowers to a
fixed element read. Dynamic indexes, out-of-bounds indexes, `undefined`
results, sparse arrays, and non-int32 arrays hard-fail.
`cheng-source.js-core.array-indexof-lite-i32` covers only
`localArray.indexOf(int32)` and `localArray.lastIndexOf(int32)` on proven local
int32 array-lite values with pure int32 arguments. It expands to fixed
comparisons and returns the matching index or `-1`. String search, dynamic
receivers, optional `fromIndex`, sparse arrays, and non-int32 SameValueZero
semantics hard-fail.
`cheng-source.js-core.array-findindex-lite-i32` covers only
`localArray.findIndex(namedPredicate)` where the receiver is a proven local
int32 array-lite value and the predicate is a named local function
`(number) => boolean`. It expands to ordered predicate checks and returns the
first matching index or `-1`. Arrow closures, captured state, dynamic
receivers, optional `thisArg`, sparse arrays, and non-bool predicates hard-fail.
`cheng-source.js-core.array-find-coalesce-lite-i32` covers only
`localArray.find(namedPredicate) ?? int32Fallback` where the receiver is a
proven local int32 array-lite value and the predicate is a named local function
`(number) => boolean`. It expands to ordered predicate checks and returns the
first matching int32 element or the explicit fallback. Materialized `find`
results, `undefined` values, arrow closures, captured state, dynamic receivers,
optional `thisArg`, sparse arrays, and non-int32 elements hard-fail.
`cheng-source.js-core.array-predicate-lite-i32` covers only
`localArray.some(namedPredicate)` and `localArray.every(namedPredicate)` where
the receiver is a proven local int32 array-lite value and the predicate is a
named local function `(number) => boolean`. Arrow closures, captured state,
dynamic receivers, optional `thisArg`, sparse arrays, and non-bool predicates
hard-fail.
`cheng-source.js-core.array-join-literal-length` covers only
`localStringLiteralArray.join(optionalStringLiteralSeparator)` folded at
compile time. The joined value may be assigned to a `const`/`let` local and
consumed through `.length`; no Cheng `str` ABI is emitted. Numeric arrays,
dynamic strings, dynamic separators, empty arrays, sparse arrays, `undefined`
coercion, and materialized runtime strings hard-fail.
`cheng-source.js-core.array-filter-length-lite-i32` covers only
`localArray.filter(namedPredicate).length` where the receiver is a proven local
int32 array-lite value and the predicate is a synchronous named local function
`(number) => boolean`. It lowers directly to a fixed predicate count. Materialized
filter arrays, arrow closures, captured state, optional `thisArg`, sparse arrays,
dynamic arrays, and non-bool predicates hard-fail.
`cheng-source.js-core.array-map-lite-i32` covers only
`localArray.map(namedMapper)` where the receiver is a proven local int32
array-lite value and the mapper is a synchronous named local function
`(number) => number`. It materializes a fresh fixed int32 array-lite value.
Arrow closures, captured state, index/array callback parameters, optional
`thisArg`, sparse arrays, mutation, and non-int32 results hard-fail.
`cheng-source.js-core.array-slice-lite-i32` covers only
`localArray.slice()` / `slice(literalStart)` / `slice(literalStart,
literalEnd)` where the receiver is a proven local int32 array-lite value and
the normalized result is non-empty. It materializes a fresh fixed int32
array-lite value. Dynamic bounds, empty results, sparse arrays, species
constructors, mutation, and non-int32 arrays hard-fail.
`cheng-source.js-core.array-concat-lite-i32` covers only
`localArray.concat(arrayLite...)` where every argument is a proven local int32
array-lite value or an int32 array literal. It materializes a fresh fixed int32
array-lite value. Element append, spread, dynamic arrays, sparse arrays,
species constructors, and non-int32 arrays hard-fail.
`cheng-source.js-core.array-reverse-lite-i32` covers only
`localArray.reverse()` where the receiver is a proven local int32 array-lite
value. It materializes a fresh reversed fixed array and updates the local
receiver binding for later reads in the same lowered function. Aliasing outside
the strict local array-lite model, sparse arrays, dynamic arrays, and non-int32
arrays hard-fail.
`cheng-source.js-core.array-sort-lite-i32` covers only
`localArray.sort(namedComparator)` where the receiver is a proven local int32
array-lite value with at most 16 elements and the comparator is a synchronous
named local function `(number, number) => number`. It emits an insertion-sort
compare/swap sequence and updates the local receiver binding for later reads.
Default lexicographic sort, arrow closures, captured state, optional
comparator side effects, large arrays, sparse arrays, dynamic arrays, and
non-int32 arrays hard-fail.
`cheng-source.js-core.array-push-lite-i32`,
`array-pop-lite-i32`, `array-shift-lite-i32`,
`array-unshift-lite-i32`, and `array-fill-lite-i32` cover only local proven
int32 array-lite values. `push` and `unshift` require at least one pure int32
argument and return the new length; `pop` and `shift` require the receiver to
remain non-empty after mutation and return the removed int32 value; `fill`
requires exactly one pure int32 fill value and returns the updated local array
binding. These providers model only intra-function local binding updates.
Empty results, `undefined`, aliasing outside this local model, sparse arrays,
dynamic arrays, optional bounds, and non-int32 values hard-fail.
`cheng-source.js-core.array-reduce-lite-i32` covers only
`localArray.reduce(namedReducer, initialInt32)` where the receiver is a proven
local int32 array-lite value and the reducer is a synchronous named local
function `(number, number) => number`. It lowers to nested int32 calls.
Missing initial values, arrow closures, captured state, index/array callback
parameters, sparse arrays, mutation, and non-int32 reducers hard-fail.
`cheng-source.js-core.string-literal` covers only string literals assigned to
locals, compile-time `.trim()`, `.toLowerCase()`, `.toUpperCase()`,
`.toString()`, `.slice(...)`, `.substring(...)`, `.replace(search,
replacement)`, `.padStart(...)`, `.padEnd(...)`, `.repeat(count)`,
`.charAt(index)`, `.charCodeAt(index)`, `.startsWith(x)`, `.endsWith(x)`,
`.includes(x)`, `.indexOf(x)`, `.lastIndexOf(x)`, `.split(singleCharLiteral)`,
and `.length` on the resulting compile-time string value. The shared
`String.length` runtime requirement is reported through
`cheng-source.js-core.string-length-lite`. String method receivers must be
proven local string literals or literal strings, and method arguments must be
string/int32 literals or proven local string literal values. It emits no Cheng
string ABI and folds the result before native codegen. Dynamic strings, string
parameters, regex/function replacement, mutation, concatenation, optional
search positions, and general runtime string objects hard-fail.
`cheng-source.js-core.string-split-literal` covers only `.split(singleCharLiteral)`
where the receiver is a proven local string literal or literal string. The
separator must be a single-character string literal. The result is a
compile-time string array; only `.length` and constant integer literal indexing
are supported for consumption. Regex separators, empty separators, multi-character
separators, dynamic separators, dynamic strings, `limit`, and materialized
runtime arrays hard-fail.
`cheng-source.js-core.string-literal` covers only
`.match(singleCharLiteral)` and `.search(singleCharLiteral)` where the receiver
is a proven local string literal or literal string. `.match` returns a
compile-time `bool` (whether the single character is present); `.search` returns
a compile-time `int32` (first match position or `-1`). Both require exactly one
single-character string literal argument. Regex arguments, multi-character
arguments, empty strings, dynamic receivers, and general `RegExpMatchArray`
semantics hard-fail.
`cheng-source.js-core.undefined-i32` covers only the global `undefined`
identifier lowered to the int32 value `0`. Comparisons `=== undefined` and
`!== undefined` lower to `== 0` and `!= 0`. Dynamic property access,
`void` expressions, optional chaining, nullish coalescing into `undefined`,
and `typeof` checks hard-fail.
`cheng-source.js-core.console-i32` covers only `console.log(int32)`,
`console.error(int32)`, and `console.warn(int32)` as void-returning statement
calls with exactly one pure int32 argument. Each lowers to a
`__ts_csg_console_*` helper call that returns `int32` (identity). String
arguments, multiple arguments, expression-context usage, and dynamic arguments
hard-fail.
`cheng-source.js-core.timer-i32` is a candidate-only provider for
`setTimeout(int32)`, `clearTimeout(int32)`, and `setInterval(int32)` as
void-returning statement calls. Only single int32 argument (delay/timeout ID)
is recognized; callback arguments, dynamic delays, and timer return values
hard-fail.
`cheng-source.js-core.process-i32` is a candidate-only provider for
`process.exit(int32)` as a void-returning statement call with exactly one
int32 exit code.
`cheng-source.js-core.try-catch` is a candidate-only provider for `try/catch`
exception regions; it registers the requirement as recognized but does not
lower exception handling to Cheng control flow.
`cheng-source.js-core.for-of-array-lite-i32` covers only `for...of` whose
iterable is a local int32 array-lite value and whose initializer is a single
`const`/`let` identifier. General JS iterators, strings, mutation-heavy loop
bodies, destructuring initializers, `break`, and `continue` hard-fail.
`cheng-source.js-core.array-isarray-lite` covers only already-bound array-lite
locals and lowers to `true`; non-array or direct aggregate expressions hard-fail
instead of using general JS runtime reflection. `cheng-source.js-core.object-freeze-lite`
covers only array-lite/object-lite values; it marks the proven local aggregate
as frozen, aliases the original value, and rejects later local mutation calls.
`cheng-source.js-core.object-assign-lite` covers only local assignment of
`Object.assign` where the target is an object literal and every source is
object-lite. It materializes a fresh readonly object-lite shape with later
properties overriding earlier ones. Mutable target identity, getters/setters,
symbol keys, spread side effects, and general object enumeration hard-fail.
`cheng-source.js-core.object-values-lite-i32` covers only local int32
array-lite/object-lite values and materializes a copied int32 array in known
property insertion order. `cheng-source.js-core.object-isfrozen-lite` only
reflects the frozen bit tracked by this lowering subset. Prototype traversal,
integer-key enumeration ordering, object identity, extensibility descriptors,
and general JS objects hard-fail.
`cheng-source.js-core.object-key-entry-length-lite` covers only `.length`
projection on `Object.keys(localArrayOrObjectLite)` and
`Object.entries(localArrayOrObjectLite)`. It lowers to the proven local property
or fixed-array element count. Materialized key/entry arrays, key strings, tuple
pairs, symbols, prototype traversal, integer-key enumeration ordering, and
general JS objects hard-fail.
