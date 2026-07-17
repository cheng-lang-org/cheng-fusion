// item16 cheng_ignition_chain: isolated commit ablation + atomic completion sentinel.
import {chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, watch, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {spawn, spawnSync} from "node:child_process";
import {startMcp, assertTrue} from "./mcp_client.ts";

function git(args: string[], cwd?: string): string {
  const result = spawnSync("git", args, {cwd, encoding: "utf8", env: {...process.env, GIT_OPTIONAL_LOCKS: "0"}});
  assertTrue(result.status === 0, `git ${args.join(" ")} succeeds: ${result.stderr}`);
  return result.stdout.trim();
}

function waitForFile(path: string, timeoutMs: number): Promise<void> {
  if (existsSync(path)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      watcher.close();
      if (existsSync(path)) resolve();
      else reject(new Error("timed out waiting for " + path));
    }, timeoutMs);
    const watcher = watch(dirname(path), () => {
      if (!existsSync(path)) return;
      clearTimeout(timer);
      watcher.close();
      resolve();
    });
    if (existsSync(path)) {
      clearTimeout(timer);
      watcher.close();
      resolve();
    }
  });
}

async function startRunLockHolder(lockPath: string) {
  const script = [
    "import fcntl, json, os, sys, time",
    "path = sys.argv[1]",
    "fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)",
    "fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)",
    "os.write(fd, (json.dumps({'pid': os.getpid(), 'startedAt': time.time()}) + '\\n').encode())",
    "os.fsync(fd)",
    "print('LOCKED', flush=True)",
    "sys.stdin.buffer.read()",
  ].join("\n");
  const child = spawn("python3", ["-c", script, lockPath], {stdio: ["pipe", "pipe", "pipe"]});
  let stdout = "";
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  await new Promise<void>((resolve, reject) => {
    let ready = false;
    const timer = setTimeout(() => {
      if (!ready) {
        child.kill("SIGKILL");
        reject(new Error(`lock holder did not become ready: stdout=${stdout} stderr=${stderr}`));
      }
    }, 3000);
    const onData = (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (!stdout.includes("LOCKED")) return;
      ready = true;
      clearTimeout(timer);
      child.stdout.off("data", onData);
      resolve();
    };
    child.stdout.on("data", onData);
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (!ready) reject(new Error(`lock holder exited before ready: code=${code} signal=${signal} stderr=${stderr}`));
    });
  });
  return child;
}

