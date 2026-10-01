// r2c 装配库：facts → 闭包完整 OK 子集 → 单文件 .cheng 程序文本。
// 保留判据（迭代到不动点）：函数转译 OK 且其体引用的未限定被调与 struct 类型全部在
// 保留集内；残 struct（TypeMapper 报 structDiagnostics 的）剔除并级联剔除引用者。
// 绝不发射悬空调用（编译器会拒绝）。
import { transpileFunctions, PRELUDE_SOURCES } from "../dist/csg-cheng-transpiler.js";

const KEYWORDS = new Set(["if", "elif", "else", "while", "for", "in", "return", "panic", "len", "int32", "int64", "uint64", "float32", "bool", "str", "true", "false", "append"]);
const PRIMITIVES = /^(int64|int32|bool|float32|float64|uint64)$/;

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

function preludeClosure(seeds) {
  const kept = new Set(seeds);
  for (let changed = true; changed; ) {
    changed = false;
    for (const p of [...kept]) {
      const src = PRELUDE_SOURCES.get(p) ?? "";
      for (const q of PRELUDE_SOURCES.keys()) {
        if (q !== p && !kept.has(q) && new RegExp(`\\b${q}\\s*\\(`).test(src)) {
          kept.add(q);
          changed = true;
        }
      }
    }
  }
  return kept;
}

export function assemble(facts, mainText) {
  const names = [...new Set(facts.filter((f) => f.kind === "csg.function").map((f) => String(f.name)))];
  const r = transpileFunctions(facts, names);
  const okByName = new Map(r.results.filter((x) => x.ok).map((x) => [x.name, x]));

  const brokenStructs = new Set();
  for (const d of r.structDiagnostics) {
    const m = d.match(/struct '([A-Za-z0-9_]+)[\.'.]/);
    if (m) brokenStructs.add(m[1]);
  }

  let kept = new Set(okByName.keys());
  for (let round = 0; round < 40; round += 1) {
    let changed = false;
    const defined = new Set([...kept, ...preludeClosure(new Set([...kept].flatMap((n) => [...okByName.get(n).preludeUsed ?? []])))]);
    for (const name of [...kept]) {
      for (const callee of refsOf(okByName.get(name).code)) {
        if (!defined.has(callee)) {
          kept.delete(name);
          changed = true;
          break;
        }
      }
    }
    if (!changed) {
      for (const name of [...kept]) {
        const body = okByName.get(name).code;
        for (const s of brokenStructs) {
          if (new RegExp(`\\b${s}\\b`).test(body)) {
            kept.delete(name);
            changed = true;
            break;
          }
        }
      }
    }
    if (!changed) break;
  }

  const preludeKept = preludeClosure(new Set([...kept].flatMap((n) => [...okByName.get(n).preludeUsed ?? []])));
  const full = r.code;
  const firstFn = full.indexOf("\nfn ");
  let head = firstFn >= 0 ? full.slice(0, firstFn) : full;
  if (brokenStructs.size > 0 && head.includes("\ntype\n")) {
    const typeStart = head.indexOf("type\n");
    const before = head.slice(0, typeStart);
    const paras = head.slice(typeStart).split("\n\n");
    const keptParas = paras.filter((p) => {
      const m = p.match(/^    ([A-Za-z0-9_]+)\s*=/);
      return !m || !brokenStructs.has(m[1]);
    });
    head = before + keptParas.join("\n\n");
  }
  const preludeTexts = [...preludeKept].sort().map((n) => PRELUDE_SOURCES.get(n) ?? "").filter((s) => s.length > 0);
  const bodies = [...kept].map((n) => okByName.get(n).code);
  const main = mainText && mainText.trim().length > 0 ? mainText : "fn main(): int32 =\n    return 0\n";
  const counts = { functions: names.length, ok: okByName.size, kept: kept.size, brokenStructs: [...brokenStructs] };
  return { code: [head, ...preludeTexts, "", ...bodies, "", main, ""].join("\n\n"), counts };
}
