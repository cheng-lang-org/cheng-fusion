#!/usr/bin/env bun
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {
  CHENG_CURRENT_PARSER_RECEIPT_INGRESS_SCHEMA,
  CHENG_CURRENT_PARSER_RECEIPT_PRODUCTION_COUNT,
  CHENG_CURRENT_PARSER_RECEIPT_REQUIRED_COUNT,
  admitCurrentParserReceipts,
  serializeCurrentParserReceiptIngressReport,
  validateCurrentParserReceiptIngressReport,
  validateCurrentParserReceiptIngressTopology,
  validateFrozenCurrentSourceSnapshotClosure,
  validateOfficialCurrentBuildBindingClosure,
  type CurrentParserReceiptIngressReport,
} from "../src/cheng_current_parser_receipt_ingress.ts";
import {parseUniqueCurrentJson} from "../src/current_schema_json.ts";

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function frame32(bytes: Buffer): Buffer {
  const prefix = Buffer.allocUnsafe(4);
  prefix.writeUInt32BE(bytes.length);
  return Buffer.concat([prefix, bytes]);
}

function frame64(value: number): Buffer {
  const bytes = Buffer.allocUnsafe(8);
  bytes.writeBigUInt64BE(BigInt(value));
  return bytes;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function fshex(path: string): string {
  return Buffer.from(path, "utf8").toString("hex");
}

function renderKv(rows: readonly string[]): Buffer {
  const payload = Buffer.from(`${rows.join("\n")}\n`, "utf8");
  return Buffer.concat([
    payload,
    Buffer.from(`receipt_payload_sha256=${sha256(payload)}\n`, "utf8"),
  ]);
}

function writeHashedKv(path: string, rows: readonly string[]): void {
  writeFileSync(path, renderKv(rows), {mode: 0o400});
}

function rewriteHashedKv(
  path: string,
  mutate: (rows: string[]) => void,
): void {
  const rows = readFileSync(path, "utf8").trimEnd().split("\n");
  assert.match(rows.pop() ?? "", /^receipt_payload_sha256=/);
  mutate(rows);
  chmodSync(path, 0o600);
  writeHashedKv(path, rows);
}

interface OfficialBindingFixture {
  readonly root: string;
  readonly bindingPath: string;
  readonly officialDriverPath: string;
  readonly officialBuildReceiptPath: string;
  readonly installReceiptPath: string;
  readonly compilerReceiptPath: string;
  readonly privateManifestPath: string;
}

function buildOfficialBindingFixture(root: string): OfficialBindingFixture {
  const officialRoot = join(root, "workspace/artifacts/backend_driver");
  const transactionRoot = join(root, "transaction");
  const compilerRoot = join(transactionRoot, "compiler-candidate-evidence");
  const snapshotRoot = join(compilerRoot, "source-snapshot");
  mkdirSync(officialRoot, {recursive: true});
  mkdirSync(snapshotRoot, {recursive: true});

  const officialDriverPath = join(officialRoot, "cheng");
  const officialBuildReceiptPath = join(
    officialRoot,
    "cheng.current-build-receipt.kv",
  );
  const officialSourceBefore = join(transactionRoot, "source-closure.before");
  const officialSourceAfter = join(transactionRoot, "source-closure.after");
  const installReceiptPath = join(transactionRoot, "install-receipt.kv");
  const publisherReceiptPath = join(
    transactionRoot,
    "official/publisher-receipt.kv",
  );
  const compilerCandidatePath = join(compilerRoot, "cheng.compiler-main");
  const compilerReceiptPath = join(
    compilerRoot,
    "cheng.compiler-main.build-receipt.txt",
  );
  const privateManifestPath = join(
    compilerRoot,
    "cheng-source-snapshot.manifest.txt",
  );
  const bindingPath = join(transactionRoot, "current-official-binding.kv");
  mkdirSync(dirname(publisherReceiptPath), {recursive: true});

  writeFileSync(officialDriverPath, "official-driver\n", {mode: 0o500});
  writeFileSync(officialSourceBefore, "current-source-closure\n", {mode: 0o400});
  copyFileSync(officialSourceBefore, officialSourceAfter);
  chmodSync(officialSourceAfter, 0o400);
  writeFileSync(publisherReceiptPath, "publisher\n", {mode: 0o400});
  writeFileSync(compilerCandidatePath, "compiler-candidate\n", {mode: 0o500});
  writeFileSync(privateManifestPath, "private-source-manifest\n", {mode: 0o400});
  writeHashedKv(compilerReceiptPath, [
    `private_source_snapshot_root=${snapshotRoot}`,
    `private_source_snapshot_manifest_path=${privateManifestPath}`,
    `private_source_snapshot_manifest_sha256=${
      sha256("private-source-manifest\n")
    }`,
  ]);

  const driverStat = lstatSync(officialDriverPath, {bigint: true});
  writeHashedKv(installReceiptPath, [
    "schema=cheng.backend2.current_source_official_install_receipt",
    "status=PASS",
    "driver_role=production",
    `source_manifest_path_fshex=${fshex(officialSourceBefore)}`,
    `source_manifest_sha256=${sha256("current-source-closure\n")}`,
    `compiler_candidate_path_fshex=${fshex(compilerCandidatePath)}`,
    `compiler_candidate_sha256=${sha256("compiler-candidate\n")}`,
    `compiler_build_receipt_path_fshex=${fshex(compilerReceiptPath)}`,
    `compiler_build_receipt_sha256=${sha256(
      readFileSync(compilerReceiptPath),
    )}`,
    `bootstrap_summary_sha256=${sha256("summary")}`,
    `bootstrap_fixed_point_sha256=${sha256("fixed")}`,
    `bootstrap_gen2_sha256=${sha256("gen2")}`,
    `bootstrap_gen3_sha256=${sha256("gen3")}`,
    "previous_official_present=false",
    "previous_official_sha256=",
    "previous_official_device=0",
    "previous_official_inode=0",
    `official_path_fshex=${fshex(officialDriverPath)}`,
    `official_sha256=${sha256("official-driver\n")}`,
    `official_device=${driverStat.dev}`,
    `official_inode=${driverStat.ino}`,
    `official_size=${driverStat.size}`,
  ]);
  writeHashedKv(officialBuildReceiptPath, [
    "schema=cheng.backend2.current_source_official_build_receipt",
    "status=PASS",
    "driver_role=production",
    `source_manifest_sha256=${sha256("current-source-closure\n")}`,
    `source_manifest_before_path_fshex=${fshex(officialSourceBefore)}`,
    `source_manifest_after_path_fshex=${fshex(officialSourceAfter)}`,
    `official_sha256=${sha256("official-driver\n")}`,
    `install_receipt_path_fshex=${fshex(installReceiptPath)}`,
    `install_receipt_sha256=${sha256(readFileSync(installReceiptPath))}`,
    `publisher_receipt_path_fshex=${fshex(publisherReceiptPath)}`,
    `publisher_receipt_sha256=${sha256(readFileSync(publisherReceiptPath))}`,
    "source_postflight_status=stable",
    "raw_bytes_fixed_point=true",
  ]);
  writeHashedKv(bindingPath, [
    "schema=cheng.backend2.current_source_official_binding",
    "status=PASS",
    "driver_role=production",
    `official_build_receipt_path_fshex=${fshex(officialBuildReceiptPath)}`,
    `official_build_receipt_sha256=${
      sha256(readFileSync(officialBuildReceiptPath))
    }`,
    `official_source_manifest_path_fshex=${fshex(officialSourceBefore)}`,
    `official_source_manifest_sha256=${sha256("current-source-closure\n")}`,
    `compiler_private_source_manifest_path_fshex=${fshex(
      privateManifestPath,
    )}`,
    `compiler_private_source_manifest_sha256=${
      sha256("private-source-manifest\n")
    }`,
    `official_driver_path_fshex=${fshex(officialDriverPath)}`,
    `official_driver_sha256=${sha256("official-driver\n")}`,
    `final_receipt_source_manifest_sha256=${
      sha256("current-source-closure\n")
    }`,
  ]);
  return {
    root,
    bindingPath,
    officialDriverPath,
    officialBuildReceiptPath,
    installReceiptPath,
    compilerReceiptPath,
    privateManifestPath,
  };
}

function rebindFixtureChain(fixture: OfficialBindingFixture): void {
  rewriteHashedKv(fixture.installReceiptPath, (rows) => {
    const index = rows.findIndex((row) =>
      row.startsWith("compiler_build_receipt_sha256="));
    rows[index] =
      `compiler_build_receipt_sha256=${sha256(
        readFileSync(fixture.compilerReceiptPath),
      )}`;
  });
  rewriteHashedKv(fixture.officialBuildReceiptPath, (rows) => {
    const index = rows.findIndex((row) =>
      row.startsWith("install_receipt_sha256="));
    rows[index] =
      `install_receipt_sha256=${sha256(
        readFileSync(fixture.installReceiptPath),
      )}`;
  });
  rewriteHashedKv(fixture.bindingPath, (rows) => {
    const index = rows.findIndex((row) =>
      row.startsWith("official_build_receipt_sha256="));
    rows[index] =
      `official_build_receipt_sha256=${sha256(
        readFileSync(fixture.officialBuildReceiptPath),
      )}`;
  });
}

const digest = sha256("official-driver");
const sources = [
  {
    path: "/current-generation/a.cheng",
    sha256: sha256("a"),
    byteLength: 1,
  },
  {
    path: "/current-generation/b.cheng",
    sha256: sha256("b"),
    byteLength: 1,
  },
] as const;
const topology = {
  drivers: [
    {
      role: "receipt_driver_a",
      path: "/receipts/receipt_driver_a/cheng",
      sha256: digest,
      byteLength: 16,
    },
    {
      role: "receipt_driver_b",
      path: "/receipts/receipt_driver_b/cheng",
      sha256: digest,
      byteLength: 16,
    },
  ],
  sources,
  receipts: sources.flatMap((source) => [
    {
      path: `/receipts/${source.path.slice(1).replaceAll("/", "_")}.a.json`,
      sourcePath: source.path,
      driverRole: "receipt_driver_a",
      driverSha256: digest,
    },
    {
      path: `/receipts/${source.path.slice(1).replaceAll("/", "_")}.b.json`,
      sourcePath: source.path,
      driverRole: "receipt_driver_b",
      driverSha256: digest,
    },
  ]),
};

{
  const deleted = clone(topology);
  deleted.receipts.pop();
  assert.throws(
    () => validateCurrentParserReceiptIngressTopology(
      deleted,
      sources,
      {sha256: digest, byteLength: 16},
    ),
    /receipt_set_incomplete/,
  );

  const swapped = clone(topology);
  [swapped.receipts[1], swapped.receipts[2]] =
    [swapped.receipts[2]!, swapped.receipts[1]!];
  assert.throws(
    () => validateCurrentParserReceiptIngressTopology(
      swapped,
      sources,
      {sha256: digest, byteLength: 16},
    ),
    /receipt_source_driver_swap/,
  );

  const oldGeneration = clone(topology);
  oldGeneration.sources[0]!.path = "/old-generation/a.cheng";
  assert.throws(
    () => validateCurrentParserReceiptIngressTopology(
      oldGeneration,
      sources,
      {sha256: digest, byteLength: 16},
    ),
    /source_generation_invalid/,
  );

  const driverDrift = clone(topology);
  driverDrift.drivers[1]!.sha256 = sha256("driver-drift");
  assert.throws(
    () => validateCurrentParserReceiptIngressTopology(
      driverDrift,
      sources,
      {sha256: digest, byteLength: 16},
    ),
    /official_driver_drift/,
  );
}

{
  const root = realpathSync(mkdtempSync(
    join(tmpdir(), "cheng-current-official-binding-positive-"),
  ));
  try {
    const fixture = buildOfficialBindingFixture(root);
    const identity = validateOfficialCurrentBuildBindingClosure(
      fixture.bindingPath,
      fixture.officialBuildReceiptPath,
      fixture.officialDriverPath,
    );
    assert.equal(identity.bindingPath, fixture.bindingPath);
    assert.equal(
      identity.sourceSnapshotManifestPath,
      fixture.privateManifestPath,
    );
    assert.equal(identity.officialDriverPath, fixture.officialDriverPath);
    assert.match(identity.bindingSha256, /^[0-9a-f]{64}$/);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
}

for (const [name, mutate, pattern] of [
  [
    "manifest-path",
    (fixture: OfficialBindingFixture) => rewriteHashedKv(
      fixture.bindingPath,
      (rows) => {
        const index = rows.findIndex((row) =>
          row.startsWith("compiler_private_source_manifest_path_fshex="));
        rows[index] =
          `compiler_private_source_manifest_path_fshex=${fshex(
            join(fixture.root, "other.manifest"),
          )}`;
      },
    ),
    /private_source_manifest_binding_drift/,
  ],
  [
    "manifest-hash",
    (fixture: OfficialBindingFixture) => rewriteHashedKv(
      fixture.bindingPath,
      (rows) => {
        const index = rows.findIndex((row) =>
          row.startsWith("compiler_private_source_manifest_sha256="));
        rows[index] =
          `compiler_private_source_manifest_sha256=${sha256("other")}`;
      },
    ),
    /private_source_manifest_binding_drift/,
  ],
  [
    "driver-path",
    (fixture: OfficialBindingFixture) => rewriteHashedKv(
      fixture.bindingPath,
      (rows) => {
        const index = rows.findIndex((row) =>
          row.startsWith("official_driver_path_fshex="));
        rows[index] =
          `official_driver_path_fshex=${fshex(join(fixture.root, "other"))}`;
      },
    ),
    /driver_path_not_authoritative/,
  ],
  [
    "driver-hash",
    (fixture: OfficialBindingFixture) => rewriteHashedKv(
      fixture.bindingPath,
      (rows) => {
        const index = rows.findIndex((row) =>
          row.startsWith("official_driver_sha256="));
        rows[index] = `official_driver_sha256=${sha256("other")}`;
      },
    ),
    /driver_binding_drift/,
  ],
  [
    "binding-self-hash",
    (fixture: OfficialBindingFixture) => {
      chmodSync(fixture.bindingPath, 0o600);
      const bytes = readFileSync(fixture.bindingPath);
      writeFileSync(
        fixture.bindingPath,
        Buffer.concat([bytes.subarray(0, bytes.length - 1), Buffer.from("x\n")]),
      );
    },
    /payload_hash_(?:position_)?invalid/,
  ],
  [
    "candidate-root",
    (fixture: OfficialBindingFixture) => {
      const otherCandidate = join(
        fixture.root,
        "other/cheng.compiler-main",
      );
      mkdirSync(dirname(otherCandidate), {recursive: true});
      writeFileSync(otherCandidate, "compiler-candidate\n", {mode: 0o500});
      rewriteHashedKv(fixture.installReceiptPath, (rows) => {
        const index = rows.findIndex((row) =>
          row.startsWith("compiler_candidate_path_fshex="));
        rows[index] =
          `compiler_candidate_path_fshex=${fshex(otherCandidate)}`;
      });
      rebindFixtureChain(fixture);
    },
    /compiler_evidence_layout_invalid/,
  ],
  [
    "root-escape",
    (fixture: OfficialBindingFixture) => {
      const escaped = join(fixture.root, "escaped.manifest");
      writeFileSync(escaped, "private-source-manifest\n");
      rewriteHashedKv(fixture.compilerReceiptPath, (rows) => {
        const pathIndex = rows.findIndex((row) =>
          row.startsWith("private_source_snapshot_manifest_path="));
        rows[pathIndex] = `private_source_snapshot_manifest_path=${escaped}`;
      });
      rebindFixtureChain(fixture);
    },
    /private_snapshot_layout_invalid/,
  ],
  [
    "private-manifest-drift",
    (fixture: OfficialBindingFixture) => {
      chmodSync(fixture.privateManifestPath, 0o600);
      writeFileSync(fixture.privateManifestPath, "private-source-drifted!\n");
    },
    /private_source_manifest_sha_drift/,
  ],
] as const) {
  const root = realpathSync(mkdtempSync(
    join(tmpdir(), `cheng-current-official-binding-${name}-`),
  ));
  try {
    const fixture = buildOfficialBindingFixture(root);
    mutate(fixture);
    assert.throws(
      () => validateOfficialCurrentBuildBindingClosure(
        fixture.bindingPath,
        fixture.officialBuildReceiptPath,
        fixture.officialDriverPath,
      ),
      pattern,
      name,
    );
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
}

{
  const root = realpathSync(mkdtempSync(
    join(tmpdir(), "cheng-current-official-binding-symlink-"),
  ));
  try {
    const fixture = buildOfficialBindingFixture(root);
    const target = join(root, "private-target.manifest");
    copyFileSync(fixture.privateManifestPath, target);
    rmSync(fixture.privateManifestPath);
    symlinkSync(target, fixture.privateManifestPath);
    assert.throws(() => validateOfficialCurrentBuildBindingClosure(
      fixture.bindingPath,
      fixture.officialBuildReceiptPath,
      fixture.officialDriverPath,
    ));
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
}

const snapshotFixtureRoot = realpathSync(mkdtempSync(
  join(tmpdir(), "cheng-current-source-snapshot-mutation-"),
));
let snapshotDirectories: string[] = [];
try {
  const workspacePathRoot = join(snapshotFixtureRoot, "workspace");
  const snapshotPathRoot = join(snapshotFixtureRoot, "snapshot");
  const manifestPath = join(snapshotFixtureRoot, "snapshot.manifest.txt");
  mkdirSync(workspacePathRoot);
  mkdirSync(snapshotPathRoot);
  const workspaceRoot = realpathSync(workspacePathRoot);
  const snapshotRoot = realpathSync(snapshotPathRoot);
  const relativePaths = [
    "bootstrap/cheng_cold.c",
    "docs/cheng-formal-spec.md",
    "src/core/lang/parser.cheng",
    "src/core/tooling/backend_driver_dispatch_min.cheng",
    "src/core/tooling/compiler_parser_receipt.cheng",
  ].sort((left, right) =>
    Buffer.compare(Buffer.from(left), Buffer.from(right)));
  const rows = relativePaths.map((relativePath, index) => {
    const bytes = Buffer.from(`current-source-${index}\n`);
    const workspacePath = join(workspaceRoot, relativePath);
    const snapshotPath = join(snapshotRoot, relativePath);
    mkdirSync(dirname(workspacePath), {recursive: true});
    mkdirSync(dirname(snapshotPath), {recursive: true});
    writeFileSync(workspacePath, bytes);
    writeFileSync(snapshotPath, bytes);
    chmodSync(snapshotPath, 0o400);
    const stat = lstatSync(snapshotPath, {bigint: true});
    return {
      relativePath,
      bytes,
      sha256: sha256(bytes),
      stat,
    };
  });
  const directories = new Set<string>([snapshotRoot]);
  for (const row of rows) {
    let current = dirname(join(snapshotRoot, row.relativePath));
    while (current.startsWith(snapshotRoot) && current !== dirname(snapshotRoot)) {
      directories.add(current);
      if (current === snapshotRoot) break;
      current = dirname(current);
    }
  }
  for (const directory of [...directories].sort(
    (left, right) => right.length - left.length,
  )) {
    chmodSync(directory, 0o500);
  }
  snapshotDirectories = [...directories];
  const closureParts: Buffer[] = [
    frame32(Buffer.from("cheng.private_source_snapshot")),
    (() => {
      const count = Buffer.allocUnsafe(4);
      count.writeUInt32BE(rows.length);
      return count;
    })(),
  ];
  for (const row of rows) {
    closureParts.push(
      frame32(Buffer.from(row.relativePath)),
      frame32(Buffer.from("compiler_source")),
      Buffer.from(row.sha256, "hex"),
      frame64(row.bytes.length),
    );
  }
  const lines = [
    "schema=cheng.private_source_snapshot",
    "status=frozen",
    `workspace_root=${workspaceRoot}`,
    `snapshot_root=${snapshotRoot}`,
    `entry_count=${rows.length}`,
    `compiler_source_count=${rows.length}`,
    `closure_sha256=${sha256(Buffer.concat(closureParts))}`,
  ];
  rows.forEach((row, index) => {
    lines.push(
      `entry.${index}.relative=${row.relativePath}`,
      `entry.${index}.role=compiler_source`,
      `entry.${index}.sha256=${row.sha256}`,
      `entry.${index}.bytes=${row.bytes.length}`,
      `entry.${index}.device=${row.stat.dev}`,
      `entry.${index}.inode=${row.stat.ino}`,
      `entry.${index}.mode=400`,
      `entry.${index}.mtime_ns=${row.stat.mtimeNs}`,
      `entry.${index}.ctime_ns=${row.stat.ctimeNs}`,
    );
  });
  writeFileSync(manifestPath, lines.join("\n") + "\n", {mode: 0o400});
  const frozen = validateFrozenCurrentSourceSnapshotClosure(
    manifestPath,
    workspaceRoot,
    snapshotRoot,
  );
  assert.equal(frozen.entryCount, rows.length);
  writeFileSync(
    join(workspaceRoot, "src/core/lang/parser.cheng"),
    "source-drift\n",
  );
  assert.throws(
    () => validateFrozenCurrentSourceSnapshotClosure(
      manifestPath,
      workspaceRoot,
      snapshotRoot,
    ),
    /source_snapshot_workspace_drift:src\/core\/lang\/parser\.cheng/,
  );
} finally {
  for (const directory of snapshotDirectories.sort(
    (left, right) => left.length - right.length,
  )) {
    chmodSync(directory, 0o700);
  }
  rmSync(snapshotFixtureRoot, {recursive: true, force: true});
}

const hardRed: CurrentParserReceiptIngressReport = {
  schema: CHENG_CURRENT_PARSER_RECEIPT_INGRESS_SCHEMA,
  status: "HARD_RED",
  reason: "receipt_deleted",
  officialCurrentBuildBindingPath: "/tmp/current-official-binding.kv",
  officialCurrentBuildBindingSha256: "",
  sourceSnapshotManifestPath: "",
  sourceSnapshotManifestSha256: "",
  sourceSnapshotClosureSha256: "",
  officialDriverPath: "",
  officialDriverSha256: "",
  harnessManifestPath: "/tmp/parser-production-receipt-harness.json",
  harnessManifestSha256: "",
  productionCount: CHENG_CURRENT_PARSER_RECEIPT_PRODUCTION_COUNT,
  requiredObligationCount: CHENG_CURRENT_PARSER_RECEIPT_REQUIRED_COUNT,
  witnessedObligationCount: 0,
  missingObligationCount: CHENG_CURRENT_PARSER_RECEIPT_REQUIRED_COUNT,
  receiptCount: 0,
  admittedMapSha256: "",
};
assert.equal(
  parseUniqueCurrentJson(
    serializeCurrentParserReceiptIngressReport(hardRed),
    "current_ingress_report",
  ).status,
  "HARD_RED",
);
assert.throws(
  () => validateCurrentParserReceiptIngressReport({
    ...hardRed,
    witnessedObligationCount: 1,
    missingObligationCount:
      CHENG_CURRENT_PARSER_RECEIPT_REQUIRED_COUNT - 1,
  }),
  /hard_red_must_not_witness/,
);
assert.throws(
  () => parseUniqueCurrentJson(
    JSON.stringify({...hardRed, compatibilityReader: false}),
    "current_ingress_report",
  ),
  /forbidden_compatibility_key/,
);

const unavailable = await admitCurrentParserReceipts({
  officialCurrentBuildBindingPath: "/tmp/current-official-binding.kv",
  harnessManifestPath: "/tmp/parser-production-receipt-harness.json",
});
assert.equal(unavailable.report.status, "HARD_RED");
assert.equal(unavailable.report.witnessedObligationCount, 0);
assert.equal(
  unavailable.report.missingObligationCount,
  CHENG_CURRENT_PARSER_RECEIPT_REQUIRED_COUNT,
);
assert.equal(unavailable.admittedMapJson, undefined);

console.log(
  "item25 current parser receipt ingress: PASS " +
  "binding/private-root/manifest/driver/source drift hard-red",
);
