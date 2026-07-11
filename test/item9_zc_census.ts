// cheng_zc_census 端到端验证: 起真实 MCP server, 真实调用 tools/zc_enumerate.sh。
//   [A] 确定性夹具: root=CHENG_ROOT + 固定文本 stub driver(自造 report/ZC_NOT_READY 文本,
//       与 exec_diff 的 compile_wall stub 同一手法), 断言 byBail/byBodyKind 分组精确正确。
//   [B] 真实材料: root=/tmp/f23/tree + driver=/tmp/f23/DRV42, 真实跑一次 zc_enumerate.sh,
//       只断言结构(schema/字段类型), 数值如实不预设(可能是 completed 或 aborted, 都合法)。
//   [C] 脚本不存在: root 下没有 tools/zc_enumerate.sh 时必须明确报错, 不是静默返回空结果。
//   [D] driver 不存在: 明确报错。
//   [E] schema 校验: 未知字段被 strictObject 拒绝。
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, chmodSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {startMcp, assertTrue} from "./mcp_client.ts";

const CHENG_ROOT = "/Users/lbcheng/cheng-lang";
const CANARY = `${CHENG_ROOT}/src/tests/ordinary_zero_exit_fixture.cheng`;
const F23_TREE = "/tmp/f23/tree";
const F23_DRV42 = "/tmp/f23/DRV42";

function makeStubBackendDriver(dir) {
  const path = join(dir, "stub_zc_backend.sh");
  const script = [
    "#!/bin/bash",
    'OUT=""; REP=""',
    'for arg in "$@"; do',
    '  case "$arg" in',
    '    --out:*) OUT="${arg#--out:}" ;;',
    '    --report-out:*) REP="${arg#--report-out:}" ;;',
    "  esac",
    "done",
    'printf "stub-object" > "$OUT"',
    "{",
    '  printf "primary_object_missing_function_count=2\\n"',
    '  printf "primary_object_missing_functions=fnA|return|calleeX|10|3|2|44;;fnB|assign|calleeY|20|5|1|631\\n"',
    '  printf "census_pure_provenance=full_backend_ready\\n"',
    '  printf "full_backend_codegen=1\\n"',
    '} > "$REP"',
    'echo "ZC_NOT_READY idx=0/2 function=fnA body_kind=return detail=calleeX line=10 fz_kind=3 stmt_kind=2 bail=44 slot_diag=none" 1>&2',
    'echo "ZC_NOT_READY idx=1/2 function=fnB body_kind=assign detail=calleeY line=20 fz_kind=5 stmt_kind=1 bail=631 slot_diag=none" 1>&2',
    'echo "ZC_NOT_READY_TOTAL count=2" 1>&2',
    "exit 0",
  ].join("\n");
  writeFileSync(path, script + "\n");
  chmodSync(path, 0o755);
  return path;
}

