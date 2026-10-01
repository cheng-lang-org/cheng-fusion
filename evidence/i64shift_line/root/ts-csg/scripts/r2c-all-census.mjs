// r2c 全组件批量普查：对 UniMaker 全部 React 组件逐个跑 transpileR2c，
// 统计 槽数/refs/fn ok/fail/诊断 top 桶，产出 JSON + markdown 两个视图。
// 用法: node scripts/r2c-all-census.mjs [facts.jsonl] [outJson] [outMd] [--limit N]
//   --limit N 只转译前 N 个组件（抽样模式，报告会注明）。
import { readFileSync, writeFileSync, createReadStream } from "node:fs";
import { readdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { join, dirname, basename, relative } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageDir = dirname(__dirname); // ts-csg/

const args = process.argv.slice(2);
const flagValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
};
const limit = flagValue("--limit") !== undefined ? Number(flagValue("--limit")) : Infinity;

const factsPath = args[0] ?? join(packageDir, "tmp", "r2c-census", "unimaker-facts-v5.jsonl");
const jsonOut = args[1] ?? join(packageDir, "tmp", "r2c-census", "all-components-matrix.json");
const mdOut = args[2] ?? "/Users/lbcheng/cheng-lang/docs/campaigns/2026-09-13-r2c-full-transpile/reports/all-components-matrix.md";
const reactApp = "/Users/lbcheng/UniMaker/React.js/app";

const t0 = Date.now();
const elapsedSec = () => ((Date.now() - t0) / 1000).toFixed(1);

// ---------- [1] 组件清单：扫全部 .tsx，推导组件名候选 ----------
function walkTsx(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTsx(abs));
    else if (entry.isFile() && entry.name.endsWith(".tsx")) out.push(abs);
  }
  return out;
}

// 每个文件的组件名候选：export default function X > export default X > 文件名 stem 变体
// （kebab/snake 转 PascalCase：alert-dialog -> AlertDialog；全大写缩写变体：input-otp -> InputOTP）。
function componentCandidates(absPath, relPath) {
  const text = readFileSync(absPath, "utf8");
  const mFn = text.match(/export default function ([A-Za-z0-9_$]+)/);
  if (mFn) return [mFn[1]];
  const mId = text.match(/export default ([A-Za-z0-9_$]+)\s*;/);
  const stem = basename(relPath).replace(/\.tsx$/, "");
  const parts = stem.split(/[-_]/).filter((p) => p.length > 0);
  const pascal = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
  const upper = parts.map((p) => (p.length <= 3 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1))).join("");
  const stems = [...new Set([pascal, upper])];
  return mId ? [...new Set([mId[1], ...stems])] : stems;
}

const tsxFiles = walkTsx(reactApp)
  .map((abs) => ({ abs, rel: relative(dirname(reactApp), abs) }))
  .sort((a, b) => (a.rel < b.rel ? -1 : 1));

// ---------- [2] 流式扫 facts：建 facts 数组 + csg.function 名字索引 ----------
// 逐行 readline（文本不整载），每行 JSON.parse 后立即进 facts 数组；csg.function
// 行顺带记 name -> file/exported（同名取首个）。220MB / ~78 万行。
process.stderr.write(`[1/3] streaming facts: ${factsPath}\n`);
const facts = [];
const fnMeta = new Map(); // name -> { file, exported }
let factsTotal = 0;
const rl = createInterface({ input: createReadStream(factsPath, "utf8"), crlfDelay: Infinity });
for await (const line of rl) {
  if (line.length === 0) continue;
  const f = JSON.parse(line);
  facts.push(f);
  factsTotal++;
  if (f.kind === "csg.function") {
    const name = String(f.name ?? "");
    if (name && name !== "<anonymous>" && !fnMeta.has(name)) {
      fnMeta.set(name, { file: f.loc?.file ?? "", exported: f.exported === true });
    }
  }
}
process.stderr.write(`  facts=${factsTotal} fns=${fnMeta.size} (${elapsedSec()}s)\n`);

