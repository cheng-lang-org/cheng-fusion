// current stopReason -> stopClass 是 crash/corrupt 分析的纯协议映射。这里直接覆盖完整判定树，
// 不依赖 LLDB、本机 /tmp 残留产物或可选 Cheng 构建。
import {chmodSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {classifyStopClass, triageChengBinaryCrash} from "../src/cheng_toolkit_m9000.ts";
import {assertTrue} from "./mcp_client.ts";

type Frame = {module?: string | null};

function expectClass(stopReason: string | null, frames: Frame[] | null, expected: string | null) {
  const actual = classifyStopClass(stopReason, frames);
  assertTrue(actual === expected, `${JSON.stringify(stopReason)} 应分类为 ${expected}, 实得 ${actual}`);
}

async function expectHardError(input: Record<string, unknown>, pattern: RegExp) {
  let message = "";
  try {
    await triageChengBinaryCrash(input);
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assertTrue(pattern.test(message), `应硬失败 ${pattern}，实得 ${JSON.stringify(message)}`);
}

async function testLiveInputContracts() {
  console.log("[D] live 输入必须是稳定、非空、非软链的可执行文件");
  const before = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith("cheng-fusion-crash-triage-")));
  const dir = mkdtempSync(join(tmpdir(), "fusion-harness-item10-"));
  try {
    const missing = join(dir, "missing");
    const empty = join(dir, "empty");
    const nonExecutable = join(dir, "non-executable");
    const executable = join(dir, "executable");
    const binarySymlink = join(dir, "binary-symlink");
    writeFileSync(empty, "");
    chmodSync(empty, 0o700);
    writeFileSync(nonExecutable, "#!/bin/sh\nexit 0\n");
    chmodSync(nonExecutable, 0o600);
    writeFileSync(executable, "#!/bin/sh\nexit 0\n");
    chmodSync(executable, 0o700);
    symlinkSync(executable, binarySymlink);

    await expectHardError({binary: missing}, /binary not found/);
    await expectHardError({binary: dir}, /non-empty regular non-symlink/);
    await expectHardError({binary: empty}, /non-empty regular non-symlink/);
    await expectHardError({binary: nonExecutable}, /not executable/);
    await expectHardError({binary: binarySymlink}, /non-empty regular non-symlink/);

    const missingPrimary = join(dir, "missing.primary.o");
    const emptyPrimary = join(dir, "empty.primary.o");
    const primarySymlink = join(dir, "primary-symlink");
    writeFileSync(emptyPrimary, "");
    symlinkSync(emptyPrimary, primarySymlink);
    await expectHardError({binary: executable, primaryObject: missingPrimary}, /primaryObject not found/);
    await expectHardError({binary: executable, primaryObject: dir}, /primaryObject must be a non-empty regular non-symlink/);
    await expectHardError({binary: executable, primaryObject: emptyPrimary}, /primaryObject must be a non-empty regular non-symlink/);
    await expectHardError({binary: executable, primaryObject: primarySymlink}, /primaryObject must be a non-empty regular non-symlink/);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
  const leaked = readdirSync(tmpdir()).filter((name) => name.startsWith("cheng-fusion-crash-triage-") && !before.has(name));
  assertTrue(leaked.length === 0, `失败路径不得泄漏私有快照目录，实得 ${JSON.stringify(leaked)}`);
}

async function main() {
  console.log("[A] Darwin Mach exception 与 BSD signal 分类");
  expectClass(null, [], null);
  expectClass("", [], null);
  expectClass("signal SIGABRT", [], "panic-exit");
  expectClass("EXC_BAD_ACCESS (code=1, address=0x10)", [], "SIGSEGV");
  expectClass("EXC_BAD_ACCESS (code=2, address=0x10)", [], "SIGBUS");
  expectClass("EXC_BAD_ACCESS (code=-1, address=0x10)", [], "SIGBUS");
  expectClass("EXC_BAD_INSTRUCTION (code=1)", [], "SIGILL");
  expectClass("EXC_ARITHMETIC (code=1)", [], "SIGFPE");

  console.log("[B] EXC_BREAKPOINT 只按崩点顶帧识别 malloc 完整性陷阱");
  expectClass("EXC_BREAKPOINT (code=1)", [{module: "libsystem_malloc.dylib"}], "malloc-integrity-brk");
  expectClass("EXC_BREAKPOINT (code=1)", [{module: "/usr/lib/system/libsystem_malloc.dylib"}], "malloc-integrity-brk");
  expectClass("EXC_BREAKPOINT (code=1)", [{module: "cheng_program"}, {module: "libsystem_malloc.dylib"}], "breakpoint-trap");
  expectClass("EXC_BREAKPOINT (code=1)", [], "breakpoint-trap");
  expectClass("EXC_BREAKPOINT (code=1)", null, "breakpoint-trap");

  console.log("[C] 未知 stop reason 不伪装成已知信号");
  expectClass("signal SIGTERM", [], "unknown");
  expectClass("thread exited", [], "unknown");

  await testLiveInputContracts();

  console.log("item10 crash stop class: PASS");
}

main().catch((error) => {
  console.error("item10 crash stop class: FAIL", error);
  process.exit(1);
});
