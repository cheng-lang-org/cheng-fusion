// shape-census.mjs — UniMaker React.js TSX 形状普查器（阶段一）
//
// 用 TypeScript Compiler API 遍历全部 TSX，按形状签名（非逐站点）统计四域：
//   A. JSX 子表达式（expression container 内表达式形态）
//   B. handler（DOM 元素 onXxx 属性）
//   C. hooks（useState/useEffect/useRef/useMemo/useCallback/useContext）
//   D. 组件间通信（自定义组件 props 回调 / children）
//
// 产出 shape-census.json：形状×频次×文件×行号×代表样本。
// 用法: node scripts/shape-census.mjs [rootDir] [outJson]
//   rootDir 默认 /Users/lbcheng/UniMaker/React.js；outJson 默认 <repo>/ts-csg/tmp/shape-census.json

import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.argv[2] ?? "/Users/lbcheng/UniMaker/React.js";
const OUT = process.argv[3] ?? path.resolve(import.meta.dirname, "..", "tmp", "shape-census.json");

// 采集上限：每形状保留的样本数与文件清单长度（census 是签名级，样本仅作代表）
const SAMPLE_LIMIT = 8;
const FILE_LIST_LIMIT = 200;

const shapes = new Map(); // signature -> { count, files:Set, samples:[], gaps:Set }
const register = (signature, file, line, text, gap = null) => {
  let e = shapes.get(signature);
  if (!e) { e = { count: 0, files: new Set(), samples: [], gaps: new Set() }; shapes.set(signature, e); }
  e.count += 1;
  if (e.files.size < FILE_LIST_LIMIT) e.files.add(path.relative(ROOT, file));
  if (e.samples.length < SAMPLE_LIMIT) e.samples.push({ file: path.relative(ROOT, file), line, text: text.slice(0, 200) });
  if (gap) e.gaps.add(gap);
};

const relFile = (sf) => sf.fileName;
const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
const textOf = (sf, node) => {
  try { return sf.text.slice(node.getStart(), node.getEnd()).replace(/\s+/g, " ").trim(); }
  catch { return "<unprintable>"; }
};

// ---- 域 A/B/D: JSX 遍历 --------------------------------------------------

// DOM 元素（小写 tag）上的 onX 属性 = handler 域；自定义组件（大写 tag）上 = props 回调域
const isDomTag = (tagName) =>
  tagName.kind === ts.SyntaxKind.Identifier
    ? /^[a-z]/.test(tagName.text)
    : false; // 成员表达式 tag（<Foo.Bar/>）一律按自定义组件处理

// 表达式形态分类（JSX expression container 内）
function classifyJsxExpression(sf, expr) {
  if (ts.isIdentifier(expr)) return "jsx-expr-ident";
  if (ts.isPropertyAccessExpression(expr) || ts.isElementAccessExpression(expr)) return "jsx-expr-member";
  if (ts.isConditionalExpression(expr)) return "jsx-expr-ternary";
  if (ts.isTemplateExpression(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return "jsx-expr-template";
  if (ts.isParenthesizedExpression(expr)) return classifyJsxExpression(sf, expr.expression);
  if (ts.isPrefixUnaryExpression(expr) && expr.operator === ts.SyntaxKind.ExclamationToken) return "jsx-expr-logical-not";
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    // cond && <JSX/> 条件渲染
    return "jsx-expr-logical-and";
  }
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.BarBarToken) return "jsx-expr-logical-or";
  if (ts.isCallExpression(expr)) {
    const e = expr.expression;
    if (ts.isPropertyAccessExpression(e) && e.name.text === "map") return "jsx-expr-map";
    if (ts.isIdentifier(e) && e.text === "Array") {
      const [first] = expr.arguments;
      if (first && ts.isObjectLiteralExpression(first)) return "jsx-expr-array-from";
    }
    if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) return "jsx-expr-iife";
    return "jsx-expr-call-other";
  }
  if (ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr) || ts.isJsxFragment(expr)) return "jsx-expr-inline-jsx";
  if (ts.isArrowFunction(expr)) return "jsx-expr-arrow";
  if (ts.isStringLiteral(expr) || ts.isNumericLiteral(expr)) return "jsx-expr-literal";
  if (ts.isObjectLiteralExpression(expr) || ts.isArrayLiteralExpression(expr)) return "jsx-expr-collection-literal";
  return "jsx-expr-other";
}

// handler/props 回调值形态分类
function classifyHandlerValue(sf, expr) {
  if (ts.isIdentifier(expr)) return "handler-named-ref";
  if (ts.isPropertyAccessExpression(expr) || ts.isElementAccessExpression(expr)) return "handler-method-ref";
  if (ts.isParenthesizedExpression(expr)) return classifyHandlerValue(sf, expr.expression);
  if (ts.isCallExpression(expr)) return "handler-call-inline";
  if (ts.isConditionalExpression(expr)) return "handler-ternary";
  if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
    if (ts.isBlock(expr.body)) {
      // 块体：多语句 / void-call trampoline
      const stmts = expr.body.statements.filter((s) => !ts.isEmptyStatement(s));
      if (stmts.length === 1 && ts.isExpressionStatement(stmts[0]) && ts.isVoidExpression(stmts[0].expression)) {
        return "handler-arrow-void-call";
      }
      return stmts.length <= 1 ? "handler-arrow-block-single" : "handler-arrow-block-multi";
    }
    return "handler-arrow-single-expr";
  }
  return "handler-other";
}

