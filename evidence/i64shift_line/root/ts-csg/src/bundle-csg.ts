// Bundle-CSG: structural fact extraction from Vite-bundled JS (official Codex.app).
// Parses plain JS files with acorn, extracts joinable facts (module graph, JSX runtime
// calls, className/data-attr/text literals, assets, routes, hooks, DOM APIs).
// These facts act as the "evidence source" in the three-way alignment:
//   Bundle-CSG (structural evidence) ↔ Surface-CSG (visual truth) ↔ Owner-CSG (maintainable source)

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import * as acorn from "acorn";

import type { CsgFact } from "./schema.js";
import { stableJson } from "./stable-json.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const BundleCsgSchema = "csg-bundle" as const;

export interface BundleCsgOptions {
  bundleDir: string;           // Path to Vite bundle assets directory
  runtime: string[];           // Target runtimes
  projectRoot?: string;        // Project root for relative paths
}

export interface BundleCsgResult {
  facts: CsgFact[];
  diagnostics: string[];
  counts: BundleCsgCounts;
  text: string;
  report: BundleCsgReport;
}

export interface BundleCsgCounts {
  files: number;
  totalFacts: number;
  moduleFacts: number;
  callFacts: number;
  literalFacts: number;
  assetFacts: number;
  routeFacts: number;
  hookFacts: number;
  domApiFacts: number;
}

export interface BundleCsgReport {
  schema: string;
  bundleDir: string;
  files: number;
  totalFacts: number;
  counts: BundleCsgCounts;
  topLiterals: Array<{ value: string; count: number; kind: string }>;
  topCalls: Array<{ name: string; count: number }>;
}

// ---------------------------------------------------------------------------
// Constants — patterns to match in AST
// ---------------------------------------------------------------------------

// React hook names (used in call expressions like useState(), useEffect(), etc.)
const REACT_HOOKS = new Set([
  "useState", "useEffect", "useRef", "useCallback", "useMemo", "useContext",
  "useReducer", "useLayoutEffect", "useImperativeHandle", "useDebugValue",
  "useDeferredValue", "useTransition", "useId", "useSyncExternalStore",
  "useInsertionEffect", "useEffectEvent", "useMemo", "use",
]);

// JSX prop keys that survive minification — used to identify JSX runtime calls
// in minified bundles (where jsx/jsxs/createElement are renamed to e/n/t etc.)
const JSX_PROP_KEYS = new Set([
  "className", "class", "id", "href", "src", "alt", "title",
  "placeholder", "type", "name", "value", "role", "tabIndex",
  "disabled", "checked", "readOnly", "autoFocus", "hidden",
  "target", "rel", "download", "aria-label", "aria-hidden",
  "aria-expanded", "aria-controls", "aria-describedby",
  "data-testid", "data-test-id",
]);

