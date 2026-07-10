# cheng-fusion-mcp

Standalone MCP server exposing deterministic Cheng compiler fusion tools — CSG facts, cheng-lsp, crash triage, line maps, profiling, and symbol-regression checks — for the active Cheng project. Speaks MCP over stdio JSON-RPC (hand-rolled transport, no MCP SDK dependency). Runs on [bun](https://bun.sh).

Extracted as a standalone package from the claude-code reverse-engineered repo's `claude/tool/cheng_*.ts` modules; the session-integration hooks (`cheng_fusion_hooks_m9011.ts`, which wire into claude-code's own Bash tool / session registry) are intentionally **not** included — a standalone MCP server doesn't need them.

## Install

Pick one:

**1. `claude mcp add` (quickest)**

```sh
claude mcp add cheng-fusion -- bun /Users/lbcheng/cheng-fusion/index.ts
```

**2. Manual `~/.claude.json` snippet**

```json
{
  "mcpServers": {
    "cheng-fusion": {
      "type": "stdio",
      "command": "bun",
      "args": ["/Users/lbcheng/cheng-fusion/index.ts"],
      "env": {}
    }
  }
}
```

**3. `install.sh`** — idempotently merges the entry above into `~/.claude.json` (backs up the existing file first; if `cheng-fusion` is already registered, only `command`/`args` are replaced in place, other fields on that entry are kept).

```sh
/Users/lbcheng/cheng-fusion/install.sh            # applies the change
/Users/lbcheng/cheng-fusion/install.sh --dry-run  # prints the JSON without writing anything
```

## Tools

| Tool | Mutating | Purpose |
|---|---|---|
| `cheng_csg_query` | no | Query CSG facts: symbol declarations, inbound references, outbound calls. |
| `cheng_evidence` | no | Cross-module refactor blast-radius evidence (impact radius, cross-module callers) from CSG facts. |
| `cheng_csg_roundtrip` | yes | Emit Cheng cold CSG facts for a source file and verify the cold reader consumes them; refreshes `conversion-reports/cheng-csg/current.facts`. |
| `cheng_crash_triage` | no | Parse Cheng compiler/runtime stderr into structured `file:line` frames. |
| `cheng_line_map_read` | no | Canonical function sig/body line spans for a `.cheng` source (sidecar-cached; falls back to cheng-lsp). |
| `cheng_lsp_query` | no | Direct pass-through to the real `cheng-lsp` language server: hover, definition, references, diagnostics, rename, codeAction, etc. |
| `cheng_profile_report` | yes | Probe/run/convert real Cheng profiling reports (`profile-report` / `system-link-exec` + executable timing). |
| `cheng_symbol_diff` | no | Snapshot `cheng print-symbols` counts; `primary_unsupported_count > 0` signals a compiler lowering regression. |

All tools except `cheng_crash_triage` require an active Cheng project root (a directory containing `cheng-package.toml`), resolved from MCP workspace roots, an explicit `cwd`, or the tool's own `file`/`source`/`root` argument.

## Environment knobs

| Variable | Default | Effect |
|---|---|---|
| `CHENG_FUSION_RSS_CAP` | `12884901888` (12 GiB) | Overrides `CHENG_PROCESS_MAX_RSS_BYTES` injected into every spawned Cheng driver/cheng-lsp subprocess. |
| `CHENG_FUSION_TIMEOUT_MS` | tool-specific (15s for LSP requests, 120s for driver runs) | Overrides every timeout in the process, uniformly. On timeout the whole subprocess **group** is `SIGKILL`ed (not just the direct child), so `BACKEND_JOBS` fork-join grandchildren don't survive as orphans. |
| `CHENG_TOOLCHAIN_ROOT` / `CHENG_ROOT` | `/Users/lbcheng/cheng-lang` | Default Cheng toolchain root used to locate the backend driver, stage3 driver, and cheng-lsp fallback path. |
| `CHENG_DRIVER` | `$CHENG_TOOLCHAIN_ROOT/artifacts/backend_driver/cheng` | Explicit override for the backend driver binary. |
| `CHENG_STAGE3_DRIVER` | `$CHENG_TOOLCHAIN_ROOT/artifacts/bootstrap/cheng.stage3` | Explicit override for the stage3 self-hosted driver. |
| `CHENG_LSP_PATH` | resolved via `which cheng-lsp`, else `$CHENG_TOOLCHAIN_ROOT/artifacts/cheng-lsp` | Explicit override for the `cheng-lsp` binary. |
| `CHENG_COLD_DRIVER` / `CHENG_CSG_DRIVER` | — | Preferred driver candidates for `cheng_csg_roundtrip`'s cold-CSG emission (tried before `CHENG_DRIVER`/`CHENG_STAGE3_DRIVER`). |
| `CSG_CORE_READER_ROOT` / `TS_CSG_ROOT` | `$CHENG_TOOLCHAIN_ROOT/ts-csg` | Root used to locate the CSG-Core facts reader (`dist/csgc-reader.js`) for non-cold CSG facts. |

## Layout

```
cheng-fusion/
├── index.ts                                  entry point (equivalent to the source repo's 3-line shim)
├── package.json                               name=cheng-fusion-mcp, bun, zod dependency
├── install.sh                                  idempotent ~/.claude.json registration
├── src/
│   ├── runtime.ts                              tiny lazy-module-init helper (copied verbatim)
│   ├── tool_definition_lookup_and_defaults_m2929.ts
│   ├── cheng_toolkit_m9000.ts                  shared toolkit: project-root resolution, CSG facts parsing, driver spawning, cheng-lsp client
│   ├── cheng_fusion_tool_registry.ts           local static registry of the 8 cheng_* tools (replaces the claude-code builtin tool registry)
│   ├── cheng_fusion_mcp_server_m9009.ts        MCP stdio JSON-RPC server
│   ├── cheng_csg_query_m9001.ts
│   ├── cheng_evidence_m9002.ts
│   ├── cheng_csg_roundtrip_m9003.ts
│   ├── cheng_crash_triage_m9004.ts
│   ├── cheng_line_map_read_m9005.ts
│   ├── cheng_lsp_query_m9006.ts
│   ├── cheng_profile_report_m9007.ts
│   └── cheng_symbol_diff_m9008.ts
└── test/                                       hardening-item harness (RSS cap, timeout orphan-kill, stale-facts warning, line-map sidecar)
```

## Notes on what changed vs. the source repo

- **zod**: the source repo vendors a bundled/renamed copy of zod 4's internals (`vendor/m222.ts` re-exporting `m219`/`m211`/etc.). This package uses the real `zod` npm package (`^4.4.3`) instead — verified to expose an identical top-level API for everything actually used (`strictObject`, `enum`, `string`, `number().int().positive()`, `.optional()`, `.describe()`, `.safeParse()`, `.toJSONSchema()`).
- **Tool registry**: the source repo's server filtered `cheng_*` tools out of claude-code's full builtin tool registry (1000+ lines, dozens of unrelated tools). This package registers the 8 `cheng_*` tools directly in `cheng_fusion_tool_registry.ts`, in the same order and with the same init-call sequence as the original registry.
- **`withDefaultToolDefinitionBehavior`**: copied verbatim (12 lines, `tool_definition_lookup_and_defaults_m2929.ts`) — small enough that a minimal reimplementation wasn't warranted.
- **Excluded**: `cheng_fusion_hooks_m9011.ts` (claude-code session/BashTool integration hooks) is not part of this package; it only makes sense inside claude-code's own process, not a standalone MCP server.
