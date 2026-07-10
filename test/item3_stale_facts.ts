// 加固项 3: facts 陈旧警示 — cheng_csg_query/cheng_evidence 响应带 factsGeneratedAt/factsSource
// (从 current.facts 边车 summary.json 读), 查询目标 source 与 facts 实际来源不一致时带 staleWarning。
//
// 用一个真实的临时 Cheng 项目(含 cheng-package.toml + 两个真源文件 a.cheng/b.cheng),
// 真实调用生产 cheng_csg_roundtrip 编出 a.cheng 的 facts, 再查 b.cheng 的符号, 断言 staleWarning。
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {startMcp, assertTrue} from "./mcp_client.ts";

function createFixtureProject() {
  let root = mkdtempSync(join(tmpdir(), "fusion-harness-item3-"));
  root = realpathSync(root);
  writeFileSync(join(root, "cheng-package.toml"), `package_id = "pkg://local/fusion-harness-item3"\n`);
  mkdirSync(join(root, "src"), {recursive: true});
  writeFileSync(join(root, "src", "a.cheng"), `fn FactsSourceIsA(): int32 =\n    return 1\nfn main(): int32 =\n    return FactsSourceIsA()\n`);
  writeFileSync(join(root, "src", "b.cheng"), `fn FactsQueryTargetIsB(): int32 =\n    return 2\n`);
  return root;
}

async function main() {
  const root = createFixtureProject();
  const mcp = startMcp({}, root);
  try {
    await mcp.initialize({rootUri: `file://${root}`, workspaceFolders: [{uri: `file://${root}`, name: "fusion-harness-item3"}]});

    console.log("[setup] roundtrip a.cheng 生成 facts");
    const roundtrip = await mcp.callTool("cheng_csg_roundtrip", {source: "src/a.cheng"});
    assertTrue(roundtrip.isError !== true && roundtrip.parsed?.writerExitCode === 0 && roundtrip.parsed?.readerExitCode === 0, `roundtrip a.cheng 成功, 实得: ${JSON.stringify(roundtrip.parsed).slice(0, 300)}`);

    console.log("[A] 查询 a.cheng 自己的符号(应无 staleWarning)");
    const freshQuery = await mcp.callTool("cheng_csg_query", {kind: "symbol", name: "FactsSourceIsA", file: "src/a.cheng"});
    assertTrue(freshQuery.isError !== true, `查询未报错, 实得: ${JSON.stringify(freshQuery.parsed).slice(0, 200)}`);
    assertTrue(!!freshQuery.parsed.factsGeneratedAt, `响应带 factsGeneratedAt, 实得: ${freshQuery.parsed.factsGeneratedAt}`);
    assertTrue(freshQuery.parsed.factsSource === "src/a.cheng", `响应带 factsSource=src/a.cheng, 实得: ${freshQuery.parsed.factsSource}`);
    assertTrue(!freshQuery.parsed.staleWarning, `查询与 facts 来源一致时不带 staleWarning, 实得: ${freshQuery.parsed.staleWarning}`);

    console.log("[B] 查询 b.cheng 的符号(facts 其实来自 a.cheng, 应有 staleWarning)");
    const staleQuery = await mcp.callTool("cheng_csg_query", {kind: "symbol", name: "FactsQueryTargetIsB", file: "src/b.cheng"});
    assertTrue(staleQuery.isError !== true, `查询未报错(即便陈旧也只是警示不是硬失败), 实得: ${JSON.stringify(staleQuery.parsed).slice(0, 200)}`);
    assertTrue(!!staleQuery.parsed.staleWarning, `查询 b.cheng 时出现 staleWarning, 实得: ${staleQuery.parsed.staleWarning}`);
    assertTrue(staleQuery.parsed.staleWarning.includes("src/a.cheng"), `staleWarning 指出真实 facts 来源 src/a.cheng, 实得: ${staleQuery.parsed.staleWarning}`);
    assertTrue(staleQuery.parsed.staleWarning.includes("src/b.cheng"), `staleWarning 指出被查询的 src/b.cheng, 实得: ${staleQuery.parsed.staleWarning}`);
    // b.cheng 从未被 roundtrip 过, 所以 name 查不到匹配, 但陈旧警示应仍然出现(不依赖查询命不命中)
    assertTrue(Array.isArray(staleQuery.parsed.matches) && staleQuery.parsed.matches.length === 0, `b.cheng 未被 roundtrip 过, matches 应为空, 实得: ${JSON.stringify(staleQuery.parsed.matches)}`);

    console.log("[C] cheng_evidence 同样带 staleWarning");
    const evidenceStale = await mcp.callTool("cheng_evidence", {file: "src/b.cheng"});
    assertTrue(evidenceStale.isError !== true, `cheng_evidence 未报错, 实得: ${JSON.stringify(evidenceStale.parsed).slice(0, 200)}`);
    assertTrue(!!evidenceStale.parsed.staleWarning, `cheng_evidence 查询 b.cheng 时出现 staleWarning, 实得: ${evidenceStale.parsed.staleWarning}`);
    assertTrue(evidenceStale.parsed.factsSource === "src/a.cheng", `cheng_evidence 响应带真实 factsSource=src/a.cheng, 实得: ${evidenceStale.parsed.factsSource}`);

    console.log("[D] cheng_evidence 查 a.cheng 自己(应无 staleWarning)");
    const evidenceFresh = await mcp.callTool("cheng_evidence", {file: "src/a.cheng"});
    assertTrue(!evidenceFresh.parsed.staleWarning, `cheng_evidence 查询 a.cheng 时不带 staleWarning, 实得: ${evidenceFresh.parsed.staleWarning}`);
  } finally {
    mcp.kill();
    rmSync(root, {recursive: true, force: true});
  }
  console.log("item3 stale facts: PASS");
}

main().catch((error) => {
  console.error("item3 stale facts: FAIL", error);
  process.exit(1);
});
