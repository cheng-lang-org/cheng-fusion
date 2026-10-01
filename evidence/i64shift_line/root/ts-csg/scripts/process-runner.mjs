import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

const activeChildren = new Set();
let cleanupHooksInstalled = false;
let terminatingSignal = "";

const signalKillDelayMs = 2000;
const signalExitDeadlineMs = 3000;
// 12 GiB: the glyph SDF atlas precompute legitimately peaks ~9.4 GiB transient
// (atlas grids + font faces; output identical to the 1 GiB-era atlas, verified
// 2026-07-31). 1 GiB was a pre-SDF rail and OOM-killed every run.
export const generatedExecutableProcessTreeLimitBytes = 12884901888;
const generatedExecutableCombinedOutputLimitBytes = 1073741824;
const generatedExecutableGuardSchema = "beat_c_process_memory_guard";

const signalExitCode = {
  SIGHUP: 129,
  SIGINT: 130,
  SIGTERM: 143,
};

export async function runCommand(command, args, options = {}) {
  installCleanupHooks();

  const encoding = options.encoding ?? "buffer";
  const maxBuffer = options.maxBuffer ?? 32 * 1024 * 1024;
  const killDelayMs = options.killDelayMs ?? 2000;
  let stdoutFd = null;
  let stderrFd = null;
  const stdio = options.stdio ?? [
    "ignore",
    options.stdoutPath ? (stdoutFd = openSync(options.stdoutPath, "w")) : "pipe",
    options.stderrPath ? (stderrFd = openSync(options.stderrPath, "w")) : "pipe",
  ];

  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      detached: true,
      stdio,
    });
    activeChildren.add(child);

    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let exceededBuffer = false;
    let spawnError = null;
    let timeoutTimer = null;
    let sigkillTimer = null;

    const startKill = () => {
      signalProcessGroup(child, "SIGTERM");
      sigkillTimer = setTimeout(() => signalProcessGroup(child, "SIGKILL"), killDelayMs);
      sigkillTimer.unref?.();
    };

    if (options.timeout) {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        startKill();
      }, options.timeout);
      timeoutTimer.unref?.();
    }

    child.stdout?.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxBuffer) {
        exceededBuffer = true;
        startKill();
        return;
      }
      stdoutChunks.push(chunk);
    });

    child.stderr?.on("data", (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes > maxBuffer) {
        exceededBuffer = true;
        startKill();
        return;
      }
      stderrChunks.push(chunk);
    });

    child.on("error", (err) => {
      spawnError = err;
      startKill();
    });

    child.on("close", (code, signal) => {
      activeChildren.delete(child);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (sigkillTimer) clearTimeout(sigkillTimer);
      if (stdoutFd !== null) closeSync(stdoutFd);
      if (stderrFd !== null) closeSync(stderrFd);

      const stdout = formatOutput(Buffer.concat(stdoutChunks), encoding);
      const stderr = formatOutput(Buffer.concat(stderrChunks), encoding);
      if (spawnError) {
        reject(commandError(spawnError.message, { command, args, code, signal, stdout, stderr }));
        return;
      }
      if (timedOut) {
        const tail = (text) => {
          const value = typeof text === "string" ? text : "";
          if (value.trim().length === 0) return "(empty)";
          return value.length > 4096 ? `…${value.slice(-4096)}` : value;
        };
        reject(commandError(`command timed out after ${options.timeout}ms: ${formatCommand(command, args)}\n--- child stderr tail ---\n${tail(stderr)}\n--- child stdout tail ---\n${tail(stdout)}`, {
          command,
          args,
          code,
          signal,
          stdout,
          stderr,
          timedOut: true,
        }));
        return;
      }
      if (exceededBuffer) {
        reject(commandError(`command exceeded maxBuffer ${maxBuffer} bytes: ${formatCommand(command, args)}`, {
          command,
          args,
          code,
          signal,
          stdout,
          stderr,
          exceededBuffer: true,
        }));
        return;
      }
      if (code !== 0) {
        reject(commandError(`command failed (${code ?? signal}): ${formatCommand(command, args)}`, {
          command,
          args,
          code,
          signal,
          stdout,
          stderr,
        }));
        return;
      }
      resolve(stdout);
    });
  });
}

