// 加固项 3: facts 陈旧警示 — cheng_csg_query/cheng_evidence 响应带 factsGeneratedAt/factsSource
// (从 current.facts 边车 summary.json 读), 查询目标 source 与 facts 实际来源不一致时带 staleWarning。
//
// 用一个真实的临时 Cheng 项目(含 cheng-package.toml + 两个真源文件 a.cheng/b.cheng),
// 真实调用生产 cheng_csg_roundtrip 编出 a.cheng 的 facts, 再查 b.cheng 的符号, 断言 staleWarning。
import {chmodSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync, rmSync, realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {startMcp, assertTrue} from "./mcp_client.ts";

function createFixtureProject() {
  let root = mkdtempSync(join(tmpdir(), "fusion-harness-item3-"));
  root = realpathSync(root);
  writeFileSync(join(root, "cheng-package.toml"), `package_id = "pkg://local/fusion-harness-item3"\n`);
  mkdirSync(join(root, "src"), {recursive: true});
  writeFileSync(join(root, "src", "a.cheng"), `fn FactsSourceIsA(): int32 =\n    return 1\nfn main(): int32 =\n    return FactsSourceIsA()\n`);
  writeFileSync(join(root, "src", "b.cheng"), `fn FactsQueryTargetIsB(): int32 =\n    return 2\n`);
  return root;
}

function createTransactionalFakeDriver(root: string) {
  const driver = join(root, "transactional-fake-driver.ts");
  writeFileSync(driver, `#!/usr/bin/env bun
import {mkdirSync,symlinkSync,truncateSync,writeFileSync} from "node:fs";
import {dirname} from "node:path";
const command=process.argv[2]||"";
const arg=(prefix)=>process.argv.slice(3).find((value)=>value.startsWith(prefix))?.slice(prefix.length);
if(command==="emit-cold-csg"&&!arg("--in:")){console.error("missing --in");process.exit(2)}
const target=arg("--target:")||"";
const out=arg("--out:");
const report=arg("--report-out:");
const ensure=(path)=>mkdirSync(dirname(path),{recursive:true});
const FNV_BASIS=1469598103934665603n,FNV_PRIME=1099511628211n;
const SCHEMA="header(0){schema_version:u32,abi_version:u32,pointer_width:u8,endian:u8,producer_version:u32,target_triple:bytes32,entry_symbol:bytes64,schema_hash:u64,plan_hash:u64};target(1){triple:str};object_format(2){format:str};entry(3){symbol:str};function(4){item_id:u32,word_offset:u32,word_count:u32,symbol:str,body_kind:str};word(5){word:u32};reloc(6){source_item_id:u32,word_offset:u32,target_symbol:str};data(7){item_id:u32,symbol:str,align:u32,byte_count:u32,bytes:raw};data_reloc(8){source_item_id:u32,word_offset:u32,reloc_kind:u32,addend:u32,target_symbol:str};call_edge(9){source_item_id:u32,target_symbol:str}";
const LEGACY_SCHEMA=SCHEMA.replace(";call_edge(9){source_item_id:u32,target_symbol:str}","");
const fnv=(bytes)=>{let hash=FNV_BASIS;for(const byte of bytes)hash=BigInt.asUintN(64,(hash^BigInt(byte))*FNV_PRIME);return hash};
const u32=(value)=>{const out=Buffer.alloc(4);out.writeUInt32LE(value);return out};
const stringPayload=(value)=>{const bytes=Buffer.from(value,"utf8");return Buffer.concat([u32(bytes.length),bytes])};
const record=(kind,payload)=>"R"+kind.toString(16).padStart(4,"0")+payload.length.toString(16).padStart(8,"0")+payload.toString("hex")+"\\n";
const facts=()=>{
  const triple=target||"fake-target";
  const objectFormat=triple.includes("darwin")?"macho":"elf64";
  const fnPayload=Buffer.concat([u32(1),u32(0),u32(triple.includes("writer-invalid-word-range")?2:1),stringPayload("main"),stringPayload("ordinary")]);
  const duplicateFunction=triple.includes("writer-duplicate-function-item")?record(4,fnPayload):"";
  const duplicateData=triple.includes("writer-duplicate-data-item")?record(7,Buffer.concat([u32(7),stringPayload("dup_data"),u32(1),u32(1),Buffer.from([0])]))+record(7,Buffer.concat([u32(7),stringPayload("dup_data"),u32(1),u32(1),Buffer.from([0])])):"";
  const danglingReloc=triple.includes("writer-dangling-reloc")?record(6,Buffer.concat([u32(99),u32(0),stringPayload("main")])):"";
  const danglingDataReloc=triple.includes("writer-dangling-data-reloc")?record(8,Buffer.concat([u32(99),u32(0),u32(1),u32(0),stringPayload("main")])):"";
  const edgeSource=triple.includes("writer-dangling-call-edge")?99:1;
  const edgeTarget=triple.includes("writer-unknown-call-target")?"missing":"main";
  const callEdge=record(9,Buffer.concat([u32(edgeSource),stringPayload(edgeTarget)]));
  const payloadText=record(1,stringPayload(triple))+record(2,stringPayload(objectFormat))+record(3,stringPayload("main"))+record(4,fnPayload)+duplicateFunction+record(5,u32(0))+duplicateData+danglingReloc+danglingDataReloc+callEdge;
  const header=Buffer.alloc(126);
  header.writeUInt32LE(1,0);header.writeUInt32LE(1,4);header[8]=8;header[9]=1;header.writeUInt32LE(1,10);
  Buffer.from(triple,"utf8").copy(header,14,0,32);Buffer.from("main","utf8").copy(header,46,0,64);
  header.writeBigUInt64LE(fnv(Buffer.from(triple.includes("writer-legacy-schema")?LEGACY_SCHEMA:SCHEMA,"utf8")),110);header.writeBigUInt64LE(fnv(Buffer.from(payloadText,"utf8")),118);
  return "CHENG_CSG\\n"+record(0,header)+payloadText;
};
const goodReport="facts_record_count=7\\nfacts_function_count=1\\nfacts_word_count=1\\nfacts_reloc_count=0\\nfacts_data_count=0\\nfacts_data_reloc_count=0\\n";
const machoObject=(cpu=0x0100000c,fileType=1)=>{const bytes=Buffer.alloc(32);bytes.writeUInt32LE(0xfeedfacf,0);bytes.writeUInt32LE(cpu,4);bytes.writeUInt32LE(fileType,12);return bytes};
const elfObject=(machine=62,type=1)=>{const bytes=Buffer.alloc(64);bytes[0]=0x7f;bytes[1]=0x45;bytes[2]=0x4c;bytes[3]=0x46;bytes[4]=2;bytes[5]=1;bytes[6]=1;bytes.writeUInt16LE(type,16);bytes.writeUInt16LE(machine,18);bytes.writeUInt32LE(1,20);bytes.writeUInt16LE(64,52);return bytes};
const flood=async(byte)=>{
  if(!process.stdout.write(Buffer.alloc(17*1024*1024,byte)))await new Promise((resolve)=>process.stdout.once("drain",resolve));
  await new Promise((resolve)=>setTimeout(resolve,1000));
};
if(command==="emit-cold-csg"){
  if(target.includes("writer-timeout")){await new Promise((resolve)=>setTimeout(resolve,5000));process.exit(0)}
  if(target.includes("writer-overflow")){await flood(65);process.exit(0)}
  if(target.includes("writer-no-output"))process.exit(0);
  ensure(out);ensure(report);
  if(target.includes("writer-symlink-facts"))symlinkSync("/dev/null",out);
  else if(target.includes("writer-invalid-facts"))writeFileSync(out,"CHENG_CSG\\nnot-a-record\\n");
  else {writeFileSync(out,facts());if(target.includes("writer-oversize-facts"))truncateSync(out,257*1024*1024)}
  if(target.includes("writer-empty-report"))writeFileSync(report,"");
  else if(target.includes("writer-invalid-utf8-report"))writeFileSync(report,Buffer.from([0xff,0x0a]));
  else if(target.includes("writer-duplicate-report"))writeFileSync(report,goodReport+"facts_word_count=1\\n");
  else if(target.includes("writer-malformed-report"))writeFileSync(report,goodReport+"not-key-value\\n");
  else if(target.includes("writer-missing-count"))writeFileSync(report,goodReport.replace("facts_data_reloc_count=0\\n",""));
  else if(target.includes("writer-noncanonical-count"))writeFileSync(report,goodReport.replace("facts_word_count=1","facts_word_count=01"));
  else if(target.includes("writer-wrong-count"))writeFileSync(report,goodReport.replace("facts_word_count=1","facts_word_count=2"));
  else {writeFileSync(report,goodReport);if(target.includes("writer-oversize-report"))truncateSync(report,9*1024*1024)}
  process.exit(0);
}
if(command==="system-link-exec"){
  if(target.includes("reader-timeout")){await new Promise((resolve)=>setTimeout(resolve,5000));process.exit(0)}
  if(target.includes("reader-overflow")){await flood(66);process.exit(0)}
  if(target.includes("reader-no-output"))process.exit(0);
  ensure(out);ensure(report);
  let object=target.includes("linux")?elfObject(target.startsWith("arm64-")?183:target.startsWith("riscv64-")?243:62):machoObject();
  if(target.includes("reader-empty-object"))object=Buffer.alloc(0);
  else if(target.includes("reader-csgo-object"))object=Buffer.from([0x43,0x53,0x47,0x4f]);
  else if(target.includes("reader-wrong-arch"))object=machoObject(0x01000007);
  else if(target.includes("reader-execute-object"))object=machoObject(0x0100000c,2);
  if(target.includes("reader-symlink-object"))symlinkSync("/dev/null",out);
  else {writeFileSync(out,object);if(target.includes("reader-oversize-object"))truncateSync(out,513*1024*1024)}
  if(target.includes("reader-symlink-report"))symlinkSync("/dev/null",report);
  else if(target.includes("reader-wrong-count"))writeFileSync(report,goodReport.replace("facts_record_count=7","facts_record_count=5"));
  else if(target.includes("reader-duplicate-report"))writeFileSync(report,goodReport+"facts_record_count=7\\n");
  else writeFileSync(report,goodReport);
  process.exit(0);
}
console.error("unknown command: "+command);
process.exit(2);
`);
  chmodSync(driver, 0o755);
  return driver;
}

function snapshotFiles(paths: string[]) {
  return new Map(paths.map((path) => [path, readFileSync(path)]));
}

function assertSnapshotUnchanged(snapshot: Map<string, Buffer>, label: string) {
  for (const [path, bytes] of snapshot) {
    assertTrue(readFileSync(path).equals(bytes), `${label}: 失败事务未改写 ${path}`);
  }
}

async function waitForPath(path: string, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for path: ${path}`);
}

async function testTransactionalRoundtrip() {
  const root = createFixtureProject();
  const driver = createTransactionalFakeDriver(root);
  const outDir = join(root, "artifacts", "csg");
  const canonicalSummary = join(root, "conversion-reports", "cheng-csg", "summary.json");
  const canonicalLock = join(root, "conversion-reports", "cheng-csg", ".cheng-csg-roundtrip.lock");
  const mcp = startMcp({CHENG_COLD_DRIVER: driver, CHENG_FUSION_TIMEOUT_MS: "500"}, root);
  try {
    await mcp.initialize({rootUri: `file://${root}`, workspaceFolders: [{uri: `file://${root}`, name: "fusion-harness-item3-transaction"}]});
    console.log("[E] 唯一 staging 成功后提交不可变 generation，summary 固定在 canonical 路径");
    const good = await mcp.callTool("cheng_csg_roundtrip", {source: "src/a.cheng", outDir: "artifacts/csg", target: "arm64-apple-darwin"}, undefined, 10000);
    assertTrue(good.isError !== true && good.parsed?.success === true, `事务 roundtrip 成功, 实得: ${JSON.stringify(good.parsed).slice(0, 400)}`);
    assertTrue(typeof good.parsed.generationId === "string" && /^sha256:[0-9a-f]{64}$/.test(good.parsed.generationHash), "成功响应返回 generationId 与 generationHash");
    assertTrue(good.parsed.facts.includes("/.cheng-csg-generations/") && good.parsed.currentFacts === join(outDir, "current.facts"), "summary 以不可变 generation 为证据，current.facts 只是兼容投影");
    assertTrue(readFileSync(canonicalSummary, "utf8").includes(`\"generationId\": \"${good.parsed.generationId}\"`), "custom outDir 仍只在 canonical 路径提交 summary");
    const committedPaths = [
      canonicalSummary,
      join(outDir, "current.facts"),
      join(outDir, "current.writer.report.txt"),
      join(outDir, "current.reader.report.txt"),
      join(outDir, "a.cheng.o"),
      good.parsed.summary.facts,
      good.parsed.summary.writerReport,
      good.parsed.summary.readerReport,
      good.parsed.summary.objectOut,
    ];
    for (const path of committedPaths) {
      const stat = lstatSync(path);
      assertTrue(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0, `提交产物是非空 regular file: ${path}`);
    }
    for (const path of committedPaths.slice(5)) assertTrue((lstatSync(path).mode & 0o222) === 0, `generation 产物默认只读: ${path}`);
    assertTrue(!readdirSync(outDir).some((name) => name.startsWith(".cheng-csg-stage-")) && !existsSync(canonicalLock), "成功后清理 staging 与 canonical 锁");

    console.log("[E2] 完全相同产物复用内容地址 generation，不生成重复目录");
    const duplicate = await mcp.callTool("cheng_csg_roundtrip", {source: "src/a.cheng", outDir: "artifacts/csg", target: "arm64-apple-darwin"}, undefined, 10000);
    assertTrue(duplicate.isError !== true && duplicate.parsed?.reusedGeneration === true && duplicate.parsed?.generationId === good.parsed.generationId, `相同产物复用同一 generation, 实得: ${JSON.stringify(duplicate.parsed).slice(0, 300)}`);

    const committed = snapshotFiles(committedPaths.slice(0, 5));
    const generationCount = readdirSync(join(outDir, ".cheng-csg-generations")).length;
    const failures = [
      ["writer-no-output", "not materialized"],
      ["writer-symlink-facts", "non-symlink"],
      ["writer-invalid-facts", "invalid CHENG_CSG"],
      ["writer-legacy-schema", "schema_hash mismatch"],
      ["writer-duplicate-function-item", "duplicate CHENG_CSG function item_id"],
      ["writer-duplicate-data-item", "duplicate CHENG_CSG data item_id"],
      ["writer-invalid-word-range", "word range exceeds word records"],
      ["writer-dangling-reloc", "dangling source_item_id"],
      ["writer-dangling-data-reloc", "dangling source_item_id"],
      ["writer-dangling-call-edge", "dangling source_item_id"],
      ["writer-unknown-call-target", "call_edge target_symbol does not identify a function"],
      ["writer-empty-report", "non-empty"],
      ["writer-invalid-utf8-report", "valid UTF-8"],
      ["writer-duplicate-report", "duplicate key"],
      ["writer-malformed-report", "malformed key=value"],
      ["writer-missing-count", "missing required numeric field"],
      ["writer-noncanonical-count", "canonical non-negative integer"],
      ["writer-wrong-count", "mismatch"],
      ["writer-oversize-facts", "exceeds"],
      ["writer-oversize-report", "exceeds"],
      ["reader-no-output", "not materialized"],
      ["reader-empty-object", "non-empty"],
      ["reader-symlink-report", "non-symlink"],
      ["reader-symlink-object", "non-symlink"],
      ["reader-wrong-count", "mismatch"],
      ["reader-duplicate-report", "duplicate key"],
      ["reader-csgo-object", "not a thin Mach-O"],
      ["reader-wrong-arch", "target mismatch"],
      ["reader-execute-object", "MH_OBJECT"],
      ["reader-oversize-object", "exceeds"],
      ["writer-timeout", "timeout=true"],
      ["reader-overflow", "overflow=true"],
    ];
    console.log("[F] rc0 无新产物、symlink/空产物、timeout/overflow 都不得复用旧快照假绿");
    for (const [target, expected] of failures) {
      const targetTriple = `arm64-${target}-apple-darwin`;
      const failed = await mcp.callTool("cheng_csg_roundtrip", {source: "src/a.cheng", outDir: "artifacts/csg", target: targetTriple}, undefined, 10000);
      assertTrue(failed.isError === true && String(failed.parsed).includes(expected), `${target} 明确失败且指出 ${expected}, 实得: ${String(failed.parsed).slice(0, 300)}`);
      assertSnapshotUnchanged(committed, target);
      assertTrue(readdirSync(join(outDir, ".cheng-csg-generations")).length === generationCount, `${target}: 未提交失败 generation`);
      assertTrue(!readdirSync(outDir).some((name) => name.startsWith(".cheng-csg-stage-")) && !existsSync(canonicalLock), `${target}: 清理 staging 与 canonical 锁`);
    }

    console.log("[G] canonical 锁覆盖不同 outDir，且绝不删除不属于本事务的锁路径");
    const mcp2 = startMcp({CHENG_COLD_DRIVER: driver, CHENG_FUSION_TIMEOUT_MS: "500"}, root);
    try {
      await mcp2.initialize({rootUri: `file://${root}`, workspaceFolders: [{uri: `file://${root}`, name: "fusion-harness-item3-lock-peer"}]});
      const holding = mcp.callTool("cheng_csg_roundtrip", {source: "src/a.cheng", outDir: "artifacts/csg", target: "arm64-writer-timeout-apple-darwin"}, undefined, 10000);
      await waitForPath(canonicalLock);
      const blocked = await mcp2.callTool("cheng_csg_roundtrip", {source: "src/a.cheng", outDir: "artifacts/csg-other", target: "arm64-apple-darwin"}, undefined, 10000);
      assertTrue(blocked.isError === true && String(blocked.parsed).includes("another cheng_csg_roundtrip transaction owns"), "不同 outDir 仍被同一 canonical 提交锁互斥");
      assertTrue(lstatSync(canonicalLock).isDirectory(), "竞争失败方没有删除持有方的锁目录");
      const holdingResult = await holding;
      assertTrue(holdingResult.isError === true && String(holdingResult.parsed).includes("timeout=true"), "持锁事务按 timeout 明确失败");
      assertTrue(!existsSync(canonicalLock), "持锁事务退出后只清理自己创建的锁");
    } finally {
      mcp2.kill();
    }

    writeFileSync(canonicalLock, "foreign-lock-file\n");
    const foreignFile = await mcp.callTool("cheng_csg_roundtrip", {source: "src/a.cheng", outDir: "artifacts/csg-other", target: "arm64-apple-darwin"}, undefined, 10000);
    assertTrue(foreignFile.isError === true && lstatSync(canonicalLock).isFile() && readFileSync(canonicalLock, "utf8") === "foreign-lock-file\n", "预存普通文件锁硬失败且原样保留");
    rmSync(canonicalLock, {force: true});
    symlinkSync("/dev/null", canonicalLock);
    const foreignSymlink = await mcp.callTool("cheng_csg_roundtrip", {source: "src/a.cheng", outDir: "artifacts/csg-other", target: "arm64-apple-darwin"}, undefined, 10000);
    assertTrue(foreignSymlink.isError === true && lstatSync(canonicalLock).isSymbolicLink(), "预存 symlink 锁硬失败且不删除 symlink");
    rmSync(canonicalLock, {force: true});

    console.log("[H] 消费链按 bytes 重算 facts SHA，缓存也不能掩盖 generation 漂移");
    const canonicalCurrent = join(root, "conversion-reports", "cheng-csg", "current.facts");
    const committedSummaryBytes = readFileSync(canonicalSummary);
    writeFileSync(canonicalCurrent, readFileSync(join(outDir, "current.facts")));
    rmSync(canonicalSummary, {force: true});
    const uncommitted = await mcp.callTool("cheng_csg_query", {kind: "symbol", name: "none", file: "src/a.cheng"}, undefined, 10000);
    assertTrue(uncommitted.isError === true && String(uncommitted.parsed).includes("uncommitted Cheng CSG facts"), "缺 canonical summary 时绝不把 current.facts 当已提交证据");
    writeFileSync(canonicalSummary, committedSummaryBytes);
    rmSync(canonicalCurrent, {force: true});
    const warm = await mcp.callTool("cheng_csg_query", {kind: "symbol", name: "none", file: "src/a.cheng"}, undefined, 10000);
    assertTrue(warm.isError !== true, "先读取 generation facts 建立缓存");
    console.log("[H1] 查询端拒绝伪造 canonical summary，不能把可替换指针当证据");
    const forgedSummary = JSON.parse(committedSummaryBytes.toString("utf8"));
    forgedSummary.producer = "forged/csg-producer";
    writeFileSync(canonicalSummary, JSON.stringify(forgedSummary, null, 2) + "\n");
    const forgedSummaryResult = await mcp.callTool("cheng_csg_query", {kind: "symbol", name: "none", file: "src/a.cheng"}, undefined, 10000);
    assertTrue(forgedSummaryResult.isError === true && String(forgedSummaryResult.parsed).includes("untrusted schema, producer, or commit protocol"), "伪造 canonical summary 的 producer 必须硬失败");
    writeFileSync(canonicalSummary, committedSummaryBytes);
    const generationFacts = good.parsed.summary.facts;
    const originalGeneration = readFileSync(generationFacts, "utf8");
    const mutatedGeneration = originalGeneration.replace(/([0-9a-f])\n$/, (match, hex) => `${hex === "0" ? "1" : "0"}\n`);
    assertTrue(mutatedGeneration.length === originalGeneration.length && mutatedGeneration !== originalGeneration, "构造同长度且仍符合记录语法的 facts 漂移");
    chmodSync(generationFacts, 0o644);
    writeFileSync(generationFacts, mutatedGeneration);
    const drift = await mcp.callTool("cheng_csg_query", {kind: "symbol", name: "none", file: "src/a.cheng"}, undefined, 10000);
    assertTrue(drift.isError === true && String(drift.parsed).includes("facts hash mismatch"), "同长度 generation 漂移绕不过 content-hash cache key");
    assertTrue(readFileSync(join(outDir, "current.facts"), "utf8") === originalGeneration, "current.facts 与 generation 非硬链接，兼容投影未被反向篡改");

    console.log("[I] 工具只 GC 自证归属且非当前引用的旧内容地址 generation，保留数有硬上限");
    writeFileSync(generationFacts, originalGeneration);
    chmodSync(generationFacts, 0o444);
    const elf = await mcp.callTool("cheng_csg_roundtrip", {source: "src/a.cheng", outDir: "artifacts/csg", target: "x86_64-unknown-linux-gnu"}, undefined, 10000);
    assertTrue(elf.isError !== true, "ELF64 ET_REL x86_64 与 target 严格匹配后可提交");
    for (let index = 0; index < 6; index++) {
      const variant = await mcp.callTool("cheng_csg_roundtrip", {source: "src/a.cheng", outDir: "artifacts/csg", target: `arm64-variant${index}-apple-darwin`}, undefined, 10000);
      assertTrue(variant.isError !== true, `第 ${index} 个不同内容 generation 成功`);
    }
    const contentAddressed = readdirSync(join(outDir, ".cheng-csg-generations")).filter((name) => /^sha256-[0-9a-f]{64}$/.test(name));
    assertTrue(contentAddressed.length <= 4, `内容地址 generation 有限保留, 实得 ${contentAddressed.length}`);
    const latestSummary = JSON.parse(readFileSync(canonicalSummary, "utf8"));
    assertTrue(contentAddressed.includes(latestSummary.generationId), "GC 永不删除 canonical summary 当前引用");
  } finally {
    mcp.kill();
    rmSync(root, {recursive: true, force: true});
  }
}

