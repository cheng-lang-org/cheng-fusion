// gen2_symbolize.sh 对真实 Mach-O object 的边界验证：符号区间必须被下一符号或
// __TEXT,__text 末尾封闭；同址别名不得任选其一；区外大 offset 不得归给最后符号。
import {mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {assertTrue} from "./mcp_client.ts";

type RunResult = ReturnType<typeof spawnSync>;

function runSymbolize(script: string, object: string, ...offsets: Array<number | string>): RunResult {
  return spawnSync(script, [object, ...offsets.map(String)], {encoding: "utf8"});
}

function assertExit(result: RunResult, expected: number, message: string) {
  if (result.error) throw result.error;
  assertTrue(result.status === expected, `${message}: exit=${result.status}, stdout=${result.stdout}, stderr=${result.stderr}`);
}

function parseTextSection(object: string) {
  const result = spawnSync("otool", ["-l", object], {encoding: "utf8"});
  assertExit(result, 0, "otool -l fixture");
  const matches = [...result.stdout.matchAll(
    /^Section[ \t]*$\n[ \t]*sectname __text[ \t]*$\n[ \t]*segname __TEXT[ \t]*$\n[ \t]*addr (0x[0-9a-fA-F]+)[ \t]*$\n[ \t]*size (0x[0-9a-fA-F]+)[ \t]*$/gm,
  )];
  assertTrue(matches.length === 1, `fixture 必须恰有一个 __TEXT,__text，实得 ${matches.length}`);
  return {address: Number.parseInt(matches[0][1], 16), size: Number.parseInt(matches[0][2], 16)};
}

function parseSymbolAddresses(object: string) {
  const result = spawnSync("nm", ["-n", object], {encoding: "utf8"});
  assertExit(result, 0, "nm -n fixture");
  const symbols = new Map<string, {address: number; kind: "T" | "t"}>();
  for (const line of result.stdout.split("\n")) {
    const fields = line.trim().split(/\s+/);
    if (fields.length === 3 && (fields[1] === "T" || fields[1] === "t")) {
      symbols.set(fields[2], {address: Number.parseInt(fields[0], 16), kind: fields[1]});
    }
  }
  return symbols;
}

function main() {
  assertTrue(process.platform === "darwin", "gen2_symbolize fixture requires Darwin Mach-O tools");
  const root = mkdtempSync(join(tmpdir(), "cheng-gen2-symbolize-"));
  const source = join(root, "intervals.s");
  const object = join(root, "intervals.o");
  const map = join(root, "overlap.map");
  const invalidMap = join(root, "invalid.map");
  const script = join(import.meta.dir, "..", "tools", "gen2_symbolize.sh");

  try {
    writeFileSync(source, [
      ".section __TEXT,__text,regular,pure_instructions",
      ".space 4, 0",
      ".globl _first",
      "_first:",
      ".space 8, 0",
      "_local_only:",
      ".space 4, 0",
      ".globl _second",
      "_second:",
      "_second_local_alias:",
      ".space 12, 0",
      ".globl _tail_a",
      ".globl _tail_b",
      "_tail_a:",
      "_tail_b:",
      ".space 4, 0",
      "",
    ].join("\n"));
    const compiled = spawnSync("cc", ["-c", source, "-o", object], {encoding: "utf8"});
    assertExit(compiled, 0, "cc Mach-O fixture");

    const text = parseTextSection(object);
    const symbols = parseSymbolAddresses(object);
    const first = symbols.get("_first")!.address - text.address;
    const localOnly = symbols.get("_local_only")!.address - text.address;
    const second = symbols.get("_second")!.address - text.address;
    const secondLocalAlias = symbols.get("_second_local_alias")!.address - text.address;
    const tailA = symbols.get("_tail_a")!.address - text.address;
    const tailB = symbols.get("_tail_b")!.address - text.address;
    assertTrue(symbols.get("_first")!.kind === "T" && symbols.get("_local_only")!.kind === "t", "fixture 同时含全局 T 与局部 t");
    assertTrue(first > 0 && first < localOnly && localOnly < second && second === secondLocalAlias && second < tailA && tailA === tailB && tailA < text.size,
      `fixture 区间有序且尾部同址: first=${first} local=${localOnly} second=${second} tail=${tailA} size=${text.size}`);

    console.log("[interval] 唯一符号使用真实半开区间");
    const firstStart = runSymbolize(script, object, `0x${first.toString(16)}`);
    assertExit(firstStart, 0, "first 起点");
    assertTrue(firstStart.stdout.includes("_first +0x0") && firstStart.stdout.includes(`[0x${first.toString(16)},0x${localOnly.toString(16)})`),
      `first 区间由局部 t 边界封闭: ${firstStart.stdout}`);
    const leadingZeroDecimal = runSymbolize(script, object, "08");
    assertExit(leadingZeroDecimal, 0, "前导零十进制 offset");
    assertTrue(leadingZeroDecimal.stdout.startsWith("8: _first +0x4"), `08 按十进制大整数解析: ${leadingZeroDecimal.stdout}`);
    const secondEnd = runSymbolize(script, object, tailA - 1);
    assertExit(secondEnd, 0, "second 末字节");
    assertTrue(secondEnd.stdout.includes("_second") && secondEnd.stdout.includes(`[0x${second.toString(16)},0x${tailA.toString(16)})`),
      `同址 T+t 由唯一全局 T 拥有，区间由尾符号封闭: ${secondEnd.stdout}`);

    console.log("[local] 小写 t 参与边界但绝不成为 owner");
    const local = runSymbolize(script, object, localOnly);
    assertExit(local, 2, "局部 text 标签");
    assertTrue(local.stdout.includes("NO_MATCH") && local.stdout.includes("local text symbol cannot own") && local.stdout.includes("_local_only"),
      `局部标签明确 unresolved: ${local.stdout}`);

    console.log("[alias] 同址别名区间明确歧义，不任选最后一个名字");
    const alias = runSymbolize(script, object, tailA);
    assertExit(alias, 3, "同址别名");
    assertTrue(alias.stderr.includes("ERROR AMBIGUOUS") && alias.stderr.includes("T:_tail_a,T:_tail_b"), `完整报告歧义名字: ${alias.stderr}`);

    console.log("[bounds] __text 尾后一字节和任意大 offset 均不归给尾符号");
    for (const offset of [text.size, text.size + 0x100000]) {
      const outside = runSymbolize(script, object, offset);
      assertExit(outside, 2, `区外 offset=${offset}`);
      assertTrue(outside.stdout.includes("NO_MATCH") && outside.stdout.includes("outside __TEXT,__text"), `明确报告区外: ${outside.stdout}`);
      assertTrue(!outside.stdout.includes("_tail_a") && !outside.stdout.includes("_tail_b"), `区外不伪归属尾符号: ${outside.stdout}`);
    }
    const widerThanUint64 = runSymbolize(script, object, "0xffffffffffffffffffffffffffffffff");
    assertExit(widerThanUint64, 2, "超过 64 位的区外 offset");
    assertTrue(widerThanUint64.stdout.includes("NO_MATCH") && !widerThanUint64.stdout.includes("_tail_"),
      `超大整数不经 Bash 溢出且不伪归属: ${widerThanUint64.stdout}`);

    console.log("[batch] 批量输入保留成功结果，但任一 unmatched 使整体非零");
    const batch = runSymbolize(script, object, first, text.size + 0x200000);
    assertExit(batch, 2, "批量包含 unmatched");
    assertTrue(batch.stdout.includes("_first +0x0") && batch.stdout.includes("NO_MATCH"), `批量输出完整: ${batch.stdout}`);

    console.log("[input] offset 语法由 Python 严格校验");
    const invalid = runSymbolize(script, object, "0x");
    assertExit(invalid, 64, "不完整 hexadecimal");
    assertTrue(invalid.stderr.includes("offset must be an unsigned"), `非法 offset 明确报错: ${invalid.stderr}`);

    writeFileSync(map, [
      "cheng_line_map_v1",
      "entry_count=2",
      "entry\t_alpha\tAlpha\tfixture.cheng\t1\t1\t1\tfunction_name=Alpha\tmodule_path=fixture.cheng\toffset=0x10\tsize=16",
      "entry\t_beta\tBeta\tfixture.cheng\t2\t2\t2\tfunction_name=Beta\tmodule_path=fixture.cheng\toffset=0x18\tsize=16",
      "",
    ].join("\n"));
    console.log("[map] 唯一命中成功、无命中与重叠命中非零");
    const mapUnique = runSymbolize(script, map, "0x10");
    assertExit(mapUnique, 0, "map 唯一命中");
    assertTrue(mapUnique.stdout.includes("Alpha +0x0") && mapUnique.stdout.includes("[0x10,0x20)"), `map 唯一区间: ${mapUnique.stdout}`);
    const mapMissing = runSymbolize(script, map, "08");
    assertExit(mapMissing, 2, "map 无命中");
    assertTrue(mapMissing.stdout.startsWith("8: NO_MATCH"), `map 的 08 按十进制解析且明确无命中: ${mapMissing.stdout}`);
    const mapOverlap = runSymbolize(script, map, "0x18");
    assertExit(mapOverlap, 3, "map 重叠命中");
    assertTrue(mapOverlap.stderr.includes("ERROR AMBIGUOUS") && mapOverlap.stderr.includes("Alpha@[0x10,0x20)") && mapOverlap.stderr.includes("Beta@[0x18,0x28)"),
      `map 完整报告重叠区间: ${mapOverlap.stderr}`);

    console.log("[map schema] 整份 map 必须满足 marker/count/唯一字段契约");
    for (const [label, content] of [
      ["missing marker", "entry_count=0\n"],
      ["wrong count", "cheng_line_map_v1\nentry_count=2\nentry\t_a\tA\tf.cheng\t1\t1\t1\tfunction_name=A\tmodule_path=f.cheng\toffset=0\tsize=1\n"],
      ["duplicate offset", "cheng_line_map_v1\nentry_count=1\nentry\t_a\tA\tf.cheng\t1\t1\t1\tfunction_name=A\tmodule_path=f.cheng\toffset=0\toffset=1\tsize=1\n"],
      ["invalid source lines", "cheng_line_map_v1\nentry_count=1\nentry\t_a\tA\tf.cheng\tnot-a-line\t2\t3\tfunction_name=A\tmodule_path=f.cheng\toffset=0\tsize=1\n"],
      ["missing module path", "cheng_line_map_v1\nentry_count=1\nentry\t_a\tA\tf.cheng\t1\t2\t3\tfunction_name=A\toffset=0\tsize=1\n"],
    ] as const) {
      writeFileSync(invalidMap, content);
      const invalidMapResult = runSymbolize(script, invalidMap, 0);
      assertExit(invalidMapResult, 1, label);
      assertTrue(invalidMapResult.stderr.includes("ERROR"), `${label} 明确硬失败: ${invalidMapResult.stderr}`);
    }
  } finally {
    rmSync(root, {recursive: true, force: true});
  }

  console.log("item17 gen2_symbolize: PASS");
}

main();
