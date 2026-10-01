import assert from "node:assert/strict";

const mode = process.argv[2] ?? "";
assert.ok(mode === "js" || mode === "web", "usage: runtime-gate.mjs js|web");

const label = mode === "js" ? "Cheng JS Runtime" : "Cheng Web Runtime";
process.stderr.write(`${label} is not implemented yet; refusing to pass a runtime smoke without a real Cheng provider.\n`);
process.exitCode = 1;
