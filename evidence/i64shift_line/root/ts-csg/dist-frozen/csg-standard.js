import { chengCsgDiffFacts, chengCsgFactsRoot, chengCsgMergedScanAsync, chengCsgValidateFacts, chengCsgValidateFactsAsync, chengCsgValidateCanonicalFactsAsync, requireChengCsgHeldExecLauncherIdentity, } from "./csg-cheng-bridge.js";
import { stableJson } from "./stable-json.js";
export const CsgCoreStandard = "csg_core::v1";
export const CsgCoreSchemaName = "csg_core";
export const CsgCoreProfile = "csg_core";
export const CsgWebProfile = "csg_dialect::web";
export const CsgNativeProfile = "csg_dialect::native";
export const CsgFinanceProfile = "csg_dialect::finance";
export const CsgRelfactsStandard = "csg_relfacts::v1";
export function parseCsgFactsText(text) {
    const trimmed = text.trim();
    if (trimmed.length === 0)
        return [];
    if (trimmed.startsWith("[")) {
        const value = JSON.parse(trimmed);
        if (!Array.isArray(value)) {
            throw new Error("CSG facts JSON array expected");
        }
        return value.map((item, index) => asFact(item, `array[${index}]`));
    }
    const facts = [];
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]?.trim();
        if (!line)
            continue;
        facts.push(asFact(JSON.parse(line), `line ${index + 1}`));
    }
    return facts;
}
export function canonicalCsgFactsText(facts) {
    return facts.map((fact) => stableJson(fact)).join("\n") +
        (facts.length > 0 ? "\n" : "");
}
export function csgFactsRoot(facts) {
    requireChengCsgHeldExecLauncherIdentity();
    return chengCsgFactsRoot(facts);
}
export function validateCsgFacts(facts, mode = "strict") {
    requireChengCsgHeldExecLauncherIdentity();
    const result = chengCsgValidateFacts(facts, mode);
    return toCsgValidationResult(result);
}
export function validateCsgFactsAsync(facts, mode = "strict") {
    requireChengCsgHeldExecLauncherIdentity();
    return chengCsgValidateFactsAsync(facts, mode).then(toCsgValidationResult);
}
export function validateCsgCanonicalFactsAsync(facts, mode = "strict") {
    requireChengCsgHeldExecLauncherIdentity();
    return chengCsgValidateCanonicalFactsAsync(facts, mode).then(toCsgValidationResult);
}
/**
 * Single-pass merged scan: one held-CLI process produces the sandbox
 * validation and the per-fact identity rows from one canonical JSONL read.
 * Validation fields and identity rows are byte-identical to running
 * `validateCsgCanonicalFactsAsync` + `chengCsgFactIdentitiesCanonicalAsync`
 * separately; the second full scan of the same fact set is gone.
 */
export function mergedCsgScanAsync(facts) {
    requireChengCsgHeldExecLauncherIdentity();
    return chengCsgMergedScanAsync(facts).then((merged) => ({
        validation: toCsgValidationResult(merged.validation),
        identities: merged.identities,
    }));
}
function toCsgValidationResult(result) {
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
export function diffCsgFacts(left, right) {
    requireChengCsgHeldExecLauncherIdentity();
    return chengCsgDiffFacts(left, right);
}
function asFact(value, where) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${where}: CSG fact must be a JSON object`);
    }
    const record = value;
    if (typeof record.kind !== "string") {
        throw new Error(`${where}: CSG fact missing string kind`);
    }
    return record;
}
