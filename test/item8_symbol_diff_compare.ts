// cheng_symbol_diff action:compare 端到端验证：测试运行时用系统 cc 分别生成真实 arm64/x86_64
// Mach-O object，再由工具真实调用 nm/otool。fixture 全部位于本次 mkdtemp 目录，不依赖固定 /tmp 产物。
import {chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, truncateSync, writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {tmpdir} from "node:os";
import {dirname,join} from "node:path";
import {pathToFileURL} from "node:url";
import {startMcp, assertTrue} from "./mcp_client.ts";
import {CHENG_SYMBOL_COMPARE_MAX_OBJECT_BYTES,withChengBinarySymbolSnapshots} from "../src/cheng_symbol_diff_m9008.ts";
import {compareChengBinarySymbols} from "../src/cheng_toolkit_m9000.ts";

function fixtureSource(side: "a" | "b") {
  return `
#if defined(__arm64__)
__asm__(".text\\n.p2align 2\\nbl _orphan_${side}_dependency\\n");
#elif defined(__x86_64__)
__asm__(".text\\n.p2align 4\\ncallq _orphan_${side}_dependency\\n");
#else
#error unsupported fixture architecture
#endif

extern int shared_dependency(int);
extern int only_${side}_dependency(int);
extern int local_${side}_dependency(int);
extern int data_${side}_dependency;

int common_owner(int value) {
  return shared_dependency(value);
}

int ${side}_first_owner(int value) {
  return only_${side}_dependency(value) + shared_dependency(value);
}

int ${side}_second_owner(int value) {
  return only_${side}_dependency(value);
}

int ${side}_data_owner(void) {
  return data_${side}_dependency;
}

static __attribute__((used, noinline)) int ${side}_local_text_owner(int value) {
  return local_${side}_dependency(value);
}
`;
}

function compileFixture(root: string, architecture: "arm64" | "x86_64", side: "a" | "b") {
  const source = join(root, `${architecture}-${side}.c`);
  const object = join(root, `${architecture}-${side}.o`);
  writeFileSync(source, fixtureSource(side));
  const compiled = spawnSync("cc", [
    "-arch", architecture,
    "-O0",
    "-fno-builtin",
    "-fno-stack-protector",
    "-c", source,
    "-o", object,
  ], {encoding: "utf8"});
  if (compiled.error) throw compiled.error;
  if (compiled.status !== 0) {
    throw new Error(`cc ${architecture} ${side} fixture failed (${compiled.status}): ${compiled.stderr}`);
  }
  return object;
}

function compileExecutableFixture(root: string, architecture: "arm64" | "x86_64") {
  const source = join(root, `${architecture}-executable.c`);
  const executable = join(root, `${architecture}-executable`);
  writeFileSync(source, "int main(void) { return 0; }\n");
  const compiled = spawnSync("cc", ["-arch", architecture, source, "-o", executable], {encoding: "utf8"});
  if (compiled.error) throw compiled.error;
  if (compiled.status !== 0) {
    throw new Error(`cc ${architecture} executable fixture failed (${compiled.status}): ${compiled.stderr}`);
  }
  return executable;
}

function makeFatObject(root: string, arm64Object: string, x86Object: string) {
  const output = join(root, "universal.o");
  const created = spawnSync("lipo", ["-create", arm64Object, x86Object, "-output", output], {encoding: "utf8"});
  if (created.error) throw created.error;
  if (created.status !== 0) throw new Error(`lipo fixture failed (${created.status}): ${created.stderr}`);
  return output;
}

function sameJson(actual: unknown, expected: unknown, message: string) {
  assertTrue(JSON.stringify(actual) === JSON.stringify(expected), `${message}, 实得 ${JSON.stringify(actual)}`);
}

function sha256(buffer: Buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

function writeSymbolProtocolDriver(root: string) {
  const driver = join(root, "symbol-protocol-driver.ts");
  writeFileSync(driver, [
    "#!/usr/bin/env bun",
    'import {readFileSync} from "node:fs";',
    'const sourceArg = process.argv.find((arg) => arg.startsWith("--in:"));',
    'if (!sourceArg) throw new Error("missing --in");',
    'const source = sourceArg.slice("--in:".length);',
    'const mode = readFileSync(source, "utf8").trim();',
    'const separator = mode === "valid_compact" ? "\\n" : "\\n\\n";',
    'let fields = [',
    '  `entry=${source}`,',
    '  "target=arm64-apple-darwin",',
    '  `source_path=${source}`,',
    '  "lowering_symbol_count=1",',
    '  "lowering_symbols=main::main",',
    '  "primary_symbol_count=1",',
    '  "primary_symbols=_main",',
    '  "primary_unsupported_count=0",',
    '];',
    'if (mode === "header_only") { process.stdout.write("cheng_symbols\\n"); process.exit(0); }',
    'if (mode === "missing_count") fields = fields.filter((line) => !line.startsWith("primary_symbol_count="));',
    'if (mode === "duplicate_key") fields.splice(6, 0, "primary_symbol_count=1");',
    'if (mode === "count_mismatch") fields[3] = "lowering_symbol_count=2";',
    'if (mode === "bad_target") fields[1] = "target=x86_64-unknown-linux-gnu";',
    'if (mode === "bad_entry") fields[0] = "entry=/wrong/source.cheng";',
    'if (mode === "noncanonical_count") fields[3] = "lowering_symbol_count=01";',
    'if (mode === "extra_field") fields.push("unexpected=1");',
    'const schema = mode === "legacy_header" ? "cheng_symbols_v1" : "cheng_symbols";',
    'const report = `${schema}${separator}${fields.join("\\n")}\\n`;',
    'if (mode === "invalid_utf8") { process.stdout.write(Buffer.concat([Buffer.from(report, "utf8"), Buffer.from([0xff])])); process.exit(0); }',
    'process.stdout.write(report);',
    'if (mode === "nonzero") process.exitCode = 7;',
    "",
  ].join("\n"), {mode: 0o700});
  chmodSync(driver, 0o700);
  return driver;
}

async function verifySnapshotProtocol(root: string) {
  console.log("[snapshot protocol] 只接受完整、有序、自洽的 cheng_symbols");
  const driver = writeSymbolProtocolDriver(root);
  const sourceDir = join(root, "snapshot-sources");
  mkdirSync(sourceDir);
  const mcp = startMcp({CHENG_DRIVER: driver}, root);
  try {
    const rootUri = pathToFileURL(root).href;
    await mcp.initialize({rootUri, workspaceFolders: [{uri: rootUri, name: "symbol-diff-fixture"}]});
    const callMode = async (mode: string) => {
      const source = join(sourceDir, `${mode}.cheng`);
      writeFileSync(source, `${mode}\n`);
      return mcp.callTool("cheng_symbol_diff", {action: "snapshot", source}, undefined, 10000);
    };

    for (const mode of ["valid_blank", "valid_compact"]) {
      const result = await callMode(mode);
      assertTrue(result.isError !== true, `${mode} 正式 producer 布局通过`);
      assertTrue(result.parsed.schema === "cheng_symbols", `${mode} schema 精确`);
      assertTrue(result.parsed.loweringSymbolCount === 1 && result.parsed.primarySymbolCount === 1, `${mode} count/list 自洽`);
      const expectedReport = [
        "cheng_symbols",
        ...(mode === "valid_blank" ? [""] : []),
        `entry=${result.parsed.source}`,
        "target=arm64-apple-darwin",
        `source_path=${result.parsed.source}`,
        "lowering_symbol_count=1",
        "lowering_symbols=main::main",
        "primary_symbol_count=1",
        "primary_symbols=_main",
        "primary_unsupported_count=0",
      ].join("\n") + "\n";
      assertTrue(result.parsed.byteLength === Buffer.byteLength(expectedReport), `${mode} byteLength 来自原始字节`);
    }

    for (const mode of [
      "header_only",
      "legacy_header",
      "missing_count",
      "duplicate_key",
      "count_mismatch",
      "bad_target",
      "bad_entry",
      "noncanonical_count",
      "extra_field",
      "invalid_utf8",
      "nonzero",
    ]) {
      const result = await callMode(mode);
      assertTrue(result.isError === true, `${mode} 不得凭 header/部分字段假成功`);
    }

    const target = join(sourceDir, "symlink-target.cheng");
    const linked = join(sourceDir, "symlink-source.cheng");
    writeFileSync(target, "valid_blank\n");
    symlinkSync(target, linked);
    const symlinked = await mcp.callTool("cheng_symbol_diff", {action: "snapshot", source: linked}, undefined, 10000);
    assertTrue(symlinked.isError === true, "snapshot source symlink 在启动 driver 前硬拒绝");
  } finally {
    mcp.kill();
  }
}

function callsFor(parsed: any, side: "A" | "B", symbol: string) {
  return parsed[`undefinedCallers${side}`].filter((call: any) => call.symbol === symbol);
}

function assertRealResolvedCalls(calls: any[], expectedOwners: string[], relocationType: string) {
  sameJson(calls.map((call) => call.owner).sort(), [...expectedOwners].sort(), `${calls[0]?.symbol} 的 owner 精确来自 nm 函数范围`);
  for (const call of calls) {
    assertTrue(call.ownerResolved === true, `${call.symbol} 调用已解析 owner`);
    assertTrue(call.section === "__TEXT,__text", `${call.symbol} relocation 位于 __TEXT,__text`);
    assertTrue(call.relocationType === relocationType, `${call.symbol} relocation type=${relocationType}`);
    assertTrue(/^0x[0-9a-f]{16}$/.test(call.relocationAddress), `${call.symbol} 返回真实 relocation address=${call.relocationAddress}`);
    const site = BigInt(call.siteAddress);
    const start = BigInt(call.functionStart);
    const end = BigInt(call.functionEndExclusive);
    assertTrue(site >= start && site < end, `${call.symbol} relocation address 落在 [functionStart,functionEndExclusive)`);
  }
}

async function verifyArchitecture(mcp: ReturnType<typeof startMcp>, root: string, architecture: "arm64" | "x86_64") {
  const objectA = compileFixture(root, architecture, "a");
  const objectB = compileFixture(root, architecture, "b");
  const relocationType = architecture === "arm64" ? "BR26" : "BRANCH";

  console.log(`[${architecture}] defined/undefined 差分 + relocation owner`);
  const forward = await mcp.callTool("cheng_symbol_diff", {action: "compare", objectA, objectB}, undefined, 30000);
  assertTrue(forward.isError !== true, `正向 compare 未报错: ${JSON.stringify(forward.parsed).slice(0, 300)}`);
  const parsed = forward.parsed;
  assertTrue(parsed.schema === "cheng_symbol_diff_compare", `schema 精确, 实得 ${parsed.schema}`);
  assertTrue(parsed.objectA === objectA && parsed.objectB === objectB, `结果回显原始 objectA/objectB，不泄漏私有快照路径`);
  assertTrue(parsed.objectASha256 === sha256(readFileSync(objectA)), `objectA SHA-256 锁定本次快照`);
  assertTrue(parsed.objectBSha256 === sha256(readFileSync(objectB)), `objectB SHA-256 锁定本次快照`);

  sameJson(parsed.onlyInA, ["_a_data_owner", "_a_first_owner", "_a_second_owner"], "既有 defined onlyInA 保持准确");
  sameJson(parsed.onlyInB, ["_b_data_owner", "_b_first_owner", "_b_second_owner"], "既有 defined onlyInB 保持准确");
  assertTrue(parsed.countA === 4 && parsed.countB === 4 && parsed.countCommon === 1, `defined T 计数保持 4/4/common=1`);
  assertTrue(!("common" in parsed), `includeCommon 默认 false 时不返回 defined common 名字`);

  const undefinedA = ["_data_a_dependency", "_local_a_dependency", "_only_a_dependency", "_orphan_a_dependency", "_shared_dependency"];
  const undefinedB = ["_data_b_dependency", "_local_b_dependency", "_only_b_dependency", "_orphan_b_dependency", "_shared_dependency"];
  const undefinedOnlyA = undefinedA.filter((name) => name !== "_shared_dependency");
  const undefinedOnlyB = undefinedB.filter((name) => name !== "_shared_dependency");
  sameJson(parsed.undefinedA, undefinedA, "undefinedA 是真实 nm U 集合");
  sameJson(parsed.undefinedB, undefinedB, "undefinedB 是真实 nm U 集合");
  sameJson(parsed.undefinedOnlyInA, undefinedOnlyA, "undefinedOnlyInA 集合差准确");
  sameJson(parsed.undefinedOnlyInB, undefinedOnlyB, "undefinedOnlyInB 集合差准确");
  assertTrue(parsed.countUndefinedA === 5 && parsed.countUndefinedB === 5, `undefined U 计数为 5/5`);
  assertTrue(parsed.countUndefinedOnlyInA === 4 && parsed.countUndefinedOnlyInB === 4 && parsed.countUndefinedCommon === 1, `undefined only/common 计数自洽`);
  assertTrue(!("undefinedCommon" in parsed), `includeCommon 默认 false 时不返回 undefined common 名字`);

  assertRealResolvedCalls(callsFor(parsed, "A", "_only_a_dependency"), ["_a_first_owner", "_a_second_owner"], relocationType);
  assertRealResolvedCalls(callsFor(parsed, "A", "_shared_dependency"), ["_common_owner", "_a_first_owner"], relocationType);
  assertTrue(callsFor(parsed, "A", "_data_a_dependency").length === 0, `data relocation 不伪装成函数调用`);
  const unresolved = callsFor(parsed, "A", "_orphan_a_dependency");
  assertTrue(unresolved.length === 1, `无函数标签的真实 branch relocation 被保留`);
  assertTrue(unresolved[0].owner === "unresolved-owner" && unresolved[0].ownerResolved === false, `无法落入 nm 函数范围时显式 unresolved-owner`);
  assertTrue(unresolved[0].functionStart === null && unresolved[0].functionEndExclusive === null, `unresolved-owner 不猜测函数范围`);
  assertTrue(unresolved[0].relocationType === relocationType, `unresolved relocation type=${relocationType}`);

  const nm = spawnSync("nm", ["-nP", objectA], {encoding: "utf8"});
  if (nm.error) throw nm.error;
  assertTrue(nm.status === 0 && new RegExp(`^_a_local_text_owner\\s+t\\s`, "m").test(nm.stdout), `fixture 含真实 nm 小写 t 静态函数`);
  const local = callsFor(parsed, "A", "_local_a_dependency");
  assertTrue(local.length === 1, `局部 text 函数内的真实 branch relocation 被保留`);
  assertTrue(local[0].owner === "unresolved-owner" && local[0].ownerResolved === false, `小写 t 只切分区间，绝不成为 owner`);
  assertTrue(local[0].functionStart === null && local[0].functionEndExclusive === null, `局部 text owner 不伪造全局函数范围`);

  console.log(`[${architecture}] A/B 对调严格镜像`);
  const reverse = await mcp.callTool("cheng_symbol_diff", {action: "compare", objectA: objectB, objectB: objectA}, undefined, 30000);
  assertTrue(reverse.isError !== true, `反向 compare 未报错: ${JSON.stringify(reverse.parsed).slice(0, 300)}`);
  sameJson(forward.parsed.onlyInA, reverse.parsed.onlyInB, "defined onlyInA -> onlyInB 严格镜像");
  sameJson(forward.parsed.onlyInB, reverse.parsed.onlyInA, "defined onlyInB -> onlyInA 严格镜像");
  sameJson(forward.parsed.undefinedOnlyInA, reverse.parsed.undefinedOnlyInB, "undefined onlyInA -> onlyInB 严格镜像");
  sameJson(forward.parsed.undefinedOnlyInB, reverse.parsed.undefinedOnlyInA, "undefined onlyInB -> onlyInA 严格镜像");
  sameJson(forward.parsed.undefinedCallersA, reverse.parsed.undefinedCallersB, "undefinedCallers A/B 对调严格镜像");
  sameJson(forward.parsed.undefinedCallersB, reverse.parsed.undefinedCallersA, "undefinedCallers B/A 对调严格镜像");

  return {objectA, objectB};
}

async function main() {
  const root = mkdtempSync(join(tmpdir(), "cheng-symbol-diff-"));
  writeFileSync(join(root, "cheng-package.toml"), `[package]\nname = "symbol-diff-fixture"\n`);
  const mcp = startMcp({}, root);
  try {
    const rootUri = pathToFileURL(root).href;
    await mcp.initialize({rootUri, workspaceFolders: [{uri: rootUri, name: "symbol-diff-fixture"}]});

    const arm64 = await verifyArchitecture(mcp, root, "arm64");
    const x86 = await verifyArchitecture(mcp, root, "x86_64");

    console.log("[common/limit] 显式 common + 全量计数不受 limit 影响");
    const common = await mcp.callTool("cheng_symbol_diff", {action: "compare", objectA: arm64.objectA, objectB: arm64.objectB, includeCommon: true}, undefined, 30000);
    assertTrue(common.isError !== true, `includeCommon compare 未报错`);
    sameJson(common.parsed.common, ["_common_owner"], "includeCommon 返回 defined common");
    sameJson(common.parsed.undefinedCommon, ["_shared_dependency"], "includeCommon 返回 undefined common");

    const limited = await mcp.callTool("cheng_symbol_diff", {action: "compare", objectA: arm64.objectA, objectB: arm64.objectB, limit: 1}, undefined, 30000);
    assertTrue(limited.isError !== true, `limit compare 未报错`);
    assertTrue(limited.parsed.onlyInA.length === 1 && limited.parsed.onlyInATruncated === true, `defined onlyInA 受 limit=1 截断`);
    assertTrue(limited.parsed.undefinedOnlyInA.length === 1 && limited.parsed.undefinedOnlyInATruncated === true, `undefined onlyInA 受 limit=1 截断`);
    assertTrue(limited.parsed.countOnlyInA === 3 && limited.parsed.countUndefinedOnlyInA === 4, `limit 不改变精确计数`);

    console.log("[Mach-O type] executable/fat 不得产生空 caller 假阴性");
    const executable = compileExecutableFixture(root, "arm64");
    const nonObject = await mcp.callTool("cheng_symbol_diff", {action: "compare", objectA: arm64.objectA, objectB: executable}, undefined, 30000);
    assertTrue(nonObject.isError === true, `thin MH_EXECUTE 被硬拒绝`);
    assertTrue(String(nonObject.parsed).includes("thin MH_OBJECT") && String(nonObject.parsed).includes("MH_EXECUTE"), `非对象错误明确报告实际 Mach-O 类型`);

    const fatObject = makeFatObject(root, arm64.objectA, x86.objectA);
    const fat = await mcp.callTool("cheng_symbol_diff", {action: "compare", objectA: fatObject, objectB: arm64.objectB}, undefined, 30000);
    assertTrue(fat.isError === true, `fat Mach-O 被硬拒绝`);
    assertTrue(String(fat.parsed).includes("fat Mach-O") && String(fat.parsed).includes("thin MH_OBJECT"), `fat 错误明确说明只支持 thin MH_OBJECT`);

    console.log("[path] 不存在路径尽早报错");
    const missing = await mcp.callTool("cheng_symbol_diff", {action: "compare", objectA: join(root, "missing.o"), objectB: arm64.objectB}, undefined, 10000);
    assertTrue(missing.isError === true, `不存在路径返回 isError`);

    console.log("[path] compare 只接受绝对路径");
    let relativeWorkCalled = false;
    let relativeError = "";
    try {
      withChengBinarySymbolSnapshots("relative-a.o", arm64.objectB, () => {
        relativeWorkCalled = true;
      });
    } catch (error) {
      relativeError = error instanceof Error ? error.message : String(error);
    }
    assertTrue(relativeError.includes("objectA must be an absolute path"), `相对路径在文件读取前硬拒绝，实得 ${relativeError}`);
    assertTrue(relativeWorkCalled === false, `相对路径不得进入 nm/otool 比较闭包`);
    const relative = await mcp.callTool("cheng_symbol_diff", {action: "compare", objectA: "relative-a.o", objectB: arm64.objectB}, undefined, 10000);
    assertTrue(relative.isError === true && String(relative.parsed).includes("absolute path"), `MCP 相对路径返回明确错误`);

    console.log("[size] sparse 超限对象在 nm/otool 前硬拒绝");
    const oversized = join(root, "oversized-sparse.o");
    writeFileSync(oversized, Buffer.from([0]));
    truncateSync(oversized, CHENG_SYMBOL_COMPARE_MAX_OBJECT_BYTES + 1);
    let oversizedWorkCalled = false;
    let oversizedError = "";
    try {
      withChengBinarySymbolSnapshots(oversized, arm64.objectB, () => {
        oversizedWorkCalled = true;
      });
    } catch (error) {
      oversizedError = error instanceof Error ? error.message : String(error);
    }
    assertTrue(oversizedError.includes(`${CHENG_SYMBOL_COMPARE_MAX_OBJECT_BYTES}-byte snapshot limit`), `超限错误显示正式上限，实得 ${oversizedError}`);
    assertTrue(oversizedWorkCalled === false, `sparse 超限对象不得进入 nm/otool 比较闭包`);
    const oversizedViaMcp = await mcp.callTool("cheng_symbol_diff", {action: "compare", objectA: oversized, objectB: arm64.objectB}, undefined, 10000);
    assertTrue(oversizedViaMcp.isError === true && String(oversizedViaMcp.parsed).includes("snapshot limit"), `MCP sparse 超限在 nm 前报上限错误`);

    console.log("[path] symlink 在启动 nm/otool 前硬拒绝");
    const linkedObject = join(root, "linked-object.o");
    symlinkSync(arm64.objectA, linkedObject);
    const linked = await mcp.callTool("cheng_symbol_diff", {action: "compare", objectA: linkedObject, objectB: arm64.objectB}, undefined, 10000);
    assertTrue(linked.isError === true, `symlink 输入返回 isError`);
    assertTrue(String(linked.parsed).includes("non-symlink"), `symlink 错误明确，实得 ${JSON.stringify(linked.parsed)}`);

    console.log("[snapshot] 原路径替换/删除不影响同一次私有快照");
    const replaceA = join(root, "replace-a.o");
    const deleteB = join(root, "delete-b.o");
    copyFileSync(arm64.objectA, replaceA);
    copyFileSync(arm64.objectB, deleteB);
    const expectedA = readFileSync(replaceA);
    const expectedB = readFileSync(deleteB);
    let privateA = "";
    let privateB = "";
    const snapshotted = withChengBinarySymbolSnapshots(replaceA, deleteB, (snapshots: any) => {
      privateA = snapshots.objectA.snapshotPath;
      privateB = snapshots.objectB.snapshotPath;
      assertTrue((statSync(dirname(privateA)).mode & 0o777) === 0o700, `私有快照目录权限精确为 0700`);
      assertTrue((statSync(privateA).mode & 0o777) === 0o600 && (statSync(privateB).mode & 0o777) === 0o600, `私有快照文件权限精确为 0600`);
      writeFileSync(replaceA, Buffer.from("a later invalid generation\n"));
      rmSync(deleteB);
      assertTrue(readFileSync(privateA).equals(expectedA), `objectA 私有快照不受原路径替换影响`);
      assertTrue(readFileSync(privateB).equals(expectedB), `objectB 私有快照不受原路径删除影响`);
      assertTrue(snapshots.objectA.sha256 === sha256(expectedA) && snapshots.objectB.sha256 === sha256(expectedB), `SHA-256 来自同一次流式快照`);
      return compareChengBinarySymbols(privateA, privateB);
    });
    sameJson(snapshotted.onlyInA, ["_a_data_owner", "_a_first_owner", "_a_second_owner"], `原路径漂移后比较仍来自同一私有快照`);
    assertTrue(!existsSync(privateA) && !existsSync(privateB), `比较闭包结束后删除私有快照`);

    console.log("[cleanup] 比较闭包失败也删除私有快照");
    let failedPrivateA = "";
    let failedPrivateB = "";
    let deliberateError = "";
    try {
      withChengBinarySymbolSnapshots(arm64.objectA, arm64.objectB, (snapshots: any) => {
        failedPrivateA = snapshots.objectA.snapshotPath;
        failedPrivateB = snapshots.objectB.snapshotPath;
        throw new Error("deliberate compare failure");
      });
    } catch (error) {
      deliberateError = error instanceof Error ? error.message : String(error);
    }
    assertTrue(deliberateError === "deliberate compare failure", `比较闭包原错误不被清理覆盖`);
    assertTrue(!existsSync(failedPrivateA) && !existsSync(failedPrivateB), `比较闭包失败后删除两个私有快照`);

    await verifySnapshotProtocol(root);
  } finally {
    mcp.kill();
    rmSync(root, {recursive: true, force: true});
  }
  console.log("item8 symbol_diff compare: PASS");
}

main().catch((error) => {
  console.error("item8 symbol_diff compare: FAIL", error);
  process.exit(1);
});
