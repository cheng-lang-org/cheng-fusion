// @ts-nocheck
// cheng_ignition_chain: journaled 后台点火链。产品化 fixtures/ignition/reference_ignite_chain.sh
// 手工跑的确定性枚举链条(DRV 烤 -> 11 探针 -> GEN2 自烤 -> 终端三站 -> oracle 六件套 ->
// 可选 GEN3+masked 字节比对), 但 MCP 一次 tools/call 不能挂 20-45 分钟等自烤完成 —— 所以
// action=start 只负责渲染一个自包含 python3 链脚本、detached+unref 起后台进程立即返回,
// 每个阶段各自往 workDir/<runId>/journal.jsonl 追加一行结构化 JSON; action=status 读
// journal + pid 存活判定, 供调用方轮询。
//
// 阶段字段(与 journal.jsonl 逐行对应): drvBake{rc,ok}, probes{probes:[{name,rc,expect,pass}]},
// gen2Bake{rc,zcTotal,bails[],ok}, terminal{terminal:[{name,compileRc,runRc,expect,pass}]},
// oracle{oracle:[{name,rc,expect,pass}]}, gen3{bakeRc,maskedIdentical}, done{verdict}。
//
// 探针/终端网优先取 matrixPath 里 tags 含 "probe"/"terminal" 的条目(需同时有 fixture 和
// expectRc); 当前 matrix.json 没有这两个 tag, 所以默认走内置清单(与
// reference_ignite_chain.sh 逐条一致的 11 探针 / 3 终端 / 6 oracle, 都是绝对路径 fixture)。
// oracle 六件套不走 matrix, 固定内置(reference 脚本里没给它任何 tag 挂钩点)。
import {existsSync, mkdirSync, openSync, readFileSync, writeFileSync} from "node:fs";
import {randomBytes} from "node:crypto";
import {dirname, isAbsolute, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {b as defineModuleInitializer} from "./runtime.ts";
import {createChengTextTool, jsonResult, CHENG_STAGE3_DRIVER, initChengToolkitModule, zodSchema} from "./cheng_toolkit_m9000.ts";

var chengIgnitionChainInputSchema, ChengIgnitionChainTool;

const CHENG_FUSION_PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_TREE_ROOT = "/tmp/f23/tree";
const DEFAULT_WORK_DIR = "/tmp/f23/chain_runs";
const DEFAULT_MATRIX_PATH = join(CHENG_FUSION_PACKAGE_ROOT, "fixtures/ignition/matrix.json");
const MASKED_CMP_PATH = join(CHENG_FUSION_PACKAGE_ROOT, "tools/macho_masked_cmp.py");
const DRIVER_SRC_RELATIVE = "src/core/tooling/backend_driver_dispatch_min.cheng";

// 与 reference_ignite_chain.sh 逐条一致(见该脚本的 11 探针 for 循环)。
const DEFAULT_PROBES = [
  {name: "triv", fixture: "/tmp/lenfix/triv.cheng", expect: 7},
  {name: "rbytes", fixture: "/tmp/wipv11/rbytes.cheng", expect: 5},
  {name: "s4dbg", fixture: "/tmp/bisect11/s4_debug_readwrite.cheng", expect: 5},
  {name: "rerr", fixture: "/tmp/wipv11/rerr.cheng", expect: 0},
  {name: "s4b", fixture: "/tmp/bisect11/s4b_strconcat_chain_isolated.cheng", expect: 0},
  {name: "nsa", fixture: "/tmp/nsa/nsatest.cheng", expect: 0},
  {name: "f8repro", fixture: "/tmp/f8b/f8repro.cheng", expect: 0},
  {name: "g12", fixture: "/tmp/f11/g12.cheng", expect: 0},
  {name: "iso13", fixture: "/tmp/f13/repro/isolate13.cheng", expect: 0},
  {name: "iso7", fixture: "/tmp/f13/repro/isolate7.cheng", expect: 0},
  {name: "iso9", fixture: "/tmp/f13/repro/isolate9.cheng", expect: 0},
];

// 与 reference_ignite_chain.sh 的终端三站一致。
const DEFAULT_TERMINAL = [
  {name: "triv", fixture: "/tmp/lenfix/triv.cheng", expect: 7},
  {name: "g12", fixture: "/tmp/f11/g12.cheng", expect: 0},
  {name: "f8repro", fixture: "/tmp/f8b/f8repro.cheng", expect: 0},
];

// 与 reference_ignite_chain.sh 的 oracle 六件套一致(固定内置, 不走 matrix tag)。
const DEFAULT_ORACLE = [
  {name: "min", fixture: "/tmp/enum11/minimal/min.cheng", expect: 0},
  {name: "s2", fixture: "/tmp/bisect11/s2_str_seq_clone.cheng", expect: 0},
  {name: "orbytes", fixture: "/tmp/wipv11/rbytes.cheng", expect: 5},
  {name: "onsa", fixture: "/tmp/nsa/nsatest.cheng", expect: 0},
  {name: "os4b", fixture: "/tmp/bisect11/s4b_strconcat_chain_isolated.cheng", expect: 0},
  {name: "oiso13", fixture: "/tmp/f13/repro/isolate13.cheng", expect: 0},
];

function resolveAbsPath(value) {
  const text = String(value);
  return isAbsolute(text) ? text : resolve(text);
}

function resolveExistingDir(value, label) {
  const path = resolveAbsPath(value);
  if (!existsSync(path)) throw new Error(`${label} not found: ${path}`);
  return path;
}

function resolveExistingFile(value, label) {
  const path = resolveAbsPath(value);
  if (!existsSync(path)) throw new Error(`${label} not found: ${path}`);
  return path;
}

function resolveMatrixPath(matrixPathInput) {
  if (!matrixPathInput) return existsSync(DEFAULT_MATRIX_PATH) ? DEFAULT_MATRIX_PATH : null;
  const text = String(matrixPathInput);
  const path = isAbsolute(text) ? text : resolve(CHENG_FUSION_PACKAGE_ROOT, text);
  return existsSync(path) ? path : null;
}

function loadMatrixTagEntries(matrixPath, tag) {
  if (!matrixPath) return [];
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(matrixPath, "utf8"));
  } catch {
    return [];
  }
  if (!parsed || !Array.isArray(parsed.entries)) return [];
  const matrixDir = dirname(matrixPath);
  const out = [];
  for (const entry of parsed.entries) {
    if (entry.planned) continue;
    if (!Array.isArray(entry.tags) || !entry.tags.includes(tag)) continue;
    if (!entry.fixture || typeof entry.expectRc !== "number") continue;
    const fixturePath = isAbsolute(entry.fixture) ? entry.fixture : resolve(matrixDir, entry.fixture);
    out.push({name: entry.name, fixture: fixturePath, expect: entry.expectRc});
  }
  return out;
}

