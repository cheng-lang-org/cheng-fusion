// mech14 探针: 对真实 UniMaker 提取产出的 unimaker-react.csgc 做两件事(全部读真实 dist 产物/真实
// TranspilerFactIndex, 非 mock, 非猜测):
//   1. 找出 csg.type_decl 事实里名为 WebRtcIceConfig / WebRtcTurnServer 的条目, 打印其真实 members
//      (字段名+类型文本), 与 UniMaker 源码 app/libp2p/webrtcIceConfig.ts:16-22 逐字段核对。
//   2. 用真实 TranspilerFactIndex(基于同一份 coreFacts 构造, 非 mech13-typemapper-probe.mjs 用的
//      fakeIndex 空表)实例化真实 TypeMapper, 对 WebRtcIceConfig 整体 + 每个字段类型文本分别调用
//      map(), 逐条打印真实返回值 —— 复刻 mech13-typemapper-probe.mjs 同款方法论(独立见证, 不转述
//      任何前序文档的文字断言)。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const pkg = new URL("..", import.meta.url).pathname;
const { csgcReadFacts } = await import(pathToFileURL(join(pkg, "dist", "csgc-reader.js")).href);
const { TypeMapper, TranspilerFactIndex } = await import(pathToFileURL(join(pkg, "dist", "csg-cheng-transpiler.js")).href);

const path = process.argv[2] || "tmp/mech14_run1/unimaker-react.csgc";
const coreFacts = csgcReadFacts(readFileSync(join(pkg, path))).facts;

console.log(`--- mech14 iceConfigRef/WebRtcIceConfig TypeMapper 独立探针 (facts=${coreFacts.length}) ---`);

const typeDecls = coreFacts.filter((f) => f.kind === "csg.type_decl" && typeof f.name === "string");
console.log(`\n[1] csg.type_decl 全量条目数: ${typeDecls.length}`);
for (const wanted of ["WebRtcIceConfig", "WebRtcTurnServer"]) {
  const matches = typeDecls.filter((f) => f.name === wanted);
  console.log(`\n=== type_decl name="${wanted}" (${matches.length} 条) ===`);
  for (const f of matches) {
    console.log(`  id=${f.id} aliasTarget=${JSON.stringify(f.aliasTarget)}`);
    const members = Array.isArray(f.members) ? f.members : [];
    console.log(`  members (${members.length}):`);
    for (const m of members) console.log(`    ${JSON.stringify(m)}`);
  }
}

console.log(`\n[2] 真实 TranspilerFactIndex + TypeMapper.map() 逐项探测`);
const index = new TranspilerFactIndex(coreFacts);
const tm = new TypeMapper(index);
function check(label, input) {
  const r = tm.map(input);
  console.log(`  map(${JSON.stringify(input)}) => ${JSON.stringify(r)}   [${label}]`);
}
check("iceConfigRef 真实标注(ChessPage.tsx:382)", "WebRtcIceConfig | null");
check("WebRtcIceConfig 裸类型", "WebRtcIceConfig");
check("字段 relayOnly", "boolean");
check("字段 stunUrls", "string[]");
check("字段 turnServers", "WebRtcTurnServer[]");
check("字段 iceServers (lib.dom RTCIceServer[])", "RTCIceServer[]");
check("字段 iceServers 裸元素类型", "RTCIceServer");
check("字段 expiresAtMs (可选 number)", "number | undefined");
check("WebRtcTurnServer 裸类型(数组元素)", "WebRtcTurnServer");