// DOM API names
const DOM_API_PATTERNS = [
  "querySelector", "querySelectorAll", "getElementById",
  "addEventListener", "removeEventListener", "dispatchEvent",
  "getBoundingClientRect", "getComputedStyle",
  "createElement", "appendChild", "removeChild",
  "setAttribute", "getAttribute", "classList.add", "classList.remove",
  "MutationObserver", "ResizeObserver", "IntersectionObserver",
  "requestAnimationFrame", "fetch",
];

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function emitBundleCsg(options: BundleCsgOptions): BundleCsgResult {
  const diagnostics: string[] = [];
  const facts: CsgFact[] = [];
  const bundleDir = resolve(options.bundleDir);

  if (!existsSync(bundleDir)) {
    return { facts: [], diagnostics: [`bundle dir not found: ${bundleDir}`], counts: emptyCounts(), text: "", report: emptyReport(bundleDir) };
  }

  // Collect JS files
  const jsFiles = collectJsFiles(bundleDir);
  if (jsFiles.length === 0) {
    return { facts: [], diagnostics: [`no JS files found in: ${bundleDir}`], counts: emptyCounts(), text: "", report: emptyReport(bundleDir) };
  }

  // Build deps map from Vite manifest (all __vite__mapDeps calls across all files)
  const depMap = new Map<string, string[]>(); // file hash → dep file names
  // Literal collector for joinable facts
  const literalCounts = new Map<string, { count: number; kind: string }>();
  const callCounts = new Map<string, number>();

  const counts: BundleCsgCounts = {
    files: 0, totalFacts: 0, moduleFacts: 0, callFacts: 0,
    literalFacts: 0, assetFacts: 0, routeFacts: 0, hookFacts: 0, domApiFacts: 0,
  };

  // Pass 1: extract __vite__mapDeps from each file (regex, no parsing needed)
  for (const file of jsFiles) {
    try {
      const content = readFileSync(file, "utf8");
      const deps = extractViteDeps(content);
      if (deps.length > 0) {
        depMap.set(relative(bundleDir, file), deps);
      }
    } catch (_) { /* skip unreadable */ }
  }

  // Pass 2: parse each file with acorn, extract structural facts
  for (const file of jsFiles) {
    try {
      const content = readFileSync(file, "utf8");
      if (content.length === 0) continue;

      const relPath = relative(bundleDir, file);
      const moduleId = stableId("bundle.module", relPath);

      // Module fact
      facts.push({
        kind: "csg.bundle.module",
        id: moduleId,
        path: relPath,
        size: content.length,
        deps: depMap.get(relPath) ?? [],
      });
      counts.moduleFacts++;
      counts.files++;

      // Parse with acorn (loose mode for speed)
      let ast: acorn.Node | null = null;
      try {
        ast = acorn.parse(content, {
          ecmaVersion: "latest",
          sourceType: "module",
          locations: true,
          allowHashBang: true,
          allowImportExportEverywhere: true,
          allowAwaitOutsideFunction: true,
          allowReturnOutsideFunction: true,
        });
      } catch (parseErr) {
        // Some files may have syntax issues (binary-like content, etc.)
        diagnostics.push(`${relPath}: parse error: ${String(parseErr)}`);
        continue;
      }

      // Walk AST to find joinable facts
      const literalFacts = extractLiteralsFromAst(ast, content, moduleId, relPath, literalCounts);
      facts.push(...literalFacts);
      counts.literalFacts += literalFacts.filter((f) => f.kind === "csg.bundle.literal").length;
      counts.assetFacts += literalFacts.filter((f) => f.kind === "csg.bundle.asset").length;
      counts.routeFacts += literalFacts.filter((f) => f.kind === "csg.bundle.route").length;

      const callFacts = extractCallsFromAst(ast, content, moduleId, relPath, callCounts);
      facts.push(...callFacts);
      counts.callFacts += callFacts.filter((f) => f.kind === "csg.bundle.call").length;
      counts.hookFacts += callFacts.filter((f) => f.kind === "csg.bundle.hook").length;
      counts.domApiFacts += callFacts.filter((f) => f.kind === "csg.bundle.dom_api").length;

    } catch (err) {
      diagnostics.push(`${relative(bundleDir, file)}: ${String(err)}`);
    }
  }

  counts.totalFacts = facts.length;

  // Sort literals by frequency
  const topLiterals = [...literalCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 50)
    .map(([value, { count, kind }]) => ({ value, count, kind }));

  const topCalls = [...callCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([name, count]) => ({ name, count }));

  const report: BundleCsgReport = {
    schema: BundleCsgSchema,
    bundleDir,
    files: counts.files,
    totalFacts: counts.totalFacts,
    counts,
    topLiterals,
    topCalls,
  };

  const text = facts.map((f) => stableJson(f, false)).join("\n") + "\n";

  return { facts, diagnostics, counts, text, report };
}

// ---------------------------------------------------------------------------
// AST walkers
// ---------------------------------------------------------------------------

function extractViteDeps(content: string): string[] {
  // Match: const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./dep1.js","./dep2.js",...])))
  const match = content.match(/__vite__mapDeps[^(]*\([^)]*m\.f\|\|\(m\.f=\[([^\]]*)\]\)/);
  if (!match || !match[1]) return [];
  try {
    // Parse the array content: "./dep1.js","./dep2.js",...
    const items: string[] = [];
    const re = /"([^"]+)"/g;
    let m;
    while ((m = re.exec(match[1])) !== null) {
      if (m[1]) items.push(m[1]);
    }
    return items;
  } catch (_) {
    return [];
  }
}

