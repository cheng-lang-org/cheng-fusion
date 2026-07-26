// 加固项 3: cheng_csg_query 对 source/entrySource 使用精确提交绑定并硬拒绝陈旧 facts；
// cheng_evidence 保留显式 staleWarning 作为非查询型风险报告。
//
// 用一个真实的临时 Cheng 项目(含 cheng-package.toml + 两个真源文件 a.cheng/b.cheng),
// 真实调用生产 cheng_csg_roundtrip 编出 a.cheng 的 facts, 再查 b.cheng 的符号, 断言无假结果。
import {chmodSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, renameSync, symlinkSync, writeFileSync, rmSync, realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash, randomUUID} from "node:crypto";
import {spawnSync} from "node:child_process";
import {startMcp, assertTrue} from "./mcp_client.ts";
import {CHENG_CSG_CURRENT_CONTRACT_SOURCE_PATH} from "../src/cheng_csg_current_contract.ts";
import {acquireRoundtripLock} from "../src/cheng_csg_roundtrip_m9003.ts";

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
import {appendFileSync,mkdirSync,symlinkSync,truncateSync,writeFileSync} from "node:fs";
import {dirname} from "node:path";
const command=process.argv[2]||"";
const arg=(prefix)=>process.argv.slice(3).find((value)=>value.startsWith(prefix))?.slice(prefix.length);
if(command==="emit-cold-csg"&&!arg("--in:")){console.error("missing --in");process.exit(2)}
const target=arg("--target:")||"";
const input=arg("--in:")||"";
const out=arg("--out:");
const report=arg("--report-out:");
const ensure=(path)=>mkdirSync(dirname(path),{recursive:true});
const lineMap="cheng_line_map\\nentry_count=1\\nentry\\tmain\\tmain\\tfixture.cheng\\t1\\t1\\t1\\tfunction_name=main\\tmodule_path=fixture.cheng\\n";
const FNV_BASIS=1469598103934665603n,FNV_PRIME=1099511628211n;
const SCHEMA="header(0){schema_version:u32,abi_version:u32,pointer_width:u8,endian:u8,producer_version:u32,target_triple:bytes32,entry_symbol:bytes64,schema_hash:u64,plan_hash:u64};target(1){triple:str};object_format(2){format:str};entry(3){symbol:str};function(4){item_id:u32,word_offset:u32,word_count:u32,symbol:str,body_kind:str};word_chunk(5){word_offset:u32,word_count:u32,words:u32le[]};reloc(6){source_item_id:u32,word_offset:u32,target_symbol:str};data(7){item_id:u32,symbol:str,align:u32,byte_count:u32,bytes:raw};data_reloc(8){source_item_id:u32,word_offset:u32,reloc_kind:u32,addend:u32,target_symbol:str};call_edge(9){source_item_id:u32,target_symbol:str}";
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
  const payloadText=record(1,stringPayload(triple))+record(2,stringPayload(objectFormat))+record(3,stringPayload("main"))+record(4,fnPayload)+duplicateFunction+record(5,Buffer.concat([u32(0),u32(1),u32(0)]))+duplicateData+danglingReloc+danglingDataReloc+callEdge;
  const header=Buffer.alloc(126);
  header.writeUInt32LE(triple.includes("writer-legacy-schema")?1:2,0);header.writeUInt32LE(1,4);header[8]=8;header[9]=1;header.writeUInt32LE(1,10);
  Buffer.from(triple,"utf8").copy(header,14,0,32);Buffer.from("main","utf8").copy(header,46,0,64);
  header.writeBigUInt64LE(fnv(Buffer.from(triple.includes("writer-legacy-schema")?LEGACY_SCHEMA:SCHEMA,"utf8")),110);header.writeBigUInt64LE(fnv(Buffer.from(payloadText,"utf8")),118);
  return "CHENG_CSG\\n"+record(0,header)+payloadText;
};
const goodReport="source="+input+"\\ncompile_input_source_file_count=1\\nfacts_record_count=7\\nfacts_function_count=1\\nfacts_word_count=1\\nfacts_reloc_count=0\\nfacts_data_count=0\\nfacts_data_reloc_count=0\\n";
const machoObject=(cpu=0x0100000c,fileType=1)=>{const bytes=Buffer.alloc(32);bytes.writeUInt32LE(0xfeedfacf,0);bytes.writeUInt32LE(cpu,4);bytes.writeUInt32LE(fileType,12);return bytes};
const elfObject=(machine=62,type=1)=>{const bytes=Buffer.alloc(64);bytes[0]=0x7f;bytes[1]=0x45;bytes[2]=0x4c;bytes[3]=0x46;bytes[4]=2;bytes[5]=1;bytes[6]=1;bytes.writeUInt16LE(type,16);bytes.writeUInt16LE(machine,18);bytes.writeUInt32LE(1,20);bytes.writeUInt16LE(64,52);return bytes};
const flood=async(byte)=>{
  if(!process.stdout.write(Buffer.alloc(17*1024*1024,byte)))await new Promise((resolve)=>process.stdout.once("drain",resolve));
  await new Promise((resolve)=>setTimeout(resolve,1000));
};
if(command==="emit-cold-csg"){
  if(target.includes("writer-driver-drift")){appendFileSync(process.argv[1],"\\n");process.exit(2)}
  if(target.includes("writer-timeout")){await new Promise((resolve)=>setTimeout(resolve,5000));process.exit(0)}
  if(target.includes("writer-overflow")){await flood(65);process.exit(0)}
  if(target.includes("writer-no-output"))process.exit(0);
  ensure(out);ensure(report);
  if(target.includes("writer-symlink-facts"))symlinkSync("/dev/null",out);
  else if(target.includes("writer-invalid-facts"))writeFileSync(out,"CHENG_CSG\\nnot-a-record\\n");
  else {writeFileSync(out,facts());if(target.includes("writer-oversize-facts"))truncateSync(out,1025*1024*1024)}
  if(target.includes("writer-empty-report"))writeFileSync(report,"");
  else if(target.includes("writer-invalid-utf8-report"))writeFileSync(report,Buffer.from([0xff,0x0a]));
  else if(target.includes("writer-duplicate-report"))writeFileSync(report,goodReport+"facts_word_count=1\\n");
  else if(target.includes("writer-malformed-report"))writeFileSync(report,goodReport+"not-key-value\\n");
  else if(target.includes("writer-missing-count"))writeFileSync(report,goodReport.replace("facts_data_reloc_count=0\\n",""));
  else if(target.includes("writer-noncanonical-count"))writeFileSync(report,goodReport.replace("facts_word_count=1","facts_word_count=01"));
  else if(target.includes("writer-wrong-count"))writeFileSync(report,goodReport.replace("facts_word_count=1","facts_word_count=2"));
  else {writeFileSync(report,goodReport);if(target.includes("writer-oversize-report"))truncateSync(report,9*1024*1024)}
  if(!target.includes("writer-no-output")&&!target.includes("writer-symlink-facts")&&!target.includes("writer-invalid-facts")){
    writeFileSync(out+".linemap",lineMap);
    writeFileSync(out+".producer.trace","driver-private-output\\n");
  }
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
  if(!target.includes("reader-no-output")&&!target.includes("reader-symlink-object")){
    writeFileSync(out+".map",lineMap);
    writeFileSync(out+".link.log","driver-private-output\\n");
  }
  process.exit(0);
}
console.error("unknown command: "+command);
process.exit(2);
`);
  chmodSync(driver, 0o755);
  const driverSha = createHash("sha256").update(readFileSync(driver)).digest("hex");
  const sourceManifestPath = driver + ".source-manifest";
  writeFileSync(sourceManifestPath, `${driverSha}  ${driver}\n`);
  const sourceClosureSha = createHash("sha256").update(readFileSync(sourceManifestPath)).digest("hex");
  const compilerPath = "/usr/bin/cc";
  const compilerVersion = spawnSync(compilerPath, ["--version"]);
  assertTrue(compilerVersion.status === 0, "测试 official driver receipt 可绑定真实 compiler identity");
  const compilerVersionSha = createHash("sha256").update(compilerVersion.stdout).digest("hex");
  const compilerSha = createHash("sha256").update(readFileSync(compilerPath)).digest("hex");
  const bunPath = process.execPath;
  const bunVersion = spawnSync(bunPath, ["--version"]);
  assertTrue(bunVersion.status === 0, "测试 official driver receipt 可绑定真实 Bun identity");
  const bunVersionSha = createHash("sha256").update(bunVersion.stdout).digest("hex");
  const bunSha = createHash("sha256").update(readFileSync(bunPath)).digest("hex");
  const contractSha = createHash("sha256").update(readFileSync(CHENG_CSG_CURRENT_CONTRACT_SOURCE_PATH)).digest("hex");
  writeFileSync(driver + ".receipt", [
    "schema=cheng_fusion_cold_driver_build_receipt",
    "driver_role=official",
    "csg_schema_version=2",
    "csg_abi_version=1",
    "csg_pointer_width=8",
    "csg_endian=1",
    "csg_schema_desc_sha256=49ede7e34ddabd032a6ed56b2082369dd2f460fb6aee5ae27e9d63e8373bc7a4",
    `source_manifest_path=${sourceManifestPath}`,
    `source_closure_sha256=${sourceClosureSha}`,
    `patch_path=${driver}`,
    `patch_sha256=${driverSha}`,
    `build_script_path=${driver}`,
    `build_script_sha256=${driverSha}`,
    `contract_path=${CHENG_CSG_CURRENT_CONTRACT_SOURCE_PATH}`,
    `contract_sha256=${contractSha}`,
    `compiler_path=${compilerPath}`,
    `compiler_sha256=${compilerSha}`,
    `compiler_version_sha256=${compilerVersionSha}`,
    `bun_path=${bunPath}`,
    `bun_sha256=${bunSha}`,
    `bun_version_sha256=${bunVersionSha}`,
    `gen2_sha256=${driverSha}`,
    `gen3_sha256=${driverSha}`,
    "raw_equal=1",
    "different_inode=1",
    `official_sha256=${driverSha}`,
    "",
  ].join("\n"));
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

function roundtripLockOwner(pid: number) {
  return {
    pid,
    transactionId: `${Date.now().toString(36)}-${randomUUID()}`,
    startedAt: new Date().toISOString(),
  };
}

function materializeRoundtripLock(lockDir: string, owner: Record<string, unknown>, extraEntries: Record<string, string> = {}) {
  mkdirSync(lockDir, {mode: 0o700});
  const ownerBytes = Buffer.from(JSON.stringify(owner) + "\n");
  writeFileSync(join(lockDir, "owner.json"), ownerBytes, {mode: 0o600});
  for (const [name, bytes] of Object.entries(extraEntries)) writeFileSync(join(lockDir, name), bytes);
  return ownerBytes;
}

function exitedProcessPid() {
  for (let attempt = 0; attempt < 32; attempt++) {
    const exited = spawnSync(process.execPath, ["-e", "process.exit(0)"]);
    assertTrue(exited.status === 0 && Number.isSafeInteger(exited.pid) && exited.pid! > 0, "构造已退出 owner PID");
    try {
      process.kill(exited.pid!, 0);
    } catch (error: any) {
      if (error?.code === "ESRCH") return exited.pid!;
      throw error;
    }
  }
  throw new Error("could not obtain an exited, non-reused PID for stale-lock test");
}

async function waitForOwnerReplacement(lockDir: string, staleOwnerBytes: Buffer, timeoutMs = 2000) {
  const ownerPath = join(lockDir, "owner.json");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const current = readFileSync(ownerPath);
      if (!current.equals(staleOwnerBytes)) return current;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for a replacement lock owner: ${lockDir}`);
}

