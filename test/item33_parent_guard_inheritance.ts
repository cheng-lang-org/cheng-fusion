#!/usr/bin/env bun
import {chmodSync, closeSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, writeSync} from "node:fs";
import {spawn, spawnSync} from "node:child_process";
import {randomBytes} from "node:crypto";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {dlopen, FFIType, ptr} from "bun:ffi";
import {assertTrue, sleep, startMcp} from "./mcp_client.ts";
import {
  CHENG_PROCESS_TOPOLOGY_ABI_SHA256,
  chengProcessIdentitySnapshot,
} from "../src/cheng_toolkit_m9000.ts";

const TOOLKIT = "/Users/lbcheng/cheng-fusion/src/cheng_toolkit_m9000.ts";
const SELF = fileURLToPath(import.meta.url);
const GUARD_ENV_KEYS = [
  "BEAT_C_GUARD_PARENT_CAPABILITY",
  "BEAT_C_GUARD_PARENT_MONITOR_PID",
  "BEAT_C_GUARD_PARENT_LIMIT_BYTES",
  "BEAT_C_GUARD_PARENT_PROOF_FD",
];
const EXPECTED_TOPOLOGY_ABI_SHA256 = "e12cb7987e890a6491e7f938c7d6f483ffde2615a03a0fb902d8c9463ff337ea";

function topology(pid: number) {
  return chengProcessIdentitySnapshot(pid);
}

async function waitForNoActiveProcess(pids: number[], timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const live = pids.filter((pid) => topology(pid) !== null);
    if (live.length === 0) return;
    if (Date.now() >= deadline) throw new Error(`processes escaped cleanup: ${live.join(",")}`);
    await sleep(20);
  }
}

function scrubGuardEnv(extra: Record<string, string> = {}) {
  const env = {...process.env, ...extra};
  for (const key of GUARD_ENV_KEYS) if (!(key in extra)) delete env[key];
  return env;
}

async function helper(mode: string, marker?: string) {
  const {runChengDriver} = await import(TOOLKIT);
  if (mode === "probe") {
    try {
      const inherited = GUARD_ENV_KEYS.some((key) => String(process.env[key] || "").length > 0);
      const result = await runChengDriver(process.execPath, [SELF, "--identity-child"], {
        cwd: "/tmp",
        ...(inherited ? {} : {hardTimeoutMs: 2000}),
      });
      const child = JSON.parse(result.stdout.trim());
      console.log(JSON.stringify({
        ok: true,
        self: topology(process.pid),
        child,
      }));
    } catch (error) {
      console.log(JSON.stringify({ok: false, error: error instanceof Error ? error.message : String(error)}));
    }
    return;
  }
  if (mode === "local-timeout") {
    const result = await runChengDriver("/bin/sh", ["-c", "/bin/sleep 30 & grand=$!; echo $grand; wait"], {
      cwd: "/tmp",
      hardTimeoutMs: 200,
    });
    const grandchildPid = Number(result.stdout.trim());
    if (!Number.isSafeInteger(grandchildPid) || grandchildPid <= 1) throw new Error(`missing grandchild pid: ${JSON.stringify(result)}`);
    await waitForNoActiveProcess([grandchildPid]);
    console.log(JSON.stringify({timedOut: result.timedOut, grandchildPid, escaped: false}));
    return;
  }
  if (mode === "inherited-timeout") {
    if (!marker) throw new Error("inherited-timeout helper requires marker path");
    await runChengDriver("/bin/sh", ["-c", `grand=; /bin/sleep 30 & grand=$!; printf '%s %s\\n' "$$" "$grand" > "$1"; wait`, "sh", marker], {
      cwd: "/tmp",
    });
    throw new Error("inherited timeout child unexpectedly returned");
  }
  if (mode === "fresh-mcp") {
    const projectRoot = "/Users/lbcheng/cheng-lang";
    const mcp = startMcp({}, projectRoot);
    try {
      await mcp.initialize({
        rootUri: `file://${projectRoot}`,
        workspaceFolders: [{uri: `file://${projectRoot}`, name: "parent-guard-fresh-mcp"}],
      });
      const result = await mcp.callTool("cheng_symbol_diff", {
        action: "snapshot",
        root: projectRoot,
        source: "src/tests/ordinary_zero_exit_fixture.cheng",
      }, undefined, 15000);
      console.log(JSON.stringify({
        ok: result.isError !== true && result.parsed?.schema === "cheng_symbols",
        self: topology(process.pid),
        server: topology(mcp.child.pid!),
        symbolCount: result.parsed?.primarySymbolCount,
      }));
    } finally {
      mcp.kill();
    }
    return;
  }
  throw new Error(`unknown helper mode: ${mode}`);
}