function extractLiteralsFromAst(
  ast: acorn.Node,
  content: string,
  moduleId: string,
  relPath: string,
  literalCounts: Map<string, { count: number; kind: string }>,
): CsgFact[] {
  const facts: CsgFact[] = [];
  const seen = new Set<string>();

  function walk(node: acorn.Node | null | undefined): void {
    if (!node || typeof node !== "object") return;

    // Detect JSX runtime calls by argument shape (callee name is minified in bundles).
    // Pattern: callee("tag", { prop: "value", ... }, ...children)
    // JSX prop keys (className, id, data-*, etc.) survive minification.
    if (node.type === "CallExpression" && (node as any).arguments?.length >= 2) {
      const args = (node as any).arguments;
      const propsArg = args[1];
      if (propsArg && propsArg.type === "ObjectExpression" && propsArg.properties?.length > 0) {
        // Quick check: does this look like JSX props?
        const firstKey = getStaticKey(propsArg.properties[0]?.key);
        if (firstKey != null && (firstKey === "className" || firstKey === "class" || firstKey === "id" || firstKey.startsWith("data-") || firstKey.startsWith("aria-") || firstKey === "style" || JSX_PROP_KEYS.has(firstKey))) {
          for (const prop of propsArg.properties) {
            if (prop.type !== "Property" && prop.type !== "ObjectProperty") continue;
            const key = getStaticKey((prop as any).key);
            const value = getStaticString((prop as any).value, content);
            if (key && value && value.length >= 2) {
              const factKind = classifyLiteral(key, value);
              if (!factKind) continue;
              const dedupKey = `${relPath}:${key}:${value}`;
              if (seen.has(dedupKey)) continue;
              seen.add(dedupKey);

              facts.push({
                kind: "csg.bundle.literal",
                id: stableId("bundle.literal", relPath, key, value),
                module: moduleId,
                file: relPath,
                key,
                value,
                literalKind: factKind,
              });

              const countKey = `${factKind}:${value}`;
              const entry = literalCounts.get(countKey) ?? { count: 0, kind: factKind };
              entry.count++;
              literalCounts.set(countKey, entry);
            }
          }

          // Extract text children (third+ arguments)
          for (let i = 2; i < args.length; i++) {
            const text = getStaticString(args[i], content);
            if (text != null && text.trim().length >= 3) {
              facts.push({
                kind: "csg.bundle.literal",
                id: stableId("bundle.literal", relPath, "text", text.slice(0, 40)),
                module: moduleId,
                file: relPath,
                key: "text",
                value: text,
                literalKind: "text",
              });
              const entry = literalCounts.get(`text:${text.slice(0, 60)}`) ?? { count: 0, kind: "text" };
              entry.count++;
              literalCounts.set(`text:${text.slice(0, 60)}`, entry);
            }
          }
        }
      }
    }

    // Find asset URLs (strings matching asset patterns)
    if (node.type === "Literal" && typeof (node as any).value === "string") {
      const value = (node as any).value as string;
      if (/\.(png|jpg|jpeg|svg|gif|webp|mp4|webm|woff2?|ttf|otf)(\?|$)/i.test(value)) {
        facts.push({
          kind: "csg.bundle.asset",
          id: stableId("bundle.asset", relPath, value),
          module: moduleId,
          file: relPath,
          value,
        });
      }
      // Route patterns: strings starting with /
      if (/^\/[a-zA-Z0-9/_-]{2,}$/.test(value) && !value.includes(".")) {
        facts.push({
          kind: "csg.bundle.route",
          id: stableId("bundle.route", relPath, value),
          module: moduleId,
          file: relPath,
          value,
        });
      }
    }

    // Recurse
    for (const key of Object.keys(node)) {
      if (key === "parent" || key === "scope" || key === "start" || key === "end") continue;
      const child = (node as any)[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === "object" && item.type) walk(item);
        }
      } else if (child && typeof child === "object" && child.type) {
        walk(child);
      }
    }
  }

  walk(ast);
  return facts;
}

function extractCallsFromAst(
  ast: acorn.Node,
  _content: string,
  moduleId: string,
  relPath: string,
  callCounts: Map<string, number>,
): CsgFact[] {
  const facts: CsgFact[] = [];

  function walk(node: acorn.Node | null | undefined): void {
    if (!node || typeof node !== "object") return;

    if (node.type === "CallExpression") {
      const callee = (node as any).callee;
      if (callee) {
        const calleeName = getCalleeName(callee);
        if (calleeName) {
          // Record all calls for statistics
          callCounts.set(calleeName, (callCounts.get(calleeName) ?? 0) + 1);

          // Classify: hook
          if (REACT_HOOKS.has(calleeName.split(".").pop() ?? "")) {
            facts.push({
              kind: "csg.bundle.hook",
              id: stableId("bundle.hook", relPath, calleeName, String((node as any).start)),
              module: moduleId,
              file: relPath,
              name: calleeName,
              loc: { file: relPath, line: (node as any).loc?.start?.line ?? 0, column: (node as any).loc?.start?.column ?? 0, start: (node as any).start ?? 0, end: (node as any).end ?? 0 },
            });
            return;
          }

          // Classify: DOM API
          if (DOM_API_PATTERNS.some((p) => calleeName.includes(p))) {
            facts.push({
              kind: "csg.bundle.dom_api",
              id: stableId("bundle.dom_api", relPath, calleeName, String((node as any).start)),
              module: moduleId,
              file: relPath,
              name: calleeName,
              loc: { file: relPath, line: (node as any).loc?.start?.line ?? 0, column: (node as any).loc?.start?.column ?? 0, start: (node as any).start ?? 0, end: (node as any).end ?? 0 },
            });
            return;
          }

          // Generic call
          facts.push({
            kind: "csg.bundle.call",
            id: stableId("bundle.call", relPath, calleeName, String((node as any).start)),
            module: moduleId,
            file: relPath,
            name: calleeName,
            loc: { file: relPath, line: (node as any).loc?.start?.line ?? 0, column: (node as any).loc?.start?.column ?? 0, start: (node as any).start ?? 0, end: (node as any).end ?? 0 },
          });
        }
      }
    }

    // Recurse
    for (const key of Object.keys(node)) {
      if (key === "parent" || key === "scope" || key === "start" || key === "end") continue;
      const child = (node as any)[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === "object" && item.type) walk(item);
        }
      } else if (child && typeof child === "object" && child.type) {
        walk(child);
      }
    }
  }

  walk(ast);
  return facts;
}

