#!/usr/bin/env bash
# Idempotently registers cheng-fusion into ~/.claude.json's mcpServers.
# Uses node to read/modify/write JSON (never sed) so existing formatting/keys
# of unrelated entries are preserved. Backs up the original file before any
# real write. Pass --dry-run to only print the JSON that would be written.
#
# Separately, to get CSG kind=9 (call-edge) fact support in cheng_csg_query,
# build the vendored cold driver once (not required for install, but
# cheng_csg_roundtrip picks it up automatically once present):
#   /Users/lbcheng/cheng-fusion/vendor/cold-driver/build.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENTRY="$SCRIPT_DIR/index.ts"
SERVER_NAME="cheng-fusion"
CONFIG="${CLAUDE_CONFIG_PATH:-$HOME/.claude.json}"
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *) echo "unknown flag: $arg" >&2; exit 1 ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "node is required to edit ~/.claude.json safely (no sed)." >&2
  exit 1
fi

if [ ! -x "$(command -v bun)" ]; then
  echo "warning: bun not found on PATH; cheng-fusion is a bun MCP server (bun run $ENTRY)." >&2
fi

CONFIG_PATH="$CONFIG" ENTRY_PATH="$ENTRY" SERVER_NAME="$SERVER_NAME" DRY_RUN="$DRY_RUN" node <<'NODE_EOF'
const fs = require("fs");

const configPath = process.env.CONFIG_PATH;
const entryPath = process.env.ENTRY_PATH;
const serverName = process.env.SERVER_NAME;
const dryRun = process.env.DRY_RUN === "1";

const newEntry = { command: "bun", args: [entryPath] };

let config = {};
let existed = false;
if (fs.existsSync(configPath)) {
  existed = true;
  const raw = fs.readFileSync(configPath, "utf8");
  try {
    config = JSON.parse(raw);
  } catch (error) {
    console.error(`refusing to touch ${configPath}: not valid JSON (${error.message})`);
    process.exit(1);
  }
}

if (!config.mcpServers || typeof config.mcpServers !== "object") config.mcpServers = {};

const previous = config.mcpServers[serverName];
// Preserve any other fields already on this entry (env, disabled, etc.);
// only replace command/args, matching "existing same-name entry -> replace
// command/args in place" from the task spec.
const merged = { ...(previous && typeof previous === "object" ? previous : {}), ...newEntry };

if (dryRun) {
  console.log(`[dry-run] would write to: ${configPath}`);
  console.log(`[dry-run] mcpServers.${serverName} =`);
  console.log(JSON.stringify(merged, null, 2));
  if (previous) console.log(`[dry-run] (replacing existing entry; other fields on it, if any, are preserved)`);
  process.exit(0);
}

config.mcpServers[serverName] = merged;

if (existed) {
  const backupPath = `${configPath}.bak-${Date.now()}`;
  fs.copyFileSync(configPath, backupPath);
  console.log(`backed up ${configPath} -> ${backupPath}`);
}

fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
console.log(`registered mcpServers.${serverName} in ${configPath}`);
NODE_EOF
