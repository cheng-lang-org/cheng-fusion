// @ts-nocheck
import {chmodSync,closeSync,constants as fsConstants,copyFileSync,existsSync,fstatSync,fsyncSync,linkSync,lstatSync,mkdirSync,mkdtempSync,openSync,readSync,readdirSync,realpathSync,renameSync,rmdirSync,rmSync,unlinkSync,writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {basename,dirname,join,relative,resolve} from "node:path";
import {createHash,randomUUID} from "node:crypto";
import {dlopen,FFIType,ptr} from "bun:ffi";
import {b as defineModuleInitializer} from "./runtime.ts";
import {CHENG_FUSION_VENDOR_COLD_DRIVER,chengColdCsgDir,chengColdSummaryPath,chengDriverSpawnEnv,createChengTextTool,csgProjectRoot,jsonResult,parseLineMapReport,resolveProjectPath,assertInsideProject,runChengDriver,takeTrailingText,initChengToolkitModule,zodSchema} from "./cheng_toolkit_m9000.ts";
import {
  CHENG_CSG_ARTIFACT_HASH_KEY_ORDER as ROUNDTRIP_ARTIFACT_HASH_KEYS,
  CHENG_CSG_COMMIT_PROTOCOL as ROUNDTRIP_COMMIT_PROTOCOL,
  CHENG_CSG_CURRENT_KEY_ORDER as ROUNDTRIP_CURRENT_KEYS,
  CHENG_CSG_CURRENT_CONTRACT_SOURCE_PATH,
  CHENG_CSG_DRIVER_IDENTITY_KEY_ORDER as COLD_DRIVER_IDENTITY_KEYS,
  CHENG_CSG_GENERATION_CONTRACT_SHA256 as ROUNDTRIP_GENERATION_CONTRACT_SHA256,
  CHENG_CSG_SCHEMA_DESC as COLD_CSG_SCHEMA_DESC,
  CHENG_CSG_SCHEMA_DESC_SHA256_HEX as COLD_CSG_SCHEMA_DESC_SHA256,
  CHENG_CSG_SUMMARY_KEY_ORDER as ROUNDTRIP_SUMMARY_KEYS,
  CHENG_CSG_SUMMARY_PRODUCER as ROUNDTRIP_PRODUCER,
  CHENG_CSG_SUMMARY_SCHEMA as ROUNDTRIP_SUMMARY_SCHEMA,
  CHENG_CSG_TOTAL_KEY_ORDER as ROUNDTRIP_TOTAL_KEYS,
  CHENG_CSG_TOOL_IDENTITY_KEY_ORDER as CSG_TOOL_IDENTITY_KEYS,
  CHENG_CSG_ROUNDTRIP_SOURCE_PATH,
  CHENG_CSG_TOOLKIT_SOURCE_PATH,
  chengCsgCanonicalArtifactHashes as canonicalArtifactHashes,
  chengCsgGenerationHash,
  chengCsgGenerationObjectName as generationObjectName,
  chengCsgOrderedRecord as orderedRecord,
} from "./cheng_csg_current_contract.ts";

var chengCsgRoundtripInputSchema,ChengCsgRoundtripTool;

function commandOutput(result){
  return `${result.stdout||""}\n${result.stderr||""}`;
}

const ROUNDTRIP_MAX_OUTPUT_BYTES=16*1024*1024;
const ROUNDTRIP_MAX_FACTS_BYTES=1024*1024*1024;
/* Full-compiler-closure emits legitimately take minutes (measured ~95-160s at
   331MB facts) and the reader phase re-decodes the same facts; the generic
   120s driver default would SIGKILL an honest run mid-write. Bound each phase
   explicitly instead of inflating the shared default. */
const ROUNDTRIP_WRITER_TIMEOUT_MS=600000;
const ROUNDTRIP_READER_TIMEOUT_MS=600000;
const ROUNDTRIP_MAX_REPORT_BYTES=8*1024*1024;
const ROUNDTRIP_MAX_OBJECT_BYTES=512*1024*1024;
const ROUNDTRIP_MAX_SUMMARY_BYTES=1024*1024;
const ROUNDTRIP_MAX_LOCK_RECORD_BYTES=4096;
const ROUNDTRIP_GENERATIONS_TO_KEEP=4;
const ROUNDTRIP_GENERATION_PREFIX="sha256-";
const ROUNDTRIP_LOCK_OWNER_KEYS=["pid","transactionId","startedAt"];
const ROUNDTRIP_LOCK_RECOVERY_KEYS=["pid","claimId","ownerSha256"];
const COLD_CSG_FNV64_BASIS=1469598103934665603n;
const COLD_CSG_FNV64_PRIME=1099511628211n;
const COLD_DRIVER_RECEIPT_KEYS=[
  "schema",
  "driver_role",
  "csg_schema_version",
  "csg_abi_version",
  "csg_pointer_width",
  "csg_endian",
  "csg_schema_desc_sha256",
  "source_manifest_path",
  "source_closure_sha256",
  "patch_path",
  "patch_sha256",
  "build_script_path",
  "build_script_sha256",
  "contract_path",
  "contract_sha256",
  "compiler_path",
  "compiler_sha256",
  "compiler_version_sha256",
  "bun_path",
  "bun_sha256",
  "bun_version_sha256",
  "gen2_sha256",
  "gen3_sha256",
  "raw_equal",
  "different_inode",
  "official_sha256",
];
const ROUNDTRIP_LOADED_TOOL_IDENTITY=resolveCurrentToolIdentity();

function processOk(result){
  return Boolean(result)&&result.missingDriver!==true&&result.timedOut!==true&&result.overflow!==true&&Number.isInteger(result.exitCode)&&result.exitCode===0;
}

function sameFileGeneration(left,right){
  return left.dev===right.dev&&left.ino===right.ino&&left.size===right.size&&left.mtimeNs===right.mtimeNs&&left.ctimeNs===right.ctimeNs;
}

function sha256Digest(buffer){
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

function readStableRegularArtifact(path,label,maxBytes){
  if(!Number.isSafeInteger(maxBytes)||maxBytes<=0)throw new Error(`invalid ${label} size limit: ${maxBytes}`);
  let pathBefore;
  try{pathBefore=lstatSync(path,{bigint:true})}catch(error){
    throw new Error(`${label} was not materialized by this generation: ${path} (${error instanceof Error?error.message:String(error)})`);
  }
  if(pathBefore.isSymbolicLink()||!pathBefore.isFile())throw new Error(`${label} must be a regular non-symlink file: ${path}`);
  if(pathBefore.size<=0n)throw new Error(`${label} must be non-empty: ${path}`);
  if(pathBefore.size>BigInt(maxBytes))throw new Error(`${label} exceeds ${maxBytes} byte limit: ${path} (${pathBefore.size} bytes)`);
  if(!Number.isInteger(fsConstants.O_NOFOLLOW))throw new Error("O_NOFOLLOW is required for CSG artifact verification");
  let fd;
  try{fd=openSync(path,fsConstants.O_RDONLY|fsConstants.O_NOFOLLOW)}catch(error){
    throw new Error(`${label} could not be opened without following links: ${path} (${error instanceof Error?error.message:String(error)})`);
  }
  try{
    const descriptorBefore=fstatSync(fd,{bigint:true});
    if(!descriptorBefore.isFile()||!sameFileGeneration(pathBefore,descriptorBefore))throw new Error(`${label} changed between path validation and open: ${path}`);
    const expectedSize=Number(descriptorBefore.size);
    const chunks=[];
    const hash=createHash("sha256");
    let offset=0;
    while(offset<expectedSize){
      const chunk=Buffer.allocUnsafe(Math.min(1024*1024,expectedSize-offset));
      const bytesRead=readSync(fd,chunk,0,chunk.length,offset);
      if(bytesRead<=0)throw new Error(`${label} became truncated while reading: ${path}`);
      const bytes=bytesRead===chunk.length?chunk:chunk.subarray(0,bytesRead);
      chunks.push(bytes);
      hash.update(bytes);
      offset+=bytesRead;
    }
    const descriptorAfter=fstatSync(fd,{bigint:true});
    let pathAfter;
    try{pathAfter=lstatSync(path,{bigint:true})}catch(error){
      throw new Error(`${label} path disappeared while reading: ${path} (${error instanceof Error?error.message:String(error)})`);
    }
    if(pathAfter.isSymbolicLink()||!pathAfter.isFile()||!sameFileGeneration(descriptorBefore,descriptorAfter)||!sameFileGeneration(descriptorAfter,pathAfter)){
      throw new Error(`${label} changed generation while reading: ${path}`);
    }
    return{raw:Buffer.concat(chunks,expectedSize),hash:`sha256:${hash.digest("hex")}`,stat:pathAfter};
  }finally{closeSync(fd)}
}

function validateCurrentToolIdentity(identity,label="CSG tool identity"){
  orderedRecord(identity,CSG_TOOL_IDENTITY_KEYS,label);
  const expectedPaths={
    producerPath:CHENG_CSG_ROUNDTRIP_SOURCE_PATH,
    consumerPath:CHENG_CSG_TOOLKIT_SOURCE_PATH,
    contractPath:CHENG_CSG_CURRENT_CONTRACT_SOURCE_PATH
  };
  for(const [pathField,hashField,artifactLabel] of [
    ["producerPath","producerSha256","CSG roundtrip producer source"],
    ["consumerPath","consumerSha256","CSG toolkit consumer source"],
    ["contractPath","contractSha256","CSG current contract source"]
  ]){
    if(identity[pathField]!==expectedPaths[pathField])throw new Error(`${label} ${pathField} is not the unique current source: ${identity[pathField]}`);
    if(!/^sha256:[0-9a-f]{64}$/.test(String(identity[hashField]||"")))throw new Error(`${label} ${hashField} is invalid`);
    const artifact=readStableRegularArtifact(identity[pathField],artifactLabel,ROUNDTRIP_MAX_REPORT_BYTES);
    if(artifact.hash!==identity[hashField])throw new Error(`${label} ${hashField} is stale: declared=${identity[hashField]} actual=${artifact.hash}`);
  }
  return identity;
}

function resolveCurrentToolIdentity(){
  const producer=readStableRegularArtifact(CHENG_CSG_ROUNDTRIP_SOURCE_PATH,"CSG roundtrip producer source",ROUNDTRIP_MAX_REPORT_BYTES);
  const consumer=readStableRegularArtifact(CHENG_CSG_TOOLKIT_SOURCE_PATH,"CSG toolkit consumer source",ROUNDTRIP_MAX_REPORT_BYTES);
  const contract=readStableRegularArtifact(CHENG_CSG_CURRENT_CONTRACT_SOURCE_PATH,"CSG current contract source",ROUNDTRIP_MAX_REPORT_BYTES);
  return validateCurrentToolIdentity({
    producerPath:CHENG_CSG_ROUNDTRIP_SOURCE_PATH,
    producerSha256:producer.hash,
    consumerPath:CHENG_CSG_TOOLKIT_SOURCE_PATH,
    consumerSha256:consumer.hash,
    contractPath:CHENG_CSG_CURRENT_CONTRACT_SOURCE_PATH,
    contractSha256:contract.hash
  });
}

function decodeFatalUtf8(raw,label,path){
  try{return new TextDecoder("utf-8",{fatal:true}).decode(raw)}catch(error){
    throw new Error(`${label} must be valid UTF-8: ${path} (${error instanceof Error?error.message:String(error)})`);
  }
}

function parseColdDriverReceipt(path){
  const artifact=readStableRegularArtifact(path,"cold driver build receipt",ROUNDTRIP_MAX_SUMMARY_BYTES);
  const text=decodeFatalUtf8(artifact.raw,"cold driver build receipt",path);
  if(!text.endsWith("\n")||text.includes("\r"))throw new Error(`cold driver build receipt must use LF-terminated canonical lines: ${path}`);
  const values={};
  for(const line of text.slice(0,-1).split("\n")){
    const match=/^([a-z][a-z0-9_]*)=([^=\n]+)$/.exec(line);
    if(!match)throw new Error(`cold driver build receipt has malformed line: ${path}`);
    if(Object.hasOwn(values,match[1]))throw new Error(`cold driver build receipt has duplicate key ${match[1]}: ${path}`);
    values[match[1]]=match[2];
  }
  if(JSON.stringify(Object.keys(values))!==JSON.stringify(COLD_DRIVER_RECEIPT_KEYS))throw new Error(`cold driver build receipt fields or field order are not canonical: ${path}`);
  return{values,hash:artifact.hash};
}

function requireReceiptBoundFile(path,label,expectedHash,maxBytes){
  if(typeof path!=="string"||resolve(path)!==path)throw new Error(`${label} path must be absolute: ${path}`);
  const artifact=readStableRegularArtifact(path,label,maxBytes);
  if(artifact.hash!==`sha256:${expectedHash}`)throw new Error(`${label} hash mismatch: receipt=sha256:${expectedHash} actual=${artifact.hash} path=${path}`);
  return artifact;
}

function validateColdDriverSourceManifest(path,expectedHash){
  const artifact=requireReceiptBoundFile(path,"cold driver source closure manifest",expectedHash,ROUNDTRIP_MAX_REPORT_BYTES);
  const text=decodeFatalUtf8(artifact.raw,"cold driver source closure manifest",path);
  if(!text.endsWith("\n")||text.includes("\r"))throw new Error(`cold driver source closure manifest must use LF-terminated canonical lines: ${path}`);
  const seen=new Set();
  for(const line of text.slice(0,-1).split("\n")){
    const match=/^([0-9a-f]{64})  (\/.+)$/.exec(line);
    if(!match||resolve(match[2])!==match[2]||seen.has(match[2]))throw new Error(`cold driver source closure manifest line is not canonical: ${path}`);
    seen.add(match[2]);
    requireReceiptBoundFile(match[2],"cold driver source closure member",match[1],ROUNDTRIP_MAX_FACTS_BYTES);
  }
  if(seen.size===0)throw new Error(`cold driver source closure manifest is empty: ${path}`);
}

function validateColdDriverIdentity(identity,label="cold driver identity"){
  orderedRecord(identity,COLD_DRIVER_IDENTITY_KEYS,label);
  if(identity.driverRole!=="official"||identity.csgSchemaVersion!==2||identity.csgAbiVersion!==1||identity.csgPointerWidth!==8||identity.csgEndian!==1||
     identity.csgSchemaDescSha256!==`sha256:${COLD_CSG_SCHEMA_DESC_SHA256}`)throw new Error(`${label} does not declare the unique current CSG descriptor`);
  for(const field of ["driverSha256","receiptSha256","sourceClosureSha256","patchSha256","buildScriptSha256","contractSha256","compilerSha256","compilerVersionSha256","bunSha256","bunVersionSha256","csgSchemaDescSha256"]){
    if(!/^sha256:[0-9a-f]{64}$/.test(String(identity[field]||"")))throw new Error(`${label} ${field} is invalid`);
  }
  for(const field of ["driverPath","receiptPath","sourceManifestPath","patchPath","buildScriptPath","contractPath","compilerPath","bunPath"]){
    if(typeof identity[field]!=="string"||resolve(identity[field])!==identity[field])throw new Error(`${label} ${field} must be absolute`);
  }
  return identity;
}

function resolveColdCsgDriver(){
  const explicitDriver=process.env.CHENG_COLD_DRIVER;
  const driver=explicitDriver||CHENG_FUSION_VENDOR_COLD_DRIVER;
  if(typeof driver!=="string"||resolve(driver)!==driver)throw new Error(`official cold CSG driver path must be absolute: ${driver}`);
  const receiptPath=process.env.CHENG_COLD_DRIVER_RECEIPT||(driver+".receipt");
  if(explicitDriver&&!process.env.CHENG_COLD_DRIVER_RECEIPT)throw new Error("CHENG_COLD_DRIVER requires the exact CHENG_COLD_DRIVER_RECEIPT; implicit fallback is forbidden");
  if(resolve(receiptPath)!==receiptPath)throw new Error(`official cold CSG driver receipt path must be absolute: ${receiptPath}`);
  const driverArtifact=readStableRegularArtifact(driver,"official cold CSG driver",ROUNDTRIP_MAX_OBJECT_BYTES);
  if((driverArtifact.stat.mode&0o111n)===0n)throw new Error(`official cold CSG driver is not executable: ${driver}`);
  const receipt=parseColdDriverReceipt(receiptPath);
  const value=receipt.values;
  for(const field of ["source_closure_sha256","patch_sha256","build_script_sha256","contract_sha256","compiler_sha256","compiler_version_sha256","bun_sha256","bun_version_sha256","gen2_sha256","gen3_sha256","official_sha256","csg_schema_desc_sha256"]){
    if(!/^[0-9a-f]{64}$/.test(value[field]))throw new Error(`cold driver build receipt ${field} is not canonical: ${receiptPath}`);
  }
  if(value.schema!=="cheng_fusion_cold_driver_build_receipt"||value.driver_role!=="official"||
     value.csg_schema_version!=="2"||value.csg_abi_version!=="1"||value.csg_pointer_width!=="8"||value.csg_endian!=="1"||
     value.csg_schema_desc_sha256!==COLD_CSG_SCHEMA_DESC_SHA256||value.raw_equal!=="1"||value.different_inode!=="1"){
    throw new Error(`cold driver build receipt does not declare the unique current CSG descriptor: ${receiptPath}`);
  }
  const driverHash=driverArtifact.hash.slice("sha256:".length);
  if(value.official_sha256!==driverHash||value.gen2_sha256!==driverHash||value.gen3_sha256!==driverHash){
    throw new Error(`official cold CSG driver hash/fixed-point mismatch: driver=sha256:${driverHash} receipt=${receiptPath}`);
  }
  validateColdDriverSourceManifest(value.source_manifest_path,value.source_closure_sha256);
  requireReceiptBoundFile(value.patch_path,"cold driver patch",value.patch_sha256,ROUNDTRIP_MAX_REPORT_BYTES);
  requireReceiptBoundFile(value.build_script_path,"cold driver build script",value.build_script_sha256,ROUNDTRIP_MAX_REPORT_BYTES);
  if(value.contract_path!==CHENG_CSG_CURRENT_CONTRACT_SOURCE_PATH)throw new Error(`cold driver contract path is not the unique current contract: ${value.contract_path}`);
  requireReceiptBoundFile(value.contract_path,"cold driver current contract",value.contract_sha256,ROUNDTRIP_MAX_REPORT_BYTES);
  if(value.compiler_path!=="/usr/bin/cc")throw new Error(`cold driver compiler path is not the canonical production compiler: ${value.compiler_path}`);
  requireReceiptBoundFile(value.compiler_path,"cold driver compiler",value.compiler_sha256,ROUNDTRIP_MAX_OBJECT_BYTES);
  const compilerProbe=spawnSync(value.compiler_path,["--version"],{encoding:null,timeout:5000,killSignal:"SIGKILL",maxBuffer:1024*1024,env:chengDriverSpawnEnv()});
  if(compilerProbe.error||compilerProbe.signal||compilerProbe.status!==0)throw new Error(`cold driver compiler identity probe failed: ${value.compiler_path}`);
  const compilerVersionHash=createHash("sha256").update(compilerProbe.stdout||Buffer.alloc(0)).digest("hex");
  if(compilerVersionHash!==value.compiler_version_sha256)throw new Error(`cold driver compiler version hash mismatch: receipt=sha256:${value.compiler_version_sha256} actual=sha256:${compilerVersionHash}`);
  if(resolve(value.bun_path)!==value.bun_path||value.bun_path!==process.execPath)throw new Error(`cold driver Bun path is not the running production runtime: receipt=${value.bun_path} runtime=${process.execPath}`);
  requireReceiptBoundFile(value.bun_path,"cold driver Bun runtime",value.bun_sha256,ROUNDTRIP_MAX_OBJECT_BYTES);
  const bunProbe=spawnSync(value.bun_path,["--version"],{encoding:null,timeout:5000,killSignal:"SIGKILL",maxBuffer:1024*1024,env:chengDriverSpawnEnv()});
  if(bunProbe.error||bunProbe.signal||bunProbe.status!==0)throw new Error(`cold driver Bun identity probe failed: ${value.bun_path}`);
  const bunVersionHash=createHash("sha256").update(bunProbe.stdout||Buffer.alloc(0)).digest("hex");
  if(bunVersionHash!==value.bun_version_sha256)throw new Error(`cold driver Bun version hash mismatch: receipt=sha256:${value.bun_version_sha256} actual=sha256:${bunVersionHash}`);
  const commandProbe=spawnSync(driver,["emit-cold-csg"],{encoding:"utf8",timeout:5000,killSignal:"SIGKILL",maxBuffer:1024*1024,env:chengDriverSpawnEnv()});
  const commandText=commandOutput(commandProbe);
  if(commandProbe.error||commandProbe.signal||!Number.isInteger(commandProbe.status)||commandText.includes("requires full selfhost CSG facts lowering")||commandText.includes("unknown command")||(!commandText.includes("missing --in")&&!commandText.includes("emit-cold-csg"))){
    throw new Error(`receipt-bound official cold CSG driver does not expose emit-cold-csg: ${driver}`);
  }
  const identity={
    driverRole:"official",
    driverPath:driver,
    driverSha256:`sha256:${driverHash}`,
    receiptPath,
    receiptSha256:receipt.hash,
    sourceManifestPath:value.source_manifest_path,
    sourceClosureSha256:`sha256:${value.source_closure_sha256}`,
    patchPath:value.patch_path,
    patchSha256:`sha256:${value.patch_sha256}`,
    buildScriptPath:value.build_script_path,
    buildScriptSha256:`sha256:${value.build_script_sha256}`,
    contractPath:value.contract_path,
    contractSha256:`sha256:${value.contract_sha256}`,
    compilerPath:value.compiler_path,
    compilerSha256:`sha256:${value.compiler_sha256}`,
    compilerVersionSha256:`sha256:${value.compiler_version_sha256}`,
    bunPath:value.bun_path,
    bunSha256:`sha256:${value.bun_sha256}`,
    bunVersionSha256:`sha256:${value.bun_version_sha256}`,
    csgSchemaVersion:2,
    csgAbiVersion:1,
    csgPointerWidth:8,
    csgEndian:1,
    csgSchemaDescSha256:`sha256:${value.csg_schema_desc_sha256}`
  };
  validateColdDriverIdentity(identity);
  return{
    driver,
    identity
  };
}

function revalidateRoundtripIdentity(driverIdentity,toolIdentity,phase){
  const currentDriverIdentity=resolveColdCsgDriver().identity;
  if(JSON.stringify(currentDriverIdentity)!==JSON.stringify(driverIdentity))throw new Error(`${phase} cold driver identity changed while the roundtrip was running`);
  const currentToolIdentity=validateCurrentToolIdentity(ROUNDTRIP_LOADED_TOOL_IDENTITY,`${phase} roundtrip CSG tool identity`);
  if(JSON.stringify(currentToolIdentity)!==JSON.stringify(toolIdentity))throw new Error(`${phase} CSG tool identity changed while the roundtrip was running`);
}

/* The cold writer emits `<facts>.linemap` next to the facts and the reader
   bridges it to `<object>.map` (cold_move_macho_object_with_line_map). Both
   are first-class roundtrip artifacts: hash-bound into the generation like
   every other output, never synthesized downstream. */
function validateChengColdLineMap(path,label){
  const artifact=readStableRegularArtifact(path,label,ROUNDTRIP_MAX_REPORT_BYTES);
  const parsed=parseLineMapReport(artifact.raw,path);
  if(parsed.entryCount<=0)throw new Error(`${label} must declare a positive entry_count: ${path}`);
  return{hash:artifact.hash,entryCount:parsed.entryCount,raw:artifact.raw};
}

function requireFreshRegularArtifact(path,label,maxBytes=ROUNDTRIP_MAX_OBJECT_BYTES){
  return readStableRegularArtifact(path,label,maxBytes).stat;
}

function requireCanonicalDirectory(path,label){
  const stat=lstatSync(path);
  if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error(`${label} must be a real directory, not a symlink or non-directory: ${path}`);
  if(realpathSync(path)!==path)throw new Error(`${label} must not traverse symlink ancestors: ${path}`);
}

function sameDirectoryIdentity(left,right){
  return left.dev===right.dev&&left.ino===right.ino;
}

function requireExactDirectoryEntries(path,expected,label){
  const actual=readdirSync(path).sort();
  const orderedExpected=[...expected].sort();
  if(JSON.stringify(actual)!==JSON.stringify(orderedExpected)){
    throw new Error(`${label} has unexpected entries: ${path} expected=${orderedExpected.join(",")} actual=${actual.join(",")}`);
  }
}

function parseRoundtripLockOwner(path){
  const artifact=readStableRegularArtifact(path,"roundtrip lock owner",ROUNDTRIP_MAX_LOCK_RECORD_BYTES);
  if((artifact.stat.mode&0o777n)!==0o600n)throw new Error(`roundtrip lock owner mode must be 0600: ${path}`);
  const text=decodeFatalUtf8(artifact.raw,"roundtrip lock owner",path);
  if(!text.endsWith("\n")||text.includes("\r"))throw new Error(`roundtrip lock owner must use one canonical LF-terminated JSON record: ${path}`);
  let owner;
  try{owner=JSON.parse(text)}catch(error){
    throw new Error(`roundtrip lock owner is invalid JSON: ${path} (${error instanceof Error?error.message:String(error)})`);
  }
  if(!owner||typeof owner!=="object"||Array.isArray(owner)||JSON.stringify(Object.keys(owner))!==JSON.stringify(ROUNDTRIP_LOCK_OWNER_KEYS)){
    throw new Error(`roundtrip lock owner schema is invalid: ${path}`);
  }
  if(!Number.isSafeInteger(owner.pid)||owner.pid<=0||owner.pid>2147483647)throw new Error(`roundtrip lock owner pid is invalid: ${path}`);
  if(typeof owner.transactionId!=="string"||!/^[0-9a-z]+-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(owner.transactionId)){
    throw new Error(`roundtrip lock owner transactionId is invalid: ${path}`);
  }
  if(typeof owner.startedAt!=="string"||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/.test(owner.startedAt)){
    throw new Error(`roundtrip lock owner startedAt is invalid: ${path}`);
  }
  const startedAt=new Date(owner.startedAt);
  if(!Number.isFinite(startedAt.getTime())||startedAt.toISOString()!==owner.startedAt)throw new Error(`roundtrip lock owner startedAt is not canonical: ${path}`);
  if(JSON.stringify(owner)+"\n"!==text)throw new Error(`roundtrip lock owner JSON is not canonical: ${path}`);
  return{owner,artifact};
}

function readStableRoundtripLock(lockDir,expectedEntries=["owner.json"]){
  requireCanonicalDirectory(lockDir,"roundtrip transaction lock");
  const directoryBefore=lstatSync(lockDir,{bigint:true});
  if(!directoryBefore.isDirectory()||directoryBefore.isSymbolicLink())throw new Error(`roundtrip transaction lock must be a real directory: ${lockDir}`);
  requireExactDirectoryEntries(lockDir,expectedEntries,"roundtrip transaction lock");
  const parsed=parseRoundtripLockOwner(join(lockDir,"owner.json"));
  const directoryAfter=lstatSync(lockDir,{bigint:true});
  if(!directoryAfter.isDirectory()||directoryAfter.isSymbolicLink()||!sameDirectoryIdentity(directoryBefore,directoryAfter)){
    throw new Error(`roundtrip transaction lock changed while reading owner: ${lockDir}`);
  }
  requireExactDirectoryEntries(lockDir,expectedEntries,"roundtrip transaction lock");
  return{...parsed,directory:directoryAfter};
}

function assertRoundtripLockOwnerDead(evidence,lockDir){
  try{
    process.kill(evidence.owner.pid,0);
  }catch(error){
    if(error?.code==="ESRCH")return;
    if(error?.code==="EPERM"){
      throw new Error(`another cheng_csg_roundtrip transaction owns ${lockDir}: owner pid ${evidence.owner.pid} is live or has been reused`);
    }
    throw new Error(`cannot prove roundtrip lock owner pid ${evidence.owner.pid} is dead: ${lockDir} (${error instanceof Error?error.message:String(error)})`);
  }
  throw new Error(`another cheng_csg_roundtrip transaction owns ${lockDir}: owner pid ${evidence.owner.pid} is live or has been reused`);
}

function parseRoundtripRecoveryClaim(path,expectedRaw){
  const artifact=readStableRegularArtifact(path,"roundtrip recovery claim",ROUNDTRIP_MAX_LOCK_RECORD_BYTES);
  if((artifact.stat.mode&0o777n)!==0o600n)throw new Error(`roundtrip recovery claim mode must be 0600: ${path}`);
  const text=decodeFatalUtf8(artifact.raw,"roundtrip recovery claim",path);
  let claim;
  try{claim=JSON.parse(text)}catch(error){
    throw new Error(`roundtrip recovery claim is invalid JSON: ${path} (${error instanceof Error?error.message:String(error)})`);
  }
  if(!claim||typeof claim!=="object"||Array.isArray(claim)||JSON.stringify(Object.keys(claim))!==JSON.stringify(ROUNDTRIP_LOCK_RECOVERY_KEYS)||!Number.isSafeInteger(claim.pid)||claim.pid<=0||claim.pid>2147483647||typeof claim.claimId!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(claim.claimId)||!/^sha256:[0-9a-f]{64}$/.test(String(claim.ownerSha256||""))){
    throw new Error(`roundtrip recovery claim schema is invalid: ${path}`);
  }
  if(JSON.stringify(claim)+"\n"!==text)throw new Error(`roundtrip recovery claim JSON is not canonical: ${path}`);
  if(expectedRaw&&!artifact.raw.equals(expectedRaw))throw new Error(`roundtrip recovery claim changed after creation: ${path}`);
  return{claim,artifact};
}

function removeOwnRecoveryClaim(lockDir,initial,claimRaw){
  try{
    const current=readStableRoundtripLock(lockDir,["owner.json","recovery.json"]);
    if(!sameDirectoryIdentity(initial.directory,current.directory)||!sameFileGeneration(initial.artifact.stat,current.artifact.stat)||!initial.artifact.raw.equals(current.artifact.raw))return;
    parseRoundtripRecoveryClaim(join(lockDir,"recovery.json"),claimRaw);
    unlinkSync(join(lockDir,"recovery.json"));
    fsyncDirectory(lockDir);
  }catch{}
}

function recoverStaleRoundtripLock(lockDir){
  const initial=readStableRoundtripLock(lockDir);
  assertRoundtripLockOwnerDead(initial,lockDir);
  const claim={pid:process.pid,claimId:randomUUID(),ownerSha256:initial.artifact.hash};
  const claimRaw=Buffer.from(JSON.stringify(claim)+"\n");
  const claimPath=join(lockDir,"recovery.json");
  try{
    writeFileSync(claimPath,claimRaw,{flag:"wx",mode:0o600});
  }catch(error){
    if(error?.code==="EEXIST")throw new Error(`another stale-lock recovery already claims ${lockDir}`);
    throw error;
  }
  let renamed=false,recoveryDir=null,deletionStarted=false;
  try{
    fsyncFile(claimPath);
    fsyncDirectory(lockDir);
    const claimed=readStableRoundtripLock(lockDir,["owner.json","recovery.json"]);
    if(!sameDirectoryIdentity(initial.directory,claimed.directory)||!sameFileGeneration(initial.artifact.stat,claimed.artifact.stat)||!initial.artifact.raw.equals(claimed.artifact.raw)){
      throw new Error(`roundtrip lock owner changed before stale recovery claim: ${lockDir}`);
    }
    const claimEvidence=parseRoundtripRecoveryClaim(claimPath,claimRaw);
    if(claimEvidence.claim.ownerSha256!==initial.artifact.hash)throw new Error(`roundtrip recovery claim owner hash mismatch: ${claimPath}`);
    assertRoundtripLockOwnerDead(claimed,lockDir);
    requireExactDirectoryEntries(lockDir,["owner.json","recovery.json"],"claimed stale roundtrip lock");
    recoveryDir=join(dirname(lockDir),`.cheng-csg-roundtrip.recovering-${claim.claimId}`);
    if(existsSync(recoveryDir))throw new Error(`roundtrip recovery destination already exists: ${recoveryDir}`);
    renameSync(lockDir,recoveryDir);
    renamed=true;
    fsyncDirectory(dirname(lockDir));
    const moved=readStableRoundtripLock(recoveryDir,["owner.json","recovery.json"]);
    if(!sameDirectoryIdentity(initial.directory,moved.directory)||!sameFileGeneration(initial.artifact.stat,moved.artifact.stat)||!initial.artifact.raw.equals(moved.artifact.raw)){
      throw new Error(`stale roundtrip lock changed during atomic recovery claim: ${recoveryDir}`);
    }
    parseRoundtripRecoveryClaim(join(recoveryDir,"recovery.json"),claimRaw);
    deletionStarted=true;
    unlinkSync(join(recoveryDir,"recovery.json"));
    unlinkSync(join(recoveryDir,"owner.json"));
    rmdirSync(recoveryDir);
    fsyncDirectory(dirname(lockDir));
  }catch(error){
    if(!renamed)removeOwnRecoveryClaim(lockDir,initial,claimRaw);
    else if(!deletionStarted&&recoveryDir&&existsSync(recoveryDir)&&!existsSync(lockDir)){
      try{renameSync(recoveryDir,lockDir);fsyncDirectory(dirname(lockDir))}catch{}
    }
    throw error;
  }
}

function validateFailedAcquisitionGeneration(path,createdDirectory,ownerEvidence){
  requireCanonicalDirectory(path,"failed roundtrip lock acquisition");
  const directoryBefore=lstatSync(path,{bigint:true});
  if(!directoryBefore.isDirectory()||directoryBefore.isSymbolicLink()||!sameDirectoryIdentity(createdDirectory,directoryBefore)){
    throw new Error(`failed roundtrip lock acquisition no longer names the directory created by this transaction: ${path}`);
  }
  if(ownerEvidence){
    const current=readStableRoundtripLock(path);
    if(!sameDirectoryIdentity(createdDirectory,current.directory)||
       !sameFileGeneration(ownerEvidence.artifact.stat,current.artifact.stat)||
       !ownerEvidence.artifact.raw.equals(current.artifact.raw)){
      throw new Error(`failed roundtrip lock acquisition owner generation changed: ${path}`);
    }
    return;
  }
  requireExactDirectoryEntries(path,[],"failed roundtrip lock acquisition");
  const directoryAfter=lstatSync(path,{bigint:true});
  if(!directoryAfter.isDirectory()||directoryAfter.isSymbolicLink()||!sameDirectoryIdentity(createdDirectory,directoryAfter)){
    throw new Error(`failed roundtrip lock acquisition directory changed while proving it empty: ${path}`);
  }
}

let roundtripRenameNoReplaceApi=null;
function renameRoundtripDirectoryNoReplace(source,destination){
  if(process.platform!=="darwin")throw new Error("atomic no-replace roundtrip lock restoration requires Darwin renameatx_np");
  if(source.includes("\0")||destination.includes("\0"))throw new Error("roundtrip lock restoration path contains NUL");
  if(!roundtripRenameNoReplaceApi){
    const libsystem=dlopen("/usr/lib/libSystem.B.dylib",{
      renameatx_np:{
        args:[FFIType.i32,FFIType.ptr,FFIType.i32,FFIType.ptr,FFIType.u32],
        returns:FFIType.i32
      }
    });
    roundtripRenameNoReplaceApi={libsystem,renameatxNp:libsystem.symbols.renameatx_np};
  }
  const sourceBytes=Buffer.from(`${source}\0`),destinationBytes=Buffer.from(`${destination}\0`);
  const AT_FDCWD=-2,RENAME_EXCL=0x00000004;
  const result=roundtripRenameNoReplaceApi.renameatxNp(AT_FDCWD,ptr(sourceBytes),AT_FDCWD,ptr(destinationBytes),RENAME_EXCL);
  if(result!==0)throw new Error(`atomic no-replace roundtrip lock restoration failed: ${source} -> ${destination}`);
}

function sameOwnerInode(left,right){
  return left.dev===right.dev&&left.ino===right.ino&&left.size===right.size;
}

function validateDetachedAcquisitionOwner(ownerBackup,ownerEvidence){
  const detached=parseRoundtripLockOwner(ownerBackup);
  if(!sameOwnerInode(ownerEvidence.artifact.stat,detached.artifact.stat)||
     !ownerEvidence.artifact.raw.equals(detached.artifact.raw)){
    throw new Error(`detached failed-acquisition owner generation changed: ${ownerBackup}`);
  }
  return detached;
}

function restoreDetachedAcquisitionOwner(rollbackDir,ownerBackup,ownerEvidence){
  requireCanonicalDirectory(rollbackDir,"failed roundtrip lock acquisition rollback directory");
  const directory=lstatSync(rollbackDir,{bigint:true});
  const detached=validateDetachedAcquisitionOwner(ownerBackup,ownerEvidence);
  const ownerPath=join(rollbackDir,"owner.json");
  linkSync(ownerBackup,ownerPath);
  const restored=parseRoundtripLockOwner(ownerPath);
  if(!sameOwnerInode(detached.artifact.stat,restored.artifact.stat)||
     !ownerEvidence.artifact.raw.equals(restored.artifact.raw)){
    throw new Error(`failed roundtrip lock acquisition owner was not restored as the exact inode: ${ownerPath}`);
  }
  const directoryAfter=lstatSync(rollbackDir,{bigint:true});
  if(!sameDirectoryIdentity(directory,directoryAfter)){
    throw new Error(`failed roundtrip lock acquisition rollback directory changed during owner restoration: ${rollbackDir}`);
  }
  fsyncFile(ownerPath);
  fsyncDirectory(rollbackDir);
  unlinkSync(ownerBackup);
  fsyncDirectory(dirname(rollbackDir));
}

function rollbackFailedRoundtripLockAcquisition(lockDir,createdDirectory,ownerEvidence,testHooks=null){
  validateFailedAcquisitionGeneration(lockDir,createdDirectory,ownerEvidence);
  const rollbackDir=join(dirname(lockDir),`.cheng-csg-roundtrip.acquire-rollback-${randomUUID()}`);
  if(existsSync(rollbackDir))throw new Error(`roundtrip acquisition rollback destination already exists: ${rollbackDir}`);
  const ownerBackup=ownerEvidence
    ? join(dirname(lockDir),`.cheng-csg-roundtrip.acquire-owner-${randomUUID()}`)
    : null;
  if(ownerBackup&&existsSync(ownerBackup))throw new Error(`roundtrip acquisition owner backup already exists: ${ownerBackup}`);
  let renamed=false,ownerDetached=false,directoryRemoved=false;
  try{
    renameSync(lockDir,rollbackDir);
    renamed=true;
    fsyncDirectory(dirname(lockDir));
    validateFailedAcquisitionGeneration(rollbackDir,createdDirectory,ownerEvidence);
    if(testHooks?.afterRollbackDirectoryRenamed){
      testHooks.afterRollbackDirectoryRenamed({lockDir,rollbackDir,createdDirectory,ownerEvidence});
    }
    validateFailedAcquisitionGeneration(rollbackDir,createdDirectory,ownerEvidence);
    if(ownerEvidence){
      renameSync(join(rollbackDir,"owner.json"),ownerBackup);
      ownerDetached=true;
      fsyncDirectory(rollbackDir);
      fsyncDirectory(dirname(lockDir));
      validateDetachedAcquisitionOwner(ownerBackup,ownerEvidence);
      if(testHooks?.afterOwnerDetached){
        testHooks.afterOwnerDetached({lockDir,rollbackDir,ownerBackup,createdDirectory,ownerEvidence});
      }
      validateDetachedAcquisitionOwner(ownerBackup,ownerEvidence);
      requireExactDirectoryEntries(rollbackDir,[],"failed roundtrip lock acquisition after atomic owner detach");
      const directoryAfterOwner=lstatSync(rollbackDir,{bigint:true});
      if(!directoryAfterOwner.isDirectory()||directoryAfterOwner.isSymbolicLink()||!sameDirectoryIdentity(createdDirectory,directoryAfterOwner)){
        throw new Error(`failed roundtrip lock acquisition directory changed after atomic owner detach: ${rollbackDir}`);
      }
    }
    if(existsSync(lockDir))throw new Error(`canonical roundtrip lock path was replaced during acquisition rollback: ${lockDir}`);
    if(testHooks?.beforeRollbackDirectoryRemove){
      testHooks.beforeRollbackDirectoryRemove({lockDir,rollbackDir,ownerBackup,createdDirectory,ownerEvidence});
    }
    if(existsSync(lockDir))throw new Error(`canonical roundtrip lock path was replaced before acquisition rollback removal: ${lockDir}`);
    requireExactDirectoryEntries(rollbackDir,[],"failed roundtrip lock acquisition before directory removal");
    const directoryBeforeRemove=lstatSync(rollbackDir,{bigint:true});
    if(!sameDirectoryIdentity(createdDirectory,directoryBeforeRemove)){
      throw new Error(`failed roundtrip lock acquisition directory changed before removal: ${rollbackDir}`);
    }
    rmdirSync(rollbackDir);
    directoryRemoved=true;
    fsyncDirectory(dirname(lockDir));
    if(ownerDetached){
      validateDetachedAcquisitionOwner(ownerBackup,ownerEvidence);
      unlinkSync(ownerBackup);
      ownerDetached=false;
      fsyncDirectory(dirname(lockDir));
    }
  }catch(error){
    const restorationErrors=[];
    if(ownerDetached&&!directoryRemoved){
      try{
        restoreDetachedAcquisitionOwner(rollbackDir,ownerBackup,ownerEvidence);
        ownerDetached=false;
      }catch(restoreError){
        restorationErrors.push(restoreError instanceof Error?restoreError.message:String(restoreError));
      }
    }
    if(renamed&&!directoryRemoved&&existsSync(rollbackDir)){
      try{
        requireCanonicalDirectory(rollbackDir,"failed roundtrip lock acquisition rollback directory");
        const rollbackDirectory=lstatSync(rollbackDir,{bigint:true});
        if(!sameDirectoryIdentity(createdDirectory,rollbackDirectory)){
          throw new Error(`failed roundtrip lock acquisition rollback directory no longer has the created inode: ${rollbackDir}`);
        }
        renameRoundtripDirectoryNoReplace(rollbackDir,lockDir);
        fsyncDirectory(dirname(lockDir));
      }catch(restoreError){
        restorationErrors.push(restoreError instanceof Error?restoreError.message:String(restoreError));
      }
    }
    if(ownerDetached&&directoryRemoved){
      try{
        validateDetachedAcquisitionOwner(ownerBackup,ownerEvidence);
        unlinkSync(ownerBackup);
        ownerDetached=false;
        fsyncDirectory(dirname(lockDir));
      }catch(cleanupError){
        restorationErrors.push(cleanupError instanceof Error?cleanupError.message:String(cleanupError));
      }
    }
    if(restorationErrors.length>0){
      throw new Error(`${error instanceof Error?error.message:String(error)}; exact acquisition rollback restoration failed: ${restorationErrors.join("; ")}`);
    }
    throw error;
  }
}

function acquireRoundtripLock(lockDir,transactionId,testHooks=null){
  let recovered=false;
  let createdDirectory=null;
  for(;;){
    try{
      mkdirSync(lockDir,{mode:0o700});
      createdDirectory=lstatSync(lockDir,{bigint:true});
      if(!createdDirectory.isDirectory()||createdDirectory.isSymbolicLink()){
        throw new Error(`new roundtrip transaction lock is not a real directory: ${lockDir}`);
      }
      break;
    }catch(error){
      if(error?.code!=="EEXIST")throw error;
      if(recovered){
        const contender=readStableRoundtripLock(lockDir);
        assertRoundtripLockOwnerDead(contender,lockDir);
        throw new Error(`roundtrip lock changed owner during stale recovery; refusing a second recovery: ${lockDir}`);
      }
      recoverStaleRoundtripLock(lockDir);
      recovered=true;
    }
  }
  let ownerEvidence=null;
  try{
    if(testHooks?.afterDirectoryCreated)testHooks.afterDirectoryCreated({lockDir,directory:createdDirectory});
    chmodSync(lockDir,0o700);
    requireCanonicalDirectory(lockDir,"roundtrip transaction lock");
    const owner={pid:process.pid,transactionId,startedAt:new Date().toISOString()};
    const ownerRaw=Buffer.from(JSON.stringify(owner)+"\n");
    const ownerPath=join(lockDir,"owner.json");
    writeFileSync(ownerPath,ownerRaw,{flag:"wx",mode:0o600});
    ownerEvidence=parseRoundtripLockOwner(ownerPath);
    if(!ownerEvidence.artifact.raw.equals(ownerRaw))throw new Error(`roundtrip lock owner changed immediately after creation: ${lockDir}`);
    if(testHooks?.afterOwnerCaptured)testHooks.afterOwnerCaptured({lockDir,ownerPath,ownerRaw,ownerEvidence});
    fsyncFile(ownerPath);
    fsyncDirectory(lockDir);
    fsyncDirectory(dirname(lockDir));
    const lease=readStableRoundtripLock(lockDir);
    if(!sameDirectoryIdentity(createdDirectory,lease.directory)||
       !sameFileGeneration(ownerEvidence.artifact.stat,lease.artifact.stat)||
       !lease.artifact.raw.equals(ownerRaw)){
      throw new Error(`roundtrip lock owner changed during acquisition: ${lockDir}`);
    }
    return{...lease,lockDir};
  }catch(error){
    try{
      rollbackFailedRoundtripLockAcquisition(lockDir,createdDirectory,ownerEvidence,testHooks);
    }catch(rollbackError){
      throw new Error(`${error instanceof Error?error.message:String(error)}; exact acquisition rollback refused or failed: ${rollbackError instanceof Error?rollbackError.message:String(rollbackError)}`);
    }
    throw error;
  }
}

function releaseRoundtripLock(lease){
  const current=readStableRoundtripLock(lease.lockDir);
  if(!sameDirectoryIdentity(lease.directory,current.directory)||!sameFileGeneration(lease.artifact.stat,current.artifact.stat)||!lease.artifact.raw.equals(current.artifact.raw)){
    throw new Error(`refusing to release a roundtrip lock no longer owned by this transaction: ${lease.lockDir}`);
  }
  const releaseDir=join(dirname(lease.lockDir),`.cheng-csg-roundtrip.releasing-${randomUUID()}`);
  if(existsSync(releaseDir))throw new Error(`roundtrip release destination already exists: ${releaseDir}`);
  renameSync(lease.lockDir,releaseDir);
  fsyncDirectory(dirname(lease.lockDir));
  let deletionStarted=false;
  try{
    const moved=readStableRoundtripLock(releaseDir);
    if(!sameDirectoryIdentity(lease.directory,moved.directory)||!sameFileGeneration(lease.artifact.stat,moved.artifact.stat)||!lease.artifact.raw.equals(moved.artifact.raw)){
      throw new Error(`roundtrip lock changed during atomic release: ${releaseDir}`);
    }
    deletionStarted=true;
    unlinkSync(join(releaseDir,"owner.json"));
    rmdirSync(releaseDir);
    fsyncDirectory(dirname(lease.lockDir));
  }catch(error){
    if(!deletionStarted&&existsSync(releaseDir)&&!existsSync(lease.lockDir)){
      try{renameSync(releaseDir,lease.lockDir);fsyncDirectory(dirname(lease.lockDir))}catch{}
    }
    throw error;
  }
}

function requireChengSource(path,root,label){
  if(typeof path!=="string"||resolve(path)!==path||!path.endsWith(".cheng"))throw new Error(`${label} must be an absolute .cheng path: ${path}`);
  assertInsideProject(path,root);
  let stat;
  try{stat=lstatSync(path)}catch(error){throw new Error(`${label} not found: ${path} (${error instanceof Error?error.message:String(error)})`)}
  if(stat.isSymbolicLink()||!stat.isFile()||stat.size<=0)throw new Error(`${label} must be a non-empty regular non-symlink file: ${path}`);
  return path;
}

function ensureCanonicalDirectoryUnderRoot(path,root,label){
  assertInsideProject(path,root);
  requireCanonicalDirectory(root,"Cheng project root");
  let current=root;
  const components=relative(root,path).split(/[\\/]+/).filter(Boolean);
  for(const component of components){
    const parent=current;
    current=join(current,component);
    let stat;
    try{stat=lstatSync(current)}catch(error){
      if(error?.code!=="ENOENT")throw error;
      try{mkdirSync(current,{mode:0o700})}catch(mkdirError){
        if(mkdirError?.code!=="EEXIST")throw mkdirError;
      }
      stat=lstatSync(current);
      fsyncDirectory(parent);
    }
    if(stat.isSymbolicLink()||!stat.isDirectory()||realpathSync(current)!==current){
      throw new Error(`${label} traverses a symlink or non-directory component: ${current}`);
    }
  }
  return path;
}

function fnv1a64(buffer){
  let hash=COLD_CSG_FNV64_BASIS;
  for(const byte of buffer)hash=BigInt.asUintN(64,(hash^BigInt(byte))*COLD_CSG_FNV64_PRIME);
  return hash;
}

function readStrictCsgString(payload,offset,path,line){
  if(offset<0||offset+4>payload.length)throw new Error(`CHENG_CSG string length out of bounds at line ${line}: ${path}`);
  const length=payload.readUInt32LE(offset);
  const start=offset+4,end=start+length;
  if(end>payload.length)throw new Error(`CHENG_CSG string payload out of bounds at line ${line}: ${path}`);
  let value;
  try{value=new TextDecoder("utf-8",{fatal:true}).decode(payload.subarray(start,end))}catch{
    throw new Error(`CHENG_CSG string must be valid UTF-8 at line ${line}: ${path}`);
  }
  if(value.length===0)throw new Error(`CHENG_CSG string must be non-empty at line ${line}: ${path}`);
  return{end,value};
}

function readFixedCString(payload,start,length,label,path){
  const bytes=payload.subarray(start,start+length);
  const nul=bytes.indexOf(0);
  const end=nul<0?bytes.length:nul;
  if(nul>=0&&bytes.subarray(nul).some((byte)=>byte!==0))throw new Error(`CHENG_CSG header ${label} has non-zero bytes after NUL: ${path}`);
  const value=decodeFatalUtf8(bytes.subarray(0,end),`CHENG_CSG header ${label}`,path);
  if(value.length===0)throw new Error(`CHENG_CSG header ${label} must be non-empty: ${path}`);
  return value;
}

function validateChengColdFacts(path,expectedTarget){
  if(!/^[A-Za-z0-9_.+-]+$/.test(expectedTarget))throw new Error(`CSG target triple must use canonical ASCII target characters: ${expectedTarget}`);
  const artifact=readStableRegularArtifact(path,"CSG facts",ROUNDTRIP_MAX_FACTS_BYTES);
  const raw=artifact.raw;
  const text=decodeFatalUtf8(raw,"CSG facts",path);
  if(!text.startsWith("CHENG_CSG\n")||!text.endsWith("\n"))throw new Error(`CSG facts must use the exact CHENG_CSG line format: ${path}`);
  const lines=text.slice(0,-1).split("\n");
  if(lines[0]!=="CHENG_CSG")throw new Error(`CSG facts header must be exactly CHENG_CSG: ${path}`);
  const counts={records:0,functions:0,words:0,relocs:0,data:0,dataRelocs:0,callEdges:0};
  const records=[];
  for(let index=1;index<lines.length;index++){
    const match=lines[index].match(/^R([0-9a-f]{4})([0-9a-f]{8})([0-9a-f]*)$/);
    if(!match)throw new Error(`invalid CHENG_CSG record line ${index+1}: ${path}`);
    const kind=Number.parseInt(match[1],16);
    const byteCount=Number.parseInt(match[2],16);
    if(kind<0||kind>9)throw new Error(`unknown CHENG_CSG record kind ${kind} at line ${index+1}: ${path}`);
    if(match[3].length!==byteCount*2)throw new Error(`CHENG_CSG payload size mismatch at line ${index+1}: ${path}`);
    records.push({kind,payload:Buffer.from(match[3],"hex"),line:index+1,text:lines[index]});
    counts.records++;
    if(kind===4)counts.functions++;
    else if(kind===6)counts.relocs++;
    else if(kind===7)counts.data++;
    else if(kind===8)counts.dataRelocs++;
    else if(kind===9)counts.callEdges++;
  }
  if(records.length===0||records[0].kind!==0)throw new Error(`CHENG_CSG facts must begin with the canonical header record: ${path}`);
  const header=records[0].payload;
  if(header.length!==126)throw new Error(`CHENG_CSG header payload must be exactly 126 bytes: ${path}`);
  if(header.readUInt32LE(0)!==2||header.readUInt32LE(4)!==1||header[8]!==8||header[9]!==1){
    throw new Error(`CHENG_CSG header schema/ABI/pointer-width/endian mismatch: ${path}`);
  }
  if(header.readUInt32LE(10)<=0)throw new Error(`CHENG_CSG producer version must be positive: ${path}`);
  const headerTarget=readFixedCString(header,14,32,"target",path);
  const headerEntryBytes=header.subarray(46,110);
  const expectedHeaderTarget=expectedTarget.slice(0,32);
  if(headerTarget!==expectedHeaderTarget)throw new Error(`CHENG_CSG header target mismatch: expected=${expectedHeaderTarget} actual=${headerTarget}`);
  const declaredSchemaHash=header.readBigUInt64LE(110);
  const expectedSchemaHash=fnv1a64(Buffer.from(COLD_CSG_SCHEMA_DESC,"utf8"));
  if(declaredSchemaHash!==expectedSchemaHash)throw new Error(`CHENG_CSG schema_hash mismatch: ${path}`);
  const declaredPlanHash=header.readBigUInt64LE(118);
  const payloadStart=Buffer.byteLength(`CHENG_CSG\n${records[0].text}\n`,`utf8`);
  const actualPlanHash=fnv1a64(raw.subarray(payloadStart));
  if(declaredPlanHash!==actualPlanHash)throw new Error(`CHENG_CSG plan_hash mismatch: ${path}`);
  const singletonKinds=new Set();
  const singletonValues=new Map();
  const functionItems=new Map();
  const dataItems=new Map();
  const functionSymbols=new Map();
  const dataSymbols=new Map();
  const relocations=[];
  const dataRelocations=[];
  const callEdges=[];
  for(let index=0;index<records.length;index++){
    const {kind,payload,line}=records[index];
    if(kind===0){if(index!==0)throw new Error(`duplicate CHENG_CSG header record at line ${line}: ${path}`);continue}
    let offset=0;
    const readU32=(field)=>{
      if(offset+4>payload.length)throw new Error(`CHENG_CSG ${field} is truncated at line ${line}: ${path}`);
      const value=payload.readUInt32LE(offset);
      offset+=4;
      return value;
    };
    const requireString=()=>{const decoded=readStrictCsgString(payload,offset,path,line);offset=decoded.end;return decoded.value};
    if(kind===1||kind===2||kind===3){
      if(singletonKinds.has(kind))throw new Error(`duplicate CHENG_CSG singleton record kind ${kind} at line ${line}: ${path}`);
      singletonKinds.add(kind);
      singletonValues.set(kind,requireString());
    }else if(kind===4){
      const itemId=readU32("function item_id");
      const wordOffset=readU32("function word_offset");
      const wordCount=readU32("function word_count");
      const symbol=requireString();
      requireString();
      if(functionItems.has(itemId))throw new Error(`duplicate CHENG_CSG function item_id ${itemId} at line ${line}; first declared at line ${functionItems.get(itemId).line}: ${path}`);
      if(functionSymbols.has(symbol))throw new Error(`duplicate CHENG_CSG function symbol ${symbol} at line ${line}; first declared at line ${functionSymbols.get(symbol).line}: ${path}`);
      if(dataSymbols.has(symbol))throw new Error(`CHENG_CSG function symbol ${symbol} collides with data symbol declared at line ${dataSymbols.get(symbol).line}: ${path}`);
      const entry={itemId,wordOffset,wordCount,symbol,line};
      functionItems.set(itemId,entry);
      functionSymbols.set(symbol,entry);
    }else if(kind===5){
      const wordOffset=readU32("word_chunk word_offset");
      const wordCount=readU32("word_chunk word_count");
      if(wordOffset!==counts.words||wordCount<=0||wordCount>4096||
         payload.length-offset!==wordCount*4){
        throw new Error(`CHENG_CSG word_chunk count/offset/payload mismatch at line ${line}: ${path}`);
      }
      offset+=wordCount*4;
      counts.words+=wordCount;
    }
    else if(kind===6){
      const sourceItemId=readU32("reloc source_item_id");
      const wordOffset=readU32("reloc word_offset");
      const targetSymbol=requireString();
      relocations.push({sourceItemId,wordOffset,targetSymbol,line});
    }
    else if(kind===7){
      const itemId=readU32("data item_id");
      const symbol=requireString();
      const align=readU32("data align");
      const byteCount=readU32("data byte_count");
      if(offset+byteCount>payload.length)throw new Error(`CHENG_CSG data bytes out of bounds at line ${line}: ${path}`);
      if(byteCount===0)throw new Error(`CHENG_CSG data byte_count must be positive at line ${line}: ${path}`);
      if(![1,2,4,8,16].includes(align))throw new Error(`CHENG_CSG data align must be one of 1,2,4,8,16 at line ${line}: ${path}`);
      if(dataItems.has(itemId))throw new Error(`duplicate CHENG_CSG data item_id ${itemId} at line ${line}; first declared at line ${dataItems.get(itemId).line}: ${path}`);
      if(dataSymbols.has(symbol))throw new Error(`duplicate CHENG_CSG data symbol ${symbol} at line ${line}; first declared at line ${dataSymbols.get(symbol).line}: ${path}`);
      if(functionSymbols.has(symbol))throw new Error(`CHENG_CSG data symbol ${symbol} collides with function symbol declared at line ${functionSymbols.get(symbol).line}: ${path}`);
      const entry={itemId,symbol,line};
      dataItems.set(itemId,entry);
      dataSymbols.set(symbol,entry);
      offset+=byteCount;
    }else if(kind===8){
      const sourceItemId=readU32("data_reloc source_item_id");
      const wordOffset=readU32("data_reloc word_offset");
      const relocKind=readU32("data_reloc reloc_kind");
      const addend=readU32("data_reloc addend");
      const targetSymbol=requireString();
      if(relocKind!==1||addend!==0)throw new Error(`CHENG_CSG data_reloc must use reloc_kind=1 and addend=0 at line ${line}: ${path}`);
      dataRelocations.push({sourceItemId,wordOffset,targetSymbol,line});
    }else if(kind===9){
      const sourceItemId=readU32("call_edge source_item_id");
      const targetSymbol=requireString();
      callEdges.push({sourceItemId,targetSymbol,line});
    }
    if(offset!==payload.length)throw new Error(`CHENG_CSG record has trailing or malformed payload at line ${line}: ${path}`);
  }
  for(const kind of [1,2,3])if(!singletonKinds.has(kind))throw new Error(`CHENG_CSG required singleton record kind ${kind} is missing: ${path}`);
  if(singletonValues.get(1)!==expectedTarget)throw new Error(`CHENG_CSG target record mismatch: expected=${expectedTarget} actual=${singletonValues.get(1)}`);
  const expectedHeaderEntry=Buffer.alloc(64);
  Buffer.from(singletonValues.get(3),"utf8").copy(expectedHeaderEntry,0,0,64);
  if(!headerEntryBytes.equals(expectedHeaderEntry))throw new Error(`CHENG_CSG entry record/header identification bytes mismatch: ${path}`);
  if(counts.functions<=0)throw new Error(`CHENG_CSG facts must contain at least one function record: ${path}`);
  if(!functionSymbols.has(singletonValues.get(3)))throw new Error(`CHENG_CSG entry symbol does not identify a function: ${singletonValues.get(3)} (${path})`);
  for(const fn of functionItems.values()){
    if(fn.wordOffset>counts.words||fn.wordCount>counts.words-fn.wordOffset){
      throw new Error(`CHENG_CSG function item_id ${fn.itemId} word range exceeds word records at line ${fn.line}: ${path}`);
    }
  }
  const requireFunctionSource=(reference,kind)=>{
    const source=functionItems.get(reference.sourceItemId);
    if(!source)throw new Error(`CHENG_CSG ${kind} has dangling source_item_id ${reference.sourceItemId} at line ${reference.line}: ${path}`);
    return source;
  };
  for(const reloc of relocations){
    const source=requireFunctionSource(reloc,"reloc");
    if(reloc.wordOffset<source.wordOffset||reloc.wordOffset>=source.wordOffset+source.wordCount){
      throw new Error(`CHENG_CSG reloc word_offset is outside source function item_id ${source.itemId} at line ${reloc.line}: ${path}`);
    }
  }
  for(const reloc of dataRelocations){
    const source=requireFunctionSource(reloc,"data_reloc");
    if(reloc.wordOffset<source.wordOffset||reloc.wordOffset+1>=source.wordOffset+source.wordCount){
      throw new Error(`CHENG_CSG data_reloc word_offset pair is outside source function item_id ${source.itemId} at line ${reloc.line}: ${path}`);
    }
    if(!functionSymbols.has(reloc.targetSymbol)&&!dataSymbols.has(reloc.targetSymbol)){
      throw new Error(`CHENG_CSG data_reloc target_symbol does not identify a defined symbol at line ${reloc.line}: ${path}`);
    }
  }
  for(const edge of callEdges){
    requireFunctionSource(edge,"call_edge");
    if(!functionSymbols.has(edge.targetSymbol))throw new Error(`CHENG_CSG call_edge target_symbol does not identify a function at line ${edge.line}: ${path}`);
  }
  return{raw,hash:artifact.hash,counts,target:singletonValues.get(1),objectFormat:singletonValues.get(2),entry:singletonValues.get(3)};
}

const REQUIRED_FACT_COUNT_FIELDS=[
  ["facts_record_count","records"],
  ["facts_function_count","functions"],
  ["facts_word_count","words"],
  ["facts_reloc_count","relocs"],
  ["facts_data_count","data"],
  ["facts_data_reloc_count","dataRelocs"]
];

function parseAndValidateReport(path,label,factsCounts){
  const artifact=readStableRegularArtifact(path,label,ROUNDTRIP_MAX_REPORT_BYTES);
  const text=decodeFatalUtf8(artifact.raw,label,path);
  if(text.includes("\r")||!text.endsWith("\n"))throw new Error(`${label} must use canonical LF-terminated key=value lines: ${path}`);
  const values=new Map();
  const lines=text.slice(0,-1).split("\n");
  if(lines.length===0)throw new Error(`${label} must contain key=value lines: ${path}`);
  for(let index=0;index<lines.length;index++){
    const match=lines[index].match(/^([A-Za-z][A-Za-z0-9_]*)=(.*)$/);
    if(!match)throw new Error(`${label} has malformed key=value line ${index+1}: ${path}`);
    if(values.has(match[1]))throw new Error(`${label} has duplicate key ${match[1]}: ${path}`);
    values.set(match[1],match[2]);
  }
  const counts={};
  for(const [field,countName] of REQUIRED_FACT_COUNT_FIELDS){
    const raw=values.get(field);
    if(raw===undefined)throw new Error(`${label} is missing required numeric field ${field}: ${path}`);
    if(!/^(0|[1-9][0-9]*)$/.test(raw))throw new Error(`${label} field ${field} must be a canonical non-negative integer: ${path}`);
    const value=Number(raw);
    if(!Number.isSafeInteger(value))throw new Error(`${label} field ${field} exceeds the safe integer range: ${path}`);
    counts[countName]=value;
    if(value!==factsCounts[countName])throw new Error(`${label} ${field} mismatch: report=${value} facts=${factsCounts[countName]}`);
  }
  return{raw:artifact.raw,hash:artifact.hash,counts,values};
}

function expectedObjectContract(target){
  const targetText=String(target);
  if(targetText.length===0||targetText.length>128||!/^[A-Za-z0-9_.+-]+$/.test(targetText)){
    throw new Error(`CSG target triple must be 1..128 canonical ASCII target characters: ${targetText}`);
  }
  const normalized=targetText.toLowerCase();
  const archToken=normalized.split("-")[0];
  let arch;
  if(archToken==="arm64"||archToken==="aarch64")arch="arm64";
  else if(archToken==="x86_64"||archToken==="amd64")arch="x86_64";
  else if(archToken==="riscv64")arch="riscv64";
  else throw new Error(`unsupported CSG target architecture: ${target}`);
  let format;
  if(normalized.includes("darwin")||normalized.includes("apple"))format="macho";
  else if(normalized.includes("linux")||normalized.includes("gnu")||normalized.includes("elf"))format="elf";
  else throw new Error(`unsupported CSG target object format: ${target}`);
  return{arch,format};
}

function normalizeFactsObjectFormat(value){
  const normalized=String(value).toLowerCase().replace(/[_-]/g,"");
  if(normalized==="macho"||normalized==="macho64")return"macho";
  if(normalized==="elf"||normalized==="elf64")return"elf";
  throw new Error(`unsupported CHENG_CSG object format record: ${value}`);
}

function validateObjectArtifact(path,target,factsObjectFormat){
  const artifact=readStableRegularArtifact(path,"reader object",ROUNDTRIP_MAX_OBJECT_BYTES);
  const raw=artifact.raw;
  const expected=expectedObjectContract(target);
  const declaredFormat=normalizeFactsObjectFormat(factsObjectFormat);
  if(declaredFormat!==expected.format)throw new Error(`CHENG_CSG object format mismatch: target=${target} facts=${factsObjectFormat}`);
  let actual;
  if(raw.length>=4&&raw.readUInt32LE(0)===0xfeedfacf){
    if(raw.length<32)throw new Error(`reader object has a truncated Mach-O 64 header: ${path}`);
    const cpu=raw.readUInt32LE(4);
    const fileType=raw.readUInt32LE(12);
    if(fileType!==1)throw new Error(`reader object must be a thin Mach-O 64 MH_OBJECT: ${path} (filetype=${fileType})`);
    const arch=cpu===0x0100000c?"arm64":cpu===0x01000007?"x86_64":null;
    if(!arch)throw new Error(`reader object has unsupported Mach-O CPU type 0x${cpu.toString(16)}: ${path}`);
    const commandCount=raw.readUInt32LE(16),commandBytes=raw.readUInt32LE(20);
    if(32+commandBytes>raw.length)throw new Error(`reader object Mach-O load commands exceed file bounds: ${path}`);
    let commandOffset=32;
    for(let index=0;index<commandCount;index++){
      if(commandOffset+8>32+commandBytes)throw new Error(`reader object Mach-O load command header exceeds declared commands: ${path}`);
      const commandSize=raw.readUInt32LE(commandOffset+4);
      if(commandSize<8||commandOffset+commandSize>32+commandBytes)throw new Error(`reader object Mach-O load command size is invalid: ${path}`);
      commandOffset+=commandSize;
    }
    if(commandOffset!==32+commandBytes||raw.readUInt32LE(28)!==0)throw new Error(`reader object Mach-O 64 header/load-command layout is invalid: ${path}`);
    actual={format:"macho",arch};
  }else if(raw.length>=4&&raw[0]===0x7f&&raw[1]===0x45&&raw[2]===0x4c&&raw[3]===0x46){
    if(raw.length<64)throw new Error(`reader object has a truncated ELF64 header: ${path}`);
    if(raw[4]!==2||raw[6]!==1)throw new Error(`reader object must be ELF64 version 1: ${path}`);
    if(raw[5]!==1&&raw[5]!==2)throw new Error(`reader object has invalid ELF byte order: ${path}`);
    const little=raw[5]===1;
    const type=little?raw.readUInt16LE(16):raw.readUInt16BE(16);
    const machine=little?raw.readUInt16LE(18):raw.readUInt16BE(18);
    const version=little?raw.readUInt32LE(20):raw.readUInt32BE(20);
    const sectionOffset=Number(little?raw.readBigUInt64LE(40):raw.readBigUInt64BE(40));
    const headerSize=little?raw.readUInt16LE(52):raw.readUInt16BE(52);
    const sectionEntrySize=little?raw.readUInt16LE(58):raw.readUInt16BE(58);
    const sectionCount=little?raw.readUInt16LE(60):raw.readUInt16BE(60);
    if(type!==1)throw new Error(`reader object must be ELF64 ET_REL: ${path} (type=${type})`);
    if(version!==1||headerSize!==64)throw new Error(`reader object ELF64 header version/size is invalid: ${path}`);
    if(sectionCount>0&&(sectionEntrySize<64||!Number.isSafeInteger(sectionOffset)||sectionOffset+sectionEntrySize*sectionCount>raw.length))throw new Error(`reader object ELF64 section table exceeds file bounds: ${path}`);
    const arch=machine===183?"arm64":machine===62?"x86_64":machine===243?"riscv64":null;
    if(!arch)throw new Error(`reader object has unsupported ELF machine ${machine}: ${path}`);
    actual={format:"elf",arch};
  }else{
    throw new Error(`reader object is not a thin Mach-O 64 MH_OBJECT or ELF64 ET_REL: ${path}`);
  }
  if(actual.format!==expected.format||actual.arch!==expected.arch){
    throw new Error(`reader object target mismatch: target=${target} expected=${expected.format}/${expected.arch} actual=${actual.format}/${actual.arch}`);
  }
  return{raw,hash:artifact.hash,...actual};
}

function fsyncFile(path){
  const fd=openSync(path,"r");
  try{fsyncSync(fd)}finally{closeSync(fd)}
}

function fsyncDirectory(path){
  const fd=openSync(path,"r");
  try{fsyncSync(fd)}finally{closeSync(fd)}
}

function removeOwnedDirectory(path){
  if(!path)return;
  try{
    const stat=lstatSync(path);
    if(stat.isSymbolicLink()||!stat.isDirectory())rmSync(path,{force:true});
    else{
      chmodSync(path,0o700);
      rmSync(path,{recursive:true,force:true});
    }
  }catch(error){
    if(error?.code!=="ENOENT")throw error;
  }
}

function preflightReplaceTarget(path,label){
  let stat;
  try{stat=lstatSync(path)}catch(error){
    if(error?.code==="ENOENT")return false;
    throw error;
  }
  if(stat.isSymbolicLink()||!stat.isFile())throw new Error(`${label} replacement target must be a regular non-symlink file: ${path}`);
  return true;
}

function uniqueSibling(path,generationId,suffix){
  return join(dirname(path),`.${basename(path)}.${generationId}.${suffix}`);
}

function stageReplacementCopy(source,target,generationId){
  const limit=source.endsWith(".facts")?ROUNDTRIP_MAX_FACTS_BYTES:source.endsWith(".report.txt")?ROUNDTRIP_MAX_REPORT_BYTES:source.endsWith("summary.json")?ROUNDTRIP_MAX_SUMMARY_BYTES:ROUNDTRIP_MAX_OBJECT_BYTES;
  const sourceEvidence=readStableRegularArtifact(source,`generation artifact ${basename(source)}`,limit);
  const next=uniqueSibling(target,generationId,"next");
  copyFileSync(source,next,fsConstants.COPYFILE_EXCL);
  const nextEvidence=readStableRegularArtifact(next,`staged replacement for ${basename(target)}`,limit);
  if(nextEvidence.hash!==sourceEvidence.hash)throw new Error(`staged replacement hash mismatch for ${target}: source=${sourceEvidence.hash} next=${nextEvidence.hash}`);
  fsyncFile(next);
  return next;
}

function copyGenerationArtifact(source,target,label,maxBytes){
  const sourceEvidence=readStableRegularArtifact(source,label,maxBytes);
  copyFileSync(source,target,fsConstants.COPYFILE_EXCL);
  const targetEvidence=readStableRegularArtifact(target,`staged ${label}`,maxBytes);
  if(targetEvidence.hash!==sourceEvidence.hash){
    throw new Error(`generation staging copy hash mismatch for ${target}: source=${sourceEvidence.hash} staged=${targetEvidence.hash}`);
  }
  fsyncFile(target);
}

function backupTarget(target,generationId){
  if(!preflightReplaceTarget(target,`existing ${basename(target)}`))return null;
  const backup=uniqueSibling(target,generationId,"previous");
  linkSync(target,backup);
  fsyncFile(backup);
  return backup;
}

function rollbackReplacements(replacements,summaryReplacement){
  const errors=[];
  const restore=(entry)=>{
    if(!entry?.installed)return;
    try{
      if(entry.backup)renameSync(entry.backup,entry.target);
      else rmSync(entry.target,{force:true});
      entry.installed=false;
    }catch(error){errors.push(`${entry.target}: ${error instanceof Error?error.message:String(error)}`)}
  };
  restore(summaryReplacement);
  for(let index=replacements.length-1;index>=0;index--)restore(replacements[index]);
  return errors;
}

function removeTransactionFiles(replacements,summaryReplacement){
  for(const entry of [...replacements,summaryReplacement].filter(Boolean)){
    for(const path of [entry.next,entry.backup])if(path)try{rmSync(path,{force:true})}catch{}
  }
}

function generationHashFor(root,source,entrySource,target,driverIdentity,toolIdentity,artifactHashes){
  validateColdDriverIdentity(driverIdentity,"generation cold driver identity");
  validateCurrentToolIdentity(toolIdentity,"generation CSG tool identity");
  return chengCsgGenerationHash(root,source,entrySource,target,driverIdentity,toolIdentity,artifactHashes);
}

function generationIdFor(hash){
  const match=String(hash).match(/^sha256:([0-9a-f]{64})$/);
  if(!match)throw new Error(`invalid CSG generation hash: ${hash}`);
  return `${ROUNDTRIP_GENERATION_PREFIX}${match[1]}`;
}

function exactGenerationPaths(generationDir,source){
  const objectName=generationObjectName(source);
  return{
    facts:join(generationDir,"current.facts"),
    factsLinemap:join(generationDir,"current.facts.linemap"),
    writerReport:join(generationDir,"current.writer.report.txt"),
    readerReport:join(generationDir,"current.reader.report.txt"),
    objectOut:join(generationDir,objectName),
    objectMap:join(generationDir,objectName+".map"),
    summary:join(generationDir,"summary.json"),
    objectName
  };
}

function parseGenerationSummary(path){
  const artifact=readStableRegularArtifact(path,"generation summary",ROUNDTRIP_MAX_SUMMARY_BYTES);
  const text=decodeFatalUtf8(artifact.raw,"generation summary",path);
  if(!text.endsWith("\n"))throw new Error(`generation summary must end with LF: ${path}`);
  let summary;
  try{summary=JSON.parse(text)}catch(error){throw new Error(`generation summary is invalid JSON: ${path} (${error instanceof Error?error.message:String(error)})`)}
  if(!summary||typeof summary!=="object"||Array.isArray(summary))throw new Error(`generation summary must be a JSON object: ${path}`);
  if(JSON.stringify(summary,null,2)+"\n"!==text)throw new Error(`generation summary is not canonical JSON: ${path}`);
  return{summary,raw:artifact.raw};
}

function sameArtifactHashes(left,right){
  return["facts","writerReport","readerReport","object"].every((key)=>left?.[key]===right?.[key]&&/^sha256:[0-9a-f]{64}$/.test(String(left?.[key]||"")));
}

function sameArtifactHashesWithMaps(left,right){
  return sameArtifactHashes(left,right)&&["factsLinemap","objectMap"].every((key)=>left?.[key]===right?.[key]&&/^sha256:[0-9a-f]{64}$/.test(String(left?.[key]||"")));
}

function validateOwnedGenerationDirectory(generationDir,expected=null){
  requireCanonicalDirectory(generationDir,"CSG immutable generation");
  const parsed=parseGenerationSummary(join(generationDir,"summary.json"));
  const summary=parsed.summary;
  orderedRecord(summary,ROUNDTRIP_SUMMARY_KEYS,"generation summary");
  if(summary.schema!==ROUNDTRIP_SUMMARY_SCHEMA||summary.producer!==ROUNDTRIP_PRODUCER||summary.commitProtocol!==ROUNDTRIP_COMMIT_PROTOCOL||summary.generationContractSha256!==ROUNDTRIP_GENERATION_CONTRACT_SHA256){
    throw new Error(`generation is not owned by ${ROUNDTRIP_PRODUCER}: ${generationDir}`);
  }
  canonicalArtifactHashes(summary.artifactHashes,"generation summary artifact hashes");
  orderedRecord(summary.driverIdentity,COLD_DRIVER_IDENTITY_KEYS,"generation summary cold driver identity");
  orderedRecord(summary.toolIdentity,CSG_TOOL_IDENTITY_KEYS,"generation summary CSG tool identity");
  orderedRecord(summary.current,ROUNDTRIP_CURRENT_KEYS,"generation summary current projection");
  orderedRecord(summary.totals,ROUNDTRIP_TOTAL_KEYS,"generation summary totals");
  requireChengSource(summary.source,summary.root,"generation query source");
  requireChengSource(summary.entrySource,summary.root,"generation entry source");
  const paths=exactGenerationPaths(generationDir,summary.entrySource);
  const expectedNames=["current.facts","current.facts.linemap","current.reader.report.txt","current.writer.report.txt",paths.objectName,paths.objectName+".map","summary.json"].sort();
  const actualNames=readdirSync(generationDir).sort();
  if(JSON.stringify(actualNames)!==JSON.stringify(expectedNames))throw new Error(`owned generation has unexpected directory entries: ${generationDir}`);
  validateColdDriverIdentity(summary.driverIdentity,"generation summary cold driver identity");
  validateCurrentToolIdentity(summary.toolIdentity,"generation summary CSG tool identity");
  const currentDriverIdentity=resolveColdCsgDriver().identity;
  if(JSON.stringify(summary.driverIdentity)!==JSON.stringify(currentDriverIdentity))throw new Error(`owned generation cold driver identity is stale and cannot be reused: ${generationDir}`);
  const currentToolIdentity=validateCurrentToolIdentity(ROUNDTRIP_LOADED_TOOL_IDENTITY,"loaded generation CSG tool identity");
  if(JSON.stringify(summary.toolIdentity)!==JSON.stringify(currentToolIdentity))throw new Error(`owned generation CSG tool identity is stale and cannot be reused: ${generationDir}`);
  if(summary.generationId!==basename(generationDir)||summary.generationHash!==generationHashFor(summary.root,summary.source,summary.entrySource,summary.target,summary.driverIdentity,summary.toolIdentity,summary.artifactHashes)||generationIdFor(summary.generationHash)!==summary.generationId){
    throw new Error(`owned generation content address mismatch: ${generationDir}`);
  }
  if(summary.facts!==paths.facts||summary.writerReport!==paths.writerReport||summary.readerReport!==paths.readerReport||summary.objectOut!==paths.objectOut){
    throw new Error(`owned generation declares paths outside its directory: ${generationDir}`);
  }
  const outDir=dirname(dirname(generationDir));
  const expectedCurrent={facts:join(outDir,"current.facts"),writerReport:join(outDir,"current.writer.report.txt"),readerReport:join(outDir,"current.reader.report.txt"),objectOut:join(outDir,paths.objectName)};
  if(JSON.stringify(summary.current)!==JSON.stringify(expectedCurrent))throw new Error(`owned generation current projection paths are invalid: ${generationDir}`);
  if(expected){
    if(summary.root!==expected.root||summary.source!==expected.source||summary.entrySource!==expected.entrySource||summary.target!==expected.target||JSON.stringify(summary.driverIdentity)!==JSON.stringify(expected.driverIdentity)||JSON.stringify(summary.toolIdentity)!==JSON.stringify(expected.toolIdentity)||summary.generationId!==expected.generationId||summary.generationHash!==expected.generationHash||!sameArtifactHashesWithMaps(summary.artifactHashes,expected.artifactHashes)){
      throw new Error(`existing content-addressed generation does not match requested artifacts: ${generationDir}`);
    }
  }
  const factsEvidence=validateChengColdFacts(paths.facts,summary.target);
  const writerEvidence=parseAndValidateReport(paths.writerReport,"writer report",factsEvidence.counts);
  const readerEvidence=parseAndValidateReport(paths.readerReport,"reader report",factsEvidence.counts);
  if(writerEvidence.values.get("source")!==summary.entrySource)throw new Error(`owned generation writer entry source mismatch: ${generationDir}`);
  const sourceFileCountText=writerEvidence.values.get("compile_input_source_file_count");
  if(!/^[1-9][0-9]*$/.test(sourceFileCountText||"")||!Number.isSafeInteger(Number(sourceFileCountText)))throw new Error(`owned generation writer closure count is invalid: ${generationDir}`);
  const sourceFileCount=Number(sourceFileCountText);
  const objectEvidence=validateObjectArtifact(paths.objectOut,summary.target,factsEvidence.objectFormat);
  const hashes={facts:factsEvidence.hash,writerReport:writerEvidence.hash,readerReport:readerEvidence.hash,object:objectEvidence.hash};
  const factsLinemapEvidence=validateChengColdLineMap(paths.factsLinemap,"generation facts line-map");
  const objectMapEvidence=validateChengColdLineMap(paths.objectMap,"generation object line-map");
  hashes.factsLinemap=factsLinemapEvidence.hash;
  hashes.objectMap=objectMapEvidence.hash;
  if(factsLinemapEvidence.hash!==objectMapEvidence.hash)throw new Error(`owned generation line-map diverges between facts sidecar and object map: ${generationDir}`);
  if(!sameArtifactHashesWithMaps(hashes,summary.artifactHashes))throw new Error(`owned generation artifact hash mismatch: ${generationDir}`);
  const expectedTotals={sourceFiles:sourceFileCount,functions:factsEvidence.counts.functions,words:factsEvidence.counts.words,relocs:factsEvidence.counts.relocs,data:factsEvidence.counts.data,dataRelocs:factsEvidence.counts.dataRelocs,callEdges:factsEvidence.counts.callEdges,symbols:factsEvidence.counts.functions+factsEvidence.counts.data,calls:factsEvidence.counts.relocs+factsEvidence.counts.dataRelocs+factsEvidence.counts.callEdges,records:factsEvidence.counts.records,bytes:factsEvidence.raw.length};
  if(JSON.stringify(summary.totals)!==JSON.stringify(expectedTotals)||summary.factsRoot!==factsEvidence.hash||summary.byteSize!==factsEvidence.raw.length)throw new Error(`owned generation summary totals mismatch: ${generationDir}`);
  if(summary.writerExitCode!==0||summary.readerExitCode!==0||summary.runtimeClosure!==null)throw new Error(`owned generation summary process status is invalid: ${generationDir}`);
  const immutablePaths=[paths.facts,paths.factsLinemap,paths.writerReport,paths.readerReport,paths.objectOut,paths.objectMap,paths.summary];
  for(const path of immutablePaths){
    const stat=lstatSync(path);
    if(stat.isSymbolicLink()||!stat.isFile()||(stat.mode&0o222)!==0)throw new Error(`owned generation artifact must be immutable regular file: ${path}`);
  }
  return{summary,paths,raw:parsed.raw};
}

function readCurrentCanonicalSummary(root){
  const summaryPath=chengColdSummaryPath(root);
  if(!existsSync(summaryPath))return null;
  const parsed=parseGenerationSummary(summaryPath);
  const summary=parsed.summary;
  orderedRecord(summary,ROUNDTRIP_SUMMARY_KEYS,"canonical summary");
  if(summary.root!==root)throw new Error(`canonical summary root mismatch: expected=${root} actual=${summary.root}`);
  if(typeof summary.facts!=="string"||resolve(summary.facts)!==summary.facts)throw new Error(`canonical summary facts path must be absolute: ${summaryPath}`);
  assertInsideProject(summary.facts,root);
  const generation=validateOwnedGenerationDirectory(dirname(summary.facts));
  if(!generation.raw.equals(parsed.raw))throw new Error(`canonical summary does not exactly identify its immutable generation: ${summaryPath}`);
  return generation.summary;
}

function removeProvenGenerationDirectory(generationDir,paths){
  const tombstone=join(dirname(generationDir),`.cheng-csg-gc-${randomUUID()}`);
  renameSync(generationDir,tombstone);
  const names=readdirSync(tombstone).sort();
  const expectedNames=["current.facts","current.facts.linemap","current.reader.report.txt","current.writer.report.txt",paths.objectName,paths.objectName+".map","summary.json"].sort();
  if(JSON.stringify(names)!==JSON.stringify(expectedNames))throw new Error(`generation changed before GC deletion: ${generationDir}`);
  let deletionStarted=false;
  try{
    requireCanonicalDirectory(tombstone,"CSG generation GC tombstone");
    for(const name of names){
      const path=join(tombstone,name);
      const stat=lstatSync(path);
      if(stat.isSymbolicLink()||!stat.isFile())throw new Error(`generation changed before GC deletion: ${path}`);
    }
    deletionStarted=true;
    for(const name of names)unlinkSync(join(tombstone,name));
    rmdirSync(tombstone);
  }catch(error){
    if(!deletionStarted&&existsSync(tombstone)&&!existsSync(generationDir))try{renameSync(tombstone,generationDir)}catch{}
    throw error;
  }
}

function garbageCollectOwnedGenerations(generationRoot,retainedIds){
  const verified=[];
  for(const name of readdirSync(generationRoot)){
    if(!/^sha256-[0-9a-f]{64}$/.test(name))continue;
    const generationDir=join(generationRoot,name);
    const evidence=validateOwnedGenerationDirectory(generationDir);
    verified.push({name,generationDir,...evidence});
  }
  verified.sort((left,right)=>left.name.localeCompare(right.name));
  const keep=new Set([...retainedIds].filter((name)=>/^sha256-[0-9a-f]{64}$/.test(String(name))));
  for(const entry of verified)if(keep.size<ROUNDTRIP_GENERATIONS_TO_KEEP)keep.add(entry.name);
  for(const entry of verified)if(!keep.has(entry.name))removeProvenGenerationDirectory(entry.generationDir,entry.paths);
  fsyncDirectory(generationRoot);
}

var initChengCsgRoundtripModule=defineModuleInitializer(()=>{
  initChengToolkitModule();
  chengCsgRoundtripInputSchema=zodSchema.strictObject({
    action:zodSchema.enum(["check"]).optional().describe("Emit Cheng cold CSG facts and verify cold reader consumption. Defaults to check."),
    root:zodSchema.string().optional().describe("Explicit Cheng project root for this call. Must contain cheng-package.toml."),
    source:zodSchema.string().describe("Project-relative or absolute .cheng file whose facts will be queried."),
    entrySource:zodSchema.string().describe("Project-relative or absolute package entry .cheng file used to emit the real reachable closure."),
    outDir:zodSchema.string().optional().describe("Project-relative or absolute output directory. Defaults to conversion-reports/cheng-csg."),
    target:zodSchema.string().min(1).max(128).regex(/^[A-Za-z0-9_.+-]+$/).optional().describe("Target triple. Defaults to arm64-apple-darwin.")
  });
  ChengCsgRoundtripTool=createChengTextTool({
    name:"cheng_csg_roundtrip",
    requiresChengProjectRoot:true,
    searchHint:"emit Cheng cold CSG facts and verify cold reader stability",
    inputSchema:chengCsgRoundtripInputSchema,
    description:"Emit the real package-entry Cheng closure, bind it to an explicit query source, then verify cold-reader consumption and commit the project-local CSG summary.",
    prompt:"Run after Cheng edits with the exact package entrySource and the source file to query before cheng_csg_query/cheng_evidence.",
    toAutoClassifierInput:(input)=>`csg_roundtrip:${input.action}`,
    async execute(input){
      if(!input.source)throw new Error("source is required for Cheng project CSG roundtrip");
      if(!input.entrySource)throw new Error("entrySource is required for Cheng project CSG roundtrip");
      const root=csgProjectRoot({root:input.root,file:input.source});
      const source=resolveProjectPath(input.source,root);
      const entrySource=resolveProjectPath(input.entrySource,root);
      requireChengSource(source,root,"query source");
      requireChengSource(entrySource,root,"package entry source");
      const target=input.target||"arm64-apple-darwin";
      expectedObjectContract(target);
      const outDir=input.outDir?resolveProjectPath(input.outDir,root):chengColdCsgDir(root);
      assertInsideProject(outDir,root);
      ensureCanonicalDirectoryUnderRoot(outDir,root,"CSG output directory");
      const canonicalDir=chengColdCsgDir(root);
      assertInsideProject(canonicalDir,root);
      ensureCanonicalDirectoryUnderRoot(canonicalDir,root,"canonical CSG directory");
      const canonicalSummary=chengColdSummaryPath(root);
      assertInsideProject(canonicalSummary,root);
      const objectName=generationObjectName(entrySource);
      const currentFacts=join(outDir,"current.facts");
      const currentFactsLinemap=join(outDir,"current.facts.linemap");
      const currentWriterReport=join(outDir,"current.writer.report.txt");
      const currentReaderReport=join(outDir,"current.reader.report.txt");
      const currentObject=join(outDir,objectName);
      const currentObjectMap=join(outDir,objectName+".map");
      const driverResult=resolveColdCsgDriver();
      const driver=driverResult.driver;
      const driverIdentity=driverResult.identity;
      const toolIdentity=validateCurrentToolIdentity(ROUNDTRIP_LOADED_TOOL_IDENTITY,"loaded roundtrip CSG tool identity");
      preflightReplaceTarget(canonicalSummary,"existing canonical summary");
      let before=null;
      const transactionId=`${Date.now().toString(36)}-${randomUUID()}`;
      const lockDir=join(canonicalDir,".cheng-csg-roundtrip.lock");
      let generationId=null,generationHash=null,artifactHashes=null,summary=null,summaryBytes=null,reusedGeneration=false;
      let staging=null,generationStaging=null,generationDir=null,generationInstalled=false,committed=false,lockLease=null,rollbackFailed=false;
      let writer=null,reader=null;
      const replacements=[];
      let summaryReplacement=null;
      try{
        lockLease=acquireRoundtripLock(lockDir,transactionId);
        before=readCurrentCanonicalSummary(root);
        staging=mkdtempSync(join(outDir,".cheng-csg-stage-"));
        requireCanonicalDirectory(staging,"roundtrip staging directory");
        const stagedFacts=join(staging,"current.facts");
        const stagedWriterReport=join(staging,"current.writer.report.txt");
        const stagedReaderReport=join(staging,"current.reader.report.txt");
        const stagedObject=join(staging,objectName);

        try{
          writer=await runChengDriver(driver,["emit-cold-csg",`--root:${root}`,`--in:${entrySource}`,`--out:${stagedFacts}`,`--target:${target}`,`--report-out:${stagedWriterReport}`],{cwd:root,maxBuffer:ROUNDTRIP_MAX_OUTPUT_BYTES,timeoutMs:ROUNDTRIP_WRITER_TIMEOUT_MS});
        }finally{
          revalidateRoundtripIdentity(driverIdentity,toolIdentity,"post-writer");
        }
        if(!processOk(writer))throw new Error(`emit-cold-csg process failed: exit=${writer.exitCode} missing=${Boolean(writer.missingDriver)} timeout=${Boolean(writer.timedOut)} overflow=${Boolean(writer.overflow)} stderr=${takeTrailingText(writer.stderr,1000)}`);
        const factsEvidence=validateChengColdFacts(stagedFacts,target);
        const factsRaw=factsEvidence.raw;
        const writerEvidence=parseAndValidateReport(stagedWriterReport,"writer report",factsEvidence.counts);
        if(writerEvidence.values.get("source")!==entrySource)throw new Error(`writer report source mismatch: expected=${entrySource} actual=${writerEvidence.values.get("source")||""}`);
        const sourceFileCountText=writerEvidence.values.get("compile_input_source_file_count");
        if(!/^[1-9][0-9]*$/.test(sourceFileCountText||"")||!Number.isSafeInteger(Number(sourceFileCountText)))throw new Error(`writer report compile_input_source_file_count must be a canonical positive integer: ${stagedWriterReport}`);
        const sourceFileCount=Number(sourceFileCountText);

        try{
          reader=await runChengDriver(driver,["system-link-exec",`--csg-in:${stagedFacts}`,"--emit:obj",`--target:${target}`,`--out:${stagedObject}`,`--report-out:${stagedReaderReport}`],{cwd:root,maxBuffer:ROUNDTRIP_MAX_OUTPUT_BYTES,timeoutMs:ROUNDTRIP_READER_TIMEOUT_MS});
        }finally{
          revalidateRoundtripIdentity(driverIdentity,toolIdentity,"post-reader");
        }
        if(!processOk(reader))throw new Error(`system-link-exec process failed: exit=${reader.exitCode} missing=${Boolean(reader.missingDriver)} timeout=${Boolean(reader.timedOut)} overflow=${Boolean(reader.overflow)} stderr=${takeTrailingText(reader.stderr,1000)}`);
        const factsAfterReader=validateChengColdFacts(stagedFacts,target);
        if(factsAfterReader.hash!==factsEvidence.hash)throw new Error(`CSG facts changed while the reader consumed them: before=${factsEvidence.hash} after=${factsAfterReader.hash}`);
        const writerAfterReader=parseAndValidateReport(stagedWriterReport,"writer report",factsEvidence.counts);
        if(writerAfterReader.hash!==writerEvidence.hash)throw new Error(`writer report changed after validation: before=${writerEvidence.hash} after=${writerAfterReader.hash}`);
        const readerEvidence=parseAndValidateReport(stagedReaderReport,"reader report",factsEvidence.counts);
        const objectEvidence=validateObjectArtifact(stagedObject,target,factsEvidence.objectFormat);
        const stagedFactsLinemap=stagedFacts+".linemap";
        const stagedObjectMap=stagedObject+".map";
        const factsLinemapEvidence=validateChengColdLineMap(stagedFactsLinemap,"facts line-map sidecar");
        const objectMapEvidence=validateChengColdLineMap(stagedObjectMap,"reader object line-map");
        if(factsLinemapEvidence.hash!==objectMapEvidence.hash)throw new Error(`line-map diverges between facts sidecar and reader object map: ${stagedFactsLinemap} vs ${stagedObjectMap}`);

        artifactHashes={
          facts:factsEvidence.hash,
          factsLinemap:factsLinemapEvidence.hash,
          writerReport:writerEvidence.hash,
          readerReport:readerEvidence.hash,
          object:objectEvidence.hash,
          objectMap:objectMapEvidence.hash
        };
        generationHash=generationHashFor(root,source,entrySource,target,driverIdentity,toolIdentity,artifactHashes);
        generationId=generationIdFor(generationHash);
        const generationRoot=join(outDir,".cheng-csg-generations");
        ensureCanonicalDirectoryUnderRoot(generationRoot,root,"CSG generation directory");
        generationDir=join(generationRoot,generationId);
        const generationPaths=exactGenerationPaths(generationDir,entrySource);
        const facts=generationPaths.facts;
        const factsLinemap=generationPaths.factsLinemap;
        const writerReport=generationPaths.writerReport;
        const readerReport=generationPaths.readerReport;
        const objectOut=generationPaths.objectOut;
        const objectMap=generationPaths.objectMap;
        const factsRoot=artifactHashes.facts;
        const byteSize=factsRaw.length;
        summary={
          schema:ROUNDTRIP_SUMMARY_SCHEMA,
          producer:ROUNDTRIP_PRODUCER,
          root,
          source,
          entrySource,
          target,
          driverIdentity,
          toolIdentity,
          generationId,
          generationHash,
          generationContractSha256:ROUNDTRIP_GENERATION_CONTRACT_SHA256,
          artifactHashes,
          commitProtocol:ROUNDTRIP_COMMIT_PROTOCOL,
          facts,
          factsRoot,
          byteSize,
          totals:{
            sourceFiles:sourceFileCount,
            functions:factsEvidence.counts.functions,
            words:factsEvidence.counts.words,
            relocs:factsEvidence.counts.relocs,
            data:factsEvidence.counts.data,
            dataRelocs:factsEvidence.counts.dataRelocs,
            callEdges:factsEvidence.counts.callEdges,
            symbols:factsEvidence.counts.functions+factsEvidence.counts.data,
            calls:factsEvidence.counts.relocs+factsEvidence.counts.dataRelocs+factsEvidence.counts.callEdges,
            records:factsEvidence.counts.records,
            bytes:byteSize
          },
          runtimeClosure:null,
          writerReport,
          readerReport,
          objectOut,
          current:{facts:currentFacts,writerReport:currentWriterReport,readerReport:currentReaderReport,objectOut:currentObject},
          writerExitCode:writer.exitCode,
          readerExitCode:reader.exitCode
        };
        summaryBytes=Buffer.from(JSON.stringify(summary,null,2)+"\n","utf8");
        if(existsSync(generationDir)){
          const existing=validateOwnedGenerationDirectory(generationDir,{root,source,entrySource,target,driverIdentity,toolIdentity,generationId,generationHash,artifactHashes});
          summary=existing.summary;
          summaryBytes=Buffer.from(JSON.stringify(summary,null,2)+"\n","utf8");
          reusedGeneration=true;
          removeOwnedDirectory(staging);
          staging=null;
        }else{
          generationStaging=mkdtempSync(join(generationRoot,".cheng-csg-generation-stage-"));
          requireCanonicalDirectory(generationStaging,"roundtrip generation staging directory");
          const cleanPaths=exactGenerationPaths(generationStaging,entrySource);
          for(const [sourcePath,targetPath,label,maxBytes] of [
            [stagedFacts,cleanPaths.facts,"CSG facts",ROUNDTRIP_MAX_FACTS_BYTES],
            [stagedFactsLinemap,cleanPaths.factsLinemap,"facts line-map sidecar",ROUNDTRIP_MAX_REPORT_BYTES],
            [stagedWriterReport,cleanPaths.writerReport,"writer report",ROUNDTRIP_MAX_REPORT_BYTES],
            [stagedReaderReport,cleanPaths.readerReport,"reader report",ROUNDTRIP_MAX_REPORT_BYTES],
            [stagedObject,cleanPaths.objectOut,"reader object",ROUNDTRIP_MAX_OBJECT_BYTES],
            [stagedObjectMap,cleanPaths.objectMap,"reader object line-map",ROUNDTRIP_MAX_REPORT_BYTES]
          ])copyGenerationArtifact(sourcePath,targetPath,label,maxBytes);
          writeFileSync(cleanPaths.summary,summaryBytes,{flag:"wx",mode:0o600});
          for(const [path,label,maxBytes] of [[cleanPaths.facts,"CSG facts",ROUNDTRIP_MAX_FACTS_BYTES],[cleanPaths.factsLinemap,"facts line-map sidecar",ROUNDTRIP_MAX_REPORT_BYTES],[cleanPaths.writerReport,"writer report",ROUNDTRIP_MAX_REPORT_BYTES],[cleanPaths.readerReport,"reader report",ROUNDTRIP_MAX_REPORT_BYTES],[cleanPaths.objectOut,"reader object",ROUNDTRIP_MAX_OBJECT_BYTES],[cleanPaths.objectMap,"reader object line-map",ROUNDTRIP_MAX_REPORT_BYTES],[cleanPaths.summary,"generation summary",ROUNDTRIP_MAX_SUMMARY_BYTES]]){
            requireFreshRegularArtifact(path,label,maxBytes);
            chmodSync(path,0o444);
            fsyncFile(path);
          }
          fsyncDirectory(generationStaging);
          renameSync(generationStaging,generationDir);
          generationStaging=null;
          generationInstalled=true;
          fsyncDirectory(generationRoot);
          validateOwnedGenerationDirectory(generationDir,{root,source,entrySource,target,driverIdentity,toolIdentity,generationId,generationHash,artifactHashes});
          removeOwnedDirectory(staging);
          staging=null;
        }

        garbageCollectOwnedGenerations(generationRoot,new Set([generationId,before?.generationId]));

        for(const [sourcePath,targetPath] of [[facts,currentFacts],[factsLinemap,currentFactsLinemap],[writerReport,currentWriterReport],[readerReport,currentReaderReport],[objectOut,currentObject],[objectMap,currentObjectMap]]){
          const entry={target:targetPath,next:null,backup:null,installed:false};
          replacements.push(entry);
          entry.next=stageReplacementCopy(sourcePath,targetPath,transactionId);
          entry.backup=backupTarget(targetPath,transactionId);
        }
        const summaryNext=uniqueSibling(canonicalSummary,transactionId,"next");
        summaryReplacement={target:canonicalSummary,next:summaryNext,backup:null,installed:false};
        writeFileSync(summaryNext,summaryBytes,{flag:"wx",mode:0o600});
        requireFreshRegularArtifact(summaryNext,"canonical summary replacement",ROUNDTRIP_MAX_SUMMARY_BYTES);
        fsyncFile(summaryNext);
        summaryReplacement.backup=backupTarget(canonicalSummary,transactionId);
        revalidateRoundtripIdentity(driverIdentity,toolIdentity,"pre-commit");

        for(const entry of replacements){renameSync(entry.next,entry.target);entry.installed=true}
        fsyncDirectory(outDir);
        renameSync(summaryReplacement.next,summaryReplacement.target);
        summaryReplacement.installed=true;
        fsyncDirectory(canonicalDir);
        committed=true;
        return jsonResult({
          success:true,
          root,
          source,
          entrySource,
          driver,
          driverIdentity,
          toolIdentity,
          generationId,
          generationHash,
          reusedGeneration,
          artifactHashes,
          facts,
          currentFacts,
          writerExitCode:writer.exitCode,
          readerExitCode:reader.exitCode,
          writerProcessOk:true,
          readerProcessOk:true,
          factsRootBefore:before?.factsRoot,
          factsRootAfter:factsRoot,
          stable:Boolean(before&&before.factsRoot===factsRoot),
          byteSize,
          summary,
          writerStderr:takeTrailingText(writer.stderr,1000),
          readerStderr:takeTrailingText(reader.stderr,1000)
        });
      }catch(error){
        const rollbackErrors=rollbackReplacements(replacements,summaryReplacement);
        if(rollbackErrors.length>0){
          rollbackFailed=true;
          throw new Error(`${error instanceof Error?error.message:String(error)}; transaction rollback failed and recovery files/lock were retained: ${rollbackErrors.join("; ")}`);
        }
        throw error;
      }finally{
        if(!rollbackFailed){
          removeTransactionFiles(replacements,summaryReplacement);
          if(staging)try{removeOwnedDirectory(staging)}catch{}
          if(generationStaging)try{removeOwnedDirectory(generationStaging)}catch{}
          if(generationInstalled&&!committed&&generationDir)try{removeOwnedDirectory(generationDir)}catch{}
          if(lockLease)releaseRoundtripLock(lockLease);
        }
      }
    }
  });
});

export {ChengCsgRoundtripTool,initChengCsgRoundtripModule,acquireRoundtripLock};
