// @ts-nocheck
import {accessSync,chmodSync,closeSync,constants,fstatSync,fsyncSync,linkSync,lstatSync,mkdtempSync,openSync,readSync,rmSync,unlinkSync,writeFileSync,writeSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {tmpdir} from "node:os";
import {dirname,isAbsolute,join} from "node:path";
import {b as defineModuleInitializer} from "./runtime.ts";
import {CHENG_CANARY,createChengTextTool,jsonResult,profileDriverForReport,profileResult,resolveChengProjectRoot,resolveProjectPath,assertInsideProject,runChengDriver,takeTrailingText,initChengToolkitModule,zodSchema} from "./cheng_toolkit_m9000.ts";

var chengProfileReportInputSchema,ChengProfileReportTool;
const PROFILE_UTF8_DECODER=new TextDecoder("utf-8",{fatal:true});
const PROFILE_ARTIFACT_MAX_BYTES=1<<30;

function nowMs(){return Number(process.hrtime.bigint()/1000000n)}

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

function stableProfileStatKey(stat){
  return `${stat.dev}:${stat.ino}:${stat.mode}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
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

function processFailureReason(prefix,run){
  if(run.missingDriver)return `${prefix} driver missing: ${run.driver||""}`;
  if(run.timedOut)return `${prefix} timed out`;
  if(run.overflow)return `${prefix} output overflow`;
  if(!Number.isInteger(run.exitCode))return `${prefix} produced no exit code`;
  return null;
}

async function runProfileHarness(action,source,input={}){
  const root=resolveChengProjectRoot({root:input.root,file:source});
  const driver=profileDriverForReport();
  const publicOut=input.out?resolveProfilePath(input.out,root):null;
  const reportOut=input.reportOut?resolveProfilePath(input.reportOut,root):null;
  const tempDir=createPrivateProfileDir(publicOut?dirname(publicOut):tmpdir());
  const stagedOut=join(tempDir,`.driver-output-${randomUUID()}`);
  try{
    if(publicOut)assertFreshOutput(publicOut,"profile executable output");
    if(reportOut){
      if(reportOut===publicOut)throw new Error("profile reportOut must differ from executable out");
      assertFreshOutput(reportOut,"profile JSON report output");
    }
    const timeoutMs=input.timeoutSec?Math.round(input.timeoutSec*1000):undefined;
    const maxBuffer=input.maxOutputBytes||PROFILE_ARTIFACT_MAX_BYTES;
    const compileArgs=["system-link-exec",`--root:${root}`,`--in:${source}`,`--out:${stagedOut}`,"--target:arm64-apple-darwin","--emit:exe"];
    const started=nowMs();
    const compileStarted=nowMs();
    const compile=await runChengDriver(driver,compileArgs,{root,cwd:root,timeoutMs,maxBuffer});
    const compileElapsedMs=nowMs()-compileStarted;
    const compileProcessOk=processOk(compile);
    const outputPresent=pathAlreadyExists(stagedOut);
    const materialized=executableMaterialized(stagedOut);
    const materializationOk=Number.isInteger(compile.exitCode)&&(compile.exitCode===0?materialized:!outputPresent);
    const compileOk=compileProcessOk&&compile.exitCode===0&&materializationOk;
    let trustedExecutable=null;
    let run={missingDriver:false,driver:stagedOut,exitCode:null,stdout:"",stderr:"",timedOut:false,overflow:false};
    let runElapsedMs=0;
    if(compileOk){
      trustedExecutable=snapshotStagedFile(stagedOut,tempDir,"profile executable output",{maxBytes:PROFILE_ARTIFACT_MAX_BYTES,mode:0o700,requireExecutable:true});
      const runStarted=nowMs();
      run=await runChengDriver(trustedExecutable,[],{root,cwd:root,timeoutMs,maxBuffer});
      runElapsedMs=nowMs()-runStarted;
    }
    const runProcessOk=compileOk&&processOk(run);
    const totalElapsedMs=nowMs()-started;
    let unsupportedReason=processFailureReason("compile",compile);
    if(!unsupportedReason&&!materializationOk){
      unsupportedReason=compile.exitCode===0
        ? "compiler returned rc=0 without a fresh non-empty regular executable"
        : "compiler returned nonzero rc while leaving an output path";
    }
    if(!unsupportedReason&&compile.exitCode!==0)unsupportedReason=`system-link-exec failed (${compile.exitCode})`;
    if(!unsupportedReason)unsupportedReason=processFailureReason("run",run);
    if(!unsupportedReason)unsupportedReason="profile-run instrumentation is not wired; executable stdout is untrusted for profile schema";
    const supported=false;
    let published=false;
    if(publicOut&&compileOk){
      publishProfileSnapshot(trustedExecutable,publicOut,"profile executable output");
      published=true;
    }
    const result={
      schema:"cheng_profile_report_tool.v1",
      action,
      driver,
      root,
      command:["cheng","profile-run",`--root:${root}`,`--in:${source}`,"--target:arm64-apple-darwin","--emit:exe"].join(" "),
      exitCode:run.exitCode,
      status:supported?"completed":"CFAIL",
      supported,
      unsupportedReason,
      profileSchema:null,
      maxOutputBytes:maxBuffer,
      profile:{
        observationKind:"link_run_timing_only",
        source,
        executable:publicOut,
        temporaryExecutableCleaned:!publicOut,
        checks:{compileProcessOk,outputPresent,materialized,materializationOk,runProcessOk,published},
        compile:{exitCode:compile.exitCode,elapsedMs:compileElapsedMs,timedOut:Boolean(compile.timedOut),overflow:Boolean(compile.overflow),stdout:takeTrailingText(compile.stdout),stderr:takeTrailingText(compile.stderr)},
        run:{exitCode:run.exitCode,elapsedMs:runElapsedMs,timedOut:Boolean(run.timedOut),overflow:Boolean(run.overflow),stdout:takeTrailingText(run.stdout),stderr:takeTrailingText(run.stderr)},
        totalElapsedMs
      },
      stdout:takeTrailingText(run.stdout),
      stderr:takeTrailingText([compile.stderr,run.stderr].filter(Boolean).join("\n"))
    };
    if(reportOut)writeFreshJsonAtomically(reportOut,result,"profile JSON report output");
    return result;
  }finally{
    rmSync(tempDir,{recursive:true,force:true});
  }
}

var initChengProfileReportModule=defineModuleInitializer(()=>{
  initChengToolkitModule();
  chengProfileReportInputSchema=zodSchema.strictObject({
    action:zodSchema.enum(["probe","report","run"]),
    root:zodSchema.string().optional().describe("Explicit Cheng project root for this call. Must contain cheng-package.toml."),
    rawProfile:zodSchema.string().optional(),
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
    description:"Convert Cheng profile reports with strict evidence, or collect bounded link/run timing observations. action=report accepts an exact cheng_profile_v1 line only from the report process or a requested fresh, non-empty, regular, bounded --out. action=run validates real executable materialization and process boundaries but always returns CFAIL because formal profiler instrumentation is not wired; user-program output is never trusted as a profile schema. Timeout, overflow, missing exit status, missing marker, and materialization contradictions are CFAIL.",
    prompt:"Use this for Cheng performance work; start with action=probe.",
    toAutoClassifierInput:(input)=>`profile:${input.action}`,
    async execute(input){
      const action=input.action||"probe";
      const root=resolveChengProjectRoot({root:input.root,file:input.source||input.rawProfile});
      const timeoutMs=input.timeoutSec?Math.round(input.timeoutSec*1000):undefined;
      const maxBuffer=input.maxOutputBytes||PROFILE_ARTIFACT_MAX_BYTES;
      if(action==="probe"){
        const reportArgs=["profile-report"];
        const report=profileResult("probe:profile-report",reportArgs,await runChengDriver(profileDriverForReport(),reportArgs,{root,cwd:root,timeoutMs,maxBuffer}),{root});
        const canary=resolveProjectPath(CHENG_CANARY,root);
        const run=await runProfileHarness("probe:profile-run",canary,{...input,root});
        return jsonResult({schema:"cheng_profile_probe.v1",root,supported:report.supported||run.supported,report,run});
      }
      if(action==="report"){
        if(!input.rawProfile)throw new Error("action=report requires rawProfile");
        const raw=resolveProjectPath(input.rawProfile,root);
        const publicOut=input.out?resolveProfilePath(input.out,root):null;
        const tempDir=publicOut?createPrivateProfileDir(dirname(publicOut)):null;
        try{
          const driverArgs=["profile-report",`--in:${raw}`];
          const displayArgs=[...driverArgs];
          let stagedOut=null;
          if(publicOut){
            assertFreshOutput(publicOut,"profile-report output");
            stagedOut=join(tempDir,`.driver-output-${randomUUID()}`);
            driverArgs.push(`--out:${stagedOut}`);
            displayArgs.push(`--out:${publicOut}`);
          }
          const reportRun=await runChengDriver(profileDriverForReport(),driverArgs,{root,cwd:root,timeoutMs,maxBuffer});
          let output=stagedOut?profileOutputEvidence(stagedOut,maxBuffer):null;
          let trustedOutput=null;
          if(output?.materialized&&!output.overflow&&!output.invalidUtf8){
            trustedOutput=snapshotStagedFile(stagedOut,tempDir,"profile-report output",{maxBytes:maxBuffer,mode:0o600});
            output=profileOutputEvidence(trustedOutput,maxBuffer);
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
          if(publicOut&&result.supported){
            if(!trustedOutput)throw new Error("profile-report produced no trusted output to publish");
            publishProfileSnapshot(trustedOutput,publicOut,"profile-report output");
            result.output.published=true;
          }
          return jsonResult(result);
        }finally{
          if(tempDir)rmSync(tempDir,{recursive:true,force:true});
        }
      }
      if(!input.source)throw new Error("action=run requires source");
      const source=resolveProjectPath(input.source,root);
      assertInsideProject(source,root);
      return jsonResult(await runProfileHarness("run",source,{...input,root}));
    }
  });
});

export {ChengProfileReportTool,initChengProfileReportModule};
