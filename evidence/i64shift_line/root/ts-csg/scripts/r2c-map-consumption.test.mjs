// r2c Map 消费链 stage3 端到端验证：Map<K,V> 槽模型 struct 合成 + .set/.get/.has/.delete
// 方法降级 helper（mapHelperTexts → transpiler.extraPreludeFns 组装）+ 真实后端编译 + 运行断言。
// 全链真实：真实 tsx 夹具 → csg-core 抽取 → transpileR2c → stage3 编译 → 运行断言。
// 用法: node scripts/r2c-map-consumption.test.mjs   (需 ts-csg 已 npm run build)
//
// ============================================================================
// 夹具形态说明（相对原始 useRef 形态的偏离，均为上游机制缺口导致，非随意简化）：
//
// 原始形态 `const cacheRef = useRef<Map<string, NodeInfo>>(new Map())` 三层叠加失败：
//   (a) `new Map()` 不在降级子集：diagnostic "new Map not supported in the transpiled subset"
//       （emitExpr case "new" 仅支持 Set）。
//   (b) emitRefSlots 的 initialExpr = types.zeroValueOf(结构体类型) 返回 ""，
//       生成残行 `__r2c_cacheRef = `（空 RHS）进 r2cRefsInit → cheng 解析错误。
//       zeroValueOf 只处理 int64/str/bool/json.JsonNode/T[]，结构体返回空串。
//   (c) extractor 给 Map 方法调用盖 returnType:"any"（.get 应为 V、.has 应为 boolean），
//       无注解 local 推断失败："cannot infer type for local 'hit'" / "'has'"。
//       带显式注解（const hit: NodeInfo = ...）可绕过 c。
//
// JSX 插值复合表达式不降级（extractor carries text only）：
//   "jsx interpolation of composite expression 'hit.label' not lowered"
//   "jsx interpolation of composite expression 'String(has)' not lowered"
//   → 复合表达式先落到带注解局部变量，插值仅用裸标识符。
//   另外 String(bool) 会降级为 jsNumToStr(value: int64)，bool 实参是类型错误，不可用。
//
// 当前阻塞编译的总闸门（结构体合成缺陷，任何 key 为原生类型的 Map 均命中）：
//   transpileR2c 返回 structDiagnostics:
//   ["struct 'R2cMap_str_NodeInfo.keys': array element: unsupported type 'str'"]
//   根因：Map 合成把 cheng 类型名写进 TS 侧成员槽 —— members 用 `${kt.type}[]`
//   （kt.type="str"），emitStructs 对 member.type 再过 TypeMapper，"str"/"int64"
//   都不是合法 TS 元素类型名，keys 成员被丢弃（vals 因 NodeInfo 可映射而幸存），
//   发出的 struct 只有 vals 字段；helper 引用 m.keys 在冷编译硬炸：
//   "unknown field 'keys' on object type R2cMap_str_NodeInfo"。
//   修复位点：合成 members 应携带原始 TS 类型文本（mapMatch[1]/[2] + "[]"），
//   或 emitStructs 同时接受 cheng 类型名。修复落地后本脚本应直通 PASS。
//   注：structDiagnostics 目前不影响 results[].ok —— 转译"全绿"但产物不可编译，
//   缺口只能在 cheng 编译期暴露（API 面未把结构体诊断并入失败信号）。
// ============================================================================
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const packageDir = join(dirnameFromFile(import.meta.url), "..");
function dirnameFromFile(url) { return new URL(".", url).pathname.replace(/\/$/, ""); }

const REACT_ROOT = "/Users/lbcheng/UniMaker/React.js";
const CHENG = "/Users/lbcheng/cheng-lang/artifacts/bootstrap/cheng.stage3";
const MAIN_TREE = "/Users/lbcheng/cheng-lang";

