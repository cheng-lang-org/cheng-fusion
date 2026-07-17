// @ts-nocheck
// Strict consumer for tools/zc_enumerate.sh's completed protocol and evidence set.
// A completed verdict is returned only when stdout, manifest, report, stderr, guard,
// and traces agree and every referenced file is a stable regular non-symlink file.
import {createHash} from "node:crypto";
import {closeSync,constants,fstatSync,lstatSync,openSync,readSync,realpathSync} from "node:fs";
import {dirname,isAbsolute,join,resolve} from "node:path";

const ZC_TARGET="arm64-apple-darwin";
const ZC_PROCESS_MAX_OUTPUT_BYTES=8*1024*1024;
const ZC_ARTIFACT_MAX_BYTES=64*1024*1024;
const ZC_STDOUT_ATTACHMENT_MAX_BYTES=64*1024*1024;
const ZC_OBJECT_MAX_BYTES=512*1024*1024;
const ZC_BAIL_HISTOGRAM_HEADER="zc_bail_histogram (bail号 -> count):";
const ZC_ROWS_HEADER="zc_rows (function|body_kind|detail|line|fz_kind|stmt_kind|bail):";
const SHA256_RE=/^[0-9a-f]{64}$/;
const UINT_RE=/^(0|[1-9][0-9]*)$/;
const SINT_RE=/^(0|-?[1-9][0-9]*)$/;
const RAW_ROW_RE=/^ZC_NOT_READY idx=([0-9]+)\/([0-9]+) function=(\S+) body_kind=(\S+) detail=(\S*) line=([0-9]+) fz_kind=([0-9]+) stmt_kind=([0-9]+) bail=(-?[0-9]+) slot_diag=(\S*)$/;

const ZC_CENSUS_FIELD_ORDER=[
  "zc_status","zc_driver","zc_driver_sha256","zc_driver_sha256_before","zc_driver_sha256_after",
  "zc_enumerator_sha256","zc_enumerator_sha256_after","zc_shared_rss_guard","zc_shared_rss_guard_sha256",
  "zc_shared_rss_guard_sha256_after","zc_rss_guard_report_sha256","zc_target","zc_file","zc_source_sha256",
  "zc_source_sha256_after","zc_git_worktree_state_sha256_before","zc_git_worktree_state_sha256_after",
  "zc_driver_rc","zc_compiler_csg_stderr","zc_progress","zc_rss_guard_schema","zc_rss_guard_status",
  "zc_rss_guard_rc","zc_rss_guard_abort_reason","zc_rss_guard_mode","zc_rss_guard_scope",
  "zc_rss_requested_limit_bytes","zc_rss_limit_bytes","zc_rss_enforcement_metric","zc_rss_enforcement_kind",
  "zc_rss_observed_sample_limit_status","zc_rss_hard_memory_limit_proof_status","zc_rss_poll_seconds",
  "zc_rss_measurement_status","zc_rss_sample_count","zc_process_tree_resident_peak_bytes",
  "zc_process_tree_phys_footprint_peak_bytes","zc_process_tree_enforced_peak_bytes",
  "zc_process_tree_peak_process_count","zc_process_tree_identity_history_peak_count","zc_root_identity_sampled",
  "zc_max_rss_bytes","zc_max_rss_kind","zc_max_rss_is_sampled","zc_census_pure_provenance",
  "zc_full_backend_codegen","zc_manifest","zc_manifest_sha256","zc_structured_report",
  "zc_structured_report_sha256","zc_child_stderr_full","zc_child_stderr_full_sha256",
  "zc_structured_report_missing_function_count","zc_structured_report_missing_function_row_count",
  "zc_stderr_full_missing_function_count","zc_stderr_full_total_count","zc_count_three_way_match",
  "zc_resource_trace","zc_resource_trace_bytes","zc_resource_trace_sample_count","zc_phase_trace",
  "zc_phase_trace_bytes","zc_phase_trace_sample_count","zc_missing_function_count","zc_zero","zc_zero_proof_scope",
];

const ZC_MANIFEST_FIELD_ORDER=[
  "schema","status","zc_enumerator","zc_enumerator_sha256_before","zc_enumerator_sha256_after",
  "source","source_sha256","source_sha256_after","git_worktree_state_schema",
  "git_worktree_state_sha256_before","git_worktree_state_sha256_after","driver","driver_sha256",
  "driver_sha256_before","driver_sha256_after","rss_guard","rss_guard_schema",
  "rss_guard_sha256_before","rss_guard_sha256_after","rss_guard_report","rss_guard_report_sha256",
  "rss_guard_limit_bytes","rss_guard_enforcement_metric","rss_guard_enforcement_kind",
  "rss_guard_observed_sample_limit_status","rss_guard_hard_memory_limit_proof_status",
  "rss_guard_poll_seconds","rss_guard_measurement_status","process_tree_resident_peak_bytes",
  "process_tree_phys_footprint_peak_bytes","process_tree_enforced_peak_bytes","target",
  "structured_report","structured_report_sha256","stderr_full","stderr_full_sha256",
  "stdout_full","stdout_full_sha256","object","object_status","object_sha256","object_size_bytes",
  "resource_trace","resource_trace_sha256","phase_trace","phase_trace_sha256",
  "structured_report_missing_function_count","structured_report_missing_function_row_count",
  "stderr_full_missing_function_count","stderr_full_total_count","zc_missing_function_count",
  "census_pure_provenance","full_backend_codegen","count_three_way_match","driver_rc",
];

function sha256Bytes(bytes){return createHash("sha256").update(bytes).digest("hex")}
function compareText(left,right){return String(left)<String(right)?-1:String(left)>String(right)?1:0}

function uint(value,label,{positive=false}={}){
  if(!UINT_RE.test(String(value)))throw new Error(`${label} must be a canonical uint`);
  const number=Number(value);
  if(!Number.isSafeInteger(number)||(positive&&number<=0))throw new Error(`${label} is outside the safe ${positive?"positive ":""}integer range`);
  return number;
}

