// r2c M2 机制 stage3 烟测：useState 状态槽 + web-storage 桥 + JSX 节点树 + dirty。
// 全链真实：真实 tsx 夹具 → csg-core 抽取 → transpileR2c → stage3 编译 → 运行断言。
// 用法: node scripts/r2c-smoke-stage3.test.mjs   (需 ts-csg 已 npm run build)
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const packageDir = join(dirnameFromFile(import.meta.url), "..");
function dirnameFromFile(url) { return new URL(".", url).pathname.replace(/\/$/, ""); }

const REACT_ROOT = "/Users/lbcheng/UniMaker/React.js";
const CHENG = "/Users/lbcheng/cheng-lang/artifacts/bootstrap/cheng.stage3";
const MAIN_TREE = "/Users/lbcheng/cheng-lang";

// [1] 真实抽取（fixture 必须落在 React.js 项目内 —— Merkle admission 的项目封闭性）
const fixtureAbs = join(REACT_ROOT, "app", "R2cSmoke.tsx");
writeFileSync(fixtureAbs, `import React, { useState } from 'react';

export function R2cSmoke(): any {
  const [count, setCount] = useState(3);
  const [name, setName] = useState("cheng");
  localStorage.setItem("who", "r2c");
  setCount(7);
  return (
    <div className="wrap">
      <span>{name}</span>
      <p>{count}</p>
    </div>
  );
}
`);
try {
  const scratch = mkdtempSync(join(tmpdir(), "r2c-smoke-"));
  const factsPath = join(scratch, "facts.jsonl");
  const extract = spawnSync(process.execPath, [
    join(packageDir, "dist", "cli.js"), "--emit", "csg-core",
    "--file", fixtureAbs, "--root", REACT_ROOT, "--out", factsPath,
  ], { encoding: "utf8", timeout: 300000 });
  assert.equal(extract.status, 0, `extract must succeed: ${extract.stderr}\n${extract.stdout}`);

  // [2] transpileR2c
  const { transpileR2c } = await import(pathToFileURL(join(packageDir, "dist", "csg-cheng-transpiler.js")).href);
  const facts = readFileSync(factsPath, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  const r2c = transpileR2c(facts, "R2cSmoke");
  assert.equal(r2c.componentFound, true, "component must be found");
  assert.deepEqual(r2c.results.filter((x) => !x.ok).map((x) => x.name), [], `all fns must transpile: ${JSON.stringify(r2c.results.filter((x) => !x.ok).flatMap((x) => x.diagnostics))}`);
  assert.deepEqual(r2c.slots.map((s) => `${s.stateName}:${s.chengType}`).sort(), ["count:int64", "name:str"], "state slots must be extracted with exact types");

  // [3] 组装 + stage3 编译 + 运行
  const mainText = `fn main(): int32 =
    r2cStateInit()
    R2cSmoke()
    if __r2c_count != 7:
        return 1
    if __r2cLocalStorageGet("who") != "r2c":
        return 2
    if __r2cJsxNodeLen != 5:
        return 3
    if __r2cJsxNodes[0].tag != "div" || __r2cJsxNodes[0].className != "wrap":
        return 4
    if __r2cJsxNodes[2].text != "cheng":
        return 5
    if __r2cJsxNodes[4].text != "7":
        return 6
    if !r2cTakeDirty():
        return 7
    if r2cTakeDirty():
        return 8
    return 0
`;
  writeFileSync(join(scratch, "cheng-package.toml"), 'package_id = "r2c-smoke"\n');
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
  assert.equal(run.status, 0, `all 8 assertions must pass (rc=0), got ${run.status}`);
  process.stdout.write("PASS (r2c useState+storage+jsx stage3: 8/8 rc=0)\n");
  rmSync(scratch, { recursive: true, force: true });
} finally {
  rmSync(fixtureAbs, { force: true });
}
