#!/usr/bin/env node
// Campaign C / Lane S equivalence smoke + on-disk part verifier.
//
// Two modes:
//  1. Default (no args): synthetic suite over splitGeneratedChengSourceIntoParts
//     covering attributed fns, indented var continuations, comment runs, EOF
//     comment tails, skewed item sizes and import-less sources. Every case is
//     judged byte-for-byte by EXTERNAL tools (cmp -s and git diff --no-index
//     --quiet); bare diff is never used to decide equality.
//  2. --verify-out-dir <dir> [--monolith <file>]: reads
//     <dir>/scene-source-parts.manifest.json, re-hashes every part file on disk
//     against the manifest sha256 entries, reconstructs the merged part-body
//     text from DISK bytes only, and — when a monolith source is still present
//     — proves merge == monolith-minus-leading-imports via external cmp +
//     git diff --no-index before the scratch files are deleted.
//
// Scratch files live in a pid-suffixed directory under ts-csg/tmp that this
// process removes in finally (task-lifetime bound, nothing survives exit).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { splitGeneratedChengSourceIntoParts } from "./scene-runtime-smoke-source.mjs";

export const sceneSourcePartsManifestName = "scene-source-parts.manifest.json";

function sha256Hex(text) {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

function runTool(tool, args) {
  const result = spawnSync(tool, args, { encoding: "utf8" });
  if (result.error) throw new Error(`${tool} failed to start: ${result.error.message}`);
  return {
    tool,
    args,
    status: result.status,
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
  };
}

function writeScratchPair(scratchDir, expectedSansImports, mergedFromParts) {
  const expectedPath = join(scratchDir, "expected-sans-imports.txt");
  const mergedPath = join(scratchDir, "merged-from-parts.txt");
  writeFileSync(expectedPath, expectedSansImports, "utf8");
  writeFileSync(mergedPath, mergedFromParts, "utf8");
  return { expectedPath, mergedPath };
}

function externalByteEquality(scratchDir, expectedSansImports, mergedFromParts) {
  const { expectedPath, mergedPath } = writeScratchPair(scratchDir, expectedSansImports, mergedFromParts);
  const cmp = runTool("cmp", ["-s", expectedPath, mergedPath]);
  const gitDiff = runTool("git", ["diff", "--no-index", "--quiet", expectedPath, mergedPath]);
  return { cmp, gitDiff, expectedPath, mergedPath };
}

// Reads parts back from disk using ONLY manifest metadata (header line counts),
// so any post-write mutation of part bodies changes the reconstruction.
export function verifySplitPartsAgainstMonolith({ outDir, monolithPath = "", scratchRoot }) {
  const manifestPath = join(outDir, sceneSourcePartsManifestName);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  mkdirSync(scratchRoot, { recursive: true });
  assert.equal(manifest.schema, "unimaker.scene-runtime-source-parts.v1", "manifest schema mismatch");
  const failures = [];
  const hashReceipts = [];
  let mergedBodyTexts = [];
  for (const entry of manifest.parts) {
    const abs = join(outDir, entry.fileName);
    const diskBytes = readFileSync(abs);
    const diskSha = createHash("sha256").update(diskBytes).digest("hex");
    const shasum = runTool("shasum", ["-a", "256", abs]);
    const shasumOk = shasum.status === 0 && shasum.stdout.trim().split(/\s+/)[0] === entry.fileSha256;
    const nodeHashOk = diskSha === entry.fileSha256;
    const byteLenOk = diskBytes.length === entry.fileByteLength;
    if (!shasumOk || !nodeHashOk || !byteLenOk) {
      failures.push(`${entry.fileName}: shasum=${shasumOk} nodeHash=${nodeHashOk} byteLen=${byteLenOk}`);
    }
    hashReceipts.push({ file: entry.fileName, sha256: entry.fileSha256, bytes: diskBytes.length });
    const diskLines = diskBytes.toString("utf8").split("\n");
    if (diskLines[entry.headerLineCount - 1] === undefined || diskLines.length < entry.headerLineCount) {
      failures.push(`${entry.fileName}: fewer lines than declared headerLineCount`);
      mergedBodyTexts.push("");
      continue;
    }
    const headerOk =
      JSON.stringify(diskLines.slice(0, entry.headerLineCount)) === JSON.stringify(entry.headerLines);
    const firstBodyOk = diskLines[entry.headerLineCount] === entry.bodyFirstLine;
    const lastBodyOk = diskLines[diskLines.length - 1] === entry.bodyLastLine;
    if (!headerOk || !firstBodyOk || !lastBodyOk) {
      failures.push(`${entry.fileName}: header=${headerOk} firstBody=${firstBodyOk} lastBody=${lastBodyOk}`);
    }
    mergedBodyTexts.push(diskLines.slice(entry.headerLineCount).join("\n"));
  }
  const mergedFromDisk = mergedBodyTexts.join("\n");

  let evidence = null;
  if (monolithPath !== "") {
    const monolithLines = readFileSync(monolithPath, "utf8").split("\n");
    let idx = 0;
    while (idx < monolithLines.length && /^import /.test(monolithLines[idx])) idx += 1;
    const expectedSansImports = monolithLines.slice(idx).join("\n");
    evidence = externalByteEquality(scratchRoot, expectedSansImports, mergedFromDisk);
    if (evidence.cmp.status !== 0) failures.push(`cmp rc=${evidence.cmp.status}`);
    if (evidence.gitDiff.status !== 0) failures.push(`git diff --no-index rc=${evidence.gitDiff.status}`);
  } else if (manifest.sansLeadingImportsSha256 !== undefined) {
    if (sha256Hex(mergedFromDisk) !== manifest.sansLeadingImportsSha256) {
      failures.push("merged-from-disk sha256 != manifest.sansLeadingImportsSha256");
    }
  }
  rmSync(scratchRoot, { recursive: true, force: true });
  if (failures.length > 0) {
    throw new Error(`split-part verification failed:\n  ${failures.join("\n  ")}`);
  }
  return {
    manifest,
    partHashes: hashReceipts,
    cmpRc: evidence ? evidence.cmp.status : null,
    gitDiffRc: evidence ? evidence.gitDiff.status : null,
  };
}

const syntheticCases = [
  {
    name: "typical-runtime-shape",
    text: [
      'import cheng/.tmp-exec/unimaker_part_a as modA',
      'import cheng/.tmp-exec/unimaker_part_b as modB',
      "",
      "// leading banner",
      'var GREETING: str =',
      '    "hello world"',
      "@exportc(\"host_tick\")",
      "fn tick(dt: int64) =",
      "    GREETING = \"tick\"",
      "    return",
      "fn helper(x: int64): int64 =",
      "    return x + 1",
      "// trailing comment tail",
      "// second trailing line",
      "",
    ].join("\n"),
    options: { moduleStemBase: "unimaker_react_scene_runtime", targetPartBytes: 32 },
  },
  {
    name: "single-line-no-imports",
    text: 'fn only() =\n    return\n',
    options: { targetPartBytes: 16 },
  },
  {
    name: "skewed-giant-last-item",
    text: [
      "import some/mod as m",
      "fn small_one(): int64 =",
      "    return 1",
      "fn giant() =",
      ...Array.from({ length: 400 }, (_, i) => `    // filler ${i}`),
      "",
    ].join("\n"),
    options: { targetPartBytes: 64 },
  },
];

function runSyntheticSuite() {
  const scratchRootBase = mkdtempSync(join(process.cwd(), "tmp", "split-lane-smoke-"));
  try {
    let checked = 0;
    for (const testCase of syntheticCases) {
      const split = splitGeneratedChengSourceIntoParts(testCase.text, testCase.options);
      assert.ok(split.partCount >= 1);
      const scratchDir = mkdtempSync(join(scratchRootBase, `${testCase.name}-`));
      mkdirSync(scratchDir, { recursive: true });
      const outPartDir = join(scratchDir, "parts");
      mkdirSync(outPartDir, { recursive: true });
      const writtenFiles = [];
      for (const part of split.parts) {
        const abs = join(outPartDir, part.fileName);
        writeFileSync(abs, part.fileText, "utf8");
        writtenFiles.push(part.fileName);
      }
      // Round-trip through the disk-only reader by faking a manifest: reuse the
      // internal already-validated shapes so verifySplitPartsAgainstMonolith
      // exercises exactly the code path the one-click wiring uses.
      const monolithAbs = join(scratchDir, "monolith.cheng");
      writeFileSync(monolithAbs, testCase.text, "utf8");
      const manifestEntries = split.parts.map((part) => ({
        fileName: part.fileName,
        fileSha256: part.fileSha256,
        fileByteLength: part.fileByteLength,
        headerLineCount: part.headerLineCount,
        headerLines: part.headerLines,
        bodyFirstLine: part.bodyFirstLine,
        bodyLastLine: part.bodyLastLine,
      }));
      // Inline check without writing the manifest twice: call verifier pieces
      // by writing a real manifest and pointing the reader at it.
      const manifestPath = join(outPartDir, sceneSourcePartsManifestName);
      const linesTotal = testCase.text.split("\n").length;
      writeFileSync(manifestPath, JSON.stringify({
        schema: "unimaker.scene-runtime-source-parts.v1",
        partCount: split.partCount,
        sansLeadingImportsSha256: split.sansLeadingImportsSha256,
        parts: manifestEntries,
      }, null, 2) + "\n", "utf8");
      void linesTotal;
      const receipt = verifySplitPartsAgainstMonolith({
        outDir: outPartDir,
        monolithPath: monolithAbs,
        scratchRoot: join(scratchDir, "pair"),
      });
      assert.equal(receipt.cmpRc, 0, `${testCase.name}: cmp must report rc=0`);
      assert.equal(receipt.gitDiffRc, 0, `${testCase.name}: git diff --no-index must report rc=0`);
      console.log(`PASS ${testCase.name} parts=${split.partCount} cmp=0 gitdiff=0`);
      checked += 1;
      rmSync(scratchDir, { recursive: true, force: true });
    }
    console.log(`s-split-equivalence-smoke ok (${checked} cases)`);
    return 0;
  } finally {
    rmSync(scratchRootBase, { recursive: true, force: true });
  }
}

function main() {
  const argv = process.argv.slice(2);
  const flag = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : "";
  };
  const verifyOutDir = flag("--verify-out-dir");
  if (verifyOutDir !== "") {
    const scratchRootBase = mkdtempSync(join(process.cwd(), "tmp", "split-lane-verify-"));
    try {
      const receipt = verifySplitPartsAgainstMonolith({
        outDir: verifyOutDir,
        monolithPath: flag("--monolith"),
        scratchRoot: scratchRootBase,
      });
      console.log(JSON.stringify({ ok: true, partCount: receipt.manifest.partCount, cmpRc: receipt.cmpRc, gitDiffRc: receipt.gitDiffRc, partHashes: receipt.partHashes }, null, 2));
      return 0;
    } catch (err) {
      console.error(String(err?.message ?? err));
      return 1;
    } finally {
      rmSync(scratchRootBase, { recursive: true, force: true });
    }
  }
  return runSyntheticSuite();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
