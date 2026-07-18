// @ts-nocheck
// cheng_ignition_chain: journaled 后台点火链。产品化 fixtures/ignition/reference_ignite_chain.sh
// 手工跑的确定性枚举链条(DRV 烤 -> 11 探针 -> GEN2 自烤 -> 终端三站 -> oracle 六件套 ->
// 可选 GEN3+masked 字节比对), 但 MCP 一次 tools/call 不能挂 20-45 分钟等自烤完成 —— 所以
// action=start 只负责渲染一个自包含 python3 链脚本、detached+unref 起后台进程立即返回,
// 每个阶段各自往 workDir/<runId>/journal.jsonl 追加一行结构化 JSON; action=status 读
// journal + pid 存活判定, 供调用方轮询。
//
// 阶段字段(与 journal.jsonl 逐行对应): provenance{seedSha256AtStart/AtRun+match,
// treeSrcHashAtStart/AtRun+match}(见下方溯源块注释), drvBake{rc,ok,sha256,peakRssBytes,peakRssError,signal},
// probes{probes:[{name,rc,expect,pass,compilePeakRssBytes,compilePeakRssError,compileSignal,runPeakRssBytes,runPeakRssError,runSignal}]},
// gen2Bake{rc,zcTotal,bails[],ok,sha256,peakRssBytes,peakRssError,signal},
// terminal{terminal:[{name,compileRc,runRc,expect,pass,compilePeakRssBytes,runPeakRssBytes,compileSignal,runSignal}]},
// oracle{oracle:[{name,rc,expect,pass,compilePeakRssBytes,runPeakRssBytes,compileSignal,runSignal}]},
// gen3{bakeRc,maskedIdentical,peakRssBytes,peakRssError,signal}, done{verdict}。
//
// 逐站 RSS 峰值(刀A): 每个子进程收尾后用 darwin `/usr/bin/time -l` 记录的 maximum resident
// set size(字节)写进该站 journal 行, 取不到就 null + peakRssError 原因, 不估算不补 0。
// 信号死亡取证(刀B): compile/run 的 rc<0 或 >=128 时记 signal 名; 若信号是
// SIGSEGV/SIGBUS/SIGILL 且崩的是 chain 自产二进制(DRV/GEN2 自己, 不是它编译产物运行时崩)
// 自动起 lldb one-shot(60s: run->bt 12->disassemble -c 8 --pc->quit), 存
// <runDir>/forensics/<stage>_<fixture>.lldb.txt, 该条目 journal 记 <prefix>Forensics{ok,path};
// lldb 失败(如二进制不可执行)不阻断链, 原因记 forensics.reason。
//
// 探针/终端网严格取 matrixPath 里 tags 含 "probe"/"terminal" 的可运行条目；缺文件、
// 非法 JSON、无对应标签或条目契约不完整都在启动后台进程前 hard-fail。oracle 六件套
// 不走 matrix，固定内置（reference 脚本没有为它定义标签挂钩点）。
import {accessSync, chmodSync, closeSync, constants as fsConstants, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync} from "node:fs";
import {createHash, randomBytes} from "node:crypto";
import {basename, dirname, isAbsolute, join, relative, resolve, sep} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {b as defineModuleInitializer} from "./runtime.ts";
import {createChengTextTool, jsonResult, CHENG_STAGE3_DRIVER, initChengToolkitModule, zodSchema} from "./cheng_toolkit_m9000.ts";

var chengIgnitionChainInputSchema, ChengIgnitionChainTool;

const CHENG_FUSION_PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_TREE_ROOT = "/Users/lbcheng/cheng-f24/tree_rebuilt_snap";
const DEFAULT_WORK_DIR = "/Users/lbcheng/cheng-f24/chain_runs";
const DEFAULT_MATRIX_PATH = join(CHENG_FUSION_PACKAGE_ROOT, "fixtures/ignition/matrix.json");
const MASKED_CMP_PATH = join(CHENG_FUSION_PACKAGE_ROOT, "tools/macho_masked_cmp.py");
const DRIVER_SRC_RELATIVE = "src/core/tooling/backend_driver_dispatch_min.cheng";
const RUN_ID_PATTERN = /^ignite_\d{8}T\d{6}_[0-9a-f]{6}$/;
// 12GiB: 历史硬编码值, 保留为默认不破坏现有调用方行为。实测 gen2 代际 driver 编全树峰值
// 已到 ~14-16GB, gen3 阶段常年撞这个 cap —— 故 gen3 阶段可用 gen3RssCapBytes 单独覆盖。
const DEFAULT_RSS_CAP_BYTES = "12884901888";
const DEFAULT_OUTPUT_MAX_BYTES = 268435456;

// 与 reference_ignite_chain.sh 的 oracle 六件套一致(固定内置, 不走 matrix tag)。
const DEFAULT_ORACLE = [
  {name: "min", fixture: join(CHENG_FUSION_PACKAGE_ROOT, "fixtures/ignition/min.cheng"), expect: 0},
  {name: "s2", fixture: join(CHENG_FUSION_PACKAGE_ROOT, "fixtures/ignition/s2_str_seq_clone.cheng"), expect: 0},
  {name: "orbytes", fixture: join(CHENG_FUSION_PACKAGE_ROOT, "fixtures/ignition/rbytes.cheng"), expect: 5},
  {name: "onsa", fixture: join(CHENG_FUSION_PACKAGE_ROOT, "fixtures/ignition/nsatest.cheng"), expect: 0},
  {name: "os4b", fixture: join(CHENG_FUSION_PACKAGE_ROOT, "fixtures/ignition/s4b_strconcat_chain_isolated.cheng"), expect: 0},
  {name: "oiso13", fixture: join(CHENG_FUSION_PACKAGE_ROOT, "fixtures/ignition/isolate13.cheng"), expect: 0},
];

function resolveAbsPath(value) {
  const text = String(value);
  return isAbsolute(text) ? text : resolve(text);
}

function resolveExistingDir(value, label) {
  const requested = resolveAbsPath(value);
  if (!existsSync(requested)) throw new Error(`${label} not found: ${requested}`);
  const path = realpathSync.native(requested);
  if (!statSync(path).isDirectory()) throw new Error(`${label} is not a directory: ${path}`);
  return path;
}

function resolveExistingFile(value, label, executable = false) {
  const requested = resolveAbsPath(value);
  if (!existsSync(requested)) throw new Error(`${label} not found: ${requested}`);
  const path = realpathSync.native(requested);
  const stat = statSync(path);
  if (!stat.isFile()) throw new Error(`${label} is not a file: ${path}`);
  if (stat.size === 0) throw new Error(`${label} is empty: ${path}`);
  if (executable) {
    try {
      accessSync(path, fsConstants.X_OK);
    } catch {
      throw new Error(`${label} is not executable: ${path}`);
    }
  }
  return path;
}

function resolveMatrixPath(matrixPathInput) {
  if (!matrixPathInput) {
    return resolveExistingFile(DEFAULT_MATRIX_PATH, "default ignition matrix");
  }
  const text = String(matrixPathInput);
  const path = isAbsolute(text) ? text : resolve(CHENG_FUSION_PACKAGE_ROOT, text);
  return resolveExistingFile(path, "ignition matrix");
}

function loadMatrixTagEntries(matrixPath, tag, fixtureBaseDir = dirname(matrixPath)) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(matrixPath, "utf8"));
  } catch (error) {
    throw new Error(`invalid ignition matrix JSON ${matrixPath}: ${error.message}`);
  }
  if (!parsed || !Array.isArray(parsed.entries)) throw new Error(`ignition matrix must contain entries[]: ${matrixPath}`);
  const out = [];
  const names = new Set();
  const fixturePaths = new Set();
  for (const entry of parsed.entries) {
    if (!entry || Array.isArray(entry) || typeof entry !== "object") {
      throw new Error(`ignition matrix entries must be objects: ${matrixPath}`);
    }
    if (Object.hasOwn(entry, "planned")) {
      throw new Error(`ignition matrix cannot contain planned entries: ${entry.name || "<unnamed>"}`);
    }
    if (!Array.isArray(entry.tags) || !entry.tags.includes(tag)) continue;
    const label = typeof entry.name === "string" && entry.name.length > 0 ? entry.name : "<unnamed>";
    if (!entry.tags.every((value) => typeof value === "string" && value.length > 0)) {
      throw new Error(`ignition matrix ${tag} entry tags must be non-empty strings: ${label}`);
    }
    if (typeof entry.name !== "string" || entry.name.length === 0
        || typeof entry.fixture !== "string" || entry.fixture.length === 0
        || !Number.isInteger(entry.expectRc) || entry.expectRc < 0 || entry.expectRc > 255) {
      throw new Error(`ignition matrix ${tag} entry requires non-empty name/fixture and integer expectRc in [0, 255]: ${label}`);
    }
    const unsupportedContracts = ["expectCompileBail", "expectCompileRc", "expectStdout", "golden"]
      .filter((key) => Object.hasOwn(entry, key));
    if (unsupportedContracts.length > 0) {
      throw new Error(`ignition matrix ${tag} entry must use only the runtime expectRc contract; unsupported ${unsupportedContracts.join(", ")}: ${entry.name}`);
    }
    if (names.has(entry.name)) throw new Error(`ignition matrix has duplicate ${tag} name: ${entry.name}`);
    names.add(entry.name);
    const fixtureInput = isAbsolute(entry.fixture) ? entry.fixture : resolve(fixtureBaseDir, entry.fixture);
    const fixturePath = resolveExistingFile(fixtureInput, `ignition matrix ${tag} fixture ${entry.name}`);
    if (fixturePaths.has(fixturePath)) throw new Error(`ignition matrix has duplicate ${tag} fixture path: ${fixturePath}`);
    fixturePaths.add(fixturePath);
    out.push({name: entry.name, fixture: fixturePath, expect: entry.expectRc});
  }
  if (out.length === 0) throw new Error(`ignition matrix has no runnable '${tag}' entries: ${matrixPath}`);
  return out;
}

function normalizeRssCapBytes(value, fallback, label) {
  if (value === undefined || value === null) return String(fallback);
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error(`${label} must be a positive integer byte count, got: ${value}`);
  }
  return String(num);
}

function normalizeOutputMaxBytes(value) {
  const num = value === undefined || value === null ? DEFAULT_OUTPUT_MAX_BYTES : Number(value);
  if (!Number.isSafeInteger(num) || num < 65536 || num > 1073741824) {
    throw new Error(`outputMaxBytes must be a safe integer in [65536, 1073741824], got: ${value}`);
  }
  return num;
}

function generateRunId() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
  return `ignite_${stamp}_${randomBytes(3).toString("hex")}`;
}

const GIT_MAX_BUFFER_BYTES = 16 * 1024 * 1024;

function gitTimeoutMs(args) {
  const operation = args[0] === "-C" ? args[2] : args[0];
  if (operation === "clone") return 300_000;
  if (["checkout", "status", "diff", "apply"].includes(operation)) return 120_000;
  return 5_000;
}

function spawnGit(args, label) {
  const timeout = gitTimeoutMs(args);
  const result = spawnSync("git", args, {
    encoding: "utf8",
    env: {...process.env, GIT_OPTIONAL_LOCKS: "0"},
    timeout,
    killSignal: "SIGKILL",
    maxBuffer: GIT_MAX_BUFFER_BYTES,
  });
  if (result.error) {
    const reason = result.error.code === "ETIMEDOUT" ? `timed out after ${timeout}ms` : result.error.message;
    throw new Error(`${label}: git ${args.join(" ")} failed: ${reason}`);
  }
  if (result.signal) throw new Error(`${label}: git ${args.join(" ")} terminated by ${result.signal}`);
  if (result.status === null) throw new Error(`${label}: git ${args.join(" ")} returned no exit status`);
  return result;
}

function runGit(args, label) {
  const result = spawnGit(args, label);
  if (result.status !== 0) {
    throw new Error(`${label}: git ${args.join(" ")} exited ${result.status}: ${(result.stderr || result.stdout || "").trim()}`);
  }
  return String(result.stdout || "").trim();
}

function inspectAblationBase(baseTree) {
  const baseHead = runGit(["-C", baseTree, "rev-parse", "HEAD"], "ablation base HEAD");
  const baseStatus = runGit(["-C", baseTree, "status", "--porcelain=v1", "--untracked-files=all"], "ablation base status");
  if (baseStatus) {
    throw new Error(`baseTree must be clean before ablation; refusing to clone an ambiguous source tree: ${baseTree}\n${baseStatus}`);
  }
  return {baseHead, baseStatus};
}

function pathIsInside(path, parent) {
  const rel = relative(parent, path);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function resolveProspectiveRealPath(value) {
  let cursor = resolveAbsPath(value);
  const missingSegments = [];
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) throw new Error(`no existing ancestor for path: ${value}`);
    missingSegments.unshift(basename(cursor));
    cursor = parent;
  }
  return resolve(realpathSync.native(cursor), ...missingSegments);
}

