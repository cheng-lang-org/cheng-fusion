// r2c spread 对象合并 + JSX 插值 stage3 端到端验证（T-D 线）。
// 全链真实：真实 tsx 夹具 → csg-core 抽取 → transpileR2c → stage3 编译 → 运行断言。
// 用法: node scripts/r2c-spread-merge.test.mjs   (需 ts-csg 已 npm run build)
//
// ============================================================================
// 当前定谳（2026-09-14, dist@c6b729d59 后构建）：转译层绿、stage3 编译红。
//
// 夹具形态说明（相对任务原案 interface Config + useMemo + Object.keys 的偏离，
// 均为上游机制缺口，逐条实测记录，非随意简化）：
//
//  F1 useMemo 内联箭头引用普通局部（baseConfig）不可捕获：
//     "inline arrow '<anonymous>' -> __tN_lambda: unresolved identifier 'baseConfig'"
//     buildCaptureRenames 只解析 state/ref slot、useMemo/useCallback 别名链、file const；
//     普通 local_write（对象字面量）无表示 → 合并被追到组件体直做（语义等价：初始渲染
//     各算一次）。Object.keys(baseConfig)（Config struct）连带
//     "Object.keys on unsupported type 'undefined'"（仅支持 json.JsonNode）。
//  F2 .filter(k => k.length > 2) 谓词链不通：
//     ".length on unsupported receiver type 'undefined'"（元素类型不流入块箭头参数）。
//  F3 JSX 复合表达式不降级（已知缺口，MapProbe 同款）：
//     "jsx interpolation of composite expression 'merged.name' not lowered"
//     "jsx interpolation of composite expression 'String(merged.enabled)' not lowered"
//     → 复合读先落带注解局部，插值仅裸标识符；String(bool) 是 jsNumToStr(int64) 类型错误。
//  F4 Record 注解对象字面量的命名键走 json 路径即炸（computedKeys null 守卫缺陷）：
//     发射点守卫 `computedKeys[k] !== undefined` 把 extractor 的 null 当 computed key，
//     emitExpr("null") → "expression op not found"。
//     受害形态一：`const r: Record<string,string> = { name: 'x' }`（NewJObject 循环）。
//  F5 已落地宣称的 `{...base, k: v}` → base 拷贝+bracket 写：同一守卫在 spread 循环
//     k>=1 分支炸，端到端不可达（转译即红："expression op not found"）。
//     → 夹具的后续键写用 element_write `merged["extra"] = selected` 表达
//      （与该形态的发射目标 `out[key] = v` 逐行同构，验证语义等价面）。
//  F6 __r2cJsonMerge 发射点漏注册 prelude：
//     object_literal spread 分段发射 `__r2cJsonMerge(...)` 但从不
//     `preludeUsed.add("__r2cJsonMerge")`，也不在 transpileR2c 默认 alwaysPrelude 表 →
//     assembled code 无该 fn 定义，冷编译 "unresolved function call __r2cJsonMerge"。
//     本脚本用公开 API 选项 alwaysPrelude: ['__r2cJsonMerge'] 补偿（修复落地后无害，
//     Set 去重）。
//  F7 __r2cJsonMerge prelude 本体冷编译不过（当前总闸门）：
//     "borrowed actual cannot bind non-var non-@borrows formal … callee=json.JsonSetField"
//     `a.okeys[i]`（@borrows 形参的借用元素读）直绑 `key: str` 非 var/非@borrows 形参被拒；
//     `a.ovalues[i]`（托管 JsonNode 元素读）同理。落地纪律是 Map helper 同款
//     `strings.CloneStr(k)` + `share(v)`（dist 内 R2cMap entries helper 885-886 行即范本），
//     prelude 文本缺这两跳。修复位点：dist/src csg-cheng-transpiler PRELUDE_SOURCES
//     __r2cJsonMerge 段两行 JsonSetField 调用。F6/F7 均为 c6b729d59 落地时未过 stage3。
//     修复后本脚本应直通 PASS（脚本本身无需改动）。
//
// 验证面（transpile 层，当前绿）：
//   - `{...a, ...b}` 多 spread → `let rec = a; var src = b; __r2cJsonMerge(rec, src)`
//     （b 覆盖 a 同名字段，浅合并 prelude 逐行可见）
//   - JSX 插值：str 裸标识符直读槽、int64 标识符走 jsNumToStr
//   - json 局部 bracket 写 + useState<Record> json 槽 + setter 贯通
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