// ---------- [3] 解析组件名 -> facts 函数名，逐组件 transpileR2c ----------
const components = [];
const seenName = new Map(); // name -> files[]
for (const { abs, rel } of tsxFiles) {
  const candidates = componentCandidates(abs, rel);
  let resolved = null;
  for (const c of candidates) {
    if (fnMeta.has(c)) { resolved = c; break; }
  }
  const name = resolved ?? candidates[0];
  if (!seenName.has(name)) seenName.set(name, []);
  seenName.get(name).push(rel);
  if (!components.some((c) => c.name === name)) {
    components.push({ name, file: rel, found: resolved !== null });
  }
}
const dupNames = [...seenName.entries()].filter(([, fs]) => fs.length > 1);

const { transpileR2c } = await import(
  pathToFileURL(join(packageDir, "dist", "csg-cheng-transpiler.js")).href
);

// 诊断归一化分桶（与全项目普查同口径）：hex/引号串/数字打码。
const normReason = (s) =>
  String(s)
    .replace(/0x[0-9a-f]+/gi, "0xX")
    .replace(/'[^']*'/g, "'X'")
    .replace(/\b\d+\b/g, "N")
    .slice(0, 120);

const topBuckets = (reasons, n) => {
  const m = new Map();
  for (const r of reasons) m.set(r, (m.get(r) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ count: v, reason: k }));
};

process.stderr.write(`[2/3] transpileR2c per component (${components.length} names${limit !== Infinity ? `, limit=${limit}` : ""})\n`);
const rows = [];
let attempted = 0;
for (const comp of components) {
  if (attempted >= limit) { rows.push({ ...comp, status: "SKIPPED_SAMPLING" }); continue; }
  attempted++;
  if (!comp.found) {
    rows.push({ ...comp, status: "NOT_IN_FACTS", fnTotal: 0, fnOk: 0, fnFail: 0, slots: 0, refs: 0, diagCount: 0, topBuckets: [] });
    continue;
  }
  const reasons = [];
  try {
    const r = transpileR2c(facts, comp.name);
    const fnOk = r.results.filter((x) => x.ok).length;
    const fnFail = r.results.length - fnOk;
    for (const res of r.results) for (const d of res.diagnostics ?? []) reasons.push(d.reason ?? String(d));
    for (const d of r.slotDiagnostics ?? []) reasons.push(d);
    for (const d of r.refDiagnostics ?? []) reasons.push(d);
    rows.push({
      ...comp,
      status: "OK",
      fnTotal: r.results.length,
      fnOk,
      fnFail,
      slots: r.slots.length,
      refs: r.refs.length,
      diagCount: reasons.length,
      topBuckets: topBuckets(reasons, 3),
    });
  } catch (e) {
    rows.push({ ...comp, status: "THROW", fnTotal: 0, fnOk: 0, fnFail: 0, slots: 0, refs: 0, diagCount: 0, topBuckets: [], error: String(e?.message ?? e).slice(0, 200) });
  }
  const last = rows[rows.length - 1];
  const eta = ((Date.now() - t0) / 1000 / attempted * (components.length - attempted)).toFixed(0);
  process.stderr.write(
    `  ${attempted}/${components.length} ${comp.name} ok=${last.fnOk} fail=${last.fnFail} slots=${last.slots} refs=${last.refs} diag=${last.diagCount} elapsed=${elapsedSec()}s eta=${eta}s\n`
  );
}

