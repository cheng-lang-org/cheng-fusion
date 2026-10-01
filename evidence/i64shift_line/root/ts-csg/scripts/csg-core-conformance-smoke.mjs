import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  csgFactsRoot,
  validateCsgFacts,
} from "../dist/csg-standard.js";
import { csgcReadFacts } from "../dist/csgc-reader.js";
import { csgcWriteFacts } from "../dist/csgc-writer.js";
import "./csg-standard-strict-admission.test.mjs";
import "./csgc-writer-pure-cheng-gate.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const repoRoot = resolve(root, "..");
const csgTool = join(repoRoot, "tools", "csg");
const tmp = join(root, "tmp", "csg-core-conformance");
mkdirSync(tmp, { recursive: true });

const merkleFixedFacts = [
  { kind: "csg.core.schema", schema: "csg_core", features: ["core-facts"] },
  { kind: "csg.module", id: "mod_a", path: "a.cheng", sha256: "sha256:aaa" },
  { kind: "csg.symbol", id: "sym_a", name: "A", symbolKind: "fn" },
  { kind: "csg.symbol", id: "sym_b", name: "B", symbolKind: "fn" },
];
const merkleFixedRoot = "sha256:bca3cade95f20a537351b7505287da8d43b9e81c9e476205eb17904de917831e";
assert.equal(csgFactsRoot(merkleFixedFacts), merkleFixedRoot);
assert.equal(
  csgFactsRoot([
    merkleFixedFacts[3],
    merkleFixedFacts[0],
    merkleFixedFacts[2],
    merkleFixedFacts[1],
  ]),
  merkleFixedRoot,
);

const fixedCsgc = csgcWriteFacts(merkleFixedFacts).factsBuffer;
const reorderedCsgc = csgcWriteFacts([...merkleFixedFacts].reverse()).factsBuffer;
assert.equal(fixedCsgc.equals(reorderedCsgc), true);
assert.equal(csgFactsRoot(csgcReadFacts(fixedCsgc).facts), merkleFixedRoot);
const tamperedCsgc = Buffer.from(fixedCsgc);
tamperedCsgc[tamperedCsgc.length - 1] ^= 1;
assert.throws(() => csgcReadFacts(tamperedCsgc), /pure Cheng CSG CLI failed/);

const unsupportedFacts = [
  { kind: "csg.core.schema", schema: "csg_core", features: ["core-facts"] },
  {
    kind: "csg.unsupported",
    id: "unsupported:ts-csg:conformance",
    code: "ts-csg.conformance.unsupported",
    message: "conformance unsupported semantic",
  },
];
const strictUnsupported = validateCsgFacts(unsupportedFacts, "strict");
assert.equal(strictUnsupported.valid, false);
assert.equal(strictUnsupported.complete, false);
assert.equal(strictUnsupported.standard, "csg_core::v1");
assert.deepEqual(strictUnsupported.profiles, []);
assert.equal(strictUnsupported.profile_set_cid, "");
assert.equal(strictUnsupported.factsRoot, "");
assert.equal(strictUnsupported.unsupportedCount, 1);
const sandboxUnsupported = validateCsgFacts(unsupportedFacts, "sandbox");
assert.equal(sandboxUnsupported.valid, true);
assert.equal(sandboxUnsupported.complete, false);
assert.equal(sandboxUnsupported.standard, "csg_core::v1");
assert.deepEqual(sandboxUnsupported.profiles, ["csg_core"]);
assert.match(sandboxUnsupported.profile_set_cid, /^sha256:[0-9a-f]{64}$/);
assert.equal(sandboxUnsupported.profileSetCid, sandboxUnsupported.profile_set_cid);
assert.match(sandboxUnsupported.factsRoot, /^sha256:[0-9a-f]{64}$/);
assert.equal(sandboxUnsupported.unsupportedCount, 1);

