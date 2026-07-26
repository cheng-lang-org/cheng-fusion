// @ts-nocheck
// cheng_zc_census: bail/ZC 正典口径工具化。忠实包装 tools/zc_enumerate.sh(唯一正典口径,
// 见 lessons/feedback_zc_enumerate_canonical.md: bail/ZC 测量历史 7 连证伪, 全是即兴 grep
// stderr 造成的伪信号)。这里绝不自创测量口径 —— 只调用该脚本 + 解析它自己的结构化 stdout
// (key=value 字段区 + zc_bail_histogram 区 + zc_rows 区), 按 bail 号/body_kind 聚类。
// 脚本不存在/不适配当前 root 时明确报错, 不静默降级。
import {existsSync,mkdtempSync,realpathSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {isAbsolute, join, resolve} from "node:path";
import {b as defineModuleInitializer} from "./runtime.ts";
import {CHENG_CANARY,createChengTextTool,jsonResult,resolveChengPath,resolveChengProjectRoot,runChengDriver,takeTrailingText,initChengToolkitModule,zodSchema} from "./cheng_toolkit_m9000.ts";
import {ZC_PROCESS_MAX_OUTPUT_BYTES,ZC_TARGET,clusterZcCensusRows,parseZcCensusRun} from "./zc_census_protocol.ts";

var chengZcCensusInputSchema,ChengZcCensusTool;

const ZC_CENSUS_SCHEMA = "cheng_zc_census";

function assertZcCensusReportSchema(report) {
  if (!report || typeof report !== "object" || report.schema !== ZC_CENSUS_SCHEMA) {
    throw new Error(`unsupported ZC census report schema: ${report?.schema}`);
  }
  return report;
}

var initChengZcCensusModule = defineModuleInitializer(() => {
  initChengToolkitModule();
  chengZcCensusInputSchema = zodSchema.strictObject({
    root: zodSchema.string().optional().describe("Cheng project root containing tools/zc_enumerate.sh. Defaults to the active Cheng project root."),
    driver: zodSchema.string().optional().describe("Absolute path to the Cheng driver binary (sets the script's ZC_DRIVER override). Defaults to the script's own pinned default (artifacts/backend_driver/cheng under root)."),
    source: zodSchema.string().optional().describe("Path to the .cheng source to enumerate, absolute or relative to root. Defaults to the canary fixture (src/tests/ordinary_zero_exit_fixture.cheng)."),
    timeoutSec: zodSchema.number().positive().optional().describe("Timeout in seconds for the zc_enumerate.sh run. Default is the tool's driver timeout."),
  });
  ChengZcCensusTool = createChengTextTool({
    name: "cheng_zc_census",
    requiresChengProjectRoot: true,
    searchHint: "canonical zero-C not_ready bail/ZC census for a Cheng source, clustered by bail号 and body_kind",
    inputSchema: chengZcCensusInputSchema,
    description: "Wraps tools/zc_enumerate.sh (the canonical bail/ZC not_ready enumerator, full plan with no fail-fast) faithfully: runs it and parses its own structured stdout (field区 + bail histogram + per-function rows) into byBail/byBodyKind clusters. Never invents its own measurement口径; errors clearly if zc_enumerate.sh does not exist under root.",
    prompt: "Use this for canonical bail/ZC not_ready counting instead of ad-hoc grep on driver stderr (the historical 31/22/191 confusion was exactly that kind of improvised measurement).",
    toAutoClassifierInput: (input) => `zc_census:${input.source || "canary"}`,
    async execute(input) {
      const root = resolveChengProjectRoot({root: input.root});
      const scriptPath = join(root, "tools", "zc_enumerate.sh");
      if (!existsSync(scriptPath)) {
        throw new Error(`tools/zc_enumerate.sh not found under this root (not applicable to this checkout): ${scriptPath}`);
      }
      const sourcePath = resolveChengPath(input.source, CHENG_CANARY, root);
      if (!existsSync(sourcePath)) throw new Error(`source not found: ${sourcePath}`);
      const driver = input.driver
        ? resolve(isAbsolute(String(input.driver)) ? String(input.driver) : join(root, String(input.driver)))
        : join(root,"artifacts","backend_driver","cheng");
      if (!existsSync(driver)) throw new Error(`driver not found: ${driver}`);
      const timeoutMs = input.timeoutSec ? Math.round(input.timeoutSec * 1000) : undefined;
      const diagDir=realpathSync(mkdtempSync(join(tmpdir(),"cheng-fusion-zc-census-")));
      const diagPrefix="census";
      const unsetEnv=[...Object.keys(process.env).filter((key)=>key.startsWith("ZC_")),"CHENG_CENSUS_MAX_RSS","CHENG_PROCESS_MAX_RSS_BYTES"];
      try{
        const run = await runChengDriver(scriptPath, [sourcePath], {
          root,cwd:root,timeoutMs,maxBuffer:ZC_PROCESS_MAX_OUTPUT_BYTES,unsetEnv,
          env:{
            ZC_DRIVER:driver,ZC_TARGET,ZC_DIAG_DIR:diagDir,ZC_DIAG_PREFIX:diagPrefix,ZC_NO_CACHE:"1",
            ZC_ENUMERATE_KEEP_WORK:"0",ZC_COMPILER_CSG_STDERR:"0",ZC_PROGRESS:"0",CHENG_PROCESS_MAX_RSS_BYTES:"1073741824",
          },
        });
        if (run.missingDriver) throw new Error(`tools/zc_enumerate.sh not found under this root: ${scriptPath}`);
        const protocol = parseZcCensusRun(run,{root,script:scriptPath,source:sourcePath,driver,target:ZC_TARGET,diagDir,diagPrefix});
        const clusters = protocol.status === "completed" ? clusterZcCensusRows(protocol.rows) : {byBail:[],byBodyKind:[]};
        return jsonResult(assertZcCensusReportSchema({
          schema: ZC_CENSUS_SCHEMA,
          root,
          script: scriptPath,
          driver: protocol.status === "completed" ? protocol.fields.zc_driver : driver,
          source: protocol.status === "completed" ? protocol.fields.zc_file : sourcePath,
          exitCode: run.exitCode,
          status: protocol.status,
          total: protocol.total,
          totalRaw: protocol.totalRaw,
          byBail: clusters.byBail,
          byBodyKind: clusters.byBodyKind,
          rowCount: protocol.rowCount,
          raw: protocol.fields,
          histogram: protocol.histogram,
          threeWayMatch: protocol.threeWayMatch,
          zeroProof: protocol.zeroProof,
          protocolError: protocol.protocolError,
          processOk: protocol.processOk,
          stdoutTail: takeTrailingText(run.stdout, 4000),
          stderrTail: takeTrailingText(run.stderr, 4000),
          timedOut: Boolean(run.timedOut),
          overflow: Boolean(run.overflow),
        }));
      }finally{rmSync(diagDir,{recursive:true,force:true})}
    },
  });
});

export {ChengZcCensusTool, assertZcCensusReportSchema, initChengZcCensusModule};
