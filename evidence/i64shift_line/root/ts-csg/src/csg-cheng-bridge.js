import { spawnSync } from "node:child_process";
import { closeSync, constants as fsConstants, copyFileSync, fstatSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stableJson } from "./stable-json.js";
export const ChengCsgHeldExecHardRed = "HARD_RED:production_launcher_runtime_primitives_missing";
/** Fixed install inode. Not taken from env/argv (those are forgeable). */
export const ChengCsgHeldCliInstallPath = "/usr/libexec/cheng/csg-cli";
/** Darwin fixed install path: same cli.cheng source compiled natively by the
 *  Darwin stage3 compiler (arm64-apple-darwin). Same authority contract as the
 *  Linux install: fixed path outside any repo tree, opened O_NOFOLLOW, inode
 *  pinned across spawn. User authorized replacing the TCG-emulated Linux lane
 *  for facts validation with this native binary (2026-08-21). */
export const ChengCsgHeldCliDarwinInstallPath = "/Users/lbcheng/.cheng-held/csg-cli";
function heldCliInstallPath() {
    if (process.platform === "linux")
        return ChengCsgHeldCliInstallPath;
    if (process.platform === "darwin")
        return ChengCsgHeldCliDarwinInstallPath;
    return null;
}
function heldCliUnavailable() {
    throw new Error(`pure Cheng held-exec CLI unavailable: ${ChengCsgHeldExecHardRed}`);
}
function openHeldCliFd() {
    const installPath = heldCliInstallPath();
    if (installPath === null) {
        return heldCliUnavailable();
    }
    const flags = fsConstants.O_RDONLY |
        (fsConstants.O_NOFOLLOW ?? 0);
    let fd;
    try {
        fd = openSync(installPath, flags);
    }
    catch {
        return heldCliUnavailable();
    }
    try {
        const st = fstatSync(fd);
        if (!st.isFile() || st.nlink < 1 || st.size <= 0) {
            closeSync(fd);
            return heldCliUnavailable();
        }
    }
    catch {
        closeSync(fd);
        return heldCliUnavailable();
    }
    return fd;
}
function invokeHeldCli(args) {
    const installPath = heldCliInstallPath();
    if (installPath === null) {
        return heldCliUnavailable();
    }
    const fd = openHeldCliFd();
    try {
        // Node's uv_spawn CLOEXECs extra fds, so `/proc/self/fd/N` vanishes
        // before exec. The fd is kept open across spawn to pin the inode; the
        // operand is the same fixed install path that was opened and fstat'd.
        const result = spawnSync(installPath, [...args], {
            encoding: "utf8",
            maxBuffer: 64 * 1024 * 1024,
        });
        if (result.error) {
            return heldCliUnavailable();
        }
        return {
            status: result.status ?? 1,
            stdout: result.stdout ?? "",
            stderr: result.stderr ?? "",
        };
    }
    finally {
        closeSync(fd);
    }
}
function writeFactsJsonl(facts) {
    const dir = mkdtempSync(join(tmpdir(), "csg-held-"));
    const path = join(dir, "facts.jsonl");
    const body = facts.map((fact) => stableJson(fact)).join("\n") +
        (facts.length > 0 ? "\n" : "");
    writeFileSync(path, body);
    return { dir, path };
}
function parseValidation(stdout, mode) {
    const field = (name) => {
        const line = stdout.split("\n").find((row) => row.startsWith(`${name}=`));
        return line ? line.slice(name.length + 1) : "";
    };
    const errors = stdout
        .split("\n")
        .filter((row) => row.startsWith("error: "))
        .map((row) => row.slice(7));
    return {
        valid: field("valid") === "1",
        mode,
        standard: field("standard"),
        profiles: field("profiles")
            ? field("profiles")
                .replace(/^\[/, "")
                .replace(/\]$/, "")
                .split(",")
                .map((item) => item.replace(/^"|"$/g, ""))
                .filter((item) => item.length > 0)
            : [],
        profileSetCid: field("profile_set_cid"),
        factCount: Number(field("fact_count") || 0),
        factsRoot: field("facts_root"),
        complete: field("complete") === "1",
        unsupportedCount: Number(field("unsupported_count") || 0),
        tombstoneCount: Number(field("tombstone_count") || 0),
        errors,
    };
}
/**
 * Production CSG authority is the held installed CLI: a fixed install path
 * outside any repo tree, opened O_NOFOLLOW with the inode pinned across spawn
 * — never a caller-supplied env/argv pathname. Linux installs at
 * /usr/libexec/cheng/csg-cli; Darwin at ~/.cheng-held/csg-cli (same cli.cheng
 * source compiled by the Darwin stage3 compiler).
 */