async function main() {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), "fusion-harness-item9-")));
  try {
    const mcp = startMcp({}, CHENG_ROOT);
    try {
      await mcp.initialize({rootUri: `file://${CHENG_ROOT}`, workspaceFolders: [{uri: `file://${CHENG_ROOT}`, name: "cheng-lang"}]});

      console.log("[A] 确定性 stub driver: byBail/byBodyKind 精确分组");
      {
        const stubDriver = makeStubBackendDriver(scratch);
        const {isError, parsed} = await mcp.callTool("cheng_zc_census", {root: CHENG_ROOT, driver: stubDriver, source: CANARY}, undefined, 30000);
        assertTrue(isError !== true, `调用未报错, 实得: ${JSON.stringify(parsed).slice(0, 400)}`);
        assertTrue(parsed.schema === "cheng_zc_census.v1", `schema 正确, 实得 ${parsed.schema}`);
        assertTrue(parsed.status === "completed", `status=completed, 实得 ${parsed.status} (raw=${JSON.stringify(parsed.raw).slice(0,300)})`);
        assertTrue(parsed.total === 2, `total=2, 实得 ${parsed.total}`);
        assertTrue(parsed.rowCount === 2, `rowCount=2, 实得 ${parsed.rowCount}`);
        const bail44 = parsed.byBail.find((e) => e.bail === "44");
        const bail631 = parsed.byBail.find((e) => e.bail === "631");
        assertTrue(!!bail44 && bail44.count === 1 && JSON.stringify(bail44.functions) === JSON.stringify(["fnA"]), `bail=44 → fnA, 实得 ${JSON.stringify(bail44)}`);
        assertTrue(!!bail631 && bail631.count === 1 && JSON.stringify(bail631.functions) === JSON.stringify(["fnB"]), `bail=631 → fnB, 实得 ${JSON.stringify(bail631)}`);
        assertTrue(parsed.byBail.length === 2, `byBail 恰好 2 组(无 countMismatch), 实得长度=${parsed.byBail.length}`);
        assertTrue(!bail44.countMismatch && !bail631.countMismatch, `histogram 与 rows 计数一致, 无 countMismatch`);
        const kindReturn = parsed.byBodyKind.find((e) => e.bodyKind === "return");
        const kindAssign = parsed.byBodyKind.find((e) => e.bodyKind === "assign");
        assertTrue(!!kindReturn && JSON.stringify(kindReturn.functions) === JSON.stringify(["fnA"]), `body_kind=return → fnA, 实得 ${JSON.stringify(kindReturn)}`);
        assertTrue(!!kindAssign && JSON.stringify(kindAssign.functions) === JSON.stringify(["fnB"]), `body_kind=assign → fnB, 实得 ${JSON.stringify(kindAssign)}`);
      }

      console.log("[B] 真实材料 /tmp/f23/tree + DRV42: 只断言结构, 数值如实不预设");
      {
        const {isError, parsed} = await mcp.callTool("cheng_zc_census", {root: F23_TREE, driver: F23_DRV42}, undefined, 120000);
        assertTrue(isError !== true, `调用未报错, 实得: ${JSON.stringify(parsed).slice(0, 400)}`);
        assertTrue(parsed.schema === "cheng_zc_census.v1", `schema 正确`);
        assertTrue(parsed.root === F23_TREE, `root 回显正确, 实得 ${parsed.root}`);
        assertTrue(parsed.status === "completed" || parsed.status === "aborted", `status ∈ {completed,aborted}, 实得 ${parsed.status}`);
        assertTrue(Array.isArray(parsed.byBail) && Array.isArray(parsed.byBodyKind), `byBail/byBodyKind 都是数组`);
        assertTrue(typeof parsed.rowCount === "number" && parsed.rowCount >= 0, `rowCount 是非负数, 实得 ${parsed.rowCount}`);
        if (parsed.status === "completed") {
          assertTrue(Number.isInteger(parsed.total) && parsed.total >= 0, `completed 时 total 是非负整数, 实得 ${parsed.total}`);
        } else {
          assertTrue(parsed.total === null, `aborted 时 total=null(不伪造数字), 实得 ${parsed.total}`);
        }
        console.log(`  ok: 真实测量 status=${parsed.status} total=${JSON.stringify(parsed.total)} rowCount=${parsed.rowCount} exitCode=${parsed.exitCode}`);
      }

      console.log("[C] 脚本不存在: root 下没有 tools/zc_enumerate.sh 必须明确报错");
      {
        const noScriptRoot = join(scratch, "no-script-project");
        mkdirSync(noScriptRoot, {recursive: true});
        writeFileSync(join(noScriptRoot, "cheng-package.toml"), "");
        const {isError, parsed} = await mcp.callTool("cheng_zc_census", {root: noScriptRoot}, undefined, 15000);
        assertTrue(isError === true, `脚本缺失应报 isError, 实得 isError=${isError} parsed=${JSON.stringify(parsed).slice(0, 200)}`);
        assertTrue(String(parsed).includes("zc_enumerate.sh not found"), `错误信息明确指出脚本缺失, 实得: ${parsed}`);
      }

      console.log("[D] driver 不存在: 明确报错");
      {
        const {isError, parsed} = await mcp.callTool("cheng_zc_census", {root: CHENG_ROOT, driver: "/nonexistent/does-not-exist-driver", source: CANARY}, undefined, 15000);
        assertTrue(isError === true, `driver 缺失应报 isError, 实得 isError=${isError}`);
        assertTrue(String(parsed).includes("driver not found"), `错误信息明确指出 driver 缺失, 实得: ${parsed}`);
      }

      console.log("[E] schema 校验: 未知字段被拒绝");
      {
        const {isError} = await mcp.callTool("cheng_zc_census", {root: CHENG_ROOT, bogusField: 1}, undefined, 10000);
        assertTrue(isError === true, `未知字段应报 isError`);
      }
    } finally {
      mcp.kill();
    }
  } finally {
    rmSync(scratch, {recursive: true, force: true});
  }
  console.log("item9 zc_census: PASS");
}

main().catch((error) => {
  console.error("item9 zc_census: FAIL", error);
  process.exit(1);
});
