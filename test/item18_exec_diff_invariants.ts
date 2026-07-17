// cheng_exec_diff 严格证据契约：进程异常不能冒充相同结果，产物必须是真实可执行文件，
// stdout 差分必须保留原始字节。全部使用本地真实进程，不依赖临时历史 DRV 产物。
import {chmodSync, existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, truncateSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {assertTrue, startMcp} from "./mcp_client.ts";

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function makeExecutable(path: string, body: string) {
  writeFileSync(path, `#!/bin/bash\nset -euo pipefail\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

function outputParserLines() {
  return [
    'out=""',
    'for arg in "$@"; do',
    '  case "$arg" in --out:*) out="${arg#--out:}" ;; esac',
    'done',
    '[ -n "$out" ]',
  ];
}

function makeCopyDriver(root: string, name: string, runtime: string) {
  return makeExecutable(join(root, name), [
    ...outputParserLines(),
    `cp ${shellQuote(runtime)} "$out"`,
    'chmod +x "$out"',
  ].join("\n"));
}

function makeArtifactDriver(root: string, name: string, kind: "symlink" | "empty") {
  const materialize = kind === "symlink"
    ? 'ln -s /bin/true "$out"'
    : ': > "$out"\nchmod +x "$out"';
  return makeExecutable(join(root, name), [...outputParserLines(), materialize].join("\n"));
}

function makeRejectedArtifactDriver(root: string, name: string, kind: "symlink" | "empty") {
  const materialize = kind === "symlink"
    ? 'ln -s /bin/true "$out"'
    : ': > "$out"';
  return makeExecutable(join(root, name), [...outputParserLines(), materialize, "exit 2"].join("\n"));
}

async function main() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "fusion-exec-diff-strict-")));
  writeFileSync(join(root, "cheng-package.toml"), 'package_id = "pkg://local/exec-diff-strict"\n');
  const fixture = join(root, "fixture.cheng");
  writeFileSync(fixture, "fn main(): int32 =\n    return 0\n");

  const rawFf = makeExecutable(join(root, "raw-ff.sh"), "printf '\\377'");
  const rawFe = makeExecutable(join(root, "raw-fe.sh"), "printf '\\376'");
  const sleeping = makeExecutable(join(root, "sleep.sh"), "sleep 5");
  const overflowing = makeExecutable(join(root, "overflow.sh"), "printf '%4096s' x");
  const quiet = makeExecutable(join(root, "quiet.sh"), ":");

  const rawDriverA = makeCopyDriver(root, "driver-raw-a.sh", rawFf);
  const rawDriverB = makeCopyDriver(root, "driver-raw-b.sh", rawFe);
  const sleepDriver = makeCopyDriver(root, "driver-sleep.sh", sleeping);
  const overflowRunDriver = makeCopyDriver(root, "driver-overflow-run.sh", overflowing);
  const quietDriver = makeCopyDriver(root, "driver-quiet.sh", quiet);
  const compileTimeoutDriver = makeExecutable(join(root, "driver-compile-timeout.sh"), [
    'printf "%s\\n" "ZC_NOT_READY idx=0/1 function=TimedOut body_kind=return detail=none line=1 fz_kind=3 stmt_kind=2 bail=801 slot_diag=none" >&2',
    'printf "%s\\n" "ZC_NOT_READY_TOTAL count=1" >&2',
    "sleep 5",
  ].join("\n"));
  const compileOverflowDriver = makeExecutable(join(root, "driver-compile-overflow.sh"), [
    'printf "%s\\n" "ZC_NOT_READY idx=0/1 function=Overflowed body_kind=return detail=none line=1 fz_kind=3 stmt_kind=2 bail=801 slot_diag=none" >&2',
    'printf "%s\\n" "ZC_NOT_READY_TOTAL count=1" >&2',
    "printf '%4096s' x",
  ].join("\n"));
  const compileWallDriver = makeExecutable(join(root, "driver-compile-wall.sh"), [
    'if [[ ${CHENG_NO_BACKEND_DRIVER_HANDOFF+x} == x ]] || [[ ${CHENG_REQUIRE_PURE_PROVIDERS+x} == x ]]; then printf "driver environment was not unset\\n" >&2; exit 97; fi',
    'printf "%s\\n" "ZC_NOT_READY idx=0/1 function=Completed body_kind=return detail=none line=1 fz_kind=3 stmt_kind=2 bail=801 slot_diag=none" >&2',
    'printf "%s\\n" "ZC_NOT_READY_TOTAL count=1" >&2',
    "exit 2",
  ].join("\n"));
  const incompleteCompileWallDriver = makeExecutable(join(root, "driver-incomplete-compile-wall.sh"), [
    'printf "%s\\n" "ZC_NOT_READY idx=0/1 function=Incomplete body_kind=return detail=none line=1 fz_kind=3 stmt_kind=2 bail=801 slot_diag=none" >&2',
    "exit 2",
  ].join("\n"));
  const stdoutOnlyCompileWallDriver = makeExecutable(join(root, "driver-stdout-only-compile-wall.sh"), [
    'printf "%s\\n" "ZC_NOT_READY idx=0/1 function=StdoutOnly body_kind=return detail=none line=1 fz_kind=3 stmt_kind=2 bail=801 slot_diag=none"',
    'printf "%s\\n" "ZC_NOT_READY_TOTAL count=1"',
    "exit 2",
  ].join("\n"));
  const nonCanonicalCompileWallDriver = makeExecutable(join(root, "driver-noncanonical-compile-wall.sh"), [
    'printf "%s\\n" "ZC_NOT_READY idx=00/01 function=NonCanonical body_kind=return detail=none line=01 fz_kind=3 stmt_kind=2 bail=0801 slot_diag=none" >&2',
    'printf "%s\\n" "ZC_NOT_READY_TOTAL count=01" >&2',
    "exit 2",
  ].join("\n"));
  const invalidUtf8CompileWallDriver = makeExecutable(join(root, "driver-invalid-utf8-compile-wall.sh"), "printf '\\377' >&2\nexit 2");
  const symlinkDriver = makeArtifactDriver(root, "driver-symlink.sh", "symlink");
  const emptyDriver = makeArtifactDriver(root, "driver-empty.sh", "empty");
  const rejectedSymlinkDriver = makeRejectedArtifactDriver(root, "driver-rejected-symlink.sh", "symlink");
  const rejectedEmptyDriver = makeRejectedArtifactDriver(root, "driver-rejected-empty.sh", "empty");

  const snapshotFixture = join(root, "snapshot-input.cheng");
  const snapshotRuntime = makeExecutable(join(root, "snapshot-runtime.sh"), "printf 'snapshot\\n'");
  const mutatedRuntime = makeExecutable(join(root, "mutated-runtime.sh"), "printf 'mutated\\n'");
  const snapshotDriverB = makeCopyDriver(root, "snapshot-driver-b.sh", snapshotRuntime);
  const maliciousDriverB = makeCopyDriver(root, "malicious-driver-b.sh", mutatedRuntime);
  writeFileSync(snapshotFixture, "fn main(): int32 =\n    return 0\n");
  const snapshotDriverA = makeExecutable(join(root, "snapshot-driver-a.sh"), [
    ...outputParserLines(),
    'in=""',
    'for arg in "$@"; do case "$arg" in --in:*) in="${arg#--in:}" ;; esac; done',
    '[ -n "$in" ]',
    `printf 'fn main(): int32 =\\n    return 9\\n' > ${shellQuote(snapshotFixture)}`,
    `rm -f ${shellQuote(snapshotDriverB)}`,
    `ln -s ${shellQuote(maliciousDriverB)} ${shellQuote(snapshotDriverB)}`,
    `if grep -q 'return 0' "$in"; then cp ${shellQuote(snapshotRuntime)} "$out"; else cp ${shellQuote(mutatedRuntime)} "$out"; fi`,
    'chmod +x "$out"',
  ].join("\n"));

  const mcp = startMcp({CHENG_NO_BACKEND_DRIVER_HANDOFF: "poison", CHENG_REQUIRE_PURE_PROVIDERS: "poison"}, root);
  try {
    const rootUri = pathToFileURL(root).href;
    await mcp.initialize({rootUri, workspaceFolders: [{uri: rootUri, name: "exec-diff-strict"}]});

    const run = async (driverA: string, driverB: string, extra: Record<string, unknown> = {}) => {
      const response = await mcp.callTool("cheng_exec_diff", {fixture, driverA, driverB, root, ...extra}, undefined, 10_000);
      assertTrue(response.isError !== true, `exec_diff 返回结构化结果: ${JSON.stringify(response.parsed).slice(0, 500)}`);
      return {report: response.parsed, result: response.parsed.results?.[0]};
    };

    console.log("[A] 非法 UTF-8 的不同原始字节不得被替换字符折叠为 identical");
    {
      const {report, result} = await run(rawDriverA, rawDriverB);
      assertTrue(result.verdict === "semantic_divergence", `0xff vs 0xfe 必须分歧，实得 ${result.verdict}`);
      assertTrue(result.runRcA === 0 && result.runRcB === 0, "两侧运行进程正常结束");
      assertTrue(result.stdoutBytesA === 1 && result.stdoutBytesB === 1 && result.stdoutBytesEqual === false, "比较使用一字节原始 stdout");
      assertTrue(result.stdoutDigestA !== result.stdoutDigestB, "原始字节摘要不同");
      assertTrue(report.summary.semantic_divergence === 1 && report.summary.cfail === 0, "原始字节差异计入 semantic_divergence");
    }

    console.log("[B] 双侧运行 timeout/overflow 均为 CFAIL，不得 identical");
    {
      const timed = await run(sleepDriver, sleepDriver, {timeoutSec: 2});
      assertTrue(timed.result.verdict === "CFAIL" && timed.result.status === "CFAIL", `双 timeout 必须 CFAIL，实得 ${timed.result.verdict}`);
      assertTrue(timed.result.runTimedOutA === true && timed.result.runTimedOutB === true, "两侧 timeout 证据完整");
      assertTrue(timed.report.summary.cfail === 1 && timed.report.summary.identical === 0, "timeout 不进入 identical");

      const overflow = await run(overflowRunDriver, overflowRunDriver, {maxOutputBytes: 256});
      assertTrue(overflow.result.verdict === "CFAIL" && overflow.result.status === "CFAIL", `双 overflow 必须 CFAIL，实得 ${overflow.result.verdict}`);
      assertTrue(overflow.result.runOverflowA === true && overflow.result.runOverflowB === true, "两侧 overflow 证据完整");
      assertTrue(overflow.report.summary.cfail === 1 && overflow.report.summary.identical === 0, "overflow 不进入 identical");
    }

    console.log("[C] 编译 timeout/overflow 即使出现 ZC 文本也不得 compile_wall");
    {
      const timed = await run(compileTimeoutDriver, compileTimeoutDriver, {timeoutSec: 0.5});
      assertTrue(timed.result.verdict === "CFAIL" && timed.result.compileTimedOutA === true && timed.result.compileTimedOutB === true, "编译 timeout 为 CFAIL");
      assertTrue(timed.report.summary.compile_wall === 0 && timed.report.summary.cfail === 1, "timeout 的部分 ZC 不冒充 compile_wall");

      const overflow = await run(compileOverflowDriver, compileOverflowDriver, {maxOutputBytes: 256});
      assertTrue(overflow.result.verdict === "CFAIL" && overflow.result.compileOverflowA === true && overflow.result.compileOverflowB === true, "编译 overflow 为 CFAIL");
      assertTrue(overflow.report.summary.compile_wall === 0 && overflow.report.summary.cfail === 1, "overflow 的部分 ZC 不冒充 compile_wall");

      const completed = await run(compileWallDriver, quietDriver);
      assertTrue(completed.result.verdict === "compile_wall" && completed.report.summary.compile_wall === 1, "stderr 完整 ZC rejection 且环境变量真正 unset 后仍是 compile_wall");

      const incomplete = await run(incompleteCompileWallDriver, quietDriver);
      assertTrue(incomplete.result.verdict === "CFAIL" && incomplete.result.status === "CFAIL", "缺 TOTAL 的残缺 ZC 协议必须 CFAIL");
      assertTrue(incomplete.result.notReady.A.observed === true && incomplete.result.notReady.A.complete === false, "残缺协议证据被结构化保留");
      assertTrue(incomplete.report.summary.compile_wall === 0 && incomplete.report.summary.cfail === 1, "残缺 ZC 不进入 compile_wall");

      const stdoutOnly = await run(stdoutOnlyCompileWallDriver, quietDriver);
      assertTrue(stdoutOnly.result.verdict === "semantic_divergence" && stdoutOnly.report.summary.compile_wall === 0, "stdout 中的完整文本不能冒充 compile_wall");
      assertTrue(stdoutOnly.result.notReady === undefined, "stdout ZC 不产生 stderr 协议证据");

      const nonCanonical = await run(nonCanonicalCompileWallDriver, quietDriver);
      assertTrue(nonCanonical.result.verdict === "CFAIL" && nonCanonical.result.notReady.A.observed === true && nonCanonical.result.notReady.A.complete === false, "前导零等非规范整数不能触发 compile_wall");
      assertTrue(nonCanonical.result.notReady.A.malformedLines.length === 2, "每条非规范正式行均保留为 malformed");

      const invalidUtf8 = await run(invalidUtf8CompileWallDriver, quietDriver);
      assertTrue(invalidUtf8.result.verdict === "CFAIL" && invalidUtf8.result.notReady.A.utf8Valid === false, "非 UTF-8 stderr 不能触发 compile_wall");
    }

    console.log("[D] rc=0 的 symlink/空产物均不得进入运行或 GREEN 路径");
    for (const [label, driver] of [["symlink", symlinkDriver], ["empty", emptyDriver]] as const) {
      const {report, result} = await run(driver, driver);
      assertTrue(result.verdict === "CFAIL" && result.status === "CFAIL", `${label} 产物必须 CFAIL`);
      assertTrue(result.compileRcA === 0 && result.compileRcB === 0, `${label} 反例真实返回 compile rc=0`);
      assertTrue(result.compileChecks.A.processOk === true && result.compileChecks.B.processOk === true, `${label} 编译进程本身正常`);
      assertTrue(result.compileChecks.A.materialized === false && result.compileChecks.B.materialized === false, `${label} 不是真实非空 regular executable`);
      assertTrue(result.runRcA === null && result.runRcB === null && report.summary.cfail === 1, `${label} 不进入运行阶段`);
    }

    console.log("[E] 非零编译留下任意路径也必须 CFAIL");
    for (const [label, driver] of [["symlink", rejectedSymlinkDriver], ["empty", rejectedEmptyDriver]] as const) {
      const {report, result} = await run(driver, driver);
      assertTrue(result.verdict === "CFAIL" && result.status === "CFAIL", `非零 rc + ${label} 残留必须 CFAIL`);
      assertTrue(result.compileRcA === 2 && result.compileRcB === 2, `${label} 反例真实返回 compile rc=2`);
      assertTrue(result.compileChecks.A.artifactPresent === true && result.compileChecks.B.artifactPresent === true, `${label} 残留路径被显式识别`);
      assertTrue(result.compileChecks.A.materializationOk === false && result.compileChecks.B.materializationOk === false, `${label} 残留破坏物化契约`);
      assertTrue(report.summary.cfail === 1 && report.summary.compile_wall === 0, `${label} 残留不冒充 compile_wall/both_fail`);
    }

    console.log("[F] 首个 spawn 后改写 fixture、替换另一侧 driver，A/B 仍只消费同一批快照");
    {
      const {report, result} = await run(snapshotDriverA, snapshotDriverB, {fixture: snapshotFixture});
      assertTrue(readFileSync(snapshotFixture, "utf8").includes("return 9"), "driverA 确实对原 fixture 做了同长度改写");
      assertTrue(lstatSync(snapshotDriverB).isSymbolicLink(), "driverA 确实把原 driverB 路径替换为恶意 symlink");
      assertTrue(result.verdict === "identical" && report.summary.identical === 1, "A/B 不受运行中原路径漂移影响");
      assertTrue(result.runStdoutA === "snapshot\n" && result.runStdoutB === "snapshot\n", "两侧运行结果来自预启动 fixture/driver 快照");
      assertTrue(result.fixture === snapshotFixture && result.fixtureEvidence?.sha256?.startsWith("sha256:"), "报告保留原路径与内容摘要，不泄漏临时快照路径");
    }

    console.log("[G] symlink、空文件、超限 fixture 在第一个 spawn 前 hard-fail");
    {
      const sentinel = join(root, "snapshot-preflight-invoked");
      const sentinelDriver = makeExecutable(join(root, "snapshot-preflight-driver.sh"), `printf invoked > ${shellQuote(sentinel)}\nexit 99`);
      const symlinkFixture = join(root, "symlink-input.cheng");
      symlinkSync(fixture, symlinkFixture);
      const emptyFixture = join(root, "empty-input.cheng");
      writeFileSync(emptyFixture, "");
      const oversizedFixture = join(root, "oversized-input.cheng");
      writeFileSync(oversizedFixture, "x");
      truncateSync(oversizedFixture, 64 * 1024 * 1024 + 1);
      for (const [label, badFixture, message] of [
        ["symlink", symlinkFixture, "regular non-symlink"],
        ["empty", emptyFixture, "is empty"],
        ["oversized", oversizedFixture, "snapshot limit"],
      ] as const) {
        rmSync(sentinel, {force: true});
        const response = await mcp.callTool("cheng_exec_diff", {fixture: badFixture, driverA: sentinelDriver, driverB: sentinelDriver, root});
        assertTrue(response.isError === true && String(response.parsed).includes(message), `${label} fixture 明确 hard-fail: ${message}`);
        assertTrue(!existsSync(sentinel), `${label} fixture 在第一个 spawn 前被拒绝`);
      }
    }
  } finally {
    mcp.kill();
    rmSync(root, {recursive: true, force: true});
  }
  console.log("item18 exec_diff invariants: PASS");
}

main().catch((error) => {
  console.error("item18 exec_diff invariants: FAIL", error);
  process.exit(1);
});
