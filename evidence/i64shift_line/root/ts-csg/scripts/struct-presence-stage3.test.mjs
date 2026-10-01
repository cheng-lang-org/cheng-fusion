// struct-presence-stage3.test.mjs
//
// 回归锁: 雷①(`!activeVoiceSession`布尔取反静默恒假) 的 stage3 真编真跑复刻。不满足于静态正则 —
// 用真实 transpileFunctions() 产出的 Cheng 代码, 拼进两个完整可编译程序(空 session / 已填充
// session), 用正典 driver (/Users/lbcheng/cheng-lang/artifacts/bootstrap/cheng.stage3) 编译+执行,
// 断言 exit 分化 —— 复刻上一轮对抗复核员(wf_f35ab2a2-224, agent ab4ba4a8c6c6441e2)的手工 repro
// 手法(checkIt(emptyStruct) vs checkIt(populatedStruct))。
//
// 关键: fixture 必须是 `if !session: ... else: ...`（`branch_if` 语句, condition 直接挂在 if 上）,
// 不能是 `return !session`（表达式位置）——这两者在 cheng_cold 里走不同的类型检查严格度, 已实测确认:
//   - `return (!(session))`（表达式位置）: 裸结构体取反在 cheng.stage3 里直接编译失败
//     ("cheng_cold: ! expects bool/int32"), 不是静默 bug, 修复前就已经是响亮拒绝。
//   - `if (!(session)):`（if 语句条件位置, 真实复核员踩中的形状）: 编译成功, 两种输入(空/已填充)
//     的可执行文件都返回同一个 exit(实测=9/9)——这才是 CONFIRMED 的静默恒假缺陷。
// 本测试固定复现 if-condition 形状, 修复前(手工临时回退 emitCondition, 见提交历史/案卷)实测
// exit=9/9(恒假, 折叠进 else 分支); 修复后 exit=5/9(随内容分化)。

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cheng = "/Users/lbcheng/cheng-lang/artifacts/bootstrap/cheng.stage3"; // canonical driver, read-only main tree

// `--root:`/cwd = the same scratch dir the source lives in. The current compiler requires
// package layout (cheng-package.toml at the root, entry under src/, stdlib under src/std),
// so the scratch root is prepared accordingly (std copied from the main tree, read-only).
function compileAndRun(outDir, sourceRel, label) {
  const outPath = join(outDir, `${label}.exe`);
  const reportPath = join(outDir, `${label}.report.txt`);
  const compile = spawnSync(cheng, [
    "system-link-exec",
    `--root:${outDir}`,
    `--in:${sourceRel}`,
    "--emit:exe",
    "--target:arm64-apple-darwin",
    `--out:${outPath}`,
    `--report-out:${reportPath}`,
  ], { cwd: outDir, encoding: "utf8", timeout: 60000 });
  assert.equal(compile.status, 0, `stage3 compile of ${label} must succeed (rc=${compile.status}): ${compile.stderr}\n${compile.stdout}`);
  assert.match(compile.stdout + compile.stderr, /real_backend_codegen=1/, `${label} must hit real backend codegen, not a stub`);
  chmodSync(outPath, 0o755);
  const run = spawnSync(outPath, [], { encoding: "utf8" });
  return run.status;
}

// Prepare a package-layout scratch root: cheng-package.toml + src/std from the main tree.
function preparePackageRoot(outDir) {
  writeFileSync(join(outDir, "cheng-package.toml"), 'package_id = "struct-presence-stage3"\n');
  const srcDir = join(outDir, "src");
  mkdirSync(srcDir, { recursive: true });
  cpSync("/Users/lbcheng/cheng-lang/src/std", join(srcDir, "std"), { recursive: true });
  cpSync("/Users/lbcheng/cheng-lang/src/core", join(srcDir, "core"), { recursive: true });
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  process.stdout.write(`  ok - ${name}\n`);
}

