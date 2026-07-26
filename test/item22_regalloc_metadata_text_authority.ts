#!/usr/bin/env bun
import assert from "node:assert/strict";
import {readFileSync, realpathSync} from "node:fs";
import {join} from "node:path";

const CHENG_ROOT = realpathSync.native(
  process.env.CHENG_TOOLCHAIN_ROOT ||
  process.env.CHENG_ROOT ||
  "/Users/lbcheng/cheng-lang",
);

function functionSource(source: string, name: string) {
  const start = source.indexOf(`fn ${name}(`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const next = source.indexOf("\nfn ", start + name.length + 4);
  return source.slice(start, next < 0 ? source.length : next);
}

function authorityIssues(authority: string,
                         primary: string,
                         backend2: string) {
  const issues: string[] = [];
  if (/\.len\s*[><]=?\s*\d+/.test(authority) ||
      /\.len\s*[><]=?\s*\d+/.test(primary) ||
      /\.len\s*[><]=?\s*\d+/.test(backend2)) {
    issues.push("fixed_metadata_length_cap_present");
  }
  if (!/\bfor\s+byteIndex\s+in\s+0\.\.<byteCount\s*:/.test(authority) ||
      !/\btext\s*\[\s*byteIndex\s*\]/.test(authority) ||
      !/\bscannedBytes\s*!=\s*byteCount\b/.test(authority)) {
    issues.push("complete_byte_scan_missing");
  }
  if (!/\bscannedBytes\s*<\s*0\s*\|\|\s*scannedBytes\s*>=\s*2147483647\b/.test(authority) ||
      !/panic\s*\(\s*"metadata text: byte scan index overflow"\s*\)/.test(authority)) {
    issues.push("checked_index_overflow_hard_fail_missing");
  }
  if (!/\bvalue\s*<\s*Char\(32\)\s*\|\|\s*value\s*>\s*Char\(126\)/.test(authority)) {
    issues.push("metadata_byte_legality_check_missing");
  }
  const canonicalDelegate =
    /\breturn\s+metadataauthority\.MetadataTextStable\s*\(\s*text\s*\)/;
  if (!canonicalDelegate.test(primary)) {
    issues.push("primary_canonical_delegate_missing");
  }
  if (!canonicalDelegate.test(backend2)) {
    issues.push("backend2_canonical_delegate_missing");
  }
  return issues;
}

const authorityPath = join(
  CHENG_ROOT,
  "src/core/backend/metadata_text_authority.cheng",
);
const primaryPath = join(
  CHENG_ROOT,
  "src/core/backend/primary_object_plan.cheng",
);
const backend2Path = join(
  CHENG_ROOT,
  "src/core/backend2/backend2_lower_util.cheng",
);
const preflightPath = join(
  import.meta.dir,
  "../src/cheng_regalloc_preflight_m9022.ts",
);
const authoritySource = readFileSync(authorityPath, "utf8");
const primarySource = functionSource(
  readFileSync(primaryPath, "utf8"),
  "PrimaryObjectMetadataTextStable",
);
const backend2Source = functionSource(
  readFileSync(backend2Path, "utf8"),
  "B2PrimaryObjectMetadataTextStable",
);
assert.deepEqual(
  authorityIssues(authoritySource, primarySource, backend2Source),
  [],
);
const preflightSource = readFileSync(preflightPath, "utf8");
assert.match(
  preflightSource,
  /POST_SEAL_FIXED_METADATA_TEXT_FUNCTIONS[\s\S]*"MetadataTextStable"/,
);
assert.match(
  preflightSource,
  /POST_SEAL_FIXED_METADATA_TEXT_FILES[\s\S]*"src\/core\/backend\/metadata_text_authority\.cheng"/,
);
assert.match(
  preflightSource,
  /POST_SEAL_FIXED_METADATA_TEXT_FILES\.has\(node\.file\)[\s\S]*POST_SEAL_FIXED_METADATA_TEXT_FUNCTIONS\.has\(node\.name\)/,
);

const capMutation = authoritySource.replace(
  "    let byteCount = text.len",
  "    if text.len > 1024:\n        return false\n    let byteCount = text.len",
);
assert.ok(
  authorityIssues(capMutation, primarySource, backend2Source).includes(
    "fixed_metadata_length_cap_present",
  ),
);

const partialScanMutation = authoritySource.replace(
  "0..<byteCount",
  "0..<1",
);
assert.ok(
  authorityIssues(partialScanMutation, primarySource, backend2Source).includes(
    "complete_byte_scan_missing",
  ),
);

const overflowMutation = authoritySource.replace(
  "    if scannedBytes < 0 || scannedBytes >= 2147483647:\n" +
  "        panic(\"metadata text: byte scan index overflow\")\n",
  "",
);
assert.ok(
  authorityIssues(overflowMutation, primarySource, backend2Source).includes(
    "checked_index_overflow_hard_fail_missing",
  ),
);

const backendDivergenceMutation = backend2Source.replace(
  "metadataauthority.MetadataTextStable(text)",
  "text.len <= 1024",
);
assert.ok(
  authorityIssues(authoritySource, primarySource, backendDivergenceMutation)
    .includes("backend2_canonical_delegate_missing"),
);

console.log("item22_regalloc_metadata_text_authority: PASS");