function runHelper(mode: string, env: Record<string, string>, detached = false) {
  return spawnSync(process.execPath, [SELF, "--helper", mode], {
    cwd: "/Users/lbcheng/cheng-fusion",
    env,
    detached,
    encoding: "utf8",
    timeout: 10000,
    maxBuffer: 16 * 1024 * 1024,
  });
}

function parseHelperJson(result: ReturnType<typeof spawnSync>) {
  assertTrue(!result.error && !result.signal && result.status === 0, `helper 正常退出: status=${result.status} signal=${result.signal} error=${String(result.error)} stderr=${String(result.stderr)}`);
  return JSON.parse(String(result.stdout || "").trim());
}

function createProofSocketPair() {
  const libc = dlopen("/usr/lib/libSystem.B.dylib", {
    socketpair: {
      args: [FFIType.i32, FFIType.i32, FFIType.i32, FFIType.ptr],
      returns: FFIType.i32,
    },
  });
  const raw = Buffer.alloc(8);
  const rc = libc.symbols.socketpair(1, 1, 0, ptr(raw));
  libc.close();
  if (rc !== 0) throw new Error("socketpair failed");
  return [raw.readInt32LE(0), raw.readInt32LE(4)] as const;
}

async function structuralMonitor(
  helperMode: string,
  timeoutMs: number,
  marker?: string,
  declaredMonitorPid?: number,
  closeProofAfterWrite = false,
) {
  const [monitorProofFd, childProofFd] = createProofSocketPair();
  const capability = randomBytes(32).toString("hex");
  const monitorPid = declaredMonitorPid || process.pid;
  const env = scrubGuardEnv({
    BEAT_C_GUARD_PARENT_CAPABILITY: capability,
    BEAT_C_GUARD_PARENT_MONITOR_PID: String(monitorPid),
    BEAT_C_GUARD_PARENT_LIMIT_BYTES: "1073741824",
    BEAT_C_GUARD_PARENT_PROOF_FD: "3",
  });
  const child = spawn(process.execPath, [SELF, "--helper", helperMode, ...(marker ? [marker] : [])], {
    cwd: "/Users/lbcheng/cheng-fusion",
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe", childProofFd],
  });
  const monitorIdentity = topology(monitorPid);
  const rootIdentity = topology(child.pid!);
  if (!monitorIdentity || !rootIdentity) throw new Error("proof monitor/root identity vanished");
  const record = {
    schema: "cheng.guard.parent_proof",
    capability,
    monitorPid,
    monitorStartTvsec: Number(monitorIdentity.startTvsec),
    monitorStartTvusec: Number(monitorIdentity.startTvusec),
    limitBytes: 1073741824,
    rootPid: rootIdentity.pid,
    rootStartTvsec: Number(rootIdentity.startTvsec),
    rootStartTvusec: Number(rootIdentity.startTvusec),
    rootPpid: rootIdentity.ppid,
    rootSid: rootIdentity.sid,
    rootPgid: rootIdentity.pgid,
  };
  const raw = Buffer.from(JSON.stringify(record) + "\n");
  const frame = Buffer.alloc(4 + raw.length);
  frame.writeUInt32BE(raw.length, 0);
  raw.copy(frame, 4);
  let written = 0;
  while (written < frame.length) written += writeSync(monitorProofFd, frame, written);
  if (closeProofAfterWrite) closeSync(monitorProofFd);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout!.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr!.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
  let timedOut = false;
  const status = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch (error: any) {
        if (error?.code !== "ESRCH") reject(error);
      }
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve(timedOut ? 124 : (code ?? 1));
    });
  });
  try { closeSync(monitorProofFd); } catch {}
  try { closeSync(childProofFd); } catch {}
  process.stdout.write(Buffer.concat(stdout));
  process.stderr.write(Buffer.concat(stderr));
  process.exitCode = status;
}