// Ablation is intentionally performed in a local clone. The caller supplies the exact reverse order;
// dependency-order mistakes fail at `git apply --reverse --check` instead of being silently reordered.
function prepareAblatedTree(baseTree, revertCommits, runDir, baseSnapshot) {
  const ablatedTree = join(runDir, "ablated-tree");
  runGit(["clone", "--quiet", "--no-hardlinks", baseTree, ablatedTree], "ablation clone");
  runGit(["-C", ablatedTree, "checkout", "--quiet", "--detach", baseSnapshot.baseHead], "ablation checkout base HEAD");

  const applied = [];
  for (let index = 0; index < revertCommits.length; index++) {
    const requested = revertCommits[index];
    const commit = runGit(["-C", ablatedTree, "rev-parse", `${requested}^{commit}`], `resolve revert commit ${requested}`);
    const ancestryArgs = ["-C", ablatedTree, "merge-base", "--is-ancestor", commit, baseSnapshot.baseHead];
    const ancestry = spawnGit(ancestryArgs, `check revert commit ancestry ${requested}`);
    if (ancestry.status === 1) throw new Error(`revert commit is not an ancestor of base HEAD ${baseSnapshot.baseHead}: ${requested} (${commit})`);
    if (ancestry.status !== 0) throw new Error(`check revert commit ancestry ${requested}: git ${ancestryArgs.join(" ")} exited ${ancestry.status}: ${(ancestry.stderr || ancestry.stdout || "").trim()}`);
    const parents = runGit(["-C", ablatedTree, "rev-list", "--parents", "-n", "1", commit], `inspect revert commit ${requested}`).split(/\s+/);
    if (parents.length !== 2) throw new Error(`revert commit must have exactly one parent (root and merge commits are rejected): ${requested} (${commit})`);
    const parent = parents[1];
    const patchPath = join(runDir, `revert_${String(index).padStart(3, "0")}_${commit.slice(0, 12)}.patch`);
    runGit(["-C", ablatedTree, "diff", "--binary", `--output=${patchPath}`, parent, commit], `render reverse patch ${requested}`);
    runGit(["-C", ablatedTree, "apply", "--reverse", "--check", patchPath], `check reverse patch ${requested}`);
    runGit(["-C", ablatedTree, "apply", "--reverse", patchPath], `apply reverse patch ${requested}`);
    applied.push({requested, commit, parent, patchPath});
  }

  const cloneStatus = runGit(["-C", ablatedTree, "status", "--porcelain=v1", "--untracked-files=all"], "ablation clone status");
  if (!cloneStatus) throw new Error("ablation produced no tree delta; refusing to run an experiment with no effective change");

  const after = inspectAblationBase(baseTree);
  if (after.baseHead !== baseSnapshot.baseHead || after.baseStatus !== baseSnapshot.baseStatus) {
    throw new Error(`baseTree changed while preparing ablation: ${baseTree}`);
  }
  return {baseTree, baseHead: baseSnapshot.baseHead, ablatedTree, revertCommits: applied, cloneStatus};
}

// 溯源(provenance): 今天的真实事故——两条链条只在共享 .bak 路径下的 seed 内容不同, 就产出了
// 相反的 link 结论, 代价是 4 组 x 19 分钟的错误归因(把 seed 差异误判成了代码/流程差异)。
// 若 journal 里当场就记了 seed sha256, 这个事故会被立刻看穿。sha256HexOfBuffer/sha256File 只在
// JS 侧供 action=start 的即时 MCP 响应用; chain.py 里用 hashlib 独立重算同一套算法(而不是把
// JS 算好的值透传进 CONFIG 直接搬运), 这样若 seed/tree 内容在"MCP 调度时刻"与"chain.py 真正
// 起跑时刻"之间发生了漂移(正是今天这次事故的形状), AtStart 与 AtRun 两个值会当场对不上,
// 而不是被悄悄合并成同一个数字掩盖掉。
function sha256HexOfBuffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function sha256File(path) {
  return `sha256:${sha256HexOfBuffer(readFileSync(path))}`;
}

function walkTreeInputFiles(dir, treeRoot, out) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    let stat;
    try {
      stat = lstatSync(full);
    } catch (error) {
      throw new Error(`cannot inspect Cheng source path ${full}: ${error.message}`);
    }
    if (stat.isSymbolicLink()) throw new Error(`treeRoot snapshot inputs must not contain symlinks: ${full}`);
    if (stat.isDirectory()) walkTreeInputFiles(full, treeRoot, out);
    else if (stat.isFile()) out.push({path: full, relativePath: relative(treeRoot, full)});
    else throw new Error(`treeRoot snapshot inputs must be regular files or directories: ${full}`);
  }
}

function collectTreeInputFiles(treeRoot) {
  const srcDir = join(treeRoot, "src");
  if (!existsSync(srcDir)) throw new Error(`treeRoot src directory not found: ${srcDir}`);
  const srcStat = lstatSync(srcDir);
  if (srcStat.isSymbolicLink() || !srcStat.isDirectory()) throw new Error(`treeRoot src must be a real directory: ${srcDir}`);

  const files = [];
  walkTreeInputFiles(srcDir, treeRoot, files);
  for (const name of ["cheng-package.toml", "cheng.lock.toml"]) {
    const path = join(treeRoot, name);
    if (!existsSync(path)) {
      if (name === "cheng-package.toml") throw new Error(`treeRoot ${name} not found: ${path}`);
      continue;
    }
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`treeRoot ${name} must be a regular file: ${path}`);
    if (stat.size === 0) throw new Error(`treeRoot ${name} is empty: ${path}`);
    files.push({path, relativePath: name});
  }
  files.sort((left, right) => Buffer.compare(Buffer.from(left.relativePath, "utf8"), Buffer.from(right.relativePath, "utf8")));
  return files;
}

// treeRoot snapshot hash covers the complete package surface available to the runner: every
// regular file below src plus the package manifest and optional Cheng lockfile. Length-framed
// UTF-8 paths avoid delimiter collisions and match tree_src_hash() in the generated Python.
function computeTreeSrcHash(treeRoot) {
  const digest = createHash("sha256");
  for (const file of collectTreeInputFiles(treeRoot)) {
    const pathBytes = Buffer.from(file.relativePath, "utf8");
    const pathLength = Buffer.alloc(8);
    pathLength.writeBigUInt64BE(BigInt(pathBytes.length));
    digest.update(pathLength);
    digest.update(pathBytes);
    digest.update(createHash("sha256").update(readFileSync(file.path)).digest());
  }
  return `sha256:${digest.digest("hex")}`;
}

function snapshotFile(sourceInput, destination, label, executable = false) {
  const source = resolveExistingFile(sourceInput, label, executable);
  const sourceStat = statSync(source);
  const before = sha256File(source);
  mkdirSync(dirname(destination), {recursive: true});
  copyFileSync(source, destination, fsConstants.COPYFILE_EXCL);
  chmodSync(destination, sourceStat.mode & 0o777);
  const snapshot = resolveExistingFile(destination, `${label} snapshot`, executable);
  const after = sha256File(source);
  const copied = sha256File(snapshot);
  const snapshotStat = statSync(snapshot);
  if (before !== after || before !== copied) throw new Error(`${label} changed while creating its immutable snapshot: ${source}`);
  if (sourceStat.dev === snapshotStat.dev && sourceStat.ino === snapshotStat.ino) {
    throw new Error(`${label} snapshot unexpectedly shares an inode with its source: ${source}`);
  }
  return {source, path: snapshot, sha256: copied};
}

function snapshotTreeInputs(sourceTree, snapshotTree) {
  const before = computeTreeSrcHash(sourceTree);
  mkdirSync(snapshotTree);
  cpSync(join(sourceTree, "src"), join(snapshotTree, "src"), {recursive: true, dereference: false, errorOnExist: true, force: false});
  for (const name of ["cheng-package.toml", "cheng.lock.toml"]) {
    const source = join(sourceTree, name);
    if (!existsSync(source)) continue;
    copyFileSync(source, join(snapshotTree, name), fsConstants.COPYFILE_EXCL);
    chmodSync(join(snapshotTree, name), statSync(source).mode & 0o777);
  }
  const after = computeTreeSrcHash(sourceTree);
  const copied = computeTreeSrcHash(snapshotTree);
  if (before !== after || before !== copied) throw new Error(`treeRoot changed while creating its immutable snapshot: ${sourceTree}`);

  const sourceFiles = new Map(collectTreeInputFiles(sourceTree).map((entry) => [entry.relativePath, entry.path]));
  for (const snapshotEntry of collectTreeInputFiles(snapshotTree)) {
    const sourcePath = sourceFiles.get(snapshotEntry.relativePath);
    if (!sourcePath) throw new Error(`treeRoot snapshot contains an unexpected file: ${snapshotEntry.relativePath}`);
    const sourceStat = statSync(sourcePath);
    const snapshotStat = statSync(snapshotEntry.path);
    if (sourceStat.dev === snapshotStat.dev && sourceStat.ino === snapshotStat.ino) {
      throw new Error(`treeRoot snapshot unexpectedly shares an inode with its source: ${snapshotEntry.relativePath}`);
    }
  }
  return {source: sourceTree, path: snapshotTree, sha256: copied};
}

