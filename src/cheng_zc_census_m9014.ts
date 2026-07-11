// @ts-nocheck
// cheng_zc_census: bail/ZC 正典口径工具化。忠实包装 tools/zc_enumerate.sh(唯一正典口径,
// 见 lessons/feedback_zc_enumerate_canonical.md: bail/ZC 测量历史 7 连证伪, 全是即兴 grep
// stderr 造成的伪信号)。这里绝不自创测量口径 —— 只调用该脚本 + 解析它自己的结构化 stdout
// (key=value 字段区 + zc_bail_histogram 区 + zc_rows 区), 按 bail 号/body_kind 聚类。
// 脚本不存在/不适配当前 root 时明确报错, 不静默降级。
import {existsSync} from "node:fs";
import {isAbsolute, join, resolve} from "node:path";
import {b as defineModuleInitializer} from "./runtime.ts";
import {CHENG_CANARY,createChengTextTool,jsonResult,parseZcNotReadyLineFull,resolveChengPath,resolveChengProjectRoot,runChengDriver,takeTrailingText,initChengToolkitModule,zodSchema} from "./cheng_toolkit_m9000.ts";

var chengZcCensusInputSchema,ChengZcCensusTool;

const ZC_KV_LINE = /^([a-z][a-z0-9_]*)=(.*)$/;
const ZC_BAIL_HISTOGRAM_HEADER = "zc_bail_histogram (bail号 -> count):";
const ZC_ROWS_HEADER = "zc_rows (function|body_kind|detail|line|fz_kind|stmt_kind|bail):";
const ZC_HISTOGRAM_LINE = /^\s*bail=(\S+)\s+count=(\d+)\s*$/;

function parseZcCensusRow(rawLine) {
  const text = rawLine.trim();
  // zc_enumerate.sh 的 zc_rows 区两种形态: 有结构化报告时是 pipe 行(见脚本里的
  // echo header), 报告缺失时回退成原始 ZC_NOT_READY 文本行(与 cheng_exec_diff 共用
  // 同一份 parseZcNotReadyLineFull 解析器, 同一个产出源 backend_driver_dispatch_min.cheng)。
  const notReady = parseZcNotReadyLineFull(text);
  if (notReady) return {...notReady, raw: text};
  const fields = text.split("|");
  if (!fields[0]) return {function: null, bodyKind: null, detail: null, line: null, fzKind: null, stmtKind: null, bail: "none", raw: text};
  const bail = fields.length >= 7 && fields[6] !== "" ? fields[6] : "none";
  return {
    function: fields[0],
    bodyKind: fields[1] || null,
    detail: fields[2] || null,
    line: fields[3] ? Number(fields[3]) : null,
    fzKind: fields[4] || null,
    stmtKind: fields[5] || null,
    bail,
    raw: text,
  };
}

function parseZcEnumerateStdout(stdout) {
  const fields = {};
  const histogram = [];
  const rows = [];
  let section = "fields";
  for (const line of String(stdout || "").split(/\r?\n/)) {
    if (line === ZC_BAIL_HISTOGRAM_HEADER) { section = "histogram"; continue; }
    if (line === ZC_ROWS_HEADER) { section = "rows"; continue; }
    if (section === "fields") {
      const match = line.match(ZC_KV_LINE);
      if (match) fields[match[1]] = match[2];
    } else if (section === "histogram") {
      const match = line.match(ZC_HISTOGRAM_LINE);
      if (match) histogram.push({bail: match[1], count: Number(match[2])});
    } else if (section === "rows") {
      if (line.trim()) rows.push(parseZcCensusRow(line));
    }
  }
  return {fields, histogram, rows};
}