function generateRunId() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
  return `ignite_${stamp}_${randomBytes(3).toString("hex")}`;
}

// 整条链的实体跑在一个自包含 python3 脚本里(而不是 bash), 原因: 每阶段结果都要落成
// 结构化 JSON 追加进 journal.jsonl —— python 有 json 模块能安全转义任意 stderr/路径文本,
// bash 手工拼 JSON 字符串在引号/换行上必错。CONFIG 用 JSON 文本嵌入 + json.loads 解析,
// 不用 python 字面量语法, 避免 true/false/null 和 True/False/None 的手工转换出错。
function renderChainPythonScript(config) {
  const configJson = JSON.stringify(config);
  return `#!/usr/bin/env python3
import json, os, re, subprocess, sys, time, traceback

CONFIG = json.loads(r'''${configJson}''')

W = CONFIG["workDir"]
TREE = CONFIG["treeRoot"]
JOURNAL = os.path.join(W, "journal.jsonl")
PIDFILE = os.path.join(W, "chain.pid")
RSS_CAP = "12884901888"

def log(stage, **fields):
    rec = {"stage": stage, "ts": time.time()}
    rec.update(fields)
    with open(JOURNAL, "a") as f:
        f.write(json.dumps(rec) + "\\n")
    print("[chain] stage=%s" % stage, flush=True)

def cheng_env():
    env = dict(os.environ)
    env["CHENG_PROCESS_MAX_RSS_BYTES"] = RSS_CAP
    env.pop("CHENG_NO_BACKEND_DRIVER_HANDOFF", None)
    env.pop("CHENG_REQUIRE_PURE_PROVIDERS", None)
    return env

def run_cmd(args, timeout):
    t0 = time.time()
    try:
        p = subprocess.run(args, timeout=timeout, capture_output=True, text=True, env=cheng_env(), cwd=TREE)
        return {"rc": p.returncode, "stdout": p.stdout or "", "stderr": p.stderr or "", "wallMs": int((time.time() - t0) * 1000), "timedOut": False}
    except subprocess.TimeoutExpired as e:
        out = e.stdout if isinstance(e.stdout, str) else (e.stdout.decode("utf8", "replace") if e.stdout else "")
        err = e.stderr if isinstance(e.stderr, str) else (e.stderr.decode("utf8", "replace") if e.stderr else "")
        return {"rc": None, "stdout": out, "stderr": err + "\\n[chain] timed out after %dms" % int(timeout * 1000), "wallMs": int((time.time() - t0) * 1000), "timedOut": True}

def compile_fixture(driver, src, out, timeout=300):
    args = [driver, "system-link-exec", "--root:%s" % TREE, "--in:%s" % src, "--emit:exe", "--link-providers", "--target:arm64-apple-darwin", "--out:%s" % out]
    return run_cmd(args, timeout)

def run_bin(path, timeout=15):
    return run_cmd([path], timeout)

ZC_TOTAL_RE = re.compile(r"^ZC_NOT_READY_TOTAL count=(\\d+)", re.M)
ZC_LINE_RE = re.compile(r"^ZC_NOT_READY idx=\\d+/\\d+ function=(\\S+) body_kind=(\\S+) .*?\\bbail=(-?\\d+)\\b", re.M)

def parse_zc(text):
    total_match = ZC_TOTAL_RE.search(text)
    bails = [{"function": m.group(1), "bodyKind": m.group(2), "bail": int(m.group(3))} for m in ZC_LINE_RE.finditer(text)]
    total = int(total_match.group(1)) if total_match else len(bails)
    return total, bails

def main():
    drv_out = os.path.join(W, "DRV")
    r = compile_fixture(CONFIG["seed"], CONFIG["driverSrc"], drv_out, timeout=300)
    drv_ok = r["rc"] == 0 and os.path.exists(drv_out) and os.access(drv_out, os.X_OK)
    log("drvBake", rc=r["rc"], wallMs=r["wallMs"], ok=drv_ok, timedOut=r["timedOut"], stderrTail=r["stderr"][-1500:])
    if not drv_ok:
        return "ABORTED_DRV_BAKE_FAILED"

    t0 = time.time()
    probe_results = []
    for item in CONFIG["probes"]:
        outp = os.path.join(W, "p_%s.exe" % item["name"])
        cr = compile_fixture(drv_out, item["fixture"], outp, timeout=300)
        if cr["rc"] != 0 or not os.path.exists(outp):
            probe_results.append({"name": item["name"], "rc": None, "expect": item["expect"], "pass": False, "note": "compile failed", "compileStderrTail": cr["stderr"][-800:]})
            continue
        rr = run_bin(outp, 10)
        probe_results.append({"name": item["name"], "rc": rr["rc"], "expect": item["expect"], "pass": rr["rc"] == item["expect"], "timedOut": rr["timedOut"]})
    pass_count = sum(1 for x in probe_results if x["pass"])
    log("probes", wallMs=int((time.time() - t0) * 1000), passCount=pass_count, total=len(probe_results), probes=probe_results)

    if not CONFIG["stages"]["gen2"]:
        return "PROBES_ONLY_COMPLETE" if pass_count == len(probe_results) else "PROBES_ONLY_COMPLETE_WITH_FAILURES"

    gen2_out = os.path.join(W, "GEN2")
    r2 = compile_fixture(drv_out, CONFIG["driverSrc"], gen2_out, timeout=1800)
    zc_total, bails = parse_zc((r2["stdout"] or "") + "\\n" + (r2["stderr"] or ""))
    gen2_ok = r2["rc"] == 0 and os.path.exists(gen2_out) and os.access(gen2_out, os.X_OK)
    log("gen2Bake", rc=r2["rc"], wallMs=r2["wallMs"], zcTotal=zc_total, bails=bails, ok=gen2_ok, timedOut=r2["timedOut"], stderrTail=r2["stderr"][-1500:])
    if not gen2_ok:
        return "ABORTED_GEN2_BAKE_FAILED"

    terminal_ok = True
    if CONFIG["stages"]["terminal"]:
        t0 = time.time()
        term_results = []
        for item in CONFIG["terminal"]:
            outp = os.path.join(W, "t_%s.exe" % item["name"])
            cr = compile_fixture(gen2_out, item["fixture"], outp, timeout=300)
            if cr["rc"] != 0 or not os.path.exists(outp):
                term_results.append({"name": item["name"], "compileRc": cr["rc"], "runRc": None, "expect": item["expect"], "pass": False, "stderrTail": cr["stderr"][-800:]})
                continue
            rr = run_bin(outp, 15)
            term_results.append({"name": item["name"], "compileRc": cr["rc"], "runRc": rr["rc"], "expect": item["expect"], "pass": rr["rc"] == item["expect"], "stderrTail": rr["stderr"][-800:]})
        terminal_ok = all(x["pass"] for x in term_results)
        log("terminal", wallMs=int((time.time() - t0) * 1000), passCount=sum(1 for x in term_results if x["pass"]), total=len(term_results), terminal=term_results)

    oracle_ok = True
    if CONFIG["stages"]["oracle"]:
        t0 = time.time()
        oracle_results = []
        for item in CONFIG["oracle"]:
            outp = os.path.join(W, "o_%s.exe" % item["name"])
            cr = compile_fixture(gen2_out, item["fixture"], outp, timeout=300)
            if cr["rc"] != 0 or not os.path.exists(outp):
                oracle_results.append({"name": item["name"], "rc": None, "expect": item["expect"], "pass": False, "note": "compile failed"})
                continue
            rr = run_bin(outp, 10)
            oracle_results.append({"name": item["name"], "rc": rr["rc"], "expect": item["expect"], "pass": rr["rc"] == item["expect"]})
        oracle_ok = all(x["pass"] for x in oracle_results)
        log("oracle", wallMs=int((time.time() - t0) * 1000), passCount=sum(1 for x in oracle_results if x["pass"]), total=len(oracle_results), oracle=oracle_results)

    if CONFIG["stages"]["gen3"]:
        if not CONFIG["maskedCmpPath"]:
            log("gen3", bakeRc=None, maskedIdentical=None, note="tools/macho_masked_cmp.py not available; gen3 stage skipped")
        else:
            gen3_out = os.path.join(W, "GEN3")
            r3 = compile_fixture(gen2_out, CONFIG["driverSrc"], gen3_out, timeout=1800)
            gen3_ok = r3["rc"] == 0 and os.path.exists(gen3_out)
            if gen3_ok:
                cmp_r = subprocess.run(["python3", CONFIG["maskedCmpPath"], gen2_out, gen3_out], capture_output=True, text=True, timeout=60)
                log("gen3", bakeRc=r3["rc"], wallMs=r3["wallMs"], maskedIdentical=(cmp_r.returncode == 0), maskedOutput=(cmp_r.stdout + cmp_r.stderr).strip())
            else:
                log("gen3", bakeRc=r3["rc"], wallMs=r3["wallMs"], maskedIdentical=None, note="gen3 bake failed", stderrTail=r3["stderr"][-1500:])

    gen2_gate = "GREEN" if zc_total == 0 else "ZC_NOT_READY_present"
    return "COMPLETE_gen2=%s_probes=%s_terminal=%s_oracle=%s" % (
        gen2_gate,
        "PASS" if pass_count == len(probe_results) else "FAIL",
        "PASS" if terminal_ok else "FAIL",
        "PASS" if oracle_ok else "FAIL",
    )

with open(PIDFILE, "w") as f:
    f.write(str(os.getpid()))

try:
    verdict = main()
    log("done", verdict=verdict)
except Exception:
    log("done", verdict="CRASHED", error=traceback.format_exc())
finally:
    try:
        os.remove(PIDFILE)
    except OSError:
        pass
`;
}

