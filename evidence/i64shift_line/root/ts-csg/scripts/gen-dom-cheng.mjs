import { emitCsgWebFromTs } from "../dist/csg-web.js";
import { writeFileSync } from "node:fs";

const result = emitCsgWebFromTs({
  project: "/Users/lbcheng/UniMaker/React.js/tsconfig.json",
  runtime: ["browser", "node"],
  entryRoots: ["app/main.tsx", "app/App.tsx"],
});

const doms = result.facts.filter(f => f.kind === "csg.web.dom_node_template");
console.error("DOM templates:", doms.length);

let code = `import cheng/core/runtime/web_runtime as web

fn build_ui(): int32 =
`;

const indent = "    ";
const elements = [];
const appendCalls = [];
let elemId = 0;

function genElement(dom) {
  const tag = dom.tagName || "div";
  const varName = "__e" + (elemId++);
  
  elements.push(`${indent}var ${varName}: int32 = web.WebDocumentCreateElement("${tag}")`);
  
  for (const prop of (dom.props || [])) {
    if (prop.kind === "attribute" && prop.name === "className" && prop.valueKind === "string" && prop.value) {
      const val = prop.value.replace(/"/g, '\\"');
      elements.push(`${indent}web.WebDocumentSetAttribute(${varName}, "class", "${val}")`);
    }
  }
  
  for (const child of (dom.children || [])) {
    if (child.kind === "jsx_ref" && child.coreFact) {
      const childDom = doms.find(d => d.coreFact === child.coreFact);
      if (childDom) {
        const childVar = genElement(childDom);
        appendCalls.push(`${indent}web.WebDocumentAppendChild(${varName}, ${childVar})`);
      }
    } else if (child.kind === "text" && child.content) {
      const txt = child.content.replace(/"/g, '\\"');
      const tv = "__t" + (elemId++);
      elements.push(`${indent}var ${tv}: int32 = web.WebDocumentCreateText("${txt}")`);
      appendCalls.push(`${indent}web.WebDocumentAppendChild(${varName}, ${tv})`);
    }
  }
  
  return varName;
}

// Find root nodes
const childCoreIds = new Set();
for (const d of doms) {
  for (const c of (d.children || [])) {
    if (c.kind === "jsx_ref" && c.coreFact) childCoreIds.add(c.coreFact);
  }
}

const roots = doms.filter(d => !childCoreIds.has(d.coreFact)).slice(0, 20);

elements.unshift("");
elements.unshift(`${indent}web.WebDocumentInit("cheng-gui")`);

for (const root of roots) {
  const varName = genElement(root);
  appendCalls.push(`${indent}web.WebDocumentAppendChild(0, ${varName})`);
}

code += elements.join("\n") + "\n";
code += "\n" + appendCalls.join("\n") + "\n";
let rlen = roots.length;
code += `
    echo("gui built " + Fmt"${rlen}" + " root elements")
    return 0

fn main(): int32 =
    return build_ui()

main()
`;

writeFileSync("/tmp/unimaker_gui.cheng", code);
console.error("Written", code.length, "chars to /tmp/unimaker_gui.cheng");
console.log(code);
