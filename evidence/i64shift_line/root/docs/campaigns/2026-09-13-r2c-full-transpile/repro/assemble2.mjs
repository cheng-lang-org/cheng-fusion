// r2c 装配器 v2：facts → 全函数转译 → 闭包完整 OK 子集 → 自行组合单文件 .cheng。
// 与 v1 的差别：不再依赖 transpileFunctions 的整体拼装（它会自动追被调方，无法剔除），
// 而是消费 per-function 结果（.code/.preludeUsed/.structsUsed），由本装配器组合：
//   imports + type 块(剔除残 struct) + prelude(按名) + 保留函数体 + main。
// 保留判据（迭代到不动点）：函数体引用的未限定被调与所引用的 struct 类型全部在保留集内。
// 用法: node assemble2.mjs <facts.jsonl> <out.cheng> [main.cheng]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { transpileFunctions, PRELUDE_SOURCES } from "../../dist/csg-cheng-transpiler.js";

const factsPath = process.argv[2];
const outPath = process.argv[3];
const mainPath = process.argv[4];
const lines = readFileSync(factsPath, "utf8").split("\n").filter((l) => l.trim());
const facts = lines.map(JSON.parse);

const KEYWORDS = new Set(["if", "elif", "else", "while", "for", "in", "return", "panic", "len", "int32", "int64", "uint64", "float32", "bool", "str", "true", "false", "append"]);

const names = [...new Set(facts.filter((f) => f.kind === "csg.function").map((f) => String(f.name)))];
const r = transpileFunctions(facts, names);
const okResults = r.results.filter((x) => x.ok);
const okByName = new Map(okResults.map((x) => [x.name, x]));

// 残 struct：structDiagnostics 形如 "struct 'X.member': ..." → X 剔除。
const brokenStructs = new Set();
for (const d of r.structDiagnostics) {
  const m = d.match(/struct '([A-Za-z0-9_]+)\./);
  if (m) brokenStructs.add(m[1]);
  const m2 = d.match(/struct '([A-Za-z0-9_]+)'/);
  if (m2) brokenStructs.add(m2[1]);
}

// refsOf：函数体引用的未限定被调 + 词法上出现的 struct 名。
function refsOf(text) {
  const calls = new Set();
  const re = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (KEYWORDS.has(m[1])) continue;
    const before = text.slice(Math.max(0, m.index - 16), m.index);
    if (/\b(strings|json|rawbytes|os|strutil|hostops|r2cproc|r2cstatus|r2csurface|zlib)\.$/.test(before)) continue;
    calls.add(m[1]);
  }
  return calls;
}

// 不动点：函数闭包 + prelude 闭包，随后剔除触碰残 struct 的函数（二轮不动点）。
let kept = new Set(okByName.keys());
for (let round = 0; round < 40; round += 1) {
  let changed = false;
  const preludeKept = new Set();
  for (const name of kept) {
    for (const p of okByName.get(name).preludeUsed ?? []) preludeKept.add(p);
  }
  // prelude 内部相互引用（如 jsRandomSuffix36 -> jsDateNow）
  for (const p of preludeKept) {
    const src = PRELUDE_SOURCES.get(p) ?? "";
    for (const q of PRELUDE_SOURCES.keys()) {
      if (q !== p && new RegExp(`\\b${q}\\s*\\(`).test(src)) preludeKept.add(q);
    }
  }
  const defined = new Set([...kept, ...preludeKept]);
  for (const name of [...kept]) {
    const refs = refsOf(okByName.get(name).code);
    for (const callee of refs) {
      if (!defined.has(callee)) {
        kept.delete(name);
        process.stderr.write(`  drop ${name} -> missing ${callee}()\n`);
        changed = true;
        break;
      }
    }
    if (changed && !kept.has(name)) continue;
  }
  if (!changed) {
    // 残 struct 触碰剔除
    for (const name of [...kept]) {
      const body = okByName.get(name).code;
      for (const s of brokenStructs) {
        if (new RegExp(`\\b${s}\\b`).test(body)) {
          kept.delete(name);
          process.stderr.write(`  drop ${name} -> broken struct ${s}\n`);
          changed = true;
          break;
        }
      }
    }
  }
  if (!changed) {
    process.stderr.write(`fixpoint: kept ${kept.size}/${okByName.size} fns\n`);
    break;
  }
}

// 组合。
const preludeKept = new Set();
for (const name of kept) for (const p of okByName.get(name).preludeUsed ?? []) preludeKept.add(p);
for (const p of [...preludeKept]) {
  const src = PRELUDE_SOURCES.get(p) ?? "";
  for (const q of PRELUDE_SOURCES.keys()) {
    if (q !== p && new RegExp(`\\b${q}\\s*\\(`).test(src)) preludeKept.add(q);
  }
}

const full = r.code;
const firstFn = full.indexOf("\nfn ");
let head = full.slice(0, firstFn); // imports + type 块
// type 块剔除残 struct：按空行分段，段首标识名。
if (brokenStructs.size > 0 && head.includes("\ntype\n")) {
  const typeStart = head.indexOf("type\n");
  const typeBlock = head.slice(typeStart);
  const before = head.slice(0, typeStart);
  const paras = typeBlock.split("\n\n");
  const keptParas = paras.filter((p) => {
    const m = p.match(/^type\n/) ? null : p.match(/^    ([A-Za-z0-9_]+)\s*=/);
    if (!m) return true; // "type" 头行保留
    return !brokenStructs.has(m[1]);
  });
  head = before + keptParas.join("\n\n");
}
const preludeTexts = [...preludeKept].sort().map((n) => PRELUDE_SOURCES.get(n) ?? "").filter((s) => s.length > 0);
const bodies = [...kept].map((n) => okByName.get(n).code);
const mainSrc = mainPath && existsSync(mainPath) ? readFileSync(mainPath, "utf8") : "fn main(): int32 =\n    return 0\n";
const out = [head, ...preludeTexts, "", ...bodies, "", mainSrc, ""].join("\n\n");
writeFileSync(outPath, out);
process.stderr.write(`wrote ${outPath} bytes=${out.length}\n`);