export function buildGeneratedExecutableGuardInvocation(command, args, options = {}) {
  const commandPath = exactAbsolutePath(command, "generated executable");
  const guardPath = exactAbsolutePath(options.guardPath, "process-tree guard");
  const monitorPythonPath = exactAbsolutePath(
    options.monitorPythonPath ?? defaultGuardMonitorPythonPath(),
    "guard monitor Python",
  );
  const receiptPath = exactAbsentOutputPath(options.receiptPath, "guard receipt");
  const stdoutPath = exactAbsentOutputPath(options.stdoutPath, "guard stdout");
  const stderrPath = exactAbsentOutputPath(options.stderrPath, "guard stderr");
  const outputPaths = [receiptPath, stdoutPath, stderrPath];
  if (new Set(outputPaths).size !== outputPaths.length) {
    throw new Error("generated executable guard output paths must be distinct");
  }

  const timeoutMs = exactPositiveInteger(options.timeout, "generated executable timeout");
  const timeoutSeconds = Math.ceil(timeoutMs / 1000);
  const combinedOutputLimitBytes = exactPositiveInteger(
    options.maxBuffer ?? 32 * 1024 * 1024,
    "generated executable combined output limit",
  );
  if (combinedOutputLimitBytes > generatedExecutableCombinedOutputLimitBytes) {
    throw new Error(
      `generated executable combined output limit exceeds ${generatedExecutableCombinedOutputLimitBytes}`,
    );
  }
  const commandArgs = exactStringVector(args, "generated executable argv");
  const targetEnv = exactTargetEnvironment(options.env ?? {});

  const commandFile = stableRegularFile(commandPath, {
    executable: true,
    label: "generated executable",
  });
  stableRegularFile(guardPath, {
    executable: true,
    label: "process-tree guard",
  });
  stableRegularFile(monitorPythonPath, {
    executable: true,
    label: "guard monitor Python",
  });
  const monitorRuntimePath = join(dirname(guardPath), "beat_c_process_group_guard_runtime.py");
  const monitorRuntimeFile = stableRegularFile(monitorRuntimePath, {
    label: "process-tree guard runtime",
  });
  const commandArgv = [commandPath, ...commandArgs];
  const commandArgvSha256 = stringVectorDigest("cheng.guard.command_argv", commandArgv);
  const targetEnvSha256 = stringMapDigest("cheng.guard.target_env", targetEnv);

  const guardArgs = [
    "--snapshot-command",
    "--require-command-identity",
    `--monitor-python:${monitorPythonPath}`,
    `--expected-monitor-runtime-sha256:${monitorRuntimeFile.sha256}`,
    `--rss-limit:${generatedExecutableProcessTreeLimitBytes}`,
    `--timeout:${timeoutSeconds}`,
    `--combined-output-limit:${combinedOutputLimitBytes}`,
    `--report-out:${receiptPath}`,
    `--stdout:${stdoutPath}`,
    `--stderr:${stderrPath}`,
    `--expected-command-path:${commandPath}`,
    `--expected-command-sha256:${commandFile.sha256}`,
    "--target-env-clear",
    ...Object.keys(targetEnv).sort().map((key) => `--target-env:${key}=${targetEnv[key]}`),
    "--expected-exit-code:0",
    "--",
    ...commandArgv,
  ];

  return {
    guardCommand: guardPath,
    guardArgs,
    authority: {
      commandPath,
      commandSha256: commandFile.sha256,
      commandArgv,
      commandArgvSha256,
      targetEnv,
      targetEnvSha256,
      monitorRuntimePath,
      monitorRuntimeSha256: monitorRuntimeFile.sha256,
      receiptPath,
      stdoutPath,
      stderrPath,
      timeoutSeconds,
      combinedOutputLimitBytes,
      memoryLimitBytes: generatedExecutableProcessTreeLimitBytes,
    },
  };
}