// 整条链的实体跑在一个自包含 python3 脚本里(而不是 bash), 原因: 每阶段结果都要落成
// 结构化 JSON 追加进 journal.jsonl。CONFIG 先编码为 base64(JSON) 再嵌入脚本，用户路径
// 即使含 Python 引号也不可能截断字面量或注入代码。
function renderChainPythonScript(config) {
  const configBase64 = Buffer.from(JSON.stringify(config), "utf8").toString("base64");
  return `#!/usr/bin/env python3
import base64, fcntl, hashlib, json, os, re, selectors, shlex, signal, stat, subprocess, sys, tempfile, time, traceback

CONFIG = json.loads(base64.b64decode("${configBase64}").decode("utf8"))

W = CONFIG["workDir"]
TREE = CONFIG["treeRoot"]
JOURNAL = os.path.join(W, "journal.jsonl")
DONE = os.path.join(W, "done.json")
COMPLETION_CLAIM = os.path.join(W, "completion.claim.json")
RUN_LOCK = os.path.join(W, "chain.lock")
PIDFILE = os.path.join(W, "chain.pid")
RSS_CAP = str(CONFIG["rssCapBytes"])
GEN3_RSS_CAP = str(CONFIG["gen3RssCapBytes"])
LAST_STAGE = None
RUN_COMMAND_INDEX = 0
CURRENT_CHILD_PGID = None
OUTPUT_TAIL_BYTES = 65536
OUTPUT_MAX_BYTES = int(CONFIG["outputMaxBytes"])
ZC_CAPTURE_BYTES = 4 * 1024 * 1024
FORENSICS_DIR = os.path.join(W, "forensics")
TIME_ABNORMAL_SUFFIX = "time: command terminated abnormally\\n"

class SnapshotDriftError(RuntimeError):
    pass

def forward_termination(signum, _frame):
    pgid = CURRENT_CHILD_PGID
    if pgid is not None:
        try:
            os.killpg(pgid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    raise SystemExit(128 + signum)

signal.signal(signal.SIGTERM, forward_termination)
signal.signal(signal.SIGINT, forward_termination)

def append_record(rec):
    with open(JOURNAL, "a") as f:
        f.write(json.dumps(rec) + "\\n")
        f.flush()
        os.fsync(f.fileno())

def log(stage, **fields):
    global LAST_STAGE
    rec = {"stage": stage, "ts": time.time()}
    rec.update(fields)
    append_record(rec)
    LAST_STAGE = stage
    print("[chain] stage=%s" % stage, flush=True)

def complete_once(verdict, error=None):
    rec = {"stage": "done", "ts": time.time(), "pid": os.getpid(), "verdict": verdict, "lastStage": LAST_STAGE}
    if error is not None:
        rec["error"] = error
    # O_EXCL is the permanent exactly-once claim. It is intentionally retained after success so a
    # second invocation can never append another done record or replace the sentinel.
    claim_fd = os.open(COMPLETION_CLAIM, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
    with os.fdopen(claim_fd, "w") as f:
        json.dump(rec, f)
        f.write("\\n")
        f.flush()
        os.fsync(f.fileno())
    tmp = DONE + ".tmp.%d" % os.getpid()
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(rec, f)
            f.write("\\n")
            f.flush()
            os.fsync(f.fileno())
        append_record(rec)
        # link is an atomic create-if-absent commit; unlike replace it can never overwrite a prior
        # sentinel. The permanent claim prevents any later invocation from reaching this point.
        os.link(tmp, DONE)
        os.remove(tmp)
        dir_fd = os.open(W, os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
    except BaseException:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise
    print("[chain] stage=done", flush=True)

def cheng_env(rss_cap=None):
    env = dict(os.environ)
    env["CHENG_PROCESS_MAX_RSS_BYTES"] = rss_cap or RSS_CAP
    env.pop("CHENG_NO_BACKEND_DRIVER_HANDOFF", None)
    env.pop("CHENG_REQUIRE_PURE_PROVIDERS", None)
    return env

# 逐站 RSS 峰值(刀A): darwin \`/usr/bin/time -l -o <file>\` 把 rusage(含 maximum resident set
# size, 字节)写进独立文件(不混进被计时命令自身的 stdout/stderr), 一次子进程一份用完即删。
# 取不到(文件空/无该行/进程被 timeout 强杀导致 time 自己也没来得及写)如实 null+原因, 不补 0 不估算。
def parse_peak_rss(path):
    try:
        text = open(path).read()
    except OSError as e:
        return None, "rss probe file unreadable: %s" % e
    match = re.search(r"^\\s*(\\d+)\\s+maximum resident set size", text, re.M)
    if not match:
        return None, "no 'maximum resident set size' line in /usr/bin/time -l output (%s)" % ("file empty" if not text.strip() else "unexpected format")
    return int(match.group(1)), None

# rc<0(Python exec 的信号约定)或 rc>=128(部分 shell/wrapper 的 128+signum 约定, 两种都防,
# 见 feedback_exit_code_signal_trap 教训)时把信号号解成名字; 非信号退出返回 None。
def classify_signal(rc):
    if rc is None:
        return None
    n = None
    if rc < 0:
        n = -rc
    elif rc >= 128:
        n = rc - 128
    if not n:
        return None
    try:
        return signal.Signals(n).name
    except ValueError:
        return "SIG_UNKNOWN_%d" % n

# 信号死亡自动取证(刀B): 只在 (a) 信号是 SIGSEGV/SIGBUS/SIGILL 且 (b) 崩的是 chain 自产二进制
# (DRV/GEN2 本身, 即这次调用的 driver 自己崩了, 不是它编译产物运行时崩)才自动起 lldb one-shot
# 复现(60s 超时, run -> bt 12 -> disassemble -c 8 --pc -> quit); lldb 失败不阻断链, 原因记 journal。
def run_lldb_one_shot(binary, run_args, out_path, env, timeout_sec=60):
    run_line = ("run " + " ".join(shlex.quote(a) for a in run_args)) if run_args else "run"
    # -o 是无条件顺序命令, 但 debuggee 在 run 里崩溃后 lldb 不会继续处理后面排队的 -o 命令
    # (实测: -o 版本 bt/disassemble/quit 全部静默丢失); -k(--one-line-on-crash) 才会在崩溃停住后
    # 触发, 与 cheng_toolkit_m9000.ts 的 runLldbBatch 同一手法。
    lldb_args = ["lldb", "-b", "-o", run_line, "-k", "bt 12", "-k", "disassemble -c 8 --pc", "-k", "quit", binary]
    p = subprocess.Popen(lldb_args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env, cwd=TREE, start_new_session=True)
    timed_out = False
    try:
        out, err = p.communicate(timeout=timeout_sec)
    except subprocess.TimeoutExpired:
        timed_out = True
        try:
            os.killpg(p.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        out, err = p.communicate()
    try:
        os.makedirs(FORENSICS_DIR, exist_ok=True)
        with open(out_path, "w") as f:
            f.write(out)
            f.write(err)
            if timed_out:
                f.write("\\n[chain] lldb one-shot timed out after %ds\\n" % timeout_sec)
    except OSError as e:
        return {"ok": False, "path": None, "reason": "failed to write forensics file: %s" % e}
    return {"ok": True, "path": out_path, "timedOut": timed_out}

def maybe_capture_forensics(stage, fixture_label, driver, run_args, signal_name, env):
    if signal_name not in ("SIGSEGV", "SIGBUS", "SIGILL"):
        return None
    if os.path.basename(driver) not in ("DRV", "GEN2"):
        return None
    out_path = os.path.join(FORENSICS_DIR, "%s_%s.lldb.txt" % (stage, fixture_label))
    try:
        return run_lldb_one_shot(driver, run_args, out_path, env, timeout_sec=60)
    except Exception as e:
        return {"ok": False, "path": None, "reason": "lldb invocation raised: %s" % e}

# probe/terminal/oracle 各站 journal 行里 compile/run 两段各自的 peakRssBytes/peakRssError/signal
# 字段拼装(前缀区分 compile 段与 run 段), forensics 只在真触发时才带上(不给每条正常记录添 null 噪音)。
def rss_signal_fields(result, prefix):
    def key(name):
        return (prefix + name[0].upper() + name[1:]) if prefix else name
    fields = {
        key("peakRssBytes"): result.get("peakRssBytes"),
        key("peakRssError"): result.get("peakRssError"),
        key("signal"): result.get("signal"),
    }
    if result.get("forensics") is not None:
        fields[key("forensics")] = result["forensics"]
    return fields

def materialized_executable(path):
    try:
        st = os.stat(path, follow_symlinks=False)
        return stat.S_ISREG(st.st_mode) and st.st_size > 0 and os.access(path, os.X_OK)
    except OSError:
        return False

def read_output_tail(path):
    size = os.path.getsize(path)
    with open(path, "rb") as f:
        if size > OUTPUT_TAIL_BYTES:
            f.seek(size - OUTPUT_TAIL_BYTES)
        data = f.read(OUTPUT_TAIL_BYTES)
    return data.decode("utf8", "replace"), size > OUTPUT_TAIL_BYTES

def collect_zc_text(paths):
    captured = []
    captured_bytes = 0

    def capture_line(raw_line):
        nonlocal captured_bytes
        if not raw_line.startswith(b"ZC_NOT_READY"):
            return
        if len(raw_line) > OUTPUT_TAIL_BYTES:
            raise RuntimeError("ZC diagnostic line exceeded %d bytes" % OUTPUT_TAIL_BYTES)
        captured_bytes += len(raw_line)
        if captured_bytes > ZC_CAPTURE_BYTES:
            raise RuntimeError("ZC diagnostics exceeded %d bytes" % ZC_CAPTURE_BYTES)
        captured.append(raw_line.decode("utf8", "strict"))

    for path in paths:
        pending = b""
        discarding_long_non_zc_line = False
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                cursor = 0
                while cursor < len(chunk):
                    if discarding_long_non_zc_line:
                        newline = chunk.find(b"\\n", cursor)
                        if newline < 0:
                            cursor = len(chunk)
                            continue
                        discarding_long_non_zc_line = False
                        cursor = newline + 1
                        continue
                    newline = chunk.find(b"\\n", cursor)
                    if newline >= 0:
                        capture_line(pending + chunk[cursor:newline + 1])
                        pending = b""
                        cursor = newline + 1
                        continue
                    pending += chunk[cursor:]
                    cursor = len(chunk)
                    if len(pending) > OUTPUT_TAIL_BYTES:
                        if pending.startswith(b"ZC_NOT_READY"):
                            raise RuntimeError("ZC diagnostic line exceeded %d bytes" % OUTPUT_TAIL_BYTES)
                        pending = b""
                        discarding_long_non_zc_line = True
            if pending and not discarding_long_non_zc_line:
                capture_line(pending)
    return "".join(captured)

def close_selector_streams(selector):
    if selector is None:
        return
    selector_map = selector.get_map()
    if selector_map is None:
        return
    for key in list(selector_map.values()):
        try:
            selector.unregister(key.fileobj)
        except BaseException:
            pass
        try:
            key.fileobj.close()
        except BaseException:
            pass
    selector.close()

def run_cmd(args, timeout, rss_cap=None):
    global RUN_COMMAND_INDEX, CURRENT_CHILD_PGID
    assert_snapshot_provenance()
    command_index = RUN_COMMAND_INDEX
    RUN_COMMAND_INDEX += 1
    stdout_path = os.path.join(W, "command_%03d.stdout.log" % command_index)
    stderr_path = os.path.join(W, "command_%03d.stderr.log" % command_index)
    rss_fd, rss_path = tempfile.mkstemp(prefix="rss_", dir=W)
    os.close(rss_fd)
    t0 = time.time()
    p = None
    timed_out = False
    output_overflow = False
    selector = None
    try:
        with open(stdout_path, "xb") as stdout_file, open(stderr_path, "xb") as stderr_file:
            p = subprocess.Popen(["/usr/bin/time", "-l", "-o", rss_path] + args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                 env=cheng_env(rss_cap), cwd=TREE, start_new_session=True)
            CURRENT_CHILD_PGID = p.pid
            selector = selectors.DefaultSelector()
            selector.register(p.stdout, selectors.EVENT_READ, stdout_file)
            selector.register(p.stderr, selectors.EVENT_READ, stderr_file)
            deadline = time.monotonic() + timeout
            kill_deadline = None
            output_bytes = 0
            try:
                while selector.get_map():
                    now = time.monotonic()
                    if kill_deadline is None and now >= deadline:
                        timed_out = True
                        kill_deadline = now + 5
                        try:
                            os.killpg(p.pid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                    if kill_deadline is not None and now >= kill_deadline:
                        for key in list(selector.get_map().values()):
                            selector.unregister(key.fileobj)
                            key.fileobj.close()
                        break
                    wait_until = kill_deadline if kill_deadline is not None else deadline
                    events = selector.select(max(0, wait_until - now))
                    for key, _mask in events:
                        chunk = os.read(key.fileobj.fileno(), 65536)
                        if not chunk:
                            selector.unregister(key.fileobj)
                            key.fileobj.close()
                            continue
                        remaining = OUTPUT_MAX_BYTES - output_bytes
                        if remaining > 0:
                            key.data.write(chunk[:remaining])
                            output_bytes += min(len(chunk), remaining)
                        if len(chunk) > remaining and not output_overflow:
                            output_overflow = True
                            kill_deadline = time.monotonic() + 5
                            try:
                                os.killpg(p.pid, signal.SIGKILL)
                            except ProcessLookupError:
                                pass
                if p.poll() is None and kill_deadline is None:
                    try:
                        p.wait(timeout=max(0.001, deadline - time.monotonic()))
                    except subprocess.TimeoutExpired:
                        timed_out = True
                        kill_deadline = time.monotonic() + 5
                        try:
                            os.killpg(p.pid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                if p.poll() is None:
                    try:
                        p.wait(timeout=max(0.001, (kill_deadline or time.monotonic()) - time.monotonic()))
                    except subprocess.TimeoutExpired:
                        try:
                            os.killpg(p.pid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                        try:
                            p.wait(timeout=1)
                        except subprocess.TimeoutExpired as exc:
                            raise RuntimeError("subprocess group did not terminate after SIGKILL") from exc
            finally:
                CURRENT_CHILD_PGID = None
                close_selector_streams(selector)
            stdout_file.flush()
            stderr_file.flush()
            os.fsync(stdout_file.fileno())
            os.fsync(stderr_file.fileno())
        stdout_tail, stdout_truncated = read_output_tail(stdout_path)
        stderr_tail, stderr_truncated = read_output_tail(stderr_path)
        peak_rss, rss_err = parse_peak_rss(rss_path)
        try:
            os.remove(rss_path)
        except OSError:
            pass
        if stderr_tail.endswith(TIME_ABNORMAL_SUFFIX):
            stderr_tail = stderr_tail[:-len(TIME_ABNORMAL_SUFFIX)]
        if timed_out:
            stderr_tail += "\\n[chain] timed out after %dms" % int(timeout * 1000)
        if output_overflow:
            stderr_tail += "\\n[chain] combined output exceeded %d bytes; process group killed" % OUTPUT_MAX_BYTES
        rc = None if (timed_out or output_overflow) else p.returncode
        result = {"rc": rc,
                  "stdout": stdout_tail, "stderr": stderr_tail,
                  "stdoutLog": stdout_path, "stderrLog": stderr_path,
                  "stdoutTruncated": stdout_truncated, "stderrTruncated": stderr_truncated,
                  "zcText": collect_zc_text([stdout_path, stderr_path]),
                  "wallMs": int((time.time() - t0) * 1000),
                  "timedOut": timed_out, "outputOverflow": output_overflow,
                  "peakRssBytes": peak_rss,
                  "peakRssError": rss_err if (timed_out or output_overflow) else (rss_err or None),
                  "signal": classify_signal(rc)}
        assert_snapshot_provenance()
        return result
    except BaseException:
        CURRENT_CHILD_PGID = None
        if p is not None and p.poll() is None:
            try:
                os.killpg(p.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        close_selector_streams(selector)
        if p is not None and p.poll() is None:
            try:
                p.wait(timeout=5)
            except BaseException:
                pass
        try:
            os.remove(rss_path)
        except OSError:
            pass
        raise

def compile_fixture(driver, src, out, timeout=300, rss_cap=None, stage="compile", fixture_label=None):
    if os.path.lexists(out):
        raise RuntimeError("refusing to reuse pre-existing compiler output: %s" % out)
    args = [driver, "system-link-exec", "--root:%s" % TREE, "--in:%s" % src, "--emit:exe", "--link-providers", "--target:arm64-apple-darwin", "--out:%s" % out]
    result = run_cmd(args, timeout, rss_cap=rss_cap)
    if result.get("signal"):
        label = fixture_label or os.path.basename(src)
        forensics = maybe_capture_forensics(stage, label, driver, args[1:], result["signal"], cheng_env(rss_cap))
        if forensics is not None:
            result["forensics"] = forensics
    return result

def run_bin(path, timeout=15):
    if not materialized_executable(path):
        raise RuntimeError("refusing to run a non-materialized executable: %s" % path)
    return run_cmd([path], timeout)

# 溯源哈希: runner 只读取 runDir/inputs 下的独立副本，并在每个 subprocess 前后重算。
def sha256_digest(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.digest()

def sha256_hex(path):
    return sha256_digest(path).hex()

def sha256_tag(path):
    return "sha256:" + sha256_hex(path)

def tree_src_hash(tree_root):
    src_dir = os.path.join(tree_root, "src")
    if not os.path.isdir(src_dir) or os.path.islink(src_dir):
        raise RuntimeError("treeRoot src must be a real directory: %s" % src_dir)
    files = []
    for dirpath, dirnames, filenames in os.walk(src_dir, followlinks=False):
        for name in dirnames:
            full = os.path.join(dirpath, name)
            if os.path.islink(full):
                raise RuntimeError("treeRoot snapshot inputs must not contain symlinks: %s" % full)
        for name in filenames:
            full = os.path.join(dirpath, name)
            st = os.stat(full, follow_symlinks=False)
            if not stat.S_ISREG(st.st_mode):
                raise RuntimeError("treeRoot snapshot inputs must be regular files: %s" % full)
            files.append((os.path.relpath(full, tree_root), full))
    for name in ["cheng-package.toml", "cheng.lock.toml"]:
        full = os.path.join(tree_root, name)
        if not os.path.exists(full):
            if name == "cheng-package.toml":
                raise RuntimeError("treeRoot cheng-package.toml not found: %s" % full)
            continue
        st = os.stat(full, follow_symlinks=False)
        if not stat.S_ISREG(st.st_mode) or st.st_size == 0:
            raise RuntimeError("treeRoot package metadata must be a non-empty regular file: %s" % full)
        files.append((name, full))
    files.sort(key=lambda item: item[0].encode("utf8"))
    digest = hashlib.sha256()
    for rel, full in files:
        rel_bytes = rel.encode("utf8")
        digest.update(len(rel_bytes).to_bytes(8, "big"))
        digest.update(rel_bytes)
        digest.update(sha256_digest(full))
    return "sha256:" + digest.hexdigest()

def snapshot_file_state(item):
    actual = None
    error = None
    try:
        st = os.stat(item["path"], follow_symlinks=False)
        if not stat.S_ISREG(st.st_mode) or st.st_size == 0:
            raise RuntimeError("not a non-empty regular file")
        actual = sha256_tag(item["path"])
    except BaseException as exc:
        error = "%s: %s" % (type(exc).__name__, exc)
    return {"kind": item["kind"], "name": item["name"], "path": item["path"],
            "sha256AtStart": item["sha256"], "sha256AtRun": actual,
            "match": actual == item["sha256"], "error": error}

def current_snapshot_provenance():
    tree_actual = None
    tree_error = None
    try:
        tree_actual = tree_src_hash(TREE)
    except BaseException as exc:
        tree_error = "%s: %s" % (type(exc).__name__, exc)
    file_states = [snapshot_file_state(item) for item in CONFIG["inputFiles"]]
    return {"treeActual": tree_actual, "treeError": tree_error,
            "treeMatch": tree_actual == CONFIG["treeSrcHash"],
            "files": file_states, "filesMatch": all(item["match"] for item in file_states)}

def assert_snapshot_provenance():
    state = current_snapshot_provenance()
    if not state["treeMatch"] or not state["filesMatch"]:
        raise SnapshotDriftError("immutable ignition input snapshot changed: %s" % json.dumps(state, sort_keys=True))
    return state

CANONICAL_UINT = r"(?:0|[1-9][0-9]*)"
CANONICAL_INT = r"(?:0|-?[1-9][0-9]*)"
ZC_TOTAL_RE = re.compile(r"^ZC_NOT_READY_TOTAL count=(%s)$" % CANONICAL_UINT)
ZC_LINE_RE = re.compile(
    r"^ZC_NOT_READY idx=(%s)/(%s) function=(\\S+) body_kind=(\\S+) detail=(\\S*) "
    r"line=(%s) fz_kind=(%s) stmt_kind=(%s) bail=(%s) slot_diag=(\\S*)$" %
    (CANONICAL_UINT, CANONICAL_UINT, CANONICAL_UINT, CANONICAL_UINT, CANONICAL_UINT, CANONICAL_INT)
)

def parse_zc(text):
    entries = []
    totals = []
    for line in text.splitlines():
        total_match = ZC_TOTAL_RE.fullmatch(line)
        if total_match:
            totals.append(int(total_match.group(1)))
            continue
        entry_match = ZC_LINE_RE.fullmatch(line)
        if not entry_match:
            raise RuntimeError("malformed ZC_NOT_READY protocol row: %r" % line)
        entries.append({
            "idx": int(entry_match.group(1)),
            "denominator": int(entry_match.group(2)),
            "function": entry_match.group(3),
            "bodyKind": entry_match.group(4),
            "bail": int(entry_match.group(8)),
        })
    if len(totals) != 1:
        raise RuntimeError("ZC_NOT_READY protocol requires exactly one TOTAL row, got %d" % len(totals))
    entry_count = len(entries)
    if totals[0] != entry_count:
        raise RuntimeError("ZC_NOT_READY TOTAL=%d disagrees with entry count=%d" % (totals[0], entry_count))
    for expected_idx, entry in enumerate(entries):
        if entry["idx"] != expected_idx or entry["denominator"] != entry_count:
            raise RuntimeError(
                "ZC_NOT_READY idx contract violation at row %d: got %d/%d, expected %d/%d" %
                (expected_idx, entry["idx"], entry["denominator"], expected_idx, entry_count)
            )
    return entry_count, [
        {"function": entry["function"], "bodyKind": entry["bodyKind"], "bail": entry["bail"]}
        for entry in entries
    ]

def main():
    provenance = current_snapshot_provenance()
    seed_state = next(item for item in provenance["files"] if item["kind"] == "seed")
    log("provenance",
        seed=CONFIG["seed"], seedSha256AtStart=CONFIG["seedSha256"], seedSha256AtRun=seed_state["sha256AtRun"],
        seedShaMatch=seed_state["match"],
        treeRoot=TREE, treeSrcHashAtStart=CONFIG["treeSrcHash"], treeSrcHashAtRun=provenance["treeActual"],
        treeSrcHashMatch=provenance["treeMatch"], treeError=provenance["treeError"],
        inputManifestSha256=CONFIG["inputManifestSha256"], inputFiles=provenance["files"],
        inputFilesMatch=provenance["filesMatch"], stages=CONFIG["stages"], ablation=CONFIG.get("ablation"))
    if not provenance["treeMatch"] or not provenance["filesMatch"]:
        return "ABORTED_PROVENANCE_MISMATCH"

    drv_out = os.path.join(W, "DRV")
    r = compile_fixture(CONFIG["seed"], CONFIG["driverSrc"], drv_out, timeout=300, stage="drvBake", fixture_label=os.path.basename(CONFIG["driverSrc"]))
    drv_ok = r["rc"] == 0 and materialized_executable(drv_out)
    log("drvBake", rc=r["rc"], wallMs=r["wallMs"], ok=drv_ok, timedOut=r["timedOut"], outputOverflow=r["outputOverflow"],
        stdoutLog=r["stdoutLog"], stderrLog=r["stderrLog"], stderrTail=r["stderr"][-1500:],
        sha256=(sha256_tag(drv_out) if drv_ok else None), **rss_signal_fields(r, ""))
    if not drv_ok:
        return "ABORTED_DRV_BAKE_FAILED"

    t0 = time.time()
    probe_results = []
    for item_index, item in enumerate(CONFIG["probes"]):
        outp = os.path.join(W, "p_%03d.exe" % item_index)
        cr = compile_fixture(drv_out, item["fixture"], outp, timeout=300, stage="probes", fixture_label=item["name"])
        if cr["rc"] != 0 or not materialized_executable(outp):
            probe_results.append({"name": item["name"], "rc": None, "expect": item["expect"], "pass": False, "note": "compile failed",
                                  "compileTimedOut": cr["timedOut"], "compileOutputOverflow": cr["outputOverflow"],
                                  "compileStdoutLog": cr["stdoutLog"], "compileStderrLog": cr["stderrLog"], "compileStderrTail": cr["stderr"][-800:],
                                  **rss_signal_fields(cr, "compile")})
            continue
        rr = run_bin(outp, 10)
        probe_results.append({"name": item["name"], "rc": rr["rc"], "expect": item["expect"], "pass": rr["rc"] == item["expect"],
                              "timedOut": rr["timedOut"], "outputOverflow": rr["outputOverflow"],
                              "stdoutLog": rr["stdoutLog"], "stderrLog": rr["stderrLog"],
                              **rss_signal_fields(cr, "compile"), **rss_signal_fields(rr, "run")})
    pass_count = sum(1 for x in probe_results if x["pass"])
    log("probes", wallMs=int((time.time() - t0) * 1000), passCount=pass_count, total=len(probe_results), probes=probe_results)

    if not CONFIG["stages"]["gen2"]:
        probes_gate = "PASS" if pass_count == len(probe_results) else "FAIL"
        prefix = "PROBES_ONLY_COMPLETE" if probes_gate == "PASS" else "PROBES_ONLY_COMPLETE_WITH_FAILURES"
        return "%s_gen2=SKIPPED_probes=%s_terminal=SKIPPED_oracle=SKIPPED_gen3=SKIPPED" % (prefix, probes_gate)

    gen2_out = os.path.join(W, "GEN2")
    r2 = compile_fixture(drv_out, CONFIG["driverSrc"], gen2_out, timeout=1800, stage="gen2Bake", fixture_label=os.path.basename(CONFIG["driverSrc"]))
    gen2_ok = r2["rc"] == 0 and materialized_executable(gen2_out)
    if gen2_ok:
        zc_total, bails = parse_zc(r2["zcText"])
    else:
        # bake died before/without the ZC enumeration section (e.g. object writer
        # failure): verdict must be the honest ABORTED_GEN2_BAKE_FAILED with raw
        # stderr, not a harness RuntimeError crash. Strict protocol stays enforced
        # on the rc==0 path.
        try:
            zc_total, bails = parse_zc(r2["zcText"])
        except RuntimeError:
            zc_total, bails = None, []
    log("gen2Bake", rc=r2["rc"], wallMs=r2["wallMs"], zcTotal=zc_total, bails=bails, ok=gen2_ok,
        timedOut=r2["timedOut"], outputOverflow=r2["outputOverflow"], stdoutLog=r2["stdoutLog"], stderrLog=r2["stderrLog"],
        stderrTail=r2["stderr"][-1500:],
        sha256=(sha256_tag(gen2_out) if gen2_ok else None), **rss_signal_fields(r2, ""))
    if not gen2_ok:
        return "ABORTED_GEN2_BAKE_FAILED"

    terminal_gate = "SKIPPED"
    if CONFIG["stages"]["terminal"]:
        t0 = time.time()
        term_results = []
        for item_index, item in enumerate(CONFIG["terminal"]):
            outp = os.path.join(W, "t_%03d.exe" % item_index)
            cr = compile_fixture(gen2_out, item["fixture"], outp, timeout=300, stage="terminal", fixture_label=item["name"])
            if cr["rc"] != 0 or not materialized_executable(outp):
                term_results.append({"name": item["name"], "compileRc": cr["rc"], "runRc": None, "expect": item["expect"], "pass": False,
                                     "compileTimedOut": cr["timedOut"], "compileOutputOverflow": cr["outputOverflow"],
                                     "compileStdoutLog": cr["stdoutLog"], "compileStderrLog": cr["stderrLog"], "stderrTail": cr["stderr"][-800:],
                                     **rss_signal_fields(cr, "compile")})
                continue
            rr = run_bin(outp, 15)
            term_results.append({"name": item["name"], "compileRc": cr["rc"], "runRc": rr["rc"], "expect": item["expect"], "pass": rr["rc"] == item["expect"],
                                 "timedOut": rr["timedOut"], "outputOverflow": rr["outputOverflow"],
                                 "stdoutLog": rr["stdoutLog"], "stderrLog": rr["stderrLog"], "stderrTail": rr["stderr"][-800:],
                                 **rss_signal_fields(cr, "compile"), **rss_signal_fields(rr, "run")})
        terminal_gate = "PASS" if all(x["pass"] for x in term_results) else "FAIL"
        log("terminal", wallMs=int((time.time() - t0) * 1000), passCount=sum(1 for x in term_results if x["pass"]), total=len(term_results), terminal=term_results)

    oracle_gate = "SKIPPED"
    if CONFIG["stages"]["oracle"]:
        t0 = time.time()
        oracle_results = []
        for item_index, item in enumerate(CONFIG["oracle"]):
            outp = os.path.join(W, "o_%03d.exe" % item_index)
            cr = compile_fixture(gen2_out, item["fixture"], outp, timeout=300, stage="oracle", fixture_label=item["name"])
            if cr["rc"] != 0 or not materialized_executable(outp):
                oracle_results.append({"name": item["name"], "rc": None, "expect": item["expect"], "pass": False, "note": "compile failed",
                                       "compileTimedOut": cr["timedOut"], "compileOutputOverflow": cr["outputOverflow"],
                                       "compileStdoutLog": cr["stdoutLog"], "compileStderrLog": cr["stderrLog"], "compileStderrTail": cr["stderr"][-800:],
                                       **rss_signal_fields(cr, "compile")})
                continue
            rr = run_bin(outp, 10)
            oracle_results.append({"name": item["name"], "rc": rr["rc"], "expect": item["expect"], "pass": rr["rc"] == item["expect"],
                                   "timedOut": rr["timedOut"], "outputOverflow": rr["outputOverflow"],
                                   "stdoutLog": rr["stdoutLog"], "stderrLog": rr["stderrLog"],
                                   **rss_signal_fields(cr, "compile"), **rss_signal_fields(rr, "run")})
        oracle_gate = "PASS" if all(x["pass"] for x in oracle_results) else "FAIL"
        log("oracle", wallMs=int((time.time() - t0) * 1000), passCount=sum(1 for x in oracle_results if x["pass"]), total=len(oracle_results), oracle=oracle_results)

    gen3_gate = "SKIPPED"
    if CONFIG["stages"]["gen3"]:
        if not CONFIG["maskedCmpPath"]:
            raise RuntimeError("gen3 requested but tools/macho_masked_cmp.py is unavailable")
        else:
            gen3_out = os.path.join(W, "GEN3")
            r3 = compile_fixture(gen2_out, CONFIG["driverSrc"], gen3_out, timeout=1800, rss_cap=GEN3_RSS_CAP, stage="gen3", fixture_label=os.path.basename(CONFIG["driverSrc"]))
            gen3_ok = r3["rc"] == 0 and materialized_executable(gen3_out)
            if gen3_ok:
                cmp_r = run_cmd(["python3", CONFIG["maskedCmpPath"], gen2_out, gen3_out], timeout=60)
                # macho_masked_cmp.py has a closed result contract: 0 means masked
                # identical, 1 means a real byte mismatch. Any other normal exit is a
                # comparator failure, not evidence of a fixed-point mismatch.
                compare_failed = (cmp_r["timedOut"] or cmp_r["outputOverflow"] or cmp_r["rc"] is None
                                  or cmp_r["rc"] not in (0, 1))
                masked_identical = not compare_failed and cmp_r["rc"] == 0
                gen3_gate = "PASS" if masked_identical else "FAIL"
                log("gen3", bakeRc=r3["rc"], wallMs=r3["wallMs"], bakeOutputOverflow=r3["outputOverflow"],
                    bakeStdoutLog=r3["stdoutLog"], bakeStderrLog=r3["stderrLog"],
                    compareRc=cmp_r["rc"], compareTimedOut=cmp_r["timedOut"], compareOutputOverflow=cmp_r["outputOverflow"],
                    compareStdoutLog=cmp_r["stdoutLog"], compareStderrLog=cmp_r["stderrLog"],
                    ok=masked_identical, maskedIdentical=masked_identical, maskedOutput=(cmp_r["stdout"] + cmp_r["stderr"]).strip(), **rss_signal_fields(r3, ""))
                if compare_failed:
                    return "ABORTED_GEN3_COMPARE_FAILED"
                if not masked_identical:
                    return "ABORTED_GEN3_FIXED_POINT_MISMATCH"
            else:
                log("gen3", bakeRc=r3["rc"], wallMs=r3["wallMs"], ok=False, maskedIdentical=None,
                    timedOut=r3["timedOut"], outputOverflow=r3["outputOverflow"],
                    stdoutLog=r3["stdoutLog"], stderrLog=r3["stderrLog"],
                    note="gen3 bake failed", stderrTail=r3["stderr"][-1500:], stdoutTail=r3["stdout"][-1500:], **rss_signal_fields(r3, ""))
                return "ABORTED_GEN3_BAKE_FAILED"

    gen2_gate = "GREEN" if zc_total == 0 else "ZC_NOT_READY_present"
    probes_gate = "PASS" if pass_count == len(probe_results) else "FAIL"
    all_green = gen2_gate == "GREEN" and probes_gate == "PASS" and terminal_gate != "FAIL" and oracle_gate != "FAIL" and gen3_gate != "FAIL"
    return "%s_gen2=%s_probes=%s_terminal=%s_oracle=%s_gen3=%s" % (
        "COMPLETE" if all_green else "COMPLETE_WITH_FAILURES",
        gen2_gate,
        probes_gate,
        terminal_gate,
        oracle_gate,
        gen3_gate,
    )

run_lock_fd = os.open(RUN_LOCK, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
fcntl.flock(run_lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
# Keep run_lock_fd open for the complete process lifetime. Write through a duplicate so the
# context manager cannot release the authoritative advisory lock.
with os.fdopen(os.dup(run_lock_fd), "w") as f:
    json.dump({"pid": os.getpid(), "startedAt": time.time()}, f)
    f.write("\\n")
    f.flush()
    os.fsync(f.fileno())

with open(PIDFILE, "x") as f:
    f.write(str(os.getpid()))

try:
    verdict = main()
    completion_error = None
except SnapshotDriftError:
    verdict = "ABORTED_PROVENANCE_MISMATCH"
    completion_error = traceback.format_exc()
except BaseException:
    verdict = "CRASHED"
    completion_error = traceback.format_exc()
try:
    complete_once(verdict, completion_error)
finally:
    try:
        os.remove(PIDFILE)
    except OSError:
        pass
`;
}

