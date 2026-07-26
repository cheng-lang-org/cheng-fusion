// cheng_fixture_matrix 真实端到端：临时写入最小 Cheng 源码，使用仓内 stage3 与它的
// 真实可执行副本跑完整 drivers[] x fixtures[]。不替换生产编译/运行逻辑，不使用 stub。
import {chmodSync, copyFileSync, existsSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync} from "node:fs";
import assert from "node:assert/strict";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {startMcp, assertTrue} from "./mcp_client.ts";
import {assertFixtureMatrixReportSchema} from "../src/cheng_fixture_matrix_m9021.ts";

const CHENG_ROOT = process.env.CHENG_TOOLCHAIN_ROOT || process.env.CHENG_ROOT || "/Users/lbcheng/cheng-lang";
const STAGE3 = process.env.CHENG_STAGE3_DRIVER || join(CHENG_ROOT, "artifacts/bootstrap/cheng.stage3");

function fixtureSource(rc: number) {
  return `fn main(): int32 =\n    return ${rc}\n`;
}

async function expectToolError(mcp: ReturnType<typeof startMcp>, args: any, messagePart: string) {
  const {isError, parsed} = await mcp.callTool("cheng_fixture_matrix", args, undefined, 10000);
  assertTrue(isError === true, `非法镜像矩阵必须 isError: ${messagePart}`);
  assertTrue(String(parsed).includes(messagePart), `错误必须响亮指出 ${JSON.stringify(messagePart)}, 实得 ${JSON.stringify(parsed)}`);
}

