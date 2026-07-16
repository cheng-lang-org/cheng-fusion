// cheng_orphan_slot_scan 端到端验证: 起真实 MCP server, 用两个真实 .o fixture
// (fixtures/orphan_slot_scan/{ref_good_vb,t66_vb}.exe.primary.o, 拷自 diag_T66 案卷)。
//   [A] GOOD fixture + t66_vb__main: verdict=GOOD, 5 个 x 寄存器 orphan(informational, 结构体
//       返回槽), notes 提示不计入 verdict。
//   [B] BAD fixture 同一函数: verdict=BAD, 含一个真实 w 寄存器 orphan(sp+0x7c, 读栈垃圾)。
//   [C] wOnly:false 时 GOOD fixture 的 x 寄存器 orphan 也计入 -> verdict 翻转成 BAD。
//   [D] fnFilter 命中 5 个函数时"最特异/精确后缀优先", 不是"最后一个命中的赢"(naive last-wins
//       会选到 _std_os__closeFileHandleResult__L1175, 正确应选最短的
//       _std_os__openFileHandleResult__L1125)。
//   [E] orphans 列表里没有 offset 0/8 的假阳性(证明 stp/ldp 隐式偏移修复生效)。
//   [F]/[G]/[H]/[I] 错误路径: objPath 不存在、objPath 非 .o、fnFilter 无命中、未知字段被拒绝。
import {startMcp, assertTrue} from "./mcp_client.ts";

const CHENG_FUSION_ROOT = "/Users/lbcheng/cheng-fusion";
const GOOD_OBJ = `${CHENG_FUSION_ROOT}/fixtures/orphan_slot_scan/ref_good_vb.exe.primary.o`;
const BAD_OBJ = `${CHENG_FUSION_ROOT}/fixtures/orphan_slot_scan/t66_vb.exe.primary.o`;

async function main() {
  const mcp = startMcp({}, CHENG_FUSION_ROOT);
  try {
    await mcp.initialize({});

    console.log("[A] GOOD fixture + t66_vb__main: verdict=GOOD, x 寄存器 orphan 仅 informational");
    {
      const {isError, parsed} = await mcp.callTool("cheng_orphan_slot_scan", {objPath: GOOD_OBJ, fnFilter: "t66_vb__main"}, undefined, 15000);
      assertTrue(isError !== true, `调用未报错, 实得: ${JSON.stringify(parsed).slice(0, 400)}`);
      assertTrue(parsed.schema === "cheng_orphan_slot_scan.v1", `schema 正确, 实得 ${parsed.schema}`);
      assertTrue(parsed.fn === "_t66_vb__main__L11", `选中函数正确, 实得 ${parsed.fn}`);
      assertTrue(parsed.verdict === "GOOD", `GOOD fixture verdict=GOOD, 实得 ${parsed.verdict}`);
      assertTrue(parsed.orphans.length === 5, `orphans 全量报出(5 个 x 寄存器 struct-return 槽), 实得 ${parsed.orphans.length}`);
      assertTrue(parsed.orphans.every((o) => o.width === 64), `全部是 64-bit(x 寄存器), 实得 widths=${JSON.stringify(parsed.orphans.map((o) => o.width))}`);
      assertTrue(typeof parsed.notes === "string" && parsed.notes.includes("not counted toward verdict"), `notes 说明 x 寄存器不计入 verdict, 实得 ${parsed.notes}`);
      console.log(`  ok: insns=${parsed.insns} stores=${parsed.stores} loads=${parsed.loads} orphans=${parsed.orphans.length}`);
    }

    console.log("[B] BAD fixture 同一函数: verdict=BAD, 含真实 w 寄存器 orphan sp+0x7c");
    {
      const {isError, parsed} = await mcp.callTool("cheng_orphan_slot_scan", {objPath: BAD_OBJ, fnFilter: "t66_vb__main"}, undefined, 15000);
      assertTrue(isError !== true, `调用未报错, 实得: ${JSON.stringify(parsed).slice(0, 400)}`);
      assertTrue(parsed.verdict === "BAD", `BAD fixture verdict=BAD, 实得 ${parsed.verdict}`);
      const wOrphans = parsed.orphans.filter((o) => o.width === 32);
      assertTrue(wOrphans.length === 1 && wOrphans[0].offset === 0x7c, `恰好 1 个 32-bit orphan 在 sp+0x7c, 实得 ${JSON.stringify(wOrphans)}`);
      assertTrue(parsed.orphans.length === 6, `orphans 总数=6(5 个 x 寄存器 informational + 1 个真 w 寄存器 bug), 实得 ${parsed.orphans.length}`);
    }

    console.log("[C] wOnly:false 时 GOOD fixture 的 x 寄存器 orphan 也计入 verdict, 翻转成 BAD");
    {
      const {isError, parsed} = await mcp.callTool("cheng_orphan_slot_scan", {objPath: GOOD_OBJ, fnFilter: "t66_vb__main", wOnly: false}, undefined, 15000);
      assertTrue(isError !== true, `调用未报错, 实得: ${JSON.stringify(parsed).slice(0, 400)}`);
      assertTrue(parsed.verdict === "BAD", `wOnly:false 时 GOOD fixture 的 5 个 x 寄存器 orphan 也计入 verdict, 翻转 BAD, 实得 ${parsed.verdict}`);
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
