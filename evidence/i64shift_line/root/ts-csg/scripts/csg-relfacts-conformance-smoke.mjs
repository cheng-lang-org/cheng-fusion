import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootUrl = new URL("../", import.meta.url);
const root = fileURLToPath(rootUrl);
const relfactsModule = await import(new URL("dist/csg-relfacts.js", rootUrl).href);

const semanticEvents = relfactsModule.buildRelationFactsFromFacts([
  { kind: "csg.function", id: "fn_submit", module: "checkout", name: "submit" },
  { kind: "csg.call", id: "call_submit", owner: "fn_submit", callee: "api.placeOrder" },
  {
    kind: "csg.runtime_requirement",
    domain: "web",
    requirementKind: "provider",
    name: "fetch",
    providerStatus: "open",
  },
]);

assert.deepEqual(semanticEvents, [
  { kind: "csg.relfact", predicate: "Function", args: ["fn_submit", "checkout", "submit"] },
  { kind: "csg.relfact", predicate: "Calls", args: ["fn_submit", "api.placeOrder", "call_submit"] },
  { kind: "csg.relfact", predicate: "RuntimeRequirement", args: ["web", "provider", "fetch", "open"] },
]);
assert.equal(semanticEvents.some((event) => Object.hasOwn(event, "fact_hash")), false);

const unavailable = spawnSync(process.execPath, ["dist/cli.js", "--emit", "relfacts"], {
  cwd: root,
  encoding: "utf8",
});
assert.equal(unavailable.status, 1);
assert.equal(unavailable.stdout, "");
assert.match(unavailable.stderr, /^error: pure Cheng csg_relfacts::v1 CLI entry is unavailable\n$/);

const retiredDiff = spawnSync(process.execPath, ["dist/cli.js", "--relfacts-diff-in", "events.jsonl"], {
  cwd: root,
  encoding: "utf8",
});
assert.equal(retiredDiff.status, 1);
assert.equal(retiredDiff.stdout, "");
assert.match(retiredDiff.stderr, /^error: unknown argument: --relfacts-diff-in\n$/);

console.log("csg-relfacts conformance ok role=semantic_event_producer canonical_cli=unavailable_hard_fail");
