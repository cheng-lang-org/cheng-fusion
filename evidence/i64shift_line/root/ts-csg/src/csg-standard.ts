import {
  chengCsgDiffFacts,
  chengCsgFactsRoot,
  chengCsgMergedScanAsync,
  chengCsgValidateFacts,
  chengCsgValidateFactsAsync,
  chengCsgValidateCanonicalFactsAsync,
  requireChengCsgHeldExecLauncherIdentity,
} from "./csg-cheng-bridge.js";
import type { ChengCsgFactIdentityRow } from "./csg-cheng-bridge.js";
import type { CsgFact } from "./schema.js";
import { stableJson } from "./stable-json.js";

export const CsgCoreStandard = "csg_core::v1" as const;
export const CsgCoreSchemaName = "csg_core" as const;
export const CsgCoreProfile = "csg_core" as const;
export const CsgWebProfile = "csg_dialect::web" as const;
export const CsgNativeProfile = "csg_dialect::native" as const;
export const CsgFinanceProfile = "csg_dialect::finance" as const;
export const CsgRelfactsStandard = "csg_relfacts::v1" as const;

export type CsgValidationMode = "strict" | "sandbox";

export interface CsgValidationResult {
  valid: boolean;
  standard: typeof CsgCoreStandard;
  profiles: string[];
  profileSetCid: string;
  profile_set_cid: string;
  factCount: number;
  factsRoot: string;
  facts_root: string;
  complete: boolean;
  unsupportedCount: number;
  tombstoneCount: number;
  errors: string[];
}

export interface CsgDiffResult {
  same: boolean;
  leftRoot: string;
  rightRoot: string;
  added: string[];
  removed: string[];
  changed: string[];
}

export function parseCsgFactsText(text: string): CsgFact[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.startsWith("[")) {
    const value = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(value)) {
      throw new Error("CSG facts JSON array expected");
    }
    return value.map((item, index) => asFact(item, `array[${index}]`));
  }

  const facts: CsgFact[] = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim();
    if (!line) continue;
    facts.push(asFact(JSON.parse(line) as unknown, `line ${index + 1}`));
  }
  return facts;
}

export function canonicalCsgFactsText(facts: readonly CsgFact[]): string {
  return facts.map((fact) => stableJson(fact)).join("\n") +
    (facts.length > 0 ? "\n" : "");
}

export function csgFactsRoot(facts: readonly CsgFact[]): string {
  requireChengCsgHeldExecLauncherIdentity();
  return chengCsgFactsRoot(facts);
}

export function validateCsgFacts(
  facts: readonly CsgFact[],
  mode: CsgValidationMode = "strict",
): CsgValidationResult {
  requireChengCsgHeldExecLauncherIdentity();
  const result = chengCsgValidateFacts(facts, mode);
  return toCsgValidationResult(result);
}

export function validateCsgFactsAsync(
  facts: readonly CsgFact[],
  mode: CsgValidationMode = "strict",
): Promise<CsgValidationResult> {
  requireChengCsgHeldExecLauncherIdentity();
  return chengCsgValidateFactsAsync(facts, mode).then(toCsgValidationResult);
}

export function validateCsgCanonicalFactsAsync(
  facts: readonly CsgFact[],
  mode: CsgValidationMode = "strict",
): Promise<CsgValidationResult> {
  requireChengCsgHeldExecLauncherIdentity();
  return chengCsgValidateCanonicalFactsAsync(facts, mode).then(toCsgValidationResult);
}

export interface CsgMergedScanResult {
  validation: CsgValidationResult;
  identities: readonly ChengCsgFactIdentityRow[];
}

/**
 * Single-pass merged scan: one held-CLI process produces the sandbox
 * validation and the per-fact identity rows from one canonical JSONL read.
 * Validation fields and identity rows are byte-identical to running
 * `validateCsgCanonicalFactsAsync` + `chengCsgFactIdentitiesCanonicalAsync`
 * separately; the second full scan of the same fact set is gone.
 */
export function mergedCsgScanAsync(
  facts: readonly CsgFact[],
): Promise<CsgMergedScanResult> {
  requireChengCsgHeldExecLauncherIdentity();
  return chengCsgMergedScanAsync(facts).then((merged) => ({
    validation: toCsgValidationResult(merged.validation),
    identities: merged.identities,
  }));
}

function toCsgValidationResult(result: {
  valid: boolean;
  profiles: string[];
  profileSetCid: string;
  factCount: number;
  factsRoot: string;
  complete: boolean;
  unsupportedCount: number;
  tombstoneCount: number;
  errors: string[];
}): CsgValidationResult {
  return {
    valid: result.valid,
    standard: CsgCoreStandard,
    profiles: result.profiles,
    profileSetCid: result.profileSetCid,
    profile_set_cid: result.profileSetCid,
    factCount: result.factCount,
    factsRoot: result.factsRoot,
    facts_root: result.factsRoot,
    complete: result.complete,
    unsupportedCount: result.unsupportedCount,
    tombstoneCount: result.tombstoneCount,
    errors: result.errors,
  };
}

export function diffCsgFacts(
  left: readonly CsgFact[],
  right: readonly CsgFact[],
): CsgDiffResult {
  requireChengCsgHeldExecLauncherIdentity();
  return chengCsgDiffFacts(left, right);
}

function asFact(value: unknown, where: string): CsgFact {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${where}: CSG fact must be a JSON object`);
  }
  const record = value as Record<string, unknown>;
  if (typeof record.kind !== "string") {
    throw new Error(`${where}: CSG fact missing string kind`);
  }
  return record as CsgFact;
}
