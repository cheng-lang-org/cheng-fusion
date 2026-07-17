#!/usr/bin/env bash
# Idempotently registers cheng-fusion into ~/.claude.json's mcpServers.
# Uses node to read/modify/write JSON (never sed) so unrelated keys are
# preserved. Backs up the original file before any
# real write. Pass --dry-run to only print the JSON that would be written.
# Pass --doctor to run the headless CLI's real MCP/toolchain/LSP checks after
# registration (or independently alongside --dry-run).
#
# Separately, to get CSG kind=9 (call-edge) fact support in cheng_csg_query,
# build the vendored cold driver once (not required for install, but
# cheng_csg_roundtrip picks it up automatically once present):
#   /Users/lbcheng/cheng-fusion/vendor/cold-driver/build.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENTRY="$SCRIPT_DIR/index.ts"
CLI="$SCRIPT_DIR/cli.ts"
SERVER_NAME="cheng-fusion"
CONFIG="${CLAUDE_CONFIG_PATH:-$HOME/.claude.json}"
DRY_RUN=0
RUN_DOCTOR=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --doctor) RUN_DOCTOR=1 ;;
    *) echo "unknown flag: $arg" >&2; exit 1 ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "node is required to edit ~/.claude.json safely (no sed)." >&2
  exit 1
fi

BUN_PATH="$(command -v bun || true)"
if [ ! -x "$BUN_PATH" ]; then
  echo "bun is required; refusing to register an MCP command that cannot start." >&2
  exit 1
fi

# A real install is serialized by the operating system. The shell keeps fd 9
# open for the whole transaction, so the BSD lock remains owned after the
# short lockf command returns. The inode is deliberately persistent: removing
# a locked pathname would let another process lock a different inode.
if [ "$DRY_RUN" -eq 0 ]; then
  if [ ! -x /usr/bin/lockf ]; then
    echo "/usr/bin/lockf is required for an atomic concurrent install." >&2
    exit 1
  fi

  CONFIG_PATH="$CONFIG" node <<'PREPARE_EOF'
const fs = require("fs");
const path = require("path");

const configPath = path.resolve(process.env.CONFIG_PATH);
const configDir = path.dirname(configPath);
const parsed = path.parse(configDir);
let current = parsed.root;

for (const component of configDir.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
  current = path.join(current, component);
  try {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`refusing config directory path component that is not a real directory: ${current}`);
    }
  } catch (error) {
    if (!error || error.code !== "ENOENT") throw error;
    try {
      fs.mkdirSync(current, {mode: 0o700});
    } catch (mkdirError) {
      if (!mkdirError || mkdirError.code !== "EEXIST") throw mkdirError;
    }
    const created = fs.lstatSync(current);
    if (created.isSymbolicLink() || !created.isDirectory()) {
      throw new Error(`refusing concurrently replaced config directory: ${current}`);
    }
    const parentFd = fs.openSync(path.dirname(current), fs.constants.O_RDONLY);
    try { fs.fsyncSync(parentFd); } finally { fs.closeSync(parentFd); }
  }
}

const lockPath = `${configPath}.cheng-fusion.lock`;
try {
  const lockFd = fs.openSync(lockPath, "wx", 0o600);
  try { fs.fsyncSync(lockFd); } finally { fs.closeSync(lockFd); }
  const dirFd = fs.openSync(configDir, fs.constants.O_RDONLY);
  try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
} catch (error) {
  if (!error || error.code !== "EEXIST") throw error;
  const lockStat = fs.lstatSync(lockPath);
  if (!lockStat.isFile() || lockStat.isSymbolicLink() || lockStat.nlink !== 1) {
    throw new Error(`refusing unsafe installer lock path: ${lockPath}`);
  }
  if (typeof process.getuid === "function" && lockStat.uid !== process.getuid()) {
    throw new Error(`refusing installer lock owned by another user: ${lockPath}`);
  }
  if ((lockStat.mode & 0o077) !== 0) {
    throw new Error(`refusing installer lock with group/world permissions: ${lockPath}`);
  }
}
PREPARE_EOF

  exec 9>>"${CONFIG}.cheng-fusion.lock"
  if ! /usr/bin/lockf -s -t 0 9; then
    echo "another cheng-fusion install transaction holds ${CONFIG}.cheng-fusion.lock" >&2
    exit 1
  fi
