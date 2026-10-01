// mech19 r1 探针基础设施: 把 POST-CHT scene.csgc 里指定 handler 名字段从 "compiled:X" 还原回
// "invoke:X"(sceneRewriteCompiledInvokeSegments 的精确逆操作,纯字符串前缀替换,不改任何其余字段),
// 得到等价的 PRE-CHT 输入, 供重新单次调用 buildCompiledHandlerTable 得到真实 compiled[]/boxRefsUsed。
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const pkg = new URL("..", import.meta.url).pathname;
const inDir = process.argv[2];
const outDir = process.argv[3];
const names = new Set(process.argv.slice(4));
const { csgcReadFacts } = await import(pathToFileURL(join(pkg, "dist", "csgc-reader.js")).href);
const { csgcWriteFacts } = await import(pathToFileURL(join(pkg, "dist", "csgc-writer.js")).href);
const scene = csgcReadFacts(readFileSync(join(pkg, inDir, "unimaker-react.scene.csgc"))).facts;
let changed = 0;
for (const f of scene) {
  if (f.kind !== "csg.web.scene.event_handler" || typeof f.effect !== "string") continue;
  const segs = f.effect.split(";");
  let anyHit = false;
  const rewritten = segs.map((seg) => {
    if (!seg.startsWith("compiled:")) return seg;
    const nm = seg.slice("compiled:".length);
    if (!names.has(nm)) return seg;
    anyHit = true;
    return `invoke:${nm}`;
  });
  if (anyHit) {
    f.effect = rewritten.join(";");
    if (f.data && f.data.action) { f.data.action.effect = f.effect; }
    changed++;
  }
}
process.stderr.write(`reverted ${changed} event_handler facts\n`);
const { factsBuffer } = csgcWriteFacts(scene, {});
writeFileSync(join(pkg, outDir, "unimaker-react.scene.csgc"), factsBuffer);
process.stderr.write(`wrote ${join(outDir, "unimaker-react.scene.csgc")}\n`);