async function main() {
  const temp = mkdtempSync(join(tmpdir(), "fusion-item16-"));
  const baseTree = join(temp, "base");
  const workDir = join(temp, "runs-'''-safe");
  const driverSrc = join(baseTree, "src/core/tooling/backend_driver_dispatch_min.cheng");
  mkdirSync(dirname(driverSrc), {recursive: true});
  try {
    git(["init", "-q", baseTree]);
    writeFileSync(join(baseTree, "cheng-package.toml"), "package_id = \"pkg://fixture/ignition-ablation\"\nmodule_prefix = \"fixture\"\n");
    writeFileSync(driverSrc, "func marker(): I32 { return 1 }\n");
    git(["-C", baseTree, "add", "."]);
    git(["-C", baseTree, "-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "commit", "-q", "-m", "base"]);
    writeFileSync(driverSrc, "func marker(): I32 { return 2 }\n");
    git(["-C", baseTree, "add", "."]);
    git(["-C", baseTree, "-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "commit", "-q", "-m", "change"]);
    const middle = git(["-C", baseTree, "rev-parse", "HEAD"]);
    writeFileSync(driverSrc, "func marker(): I32 { return 3 }\n");
    git(["-C", baseTree, "add", "."]);
    git(["-C", baseTree, "-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "commit", "-q", "-m", "dependent-change"]);
    const head = git(["-C", baseTree, "rev-parse", "HEAD"]);
    const indexBefore = readFileSync(join(baseTree, ".git/index"));

    const mcp = startMcp({}, temp);
    try {
      await mcp.initialize({rootUri: `file://${temp}`});
      const started = await mcp.callTool("cheng_ignition_chain", {
        action: "start",
        baseTree,
        revertCommits: [head, middle],
        seed: "/usr/bin/false",
        workDir,
        stages: {gen2: false, terminal: false, oracle: false, gen3: false},
      });
      assertTrue(started.isError !== true, "ablation chain starts: " + JSON.stringify(started.parsed));
      const run = started.parsed;
      assertTrue(run.ablation?.baseHead === head, "start result records the exact base HEAD");
      const inputsDir = join(run.runDir, "inputs");
      assertTrue(run.treeRoot.startsWith(inputsDir + "/") && run.seed.startsWith(inputsDir + "/"), "runner consumes only run-local tree and seed snapshots");
      assertTrue(run.matrixSnapshotPath.startsWith(inputsDir + "/") && run.inputSnapshots.every((item: any) => item.path.startsWith(inputsDir + "/")), "matrix fixtures and every recorded provenance input are run-local snapshots");
      assertTrue(readFileSync(join(run.treeRoot, "src/core/tooling/backend_driver_dispatch_min.cheng"), "utf8").includes("return 1"), "isolated clone contains the reversed commit");
      assertTrue(readFileSync(driverSrc, "utf8").includes("return 3"), "base tree content remains unchanged");
      assertTrue(readFileSync(join(baseTree, ".git/index")).equals(indexBefore), "ablation preparation does not rewrite the base Git index");
      assertTrue(git(["-C", baseTree, "rev-parse", "HEAD"]) === head && git(["-C", baseTree, "status", "--porcelain=v1", "--untracked-files=all"]) === "", "base tree HEAD and status remain unchanged");

      try {
        await waitForFile(run.completionSentinelPath, 5000);
      } catch (error) {
        const stdout = existsSync(join(run.runDir, "chain.stdout.log")) ? readFileSync(join(run.runDir, "chain.stdout.log"), "utf8") : "";
        const stderr = existsSync(join(run.runDir, "chain.stderr.log")) ? readFileSync(join(run.runDir, "chain.stderr.log"), "utf8") : "";
        throw new Error(String(error) + "\nstdout:\n" + stdout + "\nstderr:\n" + stderr);
      }
      const status = await mcp.callTool("cheng_ignition_chain", {action: "status", runId: run.runId, workDir});
      assertTrue(status.isError !== true, "status reads completed run");
      assertTrue(status.parsed.completionConsistent === true, "journal done record and atomic sentinel match");
      assertTrue(status.parsed.done?.verdict === "ABORTED_DRV_BAKE_FAILED", "failed seed produces an explicit terminal verdict");
      assertTrue(status.parsed.done?.lastStage === "drvBake", "sentinel records the last completed stage");

      const originalJournal = readFileSync(run.journalPath, "utf8");
      const originalClaim = readFileSync(run.completionClaimPath, "utf8");
      const originalSentinel = readFileSync(run.completionSentinelPath, "utf8");
      const rerun = spawnSync("python3", [run.scriptPath], {cwd: run.runDir, encoding: "utf8"});
      assertTrue(rerun.status !== 0, "persistent O_EXCL run lock rejects a second chain.py process for the same run");
      assertTrue(readFileSync(run.journalPath, "utf8") === originalJournal, "rejected second process cannot append another done record");

      writeFileSync(run.journalPath, originalJournal + JSON.stringify(status.parsed.done) + "\n");
      const duplicateDone = await mcp.callTool("cheng_ignition_chain", {action: "status", runId: run.runId, workDir});
      assertTrue(duplicateDone.isError === true, "two byte-identical journal done lines hard-fail as corruption");
      writeFileSync(run.journalPath, originalJournal);

      const sentinel = JSON.parse(readFileSync(run.completionSentinelPath, "utf8"));
      writeFileSync(run.completionSentinelPath, JSON.stringify({...sentinel, injected: "TAMPERED"}) + "\n");
      const inconsistent = await mcp.callTool("cheng_ignition_chain", {action: "status", runId: run.runId, workDir});
      assertTrue(inconsistent.isError === true, "extra completion fields hard-fail instead of producing a consumable status");
      writeFileSync(run.completionSentinelPath, originalSentinel);

      const journalRecords = originalJournal.trimEnd().split("\n").map((line) => JSON.parse(line));
      const forgedVerdict = {
        ...sentinel,
        verdict: "PROBES_ONLY_COMPLETE_gen2=SKIPPED_probes=PASS_terminal=SKIPPED_oracle=SKIPPED_gen3=SKIPPED",
      };
      const journalPrefix = journalRecords.slice(0, -1).map((record) => JSON.stringify(record)).join("\n") + "\n";
      writeFileSync(run.journalPath, journalPrefix + JSON.stringify(forgedVerdict) + "\n");
      writeFileSync(run.completionClaimPath, JSON.stringify(forgedVerdict) + "\n");
      writeFileSync(run.completionSentinelPath, JSON.stringify(forgedVerdict) + "\n");
      const consistentlyForgedVerdict = await mcp.callTool("cheng_ignition_chain", {action: "status", runId: run.runId, workDir});
      assertTrue(consistentlyForgedVerdict.isError === true, "three byte-consistent completion artifacts cannot override the verdict recomputed from raw stages");

      const forgedStageRecords = journalRecords.map((record) => record.stage === "drvBake" ? {...record, ok: true} : record);
      writeFileSync(run.journalPath, forgedStageRecords.map((record) => JSON.stringify(record)).join("\n") + "\n");
      writeFileSync(run.completionClaimPath, originalClaim);
      writeFileSync(run.completionSentinelPath, originalSentinel);
      const forgedStage = await mcp.callTool("cheng_ignition_chain", {action: "status", runId: run.runId, workDir});
      assertTrue(forgedStage.isError === true, "a forged stage ok flag that contradicts rc/artifact facts hard-fails");
      writeFileSync(run.journalPath, originalJournal);
      writeFileSync(run.completionClaimPath, originalClaim);
      writeFileSync(run.completionSentinelPath, originalSentinel);

      const completingRunId = "ignite_20990101T000000_abc123";
      const completingDir = join(workDir, completingRunId);
      mkdirSync(completingDir);
      const lockHolder = await startRunLockHolder(join(completingDir, "chain.lock"));
      const completingProvenance = {...status.parsed.provenance, ts: Date.now() / 1000};
      const completingRecord = {stage: "done", ts: Date.now() / 1000, pid: lockHolder.pid, verdict: "CRASHED", lastStage: "provenance", error: "Traceback (most recent call last):\nRuntimeError: interrupted fixture"};
      writeFileSync(join(completingDir, "journal.jsonl"), [completingProvenance, completingRecord].map((record) => JSON.stringify(record)).join("\n") + "\n");
      writeFileSync(join(completingDir, "completion.claim.json"), JSON.stringify(completingRecord) + "\n");
      writeFileSync(join(completingDir, "chain.pid"), String(lockHolder.pid));
      try {
        const completing = await mcp.callTool("cheng_ignition_chain", {action: "status", runId: completingRunId, workDir});
        assertTrue(completing.parsed.verdictSoFar === "COMPLETING" && completing.parsed.runLockState === "LOCKED" && !completing.parsed.stagesDone.includes("done"), "contended OS run lock plus partial completion artifacts is a non-terminal COMPLETING state");
      } finally {
        lockHolder.stdin.end();
        await new Promise<void>((resolve) => lockHolder.once("exit", () => resolve()));
      }

      const corruptRunId = "ignite_20990101T000001_def456";
      const corruptDir = join(workDir, corruptRunId);
      mkdirSync(corruptDir);
      writeFileSync(join(corruptDir, "journal.jsonl"), '{"stage":"provenance"}\nnot-json\n');
      const corrupt = await mcp.callTool("cheng_ignition_chain", {action: "status", runId: corruptRunId, workDir});
      assertTrue(corrupt.isError === true, "terminated malformed journal hard-fails instead of skipping damaged lines");

      const missingJournalRunId = "ignite_20990101T000005_d1e2f3";
      mkdirSync(join(workDir, missingJournalRunId));
      const missingJournal = await mcp.callTool("cheng_ignition_chain", {action: "status", runId: missingJournalRunId, workDir});
      assertTrue(missingJournal.isError === true, "a start-created journal is mandatory; deletion is corruption, not STARTING");

      const danglingArtifacts = [
        {runId: "ignite_20990101T000006_e1f2a3", name: "journal.jsonl"},
        {runId: "ignite_20990101T000007_f1a2b3", name: "done.json"},
        {runId: "ignite_20990101T000008_a2b3c4", name: "completion.claim.json"},
        {runId: "ignite_20990101T000009_b2c3d4", name: "chain.pid"},
        {runId: "ignite_20990101T000010_c2d3e4", name: "chain.lock"},
      ];
      for (const artifact of danglingArtifacts) {
        const dir = join(workDir, artifact.runId);
        mkdirSync(dir);
        if (artifact.name !== "journal.jsonl") writeFileSync(join(dir, "journal.jsonl"), "");
        symlinkSync("missing-target", join(dir, artifact.name));
        const dangling = await mcp.callTool("cheng_ignition_chain", {action: "status", runId: artifact.runId, workDir});
        assertTrue(dangling.isError === true, `dangling symlink is rejected for ${artifact.name}`);
      }

      const reusedPidRunId = "ignite_20990101T000003_b1c2d3";
      const reusedPidDir = join(workDir, reusedPidRunId);
      mkdirSync(reusedPidDir);
      writeFileSync(join(reusedPidDir, "journal.jsonl"), JSON.stringify({...status.parsed.provenance, ts: Date.now() / 1000}) + "\n");
      writeFileSync(join(reusedPidDir, "chain.lock"), "unlocked\n");
      writeFileSync(join(reusedPidDir, "chain.pid"), String(process.pid));
      const reusedPid = await mcp.callTool("cheng_ignition_chain", {action: "status", runId: reusedPidRunId, workDir});
      assertTrue(reusedPid.isError !== true && reusedPid.parsed.running === false && reusedPid.parsed.runLockState === "UNLOCKED" && reusedPid.parsed.verdictSoFar === "STALLED_NO_DONE_RECORD", "a live reused PID cannot override an unlocked run lock");

      const duplicateStageRunId = "ignite_20990101T000004_c1d2e3";
      const duplicateStageDir = join(workDir, duplicateStageRunId);
      mkdirSync(duplicateStageDir);
      writeFileSync(join(duplicateStageDir, "journal.jsonl"), [
        {...status.parsed.provenance, ts: 1},
        {...status.parsed.drvBake, ts: 2},
        {...status.parsed.drvBake, ts: 3},
      ].map((record) => JSON.stringify(record)).join("\n") + "\n");
      const duplicateStage = await mcp.callTool("cheng_ignition_chain", {action: "status", runId: duplicateStageRunId, workDir});
      assertTrue(duplicateStage.isError === true, "duplicate non-done journal stages hard-fail instead of last-record-wins");

      const skippedStageRunId = "ignite_20990101T000011_d2e3f4";
      const skippedStageDir = join(workDir, skippedStageRunId);
      mkdirSync(skippedStageDir);
      const syntheticHash = `sha256:${"0".repeat(64)}`;
      const syntheticProvenance = {...status.parsed.provenance, ts: 1, stages: {gen2: true, terminal: true, oracle: true, gen3: false}};
      const syntheticDrv = {...status.parsed.drvBake, ts: 2, rc: 0, ok: true, timedOut: false, outputOverflow: false, sha256: syntheticHash};
      const syntheticProbes = {stage: "probes", ts: 3, wallMs: 0, passCount: 1, total: 1, probes: [
        {name: "probe", rc: 0, expect: 0, pass: true, timedOut: false, outputOverflow: false, stdoutLog: "stdout", stderrLog: "stderr"},
      ]};
      const syntheticGen2 = {...syntheticDrv, stage: "gen2Bake", ts: 4, zcTotal: 0, bails: []};
      const syntheticOracle = {stage: "oracle", ts: 5, wallMs: 0, passCount: 1, total: 1, oracle: [
        {name: "oracle", rc: 0, expect: 0, pass: true, timedOut: false, outputOverflow: false, stdoutLog: "stdout", stderrLog: "stderr"},
      ]};
      writeFileSync(join(skippedStageDir, "journal.jsonl"), [syntheticProvenance, syntheticDrv, syntheticProbes, syntheticGen2, syntheticOracle].map((record) => JSON.stringify(record)).join("\n") + "\n");
      const skippedStage = await mcp.callTool("cheng_ignition_chain", {action: "status", runId: skippedStageRunId, workDir});
      assertTrue(skippedStage.isError === true, "an oracle record cannot skip an enabled terminal stage");

      const unknownStageRunId = "ignite_20990101T000012_e2f3a4";
      const unknownStageDir = join(workDir, unknownStageRunId);
      mkdirSync(unknownStageDir);
      writeFileSync(join(unknownStageDir, "journal.jsonl"), [status.parsed.provenance, {stage: "invented", ts: 2}].map((record) => JSON.stringify(record)).join("\n") + "\n");
      const unknownStage = await mcp.callTool("cheng_ignition_chain", {action: "status", runId: unknownStageRunId, workDir});
      assertTrue(unknownStage.isError === true, "unknown journal stages hard-fail");

      const traversal = await mcp.callTool("cheng_ignition_chain", {action: "status", runId: "../escape", workDir});
      assertTrue(traversal.isError === true, "status rejects path-traversal runId before filesystem access");
      const aliasedRunId = "ignite_20990101T000002_a1b2c3";
      symlinkSync(run.runDir, join(workDir, aliasedRunId), "dir");
      const aliasedStatus = await mcp.callTool("cheng_ignition_chain", {action: "status", runId: aliasedRunId, workDir});
      assertTrue(aliasedStatus.isError === true, "status rejects a symlink-aliased run directory");

      const invalidStages = await mcp.callTool("cheng_ignition_chain", {
        action: "start", baseTree, revertCommits: [head, middle], seed: "/usr/bin/false", workDir,
        stages: {gen2: false, gen3: true},
      });
      assertTrue(invalidStages.isError === true, "gen3=true with gen2=false hard-fails before creating a run");

      const protocolFixture = join(temp, "protocol-fixture.cheng");
      const protocolMatrix = join(temp, "protocol-matrix.json");
      writeFileSync(protocolFixture, "fn main(): int32 =\n    return 0\n");
      writeFileSync(protocolMatrix, JSON.stringify({entries: [
        {name: "protocol-probe", tags: ["probe"], fixture: protocolFixture, expectRc: 0},
        {name: "protocol-terminal", tags: ["terminal"], fixture: protocolFixture, expectRc: 0},
      ]}));
      const protocolCases = [
        {
          name: "valid-empty-census",
          lines: ["ZC_NOT_READY_TOTAL count=0"],
          verdict: "COMPLETE_gen2=GREEN_probes=PASS_terminal=SKIPPED_oracle=SKIPPED_gen3=SKIPPED",
        },
        {
          name: "total-zero-with-entry",
          lines: [
            "ZC_NOT_READY idx=0/1 function=fnA body_kind=return detail=callee line=1 fz_kind=3 stmt_kind=2 bail=44 slot_diag=none",
            "ZC_NOT_READY_TOTAL count=0",
          ],
          error: "disagrees with entry count",
        },
        {name: "duplicate-total", lines: ["ZC_NOT_READY_TOTAL count=0", "ZC_NOT_READY_TOTAL count=0"], error: "exactly one TOTAL"},
        {
          name: "missing-total",
          lines: ["ZC_NOT_READY idx=0/1 function=fnA body_kind=return detail=callee line=1 fz_kind=3 stmt_kind=2 bail=44 slot_diag=none"],
          error: "exactly one TOTAL",
        },
      ];
      for (const protocol of protocolCases) {
        const protocolSeed = join(temp, `${protocol.name}-seed.py`);
        const protocolText = protocol.lines.join("\n") + "\n";
        writeFileSync(protocolSeed, [
          "#!/usr/bin/env python3",
          "import os, shutil, sys",
          "out = next(arg.split(':', 1)[1] for arg in sys.argv[1:] if arg.startswith('--out:'))",
          "source = next(arg.split(':', 1)[1] for arg in sys.argv[1:] if arg.startswith('--in:'))",
          "if os.path.basename(sys.argv[0]) == 'seed':",
          "    shutil.copyfile(sys.argv[0], out)",
          "    os.chmod(out, 0o755)",
          "elif os.path.basename(sys.argv[0]) == 'DRV' and source.endswith('backend_driver_dispatch_min.cheng'):",
          "    shutil.copyfile(sys.argv[0], out)",
          "    os.chmod(out, 0o755)",
          `    sys.stderr.write(${JSON.stringify(protocolText)})`,
          "else:",
          "    with open(out, 'w') as f:",
          "        f.write('#!/bin/sh\\nexit 0\\n')",
          "    os.chmod(out, 0o755)",
        ].join("\n") + "\n");
        chmodSync(protocolSeed, 0o755);
        const protocolRun = await mcp.callTool("cheng_ignition_chain", {
          action: "start", treeRoot: baseTree, seed: protocolSeed, workDir,
          matrixPath: protocolMatrix,
          stages: {gen2: true, terminal: false, oracle: false, gen3: false},
        });
        assertTrue(protocolRun.isError !== true, `${protocol.name} fixture chain starts`);
        await waitForFile(protocolRun.parsed.completionSentinelPath, 5000);
        const protocolStatus = await mcp.callTool("cheng_ignition_chain", {action: "status", runId: protocolRun.parsed.runId, workDir});
        if (protocol.error) {
          assertTrue(protocolStatus.isError !== true
            && protocolStatus.parsed.done?.verdict === "CRASHED"
            && protocolStatus.parsed.done?.lastStage === "probes"
            && protocolStatus.parsed.gen2Bake === null
            && protocolStatus.parsed.done?.error.includes(protocol.error),
          `${protocol.name} is an explicit CFAIL and never becomes a green gen2Bake`);
        } else {
          assertTrue(protocolStatus.isError !== true
            && protocolStatus.parsed.done?.verdict === protocol.verdict
            && protocolStatus.parsed.gen2Bake?.zcTotal === 0
            && protocolStatus.parsed.gen2Bake?.bails.length === 0,
          "the canonical single TOTAL=0 protocol produces a recomputed green verdict");
        }
      }

      const missingMatrixPath = join(temp, "matrix-missing-fixture.json");
      const unusedWorkDir = join(temp, "must-not-exist-matrix-preflight");
      writeFileSync(missingMatrixPath, JSON.stringify({entries: [
        {name: "missing-probe", tags: ["probe"], fixture: "not-there.cheng", expectRc: 0},
        {name: "terminal", tags: ["terminal"], fixture: driverSrc, expectRc: 0},
      ]}));
      const missingMatrix = await mcp.callTool("cheng_ignition_chain", {
        action: "start", treeRoot: baseTree, seed: "/usr/bin/false", workDir: unusedWorkDir,
        matrixPath: missingMatrixPath, stages: {gen2: false},
      });
      assertTrue(missingMatrix.isError === true && !existsSync(unusedWorkDir), "missing tagged fixture hard-fails before creating workDir/runDir");

      const invalidPlannedMatrixPath = join(temp, "matrix-invalid-planned.json");
      const invalidPlannedWorkDir = join(temp, "must-not-exist-invalid-planned");
      writeFileSync(invalidPlannedMatrixPath, JSON.stringify({entries: [
        {name: "invalid-planned", planned: true, tags: ["not-selected"], fixture: driverSrc, expectRc: 0},
        {name: "probe", tags: ["probe"], fixture: driverSrc, expectRc: 0},
        {name: "terminal", tags: ["terminal"], fixture: driverSrc, expectRc: 0},
      ]}));
      const invalidPlanned = await mcp.callTool("cheng_ignition_chain", {
        action: "start", treeRoot: baseTree, seed: "/usr/bin/false", workDir: invalidPlannedWorkDir,
        matrixPath: invalidPlannedMatrixPath, stages: {gen2: false},
      });
      assertTrue(invalidPlanned.isError === true && !existsSync(invalidPlannedWorkDir), "planned entries are rejected across the full matrix before tag filtering");

      const mixedContractMatrixPath = join(temp, "matrix-mixed-contract.json");
      const mixedContractWorkDir = join(temp, "must-not-exist-mixed-contract");
      writeFileSync(mixedContractMatrixPath, JSON.stringify({entries: [
        {name: "mixed-probe", tags: ["probe"], fixture: driverSrc, expectRc: 0, expectCompileRc: 0},
        {name: "terminal", tags: ["terminal"], fixture: driverSrc, expectRc: 0},
      ]}));
      const mixedContract = await mcp.callTool("cheng_ignition_chain", {
        action: "start", treeRoot: baseTree, seed: "/usr/bin/false", workDir: mixedContractWorkDir,
        matrixPath: mixedContractMatrixPath, stages: {gen2: false},
      });
      assertTrue(mixedContract.isError === true && !existsSync(mixedContractWorkDir), "ignition tags require an exclusive runtime expectRc contract");

      const noPackageRoot = join(temp, "not-a-cheng-package");
      mkdirSync(join(noPackageRoot, "src/core/tooling"), {recursive: true});
      writeFileSync(join(noPackageRoot, "src/core/tooling/backend_driver_dispatch_min.cheng"), "fn main(): int32 =\n    return 0\n");
      const noPackageWorkDir = join(temp, "must-not-exist-package-preflight");
      const noPackage = await mcp.callTool("cheng_ignition_chain", {
        action: "start", treeRoot: noPackageRoot, seed: "/usr/bin/false", workDir: noPackageWorkDir,
        stages: {gen2: false},
      });
      assertTrue(noPackage.isError === true && !existsSync(noPackageWorkDir), "treeRoot without non-empty cheng-package.toml hard-fails before creating workDir/runDir");

      const noisySeed = join(temp, "noisy-seed.py");
      writeFileSync(noisySeed, [
        "#!/usr/bin/env python3",
        "import os",
        "chunk = b'x' * 4096",
        "while True:",
        "    os.write(1, chunk)",
      ].join("\n") + "\n");
      chmodSync(noisySeed, 0o755);
      const noisyStarted = await mcp.callTool("cheng_ignition_chain", {
        action: "start", treeRoot: baseTree, seed: noisySeed, workDir,
        outputMaxBytes: 65536,
        stages: {gen2: false, terminal: false, oracle: false, gen3: false},
      });
      assertTrue(noisyStarted.isError !== true, "bounded-output chain starts: " + JSON.stringify(noisyStarted.parsed));
      await waitForFile(noisyStarted.parsed.completionSentinelPath, 5000);
      const noisyStatus = await mcp.callTool("cheng_ignition_chain", {action: "status", runId: noisyStarted.parsed.runId, workDir});
      const noisyDrvBake = noisyStatus.parsed.drvBake;
      assertTrue(noisyStatus.isError !== true && noisyStatus.parsed.done?.verdict === "ABORTED_DRV_BAKE_FAILED", "output overflow terminates with the drv bake failure verdict");
      assertTrue(noisyDrvBake?.outputOverflow === true && noisyDrvBake?.timedOut === false && noisyDrvBake?.rc === null && noisyDrvBake?.ok === false, "output overflow is explicit and can never produce a green drv gate");
      const capturedOutputBytes = statSync(noisyDrvBake.stdoutLog).size + statSync(noisyDrvBake.stderrLog).size;
      assertTrue(capturedOutputBytes <= 65536, "combined subprocess output logs obey outputMaxBytes");

      const runDirsBeforeWrongOrder = readdirSync(workDir).sort();
      const wrongOrder = await mcp.callTool("cheng_ignition_chain", {
        action: "start", baseTree, revertCommits: [middle, head], seed: "/usr/bin/false", workDir,
      });
      assertTrue(wrongOrder.isError === true, "dependent reverse commits in caller-wrong order fail git apply --reverse --check");
      assertTrue(JSON.stringify(readdirSync(workDir).sort()) === JSON.stringify(runDirsBeforeWrongOrder), "failed ablation preparation removes its prelaunch runDir completely");

      const baseAlias = join(temp, "base-alias");
      symlinkSync(baseTree, baseAlias, "dir");
      const aliasedWorkDir = join(baseAlias, "must-not-be-created");
      const aliased = await mcp.callTool("cheng_ignition_chain", {
        action: "start", baseTree, revertCommits: [head, middle], seed: "/usr/bin/false", workDir: aliasedWorkDir,
      });
      assertTrue(aliased.isError === true && !existsSync(join(baseTree, "must-not-be-created")), "symlink-aliased workDir inside baseTree is rejected before any write");
      assertTrue(readFileSync(join(baseTree, ".git/index")).equals(indexBefore), "failed ablation preflights still leave base index byte-identical");

      const dotdotNamedWorkDir = join(baseTree, "..runs");
      const dotdotNamed = await mcp.callTool("cheng_ignition_chain", {
        action: "start", baseTree, revertCommits: [head, middle], seed: "/usr/bin/false", workDir: dotdotNamedWorkDir,
      });
      assertTrue(dotdotNamed.isError === true && !existsSync(dotdotNamedWorkDir), "a real child named '..runs' is still inside baseTree and is rejected before any write");

      const hangingGitBin = join(temp, "hanging-git-bin");
      const hangingGitWorkDir = join(temp, "must-not-exist-hanging-git");
      mkdirSync(hangingGitBin);
      writeFileSync(join(hangingGitBin, "git"), "#!/bin/sh\nexec /bin/sleep 60\n");
      chmodSync(join(hangingGitBin, "git"), 0o755);
      const hangingMcp = startMcp({PATH: `${hangingGitBin}:${process.env.PATH || ""}`}, temp);
      try {
        await hangingMcp.initialize({rootUri: `file://${temp}`});
        const startedAt = Date.now();
        const hangingGit = await hangingMcp.callTool("cheng_ignition_chain", {
          action: "start", baseTree, revertCommits: [head, middle], seed: "/usr/bin/false", workDir: hangingGitWorkDir,
        });
        const elapsed = Date.now() - startedAt;
        assertTrue(hangingGit.isError === true
          && JSON.stringify(hangingGit.parsed).includes("timed out after 5000ms")
          && elapsed < 15_000
          && !existsSync(hangingGitWorkDir),
        "a non-returning git process is killed by the fixed deadline before any run directory is created");
      } finally {
        hangingMcp.kill();
      }

      writeFileSync(join(baseTree, "untracked.txt"), "dirty\n");
      const dirty = await mcp.callTool("cheng_ignition_chain", {
        action: "start", baseTree, revertCommits: [head, middle], seed: "/usr/bin/false", workDir,
      });
      assertTrue(dirty.isError === true, "dirty baseTree hard-fails before cloning");
    } finally {
      mcp.kill();
    }
  } finally {
    rmSync(temp, {recursive: true, force: true});
  }
  console.log("item16 ignition ablation: PASS");
}

main().catch((error) => {
  console.error("item16 ignition ablation: FAIL", error);
  process.exit(1);
});