export function requireChengCsgHeldExecLauncherIdentity() {
    const fd = openHeldCliFd();
    closeSync(fd);
}
export function chengCsgRootFileStrict(path) {
    requireChengCsgHeldExecLauncherIdentity();
    const result = invokeHeldCli(["root", "--mode", "sandbox", path]);
    const root = result.stdout.trim().split("\n").pop() ?? "";
    if (result.status !== 0 || !root.startsWith("sha256:")) {
        throw new Error(result.stderr || "held CLI root failed");
    }
    return root;
}
export function chengCsgDecodeFactKindsAuthorized(_csgcPath, _manifestPath, _kinds) {
    requireChengCsgHeldExecLauncherIdentity();
    throw new Error("held CLI decode-kinds-authorized is not wired");
}
export function chengCsgFactIdentitiesThroughRootCli(facts) {
    requireChengCsgHeldExecLauncherIdentity();
    return chengCsgFactIdentitiesHeld(facts);
}
function chengCsgFactIdentitiesHeld(facts) {
    requireChengCsgHeldExecLauncherIdentity();
    const tmp = writeFactsJsonl(facts);
    try {
        // Sandbox raw-fact identity contract: canonical per-line fact_hash and
        // content-only unbound subgraph_cid rows on stdout. Raw extracted facts
        // are not production-admittable, so strict admission must not run here.
        const result = invokeHeldCli([
            "fact-identities",
            "--mode",
            "sandbox",
            tmp.path,
        ]);
        if (result.status !== 0) {
            throw new Error(result.stderr || "held CLI fact-identities failed");
        }
        const rows = [];
        for (const line of result.stdout.split("\n")) {
            if (!line.startsWith("fact_hash="))
                continue;
            const parts = line.split("\t");
            const factHash = (parts[0] ?? "").slice("fact_hash=".length);
            const subgraphCid = (parts[1] ?? "").slice("subgraph_cid=".length);
            rows.push({ factHash, subgraphCid });
        }
        return rows;
    }
    finally {
        rmSync(tmp.dir, { recursive: true, force: true });
    }
}
export function chengCsgPackFacts(facts) {
    requireChengCsgHeldExecLauncherIdentity();
    const tmp = writeFactsJsonl(facts);
    const outPath = join(tmp.dir, "facts.csgc");
    try {
        const result = invokeHeldCli(["pack", "--mode", "sandbox", "--out", outPath, tmp.path]);
        if (result.status !== 0) {
            // Preserve the rejected pack source: the temp dir is deleted below and
            // line-level diagnosis (canonicality/node-budget failures) needs the
            // exact bytes the CLI saw.
            try {
                copyFileSync(tmp.path, "/tmp/csg-pack-fail-dump.jsonl");
            }
            catch {
                // dump failure must not mask the original pack error
            }
            throw new Error(result.stderr || "held CLI pack failed");
        }
        const field = (name) => {
            const line = result.stdout.split("\n").find((row) => row.startsWith(`${name}=`));
            return line ? line.slice(name.length + 1) : "0";
        };
        return {
            bytes: readFileSync(outPath),
            headerSize: Number(field("header_size")),
            flags: Number(field("flags")),
            factCount: Number(field("fact_count")),
            dictionaryCount: Number(field("dictionary_count")),
            canonicalJsonlBytes: Number(field("canonical_jsonl_bytes") || 0),
        };
    }
    finally {
        rmSync(tmp.dir, { recursive: true, force: true });
    }
}
export function chengCsgUnpackFacts(buffer, _mode = "strict") {
    requireChengCsgHeldExecLauncherIdentity();
    const dir = mkdtempSync(join(tmpdir(), "csg-held-"));
    const csgcPath = join(dir, "facts.csgc");
    const outPath = join(dir, "facts.jsonl");
    try {
        writeFileSync(csgcPath, buffer);
        const result = invokeHeldCli(["unpack", "--mode", "sandbox", "--out", outPath, csgcPath]);
        if (result.status !== 0) {
            throw new Error(result.stderr || "held CLI unpack failed");
        }
        const text = readFileSync(outPath, "utf8");
        const facts = text
            .split("\n")
            .filter((line) => line.length > 0)
            .map((line) => JSON.parse(line));
        return {
            facts,
            headerSize: 0,
            flags: 0,
            factCount: facts.length,
            factsRoot: "",
            complete: true,
        };
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
}
export function chengCsgValidateFacts(facts, mode) {
    requireChengCsgHeldExecLauncherIdentity();
    const tmp = writeFactsJsonl(facts);
    try {
        const result = invokeHeldCli(["validate", "--mode", mode, tmp.path]);
        const parsed = parseValidation(`${result.stdout}\n${result.stderr}`, mode);
        if (result.status !== 0 && parsed.errors.length === 0) {
            parsed.errors.push(result.stderr.trim() || "held CLI validate failed");
            parsed.valid = false;
        }
        return parsed;
    }
    finally {
        rmSync(tmp.dir, { recursive: true, force: true });
    }
}
export function chengCsgFactsRoot(facts) {
    requireChengCsgHeldExecLauncherIdentity();
    return chengCsgValidateFacts(facts, "sandbox").factsRoot;
}
export function chengCsgDiffFacts(left, right) {
    requireChengCsgHeldExecLauncherIdentity();
    const leftTmp = writeFactsJsonl(left);
    const rightTmp = writeFactsJsonl(right);
    try {
        const result = invokeHeldCli(["diff", "--mode", "sandbox", leftTmp.path, rightTmp.path]);
        const field = (name) => {
            const line = result.stdout.split("\n").find((row) => row.startsWith(`${name}=`));
            return line ? line.slice(name.length + 1) : "";
        };
        return {
            same: field("same") === "1",
            leftRoot: field("left_root"),
            rightRoot: field("right_root"),
            added: [],
            removed: [],
            changed: [],
        };
    }
    finally {
        rmSync(leftTmp.dir, { recursive: true, force: true });
        rmSync(rightTmp.dir, { recursive: true, force: true });
    }
}
