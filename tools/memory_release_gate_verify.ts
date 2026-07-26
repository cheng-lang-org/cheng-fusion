#!/usr/bin/env bun

import {isAbsolute, resolve} from "node:path";
import {
  memoryReleaseCanonicalJson,
  verifyMemoryReleaseGate,
} from "../src/cheng_memory_release_gate.ts";

function usage(): never {
  throw new Error(
    "usage: bun tools/memory_release_gate_verify.ts --manifest <canonical-evidence.json>",
  );
}

function manifestArgument(argv: readonly string[]): string {
  if (argv.length !== 2 || argv[0] !== "--manifest" ||
      argv[1] === undefined || argv[1].length === 0 ||
      argv[1].startsWith("-")) {
    usage();
  }
  const path = argv[1];
  if (!isAbsolute(path) || resolve(path) !== path) {
    throw new Error("manifest path must be absolute and canonical");
  }
  return path;
}

try {
  const result = verifyMemoryReleaseGate(
    manifestArgument(process.argv.slice(2)),
  );
  process.stdout.write(`${memoryReleaseCanonicalJson({
    case_ids: result.caseIds,
    manifest_sha256: result.manifestSha256,
    schema: result.schema,
    status: result.status,
    targets: result.targets,
  })}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`MEMORY_RELEASE_RED: ${message}\n`);
  process.exitCode = 1;
}
