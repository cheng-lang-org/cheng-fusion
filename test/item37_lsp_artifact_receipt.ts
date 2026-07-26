import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {pathToFileURL} from "node:url";
import assert from "node:assert/strict";
import {canonicalJson} from "../src/cheng_semantic_matrix_m9023.ts";
import {
  CHENG_LSP_ARTIFACT_RECEIPT_SCHEMA,
  CHENG_LSP_REVOKED_OUTPUT_RAW32,
  chengLspArtifactCacheKey,
  chengLspArtifactReceiptPath,
  chengLspAssertArtifactIdentityStable,
  chengLspAssertArtifactOutputAllowed,
  chengLspCaptureArtifactIdentity,
} from "../src/cheng_lsp_artifact_receipt.ts";

const FAKE_LSP = `#!/usr/bin/env bun
let pending = Buffer.alloc(0);
function send(value) {
  const body = Buffer.from(JSON.stringify(value));
  process.stdout.write(Buffer.concat([
    Buffer.from("Content-Length: " + body.length + "\\r\\n\\r\\n"),
    body,
  ]));
}
function consume() {
  for (;;) {
    const headerEnd = pending.indexOf("\\r\\n\\r\\n");
    if (headerEnd < 0) return;
    const header = pending.subarray(0, headerEnd).toString("ascii");
    const match = /(?:^|\\r\\n)Content-Length: ([0-9]+)(?:\\r\\n|$)/i.exec(header);
    if (!match) process.exit(91);
    const length = Number(match[1]);
    const frameEnd = headerEnd + 4 + length;
    if (pending.length < frameEnd) return;
    const message = JSON.parse(
      pending.subarray(headerEnd + 4, frameEnd).toString("utf8"),
    );
    pending = pending.subarray(frameEnd);
    if (message.method === "initialize") {
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: {capabilities: {}, serverInfo: {name: "receipt-test-lsp"}},
      });
    } else if (message.method === "shutdown") {
      send({jsonrpc: "2.0", id: message.id, result: null});
    } else if (message.method === "exit") {
      process.exit(0);
    }
  }
}
process.stdin.on("data", (chunk) => {
  pending = Buffer.concat([pending, chunk]);
  consume();
});
process.stdin.resume();
`;

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function pin(path: string) {
  const raw = readFileSync(path);
  return {
    path,
    byteLength: raw.length,
    bytesRaw32: sha256(raw),
  };
}

function writeReceipt(toolchainRoot: string, outputPath: string): string {
  const payload = {
    schema: CHENG_LSP_ARTIFACT_RECEIPT_SCHEMA,
    officialDriver: pin(join(toolchainRoot, "artifacts/backend_driver/cheng")),
    parser: pin(join(toolchainRoot, "src/core/lang/parser.cheng")),
    lspServer: pin(join(toolchainRoot, "src/core/tooling/lsp_server.cheng")),
    output: pin(outputPath),
  };
  const receipt = {
    ...payload,
    receiptRaw32: sha256(canonicalJson(payload)),
  };
  const receiptPath = chengLspArtifactReceiptPath(outputPath);
  if (existsSync(receiptPath)) chmodSync(receiptPath, 0o600);
  writeFileSync(receiptPath, `${canonicalJson(receipt)}\n`, {mode: 0o400});
  chmodSync(receiptPath, 0o400);
  return receiptPath;
}