export async function runGeneratedExecutable(command, args, options = {}) {
  const invocation = buildGeneratedExecutableGuardInvocation(command, args, options);
  const { authority } = invocation;
  try {
    await runCommand(invocation.guardCommand, invocation.guardArgs, {
      cwd: options.cwd,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    error.guardReceiptPath = authority.receiptPath;
    error.stdout = readOutputIfPresent(authority.stdoutPath, options.returnOutput !== false);
    error.stderr = readOutputIfPresent(authority.stderrPath, true);
    throw error;
  }

  const receiptFile = stableRegularFile(authority.receiptPath, {
    label: "guard receipt",
    sealed: true,
  });
  const receiptAuthority = {
    ...authority,
    receiptIdentity: receiptFile,
  };
  const receipt = validateGeneratedExecutableGuardReceipt(
    receiptFile.bytes.toString("utf8"),
    receiptAuthority,
  );
  return {
    output: readOutputIfPresent(authority.stdoutPath, options.returnOutput !== false),
    receipt,
  };
}

export function validateGeneratedExecutableGuardReceipt(receiptText, authority) {
  const rows = exactKeyValueReceipt(receiptText);
  const requireExact = (key, expected) => {
    if (rows.get(key) !== String(expected)) {
      throw new Error(
        `generated executable guard receipt ${key} mismatch: expected=${expected} actual=${rows.get(key) ?? "<missing>"}`,
      );
    }
  };
  const requirePositive = (key) => {
    const value = exactReceiptInteger(rows, key);
    if (value <= 0) throw new Error(`generated executable guard receipt ${key} must be positive`);
    return value;
  };

  requireExact("schema", generatedExecutableGuardSchema);
  requireExact("status", "completed");
  requireExact("rc", 0);
  requireExact("abort_reason", "");
  requireExact("expected_exit_code", 0);
  requireExact("actual_exit_code", 0);
  requireExact("exit_code_contract_status", "verified");
  requireExact("formal_command_identity_status", "required_verified");
  requireExact("command_execution_mode", "private_single_link_snapshot");
  requireExact("expected_command_path", authority.commandPath);
  requireExact("expected_command_sha256", authority.commandSha256);
  requireExact("command_path", authority.commandPath);
  requireExact("command_sha256", authority.commandSha256);
  requireExact("command_execution_snapshot_sha256", authority.commandSha256);
  requireExact("command_argv_count", authority.commandArgv.length);
  requireExact("command_argv_sha256", authority.commandArgvSha256);
  requireExact("target_env_mode", "exact");
  requireExact("target_env_requested_count", Object.keys(authority.targetEnv).length);
  requireExact("target_env_requested_sha256", authority.targetEnvSha256);
  requireExact("monitor_runtime_script_path", authority.monitorRuntimePath);
  requireExact("monitor_runtime_script_sha256", authority.monitorRuntimeSha256);
  requireExact("monitor_runtime_script_invocation_status", "verified_o_nofollow_loader_fd9");
  requireExact("memory_guard_mode", "process_tree");
  requireExact("memory_guard_scope", "identity_history_union_group_session_and_descendants");
  requireExact("memory_limit_bytes", authority.memoryLimitBytes);
  requireExact("observed_sample_limit_status", "proved");
  requireExact("memory_measurement_status", "available");
  requireExact("root_identity_sampled", 1);
  requireExact("process_tree_escape_pid", 0);
  requireExact("hard_memory_limit_proof_status", "not_provable_userspace_poll");
  requireExact("startup_status", "sampled");
  requireExact("output_path_history_status", "verified_clean");
  if (!authority.receiptIdentity) {
    throw new Error("generated executable guard receipt identity is missing");
  }
  requireExact("report_path", authority.receiptPath);
  requireExact("report_device", authority.receiptIdentity.device);
  requireExact("report_inode", authority.receiptIdentity.inode);
  requireExact("stdout_status", "available");
  requireExact("stdout_path", authority.stdoutPath);
  requireExact("stderr_status", "available");
  requireExact("stderr_path", authority.stderrPath);

  const residentPeakBytes = requirePositive("process_tree_resident_peak_bytes");
  const enforcedPeakBytes = requirePositive("process_tree_enforced_peak_bytes");
  const physFootprintPeakBytes = exactReceiptInteger(
    rows,
    "process_tree_phys_footprint_peak_bytes",
  );
  if (process.platform === "darwin") {
    requireExact("memory_enforcement_metric", "max_process_tree_resident_and_phys_footprint");
    requireExact("process_tree_phys_footprint_status", "available");
    if (enforcedPeakBytes !== Math.max(residentPeakBytes, physFootprintPeakBytes)) {
      throw new Error("generated executable Darwin enforced peak is not max(RSS, phys_footprint)");
    }
  } else {
    requireExact("memory_enforcement_metric", "process_tree_resident");
    requireExact("process_tree_phys_footprint_status", "unsupported");
    if (enforcedPeakBytes !== residentPeakBytes) {
      throw new Error("generated executable enforced peak differs from process-tree RSS");
    }
  }
  requireExact("process_tree_enforced_sample_peak_bytes", enforcedPeakBytes);
  if (enforcedPeakBytes > authority.memoryLimitBytes) {
    throw new Error("generated executable exceeded the process-tree memory limit");
  }
  requirePositive("memory_sample_count");
  requirePositive("process_tree_peak_process_count");
  requirePositive("process_tree_identity_history_peak_count");

  const stdoutFile = stableRegularFile(authority.stdoutPath, {
    label: "guard stdout",
    sealed: true,
  });
  const stderrFile = stableRegularFile(authority.stderrPath, {
    label: "guard stderr",
    sealed: true,
  });
  requireExact("stdout_sha256", stdoutFile.sha256);
  requireExact("stdout_device", stdoutFile.device);
  requireExact("stdout_inode", stdoutFile.inode);
  requireExact("stdout_size", stdoutFile.size);
  requireExact("stderr_sha256", stderrFile.sha256);
  requireExact("stderr_device", stderrFile.device);
  requireExact("stderr_inode", stderrFile.inode);
  requireExact("stderr_size", stderrFile.size);

  return {
    receiptPath: authority.receiptPath,
    commandPath: authority.commandPath,
    commandSha256: authority.commandSha256,
    commandArgvSha256: authority.commandArgvSha256,
    targetEnvSha256: authority.targetEnvSha256,
    memoryLimitBytes: authority.memoryLimitBytes,
    processTreeResidentPeakBytes: residentPeakBytes,
    processTreePhysFootprintPeakBytes: physFootprintPeakBytes,
    processTreeEnforcedPeakBytes: enforcedPeakBytes,
    hardMemoryLimitProofStatus: rows.get("hard_memory_limit_proof_status"),
  };
}

export function startManagedProcess(command, args, options = {}) {
  installCleanupHooks();

  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    detached: true,
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });
  activeChildren.add(child);

  if (options.drainStdout !== false) child.stdout?.resume();
  if (options.drainStderr !== false) child.stderr?.resume();

  let closed = false;
  const waitPromise = new Promise((resolve, reject) => {
    child.on("error", (err) => {
      activeChildren.delete(child);
      closed = true;
      reject(err);
    });
    child.on("close", (code, signal) => {
      activeChildren.delete(child);
      closed = true;
      resolve({ code, signal });
    });
  });

  return {
    child,
    wait: () => waitPromise,
    async stop(stopOptions = {}) {
      if (closed) return await waitPromise;
      const killDelayMs = stopOptions.killDelayMs ?? 2000;
      signalProcessGroup(child, stopOptions.signal ?? "SIGTERM");
      const sigkillTimer = setTimeout(() => signalProcessGroup(child, "SIGKILL"), killDelayMs);
      sigkillTimer.unref?.();
      try {
        return await waitPromise;
      } finally {
        clearTimeout(sigkillTimer);
      }
    },
  };
}

