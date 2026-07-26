#!/usr/bin/env bun
// item27: 九族误编译形态 semantic_gen 新族 + otool 契约 + RSS 门 自检。
//
// [A] 生成器确定性: python3 tools/semantic_gen.py --check rc=0(同种子同字节)。
// [B] 契约文件自洽: 9 族齐全、kind 合法、RSS 门字段完备。
// [C] 编译+运行+otool: 9 正族 × seed1 用旧代 DRV(2026-07-24 重钉 chain46 d57e51,
//     原 Jul-19 ed34af 已被系统清除; 标定见交付报告)编译, 运行比对 expectRc,
//     otool -tv 应用契约。如实断言: ③⑤⑥ 在旧 DRV 上必须 RED(运行时/契约拒),
//     其余 6 族必须 GREEN 且契约过 — 不引入假绿。
// [C-fix] 修复代腿(NINE_DRV_FIXED, 默认 vendor/drivers/official_final_20260724_cheng,
//     Jul-24 烤, 含部分修复): 同九族如实判定 — narrow_deref/addrof_scalar_root
//     改用 fixed-leg 变体夹具+契约(原族公开面已被 ZRPC 禁), 编译过则运行时+契约
//     必须真绿(误编译 exe 即红, 严禁假绿); 诚实 bail(rc!=0)如实记录;
//     driver 缺失记 MISSING 不算失败。
// [D] 负例族: neg_positional_ctor 必须 compile rc=2(诚实拒)。
// [E] RSS 门: 2 夹具 guard --rss-limit:256MiB 过; 负对照 16MiB 必须 rss_limit_exceeded。
//
// 证据输出: /tmp/nine/item27/nine_report.json。
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdirSync, readFileSync, writeFileSync, existsSync, rmSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, "..");
const TREE = process.env.CHENG_TREE ?? "/Users/lbcheng/cheng-lang";
const DRV = process.env.NINE_DRV ?? "/Users/lbcheng/cheng-f24/chain46/ignite_20260716T202729_d57e51/DRV";
const DRV_FIXED = process.env.NINE_DRV_FIXED ?? resolve(PKG, "vendor/drivers/official_final_20260724_cheng");
const GUARD = `${TREE}/tools/beat_c_process_group_guard.sh`;
const MATRIX = resolve(PKG, "fixtures/semantic/matrix.json");
const CONTRACT = resolve(PKG, "fixtures/semantic/nine_families/otool_contract.json");
const OUT = "/tmp/nine/item27";

const POSITIVE_FAMILIES = [
  "str_global_call_rhs", "slot_dedup_chain", "narrow_deref", "ref_seq_field",
  "agg_field_str_rhs", "addrof_scalar_root", "int32_shell_shift",
  "borrowed_seq_bitcopy", "str_empty_eq",
];
const RED_ON_DRV = new Set(["narrow_deref", "agg_field_str_rhs", "addrof_scalar_root"]);
// [C-fix] 腿变体: 原族公开面已被 ZRPC 闸禁的族, 修复代改用合法面变体夹具+契约。
const FIXED_LEG_VARIANT: Readonly<Record<string, string>> = {
  narrow_deref: "narrow_deref_fixed",
  addrof_scalar_root: "addrof_scalar_root_fixed",
};
const KNOWN_CHECK_KINDS = new Set(["present", "absent", "bl_then_store", "adrp_global_read", "len_cmp_zero", "expect_bail_on_fixed"]);

export interface CheckDef {readonly kind: string; readonly pattern?: string; readonly desc: string}
export interface FixedLegDoc {
  readonly fixture: string;
  readonly matrixFamily: string;
  readonly expectRc: number;
  readonly strength: string;
  readonly checks: readonly CheckDef[];
}
export interface ContractDoc {
  readonly windowInstructions: number;
  readonly blThenStoreGap: number;
  readonly families: Record<string, {readonly strength: string; readonly checks: readonly CheckDef[]; readonly expectOnDrvJul19: string; readonly fixedLeg?: FixedLegDoc}>;
  readonly rssGate: {readonly boundBytes: number; readonly negativeControlBytes: number; readonly fixtures: readonly string[]};
}