fi

CONFIG_PATH="$CONFIG" ENTRY_PATH="$ENTRY" BUN_PATH="$BUN_PATH" SERVER_NAME="$SERVER_NAME" DRY_RUN="$DRY_RUN" node <<'NODE_EOF'
const fs = require("fs");
const path = require("path");

const configPath = process.env.CONFIG_PATH;
const entryPath = process.env.ENTRY_PATH;
const bunPath = process.env.BUN_PATH;
const serverName = process.env.SERVER_NAME;
const dryRun = process.env.DRY_RUN === "1";
const configDir = path.dirname(configPath);
const maxConfigBytes = 16 * 1024 * 1024;
const fatalUtf8 = new TextDecoder("utf-8", {fatal: true});

// JSON.parse turns every number into IEEE-754 before JSON.stringify writes it back.
// This installer must preserve unrelated config values, including 9007199254740993,
// -0, and exponent spellings, so numbers carry their validated source lexeme instead.
class LosslessJsonNumber {
  constructor(raw) { this.raw = raw; }
}

function parseLosslessJson(text) {
  let offset = 0;
  const fail = (message) => { throw new Error(`${message} at byte ${offset}`); };
  const skipSpace = () => { while (offset < text.length && /[\t\n\r ]/.test(text[offset])) offset++; };
  const parseString = () => {
    const start = offset;
    if (text[offset] !== '"') fail("expected JSON string");
    offset++;
    let escaped = false;
    while (offset < text.length) {
      const code = text.charCodeAt(offset);
      if (code < 0x20) fail("unescaped control character in JSON string");
      const char = text[offset++];
      if (escaped) { escaped = false; continue; }
      if (char === "\\") { escaped = true; continue; }
      if (char === '"') {
        try { return JSON.parse(text.slice(start, offset)); }
        catch (error) { throw new Error(`invalid JSON string at byte ${start}: ${error.message}`); }
      }
    }
    fail("unterminated JSON string");
  };
  const parseNumber = () => {
    const start = offset;
    const match = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(offset));
    if (!match) fail("invalid JSON number");
    offset += match[0].length;
    return new LosslessJsonNumber(match[0]);
  };
  const parseValue = () => {
    skipSpace();
    const char = text[offset];
    if (char === '"') return parseString();
    if (char === "{") {
      offset++;
      const object = Object.create(null);
      const keys = new Set();
      skipSpace();
      if (text[offset] === "}") { offset++; return object; }
      while (true) {
        skipSpace();
        const key = parseString();
        if (keys.has(key)) throw new Error(`duplicate JSON object key ${JSON.stringify(key)} at byte ${offset}`);
        keys.add(key);
        skipSpace();
        if (text[offset++] !== ":") fail("expected ':' after JSON object key");
        object[key] = parseValue();
        skipSpace();
        if (text[offset] === "}") { offset++; return object; }
        if (text[offset++] !== ",") fail("expected ',' or '}' in JSON object");
      }
    }
    if (char === "[") {
      offset++;
      const array = [];
      skipSpace();
      if (text[offset] === "]") { offset++; return array; }
      while (true) {
        array.push(parseValue());
        skipSpace();
        if (text[offset] === "]") { offset++; return array; }
        if (text[offset++] !== ",") fail("expected ',' or ']' in JSON array");
      }
    }
    if (text.startsWith("true", offset)) { offset += 4; return true; }
    if (text.startsWith("false", offset)) { offset += 5; return false; }
    if (text.startsWith("null", offset)) { offset += 4; return null; }
    if (char === "-" || (char >= "0" && char <= "9")) return parseNumber();
    fail("expected JSON value");
  };
  const value = parseValue();
  skipSpace();
  if (offset !== text.length) fail("unexpected trailing JSON content");
  return value;
}

