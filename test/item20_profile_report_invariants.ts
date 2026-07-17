// cheng_profile_report 严格证据契约：fresh executable、真实 regular/X_OK 产物、
// compile/run 进程边界，以及只从真实输出识别 profile schema。
import {chmodSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync} from "node:fs";
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

async function main() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "fusion-profile-strict-")));
  const modePath = join(root, "mode.txt");
  writeFileSync(join(root, "cheng-package.toml"), 'package_id = "pkg://local/profile-strict"\n');
  const source = join(root, "fixture.cheng");
  writeFileSync(source, "fn main(): int32 =\n    return 0\n");

  const quietRuntime = makeExecutable(join(root, "runtime-quiet.sh"), "exit 7");
  const markerRuntime = makeExecutable(join(root, "runtime-marker.sh"), "echo cheng_profile_v1");
  const sleepRuntime = makeExecutable(join(root, "runtime-sleep.sh"), "sleep 5");
  const overflowRuntime = makeExecutable(join(root, "runtime-overflow.sh"), "printf '%4096s' x");
  const replacementRuntime = makeExecutable(join(root, "runtime-replacement.sh"), 'echo replacement-runtime; exit 41');
  const originalRuntime = makeExecutable(join(root, "runtime-original.sh"), 'sleep 0.2; echo original-runtime; exit 23');

  const driver = makeExecutable(join(root, "profile-driver.sh"), [
    `mode="$(cat ${shellQuote(modePath)})"`,
    'out=""',
    'for arg in "$@"; do',
    '  case "$arg" in --out:*) out="${arg#--out:}" ;; esac',
    'done',
    'if [ "${1:-}" = "profile-report" ]; then',
    '  case "$mode" in',
    '    report_marker) echo cheng_profile_v1; exit 0 ;;',
    '    report_no_marker) echo "profile_report_completed: missing cheng_profile_v1"; exit 0 ;;',
    '    report_out_marker) [ -n "$out" ]; printf "cheng_profile_v1\\n" > "$out"; exit 0 ;;',
    '    report_out_missing) echo cheng_profile_v1; exit 0 ;;',
    '    report_out_symlink) [ -n "$out" ]; ln -s /bin/true "$out"; echo cheng_profile_v1; exit 0 ;;',
    '    report_out_empty) [ -n "$out" ]; : > "$out"; echo cheng_profile_v1; exit 0 ;;',
    '    report_out_overflow) [ -n "$out" ]; printf "cheng_profile_v1\\n" > "$out"; printf "%4096s" x >> "$out"; exit 0 ;;',
    '    report_out_invalid_utf8) [ -n "$out" ]; printf "\\377cheng_profile_v1\\n" > "$out"; exit 0 ;;',
    '    report_stdout_invalid_utf8) printf "\\377\\ncheng_profile_v1\\n"; exit 0 ;;',
    '    report_stderr_invalid_utf8) echo cheng_profile_v1; printf "\\377" >&2; exit 0 ;;',
    '    report_out_capture) [ -n "$out" ]; printf "%s\\n" "$out" > "$PROFILE_CAPTURE_REPORT_PATH"; printf "cheng_profile_v1\\n" > "$out"; exit 0 ;;',
    '    report_out_race) [ -n "$out" ]; printf "racer-report\\n" > "$PROFILE_RACE_PROFILE_OUT"; printf "cheng_profile_v1\\n" > "$out"; exit 0 ;;',
    '    report_overflow) printf "%4096s" x; exit 0 ;;',
    '    report_timeout) sleep 5; exit 0 ;;',
    '    *) echo "unsupported report mode: $mode" >&2; exit 2 ;;',
    '  esac',
    'fi',
    '[ -n "$out" ]',
    'case "$mode" in',
    `  run_quiet) cp ${shellQuote(quietRuntime)} "$out"; chmod +x "$out" ;;`,
    `  run_marker) cp ${shellQuote(markerRuntime)} "$out"; chmod +x "$out" ;;`,
    `  run_timeout) cp ${shellQuote(sleepRuntime)} "$out"; chmod +x "$out" ;;`,
    `  run_overflow) cp ${shellQuote(overflowRuntime)} "$out"; chmod +x "$out" ;;`,
    `  run_capture) printf "%s\\n" "$out" > "$PROFILE_CAPTURE_EXEC_PATH"; cp ${shellQuote(quietRuntime)} "$out"; chmod +x "$out" ;;`,
    `  run_out_race) printf "racer-executable\\n" > "$PROFILE_RACE_EXEC_OUT"; cp ${shellQuote(quietRuntime)} "$out"; chmod +x "$out" ;;`,
    `  run_stage_replace) cp ${shellQuote(originalRuntime)} "$out"; chmod +x "$out"; (sleep 0.05; rm -f "$out"; cp ${shellQuote(replacementRuntime)} "$out"; chmod +x "$out") >/dev/null 2>&1 & ;;`,
    `  run_report_race) printf "racer\\n" > "$PROFILE_RACE_REPORT_OUT"; cp ${shellQuote(quietRuntime)} "$out"; chmod +x "$out" ;;`,
    '  compile_symlink) ln -s /bin/true "$out" ;;',
    '  compile_empty) : > "$out"; chmod +x "$out" ;;',
    '  compile_fail_symlink) ln -s /bin/true "$out"; exit 2 ;;',
    '  compile_fail_empty) : > "$out"; exit 2 ;;',
    '  compile_fail_directory) mkdir "$out"; exit 2 ;;',
    '  compile_timeout) sleep 5 ;;',
    '  compile_overflow) printf "%4096s" x ;;',
    '  *) echo "unsupported compile mode: $mode" >&2; exit 2 ;;',
    'esac',
  ].join("\n"));

  const rawProfile = join(root, "raw.profile");
  const racedReportOut = join(root, "raced-report.json");
  const racedExecOut = join(root, "raced-executable");
  const racedProfileOut = join(root, "raced-profile.txt");
  const capturedExecPath = join(root, "captured-exec-path.txt");
  const capturedReportPath = join(root, "captured-report-path.txt");
  writeFileSync(rawProfile, "raw-profile-input\n");
  const setMode = (mode: string) => writeFileSync(modePath, `${mode}\n`);
  setMode("run_quiet");

  const mcp = startMcp({
    CHENG_DRIVER: driver,
    CHENG_STAGE3_DRIVER: driver,
    PROFILE_RACE_REPORT_OUT: racedReportOut,
    PROFILE_RACE_EXEC_OUT: racedExecOut,
    PROFILE_RACE_PROFILE_OUT: racedProfileOut,
    PROFILE_CAPTURE_EXEC_PATH: capturedExecPath,
    PROFILE_CAPTURE_REPORT_PATH: capturedReportPath,
  }, root);
  try {
    const rootUri = pathToFileURL(root).href;
    await mcp.initialize({rootUri, workspaceFolders: [{uri: rootUri, name: "profile-strict"}]});
    const callRun = async (extra: Record<string, unknown> = {}) => {
      const response = await mcp.callTool("cheng_profile_report", {action: "run", root, source, ...extra}, undefined, 10_000);
      assertTrue(response.isError !== true, `profile run 返回结构化结果: ${JSON.stringify(response.parsed).slice(0, 500)}`);
      return response.parsed;
    };

    console.log("[A] 普通 link/run 观测不能冒充 profiling；无证据参数必须被拒绝");
    {
      setMode("run_quiet");
      const result = await callRun();
      assertTrue(result.supported === false && result.status === "CFAIL", "单纯 compile/run timing 不能冒充 profiling");
      assertTrue(result.exitCode === 7 && result.profile.checks.runProcessOk === true, "程序真实非零退出仍被准确记录，失败原因是缺 schema");
      assertTrue(result.profileSchema === null && result.profile.observationKind === "link_run_timing_only", "普通执行只标记为 timing observation");

      setMode("run_marker");
      const marked = await callRun();
      assertTrue(marked.supported === false && marked.status === "CFAIL" && marked.profileSchema === null, "用户程序即使输出 marker 也不被信任为 profiling");
      assertTrue(String(marked.profile.run.stdout).includes("cheng_profile_v1") && String(marked.unsupportedReason).includes("instrumentation is not wired"), "保留真实 stdout 观测，同时明确正式 instrumentation 未接线");

      const rejected = await mcp.callTool("cheng_profile_report", {action: "run", root, source, profileHz: 100}, undefined, 5_000);
      assertTrue(rejected.isError === true, "未传给 driver/程序的 profileHz 已从 strict schema 删除");

      const missingRunSource = await mcp.callTool("cheng_profile_report", {action: "run", root}, undefined, 5_000);
      assertTrue(missingRunSource.isError === true && String(missingRunSource.parsed).includes("requires source"), "缺 source 是工具错误，不返回成功 JSON error");
      const missingRawProfile = await mcp.callTool("cheng_profile_report", {action: "report", root}, undefined, 5_000);
      assertTrue(missingRawProfile.isError === true && String(missingRawProfile.parsed).includes("requires rawProfile"), "缺 rawProfile 是工具错误，不返回成功 JSON error");
    }

    console.log("[B] 显式 out 必须 fresh，拒绝旧产物且不改写");
    {
      const existingOut = join(root, "existing.exe");
      writeFileSync(existingOut, "sentinel\n");
      setMode("run_quiet");
      const response = await mcp.callTool("cheng_profile_report", {action: "run", root, source, out: existingOut}, undefined, 5_000);
      assertTrue(response.isError === true && String(response.parsed).includes("already exists"), "预存 out 在 spawn 前 hard-fail");
      assertTrue(readFileSync(existingOut, "utf8") === "sentinel\n", "旧产物字节保持不变");

      const reportOut = join(root, "run-result.json");
      const written = await mcp.callTool("cheng_profile_report", {action: "run", root, source, reportOut}, undefined, 5_000);
      assertTrue(written.isError !== true && JSON.parse(readFileSync(reportOut, "utf8")).schema === "cheng_profile_report_tool.v1", "fresh reportOut 同目录原子提交完整 JSON");
      assertTrue(!readdirSync(root).some((name) => name.includes("run-result.json.tmp-")), "原子提交不遗留临时文件");

      const staleReportOut = join(root, "stale-result.json");
      writeFileSync(staleReportOut, "sentinel-report\n");
      const rejectedReport = await mcp.callTool("cheng_profile_report", {action: "run", root, source, reportOut: staleReportOut}, undefined, 5_000);
      assertTrue(rejectedReport.isError === true && String(rejectedReport.parsed).includes("already exists") && readFileSync(staleReportOut, "utf8") === "sentinel-report\n", "预存 reportOut 在 spawn 前拒绝且不覆盖");

      setMode("run_report_race");
      const raced = await mcp.callTool("cheng_profile_report", {action: "run", root, source, reportOut: racedReportOut}, undefined, 5_000);
      assertTrue(raced.isError === true && String(raced.parsed).includes("already exists") && readFileSync(racedReportOut, "utf8") === "racer\n", "spawn 后抢占 reportOut 也在 final commit 前拒绝且不覆盖");

      const publishedOut = join(root, "published-profile-executable");
      setMode("run_capture");
      const published = await callRun({out: publishedOut});
      const privateDriverOut = readFileSync(capturedExecPath, "utf8").trim();
      assertTrue(privateDriverOut !== publishedOut && !existsSync(privateDriverOut), "公开 executable out 不直接交给 driver，私有 staging 在返回前清理");
      assertTrue(published.profile.checks.published === true && lstatSync(publishedOut).isFile() && (lstatSync(publishedOut).mode & 0o777) === 0o700, "验证后的 executable 以私有 0700 snapshot 发布");

      const replacementSafeOut = join(root, "replacement-safe-executable");
      setMode("run_stage_replace");
      const replacementSafe = await callRun({out: replacementSafeOut});
      assertTrue(replacementSafe.exitCode === 23 && String(replacementSafe.stdout).includes("original-runtime"), "执行的是 driver 退出时锁定的私有 snapshot");
      assertTrue(readFileSync(replacementSafeOut, "utf8").includes("original-runtime") && !readFileSync(replacementSafeOut, "utf8").includes("replacement-runtime"), "driver 后台替换 staging 不能污染最终发布字节");

      setMode("run_out_race");
      const racedExecutable = await mcp.callTool("cheng_profile_report", {action: "run", root, source, out: racedExecOut}, undefined, 5_000);
      assertTrue(racedExecutable.isError === true && String(racedExecutable.parsed).includes("already exists") && readFileSync(racedExecOut, "utf8") === "racer-executable\n", "spawn 后抢占 executable out 时 no-replace 提交失败且不覆盖 racer");
    }

    console.log("[C] rc=0 的 symlink/空产物不得进入 run");
    for (const mode of ["compile_symlink", "compile_empty"] as const) {
      setMode(mode);
      const result = await callRun();
      assertTrue(result.supported === false && result.status === "CFAIL", `${mode} 为 CFAIL`);
      assertTrue(result.profile.compile.exitCode === 0 && result.profile.checks.compileProcessOk === true, `${mode} 反例 compile 进程真实 rc=0`);
      assertTrue(result.profile.checks.materialized === false && result.profile.checks.materializationOk === false, `${mode} 不是真实非空 regular executable`);
      assertTrue(result.profile.run.exitCode === null && result.profile.checks.runProcessOk === false, `${mode} 不进入 run`);
    }

    console.log("[C2] compile 非零留下任意 out 路径都属于 materialization contradiction");
    for (const mode of ["compile_fail_symlink", "compile_fail_empty", "compile_fail_directory"] as const) {
      setMode(mode);
      const result = await callRun();
      assertTrue(result.supported === false && result.status === "CFAIL" && result.profile.checks.outputPresent === true && result.profile.checks.materializationOk === false, `${mode} 的残留路径不能按非零编译成功收尾`);
      assertTrue(String(result.unsupportedReason).includes("leaving an output path"), `${mode} 明确报告 materialization contradiction`);
    }

    console.log("[D] compile/run timeout 与 overflow 全部 supported=false/CFAIL");
    {
      setMode("compile_timeout");
      const compileTimeout = await callRun({timeoutSec: 0.5});
      assertTrue(compileTimeout.status === "CFAIL" && compileTimeout.supported === false && compileTimeout.profile.compile.timedOut === true, "compile timeout 为 CFAIL");

      setMode("compile_overflow");
      const compileOverflow = await callRun({maxOutputBytes: 256});
      assertTrue(compileOverflow.status === "CFAIL" && compileOverflow.supported === false && compileOverflow.profile.compile.overflow === true, "compile overflow 为 CFAIL");

      setMode("run_timeout");
      const runTimeout = await callRun({timeoutSec: 2});
      assertTrue(runTimeout.status === "CFAIL" && runTimeout.supported === false && runTimeout.profile.run.timedOut === true, "run timeout 为 CFAIL");

      setMode("run_overflow");
      const runOverflow = await callRun({maxOutputBytes: 256});
      assertTrue(runOverflow.status === "CFAIL" && runOverflow.supported === false && runOverflow.profile.run.overflow === true, "run overflow 为 CFAIL");
    }

    console.log("[E] profile-report 只认精确 schema 行和 fresh 输出证据");
    {
      setMode("report_marker");
      const marked = await mcp.callTool("cheng_profile_report", {action: "report", root, rawProfile}, undefined, 5_000);
      assertTrue(marked.isError !== true && marked.parsed.supported === true && marked.parsed.profileSchema === "cheng_profile_v1", "真实 report marker -> supported");

      setMode("report_no_marker");
      const missing = await mcp.callTool("cheng_profile_report", {action: "report", root, rawProfile}, undefined, 5_000);
      assertTrue(missing.isError !== true && missing.parsed.supported === false && missing.parsed.status === "CFAIL" && missing.parsed.profileSchema === null, "错误文本提及 schema 名也不伪称 marker/support");

      for (const mode of ["report_stdout_invalid_utf8", "report_stderr_invalid_utf8"] as const) {
        setMode(mode);
        const invalidProcessBytes = await mcp.callTool("cheng_profile_report", {action: "report", root, rawProfile}, undefined, 5_000);
        assertTrue(invalidProcessBytes.isError !== true && invalidProcessBytes.parsed.supported === false && invalidProcessBytes.parsed.profileSchema === null && String(invalidProcessBytes.parsed.unsupportedReason).includes("not valid UTF-8"), `${mode} 的替换解码 marker 不能成为证据`);
      }

      const reportOut = join(root, "profile.report.txt");
      setMode("report_out_marker");
      const fromOut = await mcp.callTool("cheng_profile_report", {action: "report", root, rawProfile, out: reportOut}, undefined, 5_000);
      assertTrue(fromOut.isError !== true && fromOut.parsed.supported === true && fromOut.parsed.profileSchema === "cheng_profile_v1", "stdout 为空时从 fresh report out 读取 marker");
      assertTrue(fromOut.parsed.output?.materialized === true && fromOut.parsed.output?.bytes === 17, "report out 是真实非空 regular 文件");
      assertTrue(fromOut.parsed.output?.published === true && (lstatSync(reportOut).mode & 0o777) === 0o600, "验证后的 report 以 0600 no-replace snapshot 发布");

      const capturedPublicReport = join(root, "captured-public-profile.txt");
      setMode("report_out_capture");
      const capturedReport = await mcp.callTool("cheng_profile_report", {action: "report", root, rawProfile, out: capturedPublicReport}, undefined, 5_000);
      const privateReportOut = readFileSync(capturedReportPath, "utf8").trim();
      assertTrue(capturedReport.isError !== true && capturedReport.parsed.supported === true && privateReportOut !== capturedPublicReport && !existsSync(privateReportOut), "公开 report out 不直接交给 driver，私有 staging 在返回前清理");

      setMode("report_out_race");
      const racedProfile = await mcp.callTool("cheng_profile_report", {action: "report", root, rawProfile, out: racedProfileOut}, undefined, 5_000);
      assertTrue(racedProfile.isError === true && String(racedProfile.parsed).includes("already exists") && readFileSync(racedProfileOut, "utf8") === "racer-report\n", "spawn 后抢占 report out 时 no-replace 提交失败且不覆盖 racer");

      const staleOut = join(root, "stale.profile.txt");
      writeFileSync(staleOut, "cheng_profile_v1\n");
      const stale = await mcp.callTool("cheng_profile_report", {action: "report", root, rawProfile, out: staleOut}, undefined, 5_000);
      assertTrue(stale.isError === true && String(stale.parsed).includes("already exists"), "旧 report out 在 spawn 前 hard-fail");
      assertTrue(readFileSync(staleOut, "utf8") === "cheng_profile_v1\n", "旧 report out 不被改写或作为本次证据");

      setMode("report_out_missing");
      const missingOut = await mcp.callTool("cheng_profile_report", {action: "report", root, rawProfile, out: join(root, "missing.profile.txt")}, undefined, 5_000);
      assertTrue(missingOut.isError !== true && missingOut.parsed.supported === false && missingOut.parsed.output?.materialized === false, "rc=0/stdout marker 也不能掩盖缺失的请求 out");

      for (const mode of ["report_out_symlink", "report_out_empty"] as const) {
        setMode(mode);
        const invalid = await mcp.callTool("cheng_profile_report", {action: "report", root, rawProfile, out: join(root, `${mode}.txt`)}, undefined, 5_000);
        assertTrue(invalid.isError !== true && invalid.parsed.supported === false && invalid.parsed.output?.materialized === false, `${mode} 不是有效 report out`);
      }

      setMode("report_out_overflow");
      const outputOverflow = await mcp.callTool("cheng_profile_report", {action: "report", root, rawProfile, out: join(root, "oversize.profile.txt"), maxOutputBytes: 256}, undefined, 5_000);
      assertTrue(outputOverflow.isError !== true && outputOverflow.parsed.supported === false && outputOverflow.parsed.output?.overflow === true, "超限 report out 不读取、不认 schema");

      setMode("report_out_invalid_utf8");
      const invalidUtf8Out = join(root, "invalid-utf8.profile.txt");
      const invalidUtf8 = await mcp.callTool("cheng_profile_report", {action: "report", root, rawProfile, out: invalidUtf8Out}, undefined, 5_000);
      assertTrue(invalidUtf8.isError !== true && invalidUtf8.parsed.supported === false && invalidUtf8.parsed.profileSchema === null && invalidUtf8.parsed.output?.validUtf8 === false, "坏 UTF-8 字节旁的 marker 不得证明 schema/support");
      assertTrue(invalidUtf8.parsed.output?.published === false && !existsSync(invalidUtf8Out), "未通过 UTF-8/schema 验证的 report staging 不发布");

      setMode("report_overflow");
      const overflow = await mcp.callTool("cheng_profile_report", {action: "report", root, rawProfile, maxOutputBytes: 256}, undefined, 5_000);
      assertTrue(overflow.isError !== true && overflow.parsed.supported === false && overflow.parsed.status === "CFAIL" && overflow.parsed.overflow === true, "report overflow 为 CFAIL");
    }
  } finally {
    mcp.kill();
    rmSync(root, {recursive: true, force: true});
  }
  console.log("item20 profile_report invariants: PASS");
}

main().catch((error) => {
  console.error("item20 profile_report invariants: FAIL", error);
  process.exit(1);
});