function transactionId() {
  return `${Date.now().toString(36)}-${randomUUID()}`;
}

function acquireMustFail(lockDir: string, hooks: Record<string, Function>) {
  let thrown: unknown = null;
  try {
    acquireRoundtripLock(lockDir, transactionId(), hooks);
  } catch (error) {
    thrown = error;
  }
  assertTrue(thrown instanceof Error, `fault-injected lock acquisition 必须抛错: ${lockDir}`);
  return thrown as Error;
}

function testFailedAcquisitionRollback() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "fusion-harness-lock-acquire-")));
  try {
    console.log("[L] lock acquisition 失败只回滚本次同 inode 的空目录或精确 self-owner generation");

    const emptyLock = join(root, "empty.lock");
    acquireMustFail(emptyLock, {
      afterDirectoryCreated() {
        throw new Error("injected after mkdir");
      },
    });
    assertTrue(!existsSync(emptyLock), "mkdir 后、owner 前失败会删除本次同 inode 空目录");

    const ownedLock = join(root, "owned.lock");
    const ownedError = acquireMustFail(ownedLock, {
      afterOwnerCaptured() {
        throw new Error("injected after exact owner capture");
      },
    });
    assertTrue(!existsSync(ownedLock), `owner 写入后失败只删除精确 self-owner generation: ${ownedError.message}`);

    const foreignLock = join(root, "foreign.lock");
    let foreignDirectory: any = null;
    const foreignError = acquireMustFail(foreignLock, {
      afterDirectoryCreated({lockDir}: any) {
        foreignDirectory = lstatSync(lockDir, {bigint: true});
        writeFileSync(join(lockDir, "foreign"), "foreign\n");
        throw new Error("injected with foreign entry");
      },
    });
    const foreignAfter = lstatSync(foreignLock, {bigint: true});
    assertTrue(
      /exact acquisition rollback refused or failed/.test(foreignError.message) &&
        foreignAfter.dev === foreignDirectory.dev &&
        foreignAfter.ino === foreignDirectory.ino &&
        readFileSync(join(foreignLock, "foreign"), "utf8") === "foreign\n",
      "外来目录项存在时拒绝回滚并原 inode 原内容保留",
    );

    const swappedLock = join(root, "swapped.lock");
    const originalLock = join(root, "swapped.original");
    let createdDirectory: any = null;
    const swappedError = acquireMustFail(swappedLock, {
      afterDirectoryCreated({lockDir, directory}: any) {
        createdDirectory = directory;
        renameSync(lockDir, originalLock);
        mkdirSync(lockDir, {mode: 0o700});
        throw new Error("injected after lock inode swap");
      },
    });
    const replacementDirectory = lstatSync(swappedLock, {bigint: true});
    const movedOriginalDirectory = lstatSync(originalLock, {bigint: true});
    assertTrue(
      /no longer names the directory created by this transaction/.test(swappedError.message) &&
        replacementDirectory.ino !== createdDirectory.ino &&
        movedOriginalDirectory.dev === createdDirectory.dev &&
        movedOriginalDirectory.ino === createdDirectory.ino,
      "canonical path 被置换时新目录与原目录都保留，绝不按“空锁”泛化删除",
    );

    const replacedOwnerLock = join(root, "replaced-owner.lock");
    const originalOwner = join(root, "original-owner.json");
    let replacementOwnerBytes: Buffer | null = null;
    const replacedOwnerError = acquireMustFail(replacedOwnerLock, {
      afterOwnerCaptured({ownerPath, ownerRaw}: any) {
        replacementOwnerBytes = Buffer.from(ownerRaw);
        renameSync(ownerPath, originalOwner);
        writeFileSync(ownerPath, ownerRaw, {mode: 0o600});
        throw new Error("injected after owner generation swap");
      },
    });
    assertTrue(
      /owner generation changed/.test(replacedOwnerError.message) &&
        readFileSync(join(replacedOwnerLock, "owner.json")).equals(replacementOwnerBytes!) &&
        readFileSync(originalOwner).equals(replacementOwnerBytes!),
      "owner 字节相同但 inode generation 已换时仍拒绝删除两代 owner",
    );

    const afterRenameLock = join(root, "after-rename.lock");
    let afterRenameDirectory: any = null;
    let afterRenameOwner: any = null;
    let afterRenameOwnerBytes: Buffer | null = null;
    acquireMustFail(afterRenameLock, {
      afterOwnerCaptured({ownerPath, ownerRaw}: any) {
        afterRenameDirectory = lstatSync(afterRenameLock, {bigint: true});
        afterRenameOwner = lstatSync(ownerPath, {bigint: true});
        afterRenameOwnerBytes = Buffer.from(ownerRaw);
        throw new Error("injected acquisition failure before rollback rename");
      },
      afterRollbackDirectoryRenamed({rollbackDir}: any) {
        writeFileSync(join(rollbackDir, "foreign"), "after-rename-foreign\n");
      },
    });
    const afterRenameRestoredDirectory = lstatSync(afterRenameLock, {bigint: true});
    const afterRenameRestoredOwner = lstatSync(join(afterRenameLock, "owner.json"), {bigint: true});
    assertTrue(
      afterRenameRestoredDirectory.dev === afterRenameDirectory.dev &&
        afterRenameRestoredDirectory.ino === afterRenameDirectory.ino &&
        afterRenameRestoredOwner.dev === afterRenameOwner.dev &&
        afterRenameRestoredOwner.ino === afterRenameOwner.ino &&
        readFileSync(join(afterRenameLock, "owner.json")).equals(afterRenameOwnerBytes!) &&
        readFileSync(join(afterRenameLock, "foreign"), "utf8") === "after-rename-foreign\n",
      "rollback rename 后出现外来目录项时，原目录、精确 owner inode 与外来字节全部恢复到 canonical path",
    );

    const afterDetachLock = join(root, "after-detach.lock");
    let afterDetachDirectory: any = null;
    let afterDetachOwner: any = null;
    let afterDetachOwnerBytes: Buffer | null = null;
    acquireMustFail(afterDetachLock, {
      afterOwnerCaptured({ownerPath, ownerRaw}: any) {
        afterDetachDirectory = lstatSync(afterDetachLock, {bigint: true});
        afterDetachOwner = lstatSync(ownerPath, {bigint: true});
        afterDetachOwnerBytes = Buffer.from(ownerRaw);
        throw new Error("injected acquisition failure before owner detach");
      },
      afterOwnerDetached({rollbackDir}: any) {
        writeFileSync(join(rollbackDir, "foreign"), "after-detach-foreign\n");
      },
    });
    const afterDetachRestoredDirectory = lstatSync(afterDetachLock, {bigint: true});
    const afterDetachRestoredOwner = lstatSync(join(afterDetachLock, "owner.json"), {bigint: true});
    assertTrue(
      afterDetachRestoredDirectory.dev === afterDetachDirectory.dev &&
        afterDetachRestoredDirectory.ino === afterDetachDirectory.ino &&
        afterDetachRestoredOwner.dev === afterDetachOwner.dev &&
        afterDetachRestoredOwner.ino === afterDetachOwner.ino &&
        readFileSync(join(afterDetachLock, "owner.json")).equals(afterDetachOwnerBytes!) &&
        readFileSync(join(afterDetachLock, "foreign"), "utf8") === "after-detach-foreign\n",
      "owner detach 后出现外来目录项时，精确 owner inode 原子复位且外来字节不丢失",
    );

    const canonicalReplacementLock = join(root, "canonical-replacement.lock");
    let canonicalRollbackDir = "";
    let canonicalOriginalDirectory: any = null;
    let canonicalOriginalOwner: any = null;
    let canonicalOriginalOwnerBytes: Buffer | null = null;
    const canonicalReplacementError = acquireMustFail(canonicalReplacementLock, {
      afterOwnerCaptured({ownerPath, ownerRaw}: any) {
        canonicalOriginalDirectory = lstatSync(canonicalReplacementLock, {bigint: true});
        canonicalOriginalOwner = lstatSync(ownerPath, {bigint: true});
        canonicalOriginalOwnerBytes = Buffer.from(ownerRaw);
        throw new Error("injected acquisition failure before canonical replacement");
      },
      afterOwnerDetached({lockDir, rollbackDir}: any) {
        canonicalRollbackDir = rollbackDir;
        mkdirSync(lockDir, {mode: 0o700});
        writeFileSync(join(lockDir, "replacement"), "canonical-replacement\n");
      },
    });
    const preservedOriginalDirectory = lstatSync(canonicalRollbackDir, {bigint: true});
    const preservedOriginalOwner = lstatSync(join(canonicalRollbackDir, "owner.json"), {bigint: true});
    assertTrue(
      /exact acquisition rollback restoration failed/.test(canonicalReplacementError.message) &&
        readFileSync(join(canonicalReplacementLock, "replacement"), "utf8") === "canonical-replacement\n" &&
        preservedOriginalDirectory.dev === canonicalOriginalDirectory.dev &&
        preservedOriginalDirectory.ino === canonicalOriginalDirectory.ino &&
        preservedOriginalOwner.dev === canonicalOriginalOwner.dev &&
        preservedOriginalOwner.ino === canonicalOriginalOwner.ino &&
        readFileSync(join(canonicalRollbackDir, "owner.json")).equals(canonicalOriginalOwnerBytes!),
      "owner detach 后 canonical path 被抢占时不覆盖 replacement，原目录与精确 owner inode 留在明确 rollback path",
    );
    rmSync(canonicalReplacementLock, {recursive: true, force: true});
    rmSync(canonicalRollbackDir, {recursive: true, force: true});

    const rmdirFailureLock = join(root, "rmdir-failure.lock");
    let rmdirFailureDirectory: any = null;
    let rmdirFailureOwner: any = null;
    let rmdirFailureOwnerBytes: Buffer | null = null;
    acquireMustFail(rmdirFailureLock, {
      afterOwnerCaptured({ownerPath, ownerRaw}: any) {
        rmdirFailureDirectory = lstatSync(rmdirFailureLock, {bigint: true});
        rmdirFailureOwner = lstatSync(ownerPath, {bigint: true});
        rmdirFailureOwnerBytes = Buffer.from(ownerRaw);
        throw new Error("injected acquisition failure before rmdir");
      },
      beforeRollbackDirectoryRemove() {
        const error: any = new Error("injected rmdir EBUSY");
        error.code = "EBUSY";
        throw error;
      },
    });
    const rmdirRestoredDirectory = lstatSync(rmdirFailureLock, {bigint: true});
    const rmdirRestoredOwner = lstatSync(join(rmdirFailureLock, "owner.json"), {bigint: true});
    assertTrue(
      rmdirRestoredDirectory.dev === rmdirFailureDirectory.dev &&
        rmdirRestoredDirectory.ino === rmdirFailureDirectory.ino &&
        rmdirRestoredOwner.dev === rmdirFailureOwner.dev &&
        rmdirRestoredOwner.ino === rmdirFailureOwner.ino &&
        readFileSync(join(rmdirFailureLock, "owner.json")).equals(rmdirFailureOwnerBytes!),
      "rmdir 失败时原目录与精确 owner inode 均恢复到 canonical path",
    );
    assertTrue(
      !readdirSync(root).some((name) =>
        name.startsWith(".cheng-csg-roundtrip.acquire-rollback-") ||
        name.startsWith(".cheng-csg-roundtrip.acquire-owner-")
      ),
      "成功恢复不遗留 rollback 目录或 detached owner；拒绝恢复时两代外来对象均不丢失",
    );
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
}

