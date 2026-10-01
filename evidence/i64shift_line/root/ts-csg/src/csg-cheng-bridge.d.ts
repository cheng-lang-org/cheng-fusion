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
export declare const ChengCsgHeldExecHardRed: "HARD_RED:production_launcher_runtime_primitives_missing";
/** Fixed install inode. Not taken from env/argv (those are forgeable). */
export declare const ChengCsgHeldCliInstallPath = "/usr/libexec/cheng/csg-cli";
/** Darwin fixed install path: same cli.cheng source compiled natively by the
 *  Darwin stage3 compiler (arm64-apple-darwin). Same authority contract as the
 *  Linux install: fixed path outside any repo tree, opened O_NOFOLLOW, inode
 *  pinned across spawn. User authorized replacing the TCG-emulated Linux lane
 *  for facts validation with this native binary (2026-08-21). */
export declare const ChengCsgHeldCliDarwinInstallPath = "/Users/lbcheng/.cheng-held/csg-cli";
/**
 * Production CSG authority is the held installed CLI: a fixed install path
 * outside any repo tree, opened O_NOFOLLOW with the inode pinned across spawn
 * — never a caller-supplied env/argv pathname. Linux installs at
 * /usr/libexec/cheng/csg-cli; Darwin at ~/.cheng-held/csg-cli (same cli.cheng
 * source compiled by the Darwin stage3 compiler).
 */
export declare function requireChengCsgHeldExecLauncherIdentity(): void;
export declare function chengCsgRootFileStrict(path: string): string;
export declare function chengCsgDecodeFactKindsAuthorized(_csgcPath: string, _manifestPath: string, _kinds: readonly string[]): ChengCsgAuthorizedFactKindsResult;
export declare function chengCsgFactIdentitiesThroughRootCli(facts: readonly CsgFact[]): ChengCsgFactIdentityRow[];
export declare function chengCsgPackFacts(facts: readonly CsgFact[]): ChengCsgPackResult;
export declare function chengCsgUnpackFacts(buffer: Buffer, _mode?: ChengCsgMode): ChengCsgUnpackResult;
export declare function chengCsgValidateFacts(facts: readonly CsgFact[], mode: ChengCsgMode): ChengCsgValidationResult;
export declare function chengCsgFactsRoot(facts: readonly CsgFact[]): string;
export declare function chengCsgDiffFacts(left: readonly CsgFact[], right: readonly CsgFact[]): ChengCsgDiffResult;