function pushGrouped(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function buildByBail(rows, histogram) {
  const byBailMap = new Map();
  for (const row of rows) pushGrouped(byBailMap, row.bail == null || row.bail === "" ? "none" : String(row.bail), row.function);
  const histogramByBail = new Map(histogram.map((entry) => [String(entry.bail), entry.count]));
  const bails = new Set([...byBailMap.keys(), ...histogramByBail.keys()]);
  const out = [];
  for (const bail of bails) {
    const functions = byBailMap.get(bail) || [];
    const entry = {bail, count: functions.length, functions};
    if (histogramByBail.has(bail) && histogramByBail.get(bail) !== functions.length) {
      entry.histogramCount = histogramByBail.get(bail);
      entry.countMismatch = true;
    }
    out.push(entry);
  }
  out.sort((a, b) => b.count - a.count || (a.bail < b.bail ? -1 : a.bail > b.bail ? 1 : 0));
  return out;
}

function buildByBodyKind(rows) {
  const map = new Map();
  for (const row of rows) pushGrouped(map, row.bodyKind || "unknown", row.function);
  return [...map.entries()]
    .map(([bodyKind, functions]) => ({bodyKind, count: functions.length, functions}))
    .sort((a, b) => b.count - a.count || (a.bodyKind < b.bodyKind ? -1 : a.bodyKind > b.bodyKind ? 1 : 0));
}

function parseIntOrNull(value) {
  if (value === undefined || value === null || !/^-?\d+$/.test(value)) return null;
  return Number(value);
}

var initChengZcCensusModule = defineModuleInitializer(() => {
  initChengToolkitModule();
  chengZcCensusInputSchema = zodSchema.strictObject({
    root: zodSchema.string().optional().describe("Cheng project root containing tools/zc_enumerate.sh. Defaults to the active Cheng project root."),
    driver: zodSchema.string().optional().describe("Absolute path to the Cheng driver binary (sets the script's ZC_DRIVER override). Defaults to the script's own pinned default (artifacts/backend_driver/cheng under root)."),
    source: zodSchema.string().optional().describe("Path to the .cheng source to enumerate, absolute or relative to root. Defaults to the canary fixture (src/tests/ordinary_zero_exit_fixture.cheng)."),
    timeoutSec: zodSchema.number().positive().optional().describe("Timeout in seconds for the zc_enumerate.sh run. Default is the tool's driver timeout."),
  });
  ChengZcCensusTool = createChengTextTool({
    name: "cheng_zc_census",
    requiresChengProjectRoot: true,
    searchHint: "canonical zero-C not_ready bail/ZC census for a Cheng source, clustered by bail号 and body_kind",
    inputSchema: chengZcCensusInputSchema,
    description: "Wraps tools/zc_enumerate.sh (the canonical bail/ZC not_ready enumerator, full plan with no fail-fast) faithfully: runs it and parses its own structured stdout (field区 + bail histogram + per-function rows) into byBail/byBodyKind clusters. Never invents its own measurement口径; errors clearly if zc_enumerate.sh does not exist under root.",
    prompt: "Use this for canonical bail/ZC not_ready counting instead of ad-hoc grep on driver stderr (the historical 31/22/191 confusion was exactly that kind of improvised measurement).",
    toAutoClassifierInput: (input) => `zc_census:${input.source || "canary"}`,
    async execute(input) {
      const root = resolveChengProjectRoot({root: input.root});
      const scriptPath = join(root, "tools", "zc_enumerate.sh");
      if (!existsSync(scriptPath)) {
        throw new Error(`tools/zc_enumerate.sh not found under this root (not applicable to this checkout): ${scriptPath}`);
      }
      const sourcePath = resolveChengPath(input.source, CHENG_CANARY, root);
      if (!existsSync(sourcePath)) throw new Error(`source not found: ${sourcePath}`);
      let driver = null;
      if (input.driver) {
        driver = resolve(isAbsolute(String(input.driver)) ? String(input.driver) : join(root, String(input.driver)));
        if (!existsSync(driver)) throw new Error(`driver not found: ${driver}`);
      }
      const timeoutMs = input.timeoutSec ? Math.round(input.timeoutSec * 1000) : undefined;
      const run = await runChengDriver(scriptPath, [sourcePath], {root, cwd: root, timeoutMs, env: driver ? {ZC_DRIVER: driver} : {}});
      if (run.missingDriver) throw new Error(`tools/zc_enumerate.sh not found under this root: ${scriptPath}`);
      const {fields, histogram, rows} = parseZcEnumerateStdout(run.stdout);
      const totalRaw = fields.zc_missing_function_count ?? null;
      const total = parseIntOrNull(totalRaw);
      const status = run.exitCode === 0 && total !== null ? "completed" : "aborted";
      return jsonResult({
        schema: "cheng_zc_census.v1",
        root,
        script: scriptPath,
        driver: fields.zc_driver || driver || null,
        source: fields.zc_file || sourcePath,
        exitCode: run.exitCode,
        status,
        total,
        totalRaw,
        byBail: buildByBail(rows, histogram),
        byBodyKind: buildByBodyKind(rows),
        rowCount: rows.length,
        raw: fields,
        stdoutTail: takeTrailingText(run.stdout, 4000),
        stderrTail: takeTrailingText(run.stderr, 4000),
        timedOut: Boolean(run.timedOut),
      });
    },
  });
});

export {ChengZcCensusTool, initChengZcCensusModule};
