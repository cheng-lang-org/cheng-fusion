// @ts-nocheck
import {accessSync,chmodSync,closeSync,constants,fstatSync,fsyncSync,linkSync,lstatSync,mkdirSync,mkdtempSync,openSync,readFileSync,readSync,readdirSync,rmSync,unlinkSync,writeFileSync,writeSync} from "node:fs";
import {createHash,randomUUID} from "node:crypto";
import {spawnSync} from "node:child_process";
import {tmpdir} from "node:os";
import {dirname,isAbsolute,join,relative,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {b as defineModuleInitializer} from "./runtime.ts";
import {CHENG_CANARY,CHENG_STAGE3_DRIVER,createChengTextTool,jsonResult,profileDriverForReport,profileResult,assertProfileReportToolSchema,resolveChengProjectRoot,resolveProjectPath,assertInsideProject,runChengDriver,takeTrailingText,initChengToolkitModule,zodSchema} from "./cheng_toolkit_m9000.ts";

var chengProfileReportInputSchema,ChengProfileReportTool;
const PROFILE_UTF8_DECODER=new TextDecoder("utf-8",{fatal:true});
const PROFILE_ARTIFACT_MAX_BYTES=1<<30;
const PROFILE_RAW_SCHEMA="cheng_profile_raw";
const PROFILE_REPORT_SCHEMA="cheng_profile";
const PROFILE_PROBE_SCHEMA="cheng_profile_probe";
const PROFILE_DRIVER_RECEIPT_SCHEMA="cheng_profile_current_source_driver";
const PROFILE_RAW_RECEIPT_SCHEMA="cheng_profile_raw_receipt";
const PROFILE_GUARD_RECEIPT_SCHEMA="cheng_profile_userspace_process_tree_guard";
const PROFILE_RSS_LIMIT_BYTES=1073741824;
const PROFILE_GUARD_STARTUP_TIMEOUT_SECONDS=5;
const PROFILE_GUARD_CLEANUP_TIMEOUT_SECONDS=10;
const PROFILE_IMPLEMENTATION_SCHEMA="cheng_profile_report.current_source";
const PROFILE_IMPLEMENTATION_SOURCE_PATH=fileURLToPath(import.meta.url);
const PROFILE_IMPLEMENTATION_SOURCE_SHA256=createHash("sha256").update(readFileSync(PROFILE_IMPLEMENTATION_SOURCE_PATH)).digest("hex");
const PROFILE_PHASE_NAMES=[
  "system_link_plan",
  "compiler_csg",
  "lowering_plan",
  "primary_object_plan",
  "direct_object_emit",
  "provider_objects",
  "native_link",
  "line_map"
];
const PROFILE_I64_MAX=9223372036854775807n;

function nowMs(){return Number(process.hrtime.bigint()/1000000n)}

function bindProfileImplementation(report){
  return {
    ...report,
    implementationSchema:PROFILE_IMPLEMENTATION_SCHEMA,
    implementationSourcePath:PROFILE_IMPLEMENTATION_SOURCE_PATH,
    implementationSourceSha256:PROFILE_IMPLEMENTATION_SOURCE_SHA256
  };
}

function resolveProfilePath(value,root){
  const path=isAbsolute(value)?value:join(root,value);
  assertInsideProject(path,root);
  return path;
}

function processOk(run){
  return !run.missingDriver&&!run.timedOut&&!run.overflow&&Number.isInteger(run.exitCode);
}

function pathAlreadyExists(path){
  try{lstatSync(path);return true}catch(error){if(error?.code==="ENOENT")return false;throw error}
}

function assertFreshOutput(path,label){
  if(pathAlreadyExists(path))throw new Error(`${label} already exists; refusing to reuse a stale output: ${path}`);
}

function executableMaterialized(path){
  try{
    const stat=lstatSync(path);
    if(stat.isSymbolicLink()||!stat.isFile()||stat.size===0)return false;
    accessSync(path,constants.X_OK);
    return true;
  }catch{return false}
}

function profileOutputEvidence(path,maxBytes){
  let stat;
  try{
    stat=lstatSync(path,{bigint:true});
  }catch(error){
    if(error?.code!=="ENOENT")throw error;
    return {materialized:false,bytes:null,overflow:false,invalidUtf8:false,text:"",buffer:Buffer.alloc(0)};
  }
  const materialized=!stat.isSymbolicLink()&&stat.isFile()&&stat.size>0n;
  const overflow=materialized&&stat.size>BigInt(maxBytes);
  const byteCount=stat.size<=BigInt(Number.MAX_SAFE_INTEGER)?Number(stat.size):null;
  let text="";
  let buffer=Buffer.alloc(0);
  let invalidUtf8=false;
  if(materialized&&!overflow){
    let fd=null;
    try{
      fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
      const opened=fstatSync(fd,{bigint:true});
      if(stableProfileStatKey(stat)!==stableProfileStatKey(opened))throw new Error(`profile output changed while it was opened: ${path}`);
      const chunks=[];
      let total=0;
      for(;;){
        const chunk=Buffer.allocUnsafe(Math.min(1<<20,maxBytes+1-total));
        const count=readSync(fd,chunk,0,chunk.length,null);
        if(count===0)break;
        total+=count;
        if(total>maxBytes)throw new Error(`profile output exceeds ${maxBytes} bytes: ${path}`);
        chunks.push(chunk.subarray(0,count));
      }
      const after=fstatSync(fd,{bigint:true});
      let pathAfter;
      try{pathAfter=lstatSync(path,{bigint:true})}catch{throw new Error(`profile output disappeared while it was read: ${path}`)}
      if(stableProfileStatKey(opened)!==stableProfileStatKey(after)||stableProfileStatKey(opened)!==stableProfileStatKey(pathAfter)||BigInt(total)!==opened.size){
        throw new Error(`profile output changed while it was read: ${path}`);
      }
      buffer=Buffer.concat(chunks,total);
      try{text=PROFILE_UTF8_DECODER.decode(buffer)}
      catch(error){
        if(!(error instanceof TypeError))throw error;
        invalidUtf8=true;
      }
    }finally{
      if(fd!==null)try{closeSync(fd)}catch{}
    }
  }
  return {materialized,bytes:byteCount,overflow,invalidUtf8,text,buffer};
}

function parseProfileUnsigned(text,label){
  if(!/^(0|[1-9][0-9]*)$/.test(text))throw new Error(`${label} must be a canonical unsigned decimal`);
  const value=BigInt(text);
  if(value>PROFILE_I64_MAX)throw new Error(`${label} exceeds int64`);
  return value;
}

function parseProfileIdentityLine(line,key){
  const prefix=`${key}=`;
  if(!line.startsWith(prefix))throw new Error(`profile schema expected ${key}`);
  const value=line.slice(prefix.length);
  if(value.length===0||/[\r\n\t]/.test(value))throw new Error(`profile schema has invalid ${key}`);
  return value;
}

function assertProfileHex(value,key){
  if(!/^[0-9a-f]{64}$/.test(value))throw new Error(`profile schema has invalid ${key}`);
  return value;
}

function profileLines(text,label){
  if(text.includes("\r"))throw new Error(`${label} must use canonical LF line endings`);
  if(!text.endsWith("\n"))throw new Error(`${label} must end with one LF`);
  if(text.includes("\0"))throw new Error(`${label} contains NUL`);
  const lines=text.split("\n");
  if(lines.at(-1)!=="")throw new Error(`${label} trailing line is malformed`);
  lines.pop();
  return lines;
}

function parseCanonicalRawProfileText(text){
  const lines=profileLines(text,"raw profile");
  const expectedLines=11+PROFILE_PHASE_NAMES.length;
  if(lines.length!==expectedLines)throw new Error(`raw profile line count must be ${expectedLines}; got ${lines.length}`);
  if(lines[0]!==PROFILE_RAW_SCHEMA)throw new Error(`unsupported raw profile schema: ${lines[0]}`);
  if(lines[1]!=="profile_kind=compiler_phase")throw new Error("raw profile kind must be compiler_phase");
  const profile={
    schema:PROFILE_RAW_SCHEMA,
    profileKind:"compiler_phase",
    sourcePath:parseProfileIdentityLine(lines[2],"source_path"),
    sourceSha256:assertProfileHex(parseProfileIdentityLine(lines[3],"source_sha256"),"source_sha256"),
    sourceTreeCid:assertProfileHex(parseProfileIdentityLine(lines[4],"source_tree_cid"),"source_tree_cid"),
    driverPath:parseProfileIdentityLine(lines[5],"driver_path"),
    driverSha256:assertProfileHex(parseProfileIdentityLine(lines[6],"driver_sha256"),"driver_sha256"),
    outputPath:parseProfileIdentityLine(lines[7],"output_path"),
    outputSha256:assertProfileHex(parseProfileIdentityLine(lines[8],"output_sha256"),"output_sha256"),
    phaseCount:Number(parseProfileUnsigned(parseProfileIdentityLine(lines[9],"phase_count"),"phase_count")),
    phaseTotalNs:parseProfileUnsigned(parseProfileIdentityLine(lines[10],"phase_total_ns"),"phase_total_ns"),
    phases:[]
  };
  if(!isAbsolute(profile.sourcePath)||!isAbsolute(profile.driverPath)||!isAbsolute(profile.outputPath)){
    throw new Error("raw profile source, driver, and output paths must be absolute");
  }
  if(profile.phaseCount!==PROFILE_PHASE_NAMES.length)throw new Error("raw profile phase_count mismatch");
  let sum=0n;
  for(let index=0;index<PROFILE_PHASE_NAMES.length;index++){
    const parts=lines[11+index].split("\t");
    if(parts.length!==3||parts[0]!=="phase"||parts[1]!==PROFILE_PHASE_NAMES[index]){
      throw new Error(`raw profile phase row ${index} is not canonical`);
    }
    const ns=parseProfileUnsigned(parts[2],`phase ${parts[1]}`);
    sum+=ns;
    if(sum>PROFILE_I64_MAX)throw new Error("raw profile phase sum exceeds int64");
    profile.phases.push({name:parts[1],ns});
  }
  if(profile.phases[1].ns<=0n)throw new Error("raw profile has no measured compiler_csg phase");
  if(sum!==profile.phaseTotalNs)throw new Error("raw profile phase_total_ns does not equal phase sum");
  return profile;
}

function profileMetadataEqual(left,right){
  for(const key of ["profileKind","sourcePath","sourceSha256","sourceTreeCid","driverPath","driverSha256","outputPath","outputSha256","phaseCount","phaseTotalNs"]){
    if(left[key]!==right[key])return false;
  }
  return true;
}

function canonicalProfileReportText(raw){
  const sorted=raw.phases.slice().sort((left,right)=>{
    if(left.ns!==right.ns)return left.ns>right.ns?-1:1;
    return left.name.localeCompare(right.name);
  });
  const lines=[
    PROFILE_REPORT_SCHEMA,
    "profile_kind=compiler_phase",
    `source_path=${raw.sourcePath}`,
    `source_sha256=${raw.sourceSha256}`,
    `source_tree_cid=${raw.sourceTreeCid}`,
    `driver_path=${raw.driverPath}`,
    `driver_sha256=${raw.driverSha256}`,
    `output_path=${raw.outputPath}`,
    `output_sha256=${raw.outputSha256}`,
    `phase_count=${raw.phaseCount}`,
    `phase_total_ns=${raw.phaseTotalNs}`
  ];
  sorted.forEach((phase,index)=>lines.push(`hot_phase[${index}]=${phase.ns}|${phase.name}`));
  return lines.join("\n")+"\n";
}

function parseCanonicalProfileReportText(text){
  const lines=profileLines(text,"profile report");
  const expectedLines=11+PROFILE_PHASE_NAMES.length;
  if(lines.length!==expectedLines)throw new Error(`profile report line count must be ${expectedLines}; got ${lines.length}`);
  if(lines[0]!==PROFILE_REPORT_SCHEMA)throw new Error(`unsupported profile report schema: ${lines[0]}`);
  if(lines[1]!=="profile_kind=compiler_phase")throw new Error("profile report kind must be compiler_phase");
  const report={
    schema:PROFILE_REPORT_SCHEMA,
    profileKind:"compiler_phase",
    sourcePath:parseProfileIdentityLine(lines[2],"source_path"),
    sourceSha256:assertProfileHex(parseProfileIdentityLine(lines[3],"source_sha256"),"source_sha256"),
    sourceTreeCid:assertProfileHex(parseProfileIdentityLine(lines[4],"source_tree_cid"),"source_tree_cid"),
    driverPath:parseProfileIdentityLine(lines[5],"driver_path"),
    driverSha256:assertProfileHex(parseProfileIdentityLine(lines[6],"driver_sha256"),"driver_sha256"),
    outputPath:parseProfileIdentityLine(lines[7],"output_path"),
    outputSha256:assertProfileHex(parseProfileIdentityLine(lines[8],"output_sha256"),"output_sha256"),
    phaseCount:Number(parseProfileUnsigned(parseProfileIdentityLine(lines[9],"phase_count"),"phase_count")),
    phaseTotalNs:parseProfileUnsigned(parseProfileIdentityLine(lines[10],"phase_total_ns"),"phase_total_ns"),
    phases:[]
  };
  if(!isAbsolute(report.sourcePath)||!isAbsolute(report.driverPath)||!isAbsolute(report.outputPath)){
    throw new Error("profile report source, driver, and output paths must be absolute");
  }
  if(report.phaseCount!==PROFILE_PHASE_NAMES.length)throw new Error("profile report phase_count mismatch");
  let sum=0n;
  const names=new Set();
  for(let index=0;index<PROFILE_PHASE_NAMES.length;index++){
    const prefix=`hot_phase[${index}]=`;
    if(!lines[11+index].startsWith(prefix))throw new Error(`profile report hot_phase row ${index} is not canonical`);
    const parts=lines[11+index].slice(prefix.length).split("|");
    if(parts.length!==2||!PROFILE_PHASE_NAMES.includes(parts[1])||names.has(parts[1])){
      throw new Error(`profile report hot_phase row ${index} is invalid`);
    }
    const ns=parseProfileUnsigned(parts[0],`hot phase ${parts[1]}`);
    names.add(parts[1]);
    sum+=ns;
    if(sum>PROFILE_I64_MAX)throw new Error("profile report phase sum exceeds int64");
    report.phases.push({name:parts[1],ns});
  }
  if(sum!==report.phaseTotalNs)throw new Error("profile report phase_total_ns does not equal phase sum");
  for(let index=1;index<report.phases.length;index++){
    const previous=report.phases[index-1];
    const current=report.phases[index];
    if(previous.ns<current.ns||(previous.ns===current.ns&&previous.name.localeCompare(current.name)>0)){
      throw new Error("profile report hot_phase rows are not canonically sorted");
    }
  }
  const compiler=report.phases.find((phase)=>phase.name==="compiler_csg");
  if(!compiler||compiler.ns<=0n)throw new Error("profile report has no measured compiler_csg phase");
  return report;
}

function assertCanonicalRawProfileEvidence(evidence,expected=null){
  if(!evidence.materialized)throw new Error("raw profile input must be a non-empty regular file");
  if(evidence.overflow)throw new Error("raw profile input exceeds maxOutputBytes");
  if(evidence.invalidUtf8)throw new Error("raw profile input is not valid UTF-8");
  const parsed=parseCanonicalRawProfileText(evidence.text);
  if(expected){
    for(const [key,value] of Object.entries(expected)){
      if(value!==undefined&&parsed[key]!==value)throw new Error(`raw profile identity mismatch: ${key}`);
    }
  }
  evidence.profile=parsed;
  return evidence;
}

function assertCanonicalProfileReportEvidence(evidence,expectedRaw=null){
  if(!evidence.materialized)throw new Error("profile report must be a non-empty regular file");
  if(evidence.overflow)throw new Error("profile report exceeds maxOutputBytes");
  if(evidence.invalidUtf8)throw new Error("profile report is not valid UTF-8");
  const parsed=parseCanonicalProfileReportText(evidence.text);
  if(expectedRaw){
    if(!profileMetadataEqual(parsed,expectedRaw))throw new Error("profile report identity differs from raw profile");
    if(evidence.text!==canonicalProfileReportText(expectedRaw))throw new Error("profile report is not the independent canonical raw conversion");
  }
  evidence.profile=parsed;
  return evidence;
}

function assertProfileProbeReportSchema(report){
  if(!report||typeof report!=="object"||report.schema!==PROFILE_PROBE_SCHEMA){
    throw new Error(`unsupported profile probe schema: ${report?.schema}`);
  }
  return report;
}

function stableProfileStatKey(stat){
  return `${stat.dev}:${stat.ino}:${stat.mode}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
}

function profileArtifactGenerationKey(path){
  try{return stableProfileStatKey(lstatSync(path,{bigint:true}))}
  catch(error){if(error?.code==="ENOENT")return null;throw error}
}

function sha256Bytes(bytes){
  return createHash("sha256").update(bytes).digest("hex");
}

function stableProfileFileBytes(path,label,maxBytes,allowEmpty){
  let before;
  try{before=lstatSync(path,{bigint:true})}
  catch(error){throw new Error(`${label} is missing: ${path} (${error?.code||String(error)})`)}
  if(before.isSymbolicLink()||!before.isFile()||(!allowEmpty&&before.size<=0n)){
    throw new Error(`${label} must be a ${allowEmpty?"":"non-empty "}regular file`);
  }
  if(before.size>BigInt(maxBytes))throw new Error(`${label} exceeds ${maxBytes} bytes`);
  let fd=null;
  try{
    fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
    const opened=fstatSync(fd,{bigint:true});
    if(stableProfileStatKey(before)!==stableProfileStatKey(opened)){
      throw new Error(`${label} changed while it was opened`);
    }
    const buffer=Buffer.allocUnsafe(Number(opened.size));
    let offset=0;
    while(offset<buffer.length){
      const count=readSync(fd,buffer,offset,buffer.length-offset,null);
      if(count===0)break;
      offset+=count;
    }
    const after=fstatSync(fd,{bigint:true});
    let pathAfter;
    try{pathAfter=lstatSync(path,{bigint:true})}
    catch{throw new Error(`${label} disappeared while it was read`)}
    if(offset!==buffer.length ||
       stableProfileStatKey(opened)!==stableProfileStatKey(after) ||
       stableProfileStatKey(opened)!==stableProfileStatKey(pathAfter)){
      throw new Error(`${label} changed while it was read`);
    }
    return {before,buffer};
  }finally{
    if(fd!==null)try{closeSync(fd)}catch{}
  }
}

function stableRegularFile(path,label,maxBytes=PROFILE_ARTIFACT_MAX_BYTES){
  const {before,buffer}=stableProfileFileBytes(path,label,maxBytes,false);
  return {path,bytes:buffer.length,sha256:sha256Bytes(buffer),buffer,mode:Number(before.mode),dev:before.dev,ino:before.ino};
}

function stableGuardArtifact(path,label,maxBytes=PROFILE_ARTIFACT_MAX_BYTES){
  const {before,buffer}=stableProfileFileBytes(path,label,maxBytes,true);
  return {path,bytes:buffer.length,sha256:sha256Bytes(buffer),buffer,mode:Number(before.mode),dev:before.dev,ino:before.ino};
}

function stableGuardIdentityFile(path,label,maxBytes=PROFILE_ARTIFACT_MAX_BYTES){
  const {before,buffer}=stableProfileFileBytes(path,label,maxBytes,false);
  return {
    path,
    sha256:sha256Bytes(buffer),
    device:String(before.dev),
    inode:String(before.ino),
    size:String(before.size),
    mtimeNs:String(before.mtimeNs),
    ctimeNs:String(before.ctimeNs)
  };
}

function profileGuardValue(text,key){
  const values=profileReportValues(text,key);
  if(values.length!==1)throw new Error(`profile process-tree guard report must contain exactly one ${key}`);
  return values[0];
}

function profileGuardInteger(text,key){
  const value=profileGuardValue(text,key);
  if(!/^(0|[1-9][0-9]*)$/.test(value))throw new Error(`profile process-tree guard report has invalid ${key}`);
  const number=Number(value);
  if(!Number.isSafeInteger(number))throw new Error(`profile process-tree guard report ${key} exceeds safe integer`);
  return number;
}

function profileGuardEvidenceRoot(root){
  ensureProfileDriverReceiptDir(root);
  const directory=join(profileDriverReceiptDir(root),"userspace-process-tree-guards");
  if(!pathAlreadyExists(directory))mkdirSync(directory,{recursive:true,mode:0o700});
  const stat=lstatSync(directory);
  if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error(`profile process-tree guard evidence root is not a real directory: ${directory}`);
  chmodSync(directory,0o700);
  return directory;
}

function profileGuardMonitorPython(){
  const configured=String(process.env.BEAT_C_GUARD_MONITOR_PYTHON||"").trim();
  const candidates=configured.length>0?[configured]:[];
  if(configured.length===0){
    for(const directory of String(process.env.PATH||"").split(":")){
      if(directory.length===0||!isAbsolute(directory))continue;
      candidates.push(join(directory,"python3"));
    }
  }
  const seen=new Set();
  for(const candidate of candidates){
    if(seen.has(candidate))continue;
    seen.add(candidate);
    if(!isAbsolute(candidate))throw new Error("BEAT_C_GUARD_MONITOR_PYTHON must be absolute");
    try{
      accessSync(candidate,constants.X_OK);
      const probe=spawnSync(candidate,["-I","-c","import psutil"],{
        encoding:"utf8",timeout:5000,maxBuffer:1024*1024,
        env:{PATH:"/usr/bin:/bin",LANG:"C",LC_ALL:"C"}
      });
      if(probe.status===0&&!probe.error)return candidate;
    }catch{}
  }
  throw new Error("profile process-tree guard requires an absolute executable python3 monitor with psutil");
}

function profileGuardU32be(value){
  if(!Number.isSafeInteger(value)||value<0||value>0xffffffff)throw new Error("profile process-tree guard closure count/length exceeds uint32");
  const out=Buffer.alloc(4);
  out.writeUInt32BE(value,0);
  return out;
}

function profileGuardTextFrame(bytes){
  return Buffer.concat([profileGuardU32be(bytes.length),bytes]);
}

function profileGuardArgvSha256(argv){
  const payload=[
    profileGuardTextFrame(Buffer.from("cheng.guard.command_argv")),
    profileGuardU32be(argv.length)
  ];
  for(const value of argv)payload.push(profileGuardTextFrame(Buffer.from(value)));
  return sha256Bytes(Buffer.concat(payload));
}

function profileGuardTargetEnvIdentity(values){
  const entries=Object.entries(values).sort(([left],[right])=>Buffer.compare(Buffer.from(left),Buffer.from(right)));
  const payload=[
    profileGuardTextFrame(Buffer.from("cheng.guard.target_env")),
    profileGuardU32be(entries.length)
  ];
  for(const [key,value] of entries){
    payload.push(profileGuardTextFrame(Buffer.from(key)),profileGuardTextFrame(Buffer.from(value)));
  }
  return {
    entries:entries.map(([key,value])=>`${key}=${value}`),
    count:entries.length,
    sha256:sha256Bytes(Buffer.concat(payload))
  };
}

function profileGuardFileClosure(rootPath,label){
  if(!isAbsolute(rootPath))throw new Error(`${label} root must be absolute`);
  const rootBefore=lstatSync(rootPath,{bigint:true});
  if(rootBefore.isSymbolicLink()||!rootBefore.isDirectory())throw new Error(`${label} root must be a real directory`);
  const entries=[];
  const walk=(directory,prefix)=>{
    const directoryEntries=readdirSync(directory,{withFileTypes:true});
    directoryEntries.sort((left,right)=>Buffer.compare(Buffer.from(left.name),Buffer.from(right.name)));
    for(const entry of directoryEntries){
      const path=join(directory,entry.name);
      const relativePath=prefix.length===0?entry.name:`${prefix}/${entry.name}`;
      if(entry.isSymbolicLink())throw new Error(`${label} contains a symlink: ${path}`);
      if(entry.isDirectory()){
        walk(path,relativePath);
        continue;
      }
      if(!entry.isFile())throw new Error(`${label} contains a non-regular entry: ${path}`);
      const file=stableGuardArtifact(path,`${label} file ${relativePath}`);
      entries.push({relativePath,sha256:file.sha256,size:file.bytes});
    }
  };
  walk(rootPath,"");
  entries.sort((left,right)=>Buffer.compare(Buffer.from(left.relativePath),Buffer.from(right.relativePath)));
  const rootAfter=lstatSync(rootPath,{bigint:true});
  if(stableProfileStatKey(rootBefore)!==stableProfileStatKey(rootAfter))throw new Error(`${label} root changed while it was read`);
  const payload=[
    profileGuardTextFrame(Buffer.from("cheng.guard.file_closure")),
    profileGuardU32be(entries.length)
  ];
  for(const entry of entries){
    const size=Buffer.alloc(8);
    size.writeBigUInt64BE(BigInt(entry.size),0);
    payload.push(profileGuardTextFrame(Buffer.from(entry.relativePath)),Buffer.from(entry.sha256,"hex"),size);
  }
  return {rootPath,count:entries.length,sha256:sha256Bytes(Buffer.concat(payload))};
}

function validateProfileGuardReport(root,guardPath,commandPath,evidenceDirectory,wrapperExitCode,maxBuffer,expectedGuardIdentity=null,expectedCommandArgv=null,expectedTargetEnv=null){
  const reportPath=join(evidenceDirectory,"guard.report.txt");
  const stdoutPath=join(evidenceDirectory,"stdout.txt");
  const stderrPath=join(evidenceDirectory,"stderr.txt");
  const report=stableRegularFile(reportPath,"profile process-tree guard report",16*1024*1024);
  const stdout=stableGuardArtifact(stdoutPath,"profile process-tree guard stdout",maxBuffer);
  const stderr=stableGuardArtifact(stderrPath,"profile process-tree guard stderr",maxBuffer);
  const text=PROFILE_UTF8_DECODER.decode(report.buffer);
  const guard=stableGuardIdentityFile(guardPath,"profile process-tree guard",16*1024*1024);
  if(expectedGuardIdentity&&JSON.stringify(guard)!==JSON.stringify(expectedGuardIdentity)){
    throw new Error("profile process-tree guard identity changed during execution");
  }
  const command=stableGuardIdentityFile(commandPath,"profile guarded command");
  const status=profileGuardValue(text,"status");
  const abortReason=profileGuardValue(text,"abort_reason");
  const rc=profileGuardInteger(text,"rc");
  for(const [key,expected] of [
    ["schema","beat_c_process_memory_guard"],
    ["memory_guard_mode","process_tree"],
    ["memory_guard_scope","identity_history_union_group_session_and_descendants"],
    ["hard_memory_limit_proof_status","not_provable_userspace_poll"],
    ["memory_limit_bytes",String(PROFILE_RSS_LIMIT_BYTES)],
    ["poll_seconds","0.01"],
    ["formal_command_identity_status","required_verified"],
    ["command_execution_mode","private_single_link_snapshot"]
  ]){
    const actual=profileGuardValue(text,key);
    if(actual!==expected)throw new Error(`profile process-tree guard exact contract mismatch: ${key}=${actual}, expected ${expected}`);
  }
  if(status!==(abortReason.length===0?"completed":"ABORT"))throw new Error("profile process-tree guard status/abort contract mismatch");
  if(wrapperExitCode!==rc)throw new Error("profile process-tree guard wrapper/child rc mismatch");
  if(resolve(profileGuardValue(text,"report_path"))!==resolve(reportPath) ||
     resolve(profileGuardValue(text,"stdout_path"))!==resolve(stdoutPath) ||
     resolve(profileGuardValue(text,"stderr_path"))!==resolve(stderrPath)){
    throw new Error("profile process-tree guard report path binding mismatch");
  }
  if(profileGuardValue(text,"report_device")!==String(report.dev) ||
     profileGuardValue(text,"report_inode")!==String(report.ino) ||
     profileGuardValue(text,"stdout_device")!==String(stdout.dev) ||
     profileGuardValue(text,"stdout_inode")!==String(stdout.ino) ||
     profileGuardValue(text,"stdout_size")!==String(stdout.bytes) ||
     profileGuardValue(text,"stderr_device")!==String(stderr.dev) ||
     profileGuardValue(text,"stderr_inode")!==String(stderr.ino) ||
     profileGuardValue(text,"stderr_size")!==String(stderr.bytes)){
    throw new Error("profile process-tree guard report/stream physical identity mismatch");
  }
  if(profileGuardValue(text,"stdout_sha256")!==stdout.sha256 ||
     profileGuardValue(text,"stderr_sha256")!==stderr.sha256){
    throw new Error("profile process-tree guard stream hash binding mismatch");
  }
  if(resolve(profileGuardValue(text,"command_path"))!==resolve(commandPath) ||
     profileGuardValue(text,"command_sha256")!==command.sha256 ||
     profileGuardValue(text,"command_device")!==command.device ||
     profileGuardValue(text,"command_inode")!==command.inode ||
     profileGuardValue(text,"command_size")!==command.size ||
     profileGuardValue(text,"command_mtime_ns")!==command.mtimeNs ||
     profileGuardValue(text,"command_ctime_ns")!==command.ctimeNs ||
     resolve(profileGuardValue(text,"expected_command_path"))!==resolve(commandPath) ||
     profileGuardValue(text,"expected_command_sha256")!==command.sha256){
    throw new Error("profile process-tree guard command identity mismatch");
  }
  const snapshotPath=profileGuardValue(text,"command_execution_snapshot_path");
  const snapshot=stableGuardIdentityFile(snapshotPath,"profile guarded command snapshot");
  if(profileGuardValue(text,"command_execution_snapshot_sha256")!==snapshot.sha256 ||
     profileGuardValue(text,"command_execution_snapshot_device")!==snapshot.device ||
     profileGuardValue(text,"command_execution_snapshot_inode")!==snapshot.inode ||
     profileGuardValue(text,"command_execution_snapshot_size")!==snapshot.size ||
     profileGuardValue(text,"command_execution_snapshot_mtime_ns")!==snapshot.mtimeNs ||
     profileGuardValue(text,"command_execution_snapshot_ctime_ns")!==snapshot.ctimeNs ||
     snapshot.sha256!==command.sha256){
    throw new Error("profile process-tree guard command snapshot hash mismatch");
  }
  const combinedLimit=profileGuardInteger(text,"combined_output_limit_bytes");
  if(combinedLimit!==maxBuffer)throw new Error("profile process-tree guard combined output limit mismatch");
  if(!Array.isArray(expectedCommandArgv)||expectedCommandArgv.length===0 ||
     expectedCommandArgv[0]!==resolve(commandPath)){
    throw new Error("profile process-tree guard expected command argv is missing");
  }
  const commandArgvSha256=profileGuardArgvSha256(expectedCommandArgv);
  if(profileGuardInteger(text,"command_argv_count")!==expectedCommandArgv.length ||
     profileGuardValue(text,"command_argv_sha256")!==commandArgvSha256){
    throw new Error("profile process-tree guard command argv identity mismatch");
  }
  const targetEnvIdentity=profileGuardTargetEnvIdentity(expectedTargetEnv||{});
  if(profileGuardInteger(text,"target_env_requested_count")!==targetEnvIdentity.count ||
     profileGuardValue(text,"target_env_requested_sha256")!==targetEnvIdentity.sha256){
    throw new Error("profile process-tree guard requested target environment identity mismatch");
  }
  const observedStatus=profileGuardValue(text,"observed_sample_limit_status");
  const monitorPython=stableGuardIdentityFile(
    profileGuardValue(text,"monitor_python_path"),
    "profile process-tree guard monitor Python",
    256*1024*1024);
  const monitorPsutil=stableGuardIdentityFile(
    profileGuardValue(text,"monitor_psutil_path"),
    "profile process-tree guard monitor psutil",
    16*1024*1024);
  for(const [prefix,identity] of [["monitor_python",monitorPython],["monitor_psutil",monitorPsutil]]){
    if(profileGuardValue(text,`${prefix}_sha256`)!==identity.sha256 ||
       profileGuardValue(text,`${prefix}_device`)!==identity.device ||
       profileGuardValue(text,`${prefix}_inode`)!==identity.inode ||
       profileGuardValue(text,`${prefix}_size`)!==identity.size ||
       profileGuardValue(text,`${prefix}_mtime_ns`)!==identity.mtimeNs ||
       profileGuardValue(text,`${prefix}_ctime_ns`)!==identity.ctimeNs){
      throw new Error(`profile process-tree guard ${prefix} identity mismatch`);
    }
  }
  const monitorPsutilClosureRoot=profileGuardValue(text,"monitor_psutil_closure_root");
  if(resolve(monitorPsutilClosureRoot)!==resolve(dirname(monitorPsutil.path))){
    throw new Error("profile process-tree guard monitor psutil closure root mismatch");
  }
  const monitorPsutilClosure=profileGuardFileClosure(
    monitorPsutilClosureRoot,
    "profile process-tree guard monitor psutil closure");
  if(profileGuardValue(text,"monitor_psutil_closure_schema")!=="cheng.guard.file_closure" ||
     profileGuardInteger(text,"monitor_psutil_closure_count")!==monitorPsutilClosure.count ||
     profileGuardValue(text,"monitor_psutil_closure_sha256")!==monitorPsutilClosure.sha256){
    throw new Error("profile process-tree guard monitor psutil closure identity mismatch");
  }
  return {
    schema:PROFILE_GUARD_RECEIPT_SCHEMA,
    executionKind:"userspace_process_tree",
    linuxCgroupProof:false,
    rssLimitBytes:PROFILE_RSS_LIMIT_BYTES,
    combinedOutputLimitBytes:combinedLimit,
    platform:profileGuardValue(text,"platform"),
    status,
    rc,
    abortReason,
    cleanupStatus:profileGuardValue(text,"cleanup_status"),
    observedSampleLimitStatus:observedStatus,
    memoryMeasurementStatus:profileGuardValue(text,"memory_measurement_status"),
    hardMemoryLimitProofStatus:"not_provable_userspace_poll",
    enforcedPeakBytes:profileGuardInteger(text,"process_tree_enforced_peak_bytes"),
    guardPath,
    guardSha256:guard.sha256,
    guardDevice:guard.device,
    guardInode:guard.inode,
    guardSize:guard.size,
    guardMtimeNs:guard.mtimeNs,
    guardCtimeNs:guard.ctimeNs,
    reportPath,
    reportSha256:report.sha256,
    stdoutPath,
    stdoutSha256:stdout.sha256,
    stderrPath,
    stderrSha256:stderr.sha256,
    commandPath,
    commandSha256:command.sha256,
    commandDevice:command.device,
    commandInode:command.inode,
    commandSize:command.size,
    commandMtimeNs:command.mtimeNs,
    commandCtimeNs:command.ctimeNs,
    commandSnapshotPath:snapshotPath,
    commandSnapshotSha256:snapshot.sha256,
    commandSnapshotDevice:snapshot.device,
    commandSnapshotInode:snapshot.inode,
    commandSnapshotSize:snapshot.size,
    commandSnapshotMtimeNs:snapshot.mtimeNs,
    commandSnapshotCtimeNs:snapshot.ctimeNs,
    commandArgv:expectedCommandArgv.slice(),
    commandArgvSha256,
    targetEnvRequested:targetEnvIdentity.entries,
    targetEnvRequestedSha256:targetEnvIdentity.sha256,
    monitorPythonPath:monitorPython.path,
    monitorPythonSha256:monitorPython.sha256,
    monitorPythonDevice:monitorPython.device,
    monitorPythonInode:monitorPython.inode,
    monitorPythonSize:monitorPython.size,
    monitorPythonMtimeNs:monitorPython.mtimeNs,
    monitorPythonCtimeNs:monitorPython.ctimeNs,
    monitorPsutilPath:monitorPsutil.path,
    monitorPsutilSha256:monitorPsutil.sha256,
    monitorPsutilDevice:monitorPsutil.device,
    monitorPsutilInode:monitorPsutil.inode,
    monitorPsutilSize:monitorPsutil.size,
    monitorPsutilMtimeNs:monitorPsutil.mtimeNs,
    monitorPsutilCtimeNs:monitorPsutil.ctimeNs,
    monitorPsutilClosureRoot:monitorPsutilClosure.rootPath,
    monitorPsutilClosureCount:monitorPsutilClosure.count,
    monitorPsutilClosureSha256:monitorPsutilClosure.sha256
  };
}

function validateStoredProfileGuard(root,record,label){
  if(!record||record.schema!==PROFILE_GUARD_RECEIPT_SCHEMA)throw new Error(`${label} is missing`);
  if(!Array.isArray(record.commandArgv)||!record.commandArgv.every((value)=>typeof value==="string") ||
     !Array.isArray(record.targetEnvRequested)||!record.targetEnvRequested.every((value)=>typeof value==="string")){
    throw new Error(`${label} command argv/target environment identity is missing`);
  }
  const canonicalGuard=resolve(root,"tools/beat_c_process_group_guard.sh");
  if(resolve(record.guardPath)!==canonicalGuard)throw new Error(`${label} does not use the canonical process-tree guard`);
  const currentGuard=stableGuardIdentityFile(canonicalGuard,`${label} canonical guard`,16*1024*1024);
  for(const [key,value] of [
    ["guardSha256",currentGuard.sha256],["guardDevice",currentGuard.device],
    ["guardInode",currentGuard.inode],["guardSize",currentGuard.size],
    ["guardMtimeNs",currentGuard.mtimeNs],["guardCtimeNs",currentGuard.ctimeNs]
  ]){
    if(record[key]!==value)throw new Error(`${label} canonical guard identity mismatch: ${key}`);
  }
  assertInsideProject(record.reportPath,root);
  assertInsideProject(record.stdoutPath,root);
  assertInsideProject(record.stderrPath,root);
  assertInsideProject(record.commandSnapshotPath,root);
  const evidenceDirectory=dirname(record.reportPath);
  if(resolve(record.stdoutPath)!==resolve(join(evidenceDirectory,"stdout.txt")) ||
     resolve(record.stderrPath)!==resolve(join(evidenceDirectory,"stderr.txt"))){
    throw new Error(`${label} stream paths are not in the guard evidence directory`);
  }
  const actual=validateProfileGuardReport(
    root,canonicalGuard,record.commandPath,evidenceDirectory,
    record.rc,record.combinedOutputLimitBytes,null,
    record.commandArgv,
    Object.fromEntries(record.targetEnvRequested.map((entry)=>{
      const separator=entry.indexOf("=");
      if(separator<=0)throw new Error(`${label} target environment entry is invalid`);
      return [entry.slice(0,separator),entry.slice(separator+1)];
    })));
  if(JSON.stringify(record)!==JSON.stringify(actual))throw new Error(`${label} receipt mismatch`);
  return actual;
}

function validateExactProfileGuardTargetEnv(record,label){
  const entries=new Map();
  for(const entry of record.targetEnvRequested){
    const separator=entry.indexOf("=");
    if(separator<=0)throw new Error(`${label} target environment entry is invalid`);
    const key=entry.slice(0,separator);
    if(entries.has(key))throw new Error(`${label} target environment contains duplicate ${key}`);
    entries.set(key,entry.slice(separator+1));
  }
  const expectedKeys=[
    "CHENG_PARENT_RSS_GUARD","CHENG_PROCESS_MAX_RSS_BYTES",
    "LANG","LC_ALL","PATH","TMPDIR"
  ];
  if(JSON.stringify([...entries.keys()].sort())!==JSON.stringify(expectedKeys)){
    throw new Error(`${label} target environment keys are not exact`);
  }
  if(entries.get("CHENG_PARENT_RSS_GUARD")!=="1" ||
     entries.get("CHENG_PROCESS_MAX_RSS_BYTES")!==String(PROFILE_RSS_LIMIT_BYTES) ||
     entries.get("LANG")!=="C"||entries.get("LC_ALL")!=="C" ||
     entries.get("PATH").length===0||entries.get("TMPDIR").length===0){
    throw new Error(`${label} target environment values are not exact`);
  }
}

function validateExactProfileGuardCommand(record,{commandPath,commandSha256,commandArgv},label){
  const expectedPath=resolve(commandPath);
  const currentCommand=stableGuardIdentityFile(commandPath,`${label} current command`);
  if(resolve(record.commandPath)!==expectedPath ||
     currentCommand.sha256!==commandSha256 ||
     record.commandSha256!==commandSha256 ||
     record.commandDevice!==currentCommand.device ||
     record.commandInode!==currentCommand.inode ||
     record.commandSize!==currentCommand.size ||
     record.commandMtimeNs!==currentCommand.mtimeNs ||
     record.commandCtimeNs!==currentCommand.ctimeNs ||
     resolve(record.commandSnapshotPath)===expectedPath ||
     record.commandSnapshotSha256!==commandSha256){
    throw new Error(`${label} command path/hash identity mismatch`);
  }
  if(JSON.stringify(record.commandArgv)!==JSON.stringify(commandArgv)){
    throw new Error(`${label} command argv is not the exact producer command`);
  }
  validateExactProfileGuardTargetEnv(record,label);
}

function profileGuardProved(record){
  return record&&record.status==="completed"&&record.rc===0&&record.abortReason===""&&
    record.memoryMeasurementStatus==="available"&&record.observedSampleLimitStatus==="proved";
}

async function runProfileGuarded(root,commandPath,args,{timeoutMs,maxBuffer,tag}){
  if(!/^[a-z0-9][a-z0-9._-]*$/.test(tag))throw new Error(`invalid profile process-tree guard tag: ${tag}`);
  if(!Number.isSafeInteger(maxBuffer)||maxBuffer<=0||maxBuffer>PROFILE_ARTIFACT_MAX_BYTES){
    throw new Error("profile process-tree guard maxBuffer must be within the exact 1 GiB ceiling");
  }
  const effectiveTimeoutMs=timeoutMs===undefined?120000:timeoutMs;
  if(!Number.isSafeInteger(effectiveTimeoutMs)||effectiveTimeoutMs<=0)throw new Error("profile process-tree guard timeout must be positive");
  const timeoutSeconds=Math.max(1,Math.ceil(effectiveTimeoutMs/1000));
  const guardPath=resolve(root,"tools/beat_c_process_group_guard.sh");
  const guard=stableGuardIdentityFile(guardPath,"profile process-tree guard",16*1024*1024);
  accessSync(guardPath,constants.X_OK);
  const command=stableRegularFile(commandPath,"profile guarded command");
  if((command.mode&0o111)===0)throw new Error("profile guarded command is not executable");
  const evidenceDirectory=mkdtempSync(join(profileGuardEvidenceRoot(root),`${tag}-`));
  chmodSync(evidenceDirectory,0o700);
  const reportPath=join(evidenceDirectory,"guard.report.txt");
  const stdoutPath=join(evidenceDirectory,"stdout.txt");
  const stderrPath=join(evidenceDirectory,"stderr.txt");
  const pathValue=String(process.env.PATH||"");
  const tempValue=String(process.env.TMPDIR||tmpdir());
  if(pathValue.length===0||/[\0\r\n]/.test(pathValue)||tempValue.length===0||/[\0\r\n]/.test(tempValue)){
    throw new Error("profile process-tree guard exact target environment is invalid");
  }
  const guardArgs=[
    `--rss-limit:${PROFILE_RSS_LIMIT_BYTES}`,
    `--timeout:${timeoutSeconds}`,
    `--startup-timeout:${PROFILE_GUARD_STARTUP_TIMEOUT_SECONDS}`,
    `--cleanup-timeout:${PROFILE_GUARD_CLEANUP_TIMEOUT_SECONDS}`,
    `--combined-output-limit:${maxBuffer}`,
    `--report-out:${reportPath}`,
    `--stdout:${stdoutPath}`,
    `--stderr:${stderrPath}`,
    "--snapshot-command",
    "--require-command-identity",
    `--expected-command-path:${commandPath}`,
    `--expected-command-sha256:${command.sha256}`,
    "--target-env-clear",
    `--target-env:PATH=${pathValue}`,
    `--target-env:TMPDIR=${tempValue}`,
    "--target-env:LANG=C",
    "--target-env:LC_ALL=C",
    `--target-env:CHENG_PROCESS_MAX_RSS_BYTES=${PROFILE_RSS_LIMIT_BYTES}`,
    "--target-env:CHENG_PARENT_RSS_GUARD=1",
    "--",
    commandPath,
    ...args
  ];
  const wrapper=await runChengDriver(guardPath,guardArgs,{
    root,cwd:root,maxBuffer:1024*1024,
    exactGuardOwnsTimeoutAndCleanup:true,
    hardRssCapBytes:PROFILE_RSS_LIMIT_BYTES,
    env:{
      BEAT_C_GUARD_MONITOR_PYTHON:profileGuardMonitorPython(),
      BEAT_C_GUARD_POLL_SECONDS:"0.01"
    }
  });
  if(wrapper.missingDriver||wrapper.timedOut||wrapper.overflow||!Number.isInteger(wrapper.exitCode)){
    throw new Error(`profile process-tree guard wrapper failed: ${takeTrailingText(wrapper.stderr,4000)}`);
  }
  if((wrapper.stdoutBuffer?.length||0)!==0||(wrapper.stderrBuffer?.length||0)!==0){
    throw new Error(`profile process-tree guard wrapper emitted unexpected output: ${takeTrailingText(wrapper.stderr,4000)}`);
  }
  const expectedCommandArgv=[resolve(commandPath),...args];
  const expectedTargetEnv={
    PATH:pathValue,
    TMPDIR:tempValue,
    LANG:"C",
    LC_ALL:"C",
    CHENG_PROCESS_MAX_RSS_BYTES:String(PROFILE_RSS_LIMIT_BYTES),
    CHENG_PARENT_RSS_GUARD:"1"
  };
  const guardReceipt=validateProfileGuardReport(
    root,guardPath,commandPath,evidenceDirectory,wrapper.exitCode,maxBuffer,
    guard,expectedCommandArgv,expectedTargetEnv);
  const stdout=stableGuardArtifact(stdoutPath,"profile guarded stdout",maxBuffer);
  const stderr=stableGuardArtifact(stderrPath,"profile guarded stderr",maxBuffer);
  return {
    missingDriver:false,
    driver:commandPath,
    exitCode:guardReceipt.rc,
    stdout:stdout.buffer.toString("utf8"),
    stderr:stderr.buffer.toString("utf8"),
    stdoutBuffer:stdout.buffer,
    stderrBuffer:stderr.buffer,
    timedOut:guardReceipt.abortReason==="timeout",
    overflow:guardReceipt.abortReason==="combined_output_limit_exceeded",
    guard:guardReceipt
  };
}

function profileSourcePaths(root){
  const out=[];
  const addTree=(directory)=>{
    let entries;
    try{entries=readdirSync(directory,{withFileTypes:true})}
    catch(error){if(error?.code==="ENOENT")return;throw error}
    entries.sort((a,b)=>a.name.localeCompare(b.name));
    for(const entry of entries){
      const path=join(directory,entry.name);
      if(entry.isSymbolicLink())throw new Error(`current-source tree contains a symlink: ${path}`);
      if(entry.isDirectory())addTree(path);
      else if(entry.isFile())out.push(path);
      else throw new Error(`current-source tree contains a non-regular entry: ${path}`);
    }
  };
  for(const name of ["cheng-package.toml","cheng.lock.toml","tools/backend2_version_manifest.rec"]){
    const path=join(root,name);
    if(pathAlreadyExists(path))out.push(path);
  }
  addTree(join(root,"src"));
  out.sort((a,b)=>relative(root,a).localeCompare(relative(root,b)));
  if(out.length===0)throw new Error(`current-source tree is empty: ${root}`);
  return out;
}

function profileCurrentSourceSnapshot(root){
  const rows=[];
  for(const path of profileSourcePaths(root)){
    const file=stableRegularFile(path,`current-source input ${relative(root,path)}`);
    rows.push({path:relative(root,path),bytes:file.bytes,sha256:file.sha256});
  }
  const hash=createHash("sha256");
  hash.update("cheng_profile_current_source\0");
  for(const row of rows)hash.update(`${row.path}\0${row.bytes}\0${row.sha256}\n`);
  return {sha256:hash.digest("hex"),fileCount:rows.length,rows};
}

function profileReportValues(text,key){
  const prefix=`${key}=`;
  return text.split(/\r?\n/).filter((line)=>line.startsWith(prefix)).map((line)=>line.slice(prefix.length));
}

function requireProfileReportValue(text,key,predicate,reason){
  const values=profileReportValues(text,key);
  if(values.length!==1||!predicate(values[0]))throw new Error(reason);
  return values[0];
}

function profileDriverReceiptDir(root){
  return join(root,"artifacts/backend_driver/profile-current-source");
}

function profileDriverReceiptPath(root,sourceSha256,driverSha256){
  return join(profileDriverReceiptDir(root),`${sourceSha256}.${driverSha256}.json`);
}

function ensureProfileDriverReceiptDir(root){
  const directory=profileDriverReceiptDir(root);
  if(!pathAlreadyExists(directory))mkdirSync(directory,{recursive:true,mode:0o700});
  const stat=lstatSync(directory);
  if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error(`current-source driver receipt directory is not a real directory: ${directory}`);
  return directory;
}

function validateProfileDriverArtifacts(root,driver,sourceSnapshot,receiptPath=null){
  const canonicalDriver=resolve(root,"artifacts/backend_driver/cheng");
  if(resolve(driver)!==canonicalDriver){
    throw new Error(`current-source profile driver must be canonical ${canonicalDriver}; got ${driver}`);
  }
  const generationBefore={
    driver:profileArtifactGenerationKey(driver),
    map:profileArtifactGenerationKey(`${driver}.map`),
    provenance:profileArtifactGenerationKey(`${driver}.report.txt`)
  };
  const driverFile=stableRegularFile(driver,"current-source profile driver");
  if((driverFile.mode&0o111)===0)throw new Error("current-source profile driver is not executable");
  if(pathAlreadyExists(CHENG_STAGE3_DRIVER)){
    const builderStat=lstatSync(CHENG_STAGE3_DRIVER,{bigint:true});
    if(!builderStat.isSymbolicLink()&&builderStat.isFile()&&
       builderStat.dev===driverFile.dev&&builderStat.ino===driverFile.ino){
      throw new Error("stage3 builder and current-source profile driver are the same inode");
    }
  }
  const mapPath=`${driver}.map`;
  const provenancePath=`${driver}.report.txt`;
  const map=stableRegularFile(mapPath,"current-source profile driver map");
  const provenance=stableRegularFile(provenancePath,"current-source profile driver provenance");
  const mapText=PROFILE_UTF8_DECODER.decode(map.buffer);
  const provenanceText=PROFILE_UTF8_DECODER.decode(provenance.buffer);
  if(!mapText.startsWith("cheng_line_map\n")||!mapText.includes("src/core/tooling/backend_driver_dispatch_min.cheng")){
    throw new Error("current-source profile driver map does not bind backend_driver_dispatch_min.cheng");
  }
  requireProfileReportValue(provenanceText,"full_backend_codegen",(value)=>value==="1","current-source driver provenance missing full_backend_codegen=1");
  requireProfileReportValue(provenanceText,"cold_system_link_exec",(value)=>value==="0","current-source driver provenance does not reject cold system-link-exec");
  requireProfileReportValue(provenanceText,"output_sha256",(value)=>value===driverFile.sha256,"current-source driver provenance output_sha256 does not match driver bytes");
  requireProfileReportValue(provenanceText,"map_sha256",(value)=>value===map.sha256,"current-source driver provenance map_sha256 does not match map bytes");
  const sourceManifestSha256=requireProfileReportValue(
    provenanceText,"source_manifest_sha256",
    (value)=>/^[0-9a-f]{64}$/.test(value),
    "current-source driver provenance missing source_manifest_sha256");
  requireProfileReportValue(
    provenanceText,"source_tree_sha256",
    (value)=>value===sourceSnapshot.sha256,
    "current-source driver provenance source_tree_sha256 does not match the independently hashed current source tree");
  const expectedReceiptPath=profileDriverReceiptPath(root,sourceSnapshot.sha256,driverFile.sha256);
  if(receiptPath&&resolve(receiptPath)!==resolve(expectedReceiptPath))throw new Error("current-source driver receipt path is not content-addressed by source and driver hashes");
  const generationAfter={
    driver:profileArtifactGenerationKey(driver),
    map:profileArtifactGenerationKey(mapPath),
    provenance:profileArtifactGenerationKey(provenancePath)
  };
  if(JSON.stringify(generationBefore)!==JSON.stringify(generationAfter)){
    throw new Error("current-source profile driver artifacts changed during identity validation");
  }
  return {
    schema:PROFILE_DRIVER_RECEIPT_SCHEMA,
    root,
    sourceTreeSha256:sourceSnapshot.sha256,
    sourceFileCount:sourceSnapshot.fileCount,
    driverPath:driver,
    driverSha256:driverFile.sha256,
    driverBytes:driverFile.bytes,
    mapPath,
    mapSha256:map.sha256,
    provenancePath,
    provenanceSha256:provenance.sha256,
    sourceManifestSha256
  };
}

function validateProfileDriverReceipt(root,driver,sourceSnapshot){
  if(!pathAlreadyExists(driver))return null;
  const driverFile=stableRegularFile(driver,"current-source profile driver");
  const receiptPath=profileDriverReceiptPath(root,sourceSnapshot.sha256,driverFile.sha256);
  if(!pathAlreadyExists(receiptPath))return null;
  const receiptFile=stableRegularFile(receiptPath,"current-source profile driver receipt");
  let receipt;
  try{receipt=JSON.parse(PROFILE_UTF8_DECODER.decode(receiptFile.buffer))}
  catch{throw new Error("current-source profile driver receipt is not canonical UTF-8 JSON")}
  const artifactIdentity=validateProfileDriverArtifacts(root,driver,sourceSnapshot,receiptPath);
  const buildGuard=validateStoredProfileGuard(root,receipt.buildGuard,"current-source driver build guard");
  const builderFile=stableRegularFile(CHENG_STAGE3_DRIVER,"official backend-driver builder");
  validateExactProfileGuardCommand(buildGuard,{
    commandPath:CHENG_STAGE3_DRIVER,
    commandSha256:builderFile.sha256,
    commandArgv:[
      resolve(CHENG_STAGE3_DRIVER),
      "build-backend-driver",
      "--require-rebuild",
      `--profile-source-tree-sha256:${sourceSnapshot.sha256}`
    ]
  },"current-source driver build guard");
  if(!profileGuardProved(buildGuard)){
    throw new Error("current-source driver build guard did not complete successfully");
  }
  const actual={...artifactIdentity,buildGuard};
  if(PROFILE_UTF8_DECODER.decode(receiptFile.buffer)!==JSON.stringify(receipt,null,2)+"\n"){
    throw new Error("current-source profile driver receipt is not canonical JSON");
  }
  if(Object.keys(receipt).length!==Object.keys(actual).length)throw new Error("current-source profile driver receipt has undeclared fields");
  for(const key of Object.keys(actual)){
    if(JSON.stringify(receipt[key])!==JSON.stringify(actual[key]))throw new Error(`current-source profile driver receipt mismatch: ${key}`);
  }
  const artifactsAfterGuard=validateProfileDriverArtifacts(root,driver,sourceSnapshot,receiptPath);
  for(const key of Object.keys(artifactIdentity)){
    if(JSON.stringify(artifactsAfterGuard[key])!==JSON.stringify(artifactIdentity[key])){
      throw new Error(`current-source profile driver artifacts changed after guard validation: ${key}`);
    }
  }
  const receiptAfter=stableRegularFile(receiptPath,"current-source profile driver receipt");
  if(receiptAfter.sha256!==receiptFile.sha256){
    throw new Error("current-source profile driver receipt changed during validation");
  }
  return {...actual,receiptPath,receiptSha256:receiptFile.sha256,selection:"exact_hash_receipt"};
}

function revalidateCurrentProfileDriverIdentity(root,expected){
  const sourceSnapshot=profileCurrentSourceSnapshot(root);
  if(sourceSnapshot.sha256!==expected.sourceTreeSha256){
    throw new Error("current-source tree changed after driver identity selection");
  }
  const current=validateProfileDriverReceipt(root,expected.driverPath,sourceSnapshot);
  if(!current ||
     current.driverSha256!==expected.driverSha256 ||
     current.mapSha256!==expected.mapSha256 ||
     current.provenanceSha256!==expected.provenanceSha256 ||
     current.receiptSha256!==expected.receiptSha256){
    throw new Error("current-source profile driver identity changed after selection");
  }
  return current;
}

function sameProfileInode(left,right){
  return left.dev===right.dev&&left.ino===right.ino&&left.mode===right.mode&&left.size===right.size;
}

function createPrivateProfileDir(parent){
  const directory=mkdtempSync(join(parent,".cheng-profile-stage-"));
  chmodSync(directory,0o700);
  return directory;
}

function writeAll(fd,buffer){
  let offset=0;
  while(offset<buffer.length){
    const written=writeSync(fd,buffer,offset,buffer.length-offset);
    if(written<=0)throw new Error("profile snapshot write made no progress");
    offset+=written;
  }
}

function snapshotStagedFile(path,directory,label,{maxBytes,mode,requireExecutable=false}){
  const snapshot=join(directory,`.trusted-${randomUUID()}`);
  let sourceFd=null;
  let snapshotFd=null;
  let snapshotPresent=false;
  let complete=false;
  try{
    sourceFd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
    const before=fstatSync(sourceFd,{bigint:true});
    if(!before.isFile()||before.size<=0n)throw new Error(`${label} must be a non-empty regular file`);
    if(before.size>BigInt(maxBytes))throw new Error(`${label} exceeds ${maxBytes} bytes`);
    if(requireExecutable&&(before.mode&0o111n)===0n)throw new Error(`${label} is not executable`);
    snapshotFd=openSync(snapshot,"wx",mode);
    snapshotPresent=true;
    const chunk=Buffer.allocUnsafe(1<<20);
    let copied=0;
    for(;;){
      const count=readSync(sourceFd,chunk,0,chunk.length,null);
      if(count===0)break;
      copied+=count;
      if(copied>maxBytes)throw new Error(`${label} exceeds ${maxBytes} bytes`);
      writeAll(snapshotFd,chunk.subarray(0,count));
    }
    const after=fstatSync(sourceFd,{bigint:true});
    let pathAfter;
    try{pathAfter=lstatSync(path,{bigint:true})}catch{throw new Error(`${label} disappeared while it was snapshotted`)}
    if(stableProfileStatKey(before)!==stableProfileStatKey(after)||stableProfileStatKey(before)!==stableProfileStatKey(pathAfter)){
      throw new Error(`${label} changed while it was snapshotted`);
    }
    if(copied!==Number(before.size))throw new Error(`${label} size changed while it was snapshotted`);
    chmodSync(snapshot,mode);
    fsyncSync(snapshotFd);
    closeSync(snapshotFd);
    snapshotFd=null;
    closeSync(sourceFd);
    sourceFd=null;
    complete=true;
    return snapshot;
  }finally{
    if(sourceFd!==null)try{closeSync(sourceFd)}catch{}
    if(snapshotFd!==null)try{closeSync(snapshotFd)}catch{}
    if(!complete&&snapshotPresent)try{unlinkSync(snapshot)}catch{}
  }
}

function publishProfileSnapshot(snapshot,path,label){
  assertFreshOutput(path,label);
  const source=lstatSync(snapshot,{bigint:true});
  if(source.isSymbolicLink()||!source.isFile()||source.size<=0n)throw new Error(`${label} staging snapshot is invalid`);
  let linked=false;
  try{
    linkSync(snapshot,path);
    linked=true;
    const published=lstatSync(path,{bigint:true});
    if(!sameProfileInode(source,published))throw new Error(`${label} changed during atomic publication`);
    const dirFd=openSync(dirname(path),constants.O_RDONLY);
    try{fsyncSync(dirFd)}finally{closeSync(dirFd)}
  }catch(error){
    if(linked){
      try{
        const published=lstatSync(path,{bigint:true});
        if(published.dev===source.dev&&published.ino===source.ino)unlinkSync(path);
      }catch{}
    }
    throw error;
  }
}

function writeFreshJsonAtomically(path,value,label){
  assertFreshOutput(path,label);
  const directory=createPrivateProfileDir(dirname(path));
  const snapshot=join(directory,`.trusted-${randomUUID()}`);
  let fd=null;
  try{
    fd=openSync(snapshot,"wx",0o600);
    writeFileSync(fd,JSON.stringify(value,null,2)+"\n");
    fsyncSync(fd);
    closeSync(fd);
    fd=null;
    publishProfileSnapshot(snapshot,path,label);
  }finally{
    if(fd!==null)try{closeSync(fd)}catch{}
    rmSync(directory,{recursive:true,force:true});
  }
}

async function ensureCurrentSourceProfileDriver(root,{timeoutMs,maxBuffer}){
  const driver=profileDriverForReport();
  const sourceBefore=profileCurrentSourceSnapshot(root);
  const selected=validateProfileDriverReceipt(root,driver,sourceBefore);
  if(selected)return {ok:true,driver,identity:selected,build:null};
  const builder=CHENG_STAGE3_DRIVER;
  let builderFile;
  try{
    builderFile=stableRegularFile(builder,"official backend-driver builder");
    if((builderFile.mode&0o111)===0)throw new Error("official backend-driver builder is not executable");
  }catch(error){
    return {ok:false,driver,identity:null,build:null,reason:`current_source_driver_build_unavailable: ${error.message}`};
  }
  if(resolve(builder)===resolve(driver)){
    return {ok:false,driver,identity:null,build:null,reason:"current_source_driver_build_invalid: stage3 builder cannot impersonate the backend driver"};
  }
  const generationBefore={
    driver:profileArtifactGenerationKey(driver),
    map:profileArtifactGenerationKey(`${driver}.map`),
    provenance:profileArtifactGenerationKey(`${driver}.report.txt`)
  };
  const buildArgs=[
    "build-backend-driver",
    "--require-rebuild",
    `--profile-source-tree-sha256:${sourceBefore.sha256}`
  ];
  const build=await runProfileGuarded(root,builder,buildArgs,{
    timeoutMs:timeoutMs||1_200_000,maxBuffer,tag:"current-source-driver-build"
  });
  validateExactProfileGuardCommand(build.guard,{
    commandPath:builder,
    commandSha256:builderFile.sha256,
    commandArgv:[resolve(builder),...buildArgs]
  },"current-source driver build guard");
  let reason=processFailureReason("current-source driver build",build);
  if(!reason&&build.exitCode!==0)reason=`current_source_driver_build_failed: build-backend-driver exited ${build.exitCode}`;
  if(!reason&&!profileGuardProved(build.guard))reason="current_source_driver_build_guard_unproved: userspace process-tree guard did not prove the exact 1 GiB observed sample limit";
  if(reason)return {ok:false,driver,identity:null,build,reason};
  let sourceAfter;
  try{sourceAfter=profileCurrentSourceSnapshot(root)}
  catch(error){return {ok:false,driver,identity:null,build,reason:`current_source_driver_build_source_recheck_failed: ${error.message}`}}
  if(sourceAfter.sha256!==sourceBefore.sha256){
    return {ok:false,driver,identity:null,build,reason:`current_source_driver_build_source_drift: before=${sourceBefore.sha256} after=${sourceAfter.sha256}`};
  }
  const generationAfter={
    driver:profileArtifactGenerationKey(driver),
    map:profileArtifactGenerationKey(`${driver}.map`),
    provenance:profileArtifactGenerationKey(`${driver}.report.txt`)
  };
  for(const name of ["driver","map","provenance"]){
    if(generationBefore[name]!==null&&generationAfter[name]===generationBefore[name]){
      return {ok:false,driver,identity:null,build,reason:`current_source_driver_build_stale_artifact: build-backend-driver rc=0 did not refresh ${name}`};
    }
  }
  let identity;
  try{identity={...validateProfileDriverArtifacts(root,driver,sourceAfter),buildGuard:build.guard}}
  catch(error){return {ok:false,driver,identity:null,build,reason:`current_source_driver_contract_failed: ${error.message}`}}
  ensureProfileDriverReceiptDir(root);
  const receiptPath=profileDriverReceiptPath(root,sourceAfter.sha256,identity.driverSha256);
  if(pathAlreadyExists(receiptPath)){
    const selectedAfter=validateProfileDriverReceipt(root,driver,sourceAfter);
    if(!selectedAfter)return {ok:false,driver,identity:null,build,reason:"current_source_driver_receipt_selection_failed"};
    return {ok:true,driver,identity:{...selectedAfter,selection:"official_build_existing_receipt"},build};
  }
  writeFreshJsonAtomically(receiptPath,identity,"current-source profile driver receipt");
  const selectedAfter=validateProfileDriverReceipt(root,driver,sourceAfter);
  if(!selectedAfter)return {ok:false,driver,identity:null,build,reason:"current_source_driver_receipt_publication_failed"};
  return {ok:true,driver,identity:{...selectedAfter,selection:"official_build"},build};
}

function processFailureReason(prefix,run){
  if(run.missingDriver)return `${prefix} driver missing: ${run.driver||""}`;
  if(run.timedOut)return `${prefix} timed out`;
  if(run.overflow)return `${prefix} output overflow`;
  if(!Number.isInteger(run.exitCode))return `${prefix} produced no exit code`;
  return null;
}

function profileRawPathFromReport(reportPath){
  return reportPath.endsWith(".txt")?`${reportPath.slice(0,-4)}.raw.txt`:`${reportPath}.raw.txt`;
}

function profileInstrumentationReason(run){
  const text=`${run.stdout||""}\n${run.stderr||""}`;
  for(const phrase of [
    "profile-run requires full selfhost profiling command lowering",
    "profile-report requires full selfhost debug report lowering",
    "executable profiling is not available in cold backend driver"
  ]){
    if(text.includes(phrase))return `current_source_profile_instrumentation_unavailable: ${phrase}`;
  }
  return null;
}

async function runFormalProfile(action,source,input,driverState){
  const root=driverState.identity.root;
  const driver=driverState.driver;
  const publicExecutable=input.out?resolveProfilePath(input.out,root):null;
  const publicRaw=input.rawProfileOut?resolveProfilePath(input.rawProfileOut,root):null;
  const publicRawReceipt=input.rawReceiptOut
    ?resolveProfilePath(input.rawReceiptOut,root)
    :(publicRaw?`${publicRaw}.receipt.json`:null);
  const jsonReportOut=input.reportOut?resolveProfilePath(input.reportOut,root):null;
  const publicPaths=[publicExecutable,publicRaw,publicRawReceipt,jsonReportOut].filter(Boolean);
  if(new Set(publicPaths).size!==publicPaths.length)throw new Error("profile output paths must be distinct");
  for(const path of publicPaths)assertFreshOutput(path,"profile output");
  const tempDir=createPrivateProfileDir(publicPaths.length?dirname(publicPaths[0]):tmpdir());
  const stagedExecutable=join(tempDir,`.profile-executable-${randomUUID()}`);
  const stagedReport=join(tempDir,`.profile-${randomUUID()}.txt`);
  const stagedRaw=profileRawPathFromReport(stagedReport);
  const stagedConverted=join(tempDir,`.profile-converted-${randomUUID()}.txt`);
  const timeoutMs=input.timeoutSec?Math.round(input.timeoutSec*1000):undefined;
  const maxBuffer=input.maxOutputBytes||PROFILE_ARTIFACT_MAX_BYTES;
  const sourceBefore=stableRegularFile(source,"profile source");
  const treeBefore=profileCurrentSourceSnapshot(root);
  const args=[
    "profile-run",`--root:${root}`,`--in:${source}`,
    "--target:arm64-apple-darwin","--emit:exe",
    `--out:${stagedExecutable}`,`--report-out:${stagedReport}`
  ];
  const started=nowMs();
  try{
    const run=await runProfileGuarded(root,driver,args,{
      timeoutMs,maxBuffer,tag:"profile-run"
    });
    validateExactProfileGuardCommand(run.guard,{
      commandPath:driver,
      commandSha256:driverState.identity.driverSha256,
      commandArgv:[resolve(driver),...args]
    },"profile-run process guard");
    const elapsedMs=nowMs()-started;
    const executableOk=executableMaterialized(stagedExecutable);
    let rawEvidence=profileOutputEvidence(stagedRaw,maxBuffer);
    let reportEvidence=profileOutputEvidence(stagedReport,maxBuffer);
    let rawOk=false;
    let reportOk=false;
    let rawError=null;
    let reportError=null;
    let outputIdentity=null;
    if(executableOk){
      const outputFile=stableRegularFile(stagedExecutable,"profile executable output");
      outputIdentity={outputPath:stagedExecutable,outputSha256:outputFile.sha256};
    }
    try{
      assertCanonicalRawProfileEvidence(rawEvidence,{
        sourcePath:source,
        sourceSha256:sourceBefore.sha256,
        driverPath:run.guard.commandSnapshotPath,
        driverSha256:driverState.identity.driverSha256,
        ...outputIdentity
      });
      rawOk=true;
    }catch(error){rawError=error.message}
    try{
      if(!rawOk)throw new Error("raw profile unavailable");
      assertCanonicalProfileReportEvidence(reportEvidence,rawEvidence.profile);
      reportOk=true;
    }catch(error){reportError=error.message}
    let convert={missingDriver:false,driver,exitCode:null,stdout:"",stderr:"",stdoutBuffer:Buffer.alloc(0),stderrBuffer:Buffer.alloc(0),timedOut:false,overflow:false,guard:null};
    let convertedEvidence=profileOutputEvidence(stagedConverted,maxBuffer);
    if(rawOk){
      const convertArgs=["profile-report",`--in:${stagedRaw}`,`--out:${stagedConverted}`];
      convert=await runProfileGuarded(root,driver,convertArgs,{
        timeoutMs,maxBuffer,tag:"profile-report-contract"
      });
      validateExactProfileGuardCommand(convert.guard,{
        commandPath:driver,
        commandSha256:driverState.identity.driverSha256,
        commandArgv:[resolve(driver),...convertArgs]
      },"profile-report contract process guard");
      convertedEvidence=profileOutputEvidence(stagedConverted,maxBuffer);
    }
    let convertedOk=false;
    let convertedError=null;
    try{
      if(!rawOk)throw new Error("raw profile unavailable");
      assertCanonicalProfileReportEvidence(convertedEvidence,rawEvidence.profile);
      convertedOk=true;
    }catch(error){convertedError=error.message}
    const sourceAfter=stableRegularFile(source,"profile source");
    const treeAfter=profileCurrentSourceSnapshot(root);
    revalidateCurrentProfileDriverIdentity(root,driverState.identity);
    const sourceStable=sourceBefore.sha256===sourceAfter.sha256&&sourceBefore.bytes===sourceAfter.bytes;
    const treeStable=treeBefore.sha256===treeAfter.sha256&&treeAfter.sha256===driverState.identity.sourceTreeSha256;
    const processRunOk=processOk(run)&&run.exitCode===0&&profileGuardProved(run.guard);
    const processReportOk=processOk(convert)&&convert.exitCode===0&&profileGuardProved(convert.guard);
    let unsupportedReason=profileInstrumentationReason(run)||profileInstrumentationReason(convert)||processFailureReason("profile-run",run);
    if(!unsupportedReason&&run.exitCode!==0)unsupportedReason=`profile-run failed (${run.exitCode})`;
    if(!unsupportedReason&&!profileGuardProved(run.guard))unsupportedReason="profile-run userspace process-tree guard did not prove the exact 1 GiB observed sample limit";
    if(!unsupportedReason&&!executableOk)unsupportedReason="profile-run returned rc=0 without a fresh non-empty regular executable";
    if(!unsupportedReason&&!rawOk)unsupportedReason=`profile-run did not produce exact ${PROFILE_RAW_SCHEMA} raw evidence: ${rawError}`;
    if(!unsupportedReason&&!reportOk)unsupportedReason=`profile-run did not produce exact ${PROFILE_REPORT_SCHEMA} report evidence: ${reportError}`;
    if(!unsupportedReason)unsupportedReason=processFailureReason("profile-report contract",convert);
    if(!unsupportedReason&&convert.exitCode!==0)unsupportedReason=`profile-report contract failed (${convert.exitCode})`;
    if(!unsupportedReason&&!profileGuardProved(convert.guard))unsupportedReason="profile-report userspace process-tree guard did not prove the exact 1 GiB observed sample limit";
    if(!unsupportedReason&&!convertedOk)unsupportedReason=`profile-report contract did not produce exact ${PROFILE_REPORT_SCHEMA} evidence: ${convertedError}`;
    if(!unsupportedReason&&!sourceStable)unsupportedReason="profile source changed during profile-run";
    if(!unsupportedReason&&!treeStable)unsupportedReason="current-source tree changed during profile-run";
    const supported=processRunOk&&processReportOk&&executableOk&&rawOk&&reportOk&&convertedOk&&sourceStable&&treeStable&&!unsupportedReason;
    let executablePublished=false;
    let rawPublished=false;
    let rawReceiptPublished=false;
    let rawReceipt=null;
    if(supported&&publicExecutable){
      const trusted=snapshotStagedFile(stagedExecutable,tempDir,"profile executable output",{maxBytes:PROFILE_ARTIFACT_MAX_BYTES,mode:0o700,requireExecutable:true});
      publishProfileSnapshot(trusted,publicExecutable,"profile executable output");
      executablePublished=true;
    }
    if(supported&&publicRaw){
      const trusted=snapshotStagedFile(stagedRaw,tempDir,"raw profile output",{maxBytes:maxBuffer,mode:0o600});
      const trustedEvidence=assertCanonicalRawProfileEvidence(profileOutputEvidence(trusted,maxBuffer));
      publishProfileSnapshot(trusted,publicRaw,"raw profile output");
      rawPublished=true;
      rawReceipt={
        schema:PROFILE_RAW_RECEIPT_SCHEMA,
        root,
        sourcePath:source,
        sourceSha256:sourceAfter.sha256,
        sourceBytes:sourceAfter.bytes,
        sourceTreeSha256:treeAfter.sha256,
        driverPath:driver,
        driverSha256:driverState.identity.driverSha256,
        driverReceiptPath:driverState.identity.receiptPath,
        driverReceiptSha256:driverState.identity.receiptSha256,
        rawProfilePath:publicRaw,
        rawProfileSha256:sha256Bytes(trustedEvidence.buffer),
        rawProfileBytes:trustedEvidence.bytes,
        producerRawProfilePath:stagedRaw,
        sourceTreeCid:trustedEvidence.profile.sourceTreeCid,
        outputPath:trustedEvidence.profile.outputPath,
        outputSha256:trustedEvidence.profile.outputSha256,
        processGuard:run.guard
      };
      writeFreshJsonAtomically(publicRawReceipt,rawReceipt,"raw profile receipt");
      const committedRaw=validateRawProfileReceipt(
        root,publicRaw,publicRawReceipt,driverState.identity,maxBuffer);
      if(committedRaw.receiptSha256!==sha256Bytes(Buffer.from(JSON.stringify(rawReceipt,null,2)+"\n"))){
        throw new Error("raw profile receipt changed during atomic publication");
      }
      rawReceiptPublished=true;
    }
    const result=assertProfileReportToolSchema(bindProfileImplementation({
      schema:"cheng_profile_report_tool",
      action,
      driver,
      root,
      command:["cheng",...args].join(" "),
      exitCode:run.exitCode,
      status:supported?"completed":"CFAIL",
      supported,
      unsupportedReason:unsupportedReason||null,
      profileSchema:supported?PROFILE_REPORT_SCHEMA:null,
      maxOutputBytes:maxBuffer,
      driverIdentity:driverState.identity,
      build:driverState.build?{
        driver:driverState.build.driver,
        exitCode:driverState.build.exitCode,
        timedOut:Boolean(driverState.build.timedOut),
        overflow:Boolean(driverState.build.overflow),
        guard:driverState.build.guard,
        stdout:takeTrailingText(driverState.build.stdout),
        stderr:takeTrailingText(driverState.build.stderr)
      }:null,
      profile:{
        observationKind:"formal_profile_run",
        source,
        sourceSha256:sourceAfter.sha256,
        sourceTreeSha256:treeAfter.sha256,
        executable:{path:publicExecutable,materialized:executableOk,published:executablePublished},
        raw:{path:publicRaw,materialized:rawEvidence.materialized,bytes:rawEvidence.bytes,sha256:rawOk?sha256Bytes(rawEvidence.buffer):null,published:rawPublished},
        rawReceipt:{path:publicRawReceipt,published:rawReceiptPublished,value:rawReceipt},
        generatedReport:{materialized:reportEvidence.materialized,bytes:reportEvidence.bytes,valid:reportOk},
        processGuard:run.guard,
        reportContract:{exitCode:convert.exitCode,valid:convertedOk,timedOut:Boolean(convert.timedOut),overflow:Boolean(convert.overflow),guard:convert.guard,stdout:takeTrailingText(convert.stdout),stderr:takeTrailingText(convert.stderr)},
        checks:{processRunOk,processReportOk,executableOk,rawOk,reportOk,convertedOk,sourceStable,treeStable},
        elapsedMs
      },
      stdout:takeTrailingText(run.stdout),
      stderr:takeTrailingText(run.stderr)
    }));
    if(jsonReportOut)writeFreshJsonAtomically(jsonReportOut,result,"profile JSON report output");
    return result;
  }finally{
    rmSync(tempDir,{recursive:true,force:true});
  }
}

function validateRawProfileReceipt(root,rawPath,rawReceiptPath,driverIdentity,maxBuffer){
  const raw=assertCanonicalRawProfileEvidence(profileOutputEvidence(rawPath,maxBuffer));
  const receiptFile=stableRegularFile(rawReceiptPath,"raw profile receipt");
  let receipt;
  try{receipt=JSON.parse(PROFILE_UTF8_DECODER.decode(receiptFile.buffer))}
  catch{throw new Error("raw profile receipt is not canonical UTF-8 JSON")}
  if(receipt.schema!==PROFILE_RAW_RECEIPT_SCHEMA)throw new Error(`unsupported raw profile receipt schema: ${receipt.schema}`);
  if(PROFILE_UTF8_DECODER.decode(receiptFile.buffer)!==JSON.stringify(receipt,null,2)+"\n"){
    throw new Error("raw profile receipt is not canonical JSON");
  }
  const expected={
    root,
    rawProfilePath:rawPath,
    rawProfileSha256:sha256Bytes(raw.buffer),
    rawProfileBytes:raw.bytes,
    driverPath:driverIdentity.driverPath,
    driverSha256:driverIdentity.driverSha256,
    driverReceiptPath:driverIdentity.receiptPath,
    driverReceiptSha256:driverIdentity.receiptSha256,
    sourceTreeSha256:driverIdentity.sourceTreeSha256,
    sourceTreeCid:raw.profile.sourceTreeCid
  };
  for(const [key,value] of Object.entries(expected)){
    if(receipt[key]!==value)throw new Error(`raw profile receipt mismatch: ${key}`);
  }
  const expectedKeys=[
    "schema","root","sourcePath","sourceSha256","sourceBytes",
    "sourceTreeSha256","sourceTreeCid","driverPath","driverSha256",
    "driverReceiptPath","driverReceiptSha256","rawProfilePath",
    "rawProfileSha256","rawProfileBytes","producerRawProfilePath",
    "outputPath","outputSha256","processGuard"
  ].sort();
  if(JSON.stringify(Object.keys(receipt).sort())!==JSON.stringify(expectedKeys)){
    throw new Error("raw profile receipt has undeclared or missing fields");
  }
  const source=stableRegularFile(receipt.sourcePath,"raw profile source");
  if(source.sha256!==receipt.sourceSha256||source.bytes!==receipt.sourceBytes)throw new Error("raw profile source no longer matches its run receipt");
  if(raw.profile.sourcePath!==receipt.sourcePath ||
     raw.profile.sourceSha256!==receipt.sourceSha256 ||
     raw.profile.driverSha256!==receipt.driverSha256 ||
     raw.profile.outputPath!==receipt.outputPath ||
     raw.profile.outputSha256!==receipt.outputSha256){
    throw new Error("raw profile header does not match its run receipt");
  }
  const processGuard=validateStoredProfileGuard(root,receipt.processGuard,"raw profile process guard");
  if(raw.profile.driverPath!==processGuard.commandSnapshotPath ||
     raw.profile.driverSha256!==processGuard.commandSnapshotSha256){
    throw new Error("raw profile driver header does not match its guarded producer");
  }
  const producerReportPath=processGuard.commandArgv[7]?.startsWith("--report-out:")
    ?processGuard.commandArgv[7].slice("--report-out:".length)
    :"";
  if(!isAbsolute(receipt.producerRawProfilePath) ||
     profileRawPathFromReport(producerReportPath)!==receipt.producerRawProfilePath){
    throw new Error("raw profile producer path is not bound to profile-run report output");
  }
  assertInsideProject(receipt.producerRawProfilePath,root);
  assertInsideProject(raw.profile.outputPath,root);
  validateExactProfileGuardCommand(processGuard,{
    commandPath:driverIdentity.driverPath,
    commandSha256:driverIdentity.driverSha256,
    commandArgv:[
      resolve(driverIdentity.driverPath),
      "profile-run",
      `--root:${root}`,
      `--in:${receipt.sourcePath}`,
      "--target:arm64-apple-darwin",
      "--emit:exe",
      `--out:${raw.profile.outputPath}`,
      `--report-out:${producerReportPath}`
    ]
  },"raw profile process guard");
  if(!profileGuardProved(processGuard)){
    throw new Error("raw profile process guard did not complete successfully");
  }
  const rawAfter=assertCanonicalRawProfileEvidence(profileOutputEvidence(rawPath,maxBuffer));
  if(sha256Bytes(rawAfter.buffer)!==receipt.rawProfileSha256||rawAfter.bytes!==receipt.rawProfileBytes){
    throw new Error("raw profile changed during receipt validation");
  }
  const sourceAfter=stableRegularFile(receipt.sourcePath,"raw profile source");
  if(sourceAfter.sha256!==source.sha256||sourceAfter.bytes!==source.bytes){
    throw new Error("raw profile source changed during receipt validation");
  }
  const receiptAfter=stableRegularFile(rawReceiptPath,"raw profile receipt");
  if(receiptAfter.sha256!==receiptFile.sha256){
    throw new Error("raw profile receipt changed during validation");
  }
  revalidateCurrentProfileDriverIdentity(root,driverIdentity);
  return {receipt,receiptPath:rawReceiptPath,receiptSha256:receiptFile.sha256,raw};
}

var initChengProfileReportModule=defineModuleInitializer(()=>{
  initChengToolkitModule();
  chengProfileReportInputSchema=zodSchema.strictObject({
    action:zodSchema.enum(["probe","report","run"]),
    root:zodSchema.string().optional().describe("Explicit Cheng project root for this call. Must contain cheng-package.toml."),
    rawProfile:zodSchema.string().optional(),
    rawProfileOut:zodSchema.string().optional(),
    rawReceipt:zodSchema.string().optional(),
    rawReceiptOut:zodSchema.string().optional(),
    source:zodSchema.string().optional(),
    out:zodSchema.string().optional(),
    reportOut:zodSchema.string().optional(),
    timeoutSec:zodSchema.number().positive().optional().describe("Per compile/report/run process timeout in seconds."),
    maxOutputBytes:zodSchema.number().int().positive().max(PROFILE_ARTIFACT_MAX_BYTES).optional().describe("Maximum combined stdout+stderr bytes per process. Overflow is CFAIL. Default and maximum 1 GiB.")
  });
  ChengProfileReportTool=createChengTextTool({
    name:"cheng_profile_report",
    requiresChengProjectRoot:true,
    searchHint:"probe, run, or convert Cheng profiling reports",
    inputSchema:chengProfileReportInputSchema,
    description:"Build or select the exact-hash current-source backend driver, validate its formal profile-run/profile-report instrumentation contract, generate hash-bound raw profiles, and convert only raw profiles carrying the matching run receipt. Stage3 is builder-only and is never accepted as the profiling driver. Missing instrumentation, source drift, stale driver identity, timeout, overflow, missing artifacts, and schema contradictions are CFAIL.",
    prompt:"Use this for Cheng performance work; start with action=probe.",
    toAutoClassifierInput:(input)=>`profile:${input.action}`,
    async execute(input){
      const action=input.action||"probe";
      const root=resolveChengProjectRoot({root:input.root,file:input.source||input.rawProfile});
      const timeoutMs=input.timeoutSec?Math.round(input.timeoutSec*1000):undefined;
      const maxBuffer=input.maxOutputBytes||PROFILE_ARTIFACT_MAX_BYTES;
      if(action==="probe"){
        if(input.rawProfile||input.rawProfileOut||input.rawReceipt||input.rawReceiptOut||input.out||input.reportOut){
          throw new Error("action=probe accepts no output or raw-profile arguments");
        }
        const canary=resolveProjectPath(input.source||CHENG_CANARY,root);
        const driverState=await ensureCurrentSourceProfileDriver(root,{timeoutMs,maxBuffer});
        if(!driverState.ok){
          return jsonResult(assertProfileProbeReportSchema(bindProfileImplementation({
            schema:PROFILE_PROBE_SCHEMA,
            root,
            supported:false,
            driverContract:{supported:false,driver:driverState.driver,reason:driverState.reason,build:driverState.build},
            instrumentation:null
          })));
        }
        const instrumentation=await runFormalProfile("probe:profile-run",canary,{...input,root,out:undefined,rawProfileOut:undefined,rawReceiptOut:undefined,reportOut:undefined},driverState);
        return jsonResult(assertProfileProbeReportSchema(bindProfileImplementation({
          schema:PROFILE_PROBE_SCHEMA,
          root,
          supported:instrumentation.supported,
          driverContract:{supported:true,identity:driverState.identity},
          instrumentation
        })));
      }
      if(action==="report"){
        if(!input.rawProfile)throw new Error("action=report requires rawProfile");
        if(input.source||input.rawProfileOut||input.rawReceiptOut||input.reportOut){
          throw new Error("action=report accepts rawProfile, optional rawReceipt, and optional out only");
        }
        const raw=resolveProjectPath(input.rawProfile,root);
        const rawReceipt=resolveProfilePath(input.rawReceipt||`${raw}.receipt.json`,root);
        const publicOut=input.out?resolveProfilePath(input.out,root):null;
        const tempDir=createPrivateProfileDir(publicOut?dirname(publicOut):tmpdir());
        try{
          const driverState=await ensureCurrentSourceProfileDriver(root,{timeoutMs,maxBuffer});
          if(!driverState.ok){
            return jsonResult(assertProfileReportToolSchema(bindProfileImplementation({
              schema:"cheng_profile_report_tool",action:"report",driver:driverState.driver,root,
              command:"cheng profile-report",exitCode:null,status:"CFAIL",supported:false,
              unsupportedReason:driverState.reason,profileSchema:null,stdout:"",stderr:""
            })));
          }
          const rawIdentity=validateRawProfileReceipt(root,raw,rawReceipt,driverState.identity,maxBuffer);
          const trustedRaw=snapshotStagedFile(raw,tempDir,"raw profile input",{maxBytes:maxBuffer,mode:0o600});
          const trustedRawEvidence=assertCanonicalRawProfileEvidence(profileOutputEvidence(trustedRaw,maxBuffer));
          if(sha256Bytes(trustedRawEvidence.buffer)!==rawIdentity.receipt.rawProfileSha256)throw new Error("raw profile changed after receipt validation");
          const driverArgs=["profile-report",`--in:${trustedRaw}`];
          const displayArgs=["profile-report",`--in:${raw}`];
          let stagedOut=null;
          if(publicOut){
            assertFreshOutput(publicOut,"profile-report output");
            stagedOut=join(tempDir,`.driver-output-${randomUUID()}`);
            driverArgs.push(`--out:${stagedOut}`);
            displayArgs.push(`--out:${publicOut}`);
          }
          const reportRun=await runProfileGuarded(root,driverState.driver,driverArgs,{
            timeoutMs,maxBuffer,tag:"profile-report"
          });
          validateExactProfileGuardCommand(reportRun.guard,{
            commandPath:driverState.driver,
            commandSha256:driverState.identity.driverSha256,
            commandArgv:[resolve(driverState.driver),...driverArgs]
          },"profile-report process guard");
          revalidateCurrentProfileDriverIdentity(root,driverState.identity);
          let output=stagedOut?profileOutputEvidence(stagedOut,maxBuffer):null;
          let trustedOutput=null;
          if(output?.materialized&&!output.overflow&&!output.invalidUtf8){
            trustedOutput=snapshotStagedFile(stagedOut,tempDir,"profile-report output",{maxBytes:maxBuffer,mode:0o600});
            output=profileOutputEvidence(trustedOutput,maxBuffer);
          }
          if(processOk(reportRun)&&reportRun.exitCode===0){
            assertCanonicalProfileReportEvidence(output,rawIdentity.raw.profile);
          }
          const result=profileResult("report",displayArgs,reportRun,{
            root,
            profileOutputPath:publicOut,
            profileOutputMaterialized:output?.materialized,
            profileOutputBytes:output?.bytes,
            profileOutputOverflow:output?.overflow,
            profileOutputInvalidUtf8:output?.invalidUtf8,
            profileOutputBuffer:output?.buffer,
            profileOutputPublished:false
          });
          Object.assign(result,bindProfileImplementation({}));
          result.driverIdentity=driverState.identity;
          result.processGuard=reportRun.guard;
          if(!profileGuardProved(reportRun.guard)){
            result.supported=false;
            result.status="CFAIL";
            result.profileSchema=null;
            result.unsupportedReason="profile-report userspace process-tree guard did not prove the exact 1 GiB observed sample limit";
          }
          result.rawProfileIdentity={
            path:raw,
            sha256:rawIdentity.receipt.rawProfileSha256,
            receiptPath:rawIdentity.receiptPath,
            receiptSha256:rawIdentity.receiptSha256,
            sourcePath:rawIdentity.receipt.sourcePath,
            sourceSha256:rawIdentity.receipt.sourceSha256
          };
          if(publicOut&&result.supported){
            if(!trustedOutput)throw new Error("profile-report produced no trusted output to publish");
            publishProfileSnapshot(trustedOutput,publicOut,"profile-report output");
            result.output.published=true;
          }
          return jsonResult(result);
        }finally{
          rmSync(tempDir,{recursive:true,force:true});
        }
      }
      if(!input.source)throw new Error("action=run requires source");
      if(input.rawProfile||input.rawReceipt)throw new Error("action=run uses rawProfileOut/rawReceiptOut, not report inputs");
      if(input.rawReceiptOut&&!input.rawProfileOut)throw new Error("action=run rawReceiptOut requires rawProfileOut");
      const source=resolveProjectPath(input.source,root);
      assertInsideProject(source,root);
      const driverState=await ensureCurrentSourceProfileDriver(root,{timeoutMs,maxBuffer});
      if(!driverState.ok){
        const result=assertProfileReportToolSchema(bindProfileImplementation({
          schema:"cheng_profile_report_tool",action:"run",driver:driverState.driver,root,
          command:"cheng profile-run",exitCode:null,status:"CFAIL",supported:false,
          unsupportedReason:driverState.reason,profileSchema:null,
          build:driverState.build,stdout:"",stderr:""
        }));
        if(input.reportOut)writeFreshJsonAtomically(resolveProfilePath(input.reportOut,root),result,"profile JSON report output");
        return jsonResult(result);
      }
      return jsonResult(await runFormalProfile("run",source,{...input,root},driverState));
    }
  });
});

export {ChengProfileReportTool,assertProfileProbeReportSchema,initChengProfileReportModule};
