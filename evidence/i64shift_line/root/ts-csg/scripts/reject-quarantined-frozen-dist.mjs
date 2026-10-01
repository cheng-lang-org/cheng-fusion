import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = realpathSync(join(dirname(fileURLToPath(import.meta.url)), ".."));
const quarantinePath = join(packageRoot, "frozen-dist-quarantine.json");

function fail(reason) {
  throw new Error(`ts_csg_frozen_dist_quarantine:${reason}`);
}

function readStableRegular(path, expectedSize, expectedSha256, label) {
  const descriptor = openSync(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n) fail(`${label}_identity_invalid`);
    const raw = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.mode !== after.mode ||
      before.nlink !== after.nlink ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs
    ) {
      fail(`${label}_changed_during_read`);
    }
    const digest = createHash("sha256").update(raw).digest("hex");
    if (raw.length !== expectedSize || digest !== expectedSha256) {
      fail(`${label}_bytes_mismatch`);
    }
    return raw;
  } finally {
    closeSync(descriptor);
  }
}

function verifyQuarantine() {
  const raw = readFileSync(quarantinePath, "utf8");
  let quarantine;
  try {
    quarantine = JSON.parse(raw);
  } catch {
    fail("manifest_json_invalid");
  }
  const expectedKeys = [
    "schema",
    "status",
    "authority",
    "publishable",
    "reason",
    "frozen_manifest",
    "offending_files",
    "replacement_authority",
    "unquarantine_rule",
  ];
  if (
    JSON.stringify(Object.keys(quarantine)) !== JSON.stringify(expectedKeys) ||
    quarantine.schema !== "csg_core_ts_frozen_dist_quarantine" ||
    quarantine.status !== "quarantined_non_publishable" ||
    quarantine.authority !== "none" ||
    quarantine.publishable !== false ||
    quarantine.reason !== "ts_frozen_second_identity_orchestrator" ||
    quarantine.unquarantine_rule !==
      "new_frozen_bytes_require_source_freeze_provenance"
  ) {
    fail("manifest_contract_invalid");
  }
  const manifest = quarantine.frozen_manifest;
  const offenders = quarantine.offending_files;
  const replacement = quarantine.replacement_authority;
  if (
    !manifest ||
    JSON.stringify(Object.keys(manifest)) !==
      JSON.stringify(["path", "size", "sha256"]) ||
    !Array.isArray(offenders) ||
    offenders.length !== 1 ||
    JSON.stringify(Object.keys(offenders[0])) !==
      JSON.stringify(["path", "size", "sha256"]) ||
    !replacement ||
    JSON.stringify(Object.keys(replacement)) !==
      JSON.stringify(["kind", "entrypoint"]) ||
    replacement.kind !== "pure_cheng" ||
    replacement.entrypoint !== "../tools/csg"
  ) {
    fail("manifest_binding_invalid");
  }
  readStableRegular(
    join(packageRoot, manifest.path),
    manifest.size,
    manifest.sha256,
    "frozen_manifest",
  );
  readStableRegular(
    join(packageRoot, offenders[0].path),
    offenders[0].size,
    offenders[0].sha256,
    "offending_file",
  );
}

try {
  verifyQuarantine();
  process.stderr.write(
    "ts_csg_frozen_dist_quarantine:publish_rejected:ts_frozen_second_identity_orchestrator\n",
  );
  process.exitCode = 1;
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message.replace(/[\r\n]+/g, "|")}\n`);
  process.exitCode = 1;
}
