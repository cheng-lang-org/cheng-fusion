import {chmodSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {assertTrue, startMcp} from "./mcp_client.ts";
import {assertProfileProbeReportSchema, initChengProfileReportModule} from "../src/cheng_profile_report_m9007.ts";
import {assertProfileReportToolSchema} from "../src/cheng_toolkit_m9000.ts";

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function makeExecutable(path: string, body: string) {
  writeFileSync(path, `#!/bin/bash\nset -euo pipefail\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

function pythonWithPsutil() {
  const seen = new Set<string>();
  for (const directory of String(process.env.PATH || "").split(":")) {
    if (!directory.startsWith("/")) continue;
    const candidate = join(directory, "python3");
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    const probe = spawnSync(candidate, ["-I", "-c", "import psutil; print(psutil.__file__)"], {
      encoding: "utf8", timeout: 5_000, maxBuffer: 1024 * 1024,
      env: {PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C"},
    });
    if (probe.status === 0 && probe.stdout.trim().startsWith("/")) {
      return {python: candidate, psutilInit: probe.stdout.trim()};
    }
  }
  throw new Error("item20 requires python3 with psutil for the real process-tree guard");
}

function pidIsRunning(pid: number) {
  const probe = spawnSync("/bin/ps", ["-o", "stat=", "-p", String(pid)], {encoding: "utf8"});
  const state = probe.stdout.trim();
  return probe.status === 0 && state.length > 0 && !state.startsWith("Z");
}

function pidState(pid: number) {
  return spawnSync("/bin/ps", ["-o", "pid=,ppid=,pgid=,stat=,command=", "-p", String(pid)], {encoding: "utf8"}).stdout.trim();
}

async function waitForPidsStopped(pids: number[]) {
  for (let attempt = 0; attempt < 400; attempt++) {
    if (pids.every((pid) => !pidIsRunning(pid))) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return pids.every((pid) => !pidIsRunning(pid));
}

async function main() {
  initChengProfileReportModule();
  const implementationSource = realpathSync(fileURLToPath(new URL("../src/cheng_profile_report_m9007.ts", import.meta.url)));
  const implementationSourceSha256 = createHash("sha256").update(readFileSync(implementationSource)).digest("hex");
  const root = realpathSync(mkdtempSync(join(tmpdir(), "fusion-profile-current-source-")));
  const artifactDir = join(root, "artifacts/backend_driver");
  const sourceDir = join(root, "src/tests");
  const toolsDir = join(root, "tools");
  mkdirSync(artifactDir, {recursive: true});
  mkdirSync(sourceDir, {recursive: true});
  mkdirSync(toolsDir, {recursive: true});
  const chengRoot = process.env.CHENG_TOOLCHAIN_ROOT || process.env.CHENG_ROOT || "/Users/lbcheng/cheng-lang";
  const guard = join(toolsDir, "beat_c_process_group_guard.sh");
  copyFileSync(join(chengRoot, "tools/beat_c_process_group_guard.sh"), guard);
  chmodSync(guard, 0o755);
  const monitorRuntime = pythonWithPsutil();
  const monitorSite = join(toolsDir, "monitor-site");
  mkdirSync(monitorSite, {recursive: true});
  const privatePsutil = join(monitorSite, "psutil");
  cpSync(dirname(monitorRuntime.psutilInit), privatePsutil, {recursive: true});
  const privatePsutilInit = join(privatePsutil, "__init__.py");
  const privatePsutilClosureFile = join(privatePsutil, "_common.py");
  if (!existsSync(privatePsutilInit)) throw new Error("private psutil copy is incomplete");
  if (!existsSync(privatePsutilClosureFile)) throw new Error("private psutil closure copy is incomplete");
  const monitorPython = join(toolsDir, "monitor-python");
  copyFileSync(monitorRuntime.python, monitorPython);
  chmodSync(monitorPython, 0o755);
  writeFileSync(join(root, "cheng-package.toml"), 'package_id = "pkg://local/profile-current-source"\n');
  const source = join(sourceDir, "fixture.cheng");
  writeFileSync(source, "fn main(): int32 =\n    return 0\n");
  const modePath = join(root, "mode.txt");
  const builderLog = join(root, "builder.log");
  const profileLog = join(root, "profile-driver.log");
  const driver = join(artifactDir, "cheng");
  const driverTemplate = makeExecutable(join(root, "driver-template.sh"), [
    `printf "%s\\n" "$*" >> ${shellQuote(profileLog)}`,
    `mode="$(cat ${shellQuote(modePath)})"`,
    'cmd="${1:-}"',
    'out=""',
    'report=""',
    'in=""',
    'root=""',
    'for arg in "$@"; do',
    '  case "$arg" in',
    '    --out:*) out="${arg#--out:}" ;;',
    '    --report-out:*) report="${arg#--report-out:}" ;;',
    '    --in:*) in="${arg#--in:}" ;;',
    '    --root:*) root="${arg#--root:}" ;;',
    '  esac',
    'done',
    'if [ "$cmd" = "profile-run" ]; then',
    '  if [ "$mode" = "instrumentation_missing" ]; then',
    '    echo "backend driver direct: profile-run requires full selfhost profiling command lowering" >&2',
    '    exit 2',
    '  fi',
    '  if [ "$mode" = "rss_aggregate" ]; then',
    '    : > "$root/rss-child-pids.txt"',
    '    /usr/bin/python3 -c \'import time; x=bytearray(440*1024*1024); time.sleep(30)\' &',
    '    p1=$!',
    '    printf "%s\\n" "$p1" >> "$root/rss-child-pids.txt"',
    '    /usr/bin/python3 -c \'import time; x=bytearray(440*1024*1024); time.sleep(30)\' &',
    '    p2=$!',
    '    printf "%s\\n" "$p2" >> "$root/rss-child-pids.txt"',
    '    /usr/bin/python3 -c \'import time; x=bytearray(440*1024*1024); time.sleep(30)\' &',
    '    p3=$!',
    '    printf "%s\\n" "$p3" >> "$root/rss-child-pids.txt"',
    '    wait "$p1" "$p2" "$p3"',
    '    exit 0',
    '  fi',
    '  if [ "$mode" = "guard_overflow" ]; then',
    '    /usr/bin/python3 -c \'import sys,time; sys.stdout.write("x"*1048576); sys.stdout.flush(); time.sleep(30)\'',
    '    exit 0',
    '  fi',
    '  /bin/sleep 0.2',
    '  case "$mode" in valid|raw_header_only|raw_extra_field|raw_missing_phase|raw_bad_total|report_mismatch|converted_mismatch) ;; *) echo "unexpected mode: $mode" >&2; exit 2 ;; esac',
    '  [ -n "$out" ] && [ -n "$report" ] && [ -n "$in" ]',
    '  printf "#!/bin/bash\\nexit 0\\n" > "$out"',
    '  chmod +x "$out"',
    '  case "$report" in *.txt) raw="${report%.txt}.raw.txt" ;; *) raw="$report.raw.txt" ;; esac',
    '  source_sha="$(shasum -a 256 "$in" | awk \'{print $1}\')"',
    '  driver_sha="$(shasum -a 256 "$0" | awk \'{print $1}\')"',
    '  output_sha="$(shasum -a 256 "$out" | awk \'{print $1}\')"',
    '  {',
    '    printf "cheng_profile_raw\\nprofile_kind=compiler_phase\\nsource_path=%s\\nsource_sha256=%s\\nsource_tree_cid=%064d\\ndriver_path=%s\\ndriver_sha256=%s\\noutput_path=%s\\noutput_sha256=%s\\nphase_count=8\\nphase_total_ns=36\\n" "$in" "$source_sha" 2 "$0" "$driver_sha" "$out" "$output_sha"',
    '    printf "phase\\tsystem_link_plan\\t1\\nphase\\tcompiler_csg\\t2\\nphase\\tlowering_plan\\t3\\nphase\\tprimary_object_plan\\t4\\nphase\\tdirect_object_emit\\t5\\nphase\\tprovider_objects\\t6\\nphase\\tnative_link\\t7\\nphase\\tline_map\\t8\\n"',
    '  } > "$raw"',
    '  {',
    '    printf "cheng_profile\\nprofile_kind=compiler_phase\\nsource_path=%s\\nsource_sha256=%s\\nsource_tree_cid=%064d\\ndriver_path=%s\\ndriver_sha256=%s\\noutput_path=%s\\noutput_sha256=%s\\nphase_count=8\\nphase_total_ns=36\\n" "$in" "$source_sha" 2 "$0" "$driver_sha" "$out" "$output_sha"',
    '    printf "hot_phase[0]=8|line_map\\nhot_phase[1]=7|native_link\\nhot_phase[2]=6|provider_objects\\nhot_phase[3]=5|direct_object_emit\\nhot_phase[4]=4|primary_object_plan\\nhot_phase[5]=3|lowering_plan\\nhot_phase[6]=2|compiler_csg\\nhot_phase[7]=1|system_link_plan\\n"',
    '  } > "$report"',
    '  case "$mode" in',
    '    raw_header_only) printf "cheng_profile_raw\\n" > "$raw" ;;',
    '    raw_extra_field) printf "extra=1\\n" >> "$raw" ;;',
    '    raw_missing_phase) sed -n "1,18p" "$raw" > "$raw.tmp"; mv "$raw.tmp" "$raw" ;;',
    '    raw_bad_total) sed "s/phase_total_ns=36/phase_total_ns=35/" "$raw" > "$raw.tmp"; mv "$raw.tmp" "$raw" ;;',
    '    report_mismatch) sed "s/hot_phase\\[0\\]=8|line_map/hot_phase[0]=7|line_map/" "$report" > "$report.tmp"; mv "$report.tmp" "$report" ;;',
    '  esac',
    '  cat "$report"',
    '  exit 0',
    'fi',
    'if [ "$cmd" = "profile-report" ]; then',
    '  /bin/sleep 0.2',
    '  [ -n "$in" ] && [ -n "$out" ]',
    '  [ "$(head -n 1 "$in")" = "cheng_profile_raw" ] || exit 3',
    '  {',
    '    printf "cheng_profile\\n"',
    '    sed -n "2,11p" "$in"',
    '    awk -F "\\t" \'BEGIN {n=0} /^phase\\t/ {name[n]=$2; ns[n]=$3; n++} END {for (i=n-1; i>=0; i--) printf "hot_phase[%d]=%s|%s\\n", n-1-i, ns[i], name[i]}\' "$in"',
    '  } > "$out"',
    '  if [ "$mode" = "converted_mismatch" ]; then sed "s/hot_phase\\[0\\]=8|line_map/hot_phase[0]=7|line_map/" "$out" > "$out.tmp"; mv "$out.tmp" "$out"; fi',
    '  cat "$out"',
    '  exit 0',
    'fi',
    'echo "unexpected profile driver command: $cmd" >&2',
    'exit 2',
  ].join("\n"));
  const builder = makeExecutable(join(root, "stage3-builder.sh"), [
    `printf "%s\\n" "$*" >> ${shellQuote(builderLog)}`,
    '[ "${1:-}" = "build-backend-driver" ]',
    `mkdir -p ${shellQuote(artifactDir)}`,
    `cp ${shellQuote(driverTemplate)} ${shellQuote(driver)}`,
    `chmod +x ${shellQuote(driver)}`,
    `printf "cheng_line_map\\nsrc/core/tooling/backend_driver_dispatch_min.cheng\\n" > ${shellQuote(`${driver}.map`)}`,
    'source_tree=""',
    'for arg in "$@"; do case "$arg" in --profile-source-tree-sha256:*) source_tree="${arg#--profile-source-tree-sha256:}" ;; esac; done',
    '[ -n "$source_tree" ]',
    `driver_sha="$(shasum -a 256 ${shellQuote(driver)} | awk '{print $1}')"`,
    `map_sha="$(shasum -a 256 ${shellQuote(`${driver}.map`)} | awk '{print $1}')"`,
    `printf "full_backend_codegen=1\\ncold_system_link_exec=0\\noutput_sha256=%s\\nmap_sha256=%s\\nsource_manifest_sha256=%064d\\nsource_tree_sha256=%s\\n" "$driver_sha" "$map_sha" 1 "$source_tree" > ${shellQuote(`${driver}.report.txt`)}`,
    '/bin/sleep 0.2',
  ].join("\n"));
  writeFileSync(modePath, "instrumentation_missing\n");

  const mcp = startMcp({
    CHENG_DRIVER: driver,
    CHENG_STAGE3_DRIVER: builder,
    BEAT_C_GUARD_MONITOR_PYTHON: monitorPython,
    PYTHONPATH: monitorSite,
  }, root);
  try {
    const rootUri = pathToFileURL(root).href;
    await mcp.initialize({rootUri, workspaceFolders: [{uri: rootUri, name: "profile-current-source"}]});

    console.log("[0] probe 先走官方 build，并精确暴露 instrumentation blocker");
    const blocked = await mcp.callTool("cheng_profile_report", {action: "probe", root, source}, undefined, 10_000);
    assertTrue(blocked.isError !== true, `probe 返回结构化 CFAIL: ${JSON.stringify(blocked.parsed).slice(0, 500)}`);
    assertProfileProbeReportSchema(blocked.parsed);
    assertTrue(
      blocked.parsed.implementationSchema === "cheng_profile_report.current_source" &&
      realpathSync(blocked.parsed.implementationSourcePath) === implementationSource &&
      blocked.parsed.implementationSourceSha256 === implementationSourceSha256,
      "item20 必须绑定当前加载的 profile 实现源码 schema/hash",
    );
    assertTrue(blocked.parsed.supported === false && blocked.parsed.driverContract.supported === true, "current-source driver 合同已通过、instrumentation 独立失败");
    const buildGuardIdentity = blocked.parsed.driverContract.identity.buildGuard;
    assertTrue(
      buildGuardIdentity.commandArgv.length === 4 &&
      buildGuardIdentity.commandArgv[0] === builder &&
      buildGuardIdentity.commandArgv[1] === "build-backend-driver" &&
      buildGuardIdentity.commandArgv[2] === "--require-rebuild" &&
      buildGuardIdentity.commandArgv[3] === `--profile-source-tree-sha256:${blocked.parsed.driverContract.identity.sourceTreeSha256}` &&
      buildGuardIdentity.targetEnvRequested.includes("CHENG_PROCESS_MAX_RSS_BYTES=1073741824"),
      "current-source tree provenance 与 exact 1GiB target env 必须进入 guard argv/env identity",
    );
    assertTrue(String(blocked.parsed.instrumentation.unsupportedReason).includes("current_source_profile_instrumentation_unavailable"), "缺 producer 给出精确 blocked reason");
    const firstBuildArgs = readFileSync(builderLog, "utf8").trim();
    assertTrue(firstBuildArgs.startsWith("build-backend-driver --require-rebuild --profile-source-tree-sha256:") && /[0-9a-f]{64}$/.test(firstBuildArgs), "stage3 强制重建并绑定 Fusion 独立 source tree hash");
    assertTrue(readFileSync(profileLog, "utf8").split("\n").some((line) => line.startsWith("profile-run ")), "probe 真实调用 current-source driver 的 profile-run");
    assertTrue(!readFileSync(profileLog, "utf8").includes("build-backend-driver"), "current-source driver 不冒充 builder");

    console.log("[1] exact-hash receipt 复用，不重复 build；probe 同时验证 run/report producer");
    writeFileSync(modePath, "valid\n");
    const ready = await mcp.callTool("cheng_profile_report", {action: "probe", root, source}, undefined, 10_000);
    assertTrue(ready.isError !== true && ready.parsed.supported === true, `probe 能力应完整: ${JSON.stringify(ready.parsed).slice(0, 5000)}`);
    assertTrue(readFileSync(builderLog, "utf8").trim().split("\n").length === 1, "source/driver hash未变时只选择 receipt，不重复构建");
    assertTrue(ready.parsed.driverContract.identity.selection === "exact_hash_receipt", "probe 报告 exact-hash current-source selection");
    assertTrue(ready.parsed.instrumentation.profile.checks.rawOk === true && ready.parsed.instrumentation.profile.checks.convertedOk === true, "probe 验证真实 raw producer 和独立 report consumer");

    console.log("[1a] guard argv/env identity mutation 不能复用 receipt");
    const driverReceiptPath = ready.parsed.driverContract.identity.receiptPath;
    const originalDriverReceipt = readFileSync(driverReceiptPath, "utf8");
    const argvMutatedReceipt = JSON.parse(originalDriverReceipt);
    argvMutatedReceipt.buildGuard.commandArgv[3] = `--profile-source-tree-sha256:${"0".repeat(64)}`;
    writeFileSync(driverReceiptPath, `${JSON.stringify(argvMutatedReceipt, null, 2)}\n`);
    const argvMutated = await mcp.callTool("cheng_profile_report", {action: "probe", root, source}, undefined, 10_000);
    assertTrue(argvMutated.isError === true && String(argvMutated.parsed).includes("command argv identity mismatch"), "guard argv 漂移后旧 driver receipt hard-fail");
    writeFileSync(driverReceiptPath, originalDriverReceipt);

    const envMutatedReceipt = JSON.parse(originalDriverReceipt);
    envMutatedReceipt.buildGuard.targetEnvRequested = envMutatedReceipt.buildGuard.targetEnvRequested.map((entry: string) =>
      entry.startsWith("CHENG_PROCESS_MAX_RSS_BYTES=") ? "CHENG_PROCESS_MAX_RSS_BYTES=1" : entry);
    writeFileSync(driverReceiptPath, `${JSON.stringify(envMutatedReceipt, null, 2)}\n`);
    const envMutated = await mcp.callTool("cheng_profile_report", {action: "probe", root, source}, undefined, 10_000);
    assertTrue(envMutated.isError === true && String(envMutated.parsed).includes("requested target environment identity mismatch"), "guard target env 漂移后旧 driver receipt hard-fail");
    writeFileSync(driverReceiptPath, originalDriverReceipt);

    const substitutedBuildReceipt = JSON.parse(originalDriverReceipt);
    substitutedBuildReceipt.buildGuard = ready.parsed.instrumentation.profile.processGuard;
    writeFileSync(driverReceiptPath, `${JSON.stringify(substitutedBuildReceipt, null, 2)}\n`);
    const substitutedBuild = await mcp.callTool("cheng_profile_report", {action: "probe", root, source}, undefined, 10_000);
    assertTrue(
      substitutedBuild.isError === true && String(substitutedBuild.parsed).includes("command path/hash identity mismatch"),
      "另一份完整自洽且成功的 profile-run guard receipt 不得冒充 driver build receipt",
    );
    writeFileSync(driverReceiptPath, originalDriverReceipt);

    const identitySegment = join(root, "identity-segment");
    mkdirSync(identitySegment);
    const resolvedBuilderPath = `${identitySegment}/../stage3-builder.sh`;
    const resolvedPathReceipt = JSON.parse(originalDriverReceipt);
    resolvedPathReceipt.buildGuard.commandPath = resolvedBuilderPath;
    writeFileSync(driverReceiptPath, `${JSON.stringify(resolvedPathReceipt, null, 2)}\n`);
    const resolvedPath = await mcp.callTool("cheng_profile_report", {action: "probe", root, source}, undefined, 10_000);
    assertTrue(
      resolvedPath.isError !== true && resolvedPath.parsed.supported === true,
      "含 dot-segment 的同一真实 builder path 按 resolve 后精确身份接受",
    );
    writeFileSync(driverReceiptPath, originalDriverReceipt);

    const builderByteAlias = join(root, "stage3-builder-byte-alias.sh");
    copyFileSync(builder, builderByteAlias);
    chmodSync(builderByteAlias, 0o755);
    const byteAliasReceipt = JSON.parse(originalDriverReceipt);
    byteAliasReceipt.buildGuard.commandPath = builderByteAlias;
    byteAliasReceipt.buildGuard.commandArgv[0] = builderByteAlias;
    writeFileSync(driverReceiptPath, `${JSON.stringify(byteAliasReceipt, null, 2)}\n`);
    const byteAlias = await mcp.callTool("cheng_profile_report", {action: "probe", root, source}, undefined, 10_000);
    assertTrue(
      byteAlias.isError === true && String(byteAlias.parsed).includes("command identity mismatch"),
      "同字节不同 path/inode 的 builder alias 不得替换精确 stage3 身份",
    );
    writeFileSync(driverReceiptPath, originalDriverReceipt);

    const builderSymlink = join(root, "stage3-builder-symlink.sh");
    symlinkSync(builder, builderSymlink);
    const symlinkReceipt = JSON.parse(originalDriverReceipt);
    symlinkReceipt.buildGuard.commandPath = builderSymlink;
    symlinkReceipt.buildGuard.commandArgv[0] = builderSymlink;
    writeFileSync(driverReceiptPath, `${JSON.stringify(symlinkReceipt, null, 2)}\n`);
    const symlinkAlias = await mcp.callTool("cheng_profile_report", {action: "probe", root, source}, undefined, 10_000);
    assertTrue(
      symlinkAlias.isError === true && String(symlinkAlias.parsed).includes("must be a non-empty regular file"),
      "指向 stage3 的 symlink 也不得成为 receipt commandPath",
    );
    writeFileSync(driverReceiptPath, originalDriverReceipt);

    const reorderedArgvReceipt = JSON.parse(originalDriverReceipt);
    [reorderedArgvReceipt.buildGuard.commandArgv[1], reorderedArgvReceipt.buildGuard.commandArgv[2]] =
      [reorderedArgvReceipt.buildGuard.commandArgv[2], reorderedArgvReceipt.buildGuard.commandArgv[1]];
    writeFileSync(driverReceiptPath, `${JSON.stringify(reorderedArgvReceipt, null, 2)}\n`);
    const reorderedArgv = await mcp.callTool("cheng_profile_report", {action: "probe", root, source}, undefined, 10_000);
    assertTrue(
      reorderedArgv.isError === true && String(reorderedArgv.parsed).includes("command argv identity mismatch"),
      "build argv 顺序变化必须拒绝",
    );
    writeFileSync(driverReceiptPath, originalDriverReceipt);

    const duplicateArgvReceipt = JSON.parse(originalDriverReceipt);
    duplicateArgvReceipt.buildGuard.commandArgv.splice(3, 0, "--require-rebuild");
    writeFileSync(driverReceiptPath, `${JSON.stringify(duplicateArgvReceipt, null, 2)}\n`);
    const duplicateArgv = await mcp.callTool("cheng_profile_report", {action: "probe", root, source}, undefined, 10_000);
    assertTrue(
      duplicateArgv.isError === true && String(duplicateArgv.parsed).includes("command argv identity mismatch"),
      "重复 require-rebuild flag 不能冒充 exact build argv",
    );
    writeFileSync(driverReceiptPath, originalDriverReceipt);

    console.log("[1b] map/provenance hash mutation 不能复用 receipt");
    const originalMap = readFileSync(`${driver}.map`, "utf8");
    writeFileSync(`${driver}.map`, `${originalMap}tampered_map_row\n`);
    const mapMutated = await mcp.callTool("cheng_profile_report", {action: "probe", root, source}, undefined, 10_000);
    assertTrue(mapMutated.isError === true && String(mapMutated.parsed).includes("map_sha256 does not match map bytes"), "map 字节变化必须撞 provenance map hash 门");
    writeFileSync(`${driver}.map`, originalMap);
    const originalProvenance = readFileSync(`${driver}.report.txt`, "utf8");
    writeFileSync(`${driver}.report.txt`, `${originalProvenance}tampered_provenance_row=1\n`);
    const provenanceMutated = await mcp.callTool("cheng_profile_report", {action: "probe", root, source}, undefined, 10_000);
    assertTrue(provenanceMutated.isError === true && String(provenanceMutated.parsed).includes("receipt mismatch: provenanceSha256"), "provenance 字节变化必须撞 receipt provenance hash 门");
    writeFileSync(`${driver}.report.txt`, originalProvenance);

    console.log("[1c] 空壳、额外字段、缺 phase、伪 total、raw/report 不一致全部拒绝");
    for (const malformedMode of ["raw_header_only", "raw_extra_field", "raw_missing_phase", "raw_bad_total", "report_mismatch", "converted_mismatch"]) {
      writeFileSync(modePath, `${malformedMode}\n`);
      const malformed = await mcp.callTool("cheng_profile_report", {action: "probe", root, source}, undefined, 10_000);
      assertTrue(malformed.isError !== true && malformed.parsed.supported === false, `${malformedMode} 不得被首行 schema 冒充: ${JSON.stringify(malformed.parsed).slice(0, 1000)}`);
    }

    writeFileSync(modePath, "valid\n");

    console.log("[2] run 发布 raw+receipt，report 只消费该绑定 raw");
    const executableOut = join(root, "profiled-fixture");
    const rawOut = join(root, "fixture.profile.raw.txt");
    const runJson = join(root, "fixture.profile.run.json");
    const run = await mcp.callTool("cheng_profile_report", {
      action: "run", root, source, out: executableOut, rawProfileOut: rawOut, reportOut: runJson,
    }, undefined, 10_000);
    assertTrue(run.isError !== true && run.parsed.supported === true, `formal profile-run 应成功: ${JSON.stringify(run.parsed).slice(0, 1000)}`);
    assertProfileReportToolSchema(run.parsed);
    assertTrue(run.parsed.profile.observationKind === "formal_profile_run" && run.parsed.profile.raw.published === true, "run 不是 timing/RSS 模型，而是 formal raw profile");
    assertTrue(existsSync(rawOut) && existsSync(`${rawOut}.receipt.json`) && existsSync(executableOut), "raw、receipt、executable 都从私有 staging 发布");
    assertTrue(JSON.parse(readFileSync(runJson, "utf8")).profile.raw.sha256 === run.parsed.profile.raw.sha256, "JSON receipt 绑定 raw hash");

    const rawReceiptPath = `${rawOut}.receipt.json`;
    const originalRawReceipt = readFileSync(rawReceiptPath, "utf8");
    const substitutedRawReceipt = JSON.parse(originalRawReceipt);
    substitutedRawReceipt.processGuard = buildGuardIdentity;
    writeFileSync(rawReceiptPath, `${JSON.stringify(substitutedRawReceipt, null, 2)}\n`);
    const substitutedRaw = await mcp.callTool("cheng_profile_report", {
      action: "report", root, rawProfile: rawOut,
    }, undefined, 10_000);
    assertTrue(
      substitutedRaw.isError === true && String(substitutedRaw.parsed).includes("raw profile driver header does not match its guarded producer"),
      "另一份完整自洽且成功的 build guard receipt 不得冒充 raw profile-run receipt",
    );
    writeFileSync(rawReceiptPath, originalRawReceipt);

    const alternateSource = join(root, "alternate-profile-source.cheng");
    writeFileSync(alternateSource, readFileSync(source));
    const aliasedSourceReceipt = JSON.parse(originalRawReceipt);
    aliasedSourceReceipt.sourcePath = alternateSource;
    writeFileSync(rawReceiptPath, `${JSON.stringify(aliasedSourceReceipt, null, 2)}\n`);
    const aliasedSource = await mcp.callTool("cheng_profile_report", {
      action: "report", root, rawProfile: rawOut,
    }, undefined, 10_000);
    assertTrue(
      aliasedSource.isError === true && String(aliasedSource.parsed).includes("raw profile header does not match its run receipt"),
      "同字节的别名 source 不得替换 raw header 的精确 source path",
    );
    writeFileSync(rawReceiptPath, originalRawReceipt);

    const originalRaw = readFileSync(rawOut, "utf8");
    const producerDriverPath = JSON.parse(originalRawReceipt).processGuard.commandSnapshotPath;
    const driverHeaderMutated = originalRaw.replace(`driver_path=${producerDriverPath}\n`, `driver_path=${driver}\n`);
    assertTrue(driverHeaderMutated !== originalRaw, "raw fixture 必须包含 guarded command snapshot path");
    const driverHeaderReceipt = JSON.parse(originalRawReceipt);
    driverHeaderReceipt.rawProfileSha256 = createHash("sha256").update(driverHeaderMutated).digest("hex");
    driverHeaderReceipt.rawProfileBytes = Buffer.byteLength(driverHeaderMutated);
    writeFileSync(rawOut, driverHeaderMutated);
    writeFileSync(rawReceiptPath, `${JSON.stringify(driverHeaderReceipt, null, 2)}\n`);
    const driverHeader = await mcp.callTool("cheng_profile_report", {
      action: "report", root, rawProfile: rawOut,
    }, undefined, 10_000);
    assertTrue(
      driverHeader.isError === true && String(driverHeader.parsed).includes("raw profile driver header does not match its guarded producer"),
      "重签 raw hash 也不能把 producer snapshot driver path 换成 canonical driver path",
    );
    writeFileSync(rawOut, originalRaw);
    writeFileSync(rawReceiptPath, originalRawReceipt);

    const originalRawValue = JSON.parse(originalRawReceipt);
    const alternateOutputPath = join(root, "alternate-profile-executable");
    const outputHeaderMutated = originalRaw.replace(
      `output_path=${originalRawValue.outputPath}\n`,
      `output_path=${alternateOutputPath}\n`,
    );
    assertTrue(outputHeaderMutated !== originalRaw, "raw fixture 必须包含 guarded profile output path");
    const outputHeaderReceipt = JSON.parse(originalRawReceipt);
    outputHeaderReceipt.outputPath = alternateOutputPath;
    outputHeaderReceipt.rawProfileSha256 = createHash("sha256").update(outputHeaderMutated).digest("hex");
    outputHeaderReceipt.rawProfileBytes = Buffer.byteLength(outputHeaderMutated);
    writeFileSync(rawOut, outputHeaderMutated);
    writeFileSync(rawReceiptPath, `${JSON.stringify(outputHeaderReceipt, null, 2)}\n`);
    const outputHeader = await mcp.callTool("cheng_profile_report", {
      action: "report", root, rawProfile: rawOut,
    }, undefined, 10_000);
    assertTrue(
      outputHeader.isError === true && String(outputHeader.parsed).includes("command argv is not the exact producer command"),
      "raw+receipt 同步重签 output path 也不能脱离 profile-run argv",
    );
    writeFileSync(rawOut, originalRaw);
    writeFileSync(rawReceiptPath, originalRawReceipt);

    const swappedProducerPathReceipt = JSON.parse(originalRawReceipt);
    swappedProducerPathReceipt.producerRawProfilePath = swappedProducerPathReceipt.outputPath;
    writeFileSync(rawReceiptPath, `${JSON.stringify(swappedProducerPathReceipt, null, 2)}\n`);
    const swappedProducerPath = await mcp.callTool("cheng_profile_report", {
      action: "report", root, rawProfile: rawOut,
    }, undefined, 10_000);
    assertTrue(
      swappedProducerPath.isError === true && String(swappedProducerPath.parsed).includes("producer path is not bound"),
      "producer raw path 与 executable output path 互换必须拒绝",
    );
    writeFileSync(rawReceiptPath, originalRawReceipt);

    const convertedOut = join(root, "fixture.profile.txt");
    const converted = await mcp.callTool("cheng_profile_report", {
      action: "report", root, rawProfile: rawOut, out: convertedOut,
    }, undefined, 10_000);
    assertTrue(converted.isError !== true && converted.parsed.supported === true && converted.parsed.profileSchema === "cheng_profile", "report 读取 run 生成的 raw+receipt");
    assertTrue(readFileSync(convertedOut, "utf8").startsWith("cheng_profile\n"), "report 发布 exact schema");

    console.log("[3] raw/source/receipt/stale output mutation全部 hard-fail");
    const rawWithoutReceipt = join(root, "orphan.raw.txt");
    writeFileSync(rawWithoutReceipt, readFileSync(rawOut));
    const orphan = await mcp.callTool("cheng_profile_report", {action: "report", root, rawProfile: rawWithoutReceipt}, undefined, 5_000);
    assertTrue(orphan.isError === true && String(orphan.parsed).includes("raw profile receipt"), "无 run receipt 的 raw 不可转换");

    const rawMutatedButValid = readFileSync(rawOut, "utf8")
      .replace("phase_total_ns=36", "phase_total_ns=37")
      .replace("phase\tline_map\t8", "phase\tline_map\t9");
    writeFileSync(rawOut, rawMutatedButValid);
    const mutated = await mcp.callTool("cheng_profile_report", {action: "report", root, rawProfile: rawOut}, undefined, 5_000);
    assertTrue(mutated.isError === true && String(mutated.parsed).includes("raw profile receipt mismatch"), "raw 字节变化被 hash 拒绝");

    const sourceBoundRaw = join(root, "source-bound.raw.txt");
    const sourceBoundSource = join(root, "profile-input.cheng");
    writeFileSync(sourceBoundSource, "fn main(): int32 =\n    return 0\n");
    const sourceBoundRun = await mcp.callTool("cheng_profile_report", {
      action: "run", root, source: sourceBoundSource, rawProfileOut: sourceBoundRaw,
    }, undefined, 10_000);
    assertTrue(sourceBoundRun.isError !== true && sourceBoundRun.parsed.supported === true, `先生成 source-bound raw: ${JSON.stringify(sourceBoundRun.parsed).slice(0, 1000)}`);
    writeFileSync(sourceBoundSource, "fn main(): int32 =\n    return 1\n");
    const sourceMutated = await mcp.callTool("cheng_profile_report", {
      action: "report", root, rawProfile: sourceBoundRaw,
    }, undefined, 10_000);
    assertTrue(sourceMutated.isError === true && String(sourceMutated.parsed).includes("raw profile source no longer matches"), "源码变化后旧 raw receipt 被 source hash 拒绝");

    const staleOut = join(root, "stale.profile.txt");
    writeFileSync(staleOut, "sentinel\n");
    const stale = await mcp.callTool("cheng_profile_report", {
      action: "run", root, source, rawProfileOut: join(root, "unused.raw.txt"), out: staleOut,
    }, undefined, 5_000);
    assertTrue(stale.isError === true && String(stale.parsed).includes("already exists") && readFileSync(staleOut, "utf8") === "sentinel\n", "fresh-only 输出不覆盖旧文件");

    console.log("[4] userspace process-tree guard 聚合子进程 RSS、整组 kill、输出溢出");
    writeFileSync(modePath, "rss_aggregate\n");
    const rssKilled = await mcp.callTool("cheng_profile_report", {
      action: "probe", root, source, timeoutSec: 15,
    }, undefined, 30_000);
    assertTrue(rssKilled.isError !== true && rssKilled.parsed.supported === false, `聚合 RSS 超过 1 GiB 必须 CFAIL: ${JSON.stringify(rssKilled.parsed).slice(0, 1000)}`);
    const rssGuard = rssKilled.parsed.instrumentation.profile.processGuard;
    assertTrue(rssGuard.executionKind === "userspace_process_tree" && rssGuard.linuxCgroupProof === false && rssGuard.rssLimitBytes === 1073741824, "报告明确是 exact userspace process-tree 1 GiB，不冒充 Linux cgroup");
    assertTrue(rssGuard.status === "ABORT" && rssGuard.abortReason === "rss_limit_exceeded" && rssGuard.cleanupStatus === "completed" && rssGuard.enforcedPeakBytes > 1073741824, "聚合子进程 RSS 触发 guard 并完成整组清理");
    const childPids = readFileSync(join(root, "rss-child-pids.txt"), "utf8").split("\n").filter((line) => /^[1-9][0-9]*$/.test(line)).map(Number);
    assertTrue(childPids.length === 3 && await waitForPidsStopped(childPids), `RSS 违规后已记录子进程均停止，pids=${childPids.join(",")}: ${childPids.map(pidState).join(" | ")}`);

    writeFileSync(modePath, "guard_overflow\n");
    const overflowKilled = await mcp.callTool("cheng_profile_report", {
      action: "probe", root, source, timeoutSec: 15, maxOutputBytes: 4096,
    }, undefined, 30_000);
    assertTrue(overflowKilled.isError !== true && overflowKilled.parsed.supported === false, "guard 输出超过 4096 bytes 必须 CFAIL");
    const overflowGuard = overflowKilled.parsed.instrumentation.profile.processGuard;
    assertTrue(overflowGuard.status === "ABORT" && overflowGuard.abortReason === "combined_output_limit_exceeded" && overflowGuard.combinedOutputLimitBytes === 4096, "输出 cap 由同一 process-tree guard 执行并发布报告");

    console.log("[5] 显式 monitor 不可用时 hard-fail，不回退 PATH Python");
    const invalidMonitorMcp = startMcp({
      CHENG_DRIVER: driver,
      CHENG_STAGE3_DRIVER: builder,
      BEAT_C_GUARD_MONITOR_PYTHON: "/bin/sh",
      PYTHONPATH: monitorSite,
    }, root);
    try {
      await invalidMonitorMcp.initialize({rootUri, workspaceFolders: [{uri: rootUri, name: "profile-current-source-invalid-monitor"}]});
      writeFileSync(modePath, "valid\n");
      const invalidMonitor = await invalidMonitorMcp.callTool("cheng_profile_report", {action: "probe", root, source}, undefined, 10_000);
      assertTrue(invalidMonitor.isError === true && String(invalidMonitor.parsed).includes("requires an absolute executable python3 monitor with psutil"), "显式 monitor 失败必须 hard-fail，不能扫描 PATH 回退");
    } finally {
      invalidMonitorMcp.kill();
    }

    console.log("[5a] guard receipt 重验 monitor Python/psutil/canonical guard 物理身份");
    writeFileSync(source, "fn main(): int32 =\n    return 0\n");
    const builderBeforeIdentityMutation = readFileSync(builder);
    writeFileSync(builder, Buffer.concat([builderBeforeIdentityMutation, Buffer.from("\n# item20 stage3 identity mutation\n")]));
    chmodSync(builder, 0o755);
    const builderIdentityMutated = await mcp.callTool("cheng_profile_report", {action: "probe", root, source}, undefined, 10_000);
    assertTrue(
      builderIdentityMutated.isError === true && String(builderIdentityMutated.parsed).includes("command identity mismatch"),
      "stage3 构建后字节/stat 变化必须使旧 build receipt hard-fail",
    );
    rmSync(driverReceiptPath);
    const rebuiltAfterBuilderMutation = await mcp.callTool("cheng_profile_report", {action: "probe", root, source}, undefined, 10_000);
    assertTrue(
      rebuiltAfterBuilderMutation.isError !== true && rebuiltAfterBuilderMutation.parsed.supported === true,
      "移除失效 receipt 后必须由当前 stage3 重新构建并签发新物理身份",
    );

    const originalPsutilClosureFile = readFileSync(privatePsutilClosureFile);
    writeFileSync(privatePsutilClosureFile, Buffer.concat([originalPsutilClosureFile, Buffer.from("\n# item20 closure mutation\n")]));
    const psutilClosureMutated = await mcp.callTool("cheng_profile_report", {action: "probe", root, source}, undefined, 10_000);
    assertTrue(psutilClosureMutated.isError === true && String(psutilClosureMutated.parsed).includes("monitor psutil closure identity mismatch"), "psutil 非入口 closure 字节漂移后旧 guard receipt hard-fail");
    writeFileSync(privatePsutilClosureFile, originalPsutilClosureFile);

    const originalPsutilStat = lstatSync(privatePsutilInit);
    utimesSync(privatePsutilInit, originalPsutilStat.atime, new Date(originalPsutilStat.mtimeMs + 2000));
    const psutilMutated = await mcp.callTool("cheng_profile_report", {action: "probe", root, source}, undefined, 10_000);
    assertTrue(psutilMutated.isError === true && String(psutilMutated.parsed).includes("monitor_psutil identity mismatch"), `psutil stat 漂移后旧 guard receipt hard-fail: ${JSON.stringify(psutilMutated.parsed).slice(0, 1000)}`);
    utimesSync(privatePsutilInit, originalPsutilStat.atime, originalPsutilStat.mtime);

    const originalMonitor = readFileSync(monitorPython);
    writeFileSync(monitorPython, Buffer.concat([originalMonitor, Buffer.from("\n# item20 monitor mutation\n")]));
    chmodSync(monitorPython, 0o755);
    const monitorMutated = await mcp.callTool("cheng_profile_report", {action: "probe", root, source}, undefined, 10_000);
    assertTrue(monitorMutated.isError === true && String(monitorMutated.parsed).includes("monitor_python identity mismatch"), "monitor Python 字节或 stat 漂移后旧 guard receipt hard-fail");

    const originalGuard = readFileSync(guard);
    writeFileSync(guard, Buffer.concat([originalGuard, Buffer.from("\n# item20 guard mutation\n")]));
    chmodSync(guard, 0o755);
    const guardMutated = await mcp.callTool("cheng_profile_report", {action: "probe", root, source}, undefined, 10_000);
    assertTrue(guardMutated.isError === true && String(guardMutated.parsed).includes("canonical guard identity mismatch"), "canonical guard 字节或 stat 漂移后旧 receipt hard-fail");

    console.log("[6] builder rc=0 复用旧 driver/report 仍 hard-fail");
    makeExecutable(builder, [
      `printf "%s\\n" "$*" >> ${shellQuote(builderLog)}`,
      '[ "${1:-}" = "build-backend-driver" ]',
      '/bin/sleep 0.2',
      'exit 0',
    ].join("\n"));
    writeFileSync(source, "fn main(): int32 =\n    return 2\n");
    const staleBuilder = await mcp.callTool("cheng_profile_report", {action: "probe", root, source}, undefined, 10_000);
    assertTrue(staleBuilder.isError !== true && staleBuilder.parsed.supported === false, "stale builder 不得给新 source tree 签 receipt");
    assertTrue(String(staleBuilder.parsed.driverContract.reason).includes("did not refresh"), "stale builder 精确暴露未刷新 driver/map/provenance");

    console.log("[7] builder 重写 stale bytes 但伪 tree/重复 provenance key 仍拒绝");
    makeExecutable(builder, [
      `printf "%s\\n" "$*" >> ${shellQuote(builderLog)}`,
      `cp ${shellQuote(driver)} ${shellQuote(`${driver}.tmp`)}`,
      `mv ${shellQuote(`${driver}.tmp`)} ${shellQuote(driver)}`,
      `chmod +x ${shellQuote(driver)}`,
      `printf "cheng_line_map\\nsrc/core/tooling/backend_driver_dispatch_min.cheng\\n" > ${shellQuote(`${driver}.map`)}`,
      `driver_sha="$(shasum -a 256 ${shellQuote(driver)} | awk '{print $1}')"`,
      `map_sha="$(shasum -a 256 ${shellQuote(`${driver}.map`)} | awk '{print $1}')"`,
      `printf "full_backend_codegen=1\\ncold_system_link_exec=0\\noutput_sha256=%s\\nmap_sha256=%s\\nsource_manifest_sha256=%064d\\nsource_manifest_sha256=%064d\\nsource_tree_sha256=%064d\\n" "$driver_sha" "$map_sha" 1 2 9 > ${shellQuote(`${driver}.report.txt`)}`,
      '/bin/sleep 0.2',
    ].join("\n"));
    writeFileSync(source, "fn main(): int32 =\n    return 3\n");
    const forgedTree = await mcp.callTool("cheng_profile_report", {action: "probe", root, source}, undefined, 10_000);
    assertTrue(forgedTree.isError !== true && forgedTree.parsed.supported === false, "重写 stale bytes 不得绕过 source tree/provenance key 唯一性");
    assertTrue(String(forgedTree.parsed.driverContract.reason).includes("source_manifest_sha256") || String(forgedTree.parsed.driverContract.reason).includes("source_tree_sha256"), "伪 tree 或重复 key 精确拒绝");

    console.log("[8] stage3 不能作为 profiling driver");
    const impersonating = startMcp({
      CHENG_DRIVER: builder,
      CHENG_STAGE3_DRIVER: builder,
      BEAT_C_GUARD_MONITOR_PYTHON: monitorPython,
      PYTHONPATH: monitorSite,
    }, root);
    try {
      await impersonating.initialize({rootUri, workspaceFolders: [{uri: rootUri, name: "profile-current-source"}]});
      const rejected = await impersonating.callTool("cheng_profile_report", {action: "probe", root, source}, undefined, 5_000);
      assertTrue(rejected.isError !== true && rejected.parsed.supported === false, "builder/profile driver 同路径结构化拒绝");
      assertTrue(String(rejected.parsed.driverContract.reason).includes("must be canonical") || String(rejected.parsed.driverContract.reason).includes("cannot impersonate"), "拒绝原因明确，不回退旧 stage3/vendor");
    } finally {
      impersonating.kill();
    }

  } finally {
    mcp.kill();
    rmSync(root, {recursive: true, force: true});
  }
  console.log("item20 profile_report current-source invariants: PASS");
}

main().catch((error) => {
  console.error("item20 profile_report current-source invariants: FAIL", error);
  process.exit(1);
});
