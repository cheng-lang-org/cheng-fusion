#!/usr/bin/env bun
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {
  validateOfficialCurrentBuildBinding,
} from "../src/cheng_current_parser_receipt_ingress.ts";

const CHENG_ROOT = "/Users/lbcheng/cheng-lang";
const OFFICIAL_DRIVER = join(
  CHENG_ROOT,
  "artifacts/backend_driver/cheng",
);
const OFFICIAL_BUILD_RECEIPT = join(
  CHENG_ROOT,
  "artifacts/backend_driver/cheng.current-build-receipt.kv",
);
const CURRENT_BUILD_EVIDENCE = join(
  CHENG_ROOT,
  "tools/backend2_current_source_official_build_evidence",
);

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function bindCurrent(path: string): void {
  const result = spawnSync(
    CURRENT_BUILD_EVIDENCE,
    [
      "bind-current",
      "--receipt",
      OFFICIAL_BUILD_RECEIPT,
      "--out",
      path,
    ],
    {
      cwd: CHENG_ROOT,
      encoding: "utf8",
      env: {PATH: "/usr/bin:/bin:/usr/sbin:/sbin"},
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      "OFFICIAL_RED: canonical current official driver/build receipt " +
      "is absent or invalid; run the unique current-source official " +
      "publisher in a frozen source window. " +
      `rc=${result.status ?? "spawn"} ` +
      `stdout=${String(result.stdout).slice(-1000)} ` +
      `stderr=${String(result.stderr).slice(-2000)}`,
    );
  }
}

function validateCurrent(path: string): void {
  const result = spawnSync(
    CURRENT_BUILD_EVIDENCE,
    ["validate-binding", "--binding", path],
    {
      cwd: CHENG_ROOT,
      encoding: "utf8",
      env: {PATH: "/usr/bin:/bin:/usr/sbin:/sbin"},
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      "OFFICIAL_RED: current official publisher/binding validation " +
      `failed rc=${result.status ?? "spawn"} ` +
      `stdout=${String(result.stdout).slice(-1000)} ` +
      `stderr=${String(result.stderr).slice(-2000)}`,
    );
  }
}

function mutateHashedKv(
  input: Buffer,
  mutate: (lines: string[]) => void,
): string {
  const text = input.toString("utf8");
  assert.ok(text.endsWith("\n"));
  const lines = text.slice(0, -1).split("\n");
  assert.match(lines.at(-1) ?? "", /^receipt_payload_sha256=[0-9a-f]{64}$/);
  lines.pop();
  mutate(lines);
  const payload = `${lines.join("\n")}\n`;
  return payload + `receipt_payload_sha256=${sha256(payload)}\n`;
}

const transactionRoot = mkdtempSync(
  join(tmpdir(), "cheng-current-official-release-required-"),
);
try {
  const firstRoot = join(transactionRoot, "first");
  const secondRoot = join(transactionRoot, "second");
  const mutationRoot = join(transactionRoot, "mutation");
  mkdirSync(firstRoot);
  mkdirSync(secondRoot);
  mkdirSync(mutationRoot);
  const firstBinding = join(firstRoot, "current-official-binding.kv");
  const secondBinding = join(secondRoot, "current-official-binding.kv");
  bindCurrent(firstBinding);
  bindCurrent(secondBinding);
  validateCurrent(firstBinding);
  validateCurrent(secondBinding);

  const firstBytes = readFileSync(firstBinding);
  const secondBytes = readFileSync(secondBinding);
  assert.ok(firstBytes.equals(secondBytes));
  assert.notEqual(statSync(firstBinding).ino, statSync(secondBinding).ino);

  const first = validateOfficialCurrentBuildBinding(firstBinding);
  const second = validateOfficialCurrentBuildBinding(secondBinding);
  assert.equal(first.officialDriverPath, OFFICIAL_DRIVER);
  assert.equal(first.officialBuildReceiptPath, OFFICIAL_BUILD_RECEIPT);
  assert.equal(first.officialDriverSha256, sha256(readFileSync(
    OFFICIAL_DRIVER,
  )));
  assert.equal(first.officialDriverSha256, second.officialDriverSha256);
  assert.equal(
    first.sourceSnapshotManifestSha256,
    second.sourceSnapshotManifestSha256,
  );
  assert.equal(first.sourceSnapshotRoot, second.sourceSnapshotRoot);

  const driverMutation = join(
    mutationRoot,
    "current-official-binding.kv",
  );
  writeFileSync(
    driverMutation,
    mutateHashedKv(firstBytes, (lines) => {
      const index = lines.findIndex((line) =>
        line.startsWith("official_driver_sha256=")
      );
      assert.ok(index >= 0);
      lines[index] = `official_driver_sha256=${"0".repeat(64)}`;
    }),
    {flag: "wx", mode: 0o400},
  );
  assert.throws(
    () => validateOfficialCurrentBuildBinding(driverMutation),
    /official_current_driver_binding_drift/,
  );

  console.log(
    "item28 official release required: PASS " +
    `driver=${first.officialDriverSha256} ` +
    `source=${first.sourceSnapshotManifestSha256}`,
  );
} finally {
  rmSync(transactionRoot, {recursive: true});
}