function readJournal(journalPath) {
  if (!existsSync(journalPath)) return [];
  const text = readFileSync(journalPath, "utf8");
  const records = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed));
    } catch {
      // 最后一行可能在被追加时读到, 容忍并跳过截断行, 不当成失败.
    }
  }
  return records;
}

function isPidAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function startIgnitionChain(input) {
  const treeRoot = resolveExistingDir(input.treeRoot || DEFAULT_TREE_ROOT, "treeRoot");
  const seed = resolveExistingFile(input.seed || CHENG_STAGE3_DRIVER, "seed");
  const driverSrc = join(treeRoot, DRIVER_SRC_RELATIVE);
  if (!existsSync(driverSrc)) throw new Error(`backend driver source not found under treeRoot: ${driverSrc}`);

  const workDirBase = resolveAbsPath(input.workDir || DEFAULT_WORK_DIR);
  mkdirSync(workDirBase, {recursive: true});
  const runId = generateRunId();
  const runDir = join(workDirBase, runId);
  mkdirSync(runDir, {recursive: true});

  const stagesInput = input.stages || {};
  const stages = {
    gen2: stagesInput.gen2 !== false,
    terminal: stagesInput.terminal !== false,
    oracle: stagesInput.oracle !== false,
    gen3: stagesInput.gen3 === true,
  };

  const matrixPath = resolveMatrixPath(input.matrixPath);
  const matrixProbes = loadMatrixTagEntries(matrixPath, "probe");
  const matrixTerminal = loadMatrixTagEntries(matrixPath, "terminal");
  const probes = matrixProbes.length > 0 ? matrixProbes : DEFAULT_PROBES;
  const terminal = matrixTerminal.length > 0 ? matrixTerminal : DEFAULT_TERMINAL;
  const oracle = DEFAULT_ORACLE;

  const maskedCmpAvailable = existsSync(MASKED_CMP_PATH);

  const config = {
    treeRoot,
    seed,
    workDir: runDir,
    driverSrc,
    stages,
    probes,
    terminal,
    oracle,
    maskedCmpPath: maskedCmpAvailable ? MASKED_CMP_PATH : null,
  };

  const scriptPath = join(runDir, "chain.py");
  writeFileSync(scriptPath, renderChainPythonScript(config), {mode: 0o755});
  const journalPath = join(runDir, "journal.jsonl");
  writeFileSync(journalPath, "");

  const outFd = openSync(join(runDir, "chain.stdout.log"), "a");
  const errFd = openSync(join(runDir, "chain.stderr.log"), "a");
  const child = Bun.spawn(["python3", scriptPath], {cwd: runDir, stdout: outFd, stderr: errFd, stdin: "ignore", detached: true});
  child.unref();

  return jsonResult({
    schema: "cheng_ignition_chain.start.v1",
    runId,
    runDir,
    journalPath,
    scriptPath,
    pid: child.pid,
    treeRoot,
    seed,
    stages,
    probeCount: probes.length,
    terminalCount: terminal.length,
    oracleCount: oracle.length,
    matrixPath,
    usedMatrixProbes: matrixProbes.length > 0,
    usedMatrixTerminal: matrixTerminal.length > 0,
    gen3MaskedCmpAvailable: maskedCmpAvailable,
    note: "Chain started detached; poll with {action:'status', runId, workDir}. Stages gen2/terminal/oracle/gen3 self-recompile the whole backend driver (~20+ minutes each); probes-only (stages:{gen2:false}) completes in ~3 minutes.",
  });
}