function readJournal(journalPath, allowTrailingPartial) {
  if (!existsSync(journalPath)) return {records: [], trailingPartial: false};
  const text = readFileSync(journalPath, "utf8");
  const records = [];
  const lines = text.split("\n");
  let trailingPartial = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed));
    } catch (error) {
      const isUnterminatedTail = index === lines.length - 1 && !text.endsWith("\n");
      if (allowTrailingPartial && isUnterminatedTail) {
        trailingPartial = true;
        continue;
      }
      throw new Error(`invalid ignition journal JSON at ${journalPath}:${index + 1}: ${error.message}`);
    }
  }
  validateJournalRecords(records, journalPath);
  if (trailingPartial && records.some((record) => record.stage === "done")) {
    throw new Error(`ignition journal has bytes after a done record: ${journalPath}`);
  }
  return {records, trailingPartial};
}

const JOURNAL_STAGE_ORDER = new Map([
  ["provenance", 0],
  ["drvBake", 1],
  ["probes", 2],
  ["gen2Bake", 3],
  ["terminal", 4],
  ["oracle", 5],
  ["gen3", 6],
]);

const SHA256_TAG_PATTERN = /^sha256:[0-9a-f]{64}$/;

function invalidJournal(label, detail) {
  throw new Error(`invalid ignition ${label}: ${detail}`);
}

