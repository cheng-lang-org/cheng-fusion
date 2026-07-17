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
import {closeSync, constants, existsSync, fstatSync, lstatSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, isAbsolute, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {b as defineModuleInitializer} from "./runtime.ts";
import {
  createChengTextTool,
  jsonResult,
  resolveChengPath,
  resolveChengProjectRoot,
  runChengDriver,
  takeTrailingText,
  initChengToolkitModule,
  zodSchema,
} from "./cheng_toolkit_m9000.ts";
import {ZC_PROCESS_MAX_OUTPUT_BYTES,ZC_TARGET,clusterZcCensusRows,parseZcCensusRun} from "./zc_census_protocol.ts";

var chengResidualPeelInputSchema, ChengResidualPeelTool;

const FUSION_PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_RULES_PATH = join(FUSION_PKG_ROOT, "fixtures", "residual_rules.json");
const DEFAULT_DISPATCH_MIN = "src/core/tooling/backend_driver_dispatch_min.cheng";

const FN_DEF = /^\s*fn\s+([A-Za-z_][\w]*)\s*[\(\[]/;

const MAX_RULES_BYTES = 1024 * 1024;
const RULE_KINDS = new Set(["multi_fn_same_name", "multi_stmt_line"]);
const SEVERITIES = new Set(["high", "medium", "low"]);

function isPathInside(path, parent) {
  const relative = resolve(path).slice(resolve(parent).length);
  return relative === "" || (relative.startsWith("/") && !relative.startsWith("/../"));
}

function assertExactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) throw new Error(`${label} has unsupported field: ${key}`);
  }
}