function makeToolchain(root: string, outputText = "#!/bin/sh\nexit 0\n") {
  mkdirSync(join(root, "artifacts/backend_driver"), {recursive: true});
  mkdirSync(join(root, "artifacts"), {recursive: true});
  mkdirSync(join(root, "src/core/lang"), {recursive: true});
  mkdirSync(join(root, "src/core/tooling"), {recursive: true});
  writeFileSync(join(root, "cheng-package.toml"), 'package_id = "pkg://receipt-test"\n');
  const driver = join(root, "artifacts/backend_driver/cheng");
  const parser = join(root, "src/core/lang/parser.cheng");
  const lspServer = join(root, "src/core/tooling/lsp_server.cheng");
  const output = join(root, "artifacts/cheng-lsp");
  writeFileSync(driver, "#!/bin/sh\nexit 0\n");
  writeFileSync(
    parser,
    "if !bodilessImportcAllowed:\n    err = \"parser value expr: routine suite assignment missing\"\n",
  );
  writeFileSync(lspServer, "import cheng/core/lang/parser\n");
  writeFileSync(output, outputText);
  chmodSync(driver, 0o500);
  chmodSync(output, 0o500);
  writeReceipt(root, output);
  return {driver, parser, lspServer, output};
}

function assertThrows(action: () => unknown, pattern: RegExp): void {
  assert.throws(action, pattern);
}