function assertPlainObject(value, label) {
  if (!value || Array.isArray(value) || typeof value !== "object") invalidJournal(label, "expected an object");
}

function assertExactKeys(value, expectedKeys, label) {
  assertPlainObject(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    invalidJournal(label, `fields ${JSON.stringify(actual)} do not equal ${JSON.stringify(expected)}`);
  }
}

function assertKeys(value, requiredKeys, optionalKeys, label) {
  assertPlainObject(value, label);
  const required = new Set(requiredKeys);
  const optional = new Set(optionalKeys);
  for (const key of Object.keys(value)) {
    if (!required.has(key) && !optional.has(key)) {
      invalidJournal(label, `unexpected field ${JSON.stringify(key)}`);
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) invalidJournal(label, `missing required field ${JSON.stringify(key)}`);
  }
}

function assertBoolean(value, label) {
  if (typeof value !== "boolean") invalidJournal(label, "expected a boolean");
}

function assertString(value, label, {allowEmpty = false} = {}) {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) invalidJournal(label, "expected a string");
}

function assertInteger(value, label, {nullable = false, nonnegative = false, positive = false} = {}) {
  if (nullable && value === null) return;
  if (!Number.isSafeInteger(value) || (nonnegative && value < 0) || (positive && value <= 0)) {
    invalidJournal(label, "expected a bounded integer");
  }
}

function assertFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) invalidJournal(label, "expected a finite number");
}

function assertSha256(value, label, {nullable = false} = {}) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || !SHA256_TAG_PATTERN.test(value)) invalidJournal(label, "expected sha256:<64 lowercase hex>");
}

function assertProcessResult(rc, timedOut, outputOverflow, label) {
  assertInteger(rc, `${label}.rc`, {nullable: true});
  assertBoolean(timedOut, `${label}.timedOut`);
  assertBoolean(outputOverflow, `${label}.outputOverflow`);
  if ((rc === null) !== (timedOut || outputOverflow)) {
    invalidJournal(label, "rc must be null exactly for timeout/output overflow");
  }
}

function validateStagePlan(value, label) {
  assertExactKeys(value, ["gen2", "terminal", "oracle", "gen3"], label);
  for (const key of ["gen2", "terminal", "oracle", "gen3"]) assertBoolean(value[key], `${label}.${key}`);
  if (!value.gen2 && (value.terminal || value.oracle || value.gen3)) invalidJournal(label, "terminal/oracle/gen3 require gen2");
}

function validateProvenanceRecord(record, label) {
  assertExactKeys(record, [
    "stage", "ts", "seed", "seedSha256AtStart", "seedSha256AtRun", "seedShaMatch",
    "treeRoot", "treeSrcHashAtStart", "treeSrcHashAtRun", "treeSrcHashMatch", "treeError",
    "inputManifestSha256", "inputFiles", "inputFilesMatch", "stages", "ablation",
  ], label);
  assertString(record.seed, `${label}.seed`);
  assertString(record.treeRoot, `${label}.treeRoot`);
  assertSha256(record.seedSha256AtStart, `${label}.seedSha256AtStart`);
  assertSha256(record.seedSha256AtRun, `${label}.seedSha256AtRun`, {nullable: true});
  assertBoolean(record.seedShaMatch, `${label}.seedShaMatch`);
  if (record.seedShaMatch !== (record.seedSha256AtRun !== null && record.seedSha256AtRun === record.seedSha256AtStart)) {
    invalidJournal(label, "seed hash match flag contradicts the hashes");
  }
  assertSha256(record.treeSrcHashAtStart, `${label}.treeSrcHashAtStart`);
  assertSha256(record.treeSrcHashAtRun, `${label}.treeSrcHashAtRun`, {nullable: true});
  assertBoolean(record.treeSrcHashMatch, `${label}.treeSrcHashMatch`);
  if (record.treeSrcHashMatch !== (record.treeSrcHashAtRun !== null && record.treeSrcHashAtRun === record.treeSrcHashAtStart)) {
    invalidJournal(label, "tree hash match flag contradicts the hashes");
  }
  if (!(record.treeError === null || (typeof record.treeError === "string" && record.treeError.length > 0))) {
    invalidJournal(`${label}.treeError`, "expected null or a non-empty string");
  }
  if ((record.treeSrcHashAtRun === null) !== (record.treeError !== null)) {
    invalidJournal(label, "treeError must exist exactly when the runtime tree hash is unavailable");
  }
  assertSha256(record.inputManifestSha256, `${label}.inputManifestSha256`);
  if (!Array.isArray(record.inputFiles) || record.inputFiles.length === 0) invalidJournal(`${label}.inputFiles`, "expected a non-empty array");
  const identities = new Set();
  for (let index = 0; index < record.inputFiles.length; index++) {
    const item = record.inputFiles[index];
    const itemLabel = `${label}.inputFiles[${index}]`;
    assertExactKeys(item, ["kind", "name", "path", "sha256AtStart", "sha256AtRun", "match", "error"], itemLabel);
    for (const key of ["kind", "name", "path"]) assertString(item[key], `${itemLabel}.${key}`);
    const identity = `${item.kind}\u0000${item.name}`;
    if (identities.has(identity)) invalidJournal(itemLabel, "duplicate kind/name identity");
    identities.add(identity);
    assertSha256(item.sha256AtStart, `${itemLabel}.sha256AtStart`);
    assertSha256(item.sha256AtRun, `${itemLabel}.sha256AtRun`, {nullable: true});
    assertBoolean(item.match, `${itemLabel}.match`);
    if (item.match !== (item.sha256AtRun !== null && item.sha256AtRun === item.sha256AtStart)) {
      invalidJournal(itemLabel, "match flag contradicts the hashes");
    }
    if (!(item.error === null || (typeof item.error === "string" && item.error.length > 0))) {
      invalidJournal(`${itemLabel}.error`, "expected null or a non-empty string");
    }
    if ((item.sha256AtRun === null) !== (item.error !== null)) invalidJournal(itemLabel, "error must exist exactly when runtime hash is unavailable");
  }
  const seedItems = record.inputFiles.filter((item) => item.kind === "seed" && item.name === "seed");
  if (seedItems.length !== 1) invalidJournal(label, "expected exactly one seed input");
  if (seedItems[0].path !== record.seed || seedItems[0].sha256AtStart !== record.seedSha256AtStart
      || seedItems[0].sha256AtRun !== record.seedSha256AtRun || seedItems[0].match !== record.seedShaMatch) {
    invalidJournal(label, "seed summary contradicts the seed input record");
  }
  assertBoolean(record.inputFilesMatch, `${label}.inputFilesMatch`);
  if (record.inputFilesMatch !== record.inputFiles.every((item) => item.match)) invalidJournal(label, "inputFilesMatch contradicts input records");
  const manifestPayload = {
    treeSrcHash: record.treeSrcHashAtStart,
    inputFiles: record.inputFiles.map((item) => ({kind: item.kind, name: item.name, sha256: item.sha256AtStart})),
  };
  const expectedManifest = `sha256:${createHash("sha256").update(Buffer.from(JSON.stringify(manifestPayload), "utf8")).digest("hex")}`;
  if (record.inputManifestSha256 !== expectedManifest) invalidJournal(label, "input manifest hash does not match the recorded inputs");
  validateStagePlan(record.stages, `${label}.stages`);
  if (!(record.ablation === null || (record.ablation && !Array.isArray(record.ablation) && typeof record.ablation === "object"))) {
    invalidJournal(`${label}.ablation`, "expected null or an object");
  }
}

function validateBakeRecord(record, label, {gen2 = false} = {}) {
  const required = ["stage", "ts", "rc", "wallMs", "ok", "timedOut", "outputOverflow", "stdoutLog", "stderrLog", "stderrTail", "sha256"];
  if (gen2) required.push("zcTotal", "bails");
  const optional = ["peakRssBytes", "peakRssError", "signal", "forensics"];
  assertKeys(record, required, optional, label);
  assertInteger(record.wallMs, `${label}.wallMs`, {nonnegative: true});
  assertProcessResult(record.rc, record.timedOut, record.outputOverflow, label);
  assertBoolean(record.ok, `${label}.ok`);
  for (const key of ["stdoutLog", "stderrLog"]) assertString(record[key], `${label}.${key}`);
  assertString(record.stderrTail, `${label}.stderrTail`, {allowEmpty: true});
  assertSha256(record.sha256, `${label}.sha256`, {nullable: true});
  const derivedOk = record.rc === 0 && !record.timedOut && !record.outputOverflow && record.sha256 !== null;
  if (record.ok !== derivedOk) invalidJournal(label, "ok contradicts rc/process state/artifact hash");
  if (gen2) {
    assertInteger(record.zcTotal, `${label}.zcTotal`, {nonnegative: true});
    if (!Array.isArray(record.bails) || record.bails.length !== record.zcTotal) invalidJournal(label, "zcTotal must equal bails.length");
    for (let index = 0; index < record.bails.length; index++) {
      const bail = record.bails[index];
      const bailLabel = `${label}.bails[${index}]`;
      assertExactKeys(bail, ["function", "bodyKind", "bail"], bailLabel);
      assertString(bail.function, `${bailLabel}.function`);
      assertString(bail.bodyKind, `${bailLabel}.bodyKind`);
      assertInteger(bail.bail, `${bailLabel}.bail`);
    }
  }
}

function validateRuntimeResult(item, label) {
  const required = ["name", "rc", "expect", "pass", "timedOut", "outputOverflow", "stdoutLog", "stderrLog"];
  const optional = ["compilePeakRssBytes", "compilePeakRssError", "compileSignal", "compileForensics",
                    "runPeakRssBytes", "runPeakRssError", "runSignal", "runForensics"];
  assertKeys(item, required, optional, label);
  assertString(item.name, `${label}.name`);
  assertInteger(item.expect, `${label}.expect`);
  assertProcessResult(item.rc, item.timedOut, item.outputOverflow, label);
  assertBoolean(item.pass, `${label}.pass`);
  if (item.pass !== (item.rc === item.expect)) invalidJournal(label, "pass contradicts rc/expect");
  for (const key of ["stdoutLog", "stderrLog"]) assertString(item[key], `${label}.${key}`);
}

