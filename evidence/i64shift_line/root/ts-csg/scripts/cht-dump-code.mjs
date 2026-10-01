// Dump the full buildCompiledHandlerTable() generated Cheng source for byte-level diffing.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = process.argv[2] || "tmp/census-imgdiag";
const outPath = process.argv[3] || "/tmp/cht_code.cheng";
const projectRoot = process.argv[4] || "/Users/lbcheng/UniMaker/React.js";
const pkg = new URL("..", import.meta.url).pathname;
const { csgcReadFacts } = await import(pathToFileURL(join(pkg, "dist", "csgc-reader.js")).href);
const { buildCompiledHandlerTable } = await import(pathToFileURL(join(pkg, "scripts", "scene-runtime-smoke-source.mjs")).href);

const core = csgcReadFacts(readFileSync(join(pkg, dir, "unimaker-react.csgc"))).facts;
const scene = csgcReadFacts(readFileSync(join(pkg, dir, "unimaker-react.scene.csgc"))).facts;

const cht = await buildCompiledHandlerTable(core, scene, { projectRoot });
writeFileSync(outPath, cht.code);
process.stderr.write(`wrote ${outPath} (${cht.code.length} bytes), compiled=[${[...new Set(cht.names || [])].join(",")}]\n`);
