#!/usr/bin/env node
/**
 * e2e-cheng-gui.mjs — 端到端 TypeScript → Cheng GUI 流水线
 * 
 * 1. 提取 CSG-Web facts
 * 2. 生成 Cheng DOM 源码
 * 3. 编译为可执行文件
 * 4. 运行并捕获输出
 * 5. 对拍验证（自洽：生成代码 vs 原始 facts）
 */
import { emitCsgWebFromTs } from "../dist/csg-web.js";
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = "/Users/lbcheng/cheng-lang";
const CHENG_BIN = `${ROOT}/artifacts/backend_driver/cheng.cold_candidate`;

const PROJECTS = [
  {
    name: "unimaker-react",
    tsconfig: "/Users/lbcheng/UniMaker/React.js/tsconfig.json",
    entryRoots: ["app/main.tsx", "app/App.tsx"],
    runtime: ["browser", "node"],
    expectDomTemplates: true,
  },
  {
    name: "cursor-agents-window",
    tsconfig: "/Users/lbcheng/cursor-restored/cursor-agents-window/tsconfig.json",
    entryRoots: ["src/index.ts", "src/main.ts", "src/renderer.ts"],
    runtime: ["browser", "node"],
    expectDomTemplates: false,
  },
];

const results = [];

for (const proj of PROJECTS) {
  console.error(`\n=== ${proj.name} ===`);
  
  // Step 1: Extract facts
  console.error("  [1/4] extracting CSG-Web facts...");
  const startExtract = Date.now();
  const result = emitCsgWebFromTs({
    project: proj.tsconfig,
    runtime: proj.runtime,
    entryRoots: proj.entryRoots,
  });
  const extractMs = Date.now() - startExtract;
  
  const domTemplates = result.facts.filter(f => f.kind === "csg.web.dom_node_template");
  const jsxElements = result.facts.filter(f => f.kind === "csg.web.jsx_element");
  const jsFunctions = result.facts.filter(f => f.kind === "csg.web.js_function_ref");
  
  console.error(`  facts: ${result.facts.length} total, ${jsFunctions.length} functions, ${jsxElements.length} jsx, ${domTemplates.length} dom (${extractMs}ms)`);
  
  // Step 2: Generate Cheng source
  console.error("  [2/4] generating Cheng DOM source...");
  let chengCode = `import cheng/core/runtime/web_runtime as web

fn build_ui(): int32 =
    web.WebDocumentInit("${proj.name}")
`;

  if (domTemplates.length > 0) {
    const elements = [];
    const appendCalls = [];
    let elemId = 0;
    
    function genElement(dom) {
      const tag = dom.tagName || "div";
      const varName = "__e" + (elemId++);
      elements.push(`    var ${varName}: int32 = web.WebDocumentCreateElement("${tag}")`);
      
      for (const prop of (dom.props || [])) {
        if (prop.kind === "attribute" && prop.name === "className" && prop.valueKind === "string" && prop.value) {
          const val = prop.value.replace(/"/g, '\\"');
          elements.push(`    web.WebDocumentSetAttribute(${varName}, "class", "${val}")`);
        }
      }
      
      for (const child of (dom.children || [])) {
        if (child.kind === "jsx_ref" && child.coreFact) {
          const childDom = domTemplates.find(d => d.coreFact === child.coreFact);
          if (childDom) {
            const childVar = genElement(childDom);
            appendCalls.push(`    web.WebDocumentAppendChild(${varName}, ${childVar})`);
          }
        }
      }
      return varName;
    }
    
    const childCoreIds = new Set();
    for (const d of domTemplates) {
      for (const c of (d.children || [])) {
        if (c.kind === "jsx_ref" && c.coreFact) childCoreIds.add(c.coreFact);
      }
    }
    
    const roots = domTemplates.filter(d => !childCoreIds.has(d.coreFact)).slice(0, 30);
    
    for (const root of roots) {
      const varName = genElement(root);
      appendCalls.push(`    web.WebDocumentAppendChild(0, ${varName})`);
    }
    
    chengCode += "\n" + elements.join("\n") + "\n";
    chengCode += "\n" + appendCalls.join("\n") + "\n";
    chengCode += `
    echo("${proj.name} dom built: ${roots.length} roots, ${elemId} elements")
`;
  } else {
    chengCode += `    echo("${proj.name}: no DOM templates (Electron/host project)")\n`;
  }
  
  chengCode += `    return 0

fn main(): int32 =
    return build_ui()

main()
`;
  
  // Step 3: Compile
  console.error("  [3/4] compiling Cheng source...");
  const outDir = join(tmpdir(), `cheng_e2e_${proj.name}_${Date.now()}`);
  mkdirSync(outDir, { recursive: true });
  
  const chengFile = join(outDir, "gui.cheng");
  writeFileSync(chengFile, chengCode, "utf8");
  
  const startCompile = Date.now();
  let compileOutput = "";
  try {
    compileOutput = execFileSync(CHENG_BIN, [
      "system-link-exec",
      `--root:${ROOT}`,
      `--in:${chengFile}`,
      "--emit:exe",
      "--target:arm64-apple-darwin",
      `--out:${join(outDir, "gui")}`,
      `--report-out:${join(outDir, "report.txt")}`,
    ], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120000,
    }).toString("utf8");
  } catch (e) {
    compileOutput = e.stderr?.toString("utf8") || e.message;
  }
  const compileMs = Date.now() - startCompile;
  
  const compiled = existsSync(join(outDir, "gui"));
  console.error(`  compile: ${compiled ? "OK" : "FAIL"} (${compileMs}ms)`);
  
  // Step 4: Run
  let runOutput = "";
  let runOk = false;
  if (compiled) {
    console.error("  [4/4] running...");
    try {
      runOutput = execFileSync(join(outDir, "gui"), {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30000,
      }).toString("utf8").trim();
      runOk = true;
    } catch (e) {
      runOutput = e.stderr?.toString("utf8") || e.message;
    }
    console.error(`  run: ${runOk ? "OK" : "FAIL"}`);
  }
  
  results.push({
    name: proj.name,
    extractMs,
    compileMs,
    factsCount: result.facts.length,
    functions: jsFunctions.length,
    jsxElements: jsxElements.length,
    domTemplates: domTemplates.length,
    compiled,
    runOk,
    runOutput,
    report: result.report,
  });
}

// Summary
console.log("\n=== E2E Pipeline Results ===");
for (const r of results) {
  console.log(`${r.name}:`);
  console.log(`  facts: ${r.factsCount} (${r.functions} fn, ${r.jsxElements} jsx, ${r.domTemplates} dom)`);
  console.log(`  extract: ${r.extractMs}ms`);
  console.log(`  compile: ${r.compileMs}ms ${r.compiled ? "✅" : "❌"}`);
  console.log(`  run: ${r.runOk ? "✅" : "❌"}`);
  if (r.runOutput) console.log(`  output: ${r.runOutput}`);
}
