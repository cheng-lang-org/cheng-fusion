// @ts-nocheck
// cheng_claim_audit: pobj 派发器"认领点"静态审计。诊断性工具, 只产候选清单供人复核,
// 绝不是修复器、也不是判决器 —— 分类是文本级启发式(regex + 缩进回溯), 不理解真实
// 控制流/类型信息。
//
// 背景(见 lessons/textpath_deletion_scope.md, gen2_deref_width_family.md 等): 一个语句
// 一旦被某条路径"认领"(node-eval 接管、或标记 localInitialized、或在派发循环里直接
// continue 跳过后续文本兜底), 就不再走文本 codegen。认领点如果只是"跳过"而没有真正
// 发射任何 IR op、也没有在跳过前 poison 掉这个 slot, 就会静默落穿到更弱的兜底路径去
// 读栈垃圾 —— 这正是 census gap=0 却仍会静默 miscompile 的历史根因(census_abort_deadend
// _fake_rootcause.md、gen2_deref_width_family.md 均实测踩过)。
//
// 三类认领标记, 各自独立扫描:
//   (a) PrimaryBodyIrNodeEvalOnlyOwn( 调用
//   (b) localInitialized = true 赋值
//   (c) 语句派发循环内的 continue —— 用缩进回溯找到每个 `continue` 最近的外层
//       for/while 循环头(逐级往外跳过 if/elif/else 等非循环块, 直到缩进比 continue
//       更浅的那一行), 只有当循环头引用 statements 集合或 stmt/stmtIndex 变量名时才
//       算"语句派发循环"(过滤掉文件里大量无关的字符扫描/intern 查找等 continue, 实测
//       原始 continue 607 处里只有 183 处落在这类循环里)。
//
// 每个标记, 在其前 contextLines 行窗口内找证据:
//   - poison 证据(AppendInvalidOp)存在 -> POISONS(miss 分支有安全网, 最强信号)
//   - 否则若发射证据(add(bodyIR.ops / Append 系调用 / FieldStore / bl 发射 helper)存在 -> EMITS
//   - 否则 -> SILENT_RISK(既没发射也没 poison, 需要人工复核是否会落穿读栈垃圾)
import {existsSync, readFileSync} from "node:fs";
import {isAbsolute, resolve} from "node:path";
import {b as defineModuleInitializer} from "./runtime.ts";
import {createChengTextTool, jsonResult, initChengToolkitModule, zodSchema} from "./cheng_toolkit_m9000.ts";

var chengClaimAuditInputSchema, ChengClaimAuditTool;

const CLAIM_AUDIT_SCHEMA = "cheng_claim_audit";
const DEFAULT_POBJ_PATH = "/Users/lbcheng/cheng-lang/src/core/backend/primary_object_plan.cheng";
const DEFAULT_CONTEXT_LINES = 30;

