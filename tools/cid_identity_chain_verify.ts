#!/usr/bin/env bun

import {resolve} from "node:path";
import {canonicalJson, verifyCidEvidence} from "../src/cheng_cid_identity_chain_evidence.ts";

function usage(): never {
  throw new Error("usage: bun tools/cid_identity_chain_verify.ts --manifest <canonical-evidence.json>");
}

function manifestArgument(argv: readonly string[]): string {
  if (argv.length !== 2 || argv[0] !== "--manifest" || argv[1].length === 0 || argv[1].startsWith("-")) usage();
  return resolve(argv[1]);
}

try {
  const result = verifyCidEvidence(manifestArgument(Bun.argv.slice(2)));
  process.stdout.write(canonicalJson({
    candidate_sha256: result.candidateSha256,
    case_ids: result.caseIds,
    manifest_sha256: result.manifestSha256,
    status: result.status,
  }) + "\n");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`CID_RED: ${message}\n`);
  process.exitCode = 1;
}
