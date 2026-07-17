#!/usr/bin/env bun
// @ts-nocheck
// Equivalent of the source repo's 3-line shim (cheng-fusion-mcp.ts) plus
// cheng_fusion_mcp_entry_m9010.ts, combined into a single entry point.
import {startChengFusionMcpServer} from "./src/cheng_fusion_mcp_server_m9009.ts";

startChengFusionMcpServer().catch((error) => {
  process.stderr.write((error instanceof Error ? error.stack || error.message : String(error)) + "\n");
  process.exit(1);
});
