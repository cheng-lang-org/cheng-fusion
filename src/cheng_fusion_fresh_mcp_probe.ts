import { randomBytes, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "./cheng_semantic_matrix_m9023.ts";
import {
  validateChengFusionMcpRuntimeIdentity,
  type ChengFusionMcpRuntimeIdentity,
} from "./cheng_fusion_mcp_runtime_identity.ts";
import { verifyInheritedParentGuardForChild } from "./cheng_toolkit_m9000.ts";

export const CHENG_FUSION_FRESH_MCP_RUNTIME_SCHEMA =
  "cheng_fusion_fresh_mcp_runtime";

const HASH = /^[0-9a-f]{64}$/;
const FUSION_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MCP_ENTRY = join(FUSION_ROOT, "index.ts");

export interface ChengFusionFreshMcpRuntimeReceipt {
  readonly schema: typeof CHENG_FUSION_FRESH_MCP_RUNTIME_SCHEMA;
  readonly status: "FRESH";
  readonly launcherPid: number;
  readonly serverPid: number;
  readonly launchStartedUnixMs: number;
  readonly initializedUnixMs: number;
  readonly serverExitCode: 0;
  readonly serverInfoName: "cheng-fusion";
  readonly serverInfoVersion: "current";
  readonly runtimeIdentity: ChengFusionMcpRuntimeIdentity;
  readonly receiptRaw32: string;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function exactKeys(
  value: unknown,
  keys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}_object_required`);
  }
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label}_keys_invalid`);
  }
}

export function validateFreshChengFusionMcpRuntimeReceipt(
  value: unknown,
  options: { readonly requireCurrentSources?: boolean } = {},
): ChengFusionFreshMcpRuntimeReceipt {
  exactKeys(
    value,
    [
      "schema",
      "status",
      "launcherPid",
      "serverPid",
      "launchStartedUnixMs",
      "initializedUnixMs",
      "serverExitCode",
      "serverInfoName",
      "serverInfoVersion",
      "runtimeIdentity",
      "receiptRaw32",
    ],
    "fresh_mcp_runtime_receipt",
  );
  if (
    value.schema !== CHENG_FUSION_FRESH_MCP_RUNTIME_SCHEMA ||
    value.status !== "FRESH" ||
    !Number.isSafeInteger(value.launcherPid) ||
    Number(value.launcherPid) <= 0 ||
    !Number.isSafeInteger(value.serverPid) ||
    Number(value.serverPid) <= 0 ||
    !Number.isSafeInteger(value.launchStartedUnixMs) ||
    Number(value.launchStartedUnixMs) <= 0 ||
    !Number.isSafeInteger(value.initializedUnixMs) ||
    Number(value.initializedUnixMs) < Number(value.launchStartedUnixMs) ||
    value.serverExitCode !== 0 ||
    value.serverInfoName !== "cheng-fusion" ||
    value.serverInfoVersion !== "current" ||
    typeof value.receiptRaw32 !== "string" ||
    !HASH.test(value.receiptRaw32)
  ) {
    throw new Error("fresh_mcp_runtime_receipt_header_invalid");
  }
  const runtimeIdentity = validateChengFusionMcpRuntimeIdentity(
    value.runtimeIdentity,
    {
      expectedServerPid: Number(value.serverPid),
      earliestRuntimeStartedUnixMs: Number(value.launchStartedUnixMs),
      latestRuntimeStartedUnixMs: Number(value.initializedUnixMs),
      requireCurrentSources: options.requireCurrentSources,
    },
  );
  const payload = { ...value };
  delete payload.receiptRaw32;
  if (sha256(canonicalJson(payload)) !== value.receiptRaw32) {
    throw new Error("fresh_mcp_runtime_receipt_self_hash_drift");
  }
  return Object.freeze({
    schema: CHENG_FUSION_FRESH_MCP_RUNTIME_SCHEMA,
    status: "FRESH",
    launcherPid: Number(value.launcherPid),
    serverPid: Number(value.serverPid),
    launchStartedUnixMs: Number(value.launchStartedUnixMs),
    initializedUnixMs: Number(value.initializedUnixMs),
    serverExitCode: 0,
    serverInfoName: "cheng-fusion",
    serverInfoVersion: "current",
    runtimeIdentity,
    receiptRaw32: value.receiptRaw32,
  });
}