function validateProbeLikeRecord(record, label, arrayKey) {
  assertExactKeys(record, ["stage", "ts", "wallMs", "passCount", "total", arrayKey], label);
  assertInteger(record.wallMs, `${label}.wallMs`, {nonnegative: true});
  assertInteger(record.passCount, `${label}.passCount`, {nonnegative: true});
  assertInteger(record.total, `${label}.total`, {positive: true});
  const items = record[arrayKey];
  if (!Array.isArray(items) || items.length !== record.total) invalidJournal(label, `total must equal ${arrayKey}.length`);
  const names = new Set();
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const itemLabel = `${label}.${arrayKey}[${index}]`;
    if (Object.hasOwn(item, "note")) {
      const required = ["name", "rc", "expect", "pass", "note", "compileTimedOut", "compileOutputOverflow", "compileStdoutLog", "compileStderrLog", "compileStderrTail"];
      const optional = ["compilePeakRssBytes", "compilePeakRssError", "compileSignal", "compileForensics"];
      assertKeys(item, required, optional, itemLabel);
      assertString(item.name, `${itemLabel}.name`);
      assertInteger(item.expect, `${itemLabel}.expect`);
      if (item.rc !== null || item.pass !== false || item.note !== "compile failed") invalidJournal(itemLabel, "compile failure summary is contradictory");
      assertBoolean(item.compileTimedOut, `${itemLabel}.compileTimedOut`);
      assertBoolean(item.compileOutputOverflow, `${itemLabel}.compileOutputOverflow`);
      for (const key of ["compileStdoutLog", "compileStderrLog"]) assertString(item[key], `${itemLabel}.${key}`);
      assertString(item.compileStderrTail, `${itemLabel}.compileStderrTail`, {allowEmpty: true});
    } else {
      validateRuntimeResult(item, itemLabel);
    }
    if (names.has(item.name)) invalidJournal(itemLabel, "duplicate fixture name");
    names.add(item.name);
  }
  if (record.passCount !== items.filter((item) => item.pass === true).length) invalidJournal(label, "passCount contradicts result rows");
}

function validateTerminalRecord(record, label) {
  assertExactKeys(record, ["stage", "ts", "wallMs", "passCount", "total", "terminal"], label);
  assertInteger(record.wallMs, `${label}.wallMs`, {nonnegative: true});
  assertInteger(record.passCount, `${label}.passCount`, {nonnegative: true});
  assertInteger(record.total, `${label}.total`, {positive: true});
  if (!Array.isArray(record.terminal) || record.terminal.length !== record.total) invalidJournal(label, "total must equal terminal.length");
  const names = new Set();
  for (let index = 0; index < record.terminal.length; index++) {
    const item = record.terminal[index];
    const itemLabel = `${label}.terminal[${index}]`;
    if (Object.hasOwn(item, "compileTimedOut")) {
      const required = ["name", "compileRc", "runRc", "expect", "pass", "compileTimedOut", "compileOutputOverflow", "compileStdoutLog", "compileStderrLog", "stderrTail"];
      const optional = ["compilePeakRssBytes", "compilePeakRssError", "compileSignal", "compileForensics"];
      assertKeys(item, required, optional, itemLabel);
      assertString(item.name, `${itemLabel}.name`);
      assertInteger(item.expect, `${itemLabel}.expect`);
      assertProcessResult(item.compileRc, item.compileTimedOut, item.compileOutputOverflow, `${itemLabel}.compile`);
      if (item.runRc !== null || item.pass !== false) invalidJournal(itemLabel, "compile failure cannot have a runtime result or pass");
      for (const key of ["compileStdoutLog", "compileStderrLog"]) assertString(item[key], `${itemLabel}.${key}`);
      assertString(item.stderrTail, `${itemLabel}.stderrTail`, {allowEmpty: true});
    } else {
      const required = ["name", "compileRc", "runRc", "expect", "pass", "timedOut", "outputOverflow", "stdoutLog", "stderrLog", "stderrTail"];
      const optional = ["compilePeakRssBytes", "compilePeakRssError", "compileSignal", "compileForensics",
                        "runPeakRssBytes", "runPeakRssError", "runSignal", "runForensics"];
      assertKeys(item, required, optional, itemLabel);
      assertString(item.name, `${itemLabel}.name`);
      if (item.compileRc !== 0) invalidJournal(itemLabel, "runtime row requires compileRc=0");
      assertInteger(item.expect, `${itemLabel}.expect`);
      assertProcessResult(item.runRc, item.timedOut, item.outputOverflow, `${itemLabel}.run`);
      assertBoolean(item.pass, `${itemLabel}.pass`);
      if (item.pass !== (item.runRc === item.expect)) invalidJournal(itemLabel, "pass contradicts runRc/expect");
      for (const key of ["stdoutLog", "stderrLog"]) assertString(item[key], `${itemLabel}.${key}`);
      assertString(item.stderrTail, `${itemLabel}.stderrTail`, {allowEmpty: true});
    }
    if (names.has(item.name)) invalidJournal(itemLabel, "duplicate fixture name");
    names.add(item.name);
  }
  if (record.passCount !== record.terminal.filter((item) => item.pass === true).length) invalidJournal(label, "passCount contradicts result rows");
}

function validateGen3Record(record, label) {
  const bakeFailure = Object.hasOwn(record, "note");
  if (bakeFailure) {
    const required = ["stage", "ts", "bakeRc", "wallMs", "ok", "maskedIdentical", "timedOut", "outputOverflow", "stdoutLog", "stderrLog", "note", "stderrTail", "stdoutTail"];
    const optional = ["peakRssBytes", "peakRssError", "signal", "forensics"];
    assertKeys(record, required, optional, label);
    assertInteger(record.wallMs, `${label}.wallMs`, {nonnegative: true});
    assertProcessResult(record.bakeRc, record.timedOut, record.outputOverflow, `${label}.bake`);
    if (record.ok !== false || record.maskedIdentical !== null || record.note !== "gen3 bake failed") invalidJournal(label, "invalid gen3 bake-failure summary");
    for (const key of ["stdoutLog", "stderrLog"]) assertString(record[key], `${label}.${key}`);
    for (const key of ["stderrTail", "stdoutTail"]) assertString(record[key], `${label}.${key}`, {allowEmpty: true});
    return;
  }
  const required = ["stage", "ts", "bakeRc", "wallMs", "bakeOutputOverflow", "bakeStdoutLog", "bakeStderrLog", "compareRc", "compareTimedOut", "compareOutputOverflow", "compareStdoutLog", "compareStderrLog", "ok", "maskedIdentical", "maskedOutput"];
  const optional = ["peakRssBytes", "peakRssError", "signal", "forensics"];
  assertKeys(record, required, optional, label);
  if (record.bakeRc !== 0 || record.bakeOutputOverflow !== false) invalidJournal(label, "comparison row requires a successful gen3 bake");
  assertInteger(record.wallMs, `${label}.wallMs`, {nonnegative: true});
  assertProcessResult(record.compareRc, record.compareTimedOut, record.compareOutputOverflow, `${label}.compare`);
  if (record.compareRc !== null && !record.compareTimedOut && !record.compareOutputOverflow
      && record.compareRc !== 0 && record.compareRc !== 1) {
    invalidJournal(label, "comparison rc must be 0 (identical) or 1 (mismatch)");
  }
  for (const key of ["bakeStdoutLog", "bakeStderrLog", "compareStdoutLog", "compareStderrLog"]) assertString(record[key], `${label}.${key}`);
  assertString(record.maskedOutput, `${label}.maskedOutput`, {allowEmpty: true});
  assertBoolean(record.ok, `${label}.ok`);
  assertBoolean(record.maskedIdentical, `${label}.maskedIdentical`);
  const identical = record.compareRc === 0 && !record.compareTimedOut && !record.compareOutputOverflow;
  if (record.ok !== identical || record.maskedIdentical !== identical) invalidJournal(label, "comparison verdict contradicts the process result");
}

function validateStageRecord(record, label) {
  assertFiniteNumber(record.ts, `${label}.ts`);
  switch (record.stage) {
    case "provenance": return validateProvenanceRecord(record, label);
    case "drvBake": return validateBakeRecord(record, label);
    case "probes": return validateProbeLikeRecord(record, label, "probes");
    case "gen2Bake": return validateBakeRecord(record, label, {gen2: true});
    case "terminal": return validateTerminalRecord(record, label);
    case "oracle": return validateProbeLikeRecord(record, label, "oracle");
    case "gen3": return validateGen3Record(record, label);
    default: invalidJournal(label, `unknown stage ${JSON.stringify(record.stage)}`);
  }
}

function isKnownCompletionVerdict(verdict) {
  if ([
    "ABORTED_PROVENANCE_MISMATCH", "ABORTED_DRV_BAKE_FAILED", "ABORTED_GEN2_BAKE_FAILED",
    "ABORTED_GEN3_COMPARE_FAILED", "ABORTED_GEN3_FIXED_POINT_MISMATCH", "ABORTED_GEN3_BAKE_FAILED", "CRASHED",
  ].includes(verdict)) return true;
  if (/^PROBES_ONLY_COMPLETE(?:_WITH_FAILURES)?_gen2=SKIPPED_probes=(?:PASS|FAIL)_terminal=SKIPPED_oracle=SKIPPED_gen3=SKIPPED$/.test(verdict)) return true;
  return /^(?:COMPLETE|COMPLETE_WITH_FAILURES)_gen2=(?:GREEN|ZC_NOT_READY_present)_probes=(?:PASS|FAIL)_terminal=(?:PASS|FAIL|SKIPPED)_oracle=(?:PASS|FAIL|SKIPPED)_gen3=(?:PASS|SKIPPED)$/.test(verdict);
}

function validateCompletionRecordShape(record, label) {
  const hasError = Object.hasOwn(record || {}, "error");
  assertExactKeys(record, hasError ? ["stage", "ts", "pid", "verdict", "lastStage", "error"] : ["stage", "ts", "pid", "verdict", "lastStage"], label);
  if (record.stage !== "done") invalidJournal(label, "stage must be done");
  assertFiniteNumber(record.ts, `${label}.ts`);
  assertInteger(record.pid, `${label}.pid`, {positive: true});
  if (typeof record.verdict !== "string" || !isKnownCompletionVerdict(record.verdict)) invalidJournal(label, "unknown verdict");
  if (!(record.lastStage === null || JOURNAL_STAGE_ORDER.has(record.lastStage))) invalidJournal(label, "unknown lastStage");
  if (hasError) {
    assertString(record.error, `${label}.error`);
    if (record.verdict !== "CRASHED" && record.verdict !== "ABORTED_PROVENANCE_MISMATCH") invalidJournal(label, "only exception verdicts may carry error");
  } else if (record.verdict === "CRASHED") {
    invalidJournal(label, "CRASHED requires an error traceback");
  }
}

function exceptionVerdict(done, label) {
  if (!Object.hasOwn(done, "error")) invalidJournal(label, "missing required stage without an exception traceback");
  if (done.verdict === "CRASHED") return "CRASHED";
  if (done.verdict === "ABORTED_PROVENANCE_MISMATCH" && done.error.includes("SnapshotDriftError")) return "ABORTED_PROVENANCE_MISMATCH";
  invalidJournal(label, "exception traceback does not match verdict");
}

function requireNormalVerdict(done, expected, label) {
  if (Object.hasOwn(done, "error")) invalidJournal(label, `normal verdict ${expected} cannot carry error`);
  if (done.verdict !== expected) invalidJournal(label, `verdict ${JSON.stringify(done.verdict)} contradicts recomputed ${JSON.stringify(expected)}`);
}

function validateCompletedVerdict(byStage, done, label) {
  const provenance = byStage.get("provenance");
  if (!provenance) invalidJournal(label, "done requires provenance");
  if (!provenance.treeSrcHashMatch || !provenance.inputFilesMatch) {
    requireNormalVerdict(done, "ABORTED_PROVENANCE_MISMATCH", label);
    return;
  }
  const drv = byStage.get("drvBake");
  if (!drv) {
    exceptionVerdict(done, label);
    return;
  }
  if (!drv.ok) {
    requireNormalVerdict(done, "ABORTED_DRV_BAKE_FAILED", label);
    return;
  }
  const probes = byStage.get("probes");
  if (!probes) {
    exceptionVerdict(done, label);
    return;
  }
  const probesGate = probes.passCount === probes.total ? "PASS" : "FAIL";
  if (!provenance.stages.gen2) {
    const prefix = probesGate === "PASS" ? "PROBES_ONLY_COMPLETE" : "PROBES_ONLY_COMPLETE_WITH_FAILURES";
    requireNormalVerdict(done, `${prefix}_gen2=SKIPPED_probes=${probesGate}_terminal=SKIPPED_oracle=SKIPPED_gen3=SKIPPED`, label);
    return;
  }
  const gen2 = byStage.get("gen2Bake");
  if (!gen2) {
    exceptionVerdict(done, label);
    return;
  }
  if (!gen2.ok) {
    requireNormalVerdict(done, "ABORTED_GEN2_BAKE_FAILED", label);
    return;
  }
  const terminal = byStage.get("terminal");
  if (provenance.stages.terminal && !terminal) {
    exceptionVerdict(done, label);
    return;
  }
  const oracle = byStage.get("oracle");
  if (provenance.stages.oracle && !oracle) {
    exceptionVerdict(done, label);
    return;
  }
  const gen3 = byStage.get("gen3");
  if (provenance.stages.gen3 && !gen3) {
    exceptionVerdict(done, label);
    return;
  }
  let gen3Gate = "SKIPPED";
  if (gen3) {
    if (Object.hasOwn(gen3, "note")) {
      requireNormalVerdict(done, "ABORTED_GEN3_BAKE_FAILED", label);
      return;
    }
    if (gen3.compareRc === null || gen3.compareTimedOut || gen3.compareOutputOverflow
        || (gen3.compareRc !== 0 && gen3.compareRc !== 1)) {
      requireNormalVerdict(done, "ABORTED_GEN3_COMPARE_FAILED", label);
      return;
    }
    if (!gen3.maskedIdentical) {
      requireNormalVerdict(done, "ABORTED_GEN3_FIXED_POINT_MISMATCH", label);
      return;
    }
    gen3Gate = "PASS";
  }
  const gen2Gate = gen2.zcTotal === 0 ? "GREEN" : "ZC_NOT_READY_present";
  const terminalGate = terminal ? (terminal.passCount === terminal.total ? "PASS" : "FAIL") : "SKIPPED";
  const oracleGate = oracle ? (oracle.passCount === oracle.total ? "PASS" : "FAIL") : "SKIPPED";
  const allGreen = gen2Gate === "GREEN" && probesGate === "PASS" && terminalGate !== "FAIL" && oracleGate !== "FAIL" && gen3Gate !== "FAIL";
  const expected = `${allGreen ? "COMPLETE" : "COMPLETE_WITH_FAILURES"}_gen2=${gen2Gate}_probes=${probesGate}_terminal=${terminalGate}_oracle=${oracleGate}_gen3=${gen3Gate}`;
  requireNormalVerdict(done, expected, label);
}