function installCleanupHooks() {
  if (cleanupHooksInstalled) return;
  cleanupHooksInstalled = true;
  process.once("exit", () => {
    killActiveProcessGroups("SIGTERM");
  });
  for (const signal of ["SIGHUP", "SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      if (terminatingSignal) {
        killActiveProcessGroups("SIGKILL");
        process.exit(signalExitCode[terminatingSignal]);
      }
      terminatingSignal = signal;
      killActiveProcessGroups("SIGTERM");
      if (activeChildren.size === 0) {
        process.exit(signalExitCode[signal]);
      }
      let sigkillTimer = null;
      let exitTimer = null;
      const pollTimer = setInterval(() => {
        if (activeChildren.size === 0) {
          clearInterval(pollTimer);
          clearTimeout(sigkillTimer);
          clearTimeout(exitTimer);
          process.exit(signalExitCode[signal]);
        }
      }, 10);
      sigkillTimer = setTimeout(() => {
        killActiveProcessGroups("SIGKILL");
      }, signalKillDelayMs);
      exitTimer = setTimeout(() => {
        clearInterval(pollTimer);
        killActiveProcessGroups("SIGKILL");
        process.exit(signalExitCode[signal]);
      }, signalExitDeadlineMs);
    });
  }
}

function killActiveProcessGroups(signal) {
  for (const child of activeChildren) {
    signalProcessGroup(child, signal);
  }
}