// [0] 真实夹具（落在 React.js 项目内 —— Merkle admission 的项目封闭性）。
// Map 经组件参数消费（closest real-source shape that reaches the full chain）。
const fixtureAbs = join(REACT_ROOT, "app", "MapProbe.tsx");
writeFileSync(fixtureAbs, `import React, { useState } from 'react';

interface NodeInfo { peerId: string; label: string; }

export function MapProbe(cache: Map<string, NodeInfo>): any {
  const [selected, setSelected] = useState<string>('');
  const c1: NodeInfo = { peerId: 'p1', label: 'L1' };
  cache.set('p1', c1);
  cache.set('p2', c1);
  const hit: NodeInfo = cache.get('p1');
  cache.delete('p2');
  const has: boolean = cache.has('p2');
  const hitLabel: string = hit.label;
  const hasText: string = has ? 'hit' : 'miss';
  setSelected('cache');
  return (
    <div className="cache">
      <span>{selected}</span>
      <span>{hitLabel}</span>
      <span>{hasText}</span>
    </div>
  );
}
`);
try {
  const scratch = mkdtempSync(join(tmpdir(), "r2c-map-consumption-"));
  const factsPath = join(scratch, "facts.jsonl");
  const extract = spawnSync(process.execPath, [
    join(packageDir, "dist", "cli.js"), "--emit", "csg-core",
    "--file", fixtureAbs, "--root", REACT_ROOT, "--out", factsPath,
  ], { encoding: "utf8", timeout: 300000 });
  assert.equal(extract.status, 0, `extract must succeed: ${extract.stderr}\n${extract.stdout}`);

  // [1] transpileR2c：组件找到、全部 fn ok、state 槽精确
  const { transpileR2c } = await import(pathToFileURL(join(packageDir, "dist", "csg-cheng-transpiler.js")).href);
  const facts = readFileSync(factsPath, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  const r2c = transpileR2c(facts, "MapProbe");
  assert.equal(r2c.componentFound, true, "component must be found");
  assert.deepEqual(r2c.results.filter((x) => !x.ok).map((x) => x.name), [], `all fns must transpile: ${JSON.stringify(r2c.results.filter((x) => !x.ok).flatMap((x) => x.diagnostics))}`);
  assert.deepEqual(r2c.slots.map((s) => `${s.stateName}:${s.chengType}`), ["selected:str"], "state slots must be extracted with exact types");
  // 结构体合成门禁：合成 struct 的每个成员都必须可发出（当前总闸门，见文件头说明）
  assert.deepEqual(r2c.structDiagnostics, [], `synthesized structs must emit without diagnostics: ${JSON.stringify(r2c.structDiagnostics)}`);

  // [2] 组装 + stage3 编译 + 运行
  // JSX 节点表：0=div.cache, 1=span, 2=text("cache"), 3=span, 4=text("L1"), 5=span, 6=text("miss")
  //   —— hit=p1 的 label（get 命中），has=p2（已 delete）为 false → "miss"。
  // main 侧再以 __r2cMapHas 直证 helper 在运行期可达（set 经共享 seq 对 caller 可见）。
  const mainText = `fn main(): int32 =
    r2cStateInit()
    var cache: R2cMap_str_NodeInfo
    MapProbe(cache)
    if __r2cJsxNodeLen != 7:
        return 1
    if __r2cJsxNodes[0].tag != "div" || __r2cJsxNodes[0].className != "cache":
        return 2
    if __r2cJsxNodes[2].text != "cache":
        return 3
    if __r2cJsxNodes[4].text != "L1":
        return 4
    if __r2cJsxNodes[6].text != "miss":
        return 5
    if !__r2cMapHas_str_NodeInfo(cache, "p1"):
        return 6
    if !r2cTakeDirty():
        return 7
    if r2cTakeDirty():
        return 8
    return 0
`;
  writeFileSync(join(scratch, "cheng-package.toml"), 'package_id = "r2c-map-consumption"\n');
  mkdirSync(join(scratch, "src"), { recursive: true });
  cpSync(join(MAIN_TREE, "src", "std"), join(scratch, "src", "std"), { recursive: true });
  cpSync(join(MAIN_TREE, "src", "core"), join(scratch, "src", "core"), { recursive: true });
  cpSync(join(MAIN_TREE, "src", "apps"), join(scratch, "src", "apps"), { recursive: true });
  writeFileSync(join(scratch, "src", "prog.cheng"), r2c.code + "\n\n" + mainText);
  const exePath = join(scratch, "prog");
  const compile = spawnSync(CHENG, [
    "system-link-exec", `--root:${scratch}`, "--in:src/prog.cheng",
    "--emit:exe", "--target:arm64-apple-darwin",
    `--out:${exePath}`, `--report-out:${join(scratch, "prog.report.txt")}`,
  ], { encoding: "utf8", timeout: 600000 });
  assert.equal(compile.status, 0, `stage3 compile must succeed: ${compile.stderr}\n${compile.stdout}`);
  assert.match(compile.stdout + compile.stderr, /real_backend_codegen=1/, "must hit real backend codegen");
  chmodSync(exePath, 0o755);
  const run = spawnSync(exePath, [], { encoding: "utf8" });
  assert.equal(run.status, 0, `all 8 assertions must pass (rc=0), got ${run.status}`);
  process.stdout.write("PASS (r2c Map consumption chain stage3: 8/8 rc=0)\n");
  rmSync(scratch, { recursive: true, force: true });
} finally {
  // 夹具（本任务交付产物之一）保留在 React.js 项目内不回滚；内容幂等，重跑覆盖。
}