function validateJournalRecords(records, journalPath) {
  if (records.length > 0 && records[0]?.stage !== "provenance") {
    throw new Error(`ignition journal must begin with provenance: ${journalPath}`);
  }
  const seenStages = new Set();
  const byStage = new Map();
  let lastOrder = -1;
  let lastStage = null;
  let sawDone = false;
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (!record || Array.isArray(record) || typeof record !== "object" || typeof record.stage !== "string" || !Number.isFinite(record.ts)) {
      throw new Error(`invalid ignition journal record shape at ${journalPath}:${index + 1}`);
    }
    if (record.stage === "done") {
      if (sawDone) throw new Error(`duplicate ignition journal done record at ${journalPath}:${index + 1}`);
      validateCompletionRecordShape(record, `journal done record at ${journalPath}:${index + 1}`);
      if (record.lastStage !== lastStage) {
        throw new Error(`ignition journal done.lastStage mismatch at ${journalPath}:${index + 1}: expected ${JSON.stringify(lastStage)}, got ${JSON.stringify(record.lastStage)}`);
      }
      validateCompletedVerdict(byStage, record, `journal done record at ${journalPath}:${index + 1}`);
      sawDone = true;
      continue;
    }
    if (sawDone) throw new Error(`ignition journal contains stage ${record.stage} after done at ${journalPath}:${index + 1}`);
    const order = JOURNAL_STAGE_ORDER.get(record.stage);
    if (order === undefined) throw new Error(`unknown ignition journal stage ${JSON.stringify(record.stage)} at ${journalPath}:${index + 1}`);
    if (seenStages.has(record.stage)) throw new Error(`duplicate ignition journal stage ${record.stage} at ${journalPath}:${index + 1}`);
    if (order <= lastOrder) throw new Error(`out-of-order ignition journal stage ${record.stage} at ${journalPath}:${index + 1}`);
    validateStageRecord(record, `journal record at ${journalPath}:${index + 1}`);
    const provenance = byStage.get("provenance") || (record.stage === "provenance" ? record : null);
    if (record.stage !== "provenance" && !provenance) throw new Error(`ignition journal stage ${record.stage} has no provenance dependency at ${journalPath}:${index + 1}`);
    if (record.stage === "drvBake" && (!provenance.treeSrcHashMatch || !provenance.inputFilesMatch)) throw new Error(`ignition drvBake follows failed provenance at ${journalPath}:${index + 1}`);
    if (record.stage === "probes" && byStage.get("drvBake")?.ok !== true) throw new Error(`ignition probes require a successful drvBake at ${journalPath}:${index + 1}`);
    if (record.stage === "gen2Bake" && (byStage.get("probes") === undefined || provenance.stages.gen2 !== true)) throw new Error(`ignition gen2Bake violates its stage plan/dependencies at ${journalPath}:${index + 1}`);
    if (["terminal", "oracle", "gen3"].includes(record.stage) && byStage.get("gen2Bake")?.ok !== true) throw new Error(`ignition ${record.stage} requires a successful gen2Bake at ${journalPath}:${index + 1}`);
    if (record.stage === "terminal" && provenance.stages.terminal !== true) throw new Error(`ignition terminal is disabled by the stage plan at ${journalPath}:${index + 1}`);
    if (record.stage === "oracle" && provenance.stages.oracle !== true) throw new Error(`ignition oracle is disabled by the stage plan at ${journalPath}:${index + 1}`);
    if (record.stage === "gen3" && provenance.stages.gen3 !== true) throw new Error(`ignition gen3 is disabled by the stage plan at ${journalPath}:${index + 1}`);
    if (record.stage === "oracle" && provenance.stages.terminal && !byStage.has("terminal")) throw new Error(`ignition oracle skipped its enabled terminal dependency at ${journalPath}:${index + 1}`);
    if (record.stage === "gen3" && provenance.stages.terminal && !byStage.has("terminal")) throw new Error(`ignition gen3 skipped its enabled terminal dependency at ${journalPath}:${index + 1}`);
    if (record.stage === "gen3" && provenance.stages.oracle && !byStage.has("oracle")) throw new Error(`ignition gen3 skipped its enabled oracle dependency at ${journalPath}:${index + 1}`);
    seenStages.add(record.stage);
    byStage.set(record.stage, record);
    lastOrder = order;
    lastStage = record.stage;
  }
}

function readCompletionRecord(path, label) {
  if (!existsSync(path)) return null;
  let record;
  try {
    record = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`invalid ignition ${label} ${path}: ${error.message}`);
  }
  try {
    validateCompletionRecordShape(record, `${label} ${path}`);
  } catch (error) {
    throw error;
  }
  return record;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
}

function sameCompletionRecord(...records) {
  if (records.some((record) => !record)) return false;
  const canonical = records.map((record) => JSON.stringify(canonicalJson(record)));
  return canonical.every((value) => value === canonical[0]);
}

const RUN_LOCK_PROBE_PYTHON = `
import fcntl, os, stat, sys
path = sys.argv[1]
flags = os.O_RDWR | getattr(os, "O_NOFOLLOW", 0)
fd = os.open(path, flags)
try:
    if not stat.S_ISREG(os.fstat(fd).st_mode):
        raise RuntimeError("run lock is not a regular file")
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        sys.exit(11)
    fcntl.flock(fd, fcntl.LOCK_UN)
finally:
    os.close(fd)
`;

function inspectRunLock(path) {
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if (error?.code === "ENOENT") return {exists: false, running: false, state: "MISSING"};
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`ignition run lock must be a regular file: ${path}`);
  const result = spawnSync("python3", ["-c", RUN_LOCK_PROBE_PYTHON, path], {encoding: "utf8"});
  if (result.error) throw new Error(`failed to inspect ignition run lock ${path}: ${result.error.message}`);
  if (result.status === 11) return {exists: true, running: true, state: "LOCKED"};
  if (result.status === 0) return {exists: true, running: false, state: "UNLOCKED"};
  throw new Error(`invalid ignition run lock ${path}: python exited ${result.status}: ${(result.stderr || result.stdout || "").trim()}`);
}

function assertRegularRunArtifact(path, label, {allowEmpty = false} = {}) {
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`ignition ${label} must be a regular file: ${path}`);
  if (!allowEmpty && stat.size === 0) throw new Error(`ignition ${label} is empty: ${path}`);
  return true;
}

function normalizeStages(stagesInput = {}) {
  const gen2Enabled = stagesInput.gen2 !== false;
  if (!gen2Enabled && stagesInput.terminal === true) throw new Error("stages.terminal=true requires stages.gen2=true");
  if (!gen2Enabled && stagesInput.oracle === true) throw new Error("stages.oracle=true requires stages.gen2=true");
  if (!gen2Enabled && stagesInput.gen3 === true) throw new Error("stages.gen3=true requires stages.gen2=true");
  return {
    gen2: gen2Enabled,
    terminal: gen2Enabled && stagesInput.terminal !== false,
    oracle: gen2Enabled && stagesInput.oracle !== false,
    gen3: stagesInput.gen3 === true,
  };
}

function snapshotFixtureEntries(entries, kind, destinationDir, inputFiles) {
  return entries.map((entry, index) => {
    const copied = snapshotFile(entry.fixture, join(destinationDir, `${kind}_${String(index).padStart(3, "0")}.cheng`), `${kind} fixture ${entry.name}`);
    inputFiles.push({kind, name: entry.name, path: copied.path, sha256: copied.sha256});
    return {...entry, fixture: copied.path};
  });
}

function inputManifestSha256(treeSrcHash, inputFiles) {
  const payload = {
    treeSrcHash,
    inputFiles: inputFiles.map(({kind, name, sha256}) => ({kind, name, sha256})),
  };
  return `sha256:${sha256HexOfBuffer(Buffer.from(JSON.stringify(payload), "utf8"))}`;
}

async function startIgnitionChain(input) {
  const hasBaseTree = typeof input.baseTree === "string" && input.baseTree.length > 0;
  const hasRevertCommits = Array.isArray(input.revertCommits) && input.revertCommits.length > 0;
  if (hasBaseTree !== hasRevertCommits) throw new Error("ablation requires both baseTree and a non-empty revertCommits list");
  if (hasBaseTree && input.treeRoot) throw new Error("treeRoot and baseTree/revertCommits are mutually exclusive");

  // Validate every input that does not depend on the ablated clone before creating workDir/runDir.
  const stages = normalizeStages(input.stages || {});
  const matrixPath = resolveMatrixPath(input.matrixPath);
  loadMatrixTagEntries(matrixPath, "probe");
  loadMatrixTagEntries(matrixPath, "terminal");
  const oracleSources = stages.oracle
    ? DEFAULT_ORACLE.map((item) => ({...item, fixture: resolveExistingFile(item.fixture, "oracle fixture " + item.name)}))
    : [];
  const maskedCmpSource = existsSync(MASKED_CMP_PATH) ? resolveExistingFile(MASKED_CMP_PATH, "masked comparison tool") : null;
  const maskedCmpAvailable = Boolean(maskedCmpSource);
  if (stages.gen3 && !maskedCmpAvailable) {
    throw new Error("gen3 requested but masked comparison tool is unavailable: " + MASKED_CMP_PATH);
  }
  const rssCapBytes = normalizeRssCapBytes(input.rssCapBytes, DEFAULT_RSS_CAP_BYTES, "rssCapBytes");
  const gen3RssCapBytes = normalizeRssCapBytes(input.gen3RssCapBytes, rssCapBytes, "gen3RssCapBytes");
  const outputMaxBytes = normalizeOutputMaxBytes(input.outputMaxBytes);
  const seedSource = resolveExistingFile(input.seed || CHENG_STAGE3_DRIVER, "seed", true);
  const directTreeRoot = hasBaseTree ? null : resolveExistingDir(input.treeRoot || DEFAULT_TREE_ROOT, "treeRoot");

  const workDirBase = resolveProspectiveRealPath(input.workDir || DEFAULT_WORK_DIR);
  const baseTree = hasBaseTree ? realpathSync.native(resolveExistingDir(input.baseTree, "baseTree")) : null;
  const sourceTreeRoot = baseTree || directTreeRoot;
  computeTreeSrcHash(sourceTreeRoot);
  if (pathIsInside(workDirBase, sourceTreeRoot)) {
    throw new Error("workDir must be outside the source tree for an isolated ignition snapshot: " + workDirBase);
  }
  let baseSnapshot = null;
  if (hasBaseTree) {
    baseSnapshot = inspectAblationBase(baseTree);
  }

  mkdirSync(workDirBase, {recursive: true});
  const runId = generateRunId();
  const runDir = join(workDirBase, runId);
  mkdirSync(runDir);

  let launched = false;
  try {
    let ablation = null;
    const preparedTree = hasBaseTree
      ? (ablation = prepareAblatedTree(baseTree, input.revertCommits, runDir, baseSnapshot)).ablatedTree
      : directTreeRoot;
    const inputsDir = join(runDir, "inputs");
    mkdirSync(inputsDir);
    const treeSnapshot = snapshotTreeInputs(preparedTree, join(inputsDir, "tree"));
    const treeRoot = treeSnapshot.path;
    const treeSrcHash = treeSnapshot.sha256;
    const driverSrc = resolveExistingFile(join(treeRoot, DRIVER_SRC_RELATIVE), "backend driver source");

    const inputFiles = [];
    const seedSnapshot = snapshotFile(seedSource, join(inputsDir, "seed"), "seed", true);
    inputFiles.push({kind: "seed", name: "seed", path: seedSnapshot.path, sha256: seedSnapshot.sha256});
    const seed = seedSnapshot.path;
    const seedSha256 = seedSnapshot.sha256;

    const matrixSnapshot = snapshotFile(matrixPath, join(inputsDir, "matrix.json"), "ignition matrix");
    inputFiles.push({kind: "matrix", name: "matrix", path: matrixSnapshot.path, sha256: matrixSnapshot.sha256});
    const fixtureBaseDir = dirname(matrixPath);
    const matrixProbes = loadMatrixTagEntries(matrixSnapshot.path, "probe", fixtureBaseDir);
    const matrixTerminal = loadMatrixTagEntries(matrixSnapshot.path, "terminal", fixtureBaseDir);
    const probes = snapshotFixtureEntries(matrixProbes, "probe", join(inputsDir, "fixtures"), inputFiles);
    const terminal = stages.terminal
      ? snapshotFixtureEntries(matrixTerminal, "terminal", join(inputsDir, "fixtures"), inputFiles)
      : [];
    const oracle = stages.oracle
      ? snapshotFixtureEntries(oracleSources, "oracle", join(inputsDir, "fixtures"), inputFiles)
      : [];
    const maskedCmpSnapshot = stages.gen3
      ? snapshotFile(maskedCmpSource, join(inputsDir, "macho_masked_cmp.py"), "masked comparison tool")
      : null;
    if (maskedCmpSnapshot) {
      inputFiles.push({kind: "comparator", name: "macho_masked_cmp", path: maskedCmpSnapshot.path, sha256: maskedCmpSnapshot.sha256});
    }
    const provenanceManifestSha256 = inputManifestSha256(treeSrcHash, inputFiles);

    const config = {
      treeRoot,
      seed,
      workDir: runDir,
      driverSrc,
      stages,
      probes,
      terminal,
      oracle,
      maskedCmpPath: maskedCmpSnapshot?.path || null,
      rssCapBytes,
      gen3RssCapBytes,
      outputMaxBytes,
      seedSha256,
      treeSrcHash,
      inputFiles,
      inputManifestSha256: provenanceManifestSha256,
      ablation,
    };

    const scriptPath = join(runDir, "chain.py");
    writeFileSync(scriptPath, renderChainPythonScript(config), {mode: 0o755});
    const journalPath = join(runDir, "journal.jsonl");
    const completionSentinelPath = join(runDir, "done.json");
    const completionClaimPath = join(runDir, "completion.claim.json");
    const runLockPath = join(runDir, "chain.lock");
    writeFileSync(journalPath, "");

    let outFd = null;
    let errFd = null;
    let child;
    try {
      outFd = openSync(join(runDir, "chain.stdout.log"), "a");
      errFd = openSync(join(runDir, "chain.stderr.log"), "a");
      child = Bun.spawn(["python3", scriptPath], {cwd: runDir, stdout: outFd, stderr: errFd, stdin: "ignore", detached: true});
      launched = true;
    } finally {
      if (outFd !== null) closeSync(outFd);
      if (errFd !== null) closeSync(errFd);
    }
    child.unref();

    return jsonResult({
      schema: "cheng_ignition_chain.start.v1",
      runId,
      runDir,
      journalPath,
      completionSentinelPath,
      completionClaimPath,
      runLockPath,
      scriptPath,
      pid: child.pid,
      sourceTreeRoot,
      treeRoot,
      sourceSeed: seedSource,
      seed,
      seedSha256,
      treeSrcHash,
      inputManifestSha256: provenanceManifestSha256,
      inputSnapshots: inputFiles,
      matrixSnapshotPath: matrixSnapshot.path,
      ablation,
      stages,
      probeCount: probes.length,
      terminalCount: terminal.length,
      oracleCount: oracle.length,
      matrixPath,
      usedMatrixProbes: matrixProbes.length > 0,
      usedMatrixTerminal: stages.terminal && matrixTerminal.length > 0,
      gen3MaskedCmpAvailable: maskedCmpAvailable,
      rssCapBytes,
      gen3RssCapBytes,
      outputMaxBytes,
      note: "Chain started detached from immutable no-hardlink input snapshots; poll with {action:'status', runId, workDir}. Stages gen2/terminal/oracle/gen3 self-recompile the whole backend driver (~20+ minutes each); probes-only (stages:{gen2:false}) completes in ~3 minutes.",
    });
  } catch (error) {
    if (!launched) rmSync(runDir, {recursive: true, force: true});
    throw error;
  }
}