async function main() {
  assertTrue(existsSync(STAGE3), `真实 stage3 存在: ${STAGE3}`);
  assertTrue(existsSync(join(CHENG_ROOT, "cheng-package.toml")), `显式 root 是 Cheng 项目: ${CHENG_ROOT}`);
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), "fusion-harness-item15-")));
  const driverClone = join(scratch, "cheng.stage3.clone");
  const driverAlias = join(scratch, "cheng.stage3.alias");
  const falseFixture = join(scratch, "branch.cheng");
  const trueFixture = join(scratch, "branch_true.cheng");
  const sameTrueFixture = join(scratch, "same_true.cheng");
  const wrongFixture = join(scratch, "wrong_expectation.cheng");
  const compileFailureFixture = join(scratch, "compile_failure.cheng");
  const symlinkDriver = join(scratch, "symlink-output-driver.sh");
  const slowDriver = join(scratch, "slow-driver.sh");
  const overflowDriver = join(scratch, "overflow-driver.sh");
  copyFileSync(STAGE3, driverClone);
  chmodSync(driverClone, 0o755);
  symlinkSync(driverClone, driverAlias);
  writeFileSync(falseFixture, fixtureSource(0));
  writeFileSync(trueFixture, fixtureSource(7));
  writeFileSync(sameTrueFixture, fixtureSource(0));
  writeFileSync(wrongFixture, fixtureSource(3));
  writeFileSync(compileFailureFixture, "this is not valid Cheng source\n");
  writeFileSync(symlinkDriver, [
    "#!/bin/bash",
    "set -euo pipefail",
    'out=""',
    'for arg in "$@"; do case "$arg" in --out:*) out="${arg#--out:}" ;; esac; done',
    '[ -n "$out" ]',
    'ln -s /usr/bin/true "$out"',
    "",
  ].join("\n"));
  writeFileSync(slowDriver, "#!/bin/bash\nsleep 2\n");
  writeFileSync(overflowDriver, "#!/bin/bash\npython3 -c 'import os, time; os.write(2, b\"x\" * 4096); time.sleep(5)'\n");
  chmodSync(symlinkDriver, 0o755);
  chmodSync(slowDriver, 0o755);
  chmodSync(overflowDriver, 0o755);

  try {
    // initialize 故意不传 workspace root：该工具必须只消费调用里显式给出的 clone root。
    const mcp = startMcp({}, scratch);
    try {
      await mcp.initialize();

      console.log("[A] 两个真实 driver x 两个真实 mirror fixture，四格全绿");
      const pairFixtures = [
        {name: "branch", path: falseFixture, expectRc: 0, mirror: "branch_true", requiresMirror: true},
        {name: "branch_true", path: trueFixture, expectRc: 7, mirror: "branch"},
      ];
      {
        const {isError, parsed} = await mcp.callTool("cheng_fixture_matrix", {
          drivers: [STAGE3, driverClone],
          fixtures: pairFixtures,
          root: CHENG_ROOT,
          timeoutSec: 30,
        }, undefined, 120000);
        assertTrue(isError !== true, `真实 2x2 matrix 调用成功, 实得 ${JSON.stringify(parsed).slice(0, 400)}`);
        assertTrue(parsed.schema === "cheng_fixture_matrix", `schema canonical`);
        assert.throws(
          () => assertFixtureMatrixReportSchema({...parsed, schema: "cheng_fixture_matrix.v1"}),
          /unsupported fixture matrix report schema/,
          "legacy fixture-matrix report schema must be rejected",
        );
        assertTrue(parsed.verdict === "GREEN", `全矩阵 verdict=GREEN, 实得 ${parsed.verdict}`);
        assertTrue(parsed.summary?.total === 4 && parsed.summary?.green === 4 && parsed.summary?.red === 0, `四个 cell 全绿`);
        assertTrue(parsed.results?.length === 4, `drivers[] x fixtures[] 真实产生四格`);
        assertTrue(parsed.results.every((cell: any) => cell.compileRc === 0 && cell.runRc === cell.expectRc && cell.status === "GREEN"), `每格都真实编译、运行并命中自己的 expectRc`);
        assertTrue(parsed.mirrorPairs?.length === 1, `识别一个 mirror pair`);
        assertTrue(parsed.mirrorPairs[0].pairVerdict === "GREEN", `mirror pair 聚合 pairVerdict=GREEN`);
        assertTrue(parsed.mirrorPairs[0].perDriver?.length === 2 && parsed.mirrorPairs[0].perDriver.every((entry: any) => entry.pairVerdict === "GREEN"), `每个 driver 的 pairVerdict 都是 GREEN`);
      }

      console.log("[A2] mirror 两端可拥有相同 expectRc，只按各自契约判绿");
      {
        const {isError, parsed} = await mcp.callTool("cheng_fixture_matrix", {
          drivers: [STAGE3],
          fixtures: [
            {name: "same", path: falseFixture, expectRc: 0},
            {name: "same_true", path: sameTrueFixture, expectRc: 0},
          ],
          root: CHENG_ROOT,
          timeoutSec: 30,
        }, undefined, 60000);
        assertTrue(isError !== true, `相同 expectRc 的自动 mirror pair 合法`);
        assertTrue(parsed.verdict === "GREEN" && parsed.mirrorPairs?.[0]?.pairVerdict === "GREEN", `不推断两端 rc 同异，只验证两格契约全绿`);
      }

      console.log("[B] 错误 expectRc 必须保留真实 runRc 并判 RED");
      {
        const {isError, parsed} = await mcp.callTool("cheng_fixture_matrix", {
          drivers: [STAGE3],
          fixtures: [
            {name: "wrong", path: falseFixture, expectRc: 0},
            {name: "wrong_true", path: wrongFixture, expectRc: 4},
          ],
          root: CHENG_ROOT,
          timeoutSec: 30,
        }, undefined, 60000);
        assertTrue(isError !== true, `错误期望是矩阵 RED，不是工具异常`);
        const cell = parsed.results?.find((entry: any) => entry.fixture === "wrong_true");
        assertTrue(parsed.verdict === "RED" && parsed.summary?.red === 1, `错误 expectRc 使矩阵 RED`);
        assertTrue(cell?.compileRc === 0 && cell?.runRc === 3 && cell?.expectRc === 4, `保留真实 rc=3 与错误期望 rc=4`);
        assertTrue(cell?.status === "RED" && cell?.reason === "expected_rc_mismatch", `cell 明确判 RED/expected_rc_mismatch`);
        assertTrue(parsed.mirrorPairs?.[0]?.pairVerdict === "RED" && parsed.summary?.pairRed === 1, `mirror 任一格不满足即 pairVerdict=RED`);
      }

      console.log("[B2] 真实编译失败必须是 RED cell");
      {
        const {isError, parsed} = await mcp.callTool("cheng_fixture_matrix", {
          drivers: [STAGE3],
          fixtures: [{name: "compile_failure", path: compileFailureFixture, expectRc: 0}],
          root: CHENG_ROOT,
          timeoutSec: 30,
        }, undefined, 60000);
        assertTrue(isError !== true, `编译失败由 cell 判决，不吞成 MCP 异常`);
        const cell = parsed.results?.[0];
        assertTrue(parsed.verdict === "RED" && cell?.status === "RED", `编译失败使 cell/matrix RED`);
        assertTrue(cell?.compileRc !== 0 && cell?.runRc === null && cell?.reason === "compile_failed", `保留真实 compileRc，且不运行不存在的 executable`);
      }

      console.log("[B3] 驱动用 symlink 伪造输出不得被当成可执行产物");
      {
        const {isError, parsed} = await mcp.callTool("cheng_fixture_matrix", {
          drivers: [symlinkDriver],
          fixtures: [{name: "symlink_output", path: falseFixture, expectRc: 0}],
          root: CHENG_ROOT,
          timeoutSec: 5,
        }, undefined, 10000);
        assertTrue(isError !== true, `symlink 产物返回结构化 RED`);
        const cell = parsed.results?.[0];
        assertTrue(cell?.compileRc === 0 && cell?.status === "RED" && cell?.reason === "executable_not_produced", `rc=0 + symlink 不是真实产物`);
        assertTrue(cell?.checks?.compileSucceeded === true && cell?.checks?.executableProduced === false, `lstat 明确拒绝 symlink`);
      }

      console.log("[B4] 编译超时绝不得进入 compiled/GREEN");
      {
        const {isError, parsed} = await mcp.callTool("cheng_fixture_matrix", {
          drivers: [slowDriver],
          fixtures: [{name: "compile_timeout", path: falseFixture, expectRc: 0}],
          root: CHENG_ROOT,
          timeoutSec: 0.01,
        }, undefined, 10000);
        assertTrue(isError !== true, `编译超时返回结构化 RED`);
        const cell = parsed.results?.[0];
        assertTrue(cell?.status === "RED" && cell?.compileTimedOut === true && cell?.reason === "compile_timed_out", `timeout cell 必为 RED`);
        assertTrue(cell?.checks?.compileSucceeded === false && cell?.checks?.executableProduced === false, `timeout 不得伪造 compileSucceeded`);
      }

      console.log("[B5] 编译输出溢出绝不得进入 compiled/GREEN");
      {
        const {isError, parsed} = await mcp.callTool("cheng_fixture_matrix", {
          drivers: [overflowDriver],
          fixtures: [{name: "compile_overflow", path: falseFixture, expectRc: 0}],
          root: CHENG_ROOT,
          timeoutSec: 5,
          maxOutputBytes: 128,
        }, undefined, 10000);
        assertTrue(isError !== true, `编译输出溢出返回结构化 RED`);
        const cell = parsed.results?.[0];
        assertTrue(cell?.status === "RED" && cell?.compileOverflow === true && cell?.reason === "compile_output_overflow", `overflow cell 必为 RED`);
        assertTrue(cell?.checks?.processOk === false && cell?.checks?.compileSucceeded === false, `overflow 明确使 processOk=false`);
      }

      console.log("[C] mirror 结构错误全部在编译前 hard-fail");
      await expectToolError(mcp, {
        drivers: [STAGE3], root: CHENG_ROOT,
        fixtures: [{name: "orphan_true", path: trueFixture, expectRc: 7}],
      }, "automatic _true mirror missing base fixture");
      await expectToolError(mcp, {
        drivers: [STAGE3], root: CHENG_ROOT,
        fixtures: [{name: "lonely", path: falseFixture, expectRc: 0, requiresMirror: true}],
      }, "requiresMirror fixture missing mirror");
      await expectToolError(mcp, {
        drivers: [STAGE3], root: CHENG_ROOT,
        fixtures: [
          {name: "one", path: falseFixture, expectRc: 0, mirror: "one_true"},
          {name: "one_true", path: trueFixture, expectRc: 7},
        ],
      }, "explicit mirror must be bidirectional");
      await expectToolError(mcp, {
        drivers: [STAGE3], root: CHENG_ROOT,
        fixtures: [
          {name: "duplicate", path: falseFixture, expectRc: 0},
          {name: "duplicate", path: trueFixture, expectRc: 7},
        ],
      }, "duplicate fixture name");
      await expectToolError(mcp, {
        drivers: [STAGE3], root: CHENG_ROOT,
        fixtures: [
          {name: "auto", path: falseFixture, expectRc: 0, mirror: "other"},
          {name: "auto_true", path: trueFixture, expectRc: 7},
          {name: "other", path: wrongFixture, expectRc: 3, mirror: "auto"},
        ],
      }, "duplicate/conflicting mirror");
      await expectToolError(mcp, {
        drivers: [STAGE3], root: CHENG_ROOT,
        fixtures: [
          {name: "same_path", path: falseFixture, expectRc: 0},
          {name: "same_path_true", path: falseFixture, expectRc: 0},
        ],
      }, "duplicate fixture path");
      await expectToolError(mcp, {
        drivers: [driverClone, driverAlias], root: CHENG_ROOT,
        fixtures: [{name: "one", path: falseFixture, expectRc: 0}],
      }, "duplicate driver path");
      await expectToolError(mcp, {
        drivers: [STAGE3], root: scratch,
        fixtures: [{name: "one", path: falseFixture, expectRc: 0}],
      }, "root cheng-package.toml not found");

      console.log("[D] fixture schema 强制 name/path/expectRc");
      {
        const {isError, parsed} = await mcp.callTool("cheng_fixture_matrix", {
          drivers: [STAGE3], root: CHENG_ROOT,
          fixtures: [{name: "missing_rc", path: falseFixture}],
        }, undefined, 10000);
        assertTrue(isError === true, `缺 expectRc 被 schema 拒绝, 实得 ${JSON.stringify(parsed).slice(0, 200)}`);
      }
    } finally {
      mcp.kill();
    }
  } finally {
    rmSync(scratch, {recursive: true, force: true});
  }
  console.log("item15 fixture_matrix: PASS");
}

main().catch((error) => {
  console.error("item15 fixture_matrix: FAIL", error);
  process.exit(1);
});