// ---------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------

function getCalleeName(callee: acorn.Node): string | null {
  if (!callee) return null;
  // Simple identifier: jsx, useState, etc.
  if (callee.type === "Identifier") return (callee as any).name;
  // Member expression: React.createElement, document.querySelector, etc.
  if (callee.type === "MemberExpression") {
    const obj = (callee as any).object;
    const prop = (callee as any).property;
    const objName = obj.type === "Identifier" ? (obj as any).name : getCalleeName(obj);
    const propName = prop.type === "Identifier" ? (prop as any).name : null;
    if (objName && propName) return `${objName}.${propName}`;
  }
  return null;
}

function getStaticKey(keyNode: acorn.Node | null): string | null {
  if (!keyNode) return null;
  if (keyNode.type === "Identifier") return (keyNode as any).name;
  if (keyNode.type === "Literal" && typeof (keyNode as any).value === "string") return (keyNode as any).value;
  return null;
}

function getStaticString(node: acorn.Node | null, content: string): string | null {
  if (!node) return null;
  // Literal string
  if (node.type === "Literal" && typeof (node as any).value === "string") return (node as any).value;
  // Template literal without expressions
  if (node.type === "TemplateLiteral") {
    const quasis = (node as any).quasis;
    if (quasis && quasis.length === 1) {
      return quasis[0].value?.raw ?? quasis[0].value?.cooked ?? null;
    }
  }
  // Binary expression of string concatenation (basic)
  if (node.type === "BinaryExpression" && (node as any).operator === "+") {
    const left = getStaticString((node as any).left, content);
    const right = getStaticString((node as any).right, content);
    if (left && right) return left + right;
  }
  return null;
}

function classifyLiteral(key: string, _value: string): string | null {
  if (key === "className" || key === "class") return "className";
  if (key === "id") return "id";
  if (key.startsWith("data-")) return "data-attr";
  if (key.startsWith("aria-")) return "aria-attr";
  if (key === "style") return null; // style objects are too noisy
  if (key === "href" || key === "src" || key === "to") return "url-ref";
  if (key === "placeholder") return "placeholder";
  if (key === "title" || key === "alt" || key === "label") return "label";
  if (key === "key") return null; // React keys are not joinable
  return null; // Other props not interesting for 3-way join
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectJsFiles(dir: string, maxFiles: number = 1200): string[] {
  const files: string[] = [];
  function walk(d: string) {
    if (files.length >= maxFiles) return;
    let entries;
    try { entries = readdirSync(d); } catch (_) { return; }
    for (const entry of entries) {
      const full = join(d, entry);
      try {
        const st = statSync(full);
        if (st.isDirectory()) walk(full);
        else if (st.isFile() && (full.endsWith(".js") || full.endsWith(".mjs"))) {
          files.push(full);
        }
      } catch (_) { /* skip */ }
    }
  }
  walk(dir);
  return files.slice(0, maxFiles);
}

function stableId(...parts: readonly string[]): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part);
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 24);
}

function emptyCounts(): BundleCsgCounts {
  return {
    files: 0, totalFacts: 0, moduleFacts: 0, callFacts: 0,
    literalFacts: 0, assetFacts: 0, routeFacts: 0, hookFacts: 0, domApiFacts: 0,
  };
}

function emptyReport(bundleDir: string): BundleCsgReport {
  return {
    schema: BundleCsgSchema, bundleDir, files: 0, totalFacts: 0,
    counts: emptyCounts(), topLiterals: [], topCalls: [],
  };
}
