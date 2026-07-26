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
import {chmodSync, copyFileSync, existsSync, lstatSync, mkdtempSync, rmSync, symlinkSync, writeFileSync} from "node:fs";
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
  const mainC = `#include <fcntl.h>
#include <signal.h>
#include <stdlib.h>
#include <unistd.h>
struct GState { int scratch[4]; int guard[4]; };
struct GState g_state;
void storeBaseline(void);
void corruptingWrite(void);
int checkGuard(struct GState *s);
int main(void) {
    const char *mutate_path = getenv("MUTATE_PATH");
    if (mutate_path) {
        int fd = open(mutate_path, O_WRONLY | O_APPEND);
        if (fd >= 0) {
            (void)write(fd, "X", 1);
            close(fd);
        }
    }
    if (getenv("NO_WRITES")) return checkGuard(&g_state);
    storeBaseline();
    if (getenv("PRESTOP")) raise(SIGSTOP);
    (void)checkGuard(&g_state);
    if (getenv("POSTCHECK_STOP")) raise(SIGSTOP);
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

// 独立于被测工具，用 otool+nm 校验 check.o 的 __text 确实从最终二进制 __text 起点拼入。
// object symbol value 必须先减 object __text.addr，不能偷假设该 section 地址恒为 0。
function verifyPrimaryObjectFirstTextMapping(binary: string, checkObj: string): boolean {
  const otoolBin = spawnSync("otool", ["-l", binary], {encoding: "utf8"});
  const binMatch = otoolBin.stdout.match(/sectname __text\s+segname __TEXT\s+addr (0x[0-9a-fA-F]+)/);
  const nmBin = spawnSync("nm", ["-n", binary], {encoding: "utf8"});
  const checkGuardMatch = nmBin.stdout.match(/^([0-9a-fA-F]{16})\s+T\s+_checkGuard$/m);
  if (!binMatch || !checkGuardMatch) return false;
  const exeTextAddr = Number(binMatch[1]);
  const checkGuardVmAddr = Number(`0x${checkGuardMatch[1]}`);
  const nmObj = spawnSync("nm", ["-n", checkObj], {encoding: "utf8"});
  const localMatch = nmObj.stdout.match(/^([0-9a-fA-F]{16})\s+T\s+_checkGuard$/m);
  const otoolObj = spawnSync("otool", ["-l", checkObj], {encoding: "utf8"});
  const objTextMatch = otoolObj.stdout.match(/sectname __text\s+segname __TEXT\s+addr (0x[0-9a-fA-F]+)/);
  if (!localMatch || !objTextMatch) return false;
  const localOffset = Number(`0x${localMatch[1]}`) - Number(objTextMatch[1]);
  return exeTextAddr + localOffset === checkGuardVmAddr;
}

function writeAdversarialLldbStub(dir: string): string {
  const stubDir = join(dir, "stub-bin");
  const mkdir = spawnSync("mkdir", ["-p", stubDir], {encoding: "utf8"});
  assertTrue(mkdir.status === 0, `创建私有 LLDB stub 目录: ${mkdir.stderr}`);
  const stub = join(stubDir, "lldb");
  const source = [
    "#!/usr/bin/env bun",
    "const args = process.argv.slice(2);",
    "const mode = process.env.CHENG_TEST_LLDB_MODE || '';",
    "if (args.includes('-b')) {",
    "  const commands = [];",
    "  for (let i = 0; i < args.length; i++) if (args[i] === '-o') commands.push(args[++i]);",
    "  for (const command of commands) {",
    "    console.log('(lldb) ' + command);",
    "    if (command === 'settings show target.disable-aslr') console.log('target.disable-aslr (boolean) = true');",
    "    else if (command.startsWith('breakpoint set -a ')) console.log('Breakpoint 1: where = fixture`checkGuard, address = 0x0000000000000001');",
    "    else if (command === 'continue') console.log(\"Process 999 stopped\\n* thread #1, stop reason = breakpoint 1.1\");",
    "    else if (command === 'breakpoint list') console.log('1: address = fixture[0x1], locations = 1, resolved = 1, hit count = 1');",
    "    else if (command === 'register read x0') console.log('      x0 = 0x0000000000001000');",
    "    else if (command.startsWith('memory read ')) console.log('0x0000000000001010: 0x0000002a');",
    "    else if (command.startsWith('bt ')) console.log('* frame #0: 0x0000000000002000 fixture`stubWriter + 4');",
    "  }",
    "  if (mode === 'nonzero') { console.log('Process 999 stopped\\n* thread #1, stop reason = breakpoint 1.1'); process.exit(7); }",
    "  process.exit(0);",
    "}",
    "console.log('(lldb) target create fixture');",
    "const readline = await import('node:readline');",
    "const rl = readline.createInterface({input: process.stdin, crlfDelay: Infinity});",
    "let continueCount = 0;",
    "for await (const line of rl) {",
    "  console.log('(lldb) ' + line);",
    "  if (line.startsWith('script print(') && line.endsWith(')')) {",
    "    console.log(JSON.parse(line.slice('script print('.length, -1)));",
    "  } else if (line.startsWith('script lldb.debugger.SetAsync(False)')) {",
    "    console.log('__CHENG_FUSION_LLDB_ASYNC__=False');",
    "  } else if (line === 'settings show target.disable-aslr') {",
    "    console.log('target.disable-aslr (boolean) = true');",
    "  } else if (line.startsWith('process launch --stop-at-entry')) {",
    "    console.log(\"Process 999 launched: 'fixture' (arm64)\");",
    "  } else if (line.startsWith('watchpoint set expression ')) {",
    "    console.log('Watchpoint 1: addr = 0x1010 size = 4 state = enabled type = w');",
    "  } else if (line === 'continue') {",
    "    continueCount++;",
    "    if (continueCount === 1) console.log('Process 999 stopped\\n* thread #1, stop reason = watchpoint 1.1\\nTarget 0: (fixture) stopped.');",
    "    else console.log('Process 999 stopped\\n* thread #1, stop reason = watchpoint 1.1\\nerror: invalid process\\nTarget 0: (fixture) stopped.');",
    "  } else if (line.startsWith('memory read ')) {",
    "    console.log('0x0000000000001010: 0x0000002a');",
    "  } else if (line.startsWith('bt ')) {",
    "    console.log('* frame #0: 0x0000000000002000 fixture`stubWriter + 4');",
    "  } else if (line === 'quit') {",
    "    process.exit(0);",
    "  }",
    "}",
  ].join("\n");
  writeFileSync(stub, source);
  chmodSync(stub, 0o755);
  return stubDir;
}

