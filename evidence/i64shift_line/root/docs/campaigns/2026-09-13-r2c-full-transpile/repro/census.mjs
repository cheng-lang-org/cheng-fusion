// 全量转译普查：对 csg-core JSONL facts 跑 transpileFunctions，产出 ok/fail 与失败原因分桶。
// 用法: node census.mjs <facts.jsonl> <report.json>
import { readFileSync, writeFileSync } from "node:fs";
import { transpileFunctions } from "../../dist/csg-cheng-transpiler.js";

const factsPath = process.argv[2];
const outPath = process.argv[3];
const lines = readFileSync(factsPath, "utf8").split("\n").filter((l) => l.trim().length > 0);
const facts = lines.map((l) => JSON.parse(l));

const byKind = new Map();
for (const f of facts) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
console.log("fact kinds:", JSON.stringify([...byKind.entries()].sort((a, b) => b[1] - a[1])));

// 候选入口：全部 csg.function 的名字（去重）。
const fnNames = [];
const seenName = new Set();
for (const f of facts) {
  if (f.kind !== "csg.function") continue;
  const name = String(f.name ?? "");
  if (!name || seenName.has(name)) continue;
  seenName.add(name);
  fnNames.push(name);
}
console.log("distinct function names:", fnNames.length);

// 分批转译（每批 200 名，避免单次队列过大后内存爆）。
// 注意 transpileFunctions 每批独立建 index（重解析 facts，成本可控）。
const okFns = [];
const failFns = [];
const reasonBuckets = new Map();
const BATCH = 200;
for (let i = 0; i < fnNames.length; i += BATCH) {
  const batch = fnNames.slice(i, i + BATCH);
  let r;
  try {
    r = transpileFunctions(facts, batch);
  } catch (e) {
    for (const name of batch) failFns.push({ name, reason: `THROW: ${e.message}` });
    continue;
  }
  for (const res of r.results) {
    if (res.ok) {
      okFns.push(res.name);
    } else {
      for (const d of res.diagnostics) {
        failFns.push({ name: res.name, opId: d.opId, reason: d.reason });
        const key = String(d.reason).replace(/0x[0-9a-f]+/g, "0xX").replace(/'[^']*'/g, "'X'").replace(/\b\d+\b/g, "N").slice(0, 140);
        reasonBuckets.set(key, (reasonBuckets.get(key) ?? 0) + 1);
      }
    }
  }
  process.stderr.write(`  batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(fnNames.length / BATCH)}: ok=${okFns.length} fail=${failFns.length}\n`);
}

// structDiagnostics 汇总
let structDiagCount = 0;
{
  const r = transpileFunctions(facts, fnNames.slice(0, 1));
  structDiagCount = r.structDiagnostics.length; // 只作探针; 全量 struct 诊断在批内不重复收集
}

const report = {
  factsTotal: facts.length,
  factKinds: Object.fromEntries([...byKind.entries()].sort((a, b) => b[1] - a[1])),
  distinctFunctionNames: fnNames.length,
  ok: okFns.length,
  fail: new Set(failFns.map((f) => f.name)).size,
  failDiagnostics: failFns.length,
  reasonBuckets: Object.fromEntries([...reasonBuckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60)),
  failList: failFns.slice(0, 4000),
};
writeFileSync(outPath, JSON.stringify(report, null, 1));
console.log(`OK=${okFns.length} FAIL_FN=${report.fail} DIAG=${report.failDiagnostics}`);
console.log("top reasons:");
for (const [k, v] of Object.entries(report.reasonBuckets).slice(0, 15)) console.log(`  ${v}\t${k}`);