const NODE_EVAL_ONLY_OWN_CALL = /PrimaryBodyIrNodeEvalOnlyOwn\s*\(/;
const LOCAL_INITIALIZED_TRUE = /\blocalInitialized\s*=\s*true\b/;
const CONTINUE_LINE = /^(\s*)continue\s*$/;
const LOOP_HEADER = /^(\s*)(for|while)\b.*:\s*$/;
const DISPATCH_LOOP_HEADER_HINT = /statements|\bstmt(Index)?\b/i;

const EMIT_EVIDENCE = /add\(\s*bodyIR\.ops|Append\w*\(|FieldStore|\bbl\w*\(/;
const POISON_EVIDENCE = /AppendInvalidOp/;

function assertClaimAuditReportSchema(report) {
  if (!report || typeof report !== "object" || report.schema !== CLAIM_AUDIT_SCHEMA) {
    throw new Error(`unsupported claim audit report schema: ${report?.schema}`);
  }
  return report;
}

function indentOf(rawLine) {
  return rawLine.length - rawLine.replace(/^\s*/, "").length;
}

// 从 continue 行往上回溯: 逐级跳出比它更深的 if/elif/else/嵌套块, 直到遇到缩进更浅的
// 那一行 —— 若那是 for/while 循环头则命中; 否则该浅行成为新的比较基准继续往上找, 直到
// 触底(缩进 0, 通常是 fn 定义行)仍未找到循环头则放弃(说明这个 continue 不在预期形状内)。
function findEnclosingLoopHeader(lines, continueIdx) {
  const continueIndent = indentOf(lines[continueIdx]);
  let threshold = continueIndent;
  for (let j = continueIdx - 1; j >= 0; j--) {
    const raw = lines[j];
    if (!raw.trim()) continue;
    const ind = indentOf(raw);
    if (ind < threshold) {
      if (LOOP_HEADER.test(raw)) return {line: j + 1, text: raw.trim()};
      threshold = ind;
      if (ind === 0) return null;
    }
  }
  return null;
}

function classifySite(lines, markerLineIdx, contextLines) {
  const start = Math.max(0, markerLineIdx - contextLines);
  const window = lines.slice(start, markerLineIdx + 1).join("\n");
  if (POISON_EVIDENCE.test(window)) return "POISONS";
  if (EMIT_EVIDENCE.test(window)) return "EMITS";
  return "SILENT_RISK";
}

function findNodeEvalOnlyOwnSites(lines, contextLines) {
  const sites = [];
  for (let i = 0; i < lines.length; i++) {
    if (!NODE_EVAL_ONLY_OWN_CALL.test(lines[i])) continue;
    if (/^\s*fn\s/.test(lines[i])) continue; // skip the function's own definition line, only count call sites

    sites.push({
      line: i + 1,
      marker: "node_eval_only_own_call",
      classification: classifySite(lines, i, contextLines),
      snippet: lines[i].trim(),
    });
  }
  return sites;
}

function findLocalInitializedSites(lines, contextLines) {
  const sites = [];
  for (let i = 0; i < lines.length; i++) {
    if (!LOCAL_INITIALIZED_TRUE.test(lines[i])) continue;
    sites.push({
      line: i + 1,
      marker: "local_initialized_true",
      classification: classifySite(lines, i, contextLines),
      snippet: lines[i].trim(),
    });
  }
  return sites;
}

function findDispatchLoopContinueSites(lines, contextLines) {
  const sites = [];
  for (let i = 0; i < lines.length; i++) {
    if (!CONTINUE_LINE.test(lines[i])) continue;
    const header = findEnclosingLoopHeader(lines, i);
    if (!header || !DISPATCH_LOOP_HEADER_HINT.test(header.text)) continue;
    sites.push({
      line: i + 1,
      marker: "dispatch_loop_continue",
      classification: classifySite(lines, i, contextLines),
      snippet: lines[i].trim(),
      enclosingLoopLine: header.line,
      enclosingLoopHeader: header.text,
    });
  }
  return sites;
}

function auditPobjClaims(pobjPath, contextLines) {
  const text = readFileSync(pobjPath, "utf8");
  const lines = text.split(/\r?\n/);
  const sites = [
    ...findNodeEvalOnlyOwnSites(lines, contextLines),
    ...findLocalInitializedSites(lines, contextLines),
    ...findDispatchLoopContinueSites(lines, contextLines),
  ].sort((a, b) => a.line - b.line);
  const summary = {emits: 0, poisons: 0, silentRisk: 0, total: sites.length};
  for (const site of sites) {
    if (site.classification === "EMITS") summary.emits++;
    else if (site.classification === "POISONS") summary.poisons++;
    else summary.silentRisk++;
  }
  return {sites, summary};
}

var initChengClaimAuditModule = defineModuleInitializer(() => {
  initChengToolkitModule();
  chengClaimAuditInputSchema = zodSchema.strictObject({
    pobjPath: zodSchema.string().optional().describe(`Absolute path to primary_object_plan.cheng. Defaults to ${DEFAULT_POBJ_PATH}.`),
    contextLines: zodSchema.number().int().positive().optional().describe("Lines of preceding context scanned for emit/poison evidence at each marker site. Default 30."),
  });
  ChengClaimAuditTool = createChengTextTool({
    name: "cheng_claim_audit",
    searchHint: "static heuristic audit of pobj dispatcher claim sites (node-eval-own / localInitialized / dispatch-loop continue) classified EMITS/POISONS/SILENT_RISK",
    inputSchema: chengClaimAuditInputSchema,
    description: "Diagnostic-only static audit of primary_object_plan.cheng's statement-claim sites: PrimaryBodyIrNodeEvalOnlyOwn( calls, localInitialized = true assignments, and continue statements inside statement-dispatch loops (found by indentation backtrack to the nearest enclosing for/while whose header references statements/stmt). Each site is classified by regex-scanning its preceding context window for emission evidence (add(bodyIR.ops, Append* calls, FieldStore, bl* emit helpers) or poison evidence (AppendInvalidOp): POISONS > EMITS > SILENT_RISK. This is a TEXT-LEVEL HEURISTIC, not control-flow or type-aware — classifications are CANDIDATES for human review, not verdicts. Never use this tool's output alone to justify deleting a text-path fallback; the real deletion gate (per project lessons) is census gap=0 AND golden runtime match AND poison-on-miss, verified independently.",
    prompt: "Use this to get a candidate list of claim sites in primary_object_plan.cheng worth reviewing for silent-miscompile risk (a site that claims ownership of a statement but neither emits nor poisons is the dangerous shape). Treat the classification as a lead, not a finding.",
    toAutoClassifierInput: (input) => `claim_audit:${input.pobjPath || "default"}`,
    async execute(input) {
      const rawPath = input.pobjPath || DEFAULT_POBJ_PATH;
      const pobjPath = isAbsolute(rawPath) ? resolve(rawPath) : resolve(process.cwd(), rawPath);
      if (!existsSync(pobjPath)) throw new Error(`pobjPath not found: ${pobjPath}`);
      const contextLines = input.contextLines || DEFAULT_CONTEXT_LINES;
      const {sites, summary} = auditPobjClaims(pobjPath, contextLines);
      return jsonResult(assertClaimAuditReportSchema({schema: CLAIM_AUDIT_SCHEMA, pobjPath, contextLines, sites, summary}));
    },
  });
});

export {ChengClaimAuditTool, assertClaimAuditReportSchema, initChengClaimAuditModule};