async function verifyAdversarialLldbSessions(dir: string, binary: string) {
  const stubDir = writeAdversarialLldbStub(dir);
  const path = `${stubDir}:${process.env.PATH || ""}`;
  const input = {binary, breakAddr: "0x1", watchRegister: "x0", watchOffset: 16, watchSize: 4, maxHits: 4, timeoutSec: 10};

  const nonzeroMcp = startMcp({PATH: path, CHENG_TEST_LLDB_MODE: "nonzero"}, dir);
  try {
    await nonzeroMcp.initialize({rootUri: `file://${dir}`});
    const result = await nonzeroMcp.callTool("cheng_corrupt_hunt", input, undefined, 15_000);
    assertTrue(result.isError === true && /stage1: lldb exited 7/.test(String(result.parsed)), `残留合法文本不能掩盖 stage1 非零 exitCode，实得 ${JSON.stringify(result.parsed)}`);
  } finally {
    nonzeroMcp.kill();
  }

  const invalidMcp = startMcp({PATH: path, CHENG_TEST_LLDB_MODE: "invalid_after_hit"}, dir);
  try {
    await invalidMcp.initialize({rootUri: `file://${dir}`});
    const result = await invalidMcp.callTool("cheng_corrupt_hunt", input, undefined, 15_000);
    assertTrue(result.isError === true && /invalid process/.test(String(result.parsed)), `旧 watchpoint hit 后的 invalid process 必须 hard error，实得 ${JSON.stringify(result.parsed)}`);
  } finally {
    invalidMcp.kill();
  }
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "fusion-harness-item11-"));
  try {
    const {binary, checkObj} = buildFixture(dir);
    console.log("[A] LLDB 会话 exitCode 与旧文本反例必须 hard-fail");
    await verifyAdversarialLldbSessions(dir, binary);
    const mcp = startMcp({}, dir);
    try {
      await mcp.initialize({rootUri: `file://${dir}`});

      console.log("[B] breakSymbol+primaryObject 模式: nm 解析 checkGuard 入口地址, 两阶段定位真正的越界写");
      const primaryMappingHolds = verifyPrimaryObjectFirstTextMapping(binary, checkObj);
      assertTrue(primaryMappingHolds, "本夹具里 check.o 确实从最终二进制 __text 起点拼入，且 object section 地址已归一化");
      const symbolResult = await mcp.callTool("cheng_corrupt_hunt", {
        binary,
        primaryObject: checkObj,
        breakSymbol: "_checkGuard",
        watchRegister: "x0",
        watchOffset: 16,
        watchSize: 4,
        breakpointSkip: 1,
        maxHits: 8,
        timeoutSec: 30,
      }, undefined, 40000);
      assertTrue(symbolResult.isError !== true, `cheng_corrupt_hunt(breakSymbol) 未报错, 实得: ${JSON.stringify(symbolResult.parsed)}`);
      const parsedSymbol = symbolResult.parsed;
      assertTrue(parsedSymbol.schema === "cheng_corrupt_hunt", `schema 精确, 实得 ${parsedSymbol.schema}`);
      assertTrue(!parsedSymbol.error, `无 stage1 错误, 实得: ${parsedSymbol.error}`);
      assertTrue(/^sha256:[0-9a-f]{64}$/.test(parsedSymbol.inputEvidence?.binary?.sha256 || "") && /^sha256:[0-9a-f]{64}$/.test(parsedSymbol.inputEvidence?.primaryObject?.sha256 || ""), `结果锁定 binary/primaryObject SHA-256，实得 ${JSON.stringify(parsedSymbol.inputEvidence)}`);
      assertTrue(typeof parsedSymbol.stage1?.H === "string" && parsedSymbol.stage1.H.startsWith("0x"), `stage1.H 是十六进制地址, 实得 ${parsedSymbol.stage1?.H}`);
      assertTrue(parsedSymbol.stage1.initialValue === "0x0000dead", `stage1 检测点读到的 H 初始值已是腐蚀后的 0xdead, 实得 ${parsedSymbol.stage1.initialValue}`);
      assertTrue(parsedSymbol.stage1.lldbExitCode === 0 && parsedSymbol.lldbExitCode === 0, `两阶段正式 LLDB 会话都必须 exit 0，实得 stage1=${parsedSymbol.stage1.lldbExitCode} stage2=${parsedSymbol.lldbExitCode}`);
      assertTrue(Number.isInteger(parsedSymbol.stage1.breakpointId), `stage1 必须报告从 LLDB 创建输出解析出的目标 breakpoint id, 实得 ${parsedSymbol.stage1.breakpointId}`);
      assertTrue(parsedSymbol.stage1.breakpointSkip === 1 && parsedSymbol.stage1.observedBreakpointHits === 2, `stage1 明确跳过第一次健康检测并取第二次命中, 实得 ${JSON.stringify(parsedSymbol.stage1)}`);
      assertTrue(Number.isInteger(parsedSymbol.watchpointId), `stage2 必须报告从 LLDB 创建输出解析出的目标 watchpoint id, 实得 ${parsedSymbol.watchpointId}`);
      assertTrue(Array.isArray(parsedSymbol.hits) && parsedSymbol.hits.length >= 2, `stage2 至少命中2次(storeBaseline 的合法写 + corruptingWrite 的越界写), 实得 hits=${JSON.stringify(parsedSymbol.hits)}`);
      assertTrue(parsedSymbol.hits.every((h: any) => h.address === parsedSymbol.stage1.H), `每个 newValue 必须与同轮 memory-read 的 H 地址绑定, 实得 ${JSON.stringify(parsedSymbol.hits.map((h: any) => ({address: h.address, value: h.newValue})))}`);

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
        breakpointSkip: 1,
        maxHits: 8,
        timeoutSec: 30,
      }, undefined, 40000);
      assertTrue(addrResult.isError !== true, `cheng_corrupt_hunt(breakAddr) 未报错, 实得: ${JSON.stringify(addrResult.parsed).slice(0, 500)}`);
      const parsedAddr = addrResult.parsed;
      assertTrue(parsedAddr.stage1.H === parsedSymbol.stage1.H, `breakAddr 模式算出的 H 和 breakSymbol 模式一致, 实得 ${parsedAddr.stage1.H} vs ${parsedSymbol.stage1.H}`);
      const culpritHit2 = parsedAddr.hits.find((h: any) => /corruptingWrite/.test(h.symbol || ""));
      assertTrue(!!culpritHit2, `breakAddr 模式同样能命中 corruptingWrite, 实得: ${JSON.stringify(parsedAddr.hits.map((h: any) => h.symbol))}`);

      console.log("[C] breakpointSkip 大于真实检测命中数必须显式失败");
      const tooFar = await mcp.callTool("cheng_corrupt_hunt", {
        binary, primaryObject: checkObj, breakAddr: breakAddrHex,
        watchRegister: "x0", watchOffset: 16, watchSize: 4,
        breakpointSkip: 2, timeoutSec: 30,
      }, undefined, 40000);
      assertTrue(tooFar.isError === true && /stage1/.test(String(tooFar.parsed)), `两次检测不能冒充 ignore-count=2 后的第三次命中, 实得 ${JSON.stringify(tooFar.parsed)}`);

      console.log("[D] breakpointSkip 只计算目标断点命中，signal stop 不能冒充一次检测");
      const signalFirst = await mcp.callTool("cheng_corrupt_hunt", {
        binary, primaryObject: checkObj, breakAddr: breakAddrHex,
        env: {PRESTOP: "1"},
        watchRegister: "x0", watchOffset: 16, watchSize: 4,
        breakpointSkip: 1, timeoutSec: 30,
      }, undefined, 40000);
      assertTrue(signalFirst.isError === true && /stage1/.test(String(signalFirst.parsed)), `signal stop 不能冒充目标断点命中, 实得 ${JSON.stringify(signalFirst.parsed)}`);

      console.log("[E] stage1 memory read 失败必须硬失败，不能把 null 地址值送入 stage2");
      const unreadable = await mcp.callTool("cheng_corrupt_hunt", {
        binary, primaryObject: checkObj, breakAddr: breakAddrHex,
        watchRegister: "x0", watchOffset: 0x700000000000, watchSize: 4,
        timeoutSec: 30,
      }, undefined, 40000);
      assertTrue(unreadable.isError === true && /stage1/.test(String(unreadable.parsed)), `stage1 读不到 H 必须在启动 stage2 前失败, 实得 ${JSON.stringify(unreadable.parsed)}`);

      console.log("[F] stage2 的 signal stop 不能冒充 watchpoint hit，也不能错配后一轮 value/backtrace");
      const stage2Signal = await mcp.callTool("cheng_corrupt_hunt", {
        binary, primaryObject: checkObj, breakAddr: breakAddrHex,
        env: {POSTCHECK_STOP: "1"},
        watchRegister: "x0", watchOffset: 16, watchSize: 4,
        breakpointSkip: 0, maxHits: 8, timeoutSec: 30,
      }, undefined, 40000);
      assertTrue(stage2Signal.isError === true && /stage2:.*signal SIGSTOP/.test(String(stage2Signal.parsed)), `stage2 signal stop 必须 hard-fail, 实得 ${JSON.stringify(stage2Signal.parsed)}`);

      console.log("[G] stage2 进程退出前零次目标 watchpoint hit 必须显式失败");
      const noHits = await mcp.callTool("cheng_corrupt_hunt", {
        binary, primaryObject: checkObj, breakAddr: breakAddrHex,
        env: {NO_WRITES: "1"},
        watchRegister: "x0", watchOffset: 16, watchSize: 4,
        breakpointSkip: 0, maxHits: 8, timeoutSec: 30,
      }, undefined, 40000);
      assertTrue(noHits.isError === true && /未观察到目标 watchpoint .*任何命中/.test(String(noHits.parsed)), `零次目标命中不能伪装成功, 实得 ${JSON.stringify(noHits.parsed)}`);

      console.log("[H] 恰好一种 breakAddr/breakSymbol 的入参校验");
      const bothResult = await mcp.callTool("cheng_corrupt_hunt", {
        binary, breakAddr: breakAddrHex, breakSymbol: "_checkGuard", primaryObject: checkObj,
        watchRegister: "x0", watchOffset: 16, watchSize: 4,
      }, undefined, 15000);
      assertTrue(bothResult.isError === true, "同时给 breakAddr 和 breakSymbol 应报错(恰好一种)");
      const neitherResult = await mcp.callTool("cheng_corrupt_hunt", {
        binary, watchRegister: "x0", watchOffset: 16, watchSize: 4,
      }, undefined, 15000);
      assertTrue(neitherResult.isError === true, "两者都不给应报错(恰好一种)");

      console.log("[I] binary/primaryObject 必须是 regular non-symlink");
      const binarySymlink = join(dir, "binary-symlink");
      symlinkSync(binary, binarySymlink);
      const symlinkBinaryResult = await mcp.callTool("cheng_corrupt_hunt", {
        binary: binarySymlink, primaryObject: checkObj, breakAddr: breakAddrHex,
        watchRegister: "x0", watchOffset: 16, watchSize: 4,
      }, undefined, 10_000);
      assertTrue(symlinkBinaryResult.isError === true && /regular non-symlink/.test(String(symlinkBinaryResult.parsed)), `binary symlink 启动 LLDB 前 hard-fail，实得 ${JSON.stringify(symlinkBinaryResult.parsed)}`);

      const primarySymlink = join(dir, "primary-symlink.o");
      symlinkSync(checkObj, primarySymlink);
      const symlinkPrimaryResult = await mcp.callTool("cheng_corrupt_hunt", {
        binary, primaryObject: primarySymlink, breakAddr: breakAddrHex,
        watchRegister: "x0", watchOffset: 16, watchSize: 4,
      }, undefined, 10_000);
      assertTrue(symlinkPrimaryResult.isError === true && /regular non-symlink/.test(String(symlinkPrimaryResult.parsed)), `primaryObject symlink 启动 LLDB 前 hard-fail，实得 ${JSON.stringify(symlinkPrimaryResult.parsed)}`);

      console.log("[J] 原始 primaryObject 在 stage1 改写不影响已冻结的两阶段取证");
      const driftingPrimary = join(dir, "drifting-primary.o");
      copyFileSync(checkObj, driftingPrimary);
      const sizeBeforeDrift = lstatSync(driftingPrimary).size;
      const driftResult = await mcp.callTool("cheng_corrupt_hunt", {
        binary, primaryObject: driftingPrimary, breakAddr: breakAddrHex,
        env: {MUTATE_PATH: driftingPrimary},
        watchRegister: "x0", watchOffset: 16, watchSize: 4,
        timeoutSec: 30,
      }, undefined, 40_000);
      assertTrue(driftResult.isError !== true, `stage1 后原文件漂移不得改变私有快照取证，实得 ${JSON.stringify(driftResult.parsed).slice(0, 500)}`);
      assertTrue(lstatSync(driftingPrimary).size > sizeBeforeDrift, "夹具确实在原 primaryObject 写入；结果仍来自启动前冻结副本");
      assertTrue(driftResult.parsed.inputEvidence?.primaryObject?.path === driftingPrimary, `报告保持调用者原 primaryObject 路径，实得 ${JSON.stringify(driftResult.parsed.inputEvidence)}`);

      console.log("[K] debuggee 不能覆盖控制器 RSS 上限");
      const reservedEnv = await mcp.callTool("cheng_corrupt_hunt", {
        binary, primaryObject: checkObj, breakAddr: breakAddrHex,
        env: {CHENG_PROCESS_MAX_RSS_BYTES: "1"},
        watchRegister: "x0", watchOffset: 16, watchSize: 4,
      }, undefined, 10_000);
      assertTrue(reservedEnv.isError === true && /reserved CHENG_PROCESS_MAX_RSS_BYTES/.test(String(reservedEnv.parsed)), `保留 RSS 变量必须在启动前拒绝，实得 ${JSON.stringify(reservedEnv.parsed)}`);
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
