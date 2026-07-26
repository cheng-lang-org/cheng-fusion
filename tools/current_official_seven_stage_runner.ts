#!/usr/bin/env bun
import {linkSync, unlinkSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  runCurrentOfficialSevenStageAdmission,
  serializeCurrentOfficialSevenStageRunnerReport,
} from "../src/cheng_current_official_seven_stage_runner.ts";

interface Args {
  officialCurrentBuildBindingPath: string;
  harnessManifestPath: string;
  executionPolicyPath: string;
  runnerManifestPath: string;
  reportOutPath?: string;
}

function parseArgs(argv: readonly string[]): Args {
  let officialCurrentBuildBindingPath: string | undefined;
  let harnessManifestPath: string | undefined;
  let executionPolicyPath: string | undefined;
  let runnerManifestPath: string | undefined;
  let reportOutPath: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (![
      "--official-current-build-binding",
      "--parser-harness-manifest",
      "--execution-policy",
      "--runner-manifest",
      "--report-out",
    ].includes(flag ?? "") || value === undefined || value.startsWith("--")) {
      throw new Error(`current_official_runner_argument_invalid:${flag ?? ""}`);
    }
    index += 1;
    if (flag === "--official-current-build-binding") {
      officialCurrentBuildBindingPath = resolve(value);
    } else if (flag === "--parser-harness-manifest") {
      harnessManifestPath = resolve(value);
    } else if (flag === "--execution-policy") {
      executionPolicyPath = resolve(value);
    } else if (flag === "--runner-manifest") {
      runnerManifestPath = resolve(value);
    } else {
      reportOutPath = resolve(value);
    }
  }
  if (officialCurrentBuildBindingPath === undefined ||
      harnessManifestPath === undefined ||
      executionPolicyPath === undefined ||
      runnerManifestPath === undefined) {
    throw new Error("current_official_runner_required_input_missing");
  }
  return {
    officialCurrentBuildBindingPath,
    harnessManifestPath,
    executionPolicyPath,
    runnerManifestPath,
    reportOutPath,
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
const report = await runCurrentOfficialSevenStageAdmission({
  officialCurrentBuildBindingPath:
    args.officialCurrentBuildBindingPath,
  harnessManifestPath: args.harnessManifestPath,
  executionPolicyPath: args.executionPolicyPath,
  runnerManifestPath: args.runnerManifestPath,
});
const json = serializeCurrentOfficialSevenStageRunnerReport(report);
if (args.reportOutPath !== undefined) {
  publishNewFile(args.reportOutPath, json);
}
process.stdout.write(json);
if (report.status !== "ADMITTED") process.exit(1);
