// @ts-nocheck
import {isAbsolute, resolve} from "node:path";
import {b as defineModuleInitializer} from "./runtime.ts";
import {
  createChengTextTool,
  initChengToolkitModule,
  jsonResult,
  zodSchema,
} from "./cheng_toolkit_m9000.ts";
import {verifyCidEvidence} from "./cheng_cid_identity_chain_evidence.ts";

const CID_IDENTITY_CHAIN_AUDIT_SCHEMA = "cheng.cid.identity_chain.audit";

let chengCidIdentityChainAuditInputSchema;
let ChengCidIdentityChainAuditTool;

function canonicalAbsoluteManifestPath(value) {
  if (!isAbsolute(value) || resolve(value) !== value) {
    throw new Error("CID identity-chain manifestPath must be an absolute canonical path");
  }
  return value;
}

function runCidIdentityChainAudit(manifestPath) {
  const canonicalPath = canonicalAbsoluteManifestPath(manifestPath);
  const result = verifyCidEvidence(canonicalPath);
  return Object.freeze({
    schema: CID_IDENTITY_CHAIN_AUDIT_SCHEMA,
    status: result.status,
    manifestPath: canonicalPath,
    manifestSha256: result.manifestSha256,
    candidateSha256: result.candidateSha256,
    caseIds: Object.freeze([...result.caseIds]),
  });
}

const initChengCidIdentityChainAuditModule = defineModuleInitializer(() => {
  initChengToolkitModule();
  chengCidIdentityChainAuditInputSchema = zodSchema.strictObject({
    manifestPath: zodSchema.string().min(1),
  });
  ChengCidIdentityChainAuditTool = createChengTextTool({
    name: "cheng_cid_identity_chain_audit",
    requiresChengProjectRoot: false,
    searchHint: "verify frozen CID identity-chain evidence, canonical debug source SoA, six cgroup cases and mutation replay",
    inputSchema: chengCidIdentityChainAuditInputSchema,
    description: "Verify one canonical CID identity-chain evidence manifest through the production Cheng Fusion oracle. The audit stable-reads every bound artifact, enforces single-consumer source phases (borrowed link plans and source payloads, structural receipt capture, one exact import rebuild reused by the source-bundle producer, no import-only full line table, index-only source ordering without a second full text sequence, canonical DebugSectionPlanReceipt source/name SoA hashed and replayed before direct DWARF consumption, and fine-grained memory-trace calls bound to their output allowlist), recomputes source/tool/image/candidate identities, verifies the exact 1 GiB candidate/counterexample/six-case cgroup receipts, replays all destructive and identity-preserving mutations, and returns CID_GREEN_CANDIDATE only when the complete chain is proven.",
    prompt: "Pass the absolute canonical path to evidence.json produced by the CID Linux evidence producer.",
    toAutoClassifierInput: () => "cid-identity-chain-audit",
    async execute(input) {
      return jsonResult(runCidIdentityChainAudit(input.manifestPath));
    },
  });
});

export {
  ChengCidIdentityChainAuditTool,
  CID_IDENTITY_CHAIN_AUDIT_SCHEMA,
  initChengCidIdentityChainAuditModule,
  runCidIdentityChainAudit,
};
