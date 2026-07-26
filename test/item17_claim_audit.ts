// cheng_claim_audit focused contract: real MCP ingress, deterministic source scan,
// canonical report schema, and explicit rejection of the retired schema suffix.
import assert from "node:assert/strict";
import {mkdtempSync, realpathSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {assertClaimAuditReportSchema} from "../src/cheng_claim_audit_m9017.ts";
import {assertTrue, startMcp} from "./mcp_client.ts";

async function main() {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), "fusion-claim-audit-")));
  const source = join(scratch, "primary_object_plan.cheng");
  writeFileSync(source, [
    "fn Probe(statements: int32[]): int32 =",
    "    PrimaryBodyIrNodeEvalOnlyOwn(1)",
    "    localInitialized = true",
    "    for stmt in statements:",
    "        continue",
    "    return 0",
    "",
  ].join("\n"));

  const mcp = startMcp({}, scratch);
  try {
    await mcp.initialize({});
    const report = await mcp.callTool("cheng_claim_audit", {pobjPath: source, contextLines: 4});
    assertTrue(report.isError !== true, `claim audit 调用成功: ${JSON.stringify(report.parsed).slice(0, 300)}`);
    assertTrue(report.parsed.schema === "cheng_claim_audit", `claim audit 使用唯一 canonical schema，实得 ${report.parsed.schema}`);
    assertTrue(Array.isArray(report.parsed.sites) && report.parsed.sites.length === 3, `三个真实认领标记均进入报告，实得 ${report.parsed.sites?.length}`);
    assertTrue(report.parsed.summary?.total === 3, `summary.total=3，实得 ${report.parsed.summary?.total}`);
    assert.throws(
      () => assertClaimAuditReportSchema({...report.parsed, schema: "cheng_claim_audit.v1"}),
      /unsupported claim audit report schema/,
      "legacy claim-audit report schema must be rejected",
    );

    const unknown = await mcp.callTool("cheng_claim_audit", {pobjPath: source, bogus: true});
    assertTrue(unknown.isError === true, "unknown claim-audit input field hard-fails");
  } finally {
    mcp.kill();
    rmSync(scratch, {recursive: true, force: true});
  }
  console.log("item17 claim_audit: PASS");
}

main().catch((error) => {
  console.error("item17 claim_audit: FAIL", error);
  process.exit(1);
});