export async function probeFreshChengFusionMcpRuntime(
  timeoutMs = 20000,
): Promise<ChengFusionFreshMcpRuntimeReceipt> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("fresh_mcp_runtime_timeout_invalid");
  }
  const nonce = randomBytes(32).toString("hex");
  const launchStartedUnixMs = Date.now();
  const inheritedProof = verifyInheritedParentGuardForChild();
  const childEnv = { ...process.env } as Record<string, string>;
  if (inheritedProof) {
    for (const key of [
      "BEAT_C_GUARD_PARENT_CAPABILITY",
      "BEAT_C_GUARD_PARENT_MONITOR_PID",
      "BEAT_C_GUARD_PARENT_LIMIT_BYTES",
      "BEAT_C_GUARD_PARENT_PROOF_FD",
    ]) {
      childEnv[key] = String(process.env[key]);
    }
  }
  const child = spawn(process.execPath, [MCP_ENTRY], {
    cwd: FUSION_ROOT,
    env: childEnv,
    stdio: inheritedProof
      ? ["pipe", "pipe", "pipe", inheritedProof.proofFd]
      : ["pipe", "pipe", "pipe"],
  });
  if (!Number.isSafeInteger(child.pid) || Number(child.pid) <= 0) {
    throw new Error("fresh_mcp_runtime_child_pid_invalid");
  }
  let stdout = "";
  let stderr = "";
  let settled = false;
  const response = await new Promise<Record<string, unknown>>(
    (resolvePromise, rejectPromise) => {
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        rejectPromise(
          error instanceof Error ? error : new Error(String(error)),
        );
      };
      const timer = setTimeout(
        () =>
          fail(
            new Error(
              `fresh_mcp_runtime_initialize_timeout:${stderr.slice(-2000)}`,
            ),
          ),
        timeoutMs,
      );
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
        if (stderr.length > 8192) stderr = stderr.slice(-8192);
      });
      child.on("error", fail);
      child.on("exit", (code, signal) => {
        if (!settled) {
          fail(
            new Error(
              `fresh_mcp_runtime_early_exit:${code ?? "null"}:${signal ?? ""}:${stderr.slice(-2000)}`,
            ),
          );
        }
      });
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
        if (stdout.length > 1024 * 1024) {
          fail(new Error("fresh_mcp_runtime_stdout_overflow"));
          return;
        }
        for (;;) {
          const newline = stdout.indexOf("\n");
          if (newline < 0) return;
          const line = stdout.slice(0, newline);
          stdout = stdout.slice(newline + 1);
          if (line.length === 0) continue;
          let parsed: unknown;
          try {
            parsed = JSON.parse(line);
          } catch {
            fail(new Error("fresh_mcp_runtime_non_json_response"));
            return;
          }
          if (
            parsed !== null &&
            typeof parsed === "object" &&
            !Array.isArray(parsed) &&
            (parsed as Record<string, unknown>).id === 1
          ) {
            settled = true;
            clearTimeout(timer);
            resolvePromise(parsed as Record<string, unknown>);
            return;
          }
        }
      });
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: {
              name: "cheng-fusion-fresh-runtime-probe",
              version: "current",
            },
            _meta: { chengFusionRuntimeNonce: nonce },
          },
        })}\n`,
      );
    },
  ).catch((error) => {
    child.kill("SIGKILL");
    throw error;
  });
  const initializedUnixMs = Date.now();
  exactKeys(response, ["jsonrpc", "id", "result"], "fresh_mcp_response");
  exactKeys(response.result, [
    "protocolVersion",
    "capabilities",
    "serverInfo",
    "instructions",
  ], "fresh_mcp_initialize_result");
  exactKeys(
    response.result.serverInfo,
    ["name", "version", "runtimeIdentity"],
    "fresh_mcp_server_info",
  );
  const serverInfo = response.result.serverInfo;
  if (
    serverInfo.name !== "cheng-fusion" ||
    serverInfo.version !== "current"
  ) {
    child.kill("SIGKILL");
    throw new Error("fresh_mcp_server_identity_invalid");
  }
  const runtimeIdentity = validateChengFusionMcpRuntimeIdentity(
    serverInfo.runtimeIdentity,
    {
      expectedServerPid: Number(child.pid),
      expectedInitializationNonce: nonce,
      earliestRuntimeStartedUnixMs: launchStartedUnixMs,
      latestRuntimeStartedUnixMs: initializedUnixMs,
    },
  );
  child.stdin.end();
  const serverExitCode = await new Promise<number>((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      rejectPromise(new Error("fresh_mcp_runtime_shutdown_timeout"));
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (signal !== null || code !== 0) {
        rejectPromise(
          new Error(
            `fresh_mcp_runtime_shutdown_invalid:${code ?? "null"}:${signal ?? ""}:${stderr.slice(-2000)}`,
          ),
        );
      } else {
        resolvePromise(0);
      }
    });
  });
  const payload = {
    schema: CHENG_FUSION_FRESH_MCP_RUNTIME_SCHEMA,
    status: "FRESH" as const,
    launcherPid: process.pid,
    serverPid: Number(child.pid),
    launchStartedUnixMs,
    initializedUnixMs,
    serverExitCode: serverExitCode as 0,
    serverInfoName: "cheng-fusion" as const,
    serverInfoVersion: "current" as const,
    runtimeIdentity,
  };
  return validateFreshChengFusionMcpRuntimeReceipt({
    ...payload,
    receiptRaw32: sha256(canonicalJson(payload)),
  });
}

export function serializeFreshChengFusionMcpRuntimeReceipt(
  receipt: ChengFusionFreshMcpRuntimeReceipt,
): string {
  validateFreshChengFusionMcpRuntimeReceipt(receipt);
  return `${canonicalJson(receipt)}\n`;
}
