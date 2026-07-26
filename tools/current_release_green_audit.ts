#!/usr/bin/env bun
import {
  linkSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import {
  assembleCurrentReleaseManifest,
  auditCurrentReleaseGreen,
  serializeCurrentReleaseGreenAuditReport,
  type CurrentReleaseGreenAuditReport,
} from "../src/cheng_current_release_green_audit.ts";

interface CommonArgs {
  officialCurrentBuildBindingPath: string;
  harnessManifestPath: string;
  executionPolicyPath: string;
  runnerManifestPath: string;
  releaseManifestPath: string;
  reportOutPath?: string;
}

interface AssembleArgs extends CommonArgs {
  publisherReceiptPath: string;
}

function parseArgs(
  argv: readonly string[],
  command: "audit" | "assemble",
): CommonArgs | AssembleArgs {
  const values = new Map<string, string>();
  const allowed = new Set([
    "--official-current-build-binding",
    "--parser-harness-manifest",
    "--execution-policy",
    "--runner-manifest",
    "--release-manifest",
    "--report-out",
    ...(command === "assemble" ? ["--publisher-receipt"] : []),
  ]);
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      flag === undefined ||
      value === undefined ||
      !allowed.has(flag) ||
      value.startsWith("--") ||
      values.has(flag)
    ) {
      throw new Error(`current_release_argument_invalid:${flag ?? ""}`);
    }
    values.set(flag, resolve(value));
  }
  const required = [
    "--official-current-build-binding",
    "--parser-harness-manifest",
    "--execution-policy",
    "--runner-manifest",
    "--release-manifest",
    ...(command === "assemble" ? ["--publisher-receipt"] : []),
  ];
  if (required.some((flag) => !values.has(flag))) {
    throw new Error("current_release_required_input_missing");
  }
  const common: CommonArgs = {
    officialCurrentBuildBindingPath: values.get(
      "--official-current-build-binding",
    )!,
    harnessManifestPath: values.get("--parser-harness-manifest")!,
    executionPolicyPath: values.get("--execution-policy")!,
    runnerManifestPath: values.get("--runner-manifest")!,
    releaseManifestPath: values.get("--release-manifest")!,
    reportOutPath: values.get("--report-out"),
  };
  return command === "assemble"
    ? {
        ...common,
        publisherReceiptPath: values.get("--publisher-receipt")!,
      }
    : common;
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

function isWithin(root: string, path: string): boolean {
  const fromRoot = relative(root, path);
  return (
    fromRoot === "" ||
    (fromRoot !== ".." &&
      !fromRoot.startsWith(`..${sep}`) &&
      !isAbsolute(fromRoot))
  );
}

async function publishVerifiedManifest(
  args: AssembleArgs,
  manifestJson: string,
): Promise<CurrentReleaseGreenAuditReport> {
  const publisherRoot = dirname(args.publisherReceiptPath);
  if (
    args.releaseManifestPath !== resolve(args.releaseManifestPath) ||
    basename(args.releaseManifestPath) !== "current-release-manifest.json" ||
    isWithin(publisherRoot, args.releaseManifestPath)
  ) {
    throw new Error("current_release_manifest_output_path_invalid");
  }
  if (args.reportOutPath !== undefined) {
    if (isWithin(publisherRoot, args.reportOutPath)) {
      throw new Error("current_release_report_output_inside_publisher");
    }
  }
  const parent = dirname(args.releaseManifestPath);
  if (realpathSync.native(parent) !== parent) {
    throw new Error("current_release_manifest_output_parent_invalid");
  }
  let outputExists = true;
  try {
    lstatSync(args.releaseManifestPath);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      outputExists = false;
    } else {
      throw error;
    }
  }
  if (outputExists) {
    throw new Error("current_release_manifest_output_exists");
  }
  const stageRoot = realpathSync.native(
    mkdtempSync(join(parent, ".current-release-manifest-stage-")),
  );
  const stagedManifest = join(stageRoot, "current-release-manifest.json");
  try {
    writeFileSync(stagedManifest, manifestJson, {
      flag: "wx",
      mode: 0o400,
    });
    const report = await auditCurrentReleaseGreen({
      officialCurrentBuildBindingPath:
        args.officialCurrentBuildBindingPath,
      harnessManifestPath: args.harnessManifestPath,
      executionPolicyPath: args.executionPolicyPath,
      runnerManifestPath: args.runnerManifestPath,
      releaseManifestPath: stagedManifest,
    });
    if (report.status !== "GREEN") {
      throw new Error(`current_release_assembled_manifest_red:${report.reason}`);
    }
    linkSync(stagedManifest, args.releaseManifestPath);
    unlinkSync(stagedManifest);
    const outputStat = lstatSync(args.releaseManifestPath, {bigint: true});
    if (
      !outputStat.isFile() ||
      outputStat.isSymbolicLink() ||
      outputStat.nlink !== 1n ||
      !readFileSync(args.releaseManifestPath).equals(
        Buffer.from(manifestJson, "utf8"),
      )
    ) {
      throw new Error("current_release_manifest_publication_drift");
    }
    return report;
  } finally {
    rmSync(stageRoot, {recursive: true, force: true});
  }
}

const argv = process.argv.slice(2);
const command = argv[0] === "assemble" ? "assemble" : "audit";
const args = parseArgs(
  command === "assemble" ? argv.slice(1) : argv,
  command,
);
let report: CurrentReleaseGreenAuditReport;
if (command === "assemble") {
  const assemblyArgs = args as AssembleArgs;
  const assembly = await assembleCurrentReleaseManifest({
    officialCurrentBuildBindingPath:
      assemblyArgs.officialCurrentBuildBindingPath,
    harnessManifestPath: assemblyArgs.harnessManifestPath,
    executionPolicyPath: assemblyArgs.executionPolicyPath,
    runnerManifestPath: assemblyArgs.runnerManifestPath,
    publisherReceiptPath: assemblyArgs.publisherReceiptPath,
  });
  report = await publishVerifiedManifest(
    assemblyArgs,
    assembly.manifestJson,
  );
} else {
  report = await auditCurrentReleaseGreen({
    officialCurrentBuildBindingPath: args.officialCurrentBuildBindingPath,
    harnessManifestPath: args.harnessManifestPath,
    executionPolicyPath: args.executionPolicyPath,
    runnerManifestPath: args.runnerManifestPath,
    releaseManifestPath: args.releaseManifestPath,
  });
}
const json = serializeCurrentReleaseGreenAuditReport(report);
if (args.reportOutPath !== undefined) {
  publishNewFile(args.reportOutPath, json);
}
process.stdout.write(json);
if (report.status !== "GREEN") process.exit(1);
