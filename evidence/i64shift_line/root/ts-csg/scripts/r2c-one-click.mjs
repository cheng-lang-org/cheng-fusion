#!/usr/bin/env node
// r2c 一键管线（M1 收口版）：UniMaker React 组件 → csg-core facts → 全函数转译普查
// → 闭包完整 OK 子集装配 → stage3 编译 → 运行。
//
// 用法:
//   node scripts/r2c-one-click.mjs --component app/components/NodesPage.tsx [--run-asserts file]
// 选项:
//   --component <repo-rel path>   必填，React.js 仓内 tsx/ts 路径（可重复）
//   --run-asserts <file>          可选，拼到程序尾部的 cheng main（缺省 = 空 main）
//   --out <dir>                   输出目录（缺省 tmp/r2c-one-click-<ts>）
// 退出码: 0 = 六步全过（编译+运行 rc=0）
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const REACT_ROOT = "/Users/lbcheng/UniMaker/React.js";
const CHENG = "/Users/lbcheng/cheng-lang/artifacts/bootstrap/cheng.stage3";
const MAIN_TREE = "/Users/lbcheng/cheng-lang";

function parseArgs(argv) {
  const o = { components: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--component") o.components.push(argv[++i]);
    else if (a === "--run-asserts") o.runAsserts = argv[++i];
    else if (a === "--out") o.out = argv[++i];
    else { process.stderr.write(`unknown arg ${a}\n`); process.exit(2); }
  }
  if (o.components.length === 0) { process.stderr.write("missing --component\n"); process.exit(2); }
  return o;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 600000, ...opts });
  if (r.status !== 0) {
    process.stderr.write(`step failed: ${cmd} ${args.join(" ")}\n${r.stderr || ""}\n${r.stdout || ""}\n`);
    process.exit(1);
  }
  return r;
}

const options = parseArgs(process.argv.slice(2));
const outDir = resolve(options.out ?? mkdtempSync(join(packageDir, "tmp", "r2c-one-click-")));
mkdirSync(join(outDir, "src"), { recursive: true });
writeFileSync(join(outDir, "cheng-package.toml"), 'package_id = "r2c-one-click"\n');
cpSync(join(MAIN_TREE, "src", "std"), join(outDir, "src", "std"), { recursive: true });
cpSync(join(MAIN_TREE, "src", "core"), join(outDir, "src", "core"), { recursive: true });
cpSync(join(MAIN_TREE, "src", "apps"), join(outDir, "src", "apps"), { recursive: true });

// [1/5] 抽取
const factsPath = join(outDir, "facts.jsonl");
process.stderr.write(`[1/5] extract ${options.components.join(", ")} -> ${factsPath}\n`);
run(process.execPath, [
  join(packageDir, "dist", "cli.js"), "--emit", "csg-core",
  ...options.components.flatMap((c) => ["--file", join(REACT_ROOT, c)]),
  "--root", REACT_ROOT,
  "--out", factsPath,
]);

// [2/5] 转译普查
process.stderr.write(`[2/5] transpile census\n`);
const { transpileFunctions } = await import(pathToFileURL(join(packageDir, "dist", "csg-cheng-transpiler.js")).href);
const facts = readFileSync(factsPath, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
const allNames = [...new Set(facts.filter((f) => f.kind === "csg.function").map((f) => String(f.name)))];
const census = transpileFunctions(facts, allNames);
const okCount = census.results.filter((r) => r.ok).length;
process.stderr.write(`  functions=${allNames.length} ok=${okCount} fail=${allNames.length - okCount} structDiag=${census.structDiagnostics.length}\n`);
writeFileSync(join(outDir, "census.json"), JSON.stringify({
  functions: allNames.length, ok: okCount,
  fail: allNames.length - okCount,
  diagnostics: census.results.flatMap((r) => r.diagnostics),
}, null, 1));

// [3/5] r2c 组件转译（transpileR2c：useState 槽 + 默认 host 桥 + JSX 树）
process.stderr.write(`[3/5] transpileR2c ${options.component}\n`);
const { transpileR2c } = await import(pathToFileURL(join(packageDir, "dist", "csg-cheng-transpiler.js")).href);
const componentName = options.components[0].split("/").pop().replace(/\.tsx$/, "");
const r2c = transpileR2c(facts, componentName, { alwaysPrelude: ["__r2cLocalStorageGet"] });
const failed = r2c.results.filter((x) => !x.ok);
process.stderr.write(`  slots=[${r2c.slots.map((s) => s.stateName).join(",")}] fns=${r2c.results.length} fail=${failed.length}\n`);
if (failed.length > 0) {
  for (const f of failed.slice(0, 5)) process.stderr.write(`  FAIL ${f.name}: ${f.diagnostics.map((d) => d.reason).join("; ").slice(0, 200)}\n`);
  process.exitCode = 1;
}
writeFileSync(join(outDir, "r2c.json"), JSON.stringify({ component: componentName, slots: r2c.slots, failures: failed.map((f) => ({ name: f.name, diagnostics: f.diagnostics })) }, null, 1));
const mainPath = options.runAsserts ? resolve(options.runAsserts) : undefined;
const mainText = mainPath && existsSync(mainPath) ? readFileSync(mainPath, "utf8") : "fn main(): int32 =\n    r2cStateInit()\n    " + componentName + "()\n    return 0\n";
writeFileSync(join(outDir, "src", "program.cheng"), r2c.code + "\n\n" + mainText);

// [4/5] stage3 编译
process.stderr.write(`[4/5] stage3 compile\n`);
run(CHENG, [
  "system-link-exec", `--root:${outDir}`, "--in:src/program.cheng",
  "--emit:exe", "--target:arm64-apple-darwin",
  `--out:${join(outDir, "program")}`, `--report-out:${join(outDir, "program.report.txt")}`,
]);

// [5/5] 运行
process.stderr.write(`[5/5] run\n`);
const runResult = spawnSync(join(outDir, "program"), [], { encoding: "utf8" });
process.stderr.write(`  exit=${runResult.status}\n`);
process.stdout.write(`outDir=${outDir}\n`);
process.exit(runResult.status === 0 ? 0 : 1);