async function statusIgnitionChain(input) {
  if (!input.runId) throw new Error("action=status requires runId");
  const workDirBase = resolveAbsPath(input.workDir || DEFAULT_WORK_DIR);
  const runDir = join(workDirBase, input.runId);
  if (!existsSync(runDir)) throw new Error(`run not found: ${runDir}`);

  const journalPath = join(runDir, "journal.jsonl");
  const pidPath = join(runDir, "chain.pid");
  const records = readJournal(journalPath);
  const byStage = new Map();
  for (const record of records) byStage.set(record.stage, record);
  const stagesDone = [...byStage.keys()];

  let running = false;
  if (existsSync(pidPath)) {
    const pid = Number(readFileSync(pidPath, "utf8").trim());
    running = isPidAlive(pid);
  }

  const done = byStage.get("done") || null;
  let verdictSoFar;
  if (done) verdictSoFar = done.verdict;
  else if (running) verdictSoFar = "IN_PROGRESS";
  else if (stagesDone.length > 0) verdictSoFar = "STALLED_NO_DONE_RECORD";
  else verdictSoFar = "STARTING_OR_CRASHED_BEFORE_FIRST_STAGE";

  return jsonResult({
    schema: "cheng_ignition_chain.status.v1",
    runId: input.runId,
    runDir,
    journalPath,
    running,
    stagesDone,
    drvBake: byStage.get("drvBake") || null,
    probes: byStage.get("probes") || null,
    gen2Bake: byStage.get("gen2Bake") || null,
    terminal: byStage.get("terminal") || null,
    oracle: byStage.get("oracle") || null,
    gen3: byStage.get("gen3") || null,
    done,
    verdictSoFar,
  });
}