function sint(value,label){
  if(!SINT_RE.test(String(value)))throw new Error(`${label} must be a canonical signed integer`);
  const number=Number(value);
  if(!Number.isSafeInteger(number))throw new Error(`${label} is outside the safe integer range`);
  return number;
}

function requireSha(value,label){
  if(!SHA256_RE.test(String(value)))throw new Error(`${label} must be a lowercase SHA-256`);
  return String(value);
}

function requireSame(fields,keys,label){
  const values=keys.map((key)=>fields[key]);
  if(new Set(values).size!==1)throw new Error(`${label} before/after SHA-256 mismatch`);
  return values[0];
}

function sameIdentity(left,right){
  return left.dev===right.dev&&left.ino===right.ino&&left.size===right.size&&left.mtimeNs===right.mtimeNs&&left.ctimeNs===right.ctimeNs;
}

function captureStableRegularFile(path,label,maxBytes=ZC_ARTIFACT_MAX_BYTES,{retainBytes=true,headBytes=64}={}){
  if(!isAbsolute(path))throw new Error(`${label} path must be absolute: ${path}`);
  let before;
  try{before=lstatSync(path,{bigint:true})}catch(error){throw new Error(`${label} cannot be inspected: ${path}: ${error instanceof Error?error.message:String(error)}`)}
  if(before.isSymbolicLink()||!before.isFile())throw new Error(`${label} must be a regular non-symlink file: ${path}`);
  if(before.size>BigInt(maxBytes))throw new Error(`${label} exceeds ${maxBytes} bytes: ${path}`);
  const noFollow=typeof constants.O_NOFOLLOW==="number"?constants.O_NOFOLLOW:0;
  let fd;
  try{
    fd=openSync(path,constants.O_RDONLY|noFollow);
    const opened=fstatSync(fd,{bigint:true});
    if(!opened.isFile()||!sameIdentity(before,opened))throw new Error(`${label} changed while opening: ${path}`);
    const size=Number(opened.size);
    if(!Number.isSafeInteger(size))throw new Error(`${label} size is outside the safe integer range: ${path}`);
    const hash=createHash("sha256");
    const bytes=retainBytes?Buffer.allocUnsafe(size):Buffer.allocUnsafe(Math.min(size,headBytes));
    const chunk=retainBytes?bytes:Buffer.allocUnsafe(Math.min(size,1024*1024));
    let offset=0;
    while(offset<size){
      const requested=retainBytes?size-offset:Math.min(chunk.length,size-offset);
      const count=readSync(fd,chunk,retainBytes?offset:0,requested,offset);
      if(count===0)throw new Error(`${label} was truncated while reading: ${path}`);
      const slice=retainBytes?chunk.subarray(offset,offset+count):chunk.subarray(0,count);
      hash.update(slice);
      if(!retainBytes&&offset<bytes.length)slice.copy(bytes,offset,0,Math.min(slice.length,bytes.length-offset));
      offset+=count;
    }
    const afterRead=fstatSync(fd,{bigint:true});
    const afterPath=lstatSync(path,{bigint:true});
    if(!sameIdentity(opened,afterRead)||!sameIdentity(opened,afterPath)||BigInt(size)!==opened.size){
      throw new Error(`${label} changed while reading: ${path}`);
    }
    return{path,label,maxBytes,retainBytes,headBytes,byteLength:size,bytes,hash:hash.digest("hex"),stat:opened};
  }finally{if(fd!==undefined)closeSync(fd)}
}

function assertSnapshotStillCurrent(snapshot){
  const current=captureStableRegularFile(snapshot.path,snapshot.label,snapshot.maxBytes,{retainBytes:snapshot.retainBytes,headBytes:snapshot.headBytes});
  if(!sameIdentity(snapshot.stat,current.stat)||snapshot.hash!==current.hash)throw new Error(`${snapshot.label} changed during validation: ${snapshot.path}`);
}

function capturePrivateDiagnosticDirectory(path){
  if(!isAbsolute(path))throw new Error(`ZC diagnostic directory path must be absolute: ${path}`);
  let before;
  try{before=lstatSync(path,{bigint:true})}catch(error){throw new Error(`ZC diagnostic directory cannot be inspected: ${path}: ${error instanceof Error?error.message:String(error)}`)}
  if(before.isSymbolicLink()||!before.isDirectory())throw new Error(`ZC diagnostic directory must be a non-symlink directory: ${path}`);
  if(realpathSync(path)!==resolve(path))throw new Error(`ZC diagnostic directory must be canonical: ${path}`);
  if((Number(before.mode)&0o077)!==0)throw new Error(`ZC diagnostic directory must be private (mode 0700 or stricter): ${path}`);
  if(typeof process.getuid==="function"&&before.uid!==BigInt(process.getuid()))throw new Error(`ZC diagnostic directory must be owned by the current user: ${path}`);
  return{path:resolve(path),stat:before};
}

function assertPrivateDiagnosticDirectoryStillCurrent(snapshot){
  const current=capturePrivateDiagnosticDirectory(snapshot.path);
  if(!sameIdentity(snapshot.stat,current.stat))throw new Error(`ZC diagnostic directory changed during validation: ${snapshot.path}`);
}

function decodeUtf8(bytes,label){
  try{return new TextDecoder("utf-8",{fatal:true}).decode(bytes)}catch(error){
    throw new Error(`${label} is not valid UTF-8: ${error instanceof Error?error.message:String(error)}`);
  }
}

function lineCount(bytes){
  if(bytes.length===0)return 0;
  let count=0;
  for(const byte of bytes)if(byte===10)count++;
  return bytes.at(-1)===10?count:count+1;
}

