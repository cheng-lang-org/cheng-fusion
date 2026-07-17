// cheng_residual_peel 端到端: 静态 mode 确定性 + schema + 主仓真扫。
// 不跑 mode=full census(20min+ RSS)。
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {startMcp, assertTrue} from "./mcp_client.ts";

const CHENG_ROOT = "/Users/lbcheng/cheng-lang";

async function main() {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), "fusion-harness-item12-")));
  try {
    const mcp = startMcp({}, CHENG_ROOT);
    try {
      await mcp.initialize({
        rootUri: `file://${CHENG_ROOT}`,
        workspaceFolders: [{uri: `file://${CHENG_ROOT}`, name: "cheng-lang"}],
      });

      console.log("[A] mode=static on main tree: freeSeq multi still open; multi_stmt optional after ad83a9e82");
      {
        const {isError, parsed} = await mcp.callTool(
          "cheng_residual_peel",
          {root: CHENG_ROOT, mode: "static"},
          undefined,
          30000,
        );
        assertTrue(isError !== true, `no error, got ${JSON.stringify(parsed).slice(0, 400)}`);
        assertTrue(parsed.schema === "cheng_residual_peel.v1", `schema, got ${parsed.schema}`);
        assertTrue(parsed.mode === "static", `mode=static`);
        assertTrue(parsed.census === null, `census skipped in static`);
        assertTrue(Array.isArray(parsed.static.hits), `static.hits array`);
        assertTrue(Array.isArray(parsed.attackOrder), `attackOrder array`);
        assertTrue(Array.isArray(parsed.maskedRisk), `maskedRisk array`);

        const freeSeq = parsed.static.hits.find((h) => h.ruleId === "freeSeq_multi_overload");
        assertTrue(!!freeSeq, `freeSeq multi-overload hit present on main (still multi freeSeq defs)`);
        assertTrue(freeSeq.count >= 2, `freeSeq count>=2, got ${freeSeq.count}`);
        assertTrue(freeSeq.phase === "call_resolve", `freeSeq phase call_resolve`);

        // multi_stmt_semicolon_break: historical residual (ParseCondition split in ad83a9e82).
        // Main may report 0 hits; rule machinery asserted on synthetic mini below.
        const multi = parsed.static.hits.find((h) => h.ruleId === "multi_stmt_semicolon_break");
        const multiCount = multi ? multi.count : 0;
        if (multi) {
          assertTrue(multi.count >= 1, `multi_stmt if present count>=1, got ${multi.count}`);
          assertTrue(multi.phase === "statement_bodyir", `multi phase statement_bodyir`);
        }

        const hasCallStep = parsed.attackOrder.some((s) => s.phase === "call_resolve");
        assertTrue(hasCallStep, `attackOrder includes call_resolve`);
        // maskedRisk only lists deeper-phase static hits; empty when multi_stmt cleared (ad83a9e82).
        if (multiCount > 0) {
          assertTrue(parsed.maskedRisk.length >= 1, `maskedRisk non-empty when deep static still open`);
        }
        assertTrue(typeof parsed.summary.nextAction === "string" && parsed.summary.nextAction.length > 0, `nextAction`);
        console.log(
          `  ok: staticHits=${parsed.static.hitCount} sites=${parsed.static.siteCount} freeSeq=${freeSeq.count} multi=${multiCount} attackSteps=${parsed.attackOrder.length}`,
        );
      }

      console.log("[B] tiny fixture root: freeSeq multi + multi_stmt rule machinery on synthetic mini");
      {
        const proj = join(scratch, "mini");
        mkdirSync(join(proj, "src/std"), {recursive: true});
        mkdirSync(join(proj, "src/core/backend"), {recursive: true});
        writeFileSync(join(proj, "cheng-package.toml"), 'name = "mini"\n');
        writeFileSync(
          join(proj, "src/std/seqs.cheng"),
          [
            "fn freeSeq(seqInst: var str[]) =",
            "    return",
            "fn freeSeq(seqInst: var bool[]) =",
            "    return",
            "fn freeSeq(seqInst: var T[]) =",
            "    return",
            "",
          ].join("\n"),
        );
        writeFileSync(
          join(proj, "src/core/backend/primary_object_plan.cheng"),
          [
            "fn ParseLike() =",
            "    if true:",
            "        opPos = i; opLen = 2; tag = 1; break",
            "",
          ].join("\n"),
        );
        const {isError, parsed} = await mcp.callTool(
          "cheng_residual_peel",
          {root: proj, mode: "static"},
          undefined,
          15000,
        );
        assertTrue(isError !== true, `mini no error: ${JSON.stringify(parsed).slice(0, 300)}`);
        assertTrue(parsed.static.hits.some((h) => h.ruleId === "freeSeq_multi_overload" && h.count === 3), `mini freeSeq count=3`);
        // Synthetic HAS multi_stmt `;…; break` so rule scanner must still fire after main tree fixed.
        assertTrue(parsed.static.hits.some((h) => h.ruleId === "multi_stmt_semicolon_break" && h.count === 1), `mini multi count=1 (rule machinery)`);
      }

      console.log("[C] unknown field rejected");
      {
        const {isError} = await mcp.callTool(
          "cheng_residual_peel",
          {root: CHENG_ROOT, mode: "static", bogus: true},
          undefined,
          10000,
        );
        assertTrue(isError === true, `unknown field → isError`);
      }
    } finally {
      mcp.kill();
    }
  } finally {
    rmSync(scratch, {recursive: true, force: true});
  }
  console.log("item12 residual_peel: PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
