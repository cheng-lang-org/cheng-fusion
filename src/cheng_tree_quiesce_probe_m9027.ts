// @ts-nocheck
// cheng_tree_quiesce_probe: "这棵活树现在静了没有"的正典判决。
// 2026-07-25 根线反复手打 `find <scope> -mmin -N` 一行流去猜冻结窗口: published-candidate 之类的
// 门禁要求活树在整个取证期间字节不变(~20 分钟), 共享热文件(primary_object_plan.cheng 一族)也有
// ">10 分钟静默才可下手"的纪律。用肉眼判"应该静了吧"已经烧掉过好几轮重跑。
// 这里给一次确定性判决: 走 scope 目录(跳 .git, 跳一切符号链接), 报出窗口内被改过的文件、全树最新
// mtime、以及"已经静了多少秒"。纯只读, 不 shell 出去调 find(readdir 递归, 结果确定且不受 locale/
// find 实现差异影响)。
import {readdirSync, statSync} from "node:fs";
import {join, relative} from "node:path";
import {b as defineModuleInitializer} from "./runtime.ts";
import {createChengTextTool, jsonResult, resolveChengPath, resolveChengProjectRoot, initChengToolkitModule, zodSchema} from "./cheng_toolkit_m9000.ts";

var chengTreeQuiesceProbeInputSchema, ChengTreeQuiesceProbeTool;

const TREE_QUIESCE_PROBE_SCHEMA = "cheng_tree_quiesce_probe";
const TREE_QUIESCE_DEFAULT_SCOPES = ["bootstrap", "tools", "src/core", "src/tests"];
const TREE_QUIESCE_DEFAULT_QUIET_MINUTES = 10;
const TREE_QUIESCE_SKIP_DIRECTORIES = new Set([".git"]);
const TREE_QUIESCE_CHANGED_SAMPLE_LIMIT = 50;

function scanTreeQuiesceDirectory(directory, onFile) {
  for (const entry of readdirSync(directory, {withFileTypes: true})) {
    if (entry.isSymbolicLink()) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (TREE_QUIESCE_SKIP_DIRECTORIES.has(entry.name)) continue;
      scanTreeQuiesceDirectory(path, onFile);
      continue;
    }
    if (!entry.isFile()) continue;
    onFile(path, statSync(path).mtimeMs);
  }
}

var initChengTreeQuiesceProbeModule = defineModuleInitializer(() => {
  initChengToolkitModule();
  chengTreeQuiesceProbeInputSchema = zodSchema.strictObject({
    root: zodSchema.string().optional().describe("Cheng project root to inspect. Defaults to the active Cheng project root (/Users/lbcheng/cheng-lang)."),
    scopes: zodSchema.array(zodSchema.string()).optional().describe(`Directories to walk, absolute or relative to root. Defaults to ${JSON.stringify(TREE_QUIESCE_DEFAULT_SCOPES)}.`),
    quietMinutes: zodSchema.number().positive().optional().describe(`Freeze window in minutes: any file modified within it makes the tree not quiet. Defaults to ${TREE_QUIESCE_DEFAULT_QUIET_MINUTES}.`),
  });
  ChengTreeQuiesceProbeTool = createChengTextTool({
    name: "cheng_tree_quiesce_probe",
    requiresChengProjectRoot: true,
    searchHint: "canonical freeze-window judgment: is the live Cheng tree byte-stable, and if not which files moved inside the window",
    inputSchema: chengTreeQuiesceProbeInputSchema,
    description: "Read-only freeze-window judgment for the live Cheng tree: walks the given scopes (skipping .git and every symlink, via readdir recursion — no shelling out to find), and reports quiet=true/false for the requested quietMinutes window, the files that moved inside it (newest first, sampled to 50 with the full count), the newest file in the whole scan, and quietForSeconds since that newest mtime.",
    prompt: "Use this instead of ad-hoc `find <dir> -mmin -N` one-liners before any gate that requires a byte-stable tree: published-candidate style runs (~20 minutes of stability), snapshot/fixture regeneration, driver bakes, and before editing shared hot files (the >10-minutes-quiet rule for concurrently edited backend files). Deciding the freeze window by eyeball is what caused repeated wasted runs; this returns one deterministic verdict plus the exact files that broke it.",
    toAutoClassifierInput: (input) => `tree_quiesce_probe:${(input.scopes || TREE_QUIESCE_DEFAULT_SCOPES).join(",")}`,
    async execute(input) {
      const root = resolveChengProjectRoot({root: input.root});
      const requestedScopes = input.scopes === undefined ? TREE_QUIESCE_DEFAULT_SCOPES : input.scopes;
      if (!Array.isArray(requestedScopes) || requestedScopes.length === 0) throw new Error("scopes must be a non-empty array of directories");
      const scopePaths = requestedScopes.map((scope) => {
        if (typeof scope !== "string" || scope.length === 0) throw new Error(`scope must be a non-empty string: ${JSON.stringify(scope)}`);
        const path = resolveChengPath(scope, scope, root);
        if (!statSync(path).isDirectory()) throw new Error(`scope is not a directory: ${path}`);
        return path;
      });
      const quietMinutes = input.quietMinutes === undefined ? TREE_QUIESCE_DEFAULT_QUIET_MINUTES : Number(input.quietMinutes);
      if (!Number.isFinite(quietMinutes) || quietMinutes <= 0) throw new Error(`quietMinutes must be a positive number: ${input.quietMinutes}`);

      const nowMs = Date.now();
      const cutoffMs = nowMs - quietMinutes * 60_000;
      const changed = [];
      let fileCount = 0;
      let newestPath = null;
      let newestMtimeMs = null;
      for (const scopePath of scopePaths) {
        scanTreeQuiesceDirectory(scopePath, (path, mtimeMs) => {
          fileCount += 1;
          if (newestMtimeMs === null || mtimeMs > newestMtimeMs) {
            newestMtimeMs = mtimeMs;
            newestPath = path;
          }
          if (mtimeMs > cutoffMs) changed.push({path, mtimeMs});
        });
      }
      changed.sort((left, right) => right.mtimeMs - left.mtimeMs || left.path.localeCompare(right.path));
      return jsonResult({
        schema: TREE_QUIESCE_PROBE_SCHEMA,
        root,
        scopes: scopePaths,
        quietMinutes,
        quiet: changed.length === 0,
        fileCount,
        changedWithinWindowCount: changed.length,
        changedWithinWindow: changed.slice(0, TREE_QUIESCE_CHANGED_SAMPLE_LIMIT).map((entry) => ({
          path: entry.path,
          relativePath: relative(root, entry.path),
          mtime: new Date(entry.mtimeMs).toISOString(),
          ageSeconds: Math.round((nowMs - entry.mtimeMs)) / 1000,
        })),
        changedWithinWindowSampleLimit: TREE_QUIESCE_CHANGED_SAMPLE_LIMIT,
        newestPath,
        newestMtime: newestMtimeMs === null ? null : new Date(newestMtimeMs).toISOString(),
        quietForSeconds: newestMtimeMs === null ? null : Math.round(nowMs - newestMtimeMs) / 1000,
        scannedAt: new Date(nowMs).toISOString(),
      });
    },
  });
});

export {
  ChengTreeQuiesceProbeTool,
  TREE_QUIESCE_DEFAULT_QUIET_MINUTES,
  TREE_QUIESCE_DEFAULT_SCOPES,
  TREE_QUIESCE_PROBE_SCHEMA,
  initChengTreeQuiesceProbeModule,
  scanTreeQuiesceDirectory,
};