function parseKvText(snapshot,label,{uniqueKeys=null,exactKeys=null}={}){
  const text=decodeUtf8(snapshot.bytes,label);
  if(!text.endsWith("\n"))throw new Error(`${label} is truncated (missing final newline)`);
  const rows={},keys=[];
  for(const [index,line] of text.slice(0,-1).split("\n").entries()){
    if(line.length===0||line.endsWith("\r"))throw new Error(`${label} contains a blank or CRLF row at ${index+1}`);
    const separator=line.indexOf("=");
    if(separator<=0)throw new Error(`${label} contains a malformed row at ${index+1}`);
    const key=line.slice(0,separator),value=line.slice(separator+1);
    if(Object.hasOwn(rows,key)&&(uniqueKeys===null||uniqueKeys.has(key)))throw new Error(`${label} contains duplicate key ${key}`);
    rows[key]=value;keys.push(key);
  }
  if(exactKeys&&(keys.length!==exactKeys.length||keys.some((key,index)=>key!==exactKeys[index])))throw new Error(`${label} field order/schema mismatch: got=${keys.join(",")}`);
  return rows;
}

function requireKv(rows,key,label){
  if(!Object.hasOwn(rows,key))throw new Error(`${label} is missing ${key}`);
  return rows[key];
}

function requirePath(actual,expected,label){
  if(!isAbsolute(actual)||resolve(actual)!==resolve(expected))throw new Error(`${label} path mismatch: ${actual} != ${expected}`);
}

function requirePrivateAttachmentPath(actual,expected,diagDir,label){
  requirePath(actual,expected,label);
  if(dirname(resolve(actual))!==diagDir)throw new Error(`${label} must be directly inside the private ZC diagnostic directory: ${actual}`);
}

function assertRelocatableObject(bytes,target){
  if(bytes.length===0)throw new Error("ZC object must be nonempty");
  const targetText=String(target).toLowerCase();
  const wantsArm64=/(^|[-_])(arm64|aarch64)([-_]|$)/.test(targetText);
  const wantsX64=/(^|[-_])(x86_64|amd64)([-_]|$)/.test(targetText);
  const wantsRiscv64=/(^|[-_])riscv64([-_]|$)/.test(targetText);
  if(!wantsArm64&&!wantsX64&&!wantsRiscv64)throw new Error(`unsupported ZC object target architecture: ${target}`);
  const apple=/(^|[-_])(apple|darwin)([-_]|$)/.test(targetText);
  if(apple){
    if(bytes.length<32)throw new Error("ZC object is too small for a Mach-O 64 header");
    const magicLe=bytes.readUInt32LE(0),magicBe=bytes.readUInt32BE(0);
    let littleEndian;
    if(magicLe===0xfeedfacf)littleEndian=true;
    else if(magicBe===0xfeedfacf)littleEndian=false;
    else throw new Error("ZC object is not a Mach-O 64 object for the Darwin target");
    const read32=littleEndian?(offset)=>bytes.readUInt32LE(offset):(offset)=>bytes.readUInt32BE(offset);
    const cpuType=read32(4),fileType=read32(12);
    if(fileType!==1)throw new Error(`ZC Mach-O filetype must be MH_OBJECT (1), got ${fileType}`);
    const expectedCpu=wantsArm64?0x0100000c:wantsX64?0x01000007:null;
    if(expectedCpu===null||cpuType!==expectedCpu)throw new Error(`ZC Mach-O CPU type does not match target ${target}: got 0x${cpuType.toString(16)}`);
    return;
  }
  if(bytes.length<64||!bytes.subarray(0,4).equals(Buffer.from([0x7f,0x45,0x4c,0x46])))throw new Error("ZC object is not an ELF64 object for the non-Darwin target");
  if(bytes[4]!==2)throw new Error(`ZC ELF class must be ELFCLASS64 (2), got ${bytes[4]}`);
  if(bytes[5]!==1&&bytes[5]!==2)throw new Error(`ZC ELF data encoding is invalid: ${bytes[5]}`);
  const read16=bytes[5]===1?(offset)=>bytes.readUInt16LE(offset):(offset)=>bytes.readUInt16BE(offset);
  const fileType=read16(16),machine=read16(18);
  if(fileType!==1)throw new Error(`ZC ELF filetype must be ET_REL (1), got ${fileType}`);
  const expectedMachine=wantsArm64?183:wantsX64?62:243;
  if(machine!==expectedMachine)throw new Error(`ZC ELF machine does not match target ${target}: got ${machine}`);
}

function parsePipeRow(text){
  const columns=text.split("|");
  if(columns.length!==4&&columns.length!==7)throw new Error(`ZC row must have exactly 4 or 7 pipe fields: ${text}`);
  const requiredIndexes=columns.length===7?[0,1,3,4,5]:[0,1,3];
  if(requiredIndexes.some((index)=>columns[index].length===0))throw new Error(`ZC row contains an empty required field: ${text}`);
  const line=uint(columns[3],"ZC row line");
  if(columns.length===4)return{function:columns[0],bodyKind:columns[1],detail:columns[2],line,fzKind:null,stmtKind:null,bail:"none",raw:text,format:"pipe4"};
  const fzKind=uint(columns[4],"ZC row fz_kind");
  const stmtKind=uint(columns[5],"ZC row stmt_kind");
  if(columns[6]!=="")sint(columns[6],"ZC row bail");
  return{function:columns[0],bodyKind:columns[1],detail:columns[2],line,fzKind,stmtKind,bail:columns[6]||"none",raw:text,format:"pipe7"};
}

function parseRawRow(text,rowIndex,total){
  const match=text.match(RAW_ROW_RE);
  if(!match)throw new Error(`malformed raw ZC_NOT_READY row: ${text}`);
  const index=uint(match[1],"raw ZC row index"),denominator=uint(match[2],"raw ZC row denominator");
  if(index!==rowIndex||denominator!==total)throw new Error(`raw ZC row index/denominator mismatch at row ${rowIndex}: idx=${index}/${denominator} total=${total}`);
  const line=uint(match[6],"raw ZC row line"),fzKind=uint(match[7],"raw ZC row fz_kind"),stmtKind=uint(match[8],"raw ZC row stmt_kind");
  sint(match[9],"raw ZC row bail");
  return{function:match[3],bodyKind:match[4],detail:match[5],line,fzKind,stmtKind,bail:match[9],slotDiag:match[10],raw:text,format:"raw"};
}