function signalProcessGroup(child, signal) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
    return;
  } catch (err) {
    if (err.code !== "ESRCH") {
      try {
        child.kill(signal);
      } catch (childErr) {
        if (childErr.code !== "ESRCH") throw childErr;
      }
    }
  }
}

function commandError(message, fields) {
  const err = new Error(message);
  err.status = typeof fields.code === "number" ? fields.code : null;
  err.signal = fields.signal;
  err.stdout = fields.stdout;
  err.stderr = fields.stderr;
  err.timedOut = fields.timedOut ?? false;
  err.exceededBuffer = fields.exceededBuffer ?? false;
  err.killed = err.timedOut || err.exceededBuffer;
  err.command = formatCommand(fields.command, fields.args);
  return err;
}

function exactAbsolutePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || !isAbsolute(value) || resolve(value) !== value) {
    throw new Error(`${label} path must be absolute and normalized`);
  }
  if (value.includes("\0") || value.includes("\n") || value.includes("\r")) {
    throw new Error(`${label} path contains a forbidden byte`);
  }
  return value;
}

function exactAbsentOutputPath(value, label) {
  const outputPath = exactAbsolutePath(value, label);
  let outputExists = false;
  try {
    lstatSync(outputPath);
    outputExists = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (outputExists) throw new Error(`${label} path already exists: ${outputPath}`);
  const parentInfo = lstatSync(dirname(outputPath));
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink()) {
    throw new Error(`${label} parent must be a real directory`);
  }
  return outputPath;
}

function exactPositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function exactStringVector(values, label) {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  return values.map((value, index) => {
    if (typeof value !== "string" || value.includes("\0")) {
      throw new Error(`${label}[${index}] must be a NUL-free string`);
    }
    return value;
  });
}

function exactTargetEnvironment(values) {
  if (values === null || typeof values !== "object" || Array.isArray(values)) {
    throw new Error("generated executable environment must be an object");
  }
  const result = {};
  for (const [key, value] of Object.entries(values)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || key.startsWith("BEAT_C_GUARD_")) {
      throw new Error(`generated executable environment key is not canonical: ${key}`);
    }
    if (typeof value !== "string" || value.includes("\0")) {
      throw new Error(`generated executable environment value is invalid: ${key}`);
    }
    result[key] = value;
  }
  return result;
}

