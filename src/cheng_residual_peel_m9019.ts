// @ts-nocheck
// cheng_residual_peel: 跨相位 residual 预剥板(P0)。
//
// 问题: zc_enumerate 同层可一次列全(45→1), 但跨层(call_resolve → statement_bodyir →
// stream_emit)会挡板剥洋葱。本工具一次调用产出:
//   1) static_hits — 不跑重编译的形扫(秒级), 预杀 freeSeq 多载 / multi-stmt `;` 等
//   2) census     — 可选, 忠实包装 zc_enumerate(与 cheng_zc_census 同口径)
//   3) families   — 静态+动态按 phase/bodyKind 聚类
//   4) attack_order — 浅→深刀序 + fixHint
//
// 诚实边界: 不能单靠本工具预言 stream-emit 全部未来洞; static 是 lead 不是 verdict。
// 规则表: fixtures/residual_rules.json (可扩展)。
import {existsSync, readFileSync, readdirSync, statSync} from "node:fs";
import {dirname, isAbsolute, join, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {b as defineModuleInitializer} from "./runtime.ts";
import {
  createChengTextTool,
  jsonResult,
  parseZcNotReadyLineFull,
  resolveChengPath,
  resolveChengProjectRoot,
  runChengDriver,
  takeTrailingText,
  initChengToolkitModule,
  zodSchema,
} from "./cheng_toolkit_m9000.ts";

var chengResidualPeelInputSchema, ChengResidualPeelTool;

const FUSION_PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_RULES_PATH = join(FUSION_PKG_ROOT, "fixtures", "residual_rules.json");
const DEFAULT_DISPATCH_MIN = "src/core/tooling/backend_driver_dispatch_min.cheng";

const ZC_KV_LINE = /^([a-z][a-z0-9_]*)=(.*)$/;
const ZC_BAIL_HISTOGRAM_HEADER = "zc_bail_histogram (bail号 -> count):";
const ZC_ROWS_HEADER = "zc_rows (function|body_kind|detail|line|fz_kind|stmt_kind|bail):";
const ZC_HISTOGRAM_LINE = /^\s*bail=(\S+)\s+count=(\d+)\s*$/;
const FN_DEF = /^\s*fn\s+([A-Za-z_][\w]*)\s*[\(\[]/;

function loadRules(rulesPath) {
  const path = rulesPath || DEFAULT_RULES_PATH;
  if (!existsSync(path)) throw new Error(`residual rules not found: ${path}`);
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (!raw || !Array.isArray(raw.rules)) throw new Error(`invalid residual rules (need rules[]): ${path}`);
  return {path, phases: raw.phases || [], rules: raw.rules};
}

function phaseDepth(phases, phaseId) {
  const p = phases.find((x) => x.id === phaseId);
  return p && typeof p.depth === "number" ? p.depth : 99;
}

function parseZcCensusRow(rawLine) {
  const text = rawLine.trim();
  const notReady = parseZcNotReadyLineFull(text);
  if (notReady) return {...notReady, raw: text};
  const fields = text.split("|");
  if (!fields[0]) {
    return {function: null, bodyKind: null, detail: null, line: null, fzKind: null, stmtKind: null, bail: "none", raw: text};
  }
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
    if (line === ZC_BAIL_HISTOGRAM_HEADER) {
      section = "histogram";
      continue;
    }
    if (line === ZC_ROWS_HEADER) {
      section = "rows";
      continue;
    }
    if (section === "fields") {
      const match = line.match(ZC_KV_LINE);
      if (match) fields[match[1]] = match[2];
    } else if (section === "histogram") {
      const match = line.match(ZC_HISTOGRAM_LINE);
      if (match) histogram.push({bail: match[1], count: Number(match[2])});
    } else if (section === "rows") {
      if (line.trim() && line.includes("|")) rows.push(parseZcCensusRow(line));
    }
  }
  return {fields, histogram, rows};
}

function parseIntOrNull(value) {
  if (value === undefined || value === null || !/^-?\d+$/.test(String(value))) return null;
  return Number(value);
}

function readLines(absPath) {
  return readFileSync(absPath, "utf8").split(/\r?\n/);
}

function scanMultiFnSameName(root, rule) {
  const hits = [];
  const paths = rule.paths || [];
  for (const rel of paths) {
    const abs = join(root, rel);
    if (!existsSync(abs)) continue;
    const lines = readLines(abs);
    const defs = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(FN_DEF);
      if (!m || m[1] !== rule.fnName) continue;
      defs.push({line: i + 1, snippet: lines[i].trim()});
    }
    if (defs.length >= 2) {
      hits.push({
        ruleId: rule.id,
        phase: rule.phase,
        family: rule.family,
        severity: rule.severity || "medium",
        path: rel,
        kind: "multi_fn_same_name",
        fnName: rule.fnName,
        count: defs.length,
        sites: defs,
        fixHint: rule.fixHint || null,
        familyRef: rule.familyRef || null,
      });
    }
  }
  return hits;
}

function scanMultiStmtLine(root, rule) {
  const hits = [];
  const re = new RegExp(rule.pattern || "=\\s*[^;\\n]+;\\s*[A-Za-z_][\\w.]*\\s*=");
  const requireBreak = rule.requireBreak !== false;
  const paths = rule.paths || [];
  for (const rel of paths) {
    const abs = join(root, rel);
    if (!existsSync(abs)) continue;
    const lines = readLines(abs);
    const sites = [];
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      if (!re.test(text)) continue;
      if (requireBreak && !/\bbreak\b/.test(text)) continue;
      // skip pure comments
      if (/^\s*#/.test(text)) continue;
      sites.push({line: i + 1, snippet: text.trim().slice(0, 200)});
    }
    if (sites.length > 0) {
      hits.push({
        ruleId: rule.id,
        phase: rule.phase,
        family: rule.family,
        severity: rule.severity || "medium",
        path: rel,
        kind: "multi_stmt_line",
        count: sites.length,
        sites: sites.slice(0, 50),
        sitesTruncated: sites.length > 50,
        fixHint: rule.fixHint || null,
        familyRef: rule.familyRef || null,
      });
    }
  }
  return hits;
}

function runStaticScan(root, rules) {
  const hits = [];
  for (const rule of rules) {
    if (rule.kind === "multi_fn_same_name") {
      hits.push(...scanMultiFnSameName(root, rule));
    } else if (rule.kind === "multi_stmt_line") {
      hits.push(...scanMultiStmtLine(root, rule));
    }
  }
  return hits;
}

function clusterCensusRows(rows) {
  const byBodyKind = new Map();
  const byBail = new Map();
  for (const row of rows) {
    const bk = row.bodyKind || "unknown";
    if (!byBodyKind.has(bk)) byBodyKind.set(bk, []);
    byBodyKind.get(bk).push(row);
    const bail = row.bail == null || row.bail === "" ? "none" : String(row.bail);
    if (!byBail.has(bail)) byBail.set(bail, []);
    byBail.get(bail).push(row.function);
  }
  return {
    byBodyKind: [...byBodyKind.entries()]
      .map(([bodyKind, list]) => ({
        bodyKind,
        count: list.length,
        functions: list.map((r) => r.function),
        details: list.map((r) => r.detail).filter(Boolean),
      }))
      .sort((a, b) => b.count - a.count || a.bodyKind.localeCompare(b.bodyKind)),
    byBail: [...byBail.entries()]
      .map(([bail, functions]) => ({bail, count: functions.length, functions}))
      .sort((a, b) => b.count - a.count || a.bail.localeCompare(b.bail)),
  };
}

function phaseForBodyKind(phases, bodyKind) {
  for (const p of phases) {
    if ((p.bodyKinds || []).includes(bodyKind)) return p.id;
  }
  return "unknown";
}

function buildAttackOrder(phases, staticHits, censusClusters) {
  const items = [];
  // static first, ordered by phase depth
  for (const hit of staticHits) {
    items.push({
      source: "static",
      phase: hit.phase,
      depth: phaseDepth(phases, hit.phase),
      ruleId: hit.ruleId,
      family: hit.family,
      severity: hit.severity,
      path: hit.path,
      count: hit.count,
      fixHint: hit.fixHint,
      note: "static shape lead — verify with zc_enumerate after fix",
    });
  }
  // census bodyKinds not already covered as pure static-only story
  if (censusClusters) {
    for (const g of censusClusters.byBodyKind) {
      const phase = phaseForBodyKind(phases, g.bodyKind);
      items.push({
        source: "census",
        phase,
        depth: phaseDepth(phases, phase),
        ruleId: null,
        family: g.bodyKind,
        severity: "high",
        path: null,
        count: g.count,
        functions: g.functions.slice(0, 20),
        fixHint: null,
        note: "live census row family — same-phase list is complete for this bodyKind",
      });
    }
  }
  items.sort((a, b) => a.depth - b.depth || (a.severity === "high" ? -1 : 1) || String(a.family).localeCompare(String(b.family)));
  return items;
}

function buildMaskedRisk(phases, staticHits, censusTotal) {
  // If call_resolve static still open, deeper static hits are "masked risk" for peel narrative.
  const callHits = staticHits.filter((h) => h.phase === "call_resolve");
  const deepHits = staticHits.filter((h) => phaseDepth(phases, h.phase) > 0);
  if (callHits.length === 0 && (censusTotal === 0 || censusTotal === null)) return [];
  if (callHits.length === 0) {
    // call static clean but census may still have MCT; still flag deep static as next peel
    return deepHits.map((h) => ({
      ruleId: h.ruleId,
      family: h.family,
      reason: "deeper-phase static hit; may surface as next residual after current census layer clears",
      path: h.path,
      count: h.count,
    }));
  }
  return deepHits.map((h) => ({
    ruleId: h.ruleId,
    family: h.family,
    reason: "likely masked until call_resolve residuals (static and/or census missing_call_target) clear",
    path: h.path,
    count: h.count,
  }));
}

var initChengResidualPeelModule = defineModuleInitializer(() => {
  initChengToolkitModule();
  chengResidualPeelInputSchema = zodSchema.strictObject({
    root: zodSchema
      .string()
      .optional()
      .describe("Cheng project root (cheng-package.toml). Defaults to active Cheng project root."),
    mode: zodSchema
      .enum(["static", "full"])
      .optional()
      .describe("static = shape scan only (seconds). full = static + zc_enumerate (minutes, RSS-heavy). Default static."),
    driver: zodSchema
      .string()
      .optional()
      .describe("Pinned driver for census (ZC_DRIVER). Only used when mode=full."),
    source: zodSchema
      .string()
      .optional()
      .describe("Census fixture. Default src/core/tooling/backend_driver_dispatch_min.cheng when mode=full."),
    rulesPath: zodSchema
      .string()
      .optional()
      .describe("Override residual rules JSON. Default fixtures/residual_rules.json in cheng-fusion package."),
    timeoutSec: zodSchema
      .number()
      .positive()
      .optional()
      .describe("Census timeout seconds when mode=full. Default tool driver timeout."),
  });
  ChengResidualPeelTool = createChengTextTool({
    name: "cheng_residual_peel",
    requiresChengProjectRoot: true,
    searchHint: "residual peel plan static freeSeq multi-stmt ZC census attack order phase mask",
    inputSchema: chengResidualPeelInputSchema,
    description:
      "One-shot residual peel board for Pass B / ZC work: static anti-pattern scan (freeSeq multi-overload, multi-stmt semicolon-break, …) plus optional canonical zc_enumerate census, clustered by phase/bodyKind with shallow→deep attack_order. Does not invent ZC counts; census path is faithful to tools/zc_enumerate.sh. Static hits are leads, not compile verdicts. Cannot fully predict stream-emit failures without a green earlier phase.",
    prompt:
      "Use this instead of ad-hoc peel loops when closing ZC: mode=static for a fast pre-peel of known shapes; mode=full after load is free for census+static board. Prefer static before launching a 20min zc_enumerate.",
    toAutoClassifierInput: (input) => `residual_peel:${input.mode || "static"}`,
    async execute(input) {
      const root = resolveChengProjectRoot({root: input.root});
      const mode = input.mode || "static";
      const {path: rulesPath, phases, rules} = loadRules(
        input.rulesPath
          ? resolve(isAbsolute(String(input.rulesPath)) ? String(input.rulesPath) : join(root, String(input.rulesPath)))
          : DEFAULT_RULES_PATH,
      );

      const staticHits = runStaticScan(root, rules);

      let census = null;
      if (mode === "full") {
        const scriptPath = join(root, "tools", "zc_enumerate.sh");
        if (!existsSync(scriptPath)) {
          throw new Error(`tools/zc_enumerate.sh not found under this root: ${scriptPath}`);
        }
        const sourcePath = resolveChengPath(input.source || DEFAULT_DISPATCH_MIN, DEFAULT_DISPATCH_MIN, root);
        if (!existsSync(sourcePath)) throw new Error(`source not found: ${sourcePath}`);
        let driver = null;
        if (input.driver) {
          driver = resolve(isAbsolute(String(input.driver)) ? String(input.driver) : join(root, String(input.driver)));
          if (!existsSync(driver)) throw new Error(`driver not found: ${driver}`);
        }
        const timeoutMs = input.timeoutSec ? Math.round(input.timeoutSec * 1000) : undefined;
        const run = await runChengDriver(scriptPath, [sourcePath], {
          root,
          cwd: root,
          timeoutMs,
          env: driver ? {ZC_DRIVER: driver} : {},
        });
        if (run.missingDriver) throw new Error(`tools/zc_enumerate.sh not found: ${scriptPath}`);
        const {fields, histogram, rows} = parseZcEnumerateStdout(run.stdout);
        const totalRaw = fields.zc_missing_function_count ?? null;
        const total = parseIntOrNull(totalRaw);
        const status = run.exitCode === 0 && total !== null ? "completed" : "aborted";
        const clusters = clusterCensusRows(rows);
        census = {
          status,
          total,
          totalRaw,
          threeWayMatch: fields.zc_count_three_way_match || null,
          driver: fields.zc_driver || driver || null,
          source: fields.zc_file || sourcePath,
          exitCode: run.exitCode,
          timedOut: Boolean(run.timedOut),
          rowCount: rows.length,
          rows: rows.slice(0, 100),
          rowsTruncated: rows.length > 100,
          byBail: clusters.byBail,
          byBodyKind: clusters.byBodyKind,
          histogram,
          stdoutTail: takeTrailingText(run.stdout, 3000),
          stderrTail: takeTrailingText(run.stderr, 2000),
        };
      }

      const attackOrder = buildAttackOrder(phases, staticHits, census);
      const maskedRisk = buildMaskedRisk(phases, staticHits, census ? census.total : null);

      const staticByPhase = {};
      for (const h of staticHits) {
        staticByPhase[h.phase] = (staticByPhase[h.phase] || 0) + h.count;
      }

      return jsonResult({
        schema: "cheng_residual_peel.v1",
        root,
        mode,
        rulesPath,
        limits:
          "Static hits are shape leads only. Census (mode=full) is the sole authority for zc_missing_function_count. Cross-phase peel: deeper bodyKinds often stay masked until shallower residuals clear — use attack_order + maskedRisk, do not claim ZC=0 from static alone.",
        static: {
          hitCount: staticHits.length,
          siteCount: staticHits.reduce((n, h) => n + (h.count || 0), 0),
          byPhase: staticByPhase,
          hits: staticHits,
        },
        census,
        attackOrder,
        maskedRisk,
        summary: {
          staticHits: staticHits.length,
          staticSites: staticHits.reduce((n, h) => n + (h.count || 0), 0),
          censusTotal: census ? census.total : null,
          censusStatus: census ? census.status : "skipped",
          attackSteps: attackOrder.length,
          maskedRiskCount: maskedRisk.length,
          nextAction:
            staticHits.length > 0
              ? `Clear phase-0 static first: ${staticHits
                  .filter((h) => h.phase === "call_resolve")
                  .map((h) => h.ruleId)
                  .join(", ") || staticHits[0].ruleId}; then re-run mode=full when load free.`
              : census && census.total === 0
                ? "Static clean and census total=0 — candidate A-gate (still require three-way match + frozen clone policy)."
                : census
                  ? "Static clean; chase census attack_order bodyKinds (stream/statement)."
                  : "Static clean; run mode=full for live census when machine free.",
        },
      });
    },
  });
});

export {ChengResidualPeelTool, initChengResidualPeelModule};
