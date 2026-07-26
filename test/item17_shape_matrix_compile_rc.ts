// cheng_shape_matrix 真实 stage3 端到端回归。生产判定不被替换；仅契约预检
// 用一个会写哨兵文件的脚本，证明非法矩阵在第一个 spawn 前 hard-fail。
import {chmodSync, existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, truncateSync, writeFileSync} from "node:fs";
import assert from "node:assert/strict";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {assertTrue, startMcp} from "./mcp_client.ts";
import {assertShapeMatrixReportSchema} from "../src/cheng_shape_matrix_m9016.ts";

const FUSION_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHENG_ROOT = process.env.CHENG_TOOLCHAIN_ROOT || process.env.CHENG_ROOT || "/Users/lbcheng/cheng-lang";
const STAGE3 = process.env.CHENG_STAGE3_DRIVER || join(CHENG_ROOT, "artifacts/bootstrap/cheng.stage3");

function fixtureSource(rc: number) {
  return `fn main(): int32 =\n    return ${rc}\n`;
}

function writeMatrix(path: string, entries: any[]) {
  writeFileSync(path, JSON.stringify({defaultRoot: CHENG_ROOT, entries}, null, 2) + "\n");
}

function resultByName(parsed: any, name: string) {
  const result = parsed.results.find((entry: any) => entry.name === name);
  assertTrue(Boolean(result), `结果包含 ${name}`);
  return result;
}