const tempRoot = realpathSync(mkdtempSync(join(tmpdir(), "cheng-lsp-artifact-receipt.")));
try {
  const validRoot = join(tempRoot, "valid");
  const valid = makeToolchain(validRoot);
  const identity = chengLspCaptureArtifactIdentity(valid.output, validRoot);
  assert.equal(identity.schema, CHENG_LSP_ARTIFACT_RECEIPT_SCHEMA);
  assert.equal(identity.output.bytesRaw32, pin(valid.output).bytesRaw32);
  assert.equal(identity.officialDriver.bytesRaw32, pin(valid.driver).bytesRaw32);
  assert.equal(identity.parser.bytesRaw32, pin(valid.parser).bytesRaw32);
  assert.equal(identity.lspServer.bytesRaw32, pin(valid.lspServer).bytesRaw32);
  assert.equal(
    chengLspArtifactCacheKey("/workspace", identity),
    canonicalJson({root: "/workspace", lspSha: identity.output.bytesRaw32}),
  );

  assertThrows(
    () => chengLspAssertArtifactOutputAllowed(CHENG_LSP_REVOKED_OUTPUT_RAW32),
    /revoked installed cheng-lsp/,
  );

  const missingDriverRoot = join(tempRoot, "missing-driver");
  const missingDriver = makeToolchain(missingDriverRoot);
  rmSync(missingDriver.driver);
  assertThrows(
    () => chengLspCaptureArtifactIdentity(missingDriver.output, missingDriverRoot),
    /official Cheng backend driver.*missing|official Cheng backend driver.*not materialized/,
  );

  const missingReceiptRoot = join(tempRoot, "missing-receipt");
  const missingReceipt = makeToolchain(missingReceiptRoot);
  rmSync(chengLspArtifactReceiptPath(missingReceipt.output));
  assertThrows(
    () => chengLspCaptureArtifactIdentity(missingReceipt.output, missingReceiptRoot),
    /cheng-lsp artifact receipt.*missing|cheng-lsp artifact receipt.*not materialized/,
  );

  const staleReceiptRoot = join(tempRoot, "stale-receipt");
  const staleReceipt = makeToolchain(staleReceiptRoot);
  writeFileSync(staleReceipt.parser, "fn changed(): int32 =\n    return 1\n");
  assertThrows(
    () => chengLspCaptureArtifactIdentity(staleReceipt.output, staleReceiptRoot),
    /parser source (?:byte length|hash) mismatch/,
  );

  const driftRoot = join(tempRoot, "drift");
  const drift = makeToolchain(driftRoot);
  const beforeInitialize = chengLspCaptureArtifactIdentity(
    drift.output,
    driftRoot,
  );
  chmodSync(chengLspArtifactReceiptPath(drift.output), 0o600);
  chmodSync(drift.output, 0o600);
  writeFileSync(drift.output, "#!/bin/sh\nexit 7\n");
  chmodSync(drift.output, 0o500);
  writeReceipt(driftRoot, drift.output);
  const afterInitialize = chengLspCaptureArtifactIdentity(
    drift.output,
    driftRoot,
  );
  assert.notEqual(
    beforeInitialize.output.bytesRaw32,
    afterInitialize.output.bytesRaw32,
  );
  assertThrows(
    () => chengLspAssertArtifactIdentityStable(
      beforeInitialize,
      afterInitialize,
      "cheng-lsp initialize",
    ),
    /cheng-lsp initialize artifact identity changed/,
  );
  assert.notEqual(
    chengLspArtifactCacheKey(driftRoot, beforeInitialize),
    chengLspArtifactCacheKey(driftRoot, afterInitialize),
    "cache authority must be the exact root/LSP-SHA pair",
  );

  const integrationRoot = join(tempRoot, "integration");
  const integration = makeToolchain(integrationRoot, FAKE_LSP);
  const toolkitUrl = pathToFileURL(
    join(import.meta.dir, "../src/cheng_toolkit_m9000.ts"),
  ).href;
  const integrationCode = `
const toolkit = await import(${JSON.stringify(toolkitUrl)});
const root = process.env.CHENG_TOOLCHAIN_ROOT;
const firstWave = await Promise.all(
  Array.from({length: 24}, () => toolkit.chengLspEnsureClient(root)),
);
if (new Set(firstWave).size !== 1) {
  throw new Error("receipt-bound LSP single-flight split");
}
const client = firstWave[0];
const expectedKey = JSON.stringify({
  lspSha: client.artifactIdentity.output.bytesRaw32,
  root,
});
if (client.cacheKey !== expectedKey) {
  throw new Error("receipt-bound LSP cache key is not root/LSP-SHA");
}
const exited = new Promise((resolvePromise, rejectPromise) => {
  const timer = setTimeout(
    () => rejectPromise(new Error("receipt-bound LSP graceful exit timed out")),
    3000,
  );
  client.child.once("exit", (code, signal) => {
    clearTimeout(timer);
    if (code !== 0 || signal !== null) {
      rejectPromise(new Error("receipt-bound LSP exit was not graceful"));
    } else {
      resolvePromise();
    }
  });
});
await client.request("shutdown", null, 1000);
client.notify("exit", null);
await exited;
console.log("receipt-bound LSP integration: PASS");
`;
  const integrationRun = spawnSync(
    process.execPath,
    ["-e", integrationCode],
    {
      cwd: integrationRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        CHENG_TOOLCHAIN_ROOT: integrationRoot,
        CHENG_ROOT: integrationRoot,
        CHENG_LSP_PATH: integration.output,
      },
      timeout: 10000,
    },
  );
  assert.equal(
    integrationRun.signal,
    null,
    `receipt integration was signaled: ${integrationRun.signal}`,
  );
  assert.equal(
    integrationRun.status,
    0,
    `receipt integration failed: ${integrationRun.stderr}`,
  );
  assert.match(
    integrationRun.stdout,
    /receipt-bound LSP integration: PASS/,
  );

  const currentToolchainRoot =
    process.env.CHENG_TOOLCHAIN_ROOT ||
    process.env.CHENG_ROOT ||
    "/Users/lbcheng/cheng-lang";
  const currentParser = readFileSync(
    join(currentToolchainRoot, "src/core/lang/parser.cheng"),
    "utf8",
  );
  assert.match(
    currentParser,
    /if !bodilessImportcAllowed:\n\s+err = "parser value expr: routine suite assignment missing"/,
    "ordinary bodyless fn must still take the hard-error branch",
  );
  assert.match(
    currentParser,
    /ParserValueExprProcessRoutineRange\([\s\S]{0,300}importcAnnotationPending,[\s\S]{0,80}err\)/,
    "@importc is the only annotation path that enables a bodyless declaration",
  );

  const outputStat = statSync(valid.output);
  assert.ok(outputStat.isFile() && (outputStat.mode & 0o111) !== 0);
  console.log("item37 lsp artifact receipt: PASS");
} finally {
  rmSync(tempRoot, {recursive: true, force: true});
}