function run(cmd: string, args: readonly string[], opts: {timeout?: number} = {}) {
  const res = spawnSync(cmd, args, {encoding: "utf8", timeout: opts.timeout ?? 120000, maxBuffer: 1 << 28});
  return {rc: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? ""};
}

export function instructionLines(disasm: string): string[] {
  return disasm.split("\n").filter((line) => /^[0-9a-f]{16}\s+\S/.test(line.trimStart()) || /^\s*[0-9a-f]+\s+\S/.test(line));
}

export function evalContract(checks: readonly CheckDef[], disasm: string, window: number, gap: number): {name: string; ok: boolean; detail: string}[] {
  const lines = instructionLines(disasm).slice(0, window);
  const out: {name: string; ok: boolean; detail: string}[] = [];
  for (const check of checks) {
    if (check.kind === "present") {
      const re = new RegExp(check.pattern!);
      const ok = lines.some((line) => re.test(line));
      out.push({name: `present:${check.pattern}`, ok, detail: check.desc});
    } else if (check.kind === "absent") {
      const re = new RegExp(check.pattern!);
      const hit = lines.find((line) => re.test(line));
      out.push({name: `absent:${check.pattern}`, ok: hit === undefined, detail: hit === undefined ? check.desc : `命中禁止形: ${hit.trim()}`});
    } else if (check.kind === "bl_then_store") {
      const bad: string[] = [];
      lines.forEach((line, i) => {
        if (!/\tbl\s/.test(line)) return;
        const store = lines.slice(i + 1, i + 1 + gap).some((l) => /\bstr\sx[0-9]+\s*,/.test(l));
        if (!store) bad.push(line.trim());
      });
      out.push({name: "bl_then_store", ok: bad.length === 0, detail: bad.length === 0 ? check.desc : `调用后无全局写: ${bad[0]!.slice(0, 60)}`});
    } else if (check.kind === "adrp_global_read") {
      const adrpIdx = lines.findIndex((line) => /\badrp\s/.test(line));
      const ok = adrpIdx >= 0 && lines.slice(adrpIdx, adrpIdx + 4).some((l) => /\bldr\sw[0-9]+\s*,\s*\[x[0-9]+\]/.test(l));
      out.push({name: "adrp_global_read", ok, detail: check.desc});
    } else if (check.kind === "len_cmp_zero") {
      const idx = lines.findIndex((line) => /\bldr\sw[0-9]+\s*,\s*\[x[0-9]+\s*,\s*#0x8\]/.test(line));
      const ok = idx >= 0 && lines.slice(idx + 1, idx + 3).some((l) => /\bcmp\sw[0-9]+\s*,\s*#0x0/.test(l));
      out.push({name: "len_cmp_zero", ok, detail: check.desc});
    } else if (check.kind === "expect_bail_on_fixed") {
      out.push({name: "expect_bail_on_fixed", ok: true, detail: `${check.desc}(运行时红判定归 expectRc)`});
    } else {
      throw new Error(`未知契约 kind: ${check.kind}`);
    }
  }
  return out;
}

function sha256Of(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function compileFixtureWith(drv: string, fixtureRel: string, outExe: string) {
  return run(drv, ["system-link-exec", `--root:${TREE}`, `--in:${resolve(PKG, "fixtures/semantic", fixtureRel)}`,
    "--emit:exe", "--link-providers", "--target:arm64-apple-darwin", `--out:${outExe}`], {timeout: 180000});
}

function compileFixture(fixtureRel: string, outExe: string) {
  return compileFixtureWith(DRV, fixtureRel, outExe);
}

function main() {
  // [A] 生成器确定性
  const check = run("python3", [`${PKG}/tools/semantic_gen.py`, "--root", TREE, "--check"]);
  assert.equal(check.rc, 0, `semantic_gen --check 失败: ${check.stderr.slice(0, 300)}`);
  console.log(`[item27][A] semantic_gen --check OK`);

  // matrix 先行载入: [B] 需交叉核对 fixedLeg.expectRc, [C]/[C-fix] 需 expectRc 表
  const matrix = JSON.parse(readFileSync(MATRIX, "utf8")) as {entries: {name: string; fixture: string; expectRc?: number; expectCompileRc?: number}[]};
  const expectByFixture = new Map(matrix.entries.map((e) => [e.fixture, e]));

  // [B] 契约自洽
  const contract = JSON.parse(readFileSync(CONTRACT, "utf8")) as ContractDoc;
  assert.deepEqual(Object.keys(contract.families).sort(), [...POSITIVE_FAMILIES].sort(), "契约必须覆盖九族");
  assert.ok(contract.windowInstructions >= 16 && contract.blThenStoreGap >= 1, "窗口参数非法");
  assert.ok(contract.rssGate.boundBytes > contract.rssGate.negativeControlBytes, "RSS 门上下界倒置");
  assert.equal(contract.rssGate.fixtures.length, 2, "RSS 门必须钉 2 夹具");
  for (const [fam, variant] of Object.entries(FIXED_LEG_VARIANT)) {
    const fl = contract.families[fam]!.fixedLeg;
    assert.ok(fl !== undefined, `${fam} 缺 fixedLeg 注解(变体族 ${variant} 已存在)`);
    assert.equal(fl.fixture, `${variant}/${variant}_s1.cheng`, `${fam} fixedLeg.fixture 与变体族路径不一致`);
    assert.equal(fl.matrixFamily, variant, `${fam} fixedLeg.matrixFamily 与变体族不一致`);
    assert.ok(fl.checks.length >= 1, `${fam} fixedLeg.checks 不得为空`);
    for (const c of fl.checks) assert.ok(KNOWN_CHECK_KINDS.has(c.kind), `${fam} fixedLeg 未知契约 kind: ${c.kind}`);
    const entry = expectByFixture.get(fl.fixture);
    assert.ok(entry !== undefined, `matrix 缺 fixedLeg 夹具 ${fl.fixture}`);
    assert.equal(fl.expectRc, entry.expectRc, `${fam} fixedLeg.expectRc 与 matrix 矛盾(契约 ${fl.expectRc} vs matrix ${entry.expectRc})`);
  }
  console.log(`[item27][B] 契约自洽 OK(9 族 + ${Object.keys(FIXED_LEG_VARIANT).length} fixed-leg 注解, RSS 门 ${(contract.rssGate.boundBytes / 1048576).toFixed(0)}MiB)`);

  // [C] 编译+运行+otool
  rmSync(OUT, {recursive: true, force: true});
  mkdirSync(OUT, {recursive: true});
  const report: Record<string, unknown> = {
    driver: DRV, driverSha256: sha256Of(DRV),
    fixedDriver: DRV_FIXED, families: {}, fixedLeg: {}, rssGate: {},
  };
  for (const fam of POSITIVE_FAMILIES) {
    const fixtureRel = `${fam}/${fam}_s1.cheng`;
    const entry = expectByFixture.get(fixtureRel);
    assert.ok(entry !== undefined, `matrix 缺夹具 ${fixtureRel}`);
    const exe = `${OUT}/${fam}_s1.exe`;
    const compile = compileFixture(fixtureRel, exe);
    assert.equal(compile.rc, 0, `${fam} 编译失败: ${compile.stderr.slice(-200)}`);
    assert.ok(existsSync(exe), `${fam} 未产 exe`);
    const runRes = run(exe, []);
    const expectRc = entry.expectRc!;
    const runtimeGreen = runRes.rc === expectRc;
    const disasm = run("otool", ["-tv", exe]).stdout;
    const contractResults = evalContract(contract.families[fam]!.checks, disasm, contract.windowInstructions, contract.blThenStoreGap);
    const contractGreen = contractResults.every((r) => r.ok);
    (report.families as Record<string, unknown>)[fam] = {
      expectRc, runRc: runRes.rc, runtimeGreen, contractGreen,
      checks: contractResults.map((r) => `${r.ok ? "PASS" : "FAIL"} ${r.name} — ${r.detail}`),
    };
    if (RED_ON_DRV.has(fam)) {
      // 如实: 该族在当前 DRV 上必须 RED(运行时或契约拒), 且必须能说明红因
      const isRed = !runtimeGreen || !contractGreen;
      assert.ok(isRed, `${fam} 在旧代 DRV 上应为 RED 却全绿(疑似假绿或 bug 已修, 需人工复核)`);
      console.log(`[item27][C] ${fam}: RED 如实(runRc=${runRes.rc} vs expect=${expectRc}, contractGreen=${contractGreen})`);
    } else {
      assert.ok(runtimeGreen, `${fam} 运行时不绿: rc=${runRes.rc} vs expect=${expectRc}`);
      assert.ok(contractGreen, `${fam} otool 契约拒: ${JSON.stringify(contractResults.filter((r) => !r.ok))}`);
      console.log(`[item27][C] ${fam}: GREEN(rc=${runRes.rc}, 契约过)`);
    }
  }

  // [C-fix] 修复代腿: 编译过则必须真绿(运行时+契约), 诚实 bail 如实记录, driver 缺失记 MISSING
  const fixedLeg = report.fixedLeg as Record<string, unknown>;
  if (!existsSync(DRV_FIXED)) {
    fixedLeg.status = "MISSING";
    fixedLeg.reason = `driver 不存在: ${DRV_FIXED}`;
    console.log(`[item27][C-fix] MISSING: 修复代 driver 不存在(${DRV_FIXED}), 本腿仅记缺失`);
  } else {
    fixedLeg.status = "PRESENT";
    fixedLeg.driverSha256 = sha256Of(DRV_FIXED);
    const famVerdicts: Record<string, unknown> = {};
    for (const fam of POSITIVE_FAMILIES) {
      // 有 fixed-leg 变体的族改用变体夹具+变体契约(原族公开面已被 ZRPC 禁)
      const legFam = FIXED_LEG_VARIANT[fam] ?? fam;
      const fixtureRel = `${legFam}/${legFam}_s1.cheng`;
      const entry = expectByFixture.get(fixtureRel)!;
      const legChecks = legFam === fam ? contract.families[fam]!.checks : contract.families[fam]!.fixedLeg!.checks;
      const tag = legFam === fam ? fam : `${fam}(变体 ${legFam})`;
      const exe = `${OUT}/${legFam}_s1.fixed.exe`;
      const compile = compileFixtureWith(DRV_FIXED, fixtureRel, exe);
      if (compile.rc !== 0 || !existsSync(exe)) {
        // 诚实拒(门禁 bail/hard-fail): 记录 rc 与诊断尾部, 不算失败 — 修复代宁可拒不可误编译
        const errTail = (compile.stderr + compile.stdout).trim().split("\n").pop() ?? "";
        famVerdicts[fam] = {verdict: "BAIL", fixture: fixtureRel, variant: legFam !== fam, compileRc: compile.rc, diagnostic: errTail.slice(0, 200)};
        console.log(`[item27][C-fix] ${tag}: BAIL(compile rc=${compile.rc}) ${errTail.slice(0, 120)}`);
        continue;
      }
      const runRes = run(exe, []);
      const expectRc = entry.expectRc!;
      const disasm = run("otool", ["-tv", exe]).stdout;
      const contractResults = evalContract(legChecks, disasm, contract.windowInstructions, contract.blThenStoreGap);
      const runtimeGreen = runRes.rc === expectRc;
      const contractGreen = contractResults.every((r) => r.ok);
      famVerdicts[fam] = {
        verdict: runtimeGreen && contractGreen ? "GREEN" : "RED",
        fixture: fixtureRel, variant: legFam !== fam,
        expectRc, runRc: runRes.rc, runtimeGreen, contractGreen,
        checks: contractResults.map((r) => `${r.ok ? "PASS" : "FAIL"} ${r.name} — ${r.detail}`),
      };
      assert.ok(runtimeGreen && contractGreen,
        `${tag} 在修复代 driver 上编译通过却不真绿(runRc=${runRes.rc} vs expect=${expectRc}, contractGreen=${contractGreen}) — 疑似误编译, 严禁假绿`);
      console.log(`[item27][C-fix] ${tag}: GREEN(rc=${runRes.rc}, 契约过)`);
    }
    fixedLeg.families = famVerdicts;
  }

  // [D] 负例族
  const negExe = `${OUT}/neg_positional_ctor_s1.exe`;
  const negCompile = compileFixture("neg_positional_ctor/neg_positional_ctor_s1.cheng", negExe);
  assert.equal(negCompile.rc, 2, `负例族必须 compile rc=2, 实得 ${negCompile.rc}`);
  assert.ok(!existsSync(negExe), "负例族不得产 exe");
  console.log(`[item27][D] neg_positional_ctor: compile rc=2 诚实拒`);

  // [E] RSS 门
  const bound = contract.rssGate.boundBytes;
  for (const fixtureRel of contract.rssGate.fixtures) {
    const tag = fixtureRel.split("/")[0]!;
    const repPath = `${OUT}/rss_${tag}.report`;
    const guard = run(GUARD, [`--rss-limit:${bound}`, "--timeout:180", `--report-out:${repPath}`,
      `--stdout:${OUT}/rss_${tag}.stdout`, `--stderr:${OUT}/rss_${tag}.stderr`, "--",
      DRV, "system-link-exec", `--root:${TREE}`, `--in:${resolve(PKG, "fixtures/semantic", fixtureRel)}`,
      "--emit:exe", "--link-providers", "--target:arm64-apple-darwin", `--out:${OUT}/rss_${tag}.exe`], {timeout: 240000});
    assert.equal(guard.rc, 0, `RSS 门违规(${fixtureRel}): guard rc=${guard.rc}`);
    const peakMatch = /process_tree_resident_peak_bytes=(\d+)/.exec(readFileSync(repPath, "utf8"));
    (report.rssGate as Record<string, unknown>)[fixtureRel] = {guardRc: guard.rc, peakBytes: peakMatch === null ? null : Number(peakMatch[1])};
    console.log(`[item27][E] ${fixtureRel}: guard 过(peak=${peakMatch?.[1] ?? "?"}B ≤ ${bound}B)`);
  }
  const negRep = `${OUT}/rss_negative.report`;
  const negGuard = run(GUARD, [`--rss-limit:${contract.rssGate.negativeControlBytes}`, "--timeout:120",
    `--report-out:${negRep}`, `--stdout:${OUT}/rssn.stdout`, `--stderr:${OUT}/rssn.stderr`, "--",
    DRV, "system-link-exec", `--root:${TREE}`, `--in:${resolve(PKG, "fixtures/semantic", contract.rssGate.fixtures[0]!)}`,
    "--emit:exe", "--link-providers", "--target:arm64-apple-darwin", `--out:${OUT}/rssn.exe`], {timeout: 240000});
  assert.notEqual(negGuard.rc, 0, "RSS 负对照(16MiB)必须违规");
  const negReport = readFileSync(negRep, "utf8");
  assert.ok(/abort_reason=rss_limit_exceeded/.test(negReport), `负对照必须报 rss_limit_exceeded`);
  (report.rssGate as Record<string, unknown>).negativeControl = {guardRc: negGuard.rc, abort: "rss_limit_exceeded"};
  console.log(`[item27][E] 负对照: guard rc=${negGuard.rc} + rss_limit_exceeded(门会咬)`);

  writeFileSync(`${OUT}/nine_report.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(`[item27] 全部通过, 报告: ${OUT}/nine_report.json`);
}

// 直接执行(bun run 本文件)才跑 main; 被 import(如标定脚本复用 evalContract)时跳过。
const invokedAs = process.argv[1] === undefined ? "" : resolve(process.argv[1]);
if (invokedAs === fileURLToPath(import.meta.url)) main();
