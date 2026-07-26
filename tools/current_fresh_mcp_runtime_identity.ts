#!/usr/bin/env bun
import { linkSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  probeFreshChengFusionMcpRuntime,
  serializeFreshChengFusionMcpRuntimeReceipt,
} from "../src/cheng_fusion_fresh_mcp_probe.ts";

function reportOutPath(argv: readonly string[]): string | undefined {
  if (argv.length === 0) return undefined;
  if (
    argv.length !== 2 ||
    argv[0] !== "--report-out" ||
    argv[1] === undefined ||
    argv[1].startsWith("--")
  ) {
    throw new Error("fresh_mcp_runtime_argument_invalid");
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

const output = reportOutPath(process.argv.slice(2));
const receipt = await probeFreshChengFusionMcpRuntime();
const serialized = serializeFreshChengFusionMcpRuntimeReceipt(receipt);
if (output !== undefined) publishNewFile(output, serialized);
process.stdout.write(serialized);