async function main() {
  assertTrue(existsSync(STAGE3), `真实 stage3 存在: ${STAGE3}`);
  assertTrue(existsSync(join(CHENG_ROOT, "cheng-package.toml")), `真实 Cheng root 存在: ${CHENG_ROOT}`);

  const scratch = realpathSync(mkdtempSync(join(tmpdir(), "fusion-shape-contract-")));
  const valid0 = join(scratch, "valid0.cheng");
  const valid7 = join(scratch, "valid7.cheng");
  const invalid = join(scratch, "invalid.cheng");
  const infinite = join(scratch, "infinite.cheng");
  const emptyGolden = join(scratch, "empty.golden");
  const rawGolden = join(scratch, "raw-byte.golden");
  const rawEmitter = join(scratch, "raw-byte-emitter");
  const whitespaceEmitter = join(scratch, "whitespace-emitter");
  const rawOutputDriver = join(scratch, "raw-output-driver.sh");
  const whitespaceOutputDriver = join(scratch, "whitespace-output-driver.sh");
  const symlinkOutputDriver = join(scratch, "symlink-output-driver.sh");
  const failedArtifactDriver = join(scratch, "failed-artifact-driver.sh");
  const mutableGolden = join(scratch, "mutable.golden");
  const mutableGoldenEmitter = join(scratch, "mutable-golden-emitter");
  const mutableGoldenDriver = join(scratch, "mutable-golden-driver.sh");
  const completeBailDriver = join(scratch, "complete-bail-driver.sh");
  const partialBailDriver = join(scratch, "partial-bail-driver.sh");
  const stdoutOnlyBailDriver = join(scratch, "stdout-only-bail-driver.sh");
  const nonCanonicalBailDriver = join(scratch, "noncanonical-bail-driver.sh");
  const invalidUtf8BailDriver = join(scratch, "invalid-utf8-bail-driver.sh");
  const overflowDriver = join(scratch, "overflow-driver.sh");
  const snapshotFirst = join(scratch, "snapshot-first.cheng");
  const snapshotSecond = join(scratch, "snapshot-second.cheng");
  const snapshotThird = join(scratch, "snapshot-third.cheng");
  const snapshotDecoy = join(scratch, "snapshot-decoy.cheng");
  const snapshotMatrix = join(scratch, "snapshot-matrix.json");
  const snapshotDriver = join(scratch, "snapshot-driver.sh");
  const maliciousSnapshotDriver = join(scratch, "malicious-snapshot-driver.sh");
  writeFileSync(valid0, fixtureSource(0));
  writeFileSync(valid7, fixtureSource(7));
  writeFileSync(invalid, "this is not valid Cheng source\n");
  writeFileSync(infinite, "fn main(): int32 =\n    while 1 == 1:\n        continue\n    return 0\n");
  writeFileSync(emptyGolden, "");
  writeFileSync(rawGolden, Buffer.from([0xff]));
  writeFileSync(mutableGolden, "expected\n");
  writeFileSync(snapshotFirst, "SNAPSHOT_OK\n");
  writeFileSync(snapshotSecond, "SNAPSHOT_OK\n");
  writeFileSync(snapshotThird, "SNAPSHOT_OK\n");
  writeFileSync(snapshotDecoy, "MUTATED_BAD\n");
  writeFileSync(rawEmitter, "#!/usr/bin/env python3\nimport os\nos.write(1, bytes([255]))\n");
  writeFileSync(whitespaceEmitter, "#!/usr/bin/env python3\nimport os\nos.write(1, b'value \\n')\n");
  writeFileSync(mutableGoldenEmitter, "#!/bin/bash\nprintf 'actual\\n'\n");
  chmodSync(rawEmitter, 0o755);
  chmodSync(whitespaceEmitter, 0o755);
  chmodSync(mutableGoldenEmitter, 0o755);
  const outputArgParser = [
    'out=""',
    'for arg in "$@"; do case "$arg" in --out:*) out="${arg#--out:}" ;; esac; done',
    '[ -n "$out" ]',
  ];
  writeFileSync(rawOutputDriver, [
    "#!/bin/bash",
    "set -euo pipefail",
    ...outputArgParser,
    `/bin/cp ${JSON.stringify(rawEmitter)} "$out"`,
    'chmod 755 "$out"',
    "",
  ].join("\n"));
  writeFileSync(whitespaceOutputDriver, [
    "#!/bin/bash",
    "set -euo pipefail",
    ...outputArgParser,
    `/bin/cp ${JSON.stringify(whitespaceEmitter)} "$out"`,
    'chmod 755 "$out"',
    "",
  ].join("\n"));
  writeFileSync(symlinkOutputDriver, [
    "#!/bin/bash",
    "set -euo pipefail",
    ...outputArgParser,
    'ln -s /usr/bin/true "$out"',
    "",
  ].join("\n"));
  writeFileSync(failedArtifactDriver, [
    "#!/bin/bash",
    "set -euo pipefail",
    ...outputArgParser,
    'case "$out" in',
    '  *entry-0.exe) ln -s /usr/bin/true "$out" ;;',
    '  *entry-1.exe) : > "$out" ;;',
    '  *entry-2.exe) printf partial > "$out"; chmod 644 "$out" ;;',
    '  *) exit 98 ;;',
    'esac',
    'exit 2',
    "",
  ].join("\n"));
  writeFileSync(mutableGoldenDriver, [
    "#!/bin/bash",
    "set -euo pipefail",
    ...outputArgParser,
    `/bin/cp ${JSON.stringify(mutableGoldenEmitter)} "$out"`,
    'chmod 755 "$out"',
    `printf 'actual\\n' > ${JSON.stringify(mutableGolden)}`,
    "",
  ].join("\n"));
  const completeBailRecord = "ZC_NOT_READY idx=0/1 function=main body_kind=statement_sequence detail= line=7 fz_kind=0 stmt_kind=1 bail=6641 slot_diag=invalid_op:line=7";
  writeFileSync(completeBailDriver, `#!/bin/bash\nif [[ \${CHENG_NO_BACKEND_DRIVER_HANDOFF+x} == x ]] || [[ \${CHENG_REQUIRE_PURE_PROVIDERS+x} == x ]]; then printf 'driver environment was not unset\\n' >&2; exit 97; fi\nprintf '%s\\n' '${completeBailRecord}' 'ZC_NOT_READY_TOTAL count=1' >&2\nexit 2\n`);
  writeFileSync(partialBailDriver, `#!/bin/bash\nprintf '%s\\n' '${completeBailRecord}' >&2\nexit 1\n`);
  writeFileSync(stdoutOnlyBailDriver, `#!/bin/bash\nprintf '%s\\n' '${completeBailRecord}' 'ZC_NOT_READY_TOTAL count=1'\nexit 2\n`);
  writeFileSync(nonCanonicalBailDriver, "#!/bin/bash\nprintf '%s\\n' 'ZC_NOT_READY idx=00/01 function=main body_kind=statement_sequence detail= line=07 fz_kind=0 stmt_kind=1 bail=06641 slot_diag=invalid_op:line=7' 'ZC_NOT_READY_TOTAL count=01' >&2\nexit 2\n");
  writeFileSync(invalidUtf8BailDriver, "#!/bin/bash\nprintf '\\377' >&2\nexit 2\n");
  writeFileSync(overflowDriver, "#!/bin/bash\npython3 -c 'import os, time; os.write(2, b\"x\" * 4096); time.sleep(5)'\n");
  writeFileSync(maliciousSnapshotDriver, "#!/bin/bash\nexit 77\n");
  writeMatrix(snapshotMatrix, [
    {name: "snapshot_first", fixture: snapshotFirst, expectCompileRc: 0},
    {name: "snapshot_second", fixture: snapshotSecond, expectCompileRc: 0},
    {name: "snapshot_third", fixture: snapshotThird, expectCompileRc: 0},
  ]);
  writeFileSync(snapshotDriver, [
    "#!/bin/bash",
    "set -euo pipefail",
    'in=""',
    'out=""',
    'for arg in "$@"; do case "$arg" in --in:*) in="${arg#--in:}" ;; --out:*) out="${arg#--out:}" ;; esac; done',
    '[ -n "$in" ] && [ -n "$out" ]',
    `printf 'not-json\\n' > ${JSON.stringify(snapshotMatrix)}`,
    `printf 'MUTATED_BAD\\n' > ${JSON.stringify(snapshotSecond)}`,
    `rm -f ${JSON.stringify(snapshotThird)}`,
    `ln -s ${JSON.stringify(snapshotDecoy)} ${JSON.stringify(snapshotThird)}`,
    `/bin/cp ${JSON.stringify(maliciousSnapshotDriver)} ${JSON.stringify(snapshotDriver)}`,
    `chmod 755 ${JSON.stringify(snapshotDriver)}`,
    'grep -q "^SNAPSHOT_OK$" "$in"',
    '/bin/cp /usr/bin/true "$out"',
    'chmod 755 "$out"',
    "",
  ].join("\n"));
  chmodSync(rawOutputDriver, 0o755);
  chmodSync(whitespaceOutputDriver, 0o755);
  chmodSync(symlinkOutputDriver, 0o755);
  chmodSync(failedArtifactDriver, 0o755);
  chmodSync(mutableGoldenDriver, 0o755);
  chmodSync(completeBailDriver, 0o755);
  chmodSync(partialBailDriver, 0o755);
  chmodSync(stdoutOnlyBailDriver, 0o755);
  chmodSync(nonCanonicalBailDriver, 0o755);
  chmodSync(invalidUtf8BailDriver, 0o755);
  chmodSync(overflowDriver, 0o755);
  chmodSync(snapshotDriver, 0o755);
  chmodSync(maliciousSnapshotDriver, 0o755);

  const mcp = startMcp({CHENG_NO_BACKEND_DRIVER_HANDOFF: "poison", CHENG_REQUIRE_PURE_PROVIDERS: "poison"}, CHENG_ROOT);
  try {
    await mcp.initialize({rootUri: `file://${CHENG_ROOT}`, workspaceFolders: [{uri: `file://${CHENG_ROOT}`, name: "cheng-lang"}]});

    console.log("[A] checked-in matrix + 真实 stage3: f47 编译契约必须 GREEN");
    {
      const {isError, parsed} = await mcp.callTool("cheng_shape_matrix", {
        driver: STAGE3,
        root: CHENG_ROOT,
        filterTag: "kind:seq-fnvalue-readback",
        timeoutSec: 30,
      }, undefined, 60000);
      assertTrue(isError !== true, `checked-in matrix 真实调用成功，实得 ${JSON.stringify(parsed).slice(0, 500)}`);
      assertTrue(parsed.schema === "cheng_shape_matrix", `shape_matrix 使用唯一 canonical schema，实得 ${parsed.schema}`);
      assert.throws(
        () => assertShapeMatrixReportSchema({...parsed, schema: "cheng_shape_matrix.v1"}),
        /unsupported shape matrix report schema/,
        "legacy shape-matrix report schema must be rejected",
      );
      assertTrue(parsed.results.length === 1 && parsed.results[0].name === "f47_probe_seq_fnvalue", `精确选中 checked-in f47 entry`);
      const result = parsed.results[0];
      assertTrue(result.status === "GREEN" && result.rc === 0, `当前真实 stage3 rc=0 命中 checked-in 契约`);
      assertTrue(result.checks?.processOk === true && result.checks?.materialized === true && result.checks?.compileRcMatch === true, `真实可执行产物与 compile rc 同时成立`);
      assertTrue(parsed.summary?.selected === 1 && parsed.summary?.total === parsed.summary.selected + parsed.summary.skipped, `filterTag 如实统计全矩阵 selected/skipped`);
      assertTrue(parsed.summary?.coverageGaps?.length === parsed.summary.skipped && !parsed.summary.coverageGaps.some((entry: any) => entry.name === "f47_probe_seq_fnvalue"), `coverageGaps 精确列出未执行条目`);
    }

    console.log("[B] 临时 Cheng fixtures + 真实 stage3: materialized/rc/runtime 契约");
    const realMatrix = join(scratch, "real-matrix.json");
    writeMatrix(realMatrix, [
      {name: "compile_zero", fixture: valid0, expectCompileRc: 0},
      {name: "compile_reject", fixture: invalid, expectCompileRc: 2},
      {name: "unexpected_success", fixture: valid0, expectCompileRc: 2},
      {name: "wrong_nonzero", fixture: invalid, expectCompileRc: 3},
      {name: "runtime_combo", fixture: valid7, expectRc: 7, expectStdout: "", golden: emptyGolden},
    ]);
    {
      const {isError, parsed} = await mcp.callTool("cheng_shape_matrix", {
        driver: STAGE3,
        matrixPath: realMatrix,
        root: CHENG_ROOT,
        timeoutSec: 30,
      }, undefined, 120000);
      assertTrue(isError !== true, `真实自定义矩阵调用成功，实得 ${JSON.stringify(parsed).slice(0, 500)}`);

      const compileZero = resultByName(parsed, "compile_zero");
      assertTrue(compileZero.status === "GREEN" && compileZero.rc === 0, `expectCompileRc=0 真实命中 GREEN`);
      assertTrue(compileZero.checks?.processOk === true && compileZero.checks?.materialized === true && compileZero.checks?.materializationOk === true, `rc=0 必须伴随非空可执行产物`);

      const compileReject = resultByName(parsed, "compile_reject");
      assertTrue(compileReject.status === "GREEN" && compileReject.rc === 2 && compileReject.checks?.compileRcMatch === true, `真实非零 compile rc 精确命中 GREEN`);

      const unexpected = resultByName(parsed, "unexpected_success");
      assertTrue(unexpected.status === "RED" && unexpected.rc === 0 && unexpected.checks?.compileRcMatch === false, `真实意外编译成功为 RED`);

      const wrong = resultByName(parsed, "wrong_nonzero");
      assertTrue(wrong.status === "RED" && wrong.rc === 2 && wrong.checks?.compileRcMatch === false, `真实其他非零 rc 错配为 RED`);

      const runtime = resultByName(parsed, "runtime_combo");
      assertTrue(runtime.status === "GREEN" && runtime.rc === 7, `runtime 组内多契约可组合且全部命中`);
      assertTrue(runtime.checks?.processOk === true && runtime.checks?.materialized === true && runtime.checks?.rcMatch === true && runtime.checks?.stdoutMatch === true && runtime.checks?.goldenMatch === true, `runtime 每个 check 都有真实证据`);
    }

    console.log("[C] rc=0 但未产出非空可执行：不得 GREEN");
    const noArtifactMatrix = join(scratch, "no-artifact-matrix.json");
    writeMatrix(noArtifactMatrix, [{name: "no_artifact", fixture: valid0, expectCompileRc: 0}]);
    {
      const {isError, parsed} = await mcp.callTool("cheng_shape_matrix", {
        driver: "/usr/bin/true",
        matrixPath: noArtifactMatrix,
        root: CHENG_ROOT,
        timeoutSec: 5,
      });
      assertTrue(isError !== true, `rc=0 无产物返回结构化 CFAIL`);
      const result = parsed.results[0];
      assertTrue(result.status === "CFAIL" && result.rc === 0, `rc=0 无产物为 CFAIL`);
      assertTrue(result.checks?.processOk === true && result.checks?.materialized === false && result.checks?.materializationOk === false, `materialized invariant 明确失败`);
    }

    console.log("[C2] rc=0 但仅产出 symlink：不得 GREEN");
    const symlinkMatrix = join(scratch, "symlink-artifact-matrix.json");
    writeMatrix(symlinkMatrix, [{name: "symlink_artifact", fixture: valid0, expectCompileRc: 0}]);
    {
      const {isError, parsed} = await mcp.callTool("cheng_shape_matrix", {
        driver: symlinkOutputDriver,
        matrixPath: symlinkMatrix,
        root: CHENG_ROOT,
        timeoutSec: 5,
      });
      assertTrue(isError !== true, `symlink 产物返回结构化 CFAIL`);
      const result = parsed.results[0];
      assertTrue(result.status === "CFAIL" && result.rc === 0, `rc=0 + symlink 产物为 CFAIL`);
      assertTrue(result.checks?.processOk === true && result.checks?.materialized === false && result.checks?.materializationOk === false, `lstat 明确拒绝 symlink`);
    }

    console.log("[C2b] 非零 rc 留下 symlink/空文件/非执行文件：三种残留都必须 CFAIL");
    const failedArtifactMatrix = join(scratch, "failed-artifact-matrix.json");
    writeMatrix(failedArtifactMatrix, [
      {name: "failed_symlink", fixture: valid0, expectCompileRc: 2},
      {name: "failed_empty", fixture: valid0, expectCompileRc: 2},
      {name: "failed_nonexec", fixture: valid0, expectCompileRc: 2},
    ]);
    {
      const {isError, parsed} = await mcp.callTool("cheng_shape_matrix", {
        driver: failedArtifactDriver,
        matrixPath: failedArtifactMatrix,
        root: CHENG_ROOT,
        timeoutSec: 5,
      });
      assertTrue(isError !== true, `非零 rc 残留产物返回结构化 CFAIL`);
      assertTrue(parsed.results.length === 3, `三种失败产物都有结果`);
      for (const result of parsed.results) {
        assertTrue(result.status === "CFAIL" && result.rc === 2, `${result.name}: 命中期望 rc 也不能掩盖残留产物`);
        assertTrue(result.checks?.processOk === true && result.checks?.compileRcMatch === true, `${result.name}: 进程与 rc 证据本身成立`);
        assertTrue(result.checks?.artifactPresent === true && result.checks?.materialized === false && result.checks?.materializationOk === false, `${result.name}: 任意残留路径都破坏 materialization invariant`);
      }
    }

    console.log("[C3] golden 对比使用原始字节，不经 UTF-8 损失转换");
    const rawGoldenMatrix = join(scratch, "raw-golden-matrix.json");
    writeMatrix(rawGoldenMatrix, [{name: "raw_golden", fixture: valid0, expectRc: 0, golden: rawGolden}]);
    {
      const {isError, parsed} = await mcp.callTool("cheng_shape_matrix", {
        driver: rawOutputDriver,
        matrixPath: rawGoldenMatrix,
        root: CHENG_ROOT,
        timeoutSec: 5,
      });
      assertTrue(isError !== true, `非法 UTF-8 stdout 仍可进行字节契约比对`);
      const result = parsed.results[0];
      assertTrue(result.status === "GREEN" && result.checks?.goldenMatch === true, `0xff 原始字节精确命中 golden`);
    }

    console.log("[C4] expectStdout 比较原始 UTF-8 字节，尾部空白不得被裁掉");
    const whitespaceMatrix = join(scratch, "whitespace-matrix.json");
    writeMatrix(whitespaceMatrix, [{name: "whitespace_mismatch", fixture: valid0, expectRc: 0, expectStdout: "value"}]);
    {
      const {isError, parsed} = await mcp.callTool("cheng_shape_matrix", {
        driver: whitespaceOutputDriver,
        matrixPath: whitespaceMatrix,
        root: CHENG_ROOT,
        timeoutSec: 5,
      });
      assertTrue(isError !== true, `尾部空白反例返回结构化结果`);
      const result = parsed.results[0];
      assertTrue(result.status === "RED" && result.checks?.stdoutMatch === false, `实际 value+空格+换行 不得命中 value`);
    }

    console.log("[C4b] golden 在首个 spawn 前快照；driver 改写路径不能给自身错误输出放行");
    const mutableGoldenMatrix = join(scratch, "mutable-golden-matrix.json");
    writeMatrix(mutableGoldenMatrix, [{name: "mutable_golden", fixture: valid0, expectRc: 0, golden: mutableGolden}]);
    {
      const {isError, parsed} = await mcp.callTool("cheng_shape_matrix", {
        driver: mutableGoldenDriver,
        matrixPath: mutableGoldenMatrix,
        root: CHENG_ROOT,
        timeoutSec: 5,
      });
      assertTrue(isError !== true, `golden 被运行中改写仍返回结构化结果`);
      const result = parsed.results[0];
      assertTrue(readFileSync(mutableGolden, "utf8") === "actual\n", `driver 确实在编译阶段改写了 golden 路径`);
      assertTrue(result.status === "RED" && result.checks?.goldenMatch === false, `比较必须使用预启动快照 expected，而不是运行后重开的 actual`);
    }

    console.log("[C5] expectCompileBail 必须命中完整、唯一、零基连续的正式协议");
    const completeBailMatrix = join(scratch, "complete-bail-matrix.json");
    writeMatrix(completeBailMatrix, [{name: "complete_bail", fixture: valid0, expectCompileBail: 6641}]);
    {
      const {isError, parsed} = await mcp.callTool("cheng_shape_matrix", {
        driver: completeBailDriver,
        matrixPath: completeBailMatrix,
        root: CHENG_ROOT,
        timeoutSec: 5,
      });
      assertTrue(isError !== true, `完整 bail 协议返回结构化结果`);
      const result = parsed.results[0];
      assertTrue(result.status === "GREEN" && result.rc === 2, `raw stderr 完整协议且环境变量真正 unset 后可 GREEN`);
      assertTrue(result.checks?.exitCodeMatch === true && result.checks?.protocolComplete === true && result.checks?.targetBailsMatch === true, `退出码、TOTAL、idx、bail 全部命中`);
      assertTrue(result.compileBailProtocol?.totalLineCount === 1 && result.compileBailProtocol?.indicesUnique === true && result.compileBailProtocol?.indicesContinuous === true, `TOTAL 唯一且 idx=0..TOTAL-1`);
    }

    const partialBailMatrix = join(scratch, "partial-bail-matrix.json");
    writeMatrix(partialBailMatrix, [{name: "partial_bail", fixture: valid0, expectCompileBail: 6641}]);
    {
      const {isError, parsed} = await mcp.callTool("cheng_shape_matrix", {
        driver: partialBailDriver,
        matrixPath: partialBailMatrix,
        root: CHENG_ROOT,
        timeoutSec: 5,
      });
      assertTrue(isError !== true, `残缺 bail 协议返回结构化结果`);
      const result = parsed.results[0];
      assertTrue(result.status === "RED" && result.rc === 1, `单条 ZC + rc=1 绝不能 GREEN`);
      assertTrue(result.checks?.exitCodeMatch === false && result.checks?.protocolComplete === false && result.checks?.compileBailMatch === false, `错 rc 与缺 TOTAL 都被显式拒绝`);
    }

    const stdoutOnlyBailMatrix = join(scratch, "stdout-only-bail-matrix.json");
    writeMatrix(stdoutOnlyBailMatrix, [{name: "stdout_only_bail", fixture: valid0, expectCompileBail: 6641}]);
    {
      const {isError, parsed} = await mcp.callTool("cheng_shape_matrix", {
        driver: stdoutOnlyBailDriver,
        matrixPath: stdoutOnlyBailMatrix,
        root: CHENG_ROOT,
        timeoutSec: 5,
      });
      assertTrue(isError !== true, `stdout-only bail 返回结构化结果`);
      const result = parsed.results[0];
      assertTrue(result.status === "RED" && result.checks?.protocolComplete === false && result.compileBailProtocol?.observed === false, `stdout 中的完整 ZC 文本不能满足 expectCompileBail`);
    }

    const nonCanonicalBailMatrix = join(scratch, "noncanonical-bail-matrix.json");
    writeMatrix(nonCanonicalBailMatrix, [{name: "noncanonical_bail", fixture: valid0, expectCompileBail: 6641}]);
    {
      const {isError, parsed} = await mcp.callTool("cheng_shape_matrix", {
        driver: nonCanonicalBailDriver,
        matrixPath: nonCanonicalBailMatrix,
        root: CHENG_ROOT,
        timeoutSec: 5,
      });
      assertTrue(isError !== true, `非规范整数 bail 返回结构化结果`);
      const result = parsed.results[0];
      assertTrue(result.status === "RED" && result.compileBailProtocol?.observed === true && result.compileBailProtocol?.complete === false, `前导零正式行不能满足 expectCompileBail`);
      assertTrue(result.compileBailProtocol?.malformedLines?.length === 2, `两个非规范 stderr 行都保留为 malformed`);
    }

    const invalidUtf8BailMatrix = join(scratch, "invalid-utf8-bail-matrix.json");
    writeMatrix(invalidUtf8BailMatrix, [{name: "invalid_utf8_bail", fixture: valid0, expectCompileBail: 6641}]);
    {
      const {isError, parsed} = await mcp.callTool("cheng_shape_matrix", {
        driver: invalidUtf8BailDriver,
        matrixPath: invalidUtf8BailMatrix,
        root: CHENG_ROOT,
        timeoutSec: 5,
      });
      assertTrue(isError !== true, `非 UTF-8 bail 返回结构化结果`);
      const result = parsed.results[0];
      assertTrue(result.status === "CFAIL" && result.checks?.protocolUtf8Valid === false, `非 UTF-8 stderr 不能满足 expectCompileBail`);
    }

    console.log("[C6] 输出溢出会杀进程组并令进程证据失效");
    const overflowMatrix = join(scratch, "overflow-matrix.json");
    writeMatrix(overflowMatrix, [{name: "compile_overflow", fixture: valid0, expectCompileRc: 0}]);
    {
      const {isError, parsed} = await mcp.callTool("cheng_shape_matrix", {
        driver: overflowDriver,
        matrixPath: overflowMatrix,
        root: CHENG_ROOT,
        timeoutSec: 5,
        maxOutputBytes: 128,
      });
      assertTrue(isError !== true, `compile 输出溢出返回结构化结果`);
      const result = parsed.results[0];
      assertTrue(result.status === "CFAIL" && result.compileOverflow === true, `输出溢出不得 GREEN`);
      assertTrue(result.checks?.processOk === false && result.checks?.compileRcMatch === false, `overflow 明确使 processOk=false`);
    }

    console.log("[D] 超时不得被任何 compile-bail/runtime 内容匹配掩盖");
    const bailTimeoutMatrix = join(scratch, "bail-timeout-matrix.json");
    writeMatrix(bailTimeoutMatrix, [{
      name: "bail_timeout",
      fixture: join(FUSION_ROOT, "fixtures/ignition/fam_7_positional.cheng"),
      expectCompileBail: 6641,
    }]);
    {
      const {isError, parsed} = await mcp.callTool("cheng_shape_matrix", {
        driver: STAGE3,
        matrixPath: bailTimeoutMatrix,
        root: CHENG_ROOT,
        timeoutSec: 0.001,
      }, undefined, 30000);
      assertTrue(isError !== true, `compile timeout 返回结构化失败`);
      const result = parsed.results[0];
      assertTrue(result.status === "CFAIL" && result.compileTimedOut === true, `expectCompileBail 遇 timeout 必定 CFAIL`);
      assertTrue(result.checks?.processOk === false && result.checks?.compileBailMatch === false, `timeout 时 bail 契约不可命中`);
    }

    const runtimeTimeoutMatrix = join(scratch, "runtime-timeout-matrix.json");
    writeMatrix(runtimeTimeoutMatrix, [{name: "runtime_timeout", fixture: infinite, expectRc: 0, expectStdout: ""}]);
    {
      const {isError, parsed} = await mcp.callTool("cheng_shape_matrix", {
        driver: STAGE3,
        matrixPath: runtimeTimeoutMatrix,
        root: CHENG_ROOT,
        timeoutSec: 2,
      }, undefined, 30000);
      assertTrue(isError !== true, `runtime timeout 返回结构化 RED`);
      const result = parsed.results[0];
      assertTrue(result.status === "RED" && result.timedOut === true, `runtime 契约遇 timeout 必定 RED`);
      assertTrue(result.checks?.processOk === false, `stdout 即使偶然匹配也不能掩盖 timeout`);
    }

    console.log("[E] 契约缺失/跨组冲突：第一个 spawn 前 hard-fail");
    const sentinel = join(scratch, "preflight-driver-invoked");
    const sentinelDriver = join(scratch, "preflight-driver.sh");
    writeFileSync(sentinelDriver, `#!/bin/bash\nprintf invoked > "${sentinel}"\nexit 99\n`);
    chmodSync(sentinelDriver, 0o755);

    async function expectPreflightError(name: string, entries: any[], messagePart: string, filterTag?: string) {
      rmSync(sentinel, {force: true});
      const path = join(scratch, `${name}.json`);
      writeMatrix(path, entries);
      const {isError, parsed} = await mcp.callTool("cheng_shape_matrix", {
        driver: sentinelDriver,
        matrixPath: path,
        root: CHENG_ROOT,
        ...(filterTag ? {filterTag} : {}),
      });
      assertTrue(isError === true && String(parsed).includes(messagePart), `${name} 明确 hard-fail: ${messagePart}`);
      assertTrue(!existsSync(sentinel), `${name} 在第一个 spawn 前失败`);
    }

    await expectPreflightError("no-contract", [
      {name: "would_spawn_first", fixture: valid0, expectRc: 0},
      {name: "missing_contract", fixture: valid0},
    ], "has no contract");
    await expectPreflightError("planned-placeholder", [
      {name: "planned_gap", planned: true},
    ], "cannot contain placeholders");
    await expectPreflightError("compile-rc-plus-runtime", [
      {name: "conflict", fixture: valid0, expectCompileRc: 0, expectRc: 0},
    ], "contract groups are mutually exclusive");
    await expectPreflightError("bail-plus-compile-rc", [
      {name: "conflict", fixture: invalid, expectCompileBail: 1, expectCompileRc: 2},
    ], "contract groups are mutually exclusive");
    await expectPreflightError("bail-plus-runtime", [
      {name: "conflict", fixture: invalid, expectCompileBail: 1, expectStdout: ""},
    ], "contract groups are mutually exclusive");
    await expectPreflightError("filtered-out-missing-fixture", [
      {name: "selected_valid", tags: ["selected"], fixture: valid0, expectRc: 0},
      {name: "unselected_invalid", tags: ["unselected"], fixture: join(scratch, "does-not-exist.cheng"), expectRc: 0},
    ], "fixture not found", "selected");

    const symlinkFixture = join(scratch, "preflight-symlink.cheng");
    symlinkSync(valid0, symlinkFixture);
    await expectPreflightError("symlink-fixture", [
      {name: "symlink_fixture", fixture: symlinkFixture, expectCompileRc: 0},
    ], "regular non-symlink");

    const oversizedFixture = join(scratch, "preflight-oversized.cheng");
    writeFileSync(oversizedFixture, "x");
    truncateSync(oversizedFixture, 64 * 1024 * 1024 + 1);
    await expectPreflightError("oversized-fixture", [
      {name: "oversized_fixture", fixture: oversizedFixture, expectCompileRc: 0},
    ], "snapshot limit");

    console.log("[F] 首个 spawn 后矩阵、driver、后续 fixture 全部漂移，整批仍只消费预启动快照");
    {
      const {isError, parsed} = await mcp.callTool("cheng_shape_matrix", {
        driver: snapshotDriver,
        matrixPath: snapshotMatrix,
        root: CHENG_ROOT,
        timeoutSec: 5,
      });
      assertTrue(isError !== true, `快照攻击矩阵调用成功，实得 ${JSON.stringify(parsed).slice(0, 500)}`);
      assertTrue(parsed.results.length === 3 && parsed.results.every((entry: any) => entry.status === "GREEN" && entry.rc === 0), "三个条目都使用同一批 driver/fixture 快照");
      assertTrue(readFileSync(snapshotMatrix, "utf8") === "not-json\n", "首个 compile 确实破坏了原 matrix 路径");
      assertTrue(readFileSync(snapshotSecond, "utf8") === "MUTATED_BAD\n", "后续 fixture 确实发生同长度内容漂移");
      assertTrue(lstatSync(snapshotThird).isSymbolicLink(), "另一后续 fixture 确实被替换为 symlink");
      assertTrue(readFileSync(snapshotDriver, "utf8").includes("exit 77"), "原 driver 确实被替换为恶意版本");
      assertTrue(parsed.inputEvidence?.driver?.sha256?.startsWith("sha256:") && parsed.inputEvidence?.matrix?.sha256?.startsWith("sha256:"), "报告固定 driver/matrix 内容摘要");
    }
  } finally {
    mcp.kill();
    rmSync(scratch, {recursive: true, force: true});
  }

  console.log("item17 shape_matrix contract: PASS");
}

main().catch((error) => {
  console.error("item17 shape_matrix contract: FAIL", error);
  process.exit(1);
});
