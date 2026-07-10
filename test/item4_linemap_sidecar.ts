// 加固项 4: line_map 巨文件策略 — 源文件旁 `<source>.map` 边车若存在且 mtime 新于源文件,
// 直接读边车不重算(不过 LSP); 否则超时保护下重算(走真实 cheng-lsp)。
//
// 用一个真实源文件 + 人工边车(带哨兵函数名, 与源文件真实内容不同)来证明:
// 命中边车时返回的确实是边车里的内容(不是悄悄仍走 LSP 重算又刚好一致这种假阳性),
// 边车 mtime 落后于源文件时则回退真实 LSP 路径。
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, utimesSync, statSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {startMcp, assertTrue} from "./mcp_client.ts";

function createFixtureProject() {
  let root = mkdtempSync(join(tmpdir(), "fusion-harness-item4-"));
  root = realpathSync(root);
  writeFileSync(join(root, "cheng-package.toml"), `package_id = "pkg://local/fusion-harness-item4"\n`);
  mkdirSync(join(root, "src"), {recursive: true});
  writeFileSync(join(root, "src", "big.cheng"), `fn RealFnInSource(): int32 =\n    return 7\nfn main(): int32 =\n    return RealFnInSource()\n`);
  return root;
}

function sidecarText(sourcePath: string) {
  return [
    "cheng_line_map_v1",
    "entry_count=1",
    `entry\tSidecarSentinelFn\tSidecarSentinelFn\t${sourcePath}\t1\t2`,
    "",
  ].join("\n");
}

async function main() {
  const root = createFixtureProject();
  const sourcePath = join(root, "src", "big.cheng");
  const sidecarPath = `${sourcePath}.map`;
  try {
    console.log("[A] 无边车时: 走真实 cheng-lsp, 结果是源文件真实内容");
    {
      const mcp = startMcp({}, root);
      try {
        await mcp.initialize({rootUri: `file://${root}`, workspaceFolders: [{uri: `file://${root}`, name: "fusion-harness-item4"}]});
        const {isError, parsed} = await mcp.callTool("cheng_line_map_read", {file: "src/big.cheng"});
        assertTrue(isError !== true, `无边车调用未报错, 实得: ${JSON.stringify(parsed).slice(0, 200)}`);
        assertTrue(parsed.cacheHit === false, `无边车时 cacheHit=false, 实得 ${parsed.cacheHit}`);
        assertTrue(parsed.functions?.some((f: any) => f.funcName === "RealFnInSource" || f.functionName === "RealFnInSource"), `结果含真实函数名 RealFnInSource, 实得: ${JSON.stringify(parsed.functions)}`);
      } finally {
        mcp.kill();
      }
    }

    console.log("[B] 写新鲜边车(mtime 新于源文件, 含哨兵函数名) -> 应直接读边车, <2s, 不过 LSP");
    writeFileSync(sidecarPath, sidecarText(sourcePath));
    {
      const sourceStat = statSync(sourcePath);
      const freshFuture = new Date(sourceStat.mtime.getTime() + 60000);
      utimesSync(sidecarPath, freshFuture, freshFuture);
    }
    {
      const mcp = startMcp({}, root);
      try {
        await mcp.initialize({rootUri: `file://${root}`, workspaceFolders: [{uri: `file://${root}`, name: "fusion-harness-item4"}]});
        const started = Date.now();
        const {isError, parsed} = await mcp.callTool("cheng_line_map_read", {file: "src/big.cheng"});
        const elapsedMs = Date.now() - started;
        assertTrue(isError !== true, `边车命中调用未报错, 实得: ${JSON.stringify(parsed).slice(0, 200)}`);
        assertTrue(parsed.cacheHit === true, `新鲜边车时 cacheHit=true, 实得 ${parsed.cacheHit}`);
        assertTrue(parsed.cachePath === sidecarPath, `cachePath 指向边车文件, 实得 ${parsed.cachePath}`);
        assertTrue(parsed.functions?.some((f: any) => f.funcName === "SidecarSentinelFn"), `结果确实来自边车哨兵内容(不是又悄悄重算), 实得: ${JSON.stringify(parsed.functions)}`);
        assertTrue(elapsedMs < 2000, `命中边车耗时 <2s, 实得 ${elapsedMs}ms`);
        console.log(`  ok: 边车命中耗时 ${elapsedMs}ms`);
      } finally {
        mcp.kill();
      }
    }

    console.log("[C] 边车 mtime 落后于源文件 -> 应回退真实 LSP 重算(cacheHit=false)");
    {
      const past = new Date(Date.now() - 3600 * 1000);
      utimesSync(sidecarPath, past, past);
      // 顺带把源文件 touch 得比边车新
      const now = new Date();
      utimesSync(sourcePath, now, now);
    }
    {
      const mcp = startMcp({}, root);
      try {
        await mcp.initialize({rootUri: `file://${root}`, workspaceFolders: [{uri: `file://${root}`, name: "fusion-harness-item4"}]});
        const {isError, parsed} = await mcp.callTool("cheng_line_map_read", {file: "src/big.cheng"});
        assertTrue(isError !== true, `陈旧边车调用未报错, 实得: ${JSON.stringify(parsed).slice(0, 200)}`);
        assertTrue(parsed.cacheHit === false, `陈旧边车时 cacheHit=false(回退真实 LSP), 实得 ${parsed.cacheHit}`);
        assertTrue(parsed.functions?.some((f: any) => f.funcName === "RealFnInSource" || f.functionName === "RealFnInSource"), `陈旧边车被忽略, 结果是真实重算内容, 实得: ${JSON.stringify(parsed.functions)}`);
      } finally {
        mcp.kill();
      }
    }
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
  console.log("item4 line_map sidecar: PASS");
}

main().catch((error) => {
  console.error("item4 line_map sidecar: FAIL", error);
  process.exit(1);
});