function stringifyLosslessJson(value, indent = 2) {
  const seen = new Set();
  const unit = " ".repeat(indent);
  const render = (current, depth) => {
    if (current instanceof LosslessJsonNumber) return current.raw;
    if (current === null || typeof current === "boolean") return String(current);
    if (typeof current === "string") return JSON.stringify(current);
    if (Array.isArray(current)) {
      if (current.length === 0) return "[]";
      if (seen.has(current)) throw new Error("cannot serialize cyclic JSON array");
      seen.add(current);
      const prefix = unit.repeat(depth + 1);
      const body = current.map((entry) => `${prefix}${render(entry, depth + 1)}`).join(",\n");
      seen.delete(current);
      return `[\n${body}\n${unit.repeat(depth)}]`;
    }
    if (current && typeof current === "object") {
      if (seen.has(current)) throw new Error("cannot serialize cyclic JSON object");
      seen.add(current);
      const keys = Object.keys(current);
      if (keys.length === 0) { seen.delete(current); return "{}"; }
      const prefix = unit.repeat(depth + 1);
      const body = keys.map((key) => `${prefix}${JSON.stringify(key)}: ${render(current[key], depth + 1)}`).join(",\n");
      seen.delete(current);
      return `{\n${body}\n${unit.repeat(depth)}}`;
    }
    throw new Error(`cannot serialize non-JSON value of type ${typeof current}`);
  };
  return render(value, 0);
}

function sameGeneration(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function readStableConfig(filePath) {
  if (!Number.isInteger(fs.constants.O_NOFOLLOW)) {
    throw new Error("atomic config reads require O_NOFOLLOW support");
  }
  const pathBefore = fs.lstatSync(filePath, {bigint: true});
  if (pathBefore.isSymbolicLink() || !pathBefore.isFile()) {
    throw new Error(`refusing to touch ${filePath}: config path must be a regular non-symlink file`);
  }
  if (pathBefore.size > BigInt(maxConfigBytes)) {
    throw new Error(`refusing to read ${filePath}: config exceeds ${maxConfigBytes} bytes`);
  }
  const fd = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const opened = fs.fstatSync(fd, {bigint: true});
    if (!opened.isFile() || opened.dev !== pathBefore.dev || opened.ino !== pathBefore.ino) {
      throw new Error(`refusing concurrently replaced config: ${filePath}`);
    }
    if (opened.size > BigInt(maxConfigBytes) || opened.size > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`refusing to read ${filePath}: config exceeds ${maxConfigBytes} bytes`);
    }
    const expectedBytes = Number(opened.size);
    const bytes = Buffer.allocUnsafe(expectedBytes + 1);
    let total = 0;
    while (total < bytes.length) {
      const count = fs.readSync(fd, bytes, total, bytes.length - total, null);
      if (count === 0) break;
      total += count;
    }
    const openedAfter = fs.fstatSync(fd, {bigint: true});
    const pathAfter = fs.lstatSync(filePath, {bigint: true});
    if (total !== expectedBytes
        || !sameGeneration(opened, openedAfter)
        || !sameGeneration(openedAfter, pathAfter)) {
      throw new Error(`refusing concurrently changing config: ${filePath}`);
    }
    const stableBytes = bytes.subarray(0, total);
    let text;
    try {
      text = fatalUtf8.decode(stableBytes);
    } catch (error) {
      throw new Error(`refusing to touch ${filePath}: config is not valid UTF-8 (${error.message})`);
    }
    return {stat: pathAfter, bytes: Buffer.from(stableBytes), text};
  } finally {
    fs.closeSync(fd);
  }
}

const newEntry = { command: bunPath, args: [entryPath] };