async function statusIgnitionChain(input) {
  if (!input.runId) throw new Error("action=status requires runId");
  if (!RUN_ID_PATTERN.test(input.runId)) throw new Error(`invalid ignition runId: ${input.runId}`);
  const workDirBase = resolveExistingDir(input.workDir || DEFAULT_WORK_DIR, "workDir");
  const requestedRunDir = join(workDirBase, input.runId);
  if (!existsSync(requestedRunDir)) throw new Error(`run not found: ${requestedRunDir}`);
  const runDir = realpathSync.native(requestedRunDir);
  if (runDir !== requestedRunDir || dirname(runDir) !== workDirBase) {
    throw new Error(`runDir must be the real direct child of workDir selected by runId: ${requestedRunDir}`);
  }
  if (!statSync(runDir).isDirectory()) throw new Error(`runDir is not a directory: ${runDir}`);

  const journalPath = join(runDir, "journal.jsonl");
  const completionSentinelPath = join(runDir, "done.json");
  const completionClaimPath = join(runDir, "completion.claim.json");
  const runLockPath = join(runDir, "chain.lock");
  const pidPath = join(runDir, "chain.pid");

  const runLock = inspectRunLock(runLockPath);
  const running = runLock.running;
  const journalExists = assertRegularRunArtifact(journalPath, "journal", {allowEmpty: true});
  if (!journalExists) throw new Error(`ignition journal is missing: ${journalPath}`);
  assertRegularRunArtifact(completionSentinelPath, "completion sentinel");
  const completionClaimExists = assertRegularRunArtifact(completionClaimPath, "completion claim", {allowEmpty: running});
  const pidExists = assertRegularRunArtifact(pidPath, "pid file", {allowEmpty: true});
  let pid = null;
  let pidReadError = null;
  if (pidExists) {
    const rawPid = readFileSync(pidPath, "utf8").trim();
    const parsedPid = Number(rawPid);
    if (Number.isInteger(parsedPid) && parsedPid > 0) pid = parsedPid;
    else if (running) pidReadError = `invalid live chain.pid: ${JSON.stringify(rawPid)}`;
    else throw new Error(`invalid terminated ignition chain.pid: ${pidPath}`);
  }

  const {records, trailingPartial: journalTrailingPartial} = readJournal(journalPath, running);
  const byStage = new Map();
  for (const record of records) byStage.set(record.stage, record);
  const journalStages = [...byStage.keys()];
  const journalDoneRecords = records.filter((record) => record?.stage === "done");
  const journalDone = journalDoneRecords.length === 1 ? journalDoneRecords[0] : null;
  let completionClaim = null;
  let completionClaimReadError = null;
  try {
    completionClaim = readCompletionRecord(completionClaimPath, "completion claim");
  } catch (error) {
    if (!running) throw error;
    completionClaimReadError = error.message;
  }
  const completionSentinel = readCompletionRecord(completionSentinelPath, "completion sentinel");
  const completionConsistent = journalDoneRecords.length === 1
    && sameCompletionRecord(journalDone, completionClaim, completionSentinel);
  const completionArtifactsPresent = journalDoneRecords.length > 0 || completionClaimExists || Boolean(completionSentinel);
  if (!running && completionArtifactsPresent && !completionConsistent) {
    throw new Error(`terminated ignition completion artifacts are missing or contradictory: ${runDir}`);
  }
  const done = completionConsistent ? completionSentinel : null;
  const stagesDone = journalStages.filter((stage) => stage !== "done");
  if (completionConsistent) stagesDone.push("done");
  let verdictSoFar;
  if (done) verdictSoFar = done.verdict;
  else if (running && completionArtifactsPresent) verdictSoFar = "COMPLETING";
  else if (running) verdictSoFar = "IN_PROGRESS";
  else if (journalDoneRecords.length > 1) verdictSoFar = "INCONSISTENT_DUPLICATE_DONE_RECORDS";
  else if (!journalDone && (completionClaim || completionSentinel)) verdictSoFar = "INCONSISTENT_MISSING_DONE_JOURNAL";
  else if (!completionClaim && (journalDone || completionSentinel)) verdictSoFar = "INCONSISTENT_MISSING_COMPLETION_CLAIM";
  else if (!completionSentinel && (journalDone || completionClaim)) verdictSoFar = "INCONSISTENT_MISSING_DONE_SENTINEL";
  else if (completionArtifactsPresent) verdictSoFar = "INCONSISTENT_COMPLETION_RECORDS";
  else if (stagesDone.length > 0) verdictSoFar = "STALLED_NO_DONE_RECORD";
  else verdictSoFar = "STARTING_OR_CRASHED_BEFORE_FIRST_STAGE";

  return jsonResult({
    schema: "cheng_ignition_chain.status.v1",
    runId: input.runId,
    runDir,
    journalPath,
    completionSentinelPath,
    completionClaimPath,
    runLockPath,
    runLockExists: runLock.exists,
    runLockState: runLock.state,
    running,
    pid,
    pidReadError,
    stagesDone,
    journalStages,
    journalTrailingPartial,
    provenance: byStage.get("provenance") || null,
    drvBake: byStage.get("drvBake") || null,
    probes: byStage.get("probes") || null,
    gen2Bake: byStage.get("gen2Bake") || null,
    terminal: byStage.get("terminal") || null,
    oracle: byStage.get("oracle") || null,
    gen3: byStage.get("gen3") || null,
    journalDone,
    journalDoneCount: journalDoneRecords.length,
    completionClaimExists,
    completionClaim,
    completionClaimReadError,
    completionSentinel,
    completionConsistent,
    done,
    verdictSoFar,
  });
}

var initChengIgnitionChainModule = defineModuleInitializer(() => {
  initChengToolkitModule();
  chengIgnitionChainInputSchema = zodSchema.strictObject({
    action: zodSchema.enum(["start", "status"]).describe("start = render+launch a detached ignition chain run; status = poll an existing run by runId."),
    treeRoot: zodSchema.string().optional().describe("[start] Cheng project tree root passed to --root:. Defaults to /Users/lbcheng/cheng-f24/tree_rebuilt_snap. Mutually exclusive with baseTree/revertCommits."),
    baseTree: zodSchema.string().optional().describe("[start ablation] Clean Git Cheng tree to clone without hardlinks. Requires revertCommits and is never modified."),
    revertCommits: zodSchema.array(zodSchema.string().min(1)).min(1).max(64).optional().describe("[start ablation] Exact caller-ordered commits to reverse inside the isolated baseTree clone. Each must be a single-parent ancestor of baseTree HEAD; every reverse patch must pass git apply --reverse --check. Requires baseTree."),
    seed: zodSchema.string().optional().describe("[start] Cold compiler binary used to bake the DRV stage. Defaults to the cheng.stage3 bootstrap seed."),
    workDir: zodSchema.string().optional().describe("Base directory for run subdirectories (runId is appended). Defaults to /Users/lbcheng/cheng-f24/chain_runs. Also read by action=status to locate the run."),
    stages: zodSchema.strictObject({
      gen2: zodSchema.boolean().optional().describe("Self-recompile the backend driver with itself (~20+ min). Default true. Set false for a probes-only run."),
      terminal: zodSchema.boolean().optional().describe("Run the matrix entries tagged terminal (currently triv_station and vardecl5_station) with GEN2. Default true when gen2=true; explicit true is invalid when gen2=false."),
      oracle: zodSchema.boolean().optional().describe("Run the fixed 6-fixture oracle net with GEN2. Default true when gen2=true; explicit true is invalid when gen2=false."),
      gen3: zodSchema.boolean().optional().describe("Bake GEN3 from GEN2 and require a successful masked-byte fixed-point comparison. Default false; true requires gen2=true, and bake/mismatch produces an explicit ABORTED verdict."),
    }).optional().describe("[start] Which chain stages to run beyond drvBake+probes."),
    matrixPath: zodSchema.string().optional().describe("[start] fixtures/ignition/matrix.json-shaped file that must provide runnable entries tagged 'probe' and 'terminal'. Defaults to this package's matrix.json; missing/invalid/untagged matrices hard-fail before launch."),
    rssCapBytes: zodSchema.number().int().positive().optional().describe("[start] RSS cap in bytes, written as CHENG_PROCESS_MAX_RSS_BYTES for every stage's Cheng driver subprocess (drvBake/probes/gen2Bake/terminal/oracle), and also the gen3 stage's default (see gen3RssCapBytes to override just that one). Defaults to 12884901888 (12 GiB)."),
    gen3RssCapBytes: zodSchema.number().int().positive().optional().describe("[start] RSS cap in bytes applied only to the gen3 stage's backend-driver self-recompile subprocess. Measured gen2-generation full-tree driver bakes peak ~14-16GB, routinely exceeding the shared 12GiB default cap and stalling gen3. Defaults to rssCapBytes's value (12884901888 / 12 GiB if that is also unset)."),
    outputMaxBytes: zodSchema.number().int().min(65536).max(1073741824).optional().describe("[start] Hard combined stdout+stderr byte cap for each subprocess, including fixture executions and GEN3 comparison. Defaults to 268435456 (256 MiB). Overflow kills the whole subprocess group and can never pass a gate."),
    runId: zodSchema.string().optional().describe("[status] The exact ignite_YYYYMMDDTHHMMSS_xxxxxx runId returned by action=start; traversal and symlink aliases are rejected."),
  });
  ChengIgnitionChainTool = createChengTextTool({
    name: "cheng_ignition_chain",
    searchHint: "start/poll a journaled background Cheng ignition chain (DRV bake -> probes -> GEN2 self-bake -> terminal/oracle nets -> optional GEN3+masked fixed-point compare)",
    inputSchema: chengIgnitionChainInputSchema,
    description: "Productizes the manual ignition determinism chain as a detached journaled run. action=start returns runId plus journal, permanent completion-claim, atomic done.json and provenance paths. Passing baseTree+revertCommits creates a no-hardlink clone, validates clean ancestry/single-parent commits, and applies reverse patches in exact caller order without modifying the realpath-normalized base tree. Every source, fixture, seed and comparator is copied into a run-local immutable input snapshot and re-hashed before and after each subprocess. The generated runner owns a permanent O_EXCL lock file and holds its OS advisory lock for the full process lifetime; status uses that lock rather than reusable PIDs. Every subprocess, including fixture binaries and the GEN3 comparator, runs in its own process group; timeout or bounded-output overflow kills that complete group and cannot pass a gate. Completion owns a second permanent O_EXCL claim, appends exactly one journal done record, then atomically creates (never overwrites) done.json. status validates journal shape/order and accepts completion only when claim, the sole journal done record and sentinel are structurally identical. Provenance drift, GEN3 bake/comparator failure and fixed-point mismatch terminate explicitly. Set stages.gen2=false for a probes-only run; terminal/oracle/gen3 then normalize to SKIPPED unless an invalid explicit true is rejected.",
    prompt: "Use action=start to kick off a chain run. For commit ablation pass baseTree plus caller-ordered revertCommits; do not also pass treeRoot. Poll with action=status + runId until completionConsistent is true, then consume done.verdict.",
    toAutoClassifierInput: (input) => `ignition_chain:${input.action}:${input.runId || "new"}`,
    async execute(input) {
      if (input.action === "start") return startIgnitionChain(input);
      return statusIgnitionChain(input);
    },
  });
});

export {ChengIgnitionChainTool, initChengIgnitionChainModule};