function visitJsxTag(sf, tag) {
  const attrs = ts.isJsxSelfClosingElement(tag)
    ? tag.attributes
    : ts.isJsxOpeningElement(tag) ? tag.attributes : undefined;
  if (!attrs) return;
  const dom = isDomTag(tag.tagName);
  for (const prop of attrs.properties) {
    if (!ts.isJsxAttribute(prop) || !prop.initializer) continue;
    const name = prop.name.text;
    const init = prop.initializer;
    if (!ts.isJsxExpression(init) || !init.expression) continue;
    const expr = init.expression;
    if (/^on[A-Z]/.test(name) || /^(handle|Handle)/.test(textOf(sf, expr))) {
      const cls = classifyHandlerValue(sf, expr);
      const sig = dom ? cls : `props-callback-${cls.replace(/^handler-/, "")}`;
      register(sig, relFile(sf), lineOf(sf, prop), `${name}={${textOf(sf, expr)}}`,
        dom ? "handler" : "props-callback");
    }
    // 非 onX 的函数值 prop（如 renderX/onChange 类自定义）也进 props 回调域
    else if (!dom && (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr))) {
      register(`props-callback-arrow-anon-${name}`, relFile(sf), lineOf(sf, prop), `${name}={${textOf(sf, expr)}}`, "props-callback");
    }
  }
}

function visitJsxChildren(sf, node) {
  if (ts.isJsxExpression(node) && node.expression) {
    const sig = classifyJsxExpression(sf, node.expression);
    register(sig, relFile(sf), lineOf(sf, node), textOf(sf, node.expression), "jsx-child");
  }
}

// ---- 域 C: hooks ----------------------------------------------------------

function visitHookCall(sf, call) {
  const e = call.expression;
  const name = ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : "";
  if (!name.startsWith("use") || name === "user") return;
  switch (name) {
    case "useState": register("hook-useState", relFile(sf), lineOf(sf, call), textOf(sf, call)); break;
    case "useEffect": {
      const deps = call.arguments[1];
      register(deps === undefined ? "hook-useEffect-no-deps" : "hook-useEffect-with-deps",
        relFile(sf), lineOf(sf, call), textOf(sf, call), "hook-effect");
      break;
    }
    case "useRef": register("hook-useRef", relFile(sf), lineOf(sf, call), textOf(sf, call)); break;
    case "useMemo": register("hook-useMemo", relFile(sf), lineOf(sf, call), textOf(sf, call), "hook-memo"); break;
    case "useCallback": register("hook-useCallback", relFile(sf), lineOf(sf, call), textOf(sf, call), "hook-callback"); break;
    case "useContext": register("hook-useContext", relFile(sf), lineOf(sf, call), textOf(sf, call)); break;
    default: register(`hook-other-${name}`, relFile(sf), lineOf(sf, call), textOf(sf, call));
  }
}

// ---- 遍历 -----------------------------------------------------------------

function visit(sf, node) {
  if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) visitJsxTag(sf, node);
  if (ts.isJsxExpression(node)) visitJsxChildren(sf, node);
  if (ts.isCallExpression(node)) visitHookCall(sf, node);
  node.forEachChild((c) => visit(sf, c));
}

const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git" || e.name === "dist" || e.name === "build") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".tsx") || e.name.endsWith(".ts")) files.push(p);
  }
};
walk(ROOT);

let parsed = 0;
for (const f of files) {
  const text = fs.readFileSync(f, "utf8");
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.ES2020, true,
    f.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  parsed += 1;
  visit(sf, sf);
}

// ---- 汇总输出 ---------------------------------------------------------------

const shapesOut = {};
for (const [sig, e] of [...shapes.entries()].sort((a, b) => b[1].count - a[1].count)) {
  shapesOut[sig] = { count: e.count, files: [...e.files].sort(), samples: e.samples, gaps: [...e.gaps] };
}
const result = {
  generatedAt: new Date().toISOString(),
  root: ROOT,
  fileCount: parsed,
  totalOccurrences: [...shapes.values()].reduce((n, e) => n + e.count, 0),
  signatureCount: shapes.size,
  shapes: shapesOut,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(`census: ${parsed} files, ${result.totalOccurrences} occurrences, ${result.signatureCount} signatures -> ${OUT}`);
for (const [sig, e] of [...shapes.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 40)) {
  console.log(`  ${String(e.count).padStart(5)}  ${sig}`);
}