await check("stage3 exit divergence: `if !session: ... else: ...` (empty vs populated RealtimeCallSession)", async () => {
  const { transpileFunctions } = await import(new URL("../dist/csg-cheng-transpiler.js", import.meta.url).href);
  // `checkResult(session): number = if (!session) { return 5 } else { return 9 }` — a `branch_if`
  // statement whose condition is directly the unary `!` op, i.e. the EXACT shape adversarial
  // review found broken (`if (!(activeVoiceSession)):`), not a `return !x` expression (which is a
  // different, already-strict cheng_cold code path — see file header).
  const facts = [
    {
      kind: "csg.type_decl", id: "type.rcs", name: "RealtimeCallSession", declKind: "interface",
      members: [{ name: "sessionId", optional: false, type: "string" }],
    },
    { kind: "csg.data", id: "data.five", value: 5 },
    { kind: "csg.data", id: "data.nine", value: 9 },
    { kind: "csg.function", id: "fn.check", name: "checkResult", parameters: [{ name: "session", typeSource: "RealtimeCallSession" }], returnType: "number" },
    { kind: "csg.op", id: "op.session", function: "fn.check", block: "block.top", opKind: "identifier", ordinal: 1, name: "session" },
    { kind: "csg.op", id: "op.not", function: "fn.check", block: "block.top", opKind: "unary", ordinal: 2, operator: "ExclamationToken", operand: "op.session" },
    { kind: "csg.op", id: "op.branch", function: "fn.check", block: "block.top", opKind: "branch_if", ordinal: 3, condition: "op.not", thenBlock: "block.then", elseBlock: "block.else" },
    { kind: "csg.op", id: "op.thenLit", function: "fn.check", block: "block.then", opKind: "literal", ordinal: 1, data: "data.five" },
    { kind: "csg.op", id: "op.thenRet", function: "fn.check", block: "block.then", opKind: "return", ordinal: 2, value: "op.thenLit" },
    { kind: "csg.op", id: "op.elseLit", function: "fn.check", block: "block.else", opKind: "literal", ordinal: 1, data: "data.nine" },
    { kind: "csg.op", id: "op.elseRet", function: "fn.check", block: "block.else", opKind: "return", ordinal: 2, value: "op.elseLit" },
  ];
  const r = transpileFunctions(facts, ["checkResult"]);
  assert.deepEqual(r.structDiagnostics, []);
  const main = r.results.find((x) => x.name === "checkResult");
  assert.equal(main.ok, true, JSON.stringify(main.diagnostics));
  assert.match(r.code, /if \(!\(len\(\(session\)\.sessionId\) > 0\)\)/, "sanity: must be the presence-field translation, not a bare `!` on the struct");

  const outDir = mkdtempSync(join(tmpdir(), "struct-presence-stage3-"));
  try {
    const emptyProgram = [
      r.code,
      "",
      "fn main(): int32 =",
      "    var s: RealtimeCallSession",
      "    return int32(checkResult(s))",
      "",
    ].join("\n");
    const populatedProgram = [
      r.code,
      "",
      "fn main(): int32 =",
      "    var s: RealtimeCallSession",
      '    s.sessionId = "sig1"',
      "    return int32(checkResult(s))",
      "",
    ].join("\n");
    preparePackageRoot(outDir);
    writeFileSync(join(outDir, "src", "empty.cheng"), emptyProgram);
    writeFileSync(join(outDir, "src", "populated.cheng"), populatedProgram);

    const emptyExit = compileAndRun(outDir, "src/empty.cheng", "empty");
    const populatedExit = compileAndRun(outDir, "src/populated.cheng", "populated");

    // Pre-fix (hand-verified by temporarily reverting emitCondition to `return expr` and
    // rebuilding): the generated condition is a bare `(!(session))` on the struct value — cheng_cold
    // accepts it in if-condition position but folds it to a CONSTANT, so both variants land on the
    // SAME branch (exit=9 for both, i.e. "no session" and "has session" are indistinguishable).
    // Post-fix: the presence field decides — an empty session has sessionId == "" (checkResult
    // takes the `!session` branch -> exit 5), a populated one does not (-> exit 9). Exit MUST differ.
    assert.notEqual(emptyExit, populatedExit, `!session must be sensitive to struct content: empty=${emptyExit} populated=${populatedExit} (equal means the old silent-constant bug is back)`);
    assert.equal(emptyExit, 5, `empty session: !session must be true (no session found) -> exit 5, got ${emptyExit}`);
    assert.equal(populatedExit, 9, `populated session (sessionId="sig1"): !session must be false (session found) -> exit 9, got ${populatedExit}`);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

process.stdout.write(`PASS (${passed}/1)\n`);
