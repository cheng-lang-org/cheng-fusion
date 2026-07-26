#!/usr/bin/env bun
import {linkSync, unlinkSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  admitCurrentParserReceipts,
  serializeCurrentParserReceiptIngressReport,
} from "../src/cheng_current_parser_receipt_ingress.ts";

interface Args {
  officialCurrentBuildBindingPath: string;
  harnessManifestPath: string;
  reportOutPath?: string;
  mapOutPath?: string;
}

function parseArgs(argv: readonly string[]): Args {
  let officialCurrentBuildBindingPath: string | undefined;
  let harnessManifestPath: string | undefined;
  let reportOutPath: string | undefined;
  let mapOutPath: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (![
      "--official-current-build-binding",
      "--harness-manifest",
      "--report-out",
      "--map-out",
    ].includes(flag ?? "") || value === undefined || value.startsWith("--")) {
      throw new Error(`current_ingress_argument_invalid:${flag ?? ""}`);
    }
    index += 1;
    if (flag === "--official-current-build-binding") {
      officialCurrentBuildBindingPath = resolve(value);
    } else if (flag === "--harness-manifest") {
      harnessManifestPath = resolve(value);
    } else if (flag === "--report-out") {
      reportOutPath = resolve(value);
    } else {
      mapOutPath = resolve(value);
    }
  }
  if (officialCurrentBuildBindingPath === undefined ||
      harnessManifestPath === undefined) {
    throw new Error("current_ingress_required_input_missing");
  }
  return {
    officialCurrentBuildBindingPath,
    harnessManifestPath,
    reportOutPath,
    mapOutPath,
  };
}

function publishNewFile(path: string, bytes: string): void {
  const staged = `${path}.staged-${process.pid}`;
  writeFileSync(staged, bytes, {flag: "wx", mode: 0o400});
  try {
    linkSync(staged, path);
  } finally {
    unlinkSync(staged);
  }
}

const args = parseArgs(process.argv.slice(2));
const result = await admitCurrentParserReceipts({
  officialCurrentBuildBindingPath: args.officialCurrentBuildBindingPath,
  harnessManifestPath: args.harnessManifestPath,
});
const reportJson = serializeCurrentParserReceiptIngressReport(result.report);
if (args.reportOutPath !== undefined) {
  publishNewFile(args.reportOutPath, reportJson);
}
if (args.mapOutPath !== undefined) {
  if (result.report.status !== "ADMITTED" ||
      result.admittedMapJson === undefined) {
    throw new Error("current_ingress_map_output_requires_admission");
  }
  publishNewFile(args.mapOutPath, result.admittedMapJson);
}
process.stdout.write(reportJson);
if (result.report.status !== "ADMITTED") process.exit(1);