const factsA = join(tmp, "basic.a.csgcore");
const factsB = join(tmp, "basic.b.csgcore");
const reportA = join(tmp, "basic.a.report.json");
const reportB = join(tmp, "basic.b.report.json");
const summaryA = join(tmp, "basic.a.summary.json");
const summaryB = join(tmp, "basic.b.summary.json");
const indexA = join(tmp, "basic.a.idx.json");
const indexB = join(tmp, "basic.b.idx.json");
const fileFactsProjectRel = join(tmp, "file-project-rel.csgcore");
const fileFactsCwdRel = join(tmp, "file-cwd-rel.csgcore");
const fileSummaryProjectRel = join(tmp, "file-project-rel.summary.json");
const fileSummaryCwdRel = join(tmp, "file-cwd-rel.summary.json");
const badFacts = join(tmp, "bad.csgcore");
const dynamicDir = join(tmp, "dynamic-computed");
const dynamicSrcDir = join(dynamicDir, "src");
const dynamicTsconfig = join(dynamicDir, "tsconfig.json");
const dynamicFacts = join(tmp, "dynamic-computed.csgcore");
const dynamicReport = join(tmp, "dynamic-computed.report.json");
mkdirSync(dynamicSrcDir, { recursive: true });
writeFileSync(join(dynamicSrcDir, "main.ts"), [
  "// @ts-nocheck",
  "export function read(input: Record<string, number>, key: string): number {",
  "  const { [key]: value } = input;",
  "  return value;",
  "}",
  "export function* ids(): Generator<number, void, unknown> {",
  "  yield 1;",
  "}",
  "export function dates(text: string): Date[] {",
  "  return [new Date(), new Date(0), new Date(text), new Date({} as object)];",
  "}",
  "export function copyDate(input: Date): Date {",
  "  return new Date(input);",
  "}",
  "export function socketState(url: string): number {",
  "  const socket = new WebSocket(url);",
  "  return socket.readyState === WebSocket.OPEN ? WebSocket.OPEN : WebSocket.CONNECTING;",
  "}",
  "export function xhrReadyState(): number {",
  "  const request = new XMLHttpRequest();",
  "  request.setRequestHeader('x-test', '1');",
  "  request.getAllResponseHeaders();",
  "  return request.readyState;",
  "}",
  "export function blobStaticCapabilities(): boolean {",
  "  return typeof Blob === 'function' && Blob.name === 'Blob' && typeof Blob.prototype.arrayBuffer === 'function';",
  "}",
  "export function headerProbe(init?: HeadersInit): boolean {",
  "  return new Headers(init).has('x-test');",
  "}",
  "export function emptyHeaders(): Headers {",
  "  return new Headers();",
  "}",
  "export function staticHeaders(): Headers {",
  "  return new Headers({ Accept: 'application/json', 'content-type': 'text/plain' });",
  "}",
  "export function spreadHeaders(extra: Record<string, string>): Headers {",
  "  return new Headers({ 'x-test': '1', ...extra });",
  "}",
  "export function idbOpen(): IDBOpenDBRequest {",
  "  return self.indexedDB.open('csg-smoke', 1);",
  "}",
  "export function responseStatus(): Response {",
  "  return new Response('ok', { status: 200 });",
  "}",
  "export function responseHeaders(): Response {",
  "  return new Response('ok', { status: 200, headers: { 'x-test': '1' } });",
  "}",
  "",
].join("\n"));
writeFileSync(dynamicTsconfig, JSON.stringify({
  compilerOptions: {
    target: "ES2022",
    module: "ESNext",
    strict: true,
    skipLibCheck: true,
  },
  include: ["src/**/*.ts"],
}, null, 2));

function run(args, options = {}) {
  return execFileSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
  });
}

function runCsg(args, options = {}) {
  return execFileSync(csgTool, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
  });
}