function stableRegularFile(filePath, options = {}) {
  const label = options.label ?? "file";
  if (realpathSync(filePath) !== filePath) {
    throw new Error(`${label} path must not traverse a symlink`);
  }
  const flags = constants.O_RDONLY | constants.O_CLOEXEC | constants.O_NOFOLLOW;
  const fd = openSync(filePath, flags);
  try {
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n) {
      throw new Error(`${label} must be a single-link regular file`);
    }
    if (options.executable && (before.mode & 0o111n) === 0n) {
      throw new Error(`${label} is not executable`);
    }
    if (options.sealed && (before.mode & 0o222n) !== 0n) {
      throw new Error(`${label} is not sealed read-only`);
    }
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true });
    const named = lstatSync(filePath, { bigint: true });
    if (!sameFileIdentity(before, after) || !sameFileIdentity(before, named)) {
      throw new Error(`${label} identity changed while hashing`);
    }
    if (BigInt(bytes.length) !== before.size) {
      throw new Error(`${label} read was incomplete`);
    }
    return {
      bytes,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      device: before.dev.toString(),
      inode: before.ino.toString(),
      size: before.size.toString(),
    };
  } finally {
    closeSync(fd);
  }
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.uid === right.uid &&
    left.gid === right.gid &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs;
}

function framedText(value) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length > 0xffffffff) throw new Error("guard identity value is too large");
  const prefix = Buffer.allocUnsafe(4);
  prefix.writeUInt32BE(bytes.length);
  return Buffer.concat([prefix, bytes]);
}

function stringVectorDigest(domain, values) {
  const count = Buffer.allocUnsafe(4);
  count.writeUInt32BE(values.length);
  const chunks = [framedText(domain), count];
  for (const value of values) chunks.push(framedText(value));
  return createHash("sha256").update(Buffer.concat(chunks)).digest("hex");
}

function stringMapDigest(domain, values) {
  const keys = Object.keys(values).sort();
  const count = Buffer.allocUnsafe(4);
  count.writeUInt32BE(keys.length);
  const chunks = [framedText(domain), count];
  for (const key of keys) {
    chunks.push(framedText(key), framedText(values[key]));
  }
  return createHash("sha256").update(Buffer.concat(chunks)).digest("hex");
}

function exactKeyValueReceipt(text) {
  if (typeof text !== "string" || !text.endsWith("\n")) {
    throw new Error("generated executable guard receipt must end with LF");
  }
  const rows = new Map();
  for (const line of text.slice(0, -1).split("\n")) {
    const separator = line.indexOf("=");
    if (separator <= 0) throw new Error("generated executable guard receipt row is malformed");
    const key = line.slice(0, separator);
    if (!/^[a-z][a-z0-9_]*$/.test(key) || rows.has(key)) {
      throw new Error(`generated executable guard receipt key is invalid or duplicated: ${key}`);
    }
    rows.set(key, line.slice(separator + 1));
  }
  return rows;
}

function exactReceiptInteger(rows, key) {
  const value = rows.get(key);
  if (value === undefined || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`generated executable guard receipt ${key} is not a canonical integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`generated executable guard receipt ${key} exceeds the safe integer range`);
  }
  return parsed;
}

function readOutputIfPresent(filePath, shouldRead) {
  if (!shouldRead || !existsSync(filePath)) return "";
  return readFileSync(filePath, "utf8");
}

function defaultGuardMonitorPythonPath() {
  if (process.platform === "darwin") {
    return realpathSync(
      "/Applications/Xcode.app/Contents/Developer/Library/Frameworks/Python3.framework/Versions/3.9/bin/python3.9",
    );
  }
  return realpathSync("/usr/bin/python3");
}

function formatOutput(buffer, encoding) {
  if (encoding === "buffer" || encoding === null) return buffer;
  return buffer.toString(encoding);
}

function formatCommand(command, args) {
  return [command, ...args].join(" ");
}
