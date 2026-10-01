/**
 * emit-cheng-dom.ts — 从 CSG-Web DOM node template facts 生成 Cheng 源码
 * 用法: node --experimental-strip-types tools/emit-cheng-dom.ts
 */
import { emitCsgWebFromTs } from "./csg-web.js";
import type { CsgFact } from "./schema.js";
import { writeFileSync, mkdirSync } from "node:fs";

interface DomNodeTemplate extends CsgFact {
  kind: "csg.web.dom_node_template";
  id: string;
  tagName: string;
  nodeKind: string;
  children: DomChild[];
  props: DomProp[];
}

interface DomChild {
  kind: "text" | "expression" | "element";
  content?: string;
  expression?: string;
  refId?: string;
  ordinal: number;
}

interface DomProp {
  kind: "attribute" | "event" | "style" | "property";
  name: string;
  valueKind: string;
  expression?: string;
  value?: string;
  ordinal: number;
}

const projectTsConfig = "/Users/lbcheng/UniMaker/React.js/tsconfig.json";
const outPath = "/tmp/unimaker_gui.cheng";

const result = emitCsgWebFromTs({
  project: projectTsConfig,
  runtime: ["browser", "node"],
  entryRoots: ["app/main.tsx", "app/App.tsx"],
});

const doms = result.facts.filter(
  (f) => f.kind === "csg.web.dom_node_template"
) as DomNodeTemplate[];

console.error(`Found ${doms.length} DOM templates`);

// Build a map of all DOM nodes by ID
const domById = new Map<string, DomNodeTemplate>();
for (const dom of doms) {
  domById.set(dom.id, dom);
}

// Find root nodes (those with no parent reference in other nodes' children)
const childIds = new Set<string>();
for (const dom of doms) {
  for (const child of dom.children) {
    if (child.kind === "element" && child.refId) {
      childIds.add(child.refId);
    }
  }
}
const rootNodes = doms.filter((dom) => !childIds.has(dom.id));
console.error(`Root nodes: ${rootNodes.length}`);

// Generate Cheng code
let lines: string[] = [];
lines.push("import cheng/core/runtime/web_runtime as web");
lines.push("");
lines.push("fn build_ui(): int32 =");

let indent = "    ";

// For each root DOM node, generate element creation
let elemVarCounter = 0;
let processed = 0;

function emitElement(dom: DomNodeTemplate, parentVar: string | null): string {
  const varName = `__elem_${elemVarCounter}`;
  elemVarCounter++;

  const tagName = dom.tagName || "div";
  const safeTagName =
    tagName === "#text"
      ? '"span"'
      : tagName.includes("-")
        ? `"${tagName}"`
        : `"${tagName}"`;

  if (processed >= 30) return ""; // limit to first 30 root elements

  let block = "";
  if (processed > 0) block += "\n";

  block += `${indent}var ${varName}: int32 = web.WebDocumentCreateElement(${safeTagName})\n`;

  // Emit children recursively
  for (const child of dom.children) {
    if (child.kind === "element" && child.refId) {
      const childDom = domById.get(child.refId);
      if (childDom) {
        const childCode = emitElement(childDom, varName);
        if (childCode) {
          block += childCode;
          // web.WebDocumentAppendChild(parent, child)
          // We need to know the child var name - it's the last created elem
        }
      }
    } else if (child.kind === "text" && child.content) {
      const text = child.content.replace(/"/g, '\\"');
      block += `${indent}var __text_${elemVarCounter}: int32 = web.WebDocumentCreateText("${text}")\n`;
      elemVarCounter++;
      block += `${indent}web.WebDocumentAppendChild(${varName}, __text_${elemVarCounter - 1})\n`;
    }
  }

  if (parentVar) {
    block += `${indent}web.WebDocumentAppendChild(${parentVar}, ${varName})\n`;
  }

  processed++;
  return block;
}

// Emit first 30 root elements
let rootCount = 0;
for (const root of rootNodes) {
  if (rootCount >= 30) break;
  const block = emitElement(root, null);
  if (block) {
    lines.push(block);
    rootCount++;
  }
}

// Window creation and event loop
lines.push("");
lines.push(`${indent}echo("gui built " + Fmt"${processed}" + " elements")`);
lines.push(`${indent}return 0`);

lines.push("");
lines.push("fn main(): int32 =");
lines.push("    return build_ui()");

lines.push("");
lines.push("main()");

const code = lines.join("\n");
writeFileSync(outPath, code, "utf8");
console.error(`Written ${code.length} chars to ${outPath}`);
console.log(code);
