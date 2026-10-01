// r2c M2 验收 headless 回放：HomePage 搜索/排序语义切片（真实源码摘录）经
// extract → transpileR2c → stage3 编译 → 状态序列回放，断言节点树随状态变化。
// 回放序列: init -> setSearchQuery("旅行") -> 清搜索+setSortType("time") -> setSearchQuery("视频")
// 用法: node scripts/r2c-headless-replay.test.mjs   (需 ts-csg 已 npm run build)
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const packageDir = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const REACT_ROOT = "/Users/lbcheng/UniMaker/React.js";
const CHENG = "/Users/lbcheng/cheng-lang/artifacts/bootstrap/cheng.stage3";
const MAIN_TREE = "/Users/lbcheng/cheng-lang";
const FIXTURE_ABS = join(REACT_ROOT, "app", "HomePageSearchSlice.tsx");

// 切片源码 = HomePage.tsx 真实语义链摘录 (displayContents useMemo 的 time 排序 + 搜索过滤)
writeFileSync(FIXTURE_ABS, `import React, { useState, useMemo } from 'react';

interface SliceContent {
  contentId: string;
  title: string;
  publishCategory: string;
  timestamp: number;
  isDuplicate: boolean;
}

export function HomePageSearchSlice(): any {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortType, setSortType] = useState<string>('hot');
  const [distributedContents, setDistributedContents] = useState<SliceContent[]>([]);

  const displayContents = useMemo(() => {
    let filtered = distributedContents.filter(c => !c.isDuplicate);
    if (sortType === 'time') {
      filtered = [...filtered].sort((a, b) => b.timestamp - a.timestamp);
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(content => content.title.toLowerCase().includes(query));
    }
    return filtered;
  }, [distributedContents, sortType, searchQuery]);

  const count = displayContents.length;
  const firstTitle = count > 0 ? displayContents[0].title : '';
  return (
    <div className="feed">
      <p>{count}</p>
      <span>{firstTitle}</span>
    </div>
  );
}
`);
try {
  const scratch = mkdtempSync(join(tmpdir(), "r2c-replay-"));
  const factsPath = join(scratch, "facts.jsonl");
  const extract = spawnSync(process.execPath, [
    join(packageDir, "dist", "cli.js"), "--emit", "csg-core",
    "--file", FIXTURE_ABS, "--root", REACT_ROOT, "--out", factsPath,
  ], { encoding: "utf8", timeout: 300000 });
  assert.equal(extract.status, 0, `extract must succeed: ${extract.stderr}`);

  const { transpileR2c } = await import(pathToFileURL(join(packageDir, "dist", "csg-cheng-transpiler.js")).href);
  const facts = readFileSync(factsPath, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  const r2c = transpileR2c(facts, "HomePageSearchSlice");
  assert.deepEqual(r2c.results.filter((x) => !x.ok).map((x) => x.name), [], `all fns must transpile: ${JSON.stringify(r2c.results.filter((x) => !x.ok).flatMap((x) => x.diagnostics))}`);
  assert.deepEqual(r2c.slots.map((s) => s.stateName).sort(), ["distributedContents", "searchQuery", "sortType"], "the search/sort state chain must be slotted");

  const mainText = `fn main(): int32 =
    r2cStateInit()
    var c1: SliceContent
    c1.contentId = "c1"
    c1.title = "阿尔法测试视频"
    c1.publishCategory = "video"
    c1.timestamp = 100
    c1.isDuplicate = false
    add(__r2c_distributedContents, c1)
    var c2: SliceContent
    c2.contentId = "c2"
    c2.title = "贝塔手记"
    c2.publishCategory = "video"
    c2.timestamp = 300
    c2.isDuplicate = false
    add(__r2c_distributedContents, c2)
    var c3: SliceContent
    c3.contentId = "c3"
    c3.title = "伽马旅行笔记"
    c3.publishCategory = "note"
    c3.timestamp = 200
    c3.isDuplicate = false
    add(__r2c_distributedContents, c3)
    __r2cJsxReset()
    HomePageSearchSlice()
    if __r2cJsxNodes[2].text != "3":
        return 2
    if __r2cJsxNodes[4].text != "阿尔法测试视频":
        return 3
    setSearchQuery("旅行")
    __r2cJsxReset()
    HomePageSearchSlice()
    if __r2cJsxNodes[2].text != "1":
        return 4
    if __r2cJsxNodes[4].text != "伽马旅行笔记":
        return 5
    setSearchQuery("")
    setSortType("time")
    __r2cJsxReset()
    HomePageSearchSlice()
    if __r2cJsxNodes[2].text != "3":
        return 6
    if __r2cJsxNodes[4].text != "贝塔手记":
        return 7
    setSearchQuery("视频")
    __r2cJsxReset()
    HomePageSearchSlice()
    if __r2cJsxNodes[2].text != "1":
        return 8
    if __r2cJsxNodes[4].text != "阿尔法测试视频":
        return 9
    if !r2cTakeDirty():
        return 10
    return 0
`;
  writeFileSync(join(scratch, "cheng-package.toml"), 'package_id = "r2c-replay"\n');
  mkdirSync(join(scratch, "src"), { recursive: true });
  cpSync(join(MAIN_TREE, "src", "std"), join(scratch, "src", "std"), { recursive: true });
  cpSync(join(MAIN_TREE, "src", "core"), join(scratch, "src", "core"), { recursive: true });
  cpSync(join(MAIN_TREE, "src", "apps"), join(scratch, "src", "apps"), { recursive: true });
  writeFileSync(join(scratch, "src", "prog.cheng"), r2c.code + "\n\n" + mainText);
  const exePath = join(scratch, "prog");
  const compile = spawnSync(CHENG, [
    "system-link-exec", `--root:${scratch}`, "--in:src/prog.cheng",
    "--emit:exe", "--target:arm64-apple-darwin",
    `--out:${exePath}`, `--report-out:${join(scratch, "prog.report.txt")}`,
  ], { encoding: "utf8", timeout: 600000 });
  assert.equal(compile.status, 0, `stage3 compile must succeed: ${compile.stderr}\n${compile.stdout}`);
  assert.match(compile.stdout + compile.stderr, /real_backend_codegen=1/, "must hit real backend codegen");
  chmodSync(exePath, 0o755);
  const run = spawnSync(exePath, [], { encoding: "utf8" });
  assert.equal(run.status, 0, `headless state-sequence replay must pass (rc=0), got ${run.status}`);
  process.stdout.write("PASS (r2c headless replay: search-filter/sort-reorder/dirty 10 checks rc=0)\n");
  rmSync(scratch, { recursive: true, force: true });
} finally {
  rmSync(FIXTURE_ABS, { force: true });
}
