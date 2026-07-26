#!/usr/bin/env bun
import { linkSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  runFreshMcpTypeArenaExecution,
  serializeFreshMcpTypeArenaExecutionReport,
} from "../src/cheng_fusion_fresh_mcp_type_arena_execution.ts";

function parseReportOut(argv: readonly string[]): string | undefined {
  if (argv.length === 0) return undefined;
  if (
    argv.length !== 2 ||
    argv[0] !== "--report-out" ||
    argv[1] === undefined ||
    argv[1].startsWith("--")
  ) {
    throw new Error("fresh_type_arena_argument_invalid");
  }
  return resolve(argv[1]);
}

function publishNewFile(path: string, bytes: string): void {
  const staged = `${path}.staged-${process.pid}`;
  writeFileSync(staged, bytes, { flag: "wx", mode: 0o400 });
  try {
    linkSync(staged, path);
  } finally {
    unlinkSync(staged);
  }
}

const output = parseReportOut(process.argv.slice(2));
const report = await runFreshMcpTypeArenaExecution();
const serialized = serializeFreshMcpTypeArenaExecutionReport(report);
if (output !== undefined) publishNewFile(output, serialized);
process.stdout.write(serialized);
if (report.status !== "PASS") process.exit(1);