function runStructuralParentGuard(
  helperMode: string,
  timeoutMs: number,
  marker?: string,
  declaredMonitorPid?: number,
  closeProofAfterWrite = false,
) {
  const result = spawnSync(process.execPath, [
    SELF,
    "--monitor",
    helperMode,
    String(timeoutMs),
    marker || "",
    declaredMonitorPid ? String(declaredMonitorPid) : "",
    closeProofAfterWrite ? "1" : "0",
  ], {
    cwd: "/Users/lbcheng/cheng-fusion",
    env: scrubGuardEnv(),
    encoding: "utf8",
    timeout: timeoutMs + 10000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assertTrue(!result.error && !result.signal, `structural parent guard 完整 reap: error=${String(result.error)} signal=${result.signal} stderr=${result.stderr}`);
  return result;
}

async function main() {
  if (process.argv.includes("--identity-child")) {
    console.log(JSON.stringify(chengProcessIdentitySnapshot(process.pid)));
    return;
  }
  const monitorIndex = process.argv.indexOf("--monitor");
  if (monitorIndex >= 0) {
    const timeoutMs = Number(process.argv[monitorIndex + 2]);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error("monitor timeout is invalid");
    const declaredMonitorPidText = process.argv[monitorIndex + 4] || "";
    await structuralMonitor(
      process.argv[monitorIndex + 1] || "",
      timeoutMs,
      process.argv[monitorIndex + 3] || undefined,
      declaredMonitorPidText ? Number(declaredMonitorPidText) : undefined,
      process.argv[monitorIndex + 5] === "1",
    );
    return;
  }
  const helperIndex = process.argv.indexOf("--helper");
  if (helperIndex >= 0) {
    await helper(process.argv[helperIndex + 1] || "", process.argv[helperIndex + 2]);
    return;
  }

  const root = mkdtempSync(join(tmpdir(), "cheng-fusion-parent-guard-"));
  try {
    console.log("[A0] topology verifier 绑定 Darwin ABI，双读保持同一进程身份");
    assertTrue(
      CHENG_PROCESS_TOPOLOGY_ABI_SHA256 === EXPECTED_TOPOLOGY_ABI_SHA256,
      `topology verifier ABI 身份固定: ${CHENG_PROCESS_TOPOLOGY_ABI_SHA256}`,
    );
    const firstSelf = topology(process.pid);
    const secondSelf = topology(process.pid);
    assertTrue(
      firstSelf !== null &&
        JSON.stringify(firstSelf) === JSON.stringify(secondSelf) &&
        firstSelf.abiSha256 === EXPECTED_TOPOLOGY_ABI_SHA256,
      `稳定 libproc snapshot: first=${JSON.stringify(firstSelf)} second=${JSON.stringify(secondSelf)}`,
    );

    console.log("[A] 合法祖先 guard session 下 runChengDriver 子进程不 setsid");
    const guarded = runStructuralParentGuard("probe", 10000);
    assertTrue(
      guarded.status === 0,
      `合法 guard 正常完成, rc=${guarded.status} stdout=${guarded.stdout} stderr=${guarded.stderr}`,
    );
    const guardedProbe = JSON.parse(String(guarded.stdout || "").trim());
    assertTrue(guardedProbe.ok === true, `合法 guard 被 toolkit 接受: ${JSON.stringify(guardedProbe)}`);
    assertTrue(
      guardedProbe.child.sid === guardedProbe.self.sid &&
        guardedProbe.child.pgid === guardedProbe.self.pgid &&
        guardedProbe.child.sid !== guardedProbe.child.pid &&
        guardedProbe.self.abiSha256 === EXPECTED_TOPOLOGY_ABI_SHA256 &&
        guardedProbe.child.abiSha256 === EXPECTED_TOPOLOGY_ABI_SHA256,
      `inherited child 沿用 guard session/group，不创建新 session: ${JSON.stringify(guardedProbe)}`,
    );

    console.log("[A1] production guard 实际签发 canonical proof record，Fusion 原路径消费");
    const productionRoot = join(root, "production");
    mkdirSync(productionRoot);
    const symbolDriver = join(productionRoot, "symbol-driver.sh");
    writeFileSync(symbolDriver, `#!/bin/sh
set -eu
source_path=
target=
for arg in "$@"; do
  case "$arg" in
    --in:*) source_path=\${arg#--in:} ;;
    --target:*) target=\${arg#--target:} ;;
  esac
done
test -n "$source_path"
test -n "$target"
printf 'cheng_symbols\\n\\nentry=%s\\ntarget=%s\\nsource_path=%s\\nlowering_symbol_count=1\\nlowering_symbols=main::main\\nprimary_symbol_count=1\\nprimary_symbols=_main\\nprimary_unsupported_count=0\\n' "$source_path" "$target" "$source_path"
`);
    chmodSync(symbolDriver, 0o700);
    const guardPath = "/Users/lbcheng/cheng-lang/tools/beat_c_process_group_guard.sh";
    const productionGuard = spawnSync(guardPath, [
      "--rss-limit:1073741824",
      "--timeout:10",
      `--report-out:${join(productionRoot, "report.txt")}`,
      `--stdout:${join(productionRoot, "stdout.txt")}`,
      `--stderr:${join(productionRoot, "stderr.txt")}`,
      "--",
      process.execPath,
      SELF,
      "--helper",
      "fresh-mcp",
    ], {
      cwd: "/Users/lbcheng/cheng-fusion",
      env: scrubGuardEnv({
        BEAT_C_GUARD_MONITOR_PYTHON: "/opt/miniconda3/bin/python3",
        CHENG_DRIVER: symbolDriver,
      }),
      encoding: "utf8",
      timeout: 20000,
      maxBuffer: 16 * 1024 * 1024,
    });
    assertTrue(
      !productionGuard.error && !productionGuard.signal && productionGuard.status === 0,
      `production guard 正常完成: rc=${productionGuard.status} stderr=${productionGuard.stderr}`,
    );
    const productionProbe = JSON.parse(readFileSync(join(productionRoot, "stdout.txt"), "utf8").trim());
    const productionReport = Object.fromEntries(
      readFileSync(join(productionRoot, "report.txt"), "utf8")
        .trim().split("\n").map((line) => line.split("=", 2)),
    );
    assertTrue(
      productionProbe.ok === true &&
        productionProbe.server.sid === productionProbe.self.sid &&
        productionProbe.server.pgid === productionProbe.self.pgid &&
        productionProbe.symbolCount > 0 &&
        productionReport.target_env_injected_parent_proof_fd === "3" &&
        /^[0-9a-f]{64}$/.test(productionReport.target_env_injected_parent_proof_record_sha256 || ""),
      `production guard proof/child topology 精确: ${JSON.stringify({productionProbe, productionReport})}`,
    );

    console.log("[B] 自建 session 的伪 capability 与非祖先 monitor PID 均 fail-closed");
    const forged = parseHelperJson(runHelper("probe", scrubGuardEnv({
      BEAT_C_GUARD_PARENT_CAPABILITY: "0".repeat(64),
      BEAT_C_GUARD_PARENT_MONITOR_PID: String(process.pid),
      BEAT_C_GUARD_PARENT_LIMIT_BYTES: "1073741824",
      BEAT_C_GUARD_PARENT_PROOF_FD: "3",
    }), true));
    assertTrue(
      forged.ok === false && /proof fd is not open|proof fd is not a Unix socket/.test(forged.error),
      `自建 session + 语法合法 capability 无 monitor proof descriptor 仍被拒绝: ${JSON.stringify(forged)}`,
    );
    const closedProof = parseHelperJson(runStructuralParentGuard(
      "probe", 10000, undefined, undefined, true,
    ));
    assertTrue(
      closedProof.ok === false && /proof peer closed|no stable LOCAL_PEERPID/.test(closedProof.error),
      `record 后关闭 monitor peer 必须 fail-closed: ${JSON.stringify(closedProof)}`,
    );
    const sibling = spawn("/bin/sleep", ["30"], {stdio: "ignore"});
    try {
      assertTrue(Number.isSafeInteger(sibling.pid) && sibling.pid! > 1, "构造 live 非祖先 PID");
      const nonAncestorResult = runStructuralParentGuard("probe", 10000, undefined, sibling.pid);
      const nonAncestor = parseHelperJson(nonAncestorResult);
      assertTrue(
        nonAncestor.ok === false && /proof peer pid differs from monitor/.test(nonAncestor.error),
        `descriptor peer 与非祖先 monitor 不一致时被拒绝: ${JSON.stringify(nonAncestor)}`,
      );
    } finally {
      try{sibling.kill("SIGKILL")}catch{}
    }

    console.log("[C] 无 parent guard 保留 detached session 与本地 process-group timeout cleanup");
    const unguardedProbe = parseHelperJson(runHelper("probe", scrubGuardEnv()));
    assertTrue(
      unguardedProbe.ok === true &&
        unguardedProbe.child.sid === unguardedProbe.child.pid &&
        unguardedProbe.child.pgid === unguardedProbe.child.pid,
      `standalone child 保持 detached session/group: ${JSON.stringify(unguardedProbe)}`,
    );
    const localTimeout = parseHelperJson(runHelper("local-timeout", scrubGuardEnv()));
    assertTrue(localTimeout.timedOut === true && localTimeout.escaped === false, `standalone timeout 清理整个 child group: ${JSON.stringify(localTimeout)}`);

    console.log("[D] inherited child 超时由 session-owning parent guard 清理，child/grandchild 均不逃逸");
    const marker = join(root, "guarded-timeout.pids");
    const guardedTimeout = runStructuralParentGuard("inherited-timeout", 3000, marker);
    assertTrue(guardedTimeout.status === 124, `parent guard timeout rc=124, 实得 ${guardedTimeout.status}`);
    const markerText = await Bun.file(marker).text();
    const pids = markerText.trim().split(/\s+/).map(Number);
    assertTrue(pids.length === 2 && pids.every((pid) => Number.isSafeInteger(pid) && pid > 1), `PID marker 精确: ${JSON.stringify(pids)}`);
    await waitForNoActiveProcess(pids);
    console.log("item33 parent guard inheritance: PASS");
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
}

main().catch((error) => {
  console.error("item33 parent guard inheritance: FAIL", error);
  process.exit(1);
});
