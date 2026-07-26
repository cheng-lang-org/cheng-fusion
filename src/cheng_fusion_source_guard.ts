// @ts-nocheck
// 陈旧源守卫: 长跑的 MCP server 在 import 时把 src/*.ts 的模块图钉死在内存里, 之后对 src/ 的
// 任何编辑都不会生效 —— 但工具照常返回"结果", 于是一次已修好的改动被判成"还是坏的"(2026-07-25
// 实测踩过: live server 返回的是编辑前的 audit 结论)。
// 这里在进程启动(本模块被 import 时)对 fusion 自己的 src/*.ts 做一次 stat 指纹, 之后每次
// tools/call 复检; 一旦漂移就让这次调用硬失败, 而不是返回一个基于旧模块的结论。
// 只 stat 不 hash(每次调用 ~50 次 stat), 只看 src/ 目录下的直接 .ts 常规文件(符号链接/子目录/
// 非 .ts 一律不进指纹, 不可能被 src/ 外的文件误触发)。
import {readdirSync, statSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const CHENG_FUSION_SOURCE_DRIFT_ERROR = "fusion_source_drift_since_process_start";
const CHENG_FUSION_SOURCE_DRIFT_SCHEMA = "cheng_fusion_source_drift";
const CHENG_FUSION_SOURCE_DRIFT_REMEDY =
  "This process is serving pre-edit modules. Restart the MCP server, or re-run the tool in a fresh process: cd /Users/lbcheng/cheng-fusion && bun run cli.ts run <tool> --input '<JSON>'";
const CHENG_FUSION_SOURCE_DIRECTORY = dirname(fileURLToPath(import.meta.url));

// CHENG_FUSION_GUARD_ROOT 只为测试存在: 让测试把指纹根指向一份 scratch 拷贝, 从而在不动真 src/
// 的前提下制造漂移。生产路径永远是本文件所在的 src/ 目录。
function chengFusionGuardRoot() {
  const override = String(process.env.CHENG_FUSION_GUARD_ROOT || "").trim();
  return override || CHENG_FUSION_SOURCE_DIRECTORY;
}

function fingerprintChengFusionSources(guardRoot) {
  const fingerprint = new Map();
  for (const entry of readdirSync(guardRoot, {withFileTypes: true})) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
    const path = join(guardRoot, entry.name);
    const stat = statSync(path);
    fingerprint.set(path, {size: stat.size, mtimeMs: stat.mtimeMs});
  }
  return fingerprint;
}

function diffChengFusionSourceFingerprints(baseline, current) {
  const drifted = [];
  for (const [path, before] of baseline) {
    const after = current.get(path);
    if (after === undefined) {
      drifted.push({path, change: "removed", baseline: before, current: null});
      continue;
    }
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
      drifted.push({path, change: "modified", baseline: before, current: after});
    }
  }
  for (const [path, after] of current) {
    if (!baseline.has(path)) drifted.push({path, change: "added", baseline: null, current: after});
  }
  return drifted.sort((left, right) => left.path.localeCompare(right.path));
}

const CHENG_FUSION_GUARD_ROOT_AT_PROCESS_START = chengFusionGuardRoot();
const CHENG_FUSION_SOURCES_AT_PROCESS_START = fingerprintChengFusionSources(CHENG_FUSION_GUARD_ROOT_AT_PROCESS_START);
const CHENG_FUSION_PROCESS_START_MS = Date.now();

// 返回 null 表示"这次调用建立在与进程启动时同一份源码上"; 否则返回结构化漂移报告。
function chengFusionSourceDriftReport(toolName = null) {
  const drifted = diffChengFusionSourceFingerprints(
    CHENG_FUSION_SOURCES_AT_PROCESS_START,
    fingerprintChengFusionSources(CHENG_FUSION_GUARD_ROOT_AT_PROCESS_START),
  );
  if (drifted.length === 0) return null;
  return {
    schema: CHENG_FUSION_SOURCE_DRIFT_SCHEMA,
    error: CHENG_FUSION_SOURCE_DRIFT_ERROR,
    tool: toolName,
    guardRoot: CHENG_FUSION_GUARD_ROOT_AT_PROCESS_START,
    fingerprintedFileCount: CHENG_FUSION_SOURCES_AT_PROCESS_START.size,
    driftedFileCount: drifted.length,
    driftedFiles: drifted.map((entry) => ({path: entry.path, change: entry.change})),
    processStartedAt: new Date(CHENG_FUSION_PROCESS_START_MS).toISOString(),
    detectedAt: new Date().toISOString(),
    remedy: CHENG_FUSION_SOURCE_DRIFT_REMEDY,
  };
}

function chengFusionSourceGuardState() {
  return {
    guardRoot: CHENG_FUSION_GUARD_ROOT_AT_PROCESS_START,
    fingerprintedFileCount: CHENG_FUSION_SOURCES_AT_PROCESS_START.size,
    processStartedAt: new Date(CHENG_FUSION_PROCESS_START_MS).toISOString(),
  };
}

export {
  CHENG_FUSION_SOURCE_DRIFT_ERROR,
  CHENG_FUSION_SOURCE_DRIFT_SCHEMA,
  chengFusionSourceDriftReport,
  chengFusionSourceGuardState,
  diffChengFusionSourceFingerprints,
  fingerprintChengFusionSources,
};
