// @ts-nocheck
import {isAbsolute, resolve} from "node:path";
import {b as defineModuleInitializer} from "./runtime.ts";
import {
  createChengTextTool,
  initChengToolkitModule,
  jsonResult,
  zodSchema,
} from "./cheng_toolkit_m9000.ts";
import {
  CHENG_MEMORY_RELEASE_GATE_SCHEMA,
  verifyMemoryReleaseGate,
} from "./cheng_memory_release_gate.ts";

export const CHENG_MEMORY_RELEASE_GATE_AUDIT_SCHEMA =
  "cheng.memory_release_gate_audit";

let chengMemoryReleaseGateAuditInputSchema;
let ChengMemoryReleaseGateAuditTool;

function canonicalManifestPath(value) {
  if (!isAbsolute(value) || resolve(value) !== value) {
    throw new Error(
      "memory release gate manifestPath must be an absolute canonical path",
    );
  }
  return value;
}

export function runMemoryReleaseGateAudit(manifestPath) {
  const canonicalPath = canonicalManifestPath(manifestPath);
  const result = verifyMemoryReleaseGate(canonicalPath);
  return Object.freeze({
    schema: CHENG_MEMORY_RELEASE_GATE_AUDIT_SCHEMA,
    evidenceSchema: CHENG_MEMORY_RELEASE_GATE_SCHEMA,
    status: result.status,
    manifestPath: canonicalPath,
    manifestSha256: result.manifestSha256,
    caseIds: result.caseIds,
    targets: result.targets,
  });
}

export const initChengMemoryReleaseGateAuditModule = defineModuleInitializer(() => {
  initChengToolkitModule();
  chengMemoryReleaseGateAuditInputSchema = zodSchema.strictObject({
    manifestPath: zodSchema.string().min(1),
  });
  ChengMemoryReleaseGateAuditTool = createChengTextTool({
    name: "cheng_memory_release_gate_audit",
    requiresChengProjectRoot: false,
    searchHint:
      "verify Linux cgroup v2 exact 1 GiB swap-zero production memory evidence, ledger closure and ORC balance",
    inputSchema: chengMemoryReleaseGateAuditInputSchema,
    description:
      "Verify the unique current Cheng production memory-release manifest. " +
      "The audit independently replays each complete Linux cgroup-v2 evidence " +
      "directory, requires memory.max=1073741824, memory.swap.max=0 and real " +
      "AArch64/x86-64 execution, then validates primary/backend2 success and " +
      "failure-matrix receipts with ledger live=0, physical storage release, " +
      "and ORC alloc==free/live=0. Missing official drivers or evidence are RED.",
    prompt:
      "Pass the absolute canonical path to the production memory-release evidence manifest.",
    toAutoClassifierInput: () => "memory-release-gate-audit",
    async execute(input) {
      return jsonResult(runMemoryReleaseGateAudit(input.manifestPath));
    },
  });
});

export {ChengMemoryReleaseGateAuditTool};
