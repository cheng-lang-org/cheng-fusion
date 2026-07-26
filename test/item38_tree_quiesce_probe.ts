#!/usr/bin/env bun
// item38 cheng_tree_quiesce_probe 冻结窗口判决(全 hermetic, 自建 fixture 树 + 受控 mtime):
//   A. 窗口内有改动 → quiet=false, 精确列出改动文件, newestPath/quietForSeconds 与 mtime 一致。
//   B. 全树老于窗口 → quiet=true, quietForSeconds 反映真实静默时长。
//   C. .git 与符号链接不进扫描(符号链接不跟随: 指向窗口内的新文件也不得污染判决)。
//   D. 改动样本上限 50, 但 changedWithinWindowCount 报全量; 排序为最新在前。
//   E. scope 不存在/越出 root/空数组/quietMinutes 非正 一律硬失败, 不给"看起来静了"的软判决。
import assert from "node:assert/strict";
import {mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {handleMcpRequest} from "../src/cheng_fusion_mcp_server_m9009.ts";

const HOUR_SECONDS = 3600;

function assertTrue(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
  console.log(`  ok: ${message}`);
}

async function callQuiesce(args: Record<string, unknown>) {
  const result: any = await handleMcpRequest({jsonrpc: "2.0", id: 1, method: "tools/call", params: {name: "cheng_tree_quiesce_probe", arguments: args}});
  const text = result?.content?.[0]?.text ?? "";
  return {isError: result?.isError === true, text, parsed: result?.isError === true ? null : JSON.parse(text)};
}

function writeAged(path: string, text: string, ageSeconds: number) {
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, text);
  const when = new Date(Date.now() - ageSeconds * 1000);
  utimesSync(path, when, when);
}

function makeFixtureRoot() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "fusion-item38-")));
  writeFileSync(join(root, "cheng-package.toml"), 'name = "quiesce-fixture"\n');
  for (const [relative, ageSeconds] of [
    ["bootstrap/cheng_cold.c", 4 * HOUR_SECONDS],
    ["tools/ci_gate.sh", 3 * HOUR_SECONDS],
    ["src/core/backend/primary_object_plan.cheng", 2 * HOUR_SECONDS],
    ["src/tests/ordinary_zero_exit_fixture.cheng", 5 * HOUR_SECONDS],
  ] as [string, number][]) {
    writeAged(join(root, relative), `// ${relative}\n`, ageSeconds);
  }
  return root;
}

async function main() {
  const root = makeFixtureRoot();
  try {
    console.log("[A] 窗口内改动 → quiet=false 且精确定位");
    const hot = join(root, "src/core/tooling/backend_driver_dispatch_min.cheng");
    writeAged(hot, "// hot edit\n", 60);
    const hotRun = await callQuiesce({root, quietMinutes: 10});
    assertTrue(!hotRun.isError && hotRun.parsed.schema === "cheng_tree_quiesce_probe", "quiesce probe 返回 canonical schema");
    assertTrue(hotRun.parsed.quiet === false && hotRun.parsed.changedWithinWindowCount === 1, "窗口内 1 个改动 → quiet=false");
    assertTrue(hotRun.parsed.changedWithinWindow[0].path === hot && hotRun.parsed.changedWithinWindow[0].relativePath === "src/core/tooling/backend_driver_dispatch_min.cheng", "改动文件路径精确");
    assertTrue(hotRun.parsed.newestPath === hot && hotRun.parsed.quietForSeconds >= 59 && hotRun.parsed.quietForSeconds < 120, "newestPath/quietForSeconds 与真实 mtime 一致");
    assertTrue(hotRun.parsed.fileCount === 5 && hotRun.parsed.scopes.length === 4, "默认 4 个 scope 全走到(4 个初始文件 + 1 个热文件)");

    console.log("[B] 窗口收紧到 0.5 分钟 → 同一棵树判静, quietForSeconds 不变");
    const narrow = await callQuiesce({root, quietMinutes: 0.5});
    assertTrue(narrow.parsed.quiet === true && narrow.parsed.changedWithinWindowCount === 0, "60s 前的改动落在 30s 窗口外 → quiet=true");
    assertTrue(narrow.parsed.newestPath === hot, "quiet=true 仍报出全树最新文件");

    console.log("[C] .git 与符号链接不参与判决");
    writeAged(join(root, "tools/.git/HEAD"), "ref: refs/heads/main\n", 1);
    writeAged(join(root, "outside-scope-fresh.txt"), "fresh\n", 1);
    symlinkSync(join(root, "outside-scope-fresh.txt"), join(root, "src/core/linked_fresh.cheng"));
    const skipped = await callQuiesce({root, quietMinutes: 0.5});
    assertTrue(skipped.parsed.quiet === true && skipped.parsed.fileCount === 5, ".git 目录与符号链接都不进扫描(fileCount 不变)");

    console.log("[D] 改动样本上限 50, 计数报全量, 最新在前");
    for (let index = 0; index < 60; index += 1) {
      writeAged(join(root, `src/tests/burst_${String(index).padStart(2, "0")}.cheng`), "// burst\n", 60 - index);
    }
    const burst = await callQuiesce({root, quietMinutes: 10});
    assertTrue(burst.parsed.changedWithinWindowCount === 61 && burst.parsed.changedWithinWindow.length === 50, "全量计数 61, 样本截断到 50");
    assertTrue(burst.parsed.changedWithinWindow[0].path === join(root, "src/tests/burst_59.cheng"), "样本按 mtime 最新在前");
    const ages = burst.parsed.changedWithinWindow.map((entry: any) => entry.ageSeconds);
    assertTrue(ages.every((age: number, index: number) => index === 0 || ages[index - 1] <= age), "ageSeconds 单调不减(等价于 mtime 递减)");

    console.log("[E] 非法输入硬失败, 不给软判决");
    const missingScope = await callQuiesce({root, scopes: ["src/does_not_exist"]});
    assertTrue(missingScope.isError && /does_not_exist/.test(missingScope.text), "不存在的 scope → 硬失败");
    const escapingScope = await callQuiesce({root, scopes: ["../"]});
    assertTrue(escapingScope.isError && /outside/i.test(escapingScope.text), "越出 root 的 scope → 硬失败");
    const emptyScopes = await callQuiesce({root, scopes: []});
    assertTrue(emptyScopes.isError && /non-empty/.test(emptyScopes.text), "空 scopes → 硬失败");
    const badWindow = await callQuiesce({root, quietMinutes: 0});
    assertTrue(badWindow.isError && /Invalid input/.test(badWindow.text), "quietMinutes=0 被 schema 拒绝");
    const unknownField = await callQuiesce({root, minutes: 10});
    assertTrue(unknownField.isError && /Invalid input/.test(unknownField.text), "未知字段被 strictObject 拒绝");

    console.log("[F] 单 scope 定向查询(共享热文件 >10 分钟静默纪律的用法)");
    const single = await callQuiesce({root, scopes: ["src/core"], quietMinutes: 10});
    assertTrue(single.parsed.scopes.length === 1 && single.parsed.changedWithinWindowCount === 1 && single.parsed.changedWithinWindow[0].path === hot, "只统计指定 scope 内的改动");
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
  console.log("item38 tree quiesce probe: PASS");
}

main().catch((error) => {console.error("item38 tree quiesce probe: FAIL", error); process.exit(1)});
