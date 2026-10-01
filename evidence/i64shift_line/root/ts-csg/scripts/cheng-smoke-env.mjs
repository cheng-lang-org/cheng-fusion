import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const chengSmokeMaxRssBytes = "536870912";
export const chengStyleSmokeMaxRssBytes = "536870912";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..");
const defaultCheng = join(repoRoot, "artifacts", "backend_driver", "cheng");
let chengRssGuardProbeDone = false;

export function assertChengSmokeRssGuard(cheng = defaultCheng, root = repoRoot) {
  if (chengRssGuardProbeDone) return;
  const probeDir = mkdtempSync(join(tmpdir(), "cheng-rss-guard-"));
  const outPath = join(probeDir, "rss_guard_probe");
  const reportPath = join(probeDir, "rss_guard_probe.report.txt");
  const result = spawnSync(cheng, [
    "system-link-exec",
    `--root:${root}`,
    "--in:src/tests/cold_resource_guard_direct_probe.cheng",
    "--emit:exe",
    "--target:arm64-apple-darwin",
    `--out:${outPath}`,
    `--report-out:${reportPath}`,
  ], {
    cwd: root,
    env: rssGuardProbeEnv(),
    encoding: "utf8",
    timeout: 10000,
  });
  rmSync(probeDir, { recursive: true, force: true });
  const output = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
  if (result.status === 0 || !output.includes("rss_limit_exceeded")) {
    throw new Error("cheng compiler artifact does not enforce CHENG_PROCESS_MAX_RSS_BYTES");
  }
  chengRssGuardProbeDone = true;
}

// Current cold/backend-driver RSS-guard contract (cold_configured_max_rss_bytes /
// BackendDriverDispatchMinConfiguredMaxRssBytes): the legacy env names
// PROCESS_MAX_RSS_BYTES / CHENG_MAX_RSS_BYTES / MAX_RSS_BYTES / PARENT_RSS_GUARD are
// REJECTED outright ("invalid cold max rss") — only CHENG_PROCESS_MAX_RSS_BYTES may
// carry the limit. Strip inherited copies so wrapped compiles actually reach the guard.
function withoutLegacyRssEnvNames(env) {
  const cleaned = { ...env };
  delete cleaned.PROCESS_MAX_RSS_BYTES;
  delete cleaned.CHENG_MAX_RSS_BYTES;
  delete cleaned.MAX_RSS_BYTES;
  delete cleaned.PARENT_RSS_GUARD;
  return cleaned;
}

function rssGuardProbeEnv() {
  return withoutLegacyRssEnvNames({
    ...process.env,
    CHENG_PROCESS_MAX_RSS_BYTES: "1",
    CHENG_PROGRESS: "1",
    PROGRESS: "1",
  });
}

export function chengSmokeEnv(extra = {}, cheng = defaultCheng, root = repoRoot) {
  if (
    process.env.CHENG_REQUIRE_RSS_GUARD === "1" ||
    process.env.CHENG_ALLOW_UNVERIFIED_RSS_GUARD !== "1"
  ) {
    assertChengSmokeRssGuard(cheng, root);
  }
  const maxRssBytes =
    process.env.CHENG_PROCESS_MAX_RSS_BYTES ??
    chengSmokeMaxRssBytes;
  const progress = process.env.CHENG_PROGRESS ?? process.env.PROGRESS ?? "1";
  return withoutLegacyRssEnvNames({
    ...process.env,
    CHENG_PROCESS_MAX_RSS_BYTES: maxRssBytes,
    CHENG_PROGRESS: progress,
    PROGRESS: progress,
    ...extra,
  });
}
