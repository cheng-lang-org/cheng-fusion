#!/usr/bin/env bun
// Repeatable production-path integration suite. Tests use checked-in fixtures or create their
// own data, but several intentionally require the configured real Cheng toolchain.
import {spawn} from "node:child_process";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const perTestTimeoutMs = Number(process.env.CHENG_FUSION_SUITE_TEST_TIMEOUT_MS || 300_000);
if (!Number.isInteger(perTestTimeoutMs) || perTestTimeoutMs <= 0) {
  throw new Error(`CHENG_FUSION_SUITE_TEST_TIMEOUT_MS must be a positive integer, got ${process.env.CHENG_FUSION_SUITE_TEST_TIMEOUT_MS}`);
}
const tests = [
  "test/item2_timeout_orphan.ts",
  "test/item3_stale_facts.ts",
  "test/item4_linemap_sidecar.ts",
  "test/item6_crash_triage_v2.ts",
  "test/item8_symbol_diff_compare.ts",
  "test/item10_crash_triage_v3.ts",
  "test/item11_corrupt_hunt.ts",
  "test/item12_residual_peel.ts",
  "test/item13_orphan_slot_scan.ts",
  "test/item14_headless_cli.ts",
  "test/item15_fixture_matrix.ts",
  "test/item16_ignition_ablation.ts",
  "test/item17_gen2_symbolize.ts",
  "test/item17_shape_matrix_compile_rc.ts",
  "test/item18_exec_diff_invariants.ts",
  "test/item19_lsp_protocol_singleflight.ts",
  "test/item20_profile_report_invariants.ts",
  "test/item21_zc_protocol_strict.ts",
  "test/item22_regalloc_preflight.ts",
  "test/item23_semantic_matrix.ts",
  "test/item24_semantic_pipeline_matrix.ts",
];

function runTest(test: string) {
  return new Promise<void>((resolve, reject) => {
    const detached = process.platform !== "win32";
    const child = spawn(process.execPath, [join(root, test)], {cwd: root, stdio: "inherit", detached});
    let settled = false;

    function killProcessTree() {
      try {
        if (detached && child.pid) process.kill(-child.pid, "SIGKILL");
        else if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      } catch {}
    }

    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // 测试主进程正常退出也可能遗留孙进程；每条结束路径都清理整个 detached 进程组。
      killProcessTree();
      if (error) reject(error);
      else resolve();
    }

    const timer = setTimeout(() => {
      finish(new Error(`stable suite timed out after ${perTestTimeoutMs}ms: ${test}`));
    }, perTestTimeoutMs);
    child.once("error", (error) => {
      finish(error);
    });
    child.once("exit", (code, signal) => {
      if (code !== 0) finish(new Error(`stable suite stopped: ${test} exited ${code} signal=${signal || "none"}`));
      else finish();
    });
  });
}

for (const test of tests) {
  console.log("\n==> " + test);
  await runTest(test);
}

console.log("\ncheng-fusion stable suite: PASS");
