// cheng_crash_triage v2: 新增 {binary,args,env,primaryObject} 结构化输入模式 —
// 工具自己起 lldb 崩点批处理(-k bt/register read/image list), nm(primary.o)+otool(text
// section addr/size)+image-list slide 全量符号化, 帧落 primary.o 自身 __text 范围外时
// 如实标 provider-unresolved 而不是误判成最近符号的巨大 offset。
//
// 用两个真实崩溃(不是 mock):
//  [A] 自建 C 崩溃夹具(bury<-wrap<-main 三层空指针解引用), 验证 lldb 原生符号路径
//      (cc 不带 -g 也会嵌入的 nlist 符号表, lldb 自己就能给出 "bury + 12" 这类符号,
//      工具应直接采信, 不再走 nm/otool 数学换算)。
//  [B] 若本机残留 /tmp/f23/GEN2M(Cheng 自举驱动) + /tmp/lenfix/triv.cheng, 真实复现
//      "纯发射 gen2 崩溃(0 行 stderr)" 场景: 驱动自身在编译 triv.cheng 时 SIGSEGV,
//      验证 nm/otool 兜底符号化路径 + provider-unresolved 分支(崩点+上层几帧落在
//      primary.o 自身声明的 __text size 之外, 属于其它被链接 .o 的代码)。这条件测:
//      若该临时产物在这次运行环境中不存在则明确打印跳过, 不伪造通过。
import {existsSync, mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {startMcp, assertTrue} from "./mcp_client.ts";

function buildCCrashFixture(): {dir: string; binary: string} {
  const dir = mkdtempSync(join(tmpdir(), "fusion-harness-item6-"));
  const source = join(dir, "fixture.c");
  const primaryObject = join(dir, "fixture.exe.primary.o");
  const binary = join(dir, "fixture.exe");
  writeFileSync(source, "int bury(int *p) { return *p; }\nint wrap(int *p) { return bury(p); }\nint main(void) { int *p = (int *)0x10; return wrap(p); }\n");
  const compileObj = spawnSync("cc", ["-O0", "-c", source, "-o", primaryObject], {encoding: "utf8"});
  if (compileObj.status !== 0) throw new Error(`cc -c failed: ${compileObj.stderr}`);
  const link = spawnSync("cc", [primaryObject, "-o", binary], {encoding: "utf8"});
  if (link.status !== 0) throw new Error(`cc link failed: ${link.stderr}`);
  const sign = spawnSync("codesign", ["--force", "-s", "-", binary], {encoding: "utf8"});
  if (sign.status !== 0) throw new Error(`codesign failed: ${sign.stderr}`);
  return {dir, binary};
}

async function testCFixtureLiveCrash() {
  console.log("[A] 自建 C 崩溃夹具: binary 模式端到端(真 lldb, 真崩溃, 真符号)");
  const {dir, binary} = buildCCrashFixture();
  const mcp = startMcp({}, dir);
  try {
    await mcp.initialize({rootUri: `file://${dir}`, workspaceFolders: [{uri: `file://${dir}`, name: "fusion-harness-item6"}]});
    const {isError, parsed} = await mcp.callTool("cheng_crash_triage", {binary}, undefined, 20000);
    assertTrue(isError !== true, `binary 模式调用未报错, 实得: ${JSON.stringify(parsed).slice(0, 400)}`);
    assertTrue(parsed.schema === "cheng_crash_triage_live.v1", `schema 正确, 实得 ${parsed.schema}`);
    assertTrue(parsed.exited === false, `确实崩溃而非正常退出, 实得 exited=${parsed.exited}`);
    assertTrue(/EXC_BAD_ACCESS/.test(parsed.stopReason || ""), `stopReason 含 EXC_BAD_ACCESS, 实得 ${parsed.stopReason}`);
    assertTrue(parsed.faultAddress === "0x10", `faultAddress 精确等于被解引用的 0x10, 实得 ${parsed.faultAddress}`);
    assertTrue(typeof parsed.crashInsn?.insn === "string" && parsed.crashInsn.insn.length > 0, `crashInsn 捕到崩点指令, 实得 ${JSON.stringify(parsed.crashInsn)}`);
    assertTrue(Array.isArray(parsed.frames) && parsed.frames.length >= 3, `帧数>=3(bury/wrap/main), 实得 ${parsed.frames?.length}`);
    assertTrue(/bury/.test(parsed.frames[0]?.symbol || ""), `frame0 符号化为 bury, 实得 ${parsed.frames[0]?.symbol}`);
    assertTrue(/wrap/.test(parsed.frames[1]?.symbol || ""), `frame1 符号化为 wrap, 实得 ${parsed.frames[1]?.symbol}`);
    assertTrue(/main/.test(parsed.frames[2]?.symbol || ""), `frame2 符号化为 main, 实得 ${parsed.frames[2]?.symbol}`);
    assertTrue(parsed.frames.every((f: any) => f.providerUnresolved === false), `全部三层用户帧均已解析(非 provider-unresolved), 实得 ${JSON.stringify(parsed.frames.map((f: any) => f.providerUnresolved))}`);
    assertTrue(typeof parsed.registers?.pc === "string" && typeof parsed.registers?.sp === "string", `寄存器读到 pc/sp, 实得 ${JSON.stringify(parsed.registers?.pc)},${JSON.stringify(parsed.registers?.sp)}`);
  } finally {
    mcp.kill();
    rmSync(dir, {recursive: true, force: true});
  }
}

async function testStderrModeRegression() {
  console.log("[B] 回归: 旧 stderr 文本模式不受影响");
  const mcp = startMcp({}, "/Users/lbcheng/cheng-fusion");
  try {
    await mcp.initialize({rootUri: "file:///Users/lbcheng/cheng-fusion"});
    const {isError, parsed} = await mcp.callTool("cheng_crash_triage", {stderr: "fatal: src=foo.cheng:12-14 boom"}, undefined, 10000);
    assertTrue(isError !== true, `stderr 模式调用未报错, 实得: ${JSON.stringify(parsed).slice(0, 300)}`);
    assertTrue(Array.isArray(parsed.frames) && parsed.frames.length >= 1 && parsed.frames[0]?.file === "foo.cheng", `stderr 模式仍解析出 file:line, 实得: ${JSON.stringify(parsed).slice(0, 300)}`);
  } finally {
    mcp.kill();
  }
}

async function testGen2mRealDriverCrashIfPresent() {
  const binary = "/tmp/f23/GEN2M";
  const source = "/tmp/lenfix/triv.cheng";
  if (!existsSync(binary) || !existsSync(source)) {
    console.log(`[C] 跳过: 真实 Cheng 驱动崩溃复现产物不在(${binary} / ${source} 缺一), 这是本机临时构建产物非仓库固定资产`);
    return;
  }
  console.log("[C] 真实 Cheng 自举驱动崩溃复现: 纯发射 gen2 崩溃(0 行 stderr) + provider-unresolved 分支");
  const dir = mkdtempSync(join(tmpdir(), "fusion-harness-item6-gen2m-"));
  const out = join(dir, "t_triv.exe");
  const mcp = startMcp({CHENG_PROCESS_MAX_RSS_BYTES: "12884901888"}, dir);
  try {
    await mcp.initialize({rootUri: `file://${dir}`});
    const args = ["system-link-exec", "--root:/tmp/f23/tree", `--in:${source}`, "--emit:exe", "--link-providers", "--target:arm64-apple-darwin", `--out:${out}`];
    const {isError, parsed} = await mcp.callTool("cheng_crash_triage", {binary, args, timeoutSec: 60}, undefined, 70000);
    assertTrue(isError !== true, `Cheng 驱动 binary 模式调用未报错, 实得: ${JSON.stringify(parsed).slice(0, 400)}`);
    assertTrue(parsed.exited === false, `确实崩溃(0 行 stderr 场景), 实得 exited=${parsed.exited}`);
    assertTrue(/EXC_BAD_ACCESS/.test(parsed.stopReason || ""), `stopReason 含 EXC_BAD_ACCESS, 实得 ${parsed.stopReason}`);
    const resolvedNames = (parsed.frames || []).filter((f: any) => f.providerUnresolved === false).map((f: any) => f.symbol);
    assertTrue(resolvedNames.some((name: string) => /BackendDriverDispatchMin/.test(name || "")), `nm/otool 兜底路径解析出真实 Cheng 函数名, 实得: ${JSON.stringify(resolvedNames)}`);
    const providerFrames = (parsed.frames || []).filter((f: any) => f.providerUnresolved === true);
    assertTrue(providerFrames.length > 0 && providerFrames.every((f: any) => f.reason === "provider-region"), `崩点自身落在 primary.o 声明的 __text size 之外, 如实标 provider-unresolved 而非瞎猜符号, 实得: ${JSON.stringify(providerFrames.map((f: any) => f.reason))}`);
  } finally {
    mcp.kill();
    rmSync(dir, {recursive: true, force: true});
  }
}

async function main() {
  await testCFixtureLiveCrash();
  await testStderrModeRegression();
  await testGen2mRealDriverCrashIfPresent();
  console.log("item6 crash triage v2: PASS");
}

main().catch((error) => {
  console.error("item6 crash triage v2: FAIL", error);
  process.exit(1);
});