async function main() {
  const root = createFixtureProject();
  const mcp = startMcp({}, root);
  try {
    await mcp.initialize({rootUri: `file://${root}`, workspaceFolders: [{uri: `file://${root}`, name: "fusion-harness-item3"}]});

    console.log("[setup] roundtrip a.cheng 生成 facts");
    const roundtrip = await mcp.callTool("cheng_csg_roundtrip", {source: "src/a.cheng"});
    assertTrue(roundtrip.isError !== true && roundtrip.parsed?.writerExitCode === 0 && roundtrip.parsed?.readerExitCode === 0, `roundtrip a.cheng 成功, 实得: ${JSON.stringify(roundtrip.parsed).slice(0, 300)}`);
    assertTrue(roundtrip.parsed?.summary?.totals?.callEdges > 0, `vendor cold driver 必须为同对象调用生成 kind=9 call_edge, 实得: ${JSON.stringify(roundtrip.parsed?.summary?.totals)}`);

    console.log("[A] 查询 a.cheng 自己的符号(应无 staleWarning)");
    const freshQuery = await mcp.callTool("cheng_csg_query", {kind: "symbol", name: "FactsSourceIsA", file: "src/a.cheng"});
    assertTrue(freshQuery.isError !== true, `查询未报错, 实得: ${JSON.stringify(freshQuery.parsed).slice(0, 200)}`);
    assertTrue(!!freshQuery.parsed.factsGeneratedAt, `响应带 factsGeneratedAt, 实得: ${freshQuery.parsed.factsGeneratedAt}`);
    assertTrue(freshQuery.parsed.factsSource === "src/a.cheng", `响应带 factsSource=src/a.cheng, 实得: ${freshQuery.parsed.factsSource}`);
    assertTrue(!freshQuery.parsed.staleWarning, `查询与 facts 来源一致时不带 staleWarning, 实得: ${freshQuery.parsed.staleWarning}`);

    console.log("[B] 查询 b.cheng 的符号(facts 其实来自 a.cheng, 应有 staleWarning)");
    const staleQuery = await mcp.callTool("cheng_csg_query", {kind: "symbol", name: "FactsQueryTargetIsB", file: "src/b.cheng"});
    assertTrue(staleQuery.isError !== true, `查询未报错(即便陈旧也只是警示不是硬失败), 实得: ${JSON.stringify(staleQuery.parsed).slice(0, 200)}`);
    assertTrue(!!staleQuery.parsed.staleWarning, `查询 b.cheng 时出现 staleWarning, 实得: ${staleQuery.parsed.staleWarning}`);
    assertTrue(staleQuery.parsed.staleWarning.includes("src/a.cheng"), `staleWarning 指出真实 facts 来源 src/a.cheng, 实得: ${staleQuery.parsed.staleWarning}`);
    assertTrue(staleQuery.parsed.staleWarning.includes("src/b.cheng"), `staleWarning 指出被查询的 src/b.cheng, 实得: ${staleQuery.parsed.staleWarning}`);
    // b.cheng 从未被 roundtrip 过, 所以 name 查不到匹配, 但陈旧警示应仍然出现(不依赖查询命不命中)
    assertTrue(Array.isArray(staleQuery.parsed.matches) && staleQuery.parsed.matches.length === 0, `b.cheng 未被 roundtrip 过, matches 应为空, 实得: ${JSON.stringify(staleQuery.parsed.matches)}`);

    console.log("[C] cheng_evidence 同样带 staleWarning");
    const evidenceStale = await mcp.callTool("cheng_evidence", {file: "src/b.cheng"});
    assertTrue(evidenceStale.isError !== true, `cheng_evidence 未报错, 实得: ${JSON.stringify(evidenceStale.parsed).slice(0, 200)}`);
    assertTrue(!!evidenceStale.parsed.staleWarning, `cheng_evidence 查询 b.cheng 时出现 staleWarning, 实得: ${evidenceStale.parsed.staleWarning}`);
    assertTrue(evidenceStale.parsed.factsSource === "src/a.cheng", `cheng_evidence 响应带真实 factsSource=src/a.cheng, 实得: ${evidenceStale.parsed.factsSource}`);

    console.log("[D] cheng_evidence 查 a.cheng 自己(应无 staleWarning)");
    const evidenceFresh = await mcp.callTool("cheng_evidence", {file: "src/a.cheng"});
    assertTrue(!evidenceFresh.parsed.staleWarning, `cheng_evidence 查询 a.cheng 时不带 staleWarning, 实得: ${evidenceFresh.parsed.staleWarning}`);
  } finally {
    mcp.kill();
    rmSync(root, {recursive: true, force: true});
  }
  await testTransactionalRoundtrip();
  console.log("item3 stale facts: PASS");
}

main().catch((error) => {
  console.error("item3 stale facts: FAIL", error);
  process.exit(1);
});
