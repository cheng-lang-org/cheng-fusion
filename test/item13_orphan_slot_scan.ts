// cheng_orphan_slot_scan 端到端验证: 起真实 MCP server, 用两个真实 .o fixture
// (fixtures/orphan_slot_scan/{ref_good_vb,t66_vb}.exe.primary.o, 拷自 diag_T66 案卷)。
//   [A] reference fixture + t66_vb__main: 保留 5 个 x 寄存器显式候选，但默认优先候选为 0。
//   [B] T66 fixture 同一函数: 含一个 w 寄存器优先候选(sp+0x7c)。
//   [C] wOnly:false 时 reference fixture 的 x 寄存器候选也进入优先集合。
//   [D] fnFilter 命中 5 个函数时"最特异/精确后缀优先", 不是"最后一个命中的赢"(naive last-wins
//       会选到 _std_os__closeFileHandleResult__L1175, 正确应选最短的
//       _std_os__openFileHandleResult__L1125)。
//   [E] orphans 列表里没有 offset 0/8 的假阳性(证明 stp/ldp 隐式偏移修复生效)。
//   [F]/[G]/[H]/[I] 错误路径: objPath 不存在、objPath 非 .o、fnFilter 无命中、未知字段被拒绝。
import {startMcp, assertTrue} from "./mcp_client.ts";
import assert from "node:assert/strict";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {assertOrphanSlotScanReportSchema, classifyFunctionBody} from "../src/cheng_orphan_slot_scan_m9020.ts";

const CHENG_FUSION_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GOOD_OBJ = join(CHENG_FUSION_ROOT, "fixtures/orphan_slot_scan/ref_good_vb.exe.primary.o");
const BAD_OBJ = join(CHENG_FUSION_ROOT, "fixtures/orphan_slot_scan/t66_vb.exe.primary.o");