function rowsAgree(structured,raw){
  if(structured.function!==raw.function||structured.bodyKind!==raw.bodyKind||structured.detail!==raw.detail||structured.line!==raw.line)return false;
  if(structured.format==="pipe7")return structured.fzKind===raw.fzKind&&structured.stmtKind===raw.stmtKind&&structured.bail===raw.bail;
  return true;
}

function aborted(reason,run,processOk=false){
  return{
    status:"aborted",total:null,totalRaw:null,fields:{},histogram:[],rows:[],rowCount:0,
    threeWayMatch:null,zeroProof:null,protocolError:reason,processOk,
    timedOut:Boolean(run?.timedOut),overflow:Boolean(run?.overflow),exitCode:Number.isInteger(run?.exitCode)?run.exitCode:null,
  };
}

function decodeProtocol(run){
  if(!Buffer.isBuffer(run?.stdoutBuffer))throw new Error("zc_enumerate stdoutBuffer raw bytes are required");
  const bytes=run.stdoutBuffer;
  if(bytes.length>ZC_PROCESS_MAX_OUTPUT_BYTES)throw new Error(`zc_enumerate stdout exceeds ${ZC_PROCESS_MAX_OUTPUT_BYTES} bytes`);
  return decodeUtf8(bytes,"zc_enumerate stdout");
}