function stableRegularText(path, label, maxBytes = MAX_RULES_BYTES) {
  let fd = null;
  try {
    const before = lstatSync(path);
    if (!before.isFile() || before.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file: ${path}`);
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.size > maxBytes) throw new Error(`${label} is not a bounded regular file: ${path}`);
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) {
      throw new Error(`${label} changed while opening: ${path}`);
    }
    const bytes = readFileSync(fd);
    const after = lstatSync(path);
    if (!after.isFile() || after.isSymbolicLink() || after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size) {
      throw new Error(`${label} changed while reading: ${path}`);
    }
    return new TextDecoder("utf-8", {fatal: true}).decode(bytes);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(label)) throw error;
    throw new Error(`${label} cannot be read safely: ${path}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

function validateRelativeRulePath(root, value, label) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty relative path`);
  if (isAbsolute(value) || value.split(/[\\/]/).some((part) => part === ".." || part === "")) {
    throw new Error(`${label} must be a normalized non-escaping relative path: ${value}`);
  }
  const candidate = resolve(root, value);
  const rootReal = realpathSync.native(root);
  const candidateReal = realpathSync.native(candidate);
  if (!isPathInside(candidateReal, rootReal)) throw new Error(`${label} escapes root: ${value}`);
  const stat = lstatSync(candidate);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must reference a regular non-symlink source file: ${candidate}`);
  return {relativePath: value, absolutePath: candidate};
}

function loadRules(rulesPath, root) {
  const path = rulesPath || DEFAULT_RULES_PATH;
  const text = stableRegularText(path, "residual rules");
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(`invalid residual rules JSON: ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  assertExactKeys(raw, new Set(["schema", "description", "phases", "rules"]), "residual rules");
  if (raw.schema !== "cheng_residual_rules.v1") throw new Error(`unsupported residual rules schema: ${raw.schema}`);
  if (typeof raw.description !== "string" || !Array.isArray(raw.phases) || !Array.isArray(raw.rules)) {
    throw new Error(`invalid residual rules structure: ${path}`);
  }

  const phaseIds = new Set();
  const phases = raw.phases.map((phase, index) => {
    const label = `residual rules phases[${index}]`;
    assertExactKeys(phase, new Set(["id", "depth", "bodyKinds", "note"]), label);
    if (typeof phase.id !== "string" || phase.id.length === 0 || phaseIds.has(phase.id)) throw new Error(`${label}.id must be unique and non-empty`);
    if (!Number.isSafeInteger(phase.depth) || phase.depth < 0) throw new Error(`${label}.depth must be a non-negative safe integer`);
    if (!Array.isArray(phase.bodyKinds) || phase.bodyKinds.some((kind) => typeof kind !== "string" || kind.length === 0)) throw new Error(`${label}.bodyKinds must be non-empty strings`);
    if (typeof phase.note !== "string") throw new Error(`${label}.note must be a string`);
    phaseIds.add(phase.id);
    return {id: phase.id, depth: phase.depth, bodyKinds: [...phase.bodyKinds], note: phase.note};
  });
  if (phases.length === 0) throw new Error("residual rules must declare at least one phase");

  const ruleIds = new Set();
  const rules = raw.rules.map((rule, index) => {
    const label = `residual rules rules[${index}]`;
    const commonKeys = new Set(["id", "phase", "family", "familyRef", "severityRef", "severity", "paths", "kind", "fixHint", "note", "fnName", "pattern", "requireBreak"]);
    assertExactKeys(rule, commonKeys, label);
    if (typeof rule.id !== "string" || rule.id.length === 0 || ruleIds.has(rule.id)) throw new Error(`${label}.id must be unique and non-empty`);
    if (typeof rule.phase !== "string" || !phaseIds.has(rule.phase)) throw new Error(`${label}.phase references an unknown phase: ${rule.phase}`);
    if (typeof rule.family !== "string" || rule.family.length === 0) throw new Error(`${label}.family must be non-empty`);
    if (!SEVERITIES.has(rule.severity)) throw new Error(`${label}.severity must be high, medium, or low`);
    if (!RULE_KINDS.has(rule.kind)) throw new Error(`${label}.kind is unsupported: ${rule.kind}`);
    for (const optionalText of ["familyRef", "severityRef", "fixHint", "note"]) {
      if (rule[optionalText] !== undefined && typeof rule[optionalText] !== "string") throw new Error(`${label}.${optionalText} must be a string`);
    }
    if (!Array.isArray(rule.paths) || rule.paths.length === 0) throw new Error(`${label}.paths must be non-empty`);
    const seenPaths = new Set();
    const paths = rule.paths.map((item, pathIndex) => {
      const verified = validateRelativeRulePath(root, item, `${label}.paths[${pathIndex}]`);
      if (seenPaths.has(verified.relativePath)) throw new Error(`${label}.paths duplicates ${verified.relativePath}`);
      seenPaths.add(verified.relativePath);
      return verified;
    });
    if (rule.kind === "multi_fn_same_name") {
      if (typeof rule.fnName !== "string" || rule.fnName.length === 0 || rule.pattern !== undefined || rule.requireBreak !== undefined) {
        throw new Error(`${label} multi_fn_same_name requires fnName only`);
      }
    } else {
      if (typeof rule.pattern !== "string" || rule.pattern.length === 0 || (rule.requireBreak !== undefined && typeof rule.requireBreak !== "boolean") || rule.fnName !== undefined) {
        throw new Error(`${label} multi_stmt_line requires pattern and optional requireBreak only`);
      }
      try { new RegExp(rule.pattern); } catch (error) { throw new Error(`${label}.pattern is invalid: ${error instanceof Error ? error.message : String(error)}`); }
    }
    ruleIds.add(rule.id);
    return {...rule, paths};
  });
  if (rules.length === 0) throw new Error("residual rules must declare at least one rule");
  return {path, phases, rules};
}

function phaseDepth(phases, phaseId) {
  const p = phases.find((x) => x.id === phaseId);
  return p && typeof p.depth === "number" ? p.depth : 99;
}

function compareText(left,right){return String(left)<String(right)?-1:String(left)>String(right)?1:0}

function readLines(rulePath) {
  return stableRegularText(rulePath.absolutePath, `residual source ${rulePath.relativePath}`, 64 * 1024 * 1024).split(/\r?\n/);
}

function scanMultiFnSameName(root, rule) {
  const hits = [];
  for (const rulePath of rule.paths) {
    const rel = rulePath.relativePath;
    const lines = readLines(rulePath);
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
  for (const rulePath of rule.paths) {
    const rel = rulePath.relativePath;
    const lines = readLines(rulePath);
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
    } else throw new Error(`unsupported residual rule kind: ${rule.kind}`);
  }
  return hits;
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
  const severityRank={high:0,medium:1,low:2};
  const sourceRank={static:0,census:1};
  items.sort((a,b)=>
    a.depth-b.depth ||
    (severityRank[a.severity]??3)-(severityRank[b.severity]??3) ||
    (sourceRank[a.source]??2)-(sourceRank[b.source]??2) ||
    compareText(a.family,b.family) ||
    compareText(a.ruleId??"",b.ruleId??"") ||
    compareText(a.path??"",b.path??""),
  );
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
        root,
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
        const driver = input.driver
          ? resolve(isAbsolute(String(input.driver)) ? String(input.driver) : join(root, String(input.driver)))
          : join(root,"artifacts","backend_driver","cheng");
        if (!existsSync(driver)) throw new Error(`driver not found: ${driver}`);
        const timeoutMs = input.timeoutSec ? Math.round(input.timeoutSec * 1000) : undefined;
        const diagDir=realpathSync(mkdtempSync(join(tmpdir(),"cheng-fusion-zc-residual-")));
        const diagPrefix="residual";
        const unsetEnv=[...Object.keys(process.env).filter((key)=>key.startsWith("ZC_")),"CHENG_CENSUS_MAX_RSS","CHENG_PROCESS_MAX_RSS_BYTES"];
        try{
          const run = await runChengDriver(scriptPath, [sourcePath], {
            root,cwd:root,timeoutMs,maxBuffer:ZC_PROCESS_MAX_OUTPUT_BYTES,unsetEnv,
            env:{
              ZC_DRIVER:driver,ZC_TARGET,ZC_DIAG_DIR:diagDir,ZC_DIAG_PREFIX:diagPrefix,ZC_NO_CACHE:"1",
              ZC_ENUMERATE_KEEP_WORK:"0",ZC_COMPILER_CSG_STDERR:"0",ZC_PROGRESS:"0",CHENG_PROCESS_MAX_RSS_BYTES:"1073741824",
            },
          });
          if (run.missingDriver) throw new Error(`tools/zc_enumerate.sh not found: ${scriptPath}`);
          const protocol = parseZcCensusRun(run,{root,script:scriptPath,source:sourcePath,driver,target:ZC_TARGET,diagDir,diagPrefix});
          const clusters = protocol.status === "completed" ? clusterZcCensusRows(protocol.rows) : {byBail:[],byBodyKind:[]};
          census = {
            status:protocol.status,
            total:protocol.total,
            totalRaw:protocol.totalRaw,
            threeWayMatch:protocol.threeWayMatch,
            zeroProof:protocol.zeroProof,
            protocolError:protocol.protocolError,
            processOk:protocol.processOk,
            driver:protocol.status === "completed" ? protocol.fields.zc_driver : driver,
            source:protocol.status === "completed" ? protocol.fields.zc_file : sourcePath,
            exitCode: run.exitCode,
            timedOut: Boolean(run.timedOut),
            overflow: Boolean(run.overflow),
            rowCount: protocol.rowCount,
            rows: protocol.rows.slice(0, 100),
            rowsTruncated: protocol.rows.length > 100,
            byBail: clusters.byBail,
            byBodyKind: clusters.byBodyKind,
            histogram:protocol.histogram,
            stdoutTail: takeTrailingText(run.stdout, 3000),
            stderrTail: takeTrailingText(run.stderr, 2000),
          };
        }finally{rmSync(diagDir,{recursive:true,force:true})}
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
              : census && census.status === "aborted"
                ? `Census aborted without usable groups: ${census.protocolError || "zc_enumerate process failure"}`
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

export {ChengResidualPeelTool,buildAttackOrder,initChengResidualPeelModule};