run([
  "dist/cli.js",
  "--emit",
  "csg-core",
  "--project",
  "fixtures/basic/tsconfig.json",
  "--runtime",
  "node,browser",
  "--out",
  factsA,
  "--report-out",
  reportA,
  "--summary-out",
  summaryA,
  "--index-out",
  indexA,
]);
run([
  "dist/cli.js",
  "--emit",
  "csg-core",
  "--project",
  "fixtures/basic/tsconfig.json",
  "--runtime",
  "node,browser",
  "--out",
  factsB,
  "--report-out",
  reportB,
  "--summary-out",
  summaryB,
  "--index-out",
  indexB,
]);

assert.equal(readFileSync(factsA, "utf8"), readFileSync(factsB, "utf8"));
assert.equal(readFileSync(reportA, "utf8"), readFileSync(reportB, "utf8"));
assert.equal(readFileSync(summaryA, "utf8"), readFileSync(summaryB, "utf8"));
assert.equal(readFileSync(indexA, "utf8"), readFileSync(indexB, "utf8"));

const validateOut = runCsg(["validate", factsA]);
assert.match(validateOut, /^valid=1$/m);
assert.match(validateOut, /^mode=strict$/m);
assert.match(validateOut, /^profile=csg_core$/m);
assert.match(validateOut, /^facts_root=sha256:[0-9a-f]{64}$/m);
assert.match(validateOut, /^tombstone_count=0$/m);

const rootA = runCsg(["root", factsA]).trim();
const rootB = runCsg(["root", factsB]).trim();
assert.equal(rootA, rootB);

const diffOut = runCsg(["diff", factsA, factsB]);
assert.match(diffOut, /^same=1$/m);

run([
  "dist/cli.js",
  "--emit",
  "csg-core",
  "--project",
  "fixtures/basic/tsconfig.json",
  "--file",
  "src/main.ts",
  "--runtime",
  "node,browser",
  "--out",
  fileFactsProjectRel,
  "--summary-out",
  fileSummaryProjectRel,
]);
run([
  "dist/cli.js",
  "--emit",
  "csg-core",
  "--project",
  "fixtures/basic/tsconfig.json",
  "--file",
  "fixtures/basic/src/main.ts",
  "--runtime",
  "node,browser",
  "--out",
  fileFactsCwdRel,
  "--summary-out",
  fileSummaryCwdRel,
]);
assert.equal(readFileSync(fileFactsProjectRel, "utf8"), readFileSync(fileFactsCwdRel, "utf8"));
assert.equal(runCsg(["root", fileFactsProjectRel]).trim(), runCsg(["root", fileFactsCwdRel]).trim());
const fileSummary = JSON.parse(readFileSync(fileSummaryCwdRel, "utf8"));
assert.equal(fileSummary.schema, "csg-core.summary");
assert.ok(fileSummary.counts.source_files > 0);
assert.ok(fileSummary.counts.modules > 0);
assert.ok(readFileSync(fileFactsCwdRel, "utf8").trim().split("\n").length > 2);

const report = JSON.parse(readFileSync(reportA, "utf8"));
assert.equal(report.schema, "csg-core.report");
assert.equal(report.standard, "csg_core::v1");
assert.ok(Array.isArray(report.profiles));
assert.equal(report.profiles[0], "csg_core");
assert.match(report.profile_set_cid, /^sha256:[0-9a-f]{64}$/);
assert.equal(report.factsRoot, rootA);
assert.equal(report.facts_root, rootA);
assert.equal(typeof report.complete, "boolean");
assert.ok(report.counts.modules > 0);
assert.ok(Array.isArray(report.unsupported));
assert.ok(Array.isArray(report.runtimeRequirements));
assert.ok(Array.isArray(report.externalSymbols));
assert.equal(report.unsupported.some((item) => item.code === "binding.computed"), false);