async function testReceiptBoundOfficialDriver() {
  const root = createFixtureProject();
  const driver = createTransactionalFakeDriver(root);
  const receiptPath = driver + ".receipt";
  const originalReceipt = readFileSync(receiptPath, "utf8");
  const call = async (env: Record<string, string>, target = "arm64-apple-darwin") => {
    const mcp = startMcp({...env, CHENG_FUSION_TIMEOUT_MS: "500"}, root);
    try {
      await mcp.initialize({rootUri: `file://${root}`, workspaceFolders: [{uri: `file://${root}`, name: "fusion-harness-item3-receipt"}]});
      return await mcp.callTool("cheng_csg_roundtrip", {source: "src/a.cheng", entrySource: "src/a.cheng", outDir: "artifacts/receipt", target}, undefined, 10000);
    } finally {
      mcp.kill();
    }
  };
  try {
    console.log("[R] official driver 必须同时绑定 current receipt/source/tool/driver hash，任何失败不回退 vendor");
    const missingReceipt = await call({CHENG_COLD_DRIVER: driver});
    assertTrue(missingReceipt.isError === true && String(missingReceipt.parsed).includes("requires the exact CHENG_COLD_DRIVER_RECEIPT"), "显式 driver 缺 receipt 立即硬失败");
    const canonicalLines = originalReceipt.trimEnd().split("\n");
    writeFileSync(
      receiptPath,
      `${[
        canonicalLines[1],
        canonicalLines[0],
        ...canonicalLines.slice(2),
      ].join("\n")}\n`,
    );
    const reorderedReceipt = await call({
      CHENG_COLD_DRIVER: driver,
      CHENG_COLD_DRIVER_RECEIPT: receiptPath,
    });
    assertTrue(
      reorderedReceipt.isError === true &&
        String(reorderedReceipt.parsed)
          .includes("fields or field order are not canonical"),
      `receipt 字段换序必须 hard-fail，实得: ${
        String(reorderedReceipt.parsed).slice(0, 240)}`,
    );
    writeFileSync(
      receiptPath,
      originalReceipt.replace(
        /^official_sha256=.+\n$/m,
        "",
      ),
    );
    const missingFieldReceipt = await call({
      CHENG_COLD_DRIVER: driver,
      CHENG_COLD_DRIVER_RECEIPT: receiptPath,
    });
    assertTrue(
      missingFieldReceipt.isError === true &&
        String(missingFieldReceipt.parsed)
          .includes("fields or field order are not canonical"),
      `receipt 缺字段必须 hard-fail，实得: ${
        String(missingFieldReceipt.parsed).slice(0, 240)}`,
    );
    writeFileSync(
      receiptPath,
      originalReceipt.replace(
        /^official_sha256=/m,
        "obsolete_receipt_path=/tmp/obsolete\n" +
          "official_sha256=",
      ),
    );
    const extraFieldReceipt = await call({
      CHENG_COLD_DRIVER: driver,
      CHENG_COLD_DRIVER_RECEIPT: receiptPath,
    });
    assertTrue(
      extraFieldReceipt.isError === true &&
        String(extraFieldReceipt.parsed)
          .includes("fields or field order are not canonical"),
      `receipt 额外版本碎片字段必须 hard-fail，实得: ${
        String(extraFieldReceipt.parsed).slice(0, 240)}`,
    );
    for (const [field, expected] of [
      ["source_closure_sha256", "source closure manifest hash mismatch"],
      ["build_script_sha256", "build script hash mismatch"],
      ["contract_sha256", "current contract hash mismatch"],
      ["compiler_sha256", "compiler hash mismatch"],
      ["bun_sha256", "Bun runtime hash mismatch"],
      ["bun_version_sha256", "Bun version hash mismatch"],
      ["official_sha256", "driver hash/fixed-point mismatch"],
    ]) {
      writeFileSync(receiptPath, originalReceipt.replace(new RegExp(`^${field}=[0-9a-f]{64}$`, "m"), `${field}=${"0".repeat(64)}`));
      const result = await call({CHENG_COLD_DRIVER: driver, CHENG_COLD_DRIVER_RECEIPT: receiptPath});
      assertTrue(result.isError === true && String(result.parsed).includes(expected), `${field} 漂移硬失败且不回退 vendor, 实得: ${String(result.parsed).slice(0, 240)}`);
    }
    writeFileSync(receiptPath, originalReceipt.replace(/^compiler_path=.+$/m, `compiler_path=${process.execPath}`));
    const wrongCompilerPath = await call({CHENG_COLD_DRIVER: driver, CHENG_COLD_DRIVER_RECEIPT: receiptPath});
    assertTrue(wrongCompilerPath.isError === true && String(wrongCompilerPath.parsed).includes("not the canonical production compiler"), `compiler_path 换工具必须 hard-fail, 实得: ${String(wrongCompilerPath.parsed).slice(0, 240)}`);
    writeFileSync(receiptPath, originalReceipt.replace(/^bun_path=.+$/m, "bun_path=/usr/bin/cc"));
    const wrongBunPath = await call({CHENG_COLD_DRIVER: driver, CHENG_COLD_DRIVER_RECEIPT: receiptPath});
    assertTrue(wrongBunPath.isError === true && String(wrongBunPath.parsed).includes("not the running production runtime"), `bun_path 换工具必须 hard-fail, 实得: ${String(wrongBunPath.parsed).slice(0, 240)}`);
    writeFileSync(receiptPath, originalReceipt);
    const driverBytes = readFileSync(driver);
    const runtimeDriverDrift = await call(
      {CHENG_COLD_DRIVER: driver, CHENG_COLD_DRIVER_RECEIPT: receiptPath},
      "arm64-writer-driver-drift-apple-darwin",
    );
    assertTrue(
      runtimeDriverDrift.isError === true &&
        String(runtimeDriverDrift.parsed).includes("driver hash/fixed-point mismatch"),
      `writer 运行中 driver/source 漂移必须盖过进程错误并 hard-fail，实得: ${
        String(runtimeDriverDrift.parsed).slice(0, 240)}`,
    );
    writeFileSync(driver, driverBytes);
    chmodSync(driver, 0o755);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
}

async function testTransactionalRoundtrip() {
  const root = createFixtureProject();
  const driver = createTransactionalFakeDriver(root);
  const outDir = join(root, "artifacts", "csg");
  const canonicalSummary = join(root, "conversion-reports", "cheng-csg", "summary.json");
  const canonicalLock = join(root, "conversion-reports", "cheng-csg", ".cheng-csg-roundtrip.lock");
  const mcp = startMcp({CHENG_COLD_DRIVER: driver, CHENG_COLD_DRIVER_RECEIPT: driver + ".receipt", CHENG_FUSION_TIMEOUT_MS: "500"}, root);
  try {
    await mcp.initialize({rootUri: `file://${root}`, workspaceFolders: [{uri: `file://${root}`, name: "fusion-harness-item3-transaction"}]});
    console.log("[E] 唯一 staging 成功后提交不可变 generation，summary 固定在 canonical 路径");
    const good = await mcp.callTool("cheng_csg_roundtrip", {source: "src/a.cheng", entrySource: "src/a.cheng", outDir: "artifacts/csg", target: "arm64-apple-darwin"}, undefined, 10000);
    assertTrue(good.isError !== true && good.parsed?.success === true, `事务 roundtrip 成功, 实得: ${JSON.stringify(good.parsed).slice(0, 400)}`);
    assertTrue(good.parsed.source === join(root, "src", "a.cheng") && good.parsed.entrySource === join(root, "src", "a.cheng") && good.parsed.summary.totals.sourceFiles === 1, "summary 分别绑定 query source、entrySource 与真实 closure count");
    assertTrue(typeof good.parsed.generationId === "string" && /^sha256:[0-9a-f]{64}$/.test(good.parsed.generationHash), "成功响应返回 generationId 与 generationHash");
    assertTrue(good.parsed.facts.includes("/.cheng-csg-generations/") && good.parsed.currentFacts === join(outDir, "current.facts"), "summary 以不可变 generation 为证据，current.facts 只是非权威投影");
    assertTrue(readFileSync(canonicalSummary, "utf8").includes(`\"generationId\": \"${good.parsed.generationId}\"`), "custom outDir 仍只在 canonical 路径提交 summary");
    const generationDir = join(outDir, ".cheng-csg-generations", good.parsed.generationId);
    const generationSummary = join(generationDir, "summary.json");
    const immutablePaths = [
      good.parsed.summary.facts,
      good.parsed.summary.facts + ".linemap",
      good.parsed.summary.writerReport,
      good.parsed.summary.readerReport,
      good.parsed.summary.objectOut,
      good.parsed.summary.objectOut + ".map",
      generationSummary,
    ];
    const committedPaths = [
      canonicalSummary,
      join(outDir, "current.facts"),
      join(outDir, "current.facts.linemap"),
      join(outDir, "current.writer.report.txt"),
      join(outDir, "current.reader.report.txt"),
      join(outDir, "a.cheng.o"),
      join(outDir, "a.cheng.o.map"),
      ...immutablePaths,
    ];
    for (const path of committedPaths) {
      const stat = lstatSync(path);
      assertTrue(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0, `提交产物是非空 regular file: ${path}`);
    }
    for (const path of immutablePaths) assertTrue((lstatSync(path).mode & 0o222) === 0, `generation 产物默认只读: ${path}`);
    assertTrue(
      JSON.stringify(readdirSync(generationDir).sort()) ===
        JSON.stringify(["a.cheng.o", "a.cheng.o.map", "current.facts", "current.facts.linemap", "current.reader.report.txt", "current.writer.report.txt", "summary.json"].sort()),
      "driver 私有副产物不会进入不可变 generation",
    );
    assertTrue(readFileSync(canonicalSummary).equals(readFileSync(generationSummary)), "canonical summary 逐字节绑定 immutable generation summary");
    assertTrue(!readdirSync(outDir).some((name) => name.startsWith(".cheng-csg-stage-")) && !existsSync(canonicalLock), "成功后清理 staging 与 canonical 锁");

    console.log("[E2] 完全相同产物复用内容地址 generation，不生成重复目录");
    const duplicate = await mcp.callTool("cheng_csg_roundtrip", {source: "src/a.cheng", entrySource: "src/a.cheng", outDir: "artifacts/csg", target: "arm64-apple-darwin"}, undefined, 10000);
    assertTrue(duplicate.isError !== true && duplicate.parsed?.reusedGeneration === true && duplicate.parsed?.generationId === good.parsed.generationId, `相同产物复用同一 generation, 实得: ${JSON.stringify(duplicate.parsed).slice(0, 300)}`);

    console.log("[E3] 删除提交后同一内容地址重建逐字节相同，不含生成时间");
    const deterministicSummaryBytes = readFileSync(generationSummary);
    rmSync(canonicalSummary, {force: true});
    for (const path of immutablePaths) chmodSync(path, 0o644);
    rmSync(generationDir, {recursive: true, force: true});
    const recreated = await mcp.callTool("cheng_csg_roundtrip", {source: "src/a.cheng", entrySource: "src/a.cheng", outDir: "artifacts/csg", target: "arm64-apple-darwin"}, undefined, 10000);
    assertTrue(
      recreated.isError !== true &&
        recreated.parsed?.reusedGeneration === false &&
        recreated.parsed?.generationId === good.parsed.generationId,
      `同内容删除后重建相同 generation id, 实得: ${JSON.stringify(recreated.parsed).slice(0, 300)}`,
    );
    assertTrue(
      readFileSync(generationSummary).equals(deterministicSummaryBytes) &&
        readFileSync(canonicalSummary).equals(deterministicSummaryBytes),
      "同一内容地址 generation summary 删除重建后逐字节相同",
    );

    const committed = snapshotFiles(committedPaths.slice(0, 7));
    const generationCount = readdirSync(join(outDir, ".cheng-csg-generations")).length;
    const failures = [
      ["writer-no-output", "not materialized"],
      ["writer-symlink-facts", "non-symlink"],
      ["writer-invalid-facts", "invalid CHENG_CSG"],
      ["writer-legacy-schema", "header schema/ABI/pointer-width/endian mismatch"],
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
      const failed = await mcp.callTool("cheng_csg_roundtrip", {source: "src/a.cheng", entrySource: "src/a.cheng", outDir: "artifacts/csg", target: targetTriple}, undefined, 10000);
      assertTrue(failed.isError === true && String(failed.parsed).includes(expected), `${target} 明确失败且指出 ${expected}, 实得: ${String(failed.parsed).slice(0, 300)}`);
      assertSnapshotUnchanged(committed, target);
      assertTrue(readdirSync(join(outDir, ".cheng-csg-generations")).length === generationCount, `${target}: 未提交失败 generation`);
      assertTrue(!readdirSync(outDir).some((name) => name.startsWith(".cheng-csg-stage-")) && !existsSync(canonicalLock), `${target}: 清理 staging 与 canonical 锁`);
    }

    console.log("[G] canonical 锁覆盖不同 outDir，且绝不删除不属于本事务的锁路径");
    const mcp2 = startMcp({CHENG_COLD_DRIVER: driver, CHENG_COLD_DRIVER_RECEIPT: driver + ".receipt", CHENG_FUSION_TIMEOUT_MS: "500"}, root);
    try {
      await mcp2.initialize({rootUri: `file://${root}`, workspaceFolders: [{uri: `file://${root}`, name: "fusion-harness-item3-lock-peer"}]});
      const holding = mcp.callTool("cheng_csg_roundtrip", {source: "src/a.cheng", entrySource: "src/a.cheng", outDir: "artifacts/csg", target: "arm64-writer-timeout-apple-darwin"}, undefined, 10000);
      await waitForPath(canonicalLock);
      const blocked = await mcp2.callTool("cheng_csg_roundtrip", {source: "src/a.cheng", entrySource: "src/a.cheng", outDir: "artifacts/csg-other", target: "arm64-apple-darwin"}, undefined, 10000);
      assertTrue(blocked.isError === true && String(blocked.parsed).includes("another cheng_csg_roundtrip transaction owns"), "不同 outDir 仍被同一 canonical 提交锁互斥");
      assertTrue(lstatSync(canonicalLock).isDirectory(), "竞争失败方没有删除持有方的锁目录");
      const holdingResult = await holding;
      assertTrue(holdingResult.isError === true && String(holdingResult.parsed).includes("timeout=true"), "持锁事务按 timeout 明确失败");
      assertTrue(!existsSync(canonicalLock), "持锁事务退出后只清理自己创建的锁");

      console.log("[G2] dead owner 先被精确 claim/recover；竞争者不能窃取恢复后产生的新 owner");
      const staleOwnerBytes = materializeRoundtripLock(canonicalLock, roundtripLockOwner(exitedProcessPid()));
      const recoveredHolding = mcp.callTool("cheng_csg_roundtrip", {source: "src/a.cheng", entrySource: "src/a.cheng", outDir: "artifacts/csg", target: "arm64-writer-timeout-apple-darwin"}, undefined, 10000);
      const replacementOwnerBytes = await waitForOwnerReplacement(canonicalLock, staleOwnerBytes);
      const replacementOwner = JSON.parse(replacementOwnerBytes.toString("utf8"));
      assertTrue(replacementOwner.pid !== JSON.parse(staleOwnerBytes.toString("utf8")).pid, "stale owner 被新事务 owner 精确替换");
      const recoveryContender = await mcp2.callTool("cheng_csg_roundtrip", {source: "src/a.cheng", entrySource: "src/a.cheng", outDir: "artifacts/csg-other", target: "arm64-apple-darwin"}, undefined, 10000);
      assertTrue(
        recoveryContender.isError === true &&
          String(recoveryContender.parsed).includes("live or has been reused") &&
          readFileSync(join(canonicalLock, "owner.json")).equals(replacementOwnerBytes),
        "stale recovery 后的新 live owner 原样保留",
      );
      const recoveredHoldingResult = await recoveredHolding;
      assertTrue(recoveredHoldingResult.isError === true && String(recoveredHoldingResult.parsed).includes("timeout=true"), "恢复 stale lock 的事务继续执行并按自身结果退出");
      assertTrue(!existsSync(canonicalLock), "恢复后的事务只释放自己的 lock generation");
    } finally {
      mcp2.kill();
    }

    console.log("[G3] 复用/live PID、非法 owner schema 与未知目录项全部 hard-fail 且原样保留");
    const reusedPidOwnerBytes = materializeRoundtripLock(canonicalLock, roundtripLockOwner(process.pid));
    const reusedPid = await mcp.callTool("cheng_csg_roundtrip", {source: "src/a.cheng", entrySource: "src/a.cheng", outDir: "artifacts/csg-other", target: "arm64-apple-darwin"}, undefined, 10000);
    assertTrue(
      reusedPid.isError === true &&
        String(reusedPid.parsed).includes("live or has been reused") &&
        readFileSync(join(canonicalLock, "owner.json")).equals(reusedPidOwnerBytes),
      "owner PID 已复用或仍 live 时绝不恢复",
    );
    rmSync(canonicalLock, {recursive: true, force: true});
    const invalidPidOwner = {...roundtripLockOwner(exitedProcessPid()), pid: 0};
    const invalidPidOwnerBytes = materializeRoundtripLock(canonicalLock, invalidPidOwner);
    const invalidPid = await mcp.callTool("cheng_csg_roundtrip", {source: "src/a.cheng", entrySource: "src/a.cheng", outDir: "artifacts/csg-other", target: "arm64-apple-darwin"}, undefined, 10000);
    assertTrue(
      invalidPid.isError === true &&
        String(invalidPid.parsed).includes("owner pid is invalid") &&
        readFileSync(join(canonicalLock, "owner.json")).equals(invalidPidOwnerBytes),
      "非法 owner PID 在存活探测前 hard-fail 且原样保留",
    );
    rmSync(canonicalLock, {recursive: true, force: true});
    const malformedOwner = {...roundtripLockOwner(exitedProcessPid()), unexpected: true};
    const malformedOwnerBytes = materializeRoundtripLock(canonicalLock, malformedOwner);
    const malformed = await mcp.callTool("cheng_csg_roundtrip", {source: "src/a.cheng", entrySource: "src/a.cheng", outDir: "artifacts/csg-other", target: "arm64-apple-darwin"}, undefined, 10000);
    assertTrue(
      malformed.isError === true &&
        String(malformed.parsed).includes("owner schema is invalid") &&
        readFileSync(join(canonicalLock, "owner.json")).equals(malformedOwnerBytes),
      "非法 owner schema 原样保留",
    );
    rmSync(canonicalLock, {recursive: true, force: true});
    const foreignEntryOwnerBytes = materializeRoundtripLock(canonicalLock, roundtripLockOwner(exitedProcessPid()), {"foreign": "foreign\n"});
    const foreignEntry = await mcp.callTool("cheng_csg_roundtrip", {source: "src/a.cheng", entrySource: "src/a.cheng", outDir: "artifacts/csg-other", target: "arm64-apple-darwin"}, undefined, 10000);
    assertTrue(
      foreignEntry.isError === true &&
        String(foreignEntry.parsed).includes("unexpected entries") &&
        readFileSync(join(canonicalLock, "owner.json")).equals(foreignEntryOwnerBytes) &&
        readFileSync(join(canonicalLock, "foreign"), "utf8") === "foreign\n",
      "带未知目录项的 stale lock 不得递归删除",
    );
    rmSync(canonicalLock, {recursive: true, force: true});

    writeFileSync(canonicalLock, "foreign-lock-file\n");
    const foreignFile = await mcp.callTool("cheng_csg_roundtrip", {source: "src/a.cheng", entrySource: "src/a.cheng", outDir: "artifacts/csg-other", target: "arm64-apple-darwin"}, undefined, 10000);
    assertTrue(foreignFile.isError === true && lstatSync(canonicalLock).isFile() && readFileSync(canonicalLock, "utf8") === "foreign-lock-file\n", "预存普通文件锁硬失败且原样保留");
    rmSync(canonicalLock, {force: true});
    symlinkSync("/dev/null", canonicalLock);
    const foreignSymlink = await mcp.callTool("cheng_csg_roundtrip", {source: "src/a.cheng", entrySource: "src/a.cheng", outDir: "artifacts/csg-other", target: "arm64-apple-darwin"}, undefined, 10000);
    assertTrue(foreignSymlink.isError === true && lstatSync(canonicalLock).isSymbolicLink(), "预存 symlink 锁硬失败且不删除 symlink");
    rmSync(canonicalLock, {force: true});

    console.log("[H] 消费链按 bytes 重算 facts SHA，缓存也不能掩盖 generation 漂移");
    const canonicalCurrent = join(root, "conversion-reports", "cheng-csg", "current.facts");
    const committedSummaryBytes = readFileSync(canonicalSummary);
    writeFileSync(canonicalCurrent, readFileSync(join(outDir, "current.facts")));
    rmSync(canonicalSummary, {force: true});
    const uncommitted = await mcp.callTool("cheng_csg_query", {kind: "symbol", name: "none", file: "src/a.cheng", entrySource: "src/a.cheng"}, undefined, 10000);
    assertTrue(uncommitted.isError === true && String(uncommitted.parsed).includes("uncommitted Cheng CSG facts"), "缺 canonical summary 时绝不把 current.facts 当已提交证据");
    writeFileSync(canonicalSummary, committedSummaryBytes);
    rmSync(canonicalCurrent, {force: true});
    const warm = await mcp.callTool("cheng_csg_query", {kind: "symbol", name: "none", file: "src/a.cheng", entrySource: "src/a.cheng"}, undefined, 10000);
    assertTrue(warm.isError !== true, "先读取 generation facts 建立缓存");
    console.log("[H1] 查询端拒绝伪造 canonical summary，不能把可替换指针当证据");
    const assertCanonicalSummaryRejected = async (label: string, summary: any, expected: string, viaRoundtrip = false) => {
      writeFileSync(canonicalSummary, JSON.stringify(summary, null, 2) + "\n");
      const result = viaRoundtrip
        ? await mcp.callTool("cheng_csg_roundtrip", {source: "src/a.cheng", entrySource: "src/a.cheng", outDir: "artifacts/csg", target: "arm64-apple-darwin"}, undefined, 10000)
        : await mcp.callTool("cheng_csg_query", {kind: "symbol", name: "none", file: "src/a.cheng", entrySource: "src/a.cheng"}, undefined, 10000);
      assertTrue(result.isError === true && String(result.parsed).includes(expected), `${label} 必须 hard-fail ${expected}, 实得: ${String(result.parsed).slice(0, 300)}`);
      writeFileSync(canonicalSummary, committedSummaryBytes);
    };
    const currentSummary = JSON.parse(committedSummaryBytes.toString("utf8"));
    const missingContract = {...currentSummary};
    delete missingContract.generationContractSha256;
    await assertCanonicalSummaryRejected("旧 summary 合同", missingContract, "fields or field order are not canonical", true);
    const changedContract = {...currentSummary, generationContractSha256: `sha256:${"0".repeat(64)}`};
    await assertCanonicalSummaryRejected("generation contract mutation", changedContract, "untrusted schema, producer, or commit protocol");
    const changedToolHash = JSON.parse(committedSummaryBytes.toString("utf8"));
    changedToolHash.toolIdentity.producerSha256 = `sha256:${"0".repeat(64)}`;
    await assertCanonicalSummaryRejected("producer tool hash mutation", changedToolHash, "toolIdentity producerSha256 is stale");
    const changedToolPath = JSON.parse(committedSummaryBytes.toString("utf8"));
    changedToolPath.toolIdentity.consumerPath = join(root, "forged-toolkit.ts");
    await assertCanonicalSummaryRejected("consumer tool path mutation", changedToolPath, "consumerPath is not the unique current source");
    const reorderedToolIdentity = JSON.parse(committedSummaryBytes.toString("utf8"));
    reorderedToolIdentity.toolIdentity = Object.fromEntries(Object.entries(reorderedToolIdentity.toolIdentity).reverse());
    await assertCanonicalSummaryRejected("tool identity 换序", reorderedToolIdentity, "toolIdentity");
    const fourArtifactSummary = JSON.parse(committedSummaryBytes.toString("utf8"));
    delete fourArtifactSummary.artifactHashes.factsLinemap;
    delete fourArtifactSummary.artifactHashes.objectMap;
    await assertCanonicalSummaryRejected("四 artifact 旧 summary", fourArtifactSummary, "artifact hashes");
    const extraArtifactSummary = JSON.parse(committedSummaryBytes.toString("utf8"));
    extraArtifactSummary.artifactHashes.unexpected = `sha256:${"0".repeat(64)}`;
    await assertCanonicalSummaryRejected("多余 artifact hash", extraArtifactSummary, "artifact hashes");
    const reorderedArtifactSummary = JSON.parse(committedSummaryBytes.toString("utf8"));
    reorderedArtifactSummary.artifactHashes = Object.fromEntries(Object.entries(reorderedArtifactSummary.artifactHashes).reverse());
    await assertCanonicalSummaryRejected("artifact hash 换序", reorderedArtifactSummary, "artifact hashes");
    const reorderedTopLevelSummary = Object.fromEntries(Object.entries(currentSummary).reverse());
    await assertCanonicalSummaryRejected("summary 顶层换序", reorderedTopLevelSummary, "fields or field order are not canonical");
    const obsoleteTimestampSummary = JSON.parse(committedSummaryBytes.toString("utf8"));
    obsoleteTimestampSummary.generatedAt = new Date().toISOString();
    await assertCanonicalSummaryRejected(
      "非内容地址时间戳旧字段",
      obsoleteTimestampSummary,
      "fields or field order are not canonical",
    );
    const forgedSummary = JSON.parse(committedSummaryBytes.toString("utf8"));
    forgedSummary.producer = "forged/csg-producer";
    writeFileSync(canonicalSummary, JSON.stringify(forgedSummary, null, 2) + "\n");
    const forgedSummaryResult = await mcp.callTool("cheng_csg_query", {kind: "symbol", name: "none", file: "src/a.cheng", entrySource: "src/a.cheng"}, undefined, 10000);
    assertTrue(forgedSummaryResult.isError === true && String(forgedSummaryResult.parsed).includes("untrusted schema, producer, or commit protocol"), "伪造 canonical summary 的 producer 必须硬失败");
    writeFileSync(canonicalSummary, committedSummaryBytes);
    const factsLineMap = good.parsed.summary.facts + ".linemap";
    const factsLineMapBytes = readFileSync(factsLineMap);
    chmodSync(factsLineMap, 0o644);
    writeFileSync(factsLineMap, Buffer.concat([factsLineMapBytes, Buffer.from("mutation\n")]));
    const mapDrift = await mcp.callTool("cheng_csg_query", {kind: "symbol", name: "none", file: "src/a.cheng", entrySource: "src/a.cheng"}, undefined, 10000);
    assertTrue(mapDrift.isError === true && String(mapDrift.parsed).includes("factsLinemap hash mismatch"), "line-map 内容篡改必须 hard-fail");
    writeFileSync(factsLineMap, factsLineMapBytes);
    const writableMap = await mcp.callTool("cheng_csg_query", {kind: "symbol", name: "none", file: "src/a.cheng", entrySource: "src/a.cheng"}, undefined, 10000);
    assertTrue(writableMap.isError === true && String(writableMap.parsed).includes("changed during verification"), "line-map 可写权限必须 hard-fail");
    chmodSync(factsLineMap, 0o444);
    const generationFacts = good.parsed.summary.facts;
    const originalGeneration = readFileSync(generationFacts, "utf8");
    const mutatedGeneration = originalGeneration.replace(/([0-9a-f])\n$/, (match, hex) => `${hex === "0" ? "1" : "0"}\n`);
    assertTrue(mutatedGeneration.length === originalGeneration.length && mutatedGeneration !== originalGeneration, "构造同长度且仍符合记录语法的 facts 漂移");
    chmodSync(generationFacts, 0o644);
    writeFileSync(generationFacts, mutatedGeneration);
    const drift = await mcp.callTool("cheng_csg_query", {kind: "symbol", name: "none", file: "src/a.cheng", entrySource: "src/a.cheng"}, undefined, 10000);
    assertTrue(drift.isError === true && String(drift.parsed).includes("facts hash mismatch"), "同长度 generation 漂移绕不过 content-hash cache key");
    assertTrue(readFileSync(join(outDir, "current.facts"), "utf8") === originalGeneration, "current.facts 与 generation 非硬链接，非权威投影未被反向篡改");

    console.log("[I] 工具只 GC 自证归属且非当前引用的旧内容地址 generation，保留数有硬上限");
    writeFileSync(generationFacts, originalGeneration);
    chmodSync(generationFacts, 0o444);
    const elf = await mcp.callTool("cheng_csg_roundtrip", {source: "src/a.cheng", entrySource: "src/a.cheng", outDir: "artifacts/csg", target: "x86_64-unknown-linux-gnu"}, undefined, 10000);
    assertTrue(elf.isError !== true, "ELF64 ET_REL x86_64 与 target 严格匹配后可提交");
    for (let index = 0; index < 6; index++) {
      const variant = await mcp.callTool("cheng_csg_roundtrip", {source: "src/a.cheng", entrySource: "src/a.cheng", outDir: "artifacts/csg", target: `arm64-variant${index}-apple-darwin`}, undefined, 10000);
      assertTrue(variant.isError !== true, `第 ${index} 个不同内容 generation 成功`);
    }
    const contentAddressed = readdirSync(join(outDir, ".cheng-csg-generations")).filter((name) => /^sha256-[0-9a-f]{64}$/.test(name));
    assertTrue(contentAddressed.length <= 4, `内容地址 generation 有限保留, 实得 ${contentAddressed.length}`);
    const latestSummary = JSON.parse(readFileSync(canonicalSummary, "utf8"));
    assertTrue(contentAddressed.includes(latestSummary.generationId), "GC 永不删除 canonical summary 当前引用");
    const targetBound = await mcp.callTool("cheng_csg_roundtrip", {source: "src/b.cheng", entrySource: "src/a.cheng", outDir: "artifacts/csg", target: "arm64-apple-darwin"}, undefined, 10000);
    assertTrue(targetBound.isError !== true && targetBound.parsed.summary.source === join(root, "src", "b.cheng") && targetBound.parsed.summary.entrySource === join(root, "src", "a.cheng"), "MCP 用真实 entrySource 闭包提交独立 query source");
    const targetQuery = await mcp.callTool("cheng_csg_query", {kind: "symbol", name: "none", file: "src/b.cheng", entrySource: "src/a.cheng"}, undefined, 10000);
    assertTrue(targetQuery.isError !== true && !targetQuery.parsed.staleWarning && targetQuery.parsed.factsSource === "src/b.cheng" && targetQuery.parsed.factsEntrySource === "src/a.cheng", "查询按 target source 命中，同时公开真实 package entry");
  } finally {
    mcp.kill();
    rmSync(root, {recursive: true, force: true});
  }
}

async function main() {
  testFailedAcquisitionRollback();
  await testReceiptBoundOfficialDriver();
  await testTransactionalRoundtrip();
  console.log("[T] current-only transactional contract: PASS");
  if (process.argv.includes("--transaction-only")) return;
  const root = createFixtureProject();
  const mcp = startMcp({}, root);
  try {
    await mcp.initialize({rootUri: `file://${root}`, workspaceFolders: [{uri: `file://${root}`, name: "fusion-harness-item3"}]});

    console.log("[setup] roundtrip a.cheng 生成 facts");
    const roundtrip = await mcp.callTool("cheng_csg_roundtrip", {source: "src/a.cheng", entrySource: "src/a.cheng"});
    assertTrue(roundtrip.isError !== true && roundtrip.parsed?.writerExitCode === 0 && roundtrip.parsed?.readerExitCode === 0, `roundtrip a.cheng 成功, 实得: ${JSON.stringify(roundtrip.parsed).slice(0, 300)}`);
    assertTrue(roundtrip.parsed?.summary?.totals?.callEdges > 0, `vendor cold driver 必须为同对象调用生成 kind=9 call_edge, 实得: ${JSON.stringify(roundtrip.parsed?.summary?.totals)}`);

    console.log("[A] 查询 a.cheng 自己的符号(应精确命中 source/entry)");
    const freshQuery = await mcp.callTool("cheng_csg_query", {kind: "symbol", name: "FactsSourceIsA", file: "src/a.cheng", entrySource: "src/a.cheng"});
    assertTrue(freshQuery.isError !== true, `查询未报错, 实得: ${JSON.stringify(freshQuery.parsed).slice(0, 200)}`);
    assertTrue(!("factsGeneratedAt" in freshQuery.parsed), "查询响应不再暴露未绑定内容地址的生成时间");
    assertTrue(freshQuery.parsed.factsSource === "src/a.cheng", `响应带 factsSource=src/a.cheng, 实得: ${freshQuery.parsed.factsSource}`);
    assertTrue(freshQuery.parsed.factsEntrySource === "src/a.cheng", `响应带 factsEntrySource=src/a.cheng, 实得: ${freshQuery.parsed.factsEntrySource}`);
    assertTrue(!freshQuery.parsed.staleWarning, `精确查询不带 staleWarning, 实得: ${freshQuery.parsed.staleWarning}`);

    console.log("[B] 查询 b.cheng 的符号(facts 其实来自 a.cheng, 必须硬失败)");
    const staleQuery = await mcp.callTool("cheng_csg_query", {kind: "symbol", name: "FactsQueryTargetIsB", file: "src/b.cheng", entrySource: "src/a.cheng"});
    assertTrue(staleQuery.isError === true && String(staleQuery.parsed).includes("refusing stale Cheng CSG facts") && String(staleQuery.parsed).includes("src/a.cheng") && String(staleQuery.parsed).includes("src/b.cheng"), `陈旧 source facts 必须明确拒绝且不能返回假 matches, 实得: ${String(staleQuery.parsed).slice(0, 400)}`);

    console.log("[C] cheng_evidence 同样带 staleWarning");
    const evidenceStale = await mcp.callTool("cheng_evidence", {file: "src/b.cheng"});
    assertTrue(evidenceStale.isError !== true, `cheng_evidence 未报错, 实得: ${JSON.stringify(evidenceStale.parsed).slice(0, 200)}`);
    assertTrue(!!evidenceStale.parsed.staleWarning, `cheng_evidence 查询 b.cheng 时出现 staleWarning, 实得: ${evidenceStale.parsed.staleWarning}`);
    assertTrue(evidenceStale.parsed.factsSource === "src/a.cheng", `cheng_evidence 响应带真实 factsSource=src/a.cheng, 实得: ${evidenceStale.parsed.factsSource}`);

    console.log("[D] cheng_evidence 查 a.cheng 自己(应无 staleWarning)");
    const evidenceFresh = await mcp.callTool("cheng_evidence", {file: "src/a.cheng"});
    assertTrue(!evidenceFresh.parsed.staleWarning, `cheng_evidence 查询 a.cheng 时不带 staleWarning, 实得: ${evidenceFresh.parsed.staleWarning}`);

    console.log("[E] 真实 MCP 用 a.cheng 入口闭包绑定 b.cheng 查询目标");
    const retargeted = await mcp.callTool("cheng_csg_roundtrip", {source: "src/b.cheng", entrySource: "src/a.cheng"});
    assertTrue(retargeted.isError !== true && retargeted.parsed?.summary?.source === join(root, "src", "b.cheng") && retargeted.parsed?.summary?.entrySource === join(root, "src", "a.cheng"), "真实 MCP 分离 query source 与 package entrySource");
    const missingEntryQuery = await mcp.callTool("cheng_csg_query", {kind: "symbol", name: "FactsSourceIsA", file: "src/b.cheng"});
    assertTrue(missingEntryQuery.isError === true && String(missingEntryQuery.parsed).includes("requires the exact package entrySource"), "带 source/file 的查询缺 entrySource 必须在读取 facts 前拒绝");
    const wrongEntryQuery = await mcp.callTool("cheng_csg_query", {kind: "symbol", name: "FactsSourceIsA", file: "src/b.cheng", entrySource: "src/b.cheng"});
    assertTrue(wrongEntryQuery.isError === true && String(wrongEntryQuery.parsed).includes("entry source mismatch") && String(wrongEntryQuery.parsed).includes("src/a.cheng") && String(wrongEntryQuery.parsed).includes("src/b.cheng"), "source 匹配但 entry 错误时必须硬失败，不能复用 fixture facts");
    const retargetedQuery = await mcp.callTool("cheng_csg_query", {kind: "symbol", name: "FactsSourceIsA", file: "src/b.cheng", entrySource: "src/a.cheng"});
    assertTrue(retargetedQuery.isError !== true && !retargetedQuery.parsed.staleWarning && retargetedQuery.parsed.factsSource === "src/b.cheng" && retargetedQuery.parsed.factsEntrySource === "src/a.cheng", "query 仍按 source 命中并公开 entrySource");
  } finally {
    mcp.kill();
    rmSync(root, {recursive: true, force: true});
  }
  console.log("item3 stale facts: PASS");
}

main().catch((error) => {
  console.error("item3 stale facts: FAIL", error);
  process.exit(1);
});