async function main() {
  const mcp = startMcp({}, CHENG_FUSION_ROOT);
  try {
    await mcp.initialize({});

    console.log("[A] reference fixture: 全量显式候选与 wOnly 优先集合分离");
    {
      const {isError, parsed} = await mcp.callTool("cheng_orphan_slot_scan", {objPath: GOOD_OBJ, fnFilter: "t66_vb__main"}, undefined, 15000);
      assertTrue(isError !== true, `调用未报错, 实得: ${JSON.stringify(parsed).slice(0, 400)}`);
      assertTrue(parsed.schema === "cheng_orphan_slot_scan", `schema 正确, 实得 ${parsed.schema}`);
      assert.throws(
        () => assertOrphanSlotScanReportSchema({...parsed, schema: "cheng_orphan_slot_scan.v2"}),
        /unsupported orphan slot scan report schema/,
        "legacy orphan-slot report schema must be rejected",
      );
      assertTrue(parsed.fn === "_t66_vb__main__L11", `选中函数正确, 实得 ${parsed.fn}`);
      assertTrue(parsed.status === "EXPLICIT_ORPHAN_CANDIDATES", `显式扫描如实保留 5 个候选, 实得 ${parsed.status}`);
      assertTrue(parsed.priorityCandidateCount === 0, `默认 wOnly 下无 32-bit 优先候选, 实得 ${parsed.priorityCandidateCount}`);
      assertTrue(parsed.orphans.length === 5, `orphans 全量报出(5 个 x 寄存器 struct-return 槽), 实得 ${parsed.orphans.length}`);
      assertTrue(parsed.orphans.every((o) => o.width === 64), `全部是 64-bit(x 寄存器), 实得 widths=${JSON.stringify(parsed.orphans.map((o) => o.width))}`);
      assertTrue(typeof parsed.notes === "string" && parsed.notes.includes("outside the wOnly priority set"), `notes 说明 x 寄存器不进优先集合, 实得 ${parsed.notes}`);
      console.log(`  ok: insns=${parsed.insns} stores=${parsed.stores} loads=${parsed.loads} orphans=${parsed.orphans.length}`);
    }

    console.log("[B] T66 fixture: 含 w 寄存器优先候选 sp+0x7c");
    {
      const {isError, parsed} = await mcp.callTool("cheng_orphan_slot_scan", {objPath: BAD_OBJ, fnFilter: "t66_vb__main"}, undefined, 15000);
      assertTrue(isError !== true, `调用未报错, 实得: ${JSON.stringify(parsed).slice(0, 400)}`);
      assertTrue(parsed.status === "EXPLICIT_ORPHAN_CANDIDATES", `BAD fixture 报显式候选而非伪造正确性 verdict, 实得 ${parsed.status}`);
      assertTrue(parsed.priorityCandidateCount === 1, `BAD fixture 有 1 个 32-bit 优先候选, 实得 ${parsed.priorityCandidateCount}`);
      const wOrphans = parsed.orphans.filter((o) => o.width === 32);
      assertTrue(wOrphans.length === 1 && wOrphans[0].offset === 0x7c, `恰好 1 个 32-bit orphan 在 sp+0x7c, 实得 ${JSON.stringify(wOrphans)}`);
      assertTrue(parsed.orphans.length === 6, `orphans 总数=6(5 个 x 寄存器 informational + 1 个真 w 寄存器 bug), 实得 ${parsed.orphans.length}`);
    }

    console.log("[C] wOnly:false 时所有显式候选进入优先集合");
    {
      const {isError, parsed} = await mcp.callTool("cheng_orphan_slot_scan", {objPath: GOOD_OBJ, fnFilter: "t66_vb__main", wOnly: false}, undefined, 15000);
      assertTrue(isError !== true, `调用未报错, 实得: ${JSON.stringify(parsed).slice(0, 400)}`);
      assertTrue(parsed.priorityCandidateCount === 5, `wOnly:false 时 5 个 x 寄存器候选都进入优先集合, 实得 ${parsed.priorityCandidateCount}`);
      assertTrue(parsed.orphans.length === 5, `orphans 列表内容不变(仍是那 5 个), 实得 ${parsed.orphans.length}`);
    }

    console.log("[D] fnFilter 命中 5 个函数: 最特异/精确后缀优先, 不是最后一个命中的赢");
    {
      const {isError, parsed} = await mcp.callTool("cheng_orphan_slot_scan", {objPath: GOOD_OBJ, fnFilter: "FileHandleResult"}, undefined, 15000);
      assertTrue(isError !== true, `调用未报错, 实得: ${JSON.stringify(parsed).slice(0, 400)}`);
      assertTrue(parsed.fn === "_std_os__openFileHandleResult__L1125", `选中最短/最特异的候选, 而非 naive last-wins 会选中的 _std_os__closeFileHandleResult__L1175, 实得 ${parsed.fn}`);
      assertTrue(typeof parsed.notes === "string" && parsed.notes.includes("matched 5 functions"), `notes 报出 5 个候选, 实得 ${parsed.notes}`);
    }

    console.log("[E] orphans 列表里没有 offset 0/8 假阳性(证明 stp/ldp 隐式偏移修复生效)");
    {
      const {parsed} = await mcp.callTool("cheng_orphan_slot_scan", {objPath: GOOD_OBJ, fnFilter: "t66_vb__main", wOnly: false}, undefined, 15000);
      const falsePositives = parsed.orphans.filter((o) => o.offset === 0 || o.offset === 8);
      assertTrue(falsePositives.length === 0, `无 offset 0/8 假阳性, 实得 ${JSON.stringify(falsePositives)}`);
    }

    console.log("[E2] pair stride 与完整字节覆盖按寄存器宽度计算");
    {
      const wPair = classifyFunctionBody(["stp w0, w1, [sp]", "ldr w2, [sp, #4]"]);
      const qPair = classifyFunctionBody(["stp q0, q1, [sp]", "ldr q2, [sp, #16]"]);
      const partial = classifyFunctionBody(["str w0, [sp]", "ldr x1, [sp]"]);
      assertTrue(wPair.orphans.length === 0, "w pair 的第二槽步长是 4 字节");
      assertTrue(qPair.orphans.length === 0, "q pair 的第二槽步长是 16 字节");
      assertTrue(partial.orphans.length === 1 && partial.orphans[0].bytes === 8, "4 字节 store 不得冒充完整覆盖 8 字节 load");
    }

    console.log("[E3] pre/post-index 与分支控制流按真实 SP 状态追踪");
    {
      const prePost = classifyFunctionBody([
        "0000000000000000\tstp\tx0, x1, [sp, #-0x10]!",
        "0000000000000004\tldr\tx2, [sp]",
        "0000000000000008\tldp\tx3, x4, [sp], #0x10",
        "000000000000000c\tret",
      ]);
      const branch = classifyFunctionBody([
        "0000000000000000\tsub\tsp, sp, #0x20",
        "0000000000000004\tstr\tw0, [sp, #0x4]",
        "0000000000000008\tb\t0x10",
        "000000000000000c\tadd\tsp, sp, #0x20",
        "0000000000000010\tldr\tw1, [sp, #0x4]",
        "0000000000000014\tadd\tsp, sp, #0x20",
        "0000000000000018\tret",
      ]);
      assertTrue(prePost.orphans.length === 0, "pre/post-index 后的 [sp] load 必须与同一动态槽位匹配");
      assertTrue(branch.orphans.length === 0, "ret 之后的线性反汇编文本不能错误改变分支到达块的 SP 状态");
    }

    console.log("[F] objPath 不存在报错");
    {
      const {isError, parsed} = await mcp.callTool("cheng_orphan_slot_scan", {objPath: "/tmp/does_not_exist_orphan_scan.o", fnFilter: "main"}, undefined, 10000);
      assertTrue(isError === true, `不存在路径应报 isError, 实得 isError=${isError}`);
      assertTrue(String(parsed).includes("objPath not found"), `错误信息明确指出路径缺失, 实得: ${parsed}`);
    }

    console.log("[G] objPath 非 .o 文件报错");
    {
      const {isError, parsed} = await mcp.callTool("cheng_orphan_slot_scan", {objPath: `${CHENG_FUSION_ROOT}/README.md`, fnFilter: "main"}, undefined, 10000);
      assertTrue(isError === true, `非 .o 路径应报 isError, 实得 isError=${isError}`);
      assertTrue(String(parsed).includes("must be a .o file"), `错误信息明确指出非 .o, 实得: ${parsed}`);
    }

    console.log("[H] fnFilter 无命中报错并列出可用函数");
    {
      const {isError, parsed} = await mcp.callTool("cheng_orphan_slot_scan", {objPath: GOOD_OBJ, fnFilter: "totally_absent_symbol_xyz"}, undefined, 10000);
      assertTrue(isError === true, `无命中应报 isError, 实得 isError=${isError}`);
      assertTrue(String(parsed).includes("no function matching"), `错误信息明确指出无命中, 实得: ${parsed}`);
    }

    console.log("[I] schema 校验: 未知字段被拒绝");
    {
      const {isError} = await mcp.callTool("cheng_orphan_slot_scan", {objPath: GOOD_OBJ, fnFilter: "main", bogusField: 1}, undefined, 10000);
      assertTrue(isError === true, `未知字段应报 isError`);
    }
  } finally {
    mcp.kill();
  }
  console.log("item13 orphan_slot_scan: PASS");
}

main().catch((error) => {
  console.error("item13 orphan_slot_scan: FAIL", error);
  process.exit(1);
});