const summary = JSON.parse(readFileSync(summaryA, "utf8"));
assert.equal(summary.schema, "csg-core.summary");
assert.equal(summary.standard, "csg_core::v1");
assert.deepEqual(summary.profiles, report.profiles);
assert.equal(summary.profile_set_cid, report.profile_set_cid);
assert.equal(summary.facts_root, rootA);
assert.equal(summary.complete, report.complete);
assert.equal(summary.unsupported_count, report.unsupported.length);
assert.equal(summary.runtime_requirement_count, report.runtimeRequirements.length);
assert.equal(summary.external_symbol_count, report.externalSymbols.length);
assert.equal(summary.runtime_closure.group_count, report.runtimeClosure.groupCount);
assert.equal(summary.counts.source_files, report.counts.sourceFiles);
assert.equal(Array.isArray(summary.unsupported), false);
assert.equal(Array.isArray(summary.runtimeRequirements), false);
assert.equal(Array.isArray(summary.runtime_closure.requirements), false);

const index = JSON.parse(readFileSync(indexA, "utf8"));
assert.equal(index.schema, "csg-core.index");
assert.equal(index.standard, "csg_core::v1");
assert.deepEqual(index.profiles, report.profiles);
assert.equal(index.profile_set_cid, report.profile_set_cid);
assert.equal(index.facts_root, rootA);
assert.equal(index.complete, report.complete);
assert.equal(index.counts.files, summary.counts.source_files);
assert.equal(index.counts.symbols, summary.counts.symbols);
assert.equal(index.counts.functions, summary.counts.functions);
assert.equal(index.counts.calls, summary.counts.calls);
assert.ok(index.files.some((item) => item.file === "src/main.ts" && item.fact_count > 0));
assert.ok(index.symbols.some((item) => item.name === "run" || item.name === "scale"));
assert.ok(index.functions.every((item) => typeof item.call_count === "number"));
assert.ok(index.calls.every((item) => typeof item.callee_text === "string"));