// [1] 真实夹具（落在 React.js 项目内 —— Merkle admission 的项目封闭性）
const fixtureAbs = join(REACT_ROOT, "app", "SpreadMergeProbe.tsx");
writeFileSync(fixtureAbs, `import React, { useState } from 'react';

export function SpreadMergeProbe(): any {
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string>('x');
  const baseConfig: Record<string, string> = {};
  baseConfig["name"] = "base";
  baseConfig["value"] = "v1";
  const overrideConfig: Record<string, string> = {};
  overrideConfig["name"] = "override";
  overrideConfig["value"] = "v2";
  const merged: Record<string, string> = { ...baseConfig, ...overrideConfig };
  merged["extra"] = selected;
  const keyCount = selected.length;
  setSelected('probe');
  setCfg(merged);
  return (
    <div className="probe">
      <span>{selected}</span>
      <span>{keyCount}</span>
    </div>
  );
}
`);
try {
  const scratch = mkdtempSync(join(tmpdir(), "r2c-spread-merge-"));
  try {
    const factsPath = join(scratch, "facts.jsonl");
    const extract = spawnSync(process.execPath, [
      join(packageDir, "dist", "cli.js"), "--emit", "csg-core",
      "--file", fixtureAbs, "--root", REACT_ROOT, "--out", factsPath,
    ], { encoding: "utf8", timeout: 300000 });
    assert.equal(extract.status, 0, `extract must succeed: ${extract.stderr}\n${extract.stdout}`);

    // [2] transpileR2c。alwaysPrelude 是 F6 的公开 API 补偿（见头部说明）。
    const { transpileR2c } = await import(pathToFileURL(join(packageDir, "dist", "csg-cheng-transpiler.js")).href);
    const facts = readFileSync(factsPath, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
    const r2c = transpileR2c(facts, "SpreadMergeProbe", { alwaysPrelude: ["__r2cJsonMerge"] });
    assert.equal(r2c.componentFound, true, "component must be found");
    assert.deepEqual(r2c.results.filter((x) => !x.ok).map((x) => x.name), [], `all fns must transpile: ${JSON.stringify(r2c.results.filter((x) => !x.ok).flatMap((x) => x.diagnostics))}`);
    assert.deepEqual(r2c.slots.map((s) => `${s.stateName}:${s.chengType}`).sort(), ["cfg:json.JsonNode", "selected:str"], "state slots must be extracted with exact types");
    // 已落地机制的转译层形状断言：多 spread 合并调用 + 后续 bracket 写 + JSX 两形态
    assert.match(r2c.code, /= __r2cJsonMerge\(/, "multi-spread must lower to the __r2cJsonMerge shallow-merge prelude call");
    assert.match(r2c.code, /merged\["extra"\] = __r2c_selected/, "post-merge bracket write must lower onto the json local");
    assert.match(r2c.code, /fn __r2cJsonMerge\(/, "merge prelude fn must be present in assembled code (alwaysPrelude)");
    assert.match(r2c.code, /jsNumToStr\(keyCount\)/, "int64 identifier interpolation must go through jsNumToStr");
    assert.match(r2c.code, /__r2cJsxAdd\("", "", __r2c_selected, /, "str identifier interpolation must read the slot var directly");

    // [3] 组装 + stage3 编译 + 运行
    const mainText = `fn main(): int32 =
      r2cStateInit()
      SpreadMergeProbe()
      if __r2cJsxNodeLen != 5:
          return 1
      if __r2cJsxNodes[2].text != "probe":
          return 2
      if __r2cJsxNodes[4].text != "1":
          return 3
      var got: str = ""
      if !json.JsonTryGetStr(__r2c_cfg, "name", got):
          return 4
      if got != "override":
          return 5
      if !json.JsonTryGetStr(__r2c_cfg, "value", got):
          return 6
      if got != "v2":
          return 7
      if !json.JsonTryGetStr(__r2c_cfg, "extra", got):
          return 8
      if got != "x":
          return 9
      if json.JsonTryGetStr(__r2c_cfg, "absent", got):
          return 10
      if !r2cTakeDirty():
          return 11
      return 0
  `;
    writeFileSync(join(scratch, "cheng-package.toml"), 'package_id = "r2c-spread-merge"\n');
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
    assert.equal(compile.status, 0, `stage3 compile must succeed (F7 修复前红: __r2cJsonMerge prelude 借用绑定被拒): ${compile.stderr}\n${compile.stdout}`);
    assert.match(compile.stdout + compile.stderr, /real_backend_codegen=1/, "must hit real backend codegen");
    chmodSync(exePath, 0o755);
    const run = spawnSync(exePath, [], { encoding: "utf8" });
    assert.equal(run.status, 0, `all 11 assertions must pass (rc=0), got ${run.status}`);
    process.stdout.write("PASS (r2c spread-merge + jsx stage3: 11/11 rc=0)\n");
  } finally {
    // 失败路径同样清 scratch（编译失败时诊断已随 assert 消息输出）。
    rmSync(scratch, { recursive: true, force: true });
  }
} finally {
  rmSync(fixtureAbs, { force: true });
}
