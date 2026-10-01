// mech18 r1 探针基础设施: 仅跑 unimaker-one-click.mjs Step 1 (CSG-Web 提取), 不进 materialize/roomState
// 碰撞管线 (与 mech17-dump-queuedvoiceice-ops.mjs 探针同一纪律: 提取阶段核心 facts 与 roomState 碰撞/
// scene 物化完全无关, 不需要任何探针改名)。本文件对源码只读不改, 只是把 unimaker-one-click.mjs 的
// Step 1 抽出来单独跑, 复用同一 emitCsgWebFromTs 调用与选项。
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const pkg = new URL("..", import.meta.url).pathname;
const projectRoot = process.argv[2] || "/Users/lbcheng/UniMaker/React.js";
const outDir = process.argv[3] || "tmp/census-m18r1";

const { emitCsgWebFromTs } = await import(pathToFileURL(join(pkg, "dist", "csg-web.js")).href);
const { csgcWriteFacts } = await import(pathToFileURL(join(pkg, "dist", "csgc-writer.js")).href);

const projectTsConfig = join(projectRoot, "tsconfig.json");
const entryRoots = ["app/main.tsx", "app/App.tsx", "app/libp2p/index.ts"];

const extractOptions = {
  project: projectTsConfig,
  rootDir: projectRoot,
  runtime: ["node", "browser"],
  entryRoots,
  emitText: false,
  includeDebugMaps: false,
};

const extractResult = emitCsgWebFromTs(extractOptions);
if (extractResult.diagnostics.length > 0) {
  process.stderr.write(`CSG-Web diagnostics:\n${extractResult.diagnostics.join("\n")}\n`);
  process.exit(1);
}
process.stderr.write(`extracted facts=${extractResult.facts.length}\n`);

mkdirSync(join(pkg, outDir), { recursive: true });
const { factsBuffer } = csgcWriteFacts(extractResult.facts, {});
writeFileSync(join(pkg, outDir, "unimaker-react.csgc"), factsBuffer);
process.stderr.write(`wrote ${join(outDir, "unimaker-react.csgc")}\n`);