const facts = readFileSync(factsA, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
const computedBinding = facts.find((fact) => fact.kind === "csg.binding" && fact.name === "computedX");
assert.deepEqual(computedBinding?.path, [{ kind: "property", name: "x" }]);
const computedExtract = facts.find((fact) => fact.kind === "csg.op" && fact.opKind === "binding_extract" && fact.name === "computedX");
assert.deepEqual(computedExtract?.path, [{ kind: "property", name: "x" }]);

run([
  "dist/cli.js",
  "--emit",
  "csg-core",
  "--project",
  dynamicTsconfig,
  "--runtime",
  "node,browser",
  "--out",
  dynamicFacts,
  "--report-out",
  dynamicReport,
]);
const dynamicReportData = JSON.parse(readFileSync(dynamicReport, "utf8"));
assert.equal(dynamicReportData.unsupported.some((item) => item.code === "binding.computed"), false);
assert.equal(dynamicReportData.unsupported.some((item) => item.code === "ts.nocheck"), false);
assert.equal(dynamicReportData.unsupported.some((item) => item.code === "function.generator"), false);
assert.equal(dynamicReportData.runtimeRequirements.some((item) => item.kind === "generator_function" && item.name === "ids"), true);
const dateGroups = dynamicReportData.runtimeClosure.requirements.filter((item) => item.kind === "constructor" && item.name === "Date");
const closedDateCount = dateGroups.filter((item) => item.providerStatus === "closed").reduce((sum, item) => sum + item.count, 0);
const openDateCount = dateGroups.filter((item) => item.providerStatus === "open").reduce((sum, item) => sum + item.count, 0);
assert.equal(closedDateCount, 4);
assert.equal(openDateCount, 1);
const webSocketGroups = dynamicReportData.runtimeClosure.requirements.filter((item) => item.runtime === "browser" && item.name.includes("WebSocket"));
assert.equal(webSocketGroups.some((item) => item.providerStatus === "open"), false);
assert.equal(new Set(webSocketGroups.map((item) => item.provider)).size, 1);
assert.equal(webSocketGroups[0]?.provider, "cheng/core/runtime/web_websocket_runtime.websocket-lite");
const xhrConstructorGroup = dynamicReportData.runtimeClosure.requirements.find((item) => item.kind === "constructor" && item.name === "XMLHttpRequest");
assert.equal(xhrConstructorGroup?.providerStatus, "closed");
assert.equal(xhrConstructorGroup?.provider, "cheng/core/runtime/web_runtime.fetch-xhr-lite");
const xhrSetHeaderGroup = dynamicReportData.runtimeClosure.requirements.find((item) => item.kind === "call" && item.name === "request.setRequestHeader");
assert.equal(xhrSetHeaderGroup?.providerStatus, "closed");
assert.equal(xhrSetHeaderGroup?.provider, "cheng/core/runtime/web_runtime.fetch-xhr-lite");
const xhrAllHeadersGroup = dynamicReportData.runtimeClosure.requirements.find((item) => item.kind === "call" && item.name === "request.getAllResponseHeaders");
assert.equal(xhrAllHeadersGroup?.providerStatus, "closed");
assert.equal(xhrAllHeadersGroup?.provider, "cheng/core/runtime/web_runtime.fetch-xhr-lite");
const blobNameGroup = dynamicReportData.runtimeClosure.requirements.find((item) => item.kind === "property_access" && item.name === "Blob.name");
assert.equal(blobNameGroup?.providerStatus, "closed");
assert.equal(blobNameGroup?.provider, "cheng/core/runtime/web_runtime.dom-document-lite");
const blobPrototypeGroup = dynamicReportData.runtimeClosure.requirements.find((item) => item.kind === "property_access" && item.name === "Blob.prototype");
assert.equal(blobPrototypeGroup?.providerStatus, "closed");
assert.equal(blobPrototypeGroup?.provider, "cheng/core/runtime/web_runtime.dom-document-lite");
const blobArrayBufferGroup = dynamicReportData.runtimeClosure.requirements.find((item) => item.kind === "property_access" && item.name === "Blob.prototype.arrayBuffer");
assert.equal(blobArrayBufferGroup?.providerStatus, "closed");
assert.equal(blobArrayBufferGroup?.provider, "cheng/core/runtime/web_runtime.dom-document-lite");
const headersConstructorGroups = dynamicReportData.runtimeClosure.requirements.filter((item) => item.kind === "constructor" && item.name === "Headers");
const closedHeadersCount = headersConstructorGroups.filter((item) => item.providerStatus === "closed").reduce((sum, item) => sum + item.count, 0);
const openHeadersCount = headersConstructorGroups.filter((item) => item.providerStatus === "open").reduce((sum, item) => sum + item.count, 0);
assert.equal(closedHeadersCount, 4);
assert.equal(openHeadersCount, 0);
assert.equal(headersConstructorGroups.find((item) => item.providerStatus === "closed")?.provider, "cheng/core/runtime/web_runtime.headers-lite");
const idbOpenGroup = dynamicReportData.runtimeClosure.requirements.find((item) => item.kind === "call" && item.name === "self.indexedDB.open");
assert.equal(idbOpenGroup?.providerStatus, "closed");
assert.equal(idbOpenGroup?.provider, "cheng/core/runtime/web_indexeddb_runtime.indexeddb-lite");
const responseGroups = dynamicReportData.runtimeClosure.requirements.filter((item) => item.kind === "constructor" && item.name === "Response");
const closedResponseCount = responseGroups.filter((item) => item.providerStatus === "closed").reduce((sum, item) => sum + item.count, 0);
const openResponseCount = responseGroups.filter((item) => item.providerStatus === "open").reduce((sum, item) => sum + item.count, 0);
assert.equal(closedResponseCount, 2);
assert.equal(openResponseCount, 0);
assert.equal(responseGroups.find((item) => item.providerStatus === "closed")?.provider, "cheng/core/runtime/web_runtime.fetch-response-lite");
const dynamicFactLines = readFileSync(dynamicFacts, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
const noCheckDirective = dynamicFactLines.find((fact) => fact.kind === "csg.data" && fact.dataKind === "source_file_directive");
assert.deepEqual(noCheckDirective?.value, {
  sourceFile: "src/main.ts",
  directive: "ts-nocheck",
  effect: "typescript_diagnostics_suppressed",
});
const dynamicBinding = dynamicFactLines.find((fact) => fact.kind === "csg.binding" && fact.name === "value");
assert.deepEqual(dynamicBinding?.path, [{ kind: "computed", expressionText: "key", expressionKind: "Identifier" }]);
const dynamicExtract = dynamicFactLines.find((fact) => fact.kind === "csg.op" && fact.opKind === "binding_extract" && fact.name === "value");
assert.deepEqual(dynamicExtract?.path, [{ kind: "computed", expressionText: "key", expressionKind: "Identifier" }]);
const generatorRequirement = dynamicFactLines.find((fact) => fact.kind === "csg.runtime_requirement" && fact.requirementKind === "generator_function" && fact.name === "ids");
assert.deepEqual(generatorRequirement?.proofs, ["generator-iterator-state-machine"]);
const dateCopyRequirement = dynamicFactLines.find((fact) => fact.kind === "csg.runtime_requirement" && fact.name === "Date" && fact.proofs?.includes("date-constructor-copy"));
assert.ok(dateCopyRequirement);
const responseRequirement = dynamicFactLines.find((fact) => fact.kind === "csg.runtime_requirement" && fact.name === "Response" && fact.proofs?.includes("browser-response-constructor-body-status"));
assert.ok(responseRequirement);
const xhrSetHeaderRequirement = dynamicFactLines.find((fact) => fact.kind === "csg.runtime_requirement" && fact.name === "request.setRequestHeader" && fact.proofs?.includes("browser-xhr-set-request-header"));
assert.ok(xhrSetHeaderRequirement);
const xhrAllHeadersRequirement = dynamicFactLines.find((fact) => fact.kind === "csg.runtime_requirement" && fact.name === "request.getAllResponseHeaders" && fact.proofs?.includes("browser-xhr-get-all-response-headers"));
assert.ok(xhrAllHeadersRequirement);
const blobNameRequirement = dynamicFactLines.find((fact) => fact.kind === "csg.runtime_requirement" && fact.name === "Blob.name" && fact.proofs?.includes("browser-blob-constructor-name"));
assert.ok(blobNameRequirement);
const blobPrototypeRequirement = dynamicFactLines.find((fact) => fact.kind === "csg.runtime_requirement" && fact.name === "Blob.prototype" && fact.proofs?.includes("browser-blob-prototype"));
assert.ok(blobPrototypeRequirement);
const blobArrayBufferRequirement = dynamicFactLines.find((fact) => fact.kind === "csg.runtime_requirement" && fact.name === "Blob.prototype.arrayBuffer" && fact.proofs?.includes("browser-blob-prototype-arraybuffer"));
assert.ok(blobArrayBufferRequirement);
const emptyHeadersRequirement = dynamicFactLines.find((fact) => fact.kind === "csg.runtime_requirement" && fact.name === "Headers" && fact.proofs?.includes("browser-headers-constructor-empty"));
assert.ok(emptyHeadersRequirement);
const staticHeadersRequirement = dynamicFactLines.find((fact) => fact.kind === "csg.runtime_requirement" && fact.name === "Headers" && fact.proofs?.includes("browser-headers-constructor-static-object"));
assert.ok(staticHeadersRequirement);
const runtimeRoundtripFacts = csgcReadFacts(
  csgcWriteFacts([merkleFixedFacts[0], generatorRequirement]).factsBuffer,
).facts;
const runtimeRoundtrip = runtimeRoundtripFacts.find((fact) => fact.kind === "csg.runtime_requirement" && fact.name === "ids");
assert.equal(runtimeRoundtrip?.requirementKind, "generator_function");

writeFileSync(badFacts, JSON.stringify({ kind: "csg.module", id: "m" }) + "\n");
let failed = false;
try {
  runCsg(["validate", badFacts], { stdio: "pipe" });
} catch {
  failed = true;
}
assert.equal(failed, true);

console.log("csg-core-conformance smoke ok");