// ---------- [3] 汇总 + 两个视图 ----------
const done = rows.filter((r) => r.status === "OK");
const found = rows.filter((r) => r.status === "OK" || r.status === "THROW");
const summary = {
  factsFile: factsPath,
  factsTotal,
  reactApp,
  tsxFileTotal: tsxFiles.length,
  distinctComponents: rows.length,
  resolvedInFacts: found.length,
  notInFacts: rows.filter((r) => r.status === "NOT_IN_FACTS").length,
  throws: rows.filter((r) => r.status === "THROW").length,
  samplingNote: limit !== Infinity ? `抽样：前 ${attempted} 个组件（--limit ${limit}）` : "全量",
  transpiledAnyFn: done.filter((r) => r.fnOk > 0).length,
  fullyClean: done.filter((r) => r.fnFail === 0 && r.diagCount === 0).length,
  zeroFnOk: done.filter((r) => r.fnOk === 0 && r.fnFail > 0).length,
  slotsTotal: done.reduce((s, r) => s + r.slots, 0),
  refsTotal: done.reduce((s, r) => s + r.refs, 0),
  diagTotal: done.reduce((s, r) => s + r.diagCount, 0),
  fnOkTotal: done.reduce((s, r) => s + r.fnOk, 0),
  fnFailTotal: done.reduce((s, r) => s + r.fnFail, 0),
  duplicateComponentNames: dupNames.map(([n, fs]) => ({ name: n, files: fs })),
  globalTopBuckets: topBuckets(done.flatMap((r) => (r.topBuckets ?? []).flatMap((b) => Array(b.count).fill(b.reason))), 10),
  elapsedSec: elapsedSec(),
};

const report = { summary, components: rows };
writeFileSync(jsonOut, JSON.stringify(report, null, 1));

const bucketText = (r) =>
  (r.topBuckets ?? []).map((b) => `${b.count}×${b.reason}`).join("<br>") || (r.status === "OK" ? "—" : r.status === "THROW" ? `THROW: ${r.error}` : "未在 facts 中找到同名函数");
const md = [];
md.push("# r2c 全组件转译率矩阵（transpileR2c 批量普查）");
md.push("");
md.push(`- facts：\`${factsPath}\`（${summary.factsTotal} 行）`);
md.push(`- 范围：\`${reactApp}\` 全部 ${summary.tsxFileTotal} 个 .tsx → 去重后 ${summary.distinctComponents} 个组件名，${summary.resolvedInFacts} 个在 facts 中解析到函数`);
md.push(`- 口径：每组件 \`transpileR2c(facts, name)\`；fn ok = 该组件闭包内转译成功函数数；诊断含 slot/ref 诊断；${summary.samplingNote}`);
md.push(`- 结果：**fn ok 合计 ${summary.fnOkTotal} / fail ${summary.fnFailTotal}**；有产出组件（fn ok>0）${summary.transpiledAnyFn} 个；全清（无 fail 无诊断）${summary.fullyClean} 个；零解锁（fn ok=0）${summary.zeroFnOk} 个；槽合计 ${summary.slotsTotal}，refs 合计 ${summary.refsTotal}；耗时 ${summary.elapsedSec}s`);
md.push("");
md.push("## 诊断 top 桶（全局）");
md.push("");
for (const b of summary.globalTopBuckets) md.push(`- ${b.count} × ${b.reason}`);
md.push("");
md.push("## 矩阵");
md.push("");
md.push("| 组件 | 文件 | 槽 | ref | fn ok/fail | 诊断 | top 诊断桶 |");
md.push("|---|---|---|---|---|---|---|");
for (const r of rows) {
  md.push(`| ${r.name} | ${r.file} | ${r.slots ?? 0} | ${r.refs ?? 0} | ${r.fnOk ?? 0}/${r.fnFail ?? 0} | ${r.diagCount ?? 0} | ${bucketText(r)} |`);
}
md.push("");
writeFileSync(mdOut, md.join("\n"));

process.stderr.write(`[3/3] done: json=${jsonOut}\n      md=${mdOut}\n`);
console.log(JSON.stringify({
  distinctComponents: summary.distinctComponents,
  resolvedInFacts: summary.resolvedInFacts,
  transpiledAnyFn: summary.transpiledAnyFn,
  zeroFnOk: summary.zeroFnOk,
  notInFacts: summary.notInFacts,
  fnOkTotal: summary.fnOkTotal,
  fnFailTotal: summary.fnFailTotal,
  slotsTotal: summary.slotsTotal,
  elapsedSec: summary.elapsedSec,
}));