var initChengIgnitionChainModule = defineModuleInitializer(() => {
  initChengToolkitModule();
  chengIgnitionChainInputSchema = zodSchema.strictObject({
    action: zodSchema.enum(["start", "status"]).describe("start = render+launch a detached ignition chain run; status = poll an existing run by runId."),
    treeRoot: zodSchema.string().optional().describe("[start] Cheng project tree root passed to --root:. Defaults to /tmp/f23/tree."),
    seed: zodSchema.string().optional().describe("[start] Cold compiler binary used to bake the DRV stage. Defaults to the cheng.stage3 bootstrap seed."),
    workDir: zodSchema.string().optional().describe("Base directory for run subdirectories (runId is appended). Defaults to /tmp/f23/chain_runs. Also read by action=status to locate the run."),
    stages: zodSchema.strictObject({
      gen2: zodSchema.boolean().optional().describe("Self-recompile the backend driver with itself (~20+ min). Default true. Set false for a probes-only run."),
      terminal: zodSchema.boolean().optional().describe("Run the terminal fixture net (triv/g12/f8repro by default) with the GEN2 driver. Default true. No-op if gen2=false."),
      oracle: zodSchema.boolean().optional().describe("Run the fixed 6-fixture oracle net with the GEN2 driver. Default true. No-op if gen2=false."),
      gen3: zodSchema.boolean().optional().describe("Bake a GEN3 driver from GEN2 and masked-byte-compare it against GEN2 (fixed-point check). Default false (this is the slowest, most optional stage)."),
    }).optional().describe("[start] Which chain stages to run beyond drvBake+probes."),
    matrixPath: zodSchema.string().optional().describe("[start] fixtures/ignition/matrix.json-shaped file to source probe/terminal fixtures from tags 'probe'/'terminal'. Defaults to the fusion package's own matrix.json. Falls back to a built-in fixed list when no matching tagged entries exist."),
    runId: zodSchema.string().optional().describe("[status] The runId returned by a prior action=start call."),
  });
  ChengIgnitionChainTool = createChengTextTool({
    name: "cheng_ignition_chain",
    searchHint: "start/poll a journaled background Cheng ignition chain (DRV bake -> probes -> GEN2 self-bake -> terminal/oracle nets -> optional GEN3+masked fixed-point compare)",
    inputSchema: chengIgnitionChainInputSchema,
    description: "Productizes the manual ignition determinism chain (fixtures/ignition/reference_ignite_chain.sh) as a journaled background run, because the full chain (GEN2/GEN3 self-recompiles of the backend driver) takes 20+ minutes per stage and cannot block a single MCP tool call. action=start renders a self-contained python3 chain script into workDir/<runId>/, launches it detached (survives this MCP call returning), and returns {runId, journalPath}. Each stage (drvBake, probes, gen2Bake, terminal, oracle, gen3) appends exactly one structured JSON line to journal.jsonl as it completes. action=status reads that journal plus a pid file and returns {running, stagesDone, <perStageResult>, verdictSoFar} for polling. Set stages.gen2=false for a fast (~3 min) probes-only smoke run; leave gen3=false (the default) unless you specifically need the GEN2/GEN3 fixed-point byte comparison.",
    prompt: "Use action=start to kick off a chain run (pass stages:{gen2:false,terminal:false,oracle:false,gen3:false} for a quick probes-only check), then poll with action=status + the returned runId until stagesDone includes 'done'. Never expect a single call to block until the chain finishes.",
    toAutoClassifierInput: (input) => `ignition_chain:${input.action}:${input.runId || "new"}`,
    async execute(input) {
      if (input.action === "start") return startIgnitionChain(input);
      return statusIgnitionChain(input);
    },
  });
});

export {ChengIgnitionChainTool, initChengIgnitionChainModule};