let config = {};
let existed = false;
let originalRaw = null;
let originalBytes = null;
let originalStat = null;
try {
  const snapshot = readStableConfig(configPath);
  originalStat = snapshot.stat;
  existed = true;
  const raw = snapshot.text;
  originalRaw = raw;
  originalBytes = snapshot.bytes;
  try {
    config = parseLosslessJson(raw);
  } catch (error) {
    console.error(`refusing to touch ${configPath}: not valid JSON (${error.message})`);
    process.exit(1);
  }
} catch (error) {
  if (!error || error.code !== "ENOENT") throw error;
}

const isPlainObject = (value) => value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

if (!isPlainObject(config)) {
  console.error(`refusing to touch ${configPath}: top-level JSON value must be an object`);
  process.exit(1);
}
if (config.mcpServers === undefined) config.mcpServers = {};
else if (!isPlainObject(config.mcpServers)) {
  console.error(`refusing to touch ${configPath}: mcpServers must be an object`);
  process.exit(1);
}

const previous = config.mcpServers[serverName];
if (previous !== undefined && !isPlainObject(previous)) {
  console.error(`refusing to touch ${configPath}: mcpServers.${serverName} must be an object`);
  process.exit(1);
}
// Preserve any other fields already on this entry (env, disabled, etc.);
// only replace command/args, matching "existing same-name entry -> replace
// command/args in place" from the task spec.
const merged = { ...(previous || {}), ...newEntry };

if (dryRun) {
  console.log(`[dry-run] would write to: ${configPath}`);
  console.log(`[dry-run] mcpServers.${serverName} =`);
  console.log(stringifyLosslessJson(merged, 2));
  if (previous !== undefined) console.log(`[dry-run] (replacing existing entry; other fields on it, if any, are preserved)`);
  process.exit(0);
}

config.mcpServers[serverName] = merged;

// The parent process holds an OS advisory lock for this whole read/modify/write.
// The config is committed with a same-directory fsync+rename transaction; the
// backup is an atomic hard link to the exact previous inode.
let tempPath = null;
let tempFd = null;
try {
  // Re-read under the lock. All installer processes acquire the lock before this point.
  if (existed) {
    const current = readStableConfig(configPath);
    if (current.stat.dev !== originalStat.dev || current.stat.ino !== originalStat.ino) {
      throw new Error(`refusing to overwrite replaced or non-regular config: ${configPath}`);
    }
    if (!current.bytes.equals(originalBytes) || current.text !== originalRaw) {
      throw new Error(`refusing to overwrite concurrently changing config: ${configPath}`);
    }
  } else {
    try {
      fs.lstatSync(configPath);
      throw new Error(`refusing to overwrite config created concurrently: ${configPath}`);
    } catch (error) {
      if (!error || error.code !== "ENOENT") throw error;
    }
  }

  const mode = existed ? (fs.statSync(configPath).mode & 0o777) : 0o600;
  tempPath = `${configPath}.tmp-${process.pid}-${Date.now()}`;
  tempFd = fs.openSync(tempPath, "wx", mode);
  fs.writeFileSync(tempFd, stringifyLosslessJson(config, 2) + "\n");
  fs.fsyncSync(tempFd);
  fs.closeSync(tempFd);
  tempFd = null;

  if (existed) {
    const backupPath = `${configPath}.bak-${Date.now()}-${process.pid}`;
    fs.linkSync(configPath, backupPath);
    console.log(`backed up ${configPath} -> ${backupPath}`);
  }
  fs.renameSync(tempPath, configPath);
  tempPath = null;
  const dirFd = fs.openSync(configDir, fs.constants.O_RDONLY);
  try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
  console.log(`registered mcpServers.${serverName} in ${configPath}`);
} finally {
  if (tempFd !== null) try { fs.closeSync(tempFd); } catch {}
  if (tempPath !== null) try { fs.unlinkSync(tempPath); } catch {}
}
NODE_EOF

if [ "$DRY_RUN" -eq 0 ]; then
  exec 9>&-
fi

echo "headless CLI: $BUN_PATH $CLI --help"
if [ "$RUN_DOCTOR" -eq 1 ]; then
  "$BUN_PATH" "$CLI" doctor
fi