function validateEvidence(fields,rows,total,expected){
  if(!expected.root||!expected.script||!expected.source||!expected.driver||!expected.diagDir||!expected.diagPrefix){
    throw new Error("root/script/source/driver/diagDir/diagPrefix are required for ZC evidence validation");
  }
  const target=expected.target||ZC_TARGET;
  const diagnosticDirectory=capturePrivateDiagnosticDirectory(expected.diagDir);
  if(fields.zc_target!==target)throw new Error(`zc_target mismatch: ${fields.zc_target} != ${target}`);
  requirePath(fields.zc_driver,expected.driver,"zc_driver");
  requirePath(fields.zc_file,expected.source,"zc_file");
  requirePath(fields.zc_shared_rss_guard,join(expected.root,"tools","beat_c_process_group_guard.sh"),"zc_shared_rss_guard");

  const prefix=String(expected.diagPrefix);
  if(!/^[A-Za-z0-9._-]+$/.test(prefix))throw new Error(`invalid expected ZC diagnostic prefix: ${prefix}`);
  const evidencePaths={
    manifest:join(diagnosticDirectory.path,`${prefix}.manifest.txt`),report:join(diagnosticDirectory.path,`${prefix}.report.txt`),
    stderr:join(diagnosticDirectory.path,`${prefix}.stderr_full.txt`),stdout:join(diagnosticDirectory.path,`${prefix}.stdout_full.txt`),
    guard:join(diagnosticDirectory.path,`${prefix}.guard.txt`),resource:join(diagnosticDirectory.path,`${prefix}.resource_trace.tsv`),
    phase:join(diagnosticDirectory.path,`${prefix}.phase_trace.tsv`),object:join(diagnosticDirectory.path,`${prefix}.object.o`),
  };
  requirePrivateAttachmentPath(fields.zc_manifest,evidencePaths.manifest,diagnosticDirectory.path,"zc_manifest");
  requirePrivateAttachmentPath(fields.zc_structured_report,evidencePaths.report,diagnosticDirectory.path,"zc_structured_report");
  requirePrivateAttachmentPath(fields.zc_child_stderr_full,evidencePaths.stderr,diagnosticDirectory.path,"zc_child_stderr_full");
  requirePrivateAttachmentPath(fields.zc_resource_trace,evidencePaths.resource,diagnosticDirectory.path,"zc_resource_trace");
  requirePrivateAttachmentPath(fields.zc_phase_trace,evidencePaths.phase,diagnosticDirectory.path,"zc_phase_trace");

  const driver=captureStableRegularFile(resolve(expected.driver),"ZC driver");
  const source=captureStableRegularFile(resolve(expected.source),"ZC source");
  const guardScript=captureStableRegularFile(resolve(join(expected.root,"tools","beat_c_process_group_guard.sh")),"ZC shared RSS guard");
  const enumerator=captureStableRegularFile(resolve(expected.script),"ZC enumerator");
  const driverHash=requireSame(fields,["zc_driver_sha256","zc_driver_sha256_before","zc_driver_sha256_after"],"driver");
  const sourceHash=requireSame(fields,["zc_source_sha256","zc_source_sha256_after"],"source");
  const guardHash=requireSame(fields,["zc_shared_rss_guard_sha256","zc_shared_rss_guard_sha256_after"],"shared RSS guard");
  const enumeratorHash=requireSame(fields,["zc_enumerator_sha256","zc_enumerator_sha256_after"],"enumerator");
  for(const [actual,declared,label] of [[driver.hash,driverHash,"driver"],[source.hash,sourceHash,"source"],[guardScript.hash,guardHash,"shared RSS guard"],[enumerator.hash,enumeratorHash,"enumerator"]]){
    if(actual!==declared)throw new Error(`ZC ${label} current SHA-256 mismatch: declared=${declared} actual=${actual}`);
  }

  const manifest=captureStableRegularFile(evidencePaths.manifest,"ZC manifest",2*1024*1024);
  if(manifest.hash!==requireSha(fields.zc_manifest_sha256,"zc_manifest_sha256"))throw new Error("ZC manifest SHA-256 mismatch");
  const manifestKv=parseKvText(manifest,"ZC manifest",{exactKeys:ZC_MANIFEST_FIELD_ORDER});
  const manifestExpected={
    schema:"zc_evidence_manifest.v1",status:"completed",zc_enumerator:resolve(expected.script),
    zc_enumerator_sha256_before:enumeratorHash,zc_enumerator_sha256_after:enumeratorHash,
    source:resolve(expected.source),source_sha256:sourceHash,source_sha256_after:sourceHash,
    git_worktree_state_schema:"git_worktree_state.v1",
    git_worktree_state_sha256_before:fields.zc_git_worktree_state_sha256_before,
    git_worktree_state_sha256_after:fields.zc_git_worktree_state_sha256_after,
    driver:resolve(expected.driver),driver_sha256:driverHash,driver_sha256_before:driverHash,driver_sha256_after:driverHash,
    rss_guard:resolve(join(expected.root,"tools","beat_c_process_group_guard.sh")),rss_guard_schema:fields.zc_rss_guard_schema,
    rss_guard_sha256_before:guardHash,rss_guard_sha256_after:guardHash,rss_guard_report:evidencePaths.guard,
    rss_guard_report_sha256:fields.zc_rss_guard_report_sha256,rss_guard_limit_bytes:fields.zc_rss_limit_bytes,
    rss_guard_enforcement_metric:fields.zc_rss_enforcement_metric,rss_guard_enforcement_kind:fields.zc_rss_enforcement_kind,
    rss_guard_observed_sample_limit_status:fields.zc_rss_observed_sample_limit_status,
    rss_guard_hard_memory_limit_proof_status:fields.zc_rss_hard_memory_limit_proof_status,
    rss_guard_poll_seconds:fields.zc_rss_poll_seconds,rss_guard_measurement_status:fields.zc_rss_measurement_status,
    process_tree_resident_peak_bytes:fields.zc_process_tree_resident_peak_bytes,
    process_tree_phys_footprint_peak_bytes:fields.zc_process_tree_phys_footprint_peak_bytes,
    process_tree_enforced_peak_bytes:fields.zc_process_tree_enforced_peak_bytes,target,
    structured_report:evidencePaths.report,structured_report_sha256:fields.zc_structured_report_sha256,
    stderr_full:evidencePaths.stderr,stderr_full_sha256:fields.zc_child_stderr_full_sha256,
    stdout_full:evidencePaths.stdout,object:evidencePaths.object,object_status:"present",
    resource_trace:evidencePaths.resource,phase_trace:evidencePaths.phase,
    structured_report_missing_function_count:String(total),structured_report_missing_function_row_count:String(total),
    stderr_full_missing_function_count:String(total),stderr_full_total_count:String(total),zc_missing_function_count:String(total),
    census_pure_provenance:fields.zc_census_pure_provenance,full_backend_codegen:fields.zc_full_backend_codegen,
    count_three_way_match:"1",driver_rc:fields.zc_driver_rc,
  };
  for(const [key,value] of Object.entries(manifestExpected))if(requireKv(manifestKv,key,"ZC manifest")!==value)throw new Error(`ZC manifest ${key} mismatch`);
  requirePrivateAttachmentPath(manifestKv.stdout_full,evidencePaths.stdout,diagnosticDirectory.path,"ZC manifest stdout_full");
  requirePrivateAttachmentPath(manifestKv.object,evidencePaths.object,diagnosticDirectory.path,"ZC manifest object");

  const report=captureStableRegularFile(evidencePaths.report,"ZC structured report");
  const stderr=captureStableRegularFile(evidencePaths.stderr,"ZC child stderr");
  const stdout=captureStableRegularFile(evidencePaths.stdout,"ZC child stdout",ZC_STDOUT_ATTACHMENT_MAX_BYTES);
  const object=captureStableRegularFile(evidencePaths.object,"ZC object",ZC_OBJECT_MAX_BYTES,{retainBytes:false,headBytes:64});
  const guard=captureStableRegularFile(evidencePaths.guard,"ZC RSS guard report",2*1024*1024);
  const resource=captureStableRegularFile(evidencePaths.resource,"ZC resource trace");
  const phase=captureStableRegularFile(evidencePaths.phase,"ZC phase trace");
  const hashChecks=[
    [report.hash,requireSha(fields.zc_structured_report_sha256,"zc_structured_report_sha256"),"structured report"],
    [stderr.hash,requireSha(fields.zc_child_stderr_full_sha256,"zc_child_stderr_full_sha256"),"child stderr"],
    [stdout.hash,requireSha(requireKv(manifestKv,"stdout_full_sha256","ZC manifest"),"manifest stdout_full_sha256"),"child stdout"],
    [object.hash,requireSha(requireKv(manifestKv,"object_sha256","ZC manifest"),"manifest object_sha256"),"object"],
    [guard.hash,requireSha(fields.zc_rss_guard_report_sha256,"zc_rss_guard_report_sha256"),"RSS guard report"],
    [resource.hash,requireSha(requireKv(manifestKv,"resource_trace_sha256","ZC manifest"),"manifest resource_trace_sha256"),"resource trace"],
    [phase.hash,requireSha(requireKv(manifestKv,"phase_trace_sha256","ZC manifest"),"manifest phase_trace_sha256"),"phase trace"],
  ];
  for(const [actual,declared,label] of hashChecks)if(actual!==declared)throw new Error(`ZC ${label} SHA-256 mismatch`);
  const objectSize=uint(requireKv(manifestKv,"object_size_bytes","ZC manifest"),"manifest object_size_bytes",{positive:true});
  if(object.byteLength!==objectSize)throw new Error(`ZC object size mismatch: declared=${objectSize} actual=${object.byteLength}`);
  decodeUtf8(stdout.bytes,"ZC child stdout");
  assertRelocatableObject(object.bytes,target);

  const reportKv=parseKvText(report,"ZC structured report",{uniqueKeys:new Set([
    "primary_object_missing_function_count","primary_object_missing_functions","census_pure_provenance","full_backend_codegen",
  ])});
  const reportCount=uint(requireKv(reportKv,"primary_object_missing_function_count","ZC structured report"),"report primary_object_missing_function_count");
  const reportRowsRaw=requireKv(reportKv,"primary_object_missing_functions","ZC structured report");
  const structuredRows=reportRowsRaw==="-"?[]:reportRowsRaw.split(";;").map(parsePipeRow);
  if(structuredRows.length!==reportCount)throw new Error(`structured report row count mismatch: rows=${structuredRows.length} count=${reportCount}`);
  if(requireKv(reportKv,"census_pure_provenance","ZC structured report")!==fields.zc_census_pure_provenance||requireKv(reportKv,"full_backend_codegen","ZC structured report")!==fields.zc_full_backend_codegen){
    throw new Error("structured report backend provenance mismatch");
  }

  const stderrText=decodeUtf8(stderr.bytes,"ZC child stderr");
  const stderrLines=stderrText.split("\n");
  const rawLines=stderrLines.filter((line)=>line.startsWith("ZC_NOT_READY "));
  const totalLines=stderrLines.filter((line)=>line.startsWith("ZC_NOT_READY_TOTAL"));
  if(totalLines.length!==1)throw new Error(`child stderr must contain exactly one ZC_NOT_READY_TOTAL row, got ${totalLines.length}`);
  const totalMatch=totalLines[0].match(/^ZC_NOT_READY_TOTAL count=([0-9]+)$/);
  if(!totalMatch)throw new Error("child stderr ZC_NOT_READY_TOTAL row is malformed");
  const stderrTotal=uint(totalMatch[1],"stderr ZC_NOT_READY_TOTAL count");
  const stderrRows=rawLines.map((line,index)=>parseRawRow(line,index,stderrTotal));

  if(total!==reportCount||total!==structuredRows.length||total!==stderrRows.length||total!==stderrTotal)throw new Error(`independent three-way count mismatch: stdout=${total} report_count=${reportCount} report_rows=${structuredRows.length} stderr_rows=${stderrRows.length} stderr_total=${stderrTotal}`);
  if(rows.length!==structuredRows.length||rows.some((row,index)=>row.format==="raw"||row.raw!==structuredRows[index].raw))throw new Error("stdout rows disagree with structured report rows");
  if(structuredRows.some((row,index)=>!rowsAgree(row,stderrRows[index])))throw new Error("structured report rows disagree with child stderr rows");
  const declaredCountKeys=["zc_structured_report_missing_function_count","zc_structured_report_missing_function_row_count","zc_stderr_full_missing_function_count","zc_stderr_full_total_count"];
  for(const key of declaredCountKeys)if(uint(fields[key],key)!==total)throw new Error(`${key} disagrees with independently verified count`);

  const guardKv=parseKvText(guard,"ZC RSS guard report");
  const guardExpected={
    tool:"tools/beat_c_process_group_guard.sh",schema:fields.zc_rss_guard_schema,status:fields.zc_rss_guard_status,
    rc:fields.zc_rss_guard_rc,abort_reason:fields.zc_rss_guard_abort_reason,memory_guard_mode:fields.zc_rss_guard_mode,
    memory_guard_scope:fields.zc_rss_guard_scope,memory_limit_bytes:fields.zc_rss_limit_bytes,
    memory_enforcement_metric:fields.zc_rss_enforcement_metric,enforcement_kind:fields.zc_rss_enforcement_kind,
    observed_sample_limit_status:fields.zc_rss_observed_sample_limit_status,
    hard_memory_limit_proof_status:fields.zc_rss_hard_memory_limit_proof_status,poll_seconds:fields.zc_rss_poll_seconds,
    memory_measurement_status:fields.zc_rss_measurement_status,memory_sample_count:fields.zc_rss_sample_count,
    process_tree_resident_peak_bytes:fields.zc_process_tree_resident_peak_bytes,
    process_tree_phys_footprint_peak_bytes:fields.zc_process_tree_phys_footprint_peak_bytes,
    process_tree_enforced_peak_bytes:fields.zc_process_tree_enforced_peak_bytes,
    process_tree_peak_process_count:fields.zc_process_tree_peak_process_count,
    process_tree_identity_history_peak_count:fields.zc_process_tree_identity_history_peak_count,
    root_identity_sampled:fields.zc_root_identity_sampled,
  };
  for(const [key,value] of Object.entries(guardExpected))if(requireKv(guardKv,key,"ZC RSS guard report")!==value)throw new Error(`ZC RSS guard report ${key} mismatch`);
  requirePath(requireKv(guardKv,"stdout","ZC RSS guard report"),evidencePaths.stdout,"ZC guard stdout");
  requirePath(requireKv(guardKv,"stderr","ZC RSS guard report"),evidencePaths.stderr,"ZC guard stderr");
  uint(requireKv(guardKv,"timeout_seconds","ZC RSS guard report"),"guard timeout_seconds");

  const resourceBytes=uint(fields.zc_resource_trace_bytes,"zc_resource_trace_bytes"),resourceLines=uint(fields.zc_resource_trace_sample_count,"zc_resource_trace_sample_count");
  const phaseBytes=uint(fields.zc_phase_trace_bytes,"zc_phase_trace_bytes"),phaseLines=uint(fields.zc_phase_trace_sample_count,"zc_phase_trace_sample_count");
  if(resource.bytes.length!==resourceBytes||lineCount(resource.bytes)!==resourceLines)throw new Error("resource trace byte/line count mismatch");
  if(phase.bytes.length!==phaseBytes||lineCount(phase.bytes)!==phaseLines)throw new Error("phase trace byte/line count mismatch");
  for(const [snapshot,count,kind] of [[resource,resourceLines,"resource"],[phase,phaseLines,"phase"]]){
    const text=decodeUtf8(snapshot.bytes,`ZC ${kind} trace`);
    const traceRows=text.length===0?[]:text.replace(/\n$/,"").split("\n");
    if(traceRows.length!==count)throw new Error(`${kind} trace parsed row count mismatch`);
    const pattern=kind==="resource"?/^(0|[1-9][0-9]*)\t(0|[1-9][0-9]*)$/:/^(0|[1-9][0-9]*)\t(0|[1-9][0-9]*)\t.+$/;
    for(const row of traceRows){
      const match=row.match(pattern);
      if(!match)throw new Error(`malformed ${kind} trace row: ${row}`);
      uint(match[1],`${kind} trace timestamp`);uint(match[2],`${kind} trace memory`);
    }
  }

  for(const snapshot of [driver,source,guardScript,enumerator,manifest,report,stderr,stdout,object,guard,resource,phase])assertSnapshotStillCurrent(snapshot);
  assertPrivateDiagnosticDirectoryStillCurrent(diagnosticDirectory);
}

