// item11 cheng_corrupt_hunt: 真实两阶段 lldb watchpoint 写点定位端到端验证。
//
// 夹具(全局 struct, scratch[4]/guard[4] 相邻, B 越界写 scratch[4] 恰好落在 guard[0] 上 ——
// 这个越界是编译器 -Warray-bounds 能诊断出来但仍会照常生成代码的经典相邻内存腐蚀形态,
// 和案卷 docs/patches-form34-layerA-writer.md 的"祖先栈帧局部变量被深层调用序言覆写"是
// 同一类"某处写入落在了一个仍存活的、不该被碰的地址上"的问题, 只是这里用全局内存复现,
// 不需要真跑一次自举编译):
//   storeBaseline() 写 guard[0] = 42(基准值)
//   corruptingWrite() 越界写 scratch[4](== guard[0]) = 0xdead(腐蚀)
//   checkGuard(struct GState *s) 是检测点: 读 s->guard[0], 不等于 42 就报 CORRUPTED
//
// 阶段1 断在 checkGuard 入口, x0(第一个整数实参寄存器, arm64 ABI)=指向 g_state 的指针,
// watchOffset=16(offsetof(guard)) 算出 H = &g_state.guard[0]。阶段2 全新进程在 H 上挂
// write watchpoint, 断言真正命中的调用链落在 corruptingWrite(而不是合法写入它的
// storeBaseline)。
import {existsSync, mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {startMcp, assertTrue} from "./mcp_client.ts";

function buildFixture(dir: string) {
  const checkC = `#include <stdio.h>
struct GState { int scratch[4]; int guard[4]; };
extern struct GState g_state;
__attribute__((noinline)) int checkGuard(struct GState *s) {
    if (s->guard[0] != 42) {
        fprintf(stderr, "CORRUPTED: %d\\n", s->guard[0]);
        return 1;
    }
    fprintf(stderr, "OK: %d\\n", s->guard[0]);
    return 0;
}
`;
  const aC = `struct GState { int scratch[4]; int guard[4]; };
extern struct GState g_state;
__attribute__((noinline)) void storeBaseline(void) {
    g_state.guard[0] = 42;
}
`;
  const bC = `struct GState { int scratch[4]; int guard[4]; };
extern struct GState g_state;
__attribute__((noinline)) void corruptingWrite(void) {
    g_state.scratch[4] = 0xdead;
}
`;
  const mainC = `struct GState { int scratch[4]; int guard[4]; };
struct GState g_state;
void storeBaseline(void);
void corruptingWrite(void);
int checkGuard(struct GState *s);
int main(void) {
    storeBaseline();
    corruptingWrite();
    return checkGuard(&g_state);
}
`;
  writeFileSync(join(dir, "check.c"), checkC);
  writeFileSync(join(dir, "a.c"), aC);
  writeFileSync(join(dir, "b.c"), bC);
  writeFileSync(join(dir, "main.c"), mainC);
  const objs = ["check.c", "a.c", "b.c", "main.c"].map((src) => {
    const obj = join(dir, src.replace(/\.c$/, ".o"));
    const result = spawnSync("cc", ["-g", "-O0", "-c", join(dir, src), "-o", obj], {encoding: "utf8"});
    assertTrue(result.status === 0, `cc -c ${src} 编译成功, stderr: ${result.stderr}`);
    return obj;
  });
  const binary = join(dir, "corrupt_fixture");
  // check.o 排第一个链接实参: 这个夹具的验证前提是它的 __text 落在最终二进制 __TEXT 的文件
  // 偏移0处(system-link-exec primary+provider 拼接约定的通用形态), 用 otool 实测校验, 不是
  // 盲目假设。
  const link = spawnSync("cc", ["-g", "-O0", "-o", binary, ...objs], {encoding: "utf8"});
  assertTrue(link.status === 0, `cc 链接成功, stderr: ${link.stderr}`);
  return {binary, checkObj: objs[0]};
}

// 独立于被测工具, 用 otool+nm 实测校验"check.o 落在最终二进制 __text 文件偏移0"这个前提是否
// 真的成立 —— 不成立就明确跳过 breakSymbol 子测试(而不是让断言在错误的前提上凑巧通过或诡异失败)。
function verifyPrimaryObjectBaseZeroAssumption(binary: string, checkObj: string): boolean {
  const otoolBin = spawnSync("otool", ["-l", binary], {encoding: "utf8"});
  const binMatch = otoolBin.stdout.match(/sectname __text\s+segname __TEXT\s+addr (0x[0-9a-fA-F]+)/);
  const nmBin = spawnSync("nm", ["-n", binary], {encoding: "utf8"});
  const checkGuardMatch = nmBin.stdout.match(/^([0-9a-fA-F]{16})\s+T\s+_checkGuard$/m);
  if (!binMatch || !checkGuardMatch) return false;
  const exeTextAddr = Number(binMatch[1]);
  const checkGuardVmAddr = Number(`0x${checkGuardMatch[1]}`);
  const nmObj = spawnSync("nm", ["-n", checkObj], {encoding: "utf8"});
  const localMatch = nmObj.stdout.match(/^([0-9a-fA-F]{16})\s+T\s+_checkGuard$/m);
  if (!localMatch) return false;
  const localOffset = Number(`0x${localMatch[1]}`);
  return exeTextAddr + localOffset === checkGuardVmAddr;
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "fusion-harness-item11-"));
  try {
    const {binary, checkObj} = buildFixture(dir);
    const mcp = startMcp({}, dir);
    try {
      await mcp.initialize({rootUri: `file://${dir}`});

      console.log("[A] breakSymbol+primaryObject 模式: nm 解析 checkGuard 入口地址, 两阶段定位真正的越界写");
      const baseZeroHolds = verifyPrimaryObjectBaseZeroAssumption(binary, checkObj);
      assertTrue(baseZeroHolds, "本夹具里 check.o 确实链接在最终二进制 __text 文件偏移0处(实测校验, 非假设)");
      const symbolResult = await mcp.callTool("cheng_corrupt_hunt", {
        binary,
        primaryObject: checkObj,
        breakSymbol: "_checkGuard",
        watchRegister: "x0",
        watchOffset: 16,
        watchSize: 4,
        maxHits: 8,
        timeoutSec: 30,
      }, undefined, 40000);
      assertTrue(symbolResult.isError !== true, `cheng_corrupt_hunt(breakSymbol) 未报错, 实得: ${JSON.stringify(symbolResult.parsed).slice(0, 500)}`);
      const parsedSymbol = symbolResult.parsed;
      assertTrue(!parsedSymbol.error, `无 stage1 错误, 实得: ${parsedSymbol.error}`);
      assertTrue(typeof parsedSymbol.stage1?.H === "string" && parsedSymbol.stage1.H.startsWith("0x"), `stage1.H 是十六进制地址, 实得 ${parsedSymbol.stage1?.H}`);
      assertTrue(parsedSymbol.stage1.initialValue === "0x0000dead", `stage1 检测点读到的 H 初始值已是腐蚀后的 0xdead, 实得 ${parsedSymbol.stage1.initialValue}`);
      assertTrue(Array.isArray(parsedSymbol.hits) && parsedSymbol.hits.length >= 2, `stage2 至少命中2次(storeBaseline 的合法写 + corruptingWrite 的越界写), 实得 hits=${JSON.stringify(parsedSymbol.hits)}`);

      const legitHit = parsedSymbol.hits.find((h: any) => /storeBaseline/.test(h.symbol || ""));
      assertTrue(!!legitHit, `命中里应有一次落在 storeBaseline(合法写基准值), 实得: ${JSON.stringify(parsedSymbol.hits.map((h: any) => h.symbol))}`);
      assertTrue(legitHit.newValue === "0x0000002a", `storeBaseline 那次命中写入的新值是 42(0x2a), 实得 ${legitHit.newValue}`);

      const culpritHit = parsedSymbol.hits.find((h: any) => /corruptingWrite/.test(h.symbol || ""));
      assertTrue(!!culpritHit, `命中里应有一次落在 corruptingWrite —— 真正的越界写入指令, 实得: ${JSON.stringify(parsedSymbol.hits.map((h: any) => h.symbol))}`);
      assertTrue(culpritHit.newValue === "0x0000dead", `corruptingWrite 那次命中写入的新值是 0xdead, 实得 ${culpritHit.newValue}`);
      assertTrue(culpritHit.providerUnresolved === false, `真凶命中帧应被成功符号化(非 providerUnresolved), 实得 ${JSON.stringify(culpritHit)}`);
      assertTrue(Array.isArray(culpritHit.frames) && culpritHit.frames.some((f: any) => f.symbol === "_main" || /main/.test(f.symbol || "")), `真凶命中的 backtrace 里能看到 main 调用链, 实得: ${JSON.stringify(culpritHit.frames.map((f: any) => f.symbol))}`);

      console.log("[B] breakAddr 模式(直接给字面量地址, 不经 nm): 结果应与 breakSymbol 模式一致");
      const nmBin = spawnSync("nm", ["-n", binary], {encoding: "utf8"});
      const checkGuardMatch = nmBin.stdout.match(/^([0-9a-fA-F]{16})\s+T\s+_checkGuard$/m);
      assertTrue(!!checkGuardMatch, "能从 nm -n binary 里独立取到 checkGuard 的真实虚拟地址(用来构造 breakAddr, 与被测工具的 nm 解析路径完全独立)");
      const breakAddrHex = `0x${checkGuardMatch![1].replace(/^0+(?=.)/, "")}`;
      const addrResult = await mcp.callTool("cheng_corrupt_hunt", {
        binary,
        primaryObject: checkObj,
        breakAddr: breakAddrHex,
        watchRegister: "x0",
        watchOffset: 16,
        watchSize: 4,
        maxHits: 8,
        timeoutSec: 30,
      }, undefined, 40000);
      assertTrue(addrResult.isError !== true, `cheng_corrupt_hunt(breakAddr) 未报错, 实得: ${JSON.stringify(addrResult.parsed).slice(0, 500)}`);
      const parsedAddr = addrResult.parsed;
      assertTrue(parsedAddr.stage1.H === parsedSymbol.stage1.H, `breakAddr 模式算出的 H 和 breakSymbol 模式一致, 实得 ${parsedAddr.stage1.H} vs ${parsedSymbol.stage1.H}`);
      const culpritHit2 = parsedAddr.hits.find((h: any) => /corruptingWrite/.test(h.symbol || ""));
      assertTrue(!!culpritHit2, `breakAddr 模式同样能命中 corruptingWrite, 实得: ${JSON.stringify(parsedAddr.hits.map((h: any) => h.symbol))}`);

      console.log("[C] 恰好一种 breakAddr/breakSymbol 的入参校验");
      const bothResult = await mcp.callTool("cheng_corrupt_hunt", {
        binary, breakAddr: breakAddrHex, breakSymbol: "_checkGuard", primaryObject: checkObj,
        watchRegister: "x0", watchOffset: 16, watchSize: 4,
      }, undefined, 15000);
      assertTrue(bothResult.isError === true, "同时给 breakAddr 和 breakSymbol 应报错(恰好一种)");
      const neitherResult = await mcp.callTool("cheng_corrupt_hunt", {
        binary, watchRegister: "x0", watchOffset: 16, watchSize: 4,
      }, undefined, 15000);
      assertTrue(neitherResult.isError === true, "两者都不给应报错(恰好一种)");
    } finally {
      mcp.kill();
    }
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
  console.log("item11 corrupt hunt: PASS");
}

main().catch((error) => {
  console.error("item11 corrupt hunt: FAIL", error);
  process.exit(1);
});
