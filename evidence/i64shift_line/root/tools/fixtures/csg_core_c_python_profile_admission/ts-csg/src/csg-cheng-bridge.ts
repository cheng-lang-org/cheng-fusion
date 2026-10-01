import type { CsgFact } from "./schema.js";

export type ChengCsgMode = "strict" | "sandbox";

export interface ChengCsgPackResult {
  bytes: Buffer;
  headerSize: number;
  flags: number;
  factCount: number;
  dictionaryCount: number;
  canonicalJsonlBytes: number;
}

export interface ChengCsgUnpackResult {
  facts: CsgFact[];
  headerSize: number;
  flags: number;
  factCount: number;
  factsRoot: string;
  complete: boolean;
}

export interface ChengCsgValidationResult {
  valid: boolean;
  mode: ChengCsgMode;
  standard: string;
  profiles: string[];
  profileSetCid: string;
  factCount: number;
  factsRoot: string;
  complete: boolean;
  unsupportedCount: number;
  tombstoneCount: number;
  errors: string[];
}

export interface ChengCsgDiffResult {
  same: boolean;
  leftRoot: string;
  rightRoot: string;
  added: string[];
  removed: string[];
  changed: string[];
}

export interface ChengCsgFactIdentityRow {
  factHash: string;
  subgraphCid: string;
}

export interface ChengCsgAuthorizedFactKindsResult {
  facts: CsgFact[];
  sourceFactCount: number;
  selectedFactCount: number;
  selectedFactsRoot: string;
  directoryCid: string;
  kinds: readonly string[];
}

export const ChengCsgHeldExecHardRed =
  "HARD_RED:production_launcher_runtime_primitives_missing" as const;

/**
 * Production CSG authority can only be issued by the native launcher that
 * executes the pure Cheng CLI from a held executable. The repository has no
 * such opaque issuer yet. A path, environment field, caller receipt, or hash
 * would be forgeable, so every TypeScript physical boundary stops here before
 * inspecting input or creating cargo.
 */
export function requireChengCsgHeldExecLauncherIdentity(): never {
  throw new Error(
    `pure Cheng held-exec CLI unavailable: ${ChengCsgHeldExecHardRed}`,
  );
}

export function chengCsgRootFileStrict(_path: string): string {
  return requireChengCsgHeldExecLauncherIdentity();
}

export function chengCsgDecodeFactKindsAuthorized(
  _csgcPath: string,
  _manifestPath: string,
  _kinds: readonly string[],
): ChengCsgAuthorizedFactKindsResult {
  return requireChengCsgHeldExecLauncherIdentity();
}

export function chengCsgFactIdentitiesThroughRootCli(
  _facts: readonly CsgFact[],
): ChengCsgFactIdentityRow[] {
  return requireChengCsgHeldExecLauncherIdentity();
}

export function chengCsgPackFacts(
  _facts: readonly CsgFact[],
): ChengCsgPackResult {
  return requireChengCsgHeldExecLauncherIdentity();
}

export function chengCsgUnpackFacts(
  _buffer: Buffer,
  _mode: ChengCsgMode = "strict",
): ChengCsgUnpackResult {
  return requireChengCsgHeldExecLauncherIdentity();
}

export function chengCsgValidateFacts(
  _facts: readonly CsgFact[],
  _mode: ChengCsgMode,
): ChengCsgValidationResult {
  return requireChengCsgHeldExecLauncherIdentity();
}

export function chengCsgFactsRoot(_facts: readonly CsgFact[]): string {
  return requireChengCsgHeldExecLauncherIdentity();
}

export function chengCsgDiffFacts(
  _left: readonly CsgFact[],
  _right: readonly CsgFact[],
): ChengCsgDiffResult {
  return requireChengCsgHeldExecLauncherIdentity();
}