function parseCompletedProtocol(run,expected={}){
  const text=decodeProtocol(run);
  if(!text.endsWith("\n"))throw new Error("zc_enumerate stdout is truncated (missing final newline)");
  const lines=text.slice(0,-1).split("\n");
  if(lines.some((line)=>line.length===0||line.endsWith("\r")))throw new Error("zc_enumerate stdout contains a blank or CRLF protocol line");
  const histogramHeaders=lines.reduce((out,line,index)=>line===ZC_BAIL_HISTOGRAM_HEADER?[...out,index]:out,[]);
  const rowHeaders=lines.reduce((out,line,index)=>line===ZC_ROWS_HEADER?[...out,index]:out,[]);
  if(histogramHeaders.length!==1||rowHeaders.length!==1||histogramHeaders[0]>=rowHeaders[0])throw new Error("zc_enumerate section headers must each appear exactly once in histogram→rows order");
  const histogramHeaderIndex=histogramHeaders[0],rowsHeaderIndex=rowHeaders[0];

  const fields={},keys=[];
  for(const line of lines.slice(0,histogramHeaderIndex)){
    const index=line.indexOf("=");
    if(index<=0)throw new Error(`malformed zc_enumerate key/value line: ${line}`);
    const key=line.slice(0,index),value=line.slice(index+1);
    if(Object.hasOwn(fields,key))throw new Error(`duplicate zc_enumerate key: ${key}`);
    fields[key]=value;keys.push(key);
  }
  if(keys.length!==ZC_CENSUS_FIELD_ORDER.length||keys.some((key,index)=>key!==ZC_CENSUS_FIELD_ORDER[index]))throw new Error(`zc_enumerate key order/schema mismatch: got=${keys.join(",")}`);
  if(fields.zc_status!=="completed")throw new Error(`zc_status must be completed, got ${fields.zc_status}`);
  const total=uint(fields.zc_missing_function_count,"zc_missing_function_count");
  if(fields.zc_count_three_way_match!=="1")throw new Error("zc_count_three_way_match must be 1");

  const histogram=[],histogramBails=new Set();
  let previousCount=Number.POSITIVE_INFINITY;
  for(const line of lines.slice(histogramHeaderIndex+1,rowsHeaderIndex)){
    const match=line.match(/^  bail=(none|0|-?[1-9][0-9]*) count=([0-9]+)$/);
    if(!match)throw new Error(`malformed ZC histogram line: ${line}`);
    if(match[1]!=="none")sint(match[1],"ZC histogram bail");
    const count=uint(match[2],"ZC histogram count",{positive:true});
    if(histogramBails.has(match[1]))throw new Error(`duplicate ZC histogram bail: ${match[1]}`);
    if(count>previousCount)throw new Error("ZC histogram must be ordered by non-increasing count");
    previousCount=count;histogramBails.add(match[1]);histogram.push({bail:match[1],count});
  }

  const rowSection=lines.slice(rowsHeaderIndex+1);
  if(rowSection.length===0)throw new Error("zc_enumerate rows section is truncated (missing cache trailer)");
  const cacheLine=rowSection.at(-1);
  if(!/^zc_cache=(semantic_hit|semantic_miss) key=[0-9a-f]{16}$/.test(cacheLine))throw new Error(`invalid or missing zc_cache trailer: ${cacheLine}`);
  const rows=[],rowKeys=new Set();
  for(const line of rowSection.slice(0,-1)){
    if(!line.startsWith("  "))throw new Error(`ZC row must use the canonical two-space prefix: ${line}`);
    const row=parsePipeRow(line.slice(2));
    const key=JSON.stringify([row.function,row.bodyKind,row.detail,row.line,row.fzKind,row.stmtKind,row.bail]);
    if(rowKeys.has(key))throw new Error(`duplicate ZC row: ${row.raw}`);
    rowKeys.add(key);rows.push(row);
  }
  const rowFormats=new Set(rows.map((row)=>row.format));
  if(rowFormats.size>1)throw new Error(`ZC rows must use exactly one representation, got ${[...rowFormats].join(",")}`);
  if(rows.length!==total)throw new Error(`ZC row count mismatch: rows=${rows.length} total=${total}`);

  const derivedHistogram=new Map();
  for(const row of rows)derivedHistogram.set(String(row.bail),(derivedHistogram.get(String(row.bail))||0)+1);
  if(histogram.length!==derivedHistogram.size)throw new Error(`ZC histogram group count mismatch: histogram=${histogram.length} rows=${derivedHistogram.size}`);
  for(const entry of histogram)if(derivedHistogram.get(entry.bail)!==entry.count)throw new Error(`ZC histogram mismatch for bail=${entry.bail}: histogram=${entry.count} rows=${derivedHistogram.get(entry.bail)||0}`);

  const hashKeys=["zc_driver_sha256","zc_driver_sha256_before","zc_driver_sha256_after","zc_enumerator_sha256","zc_enumerator_sha256_after","zc_shared_rss_guard_sha256","zc_shared_rss_guard_sha256_after","zc_rss_guard_report_sha256","zc_source_sha256","zc_source_sha256_after","zc_git_worktree_state_sha256_before","zc_git_worktree_state_sha256_after","zc_manifest_sha256","zc_structured_report_sha256","zc_child_stderr_full_sha256"];
  for(const key of hashKeys)requireSha(fields[key],key);
  requireSame(fields,["zc_git_worktree_state_sha256_before","zc_git_worktree_state_sha256_after"],"git worktree state");
  const driverRc=uint(fields.zc_driver_rc,"zc_driver_rc");
  if(uint(fields.zc_rss_guard_rc,"zc_rss_guard_rc")!==driverRc)throw new Error("RSS guard rc must equal driver rc");
  if(fields.zc_compiler_csg_stderr!=="0"||fields.zc_progress!=="0")throw new Error("controlled ZC diagnostics/progress contract mismatch");
  if(fields.zc_rss_guard_schema!=="beat_c_process_memory_guard.v4"||fields.zc_rss_guard_status!=="completed"||fields.zc_rss_guard_abort_reason!=="")throw new Error("RSS guard completed schema/status/abort contract mismatch");
  if(fields.zc_rss_guard_mode!=="process_tree"||fields.zc_rss_guard_scope!=="identity_history_union_group_and_descendants")throw new Error("RSS guard mode/scope contract mismatch");
  const requestedLimit=uint(fields.zc_rss_requested_limit_bytes,"zc_rss_requested_limit_bytes",{positive:true});
  const effectiveLimit=uint(fields.zc_rss_limit_bytes,"zc_rss_limit_bytes",{positive:true});
  if(requestedLimit!==1073741824||effectiveLimit!==requestedLimit)throw new Error("RSS guard production limit contract mismatch");
  if(fields.zc_rss_observed_sample_limit_status!=="proved"||fields.zc_rss_hard_memory_limit_proof_status!=="not_provable_userspace_poll"||fields.zc_rss_poll_seconds!=="0.01"||fields.zc_rss_measurement_status!=="available")throw new Error("RSS guard proof/measurement contract mismatch");
  uint(fields.zc_rss_sample_count,"zc_rss_sample_count",{positive:true});
  const resident=uint(fields.zc_process_tree_resident_peak_bytes,"zc_process_tree_resident_peak_bytes",{positive:true});
  const footprint=uint(fields.zc_process_tree_phys_footprint_peak_bytes,"zc_process_tree_phys_footprint_peak_bytes");
  const enforced=uint(fields.zc_process_tree_enforced_peak_bytes,"zc_process_tree_enforced_peak_bytes",{positive:true});
  if(enforced!==Math.max(resident,footprint)||enforced>effectiveLimit)throw new Error("RSS guard enforced peak contract mismatch");
  uint(fields.zc_process_tree_peak_process_count,"zc_process_tree_peak_process_count",{positive:true});
  uint(fields.zc_process_tree_identity_history_peak_count,"zc_process_tree_identity_history_peak_count",{positive:true});
  if(fields.zc_root_identity_sampled!=="1"||uint(fields.zc_max_rss_bytes,"zc_max_rss_bytes")!==enforced||fields.zc_max_rss_kind!=="sampled_process_tree_enforced_peak"||fields.zc_max_rss_is_sampled!=="1")throw new Error("RSS guard root/max-RSS alias contract mismatch");
  const metricKind=`${fields.zc_rss_enforcement_metric}|${fields.zc_rss_enforcement_kind}`;
  if(metricKind==="max_process_tree_resident_and_phys_footprint|darwin_cooperative_process_tree_poll"){
    if(footprint<=0)throw new Error("Darwin RSS guard must report positive phys_footprint");
  }else if(metricKind==="process_tree_resident|userspace_cooperative_process_tree_poll"){
    if(footprint!==0)throw new Error("non-Darwin RSS guard must report zero phys_footprint");
  }else throw new Error("RSS guard enforcement metric/kind contract mismatch");
  if(total===0){
    if(driverRc!==0||fields.zc_census_pure_provenance!=="full_backend_ready"||fields.zc_full_backend_codegen!=="1"||fields.zc_zero!=="proved"||fields.zc_zero_proof_scope!=="semantic_census_and_observed_sample_resource_gate")throw new Error("zero census proof/provenance contract mismatch");
  }else if(fields.zc_census_pure_provenance!=="not_ready_functions_present"||fields.zc_full_backend_codegen!=="0"||fields.zc_zero!=="not_proved"||fields.zc_zero_proof_scope!=="semantic_census_incomplete")throw new Error("nonzero census provenance/zero-proof contract mismatch");

  validateEvidence(fields,rows,total,expected);
  return{status:"completed",total,totalRaw:fields.zc_missing_function_count,fields,histogram,rows,rowCount:rows.length,threeWayMatch:true,zeroProof:fields.zc_zero,protocolError:null,processOk:true,timedOut:false,overflow:false,exitCode:run.exitCode};
}

function parseZcCensusRun(run,expected={}){
  const processOk=Boolean(run)&&run.missingDriver!==true&&run.timedOut!==true&&run.overflow!==true&&Number.isInteger(run.exitCode)&&run.exitCode===0;
  if(!processOk)return aborted(`zc_enumerate process failed: exit=${run?.exitCode??"null"} missing=${Boolean(run?.missingDriver)} timeout=${Boolean(run?.timedOut)} overflow=${Boolean(run?.overflow)}`,run,false);
  try{return parseCompletedProtocol(run,expected)}catch(error){return aborted(error instanceof Error?error.message:String(error),run,true)}
}

function clusterZcCensusRows(rows){
  const byBail=new Map(),byBodyKind=new Map();
  for(const row of rows){
    const bail=String(row.bail),bodyKind=row.bodyKind;
    if(!byBail.has(bail))byBail.set(bail,[]);byBail.get(bail).push(row.function);
    if(!byBodyKind.has(bodyKind))byBodyKind.set(bodyKind,[]);byBodyKind.get(bodyKind).push(row);
  }
  return{
    byBail:[...byBail].map(([bail,functions])=>({bail,count:functions.length,functions})).sort((a,b)=>b.count-a.count||compareText(a.bail,b.bail)),
    byBodyKind:[...byBodyKind].map(([bodyKind,list])=>({bodyKind,count:list.length,functions:list.map((row)=>row.function),details:list.map((row)=>row.detail)})).sort((a,b)=>b.count-a.count||compareText(a.bodyKind,b.bodyKind)),
  };
}

export{ZC_CENSUS_FIELD_ORDER,ZC_PROCESS_MAX_OUTPUT_BYTES,ZC_TARGET,clusterZcCensusRows,parseZcCensusRun};
