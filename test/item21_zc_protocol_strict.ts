#!/usr/bin/env bun
import {createHash} from "node:crypto";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {chmodSync,copyFileSync,existsSync,mkdtempSync,mkdirSync,readFileSync,realpathSync,rmSync,symlinkSync,truncateSync,unlinkSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {buildAttackOrder} from "../src/cheng_residual_peel_m9019.ts";
import {assertZcCensusReportSchema} from "../src/cheng_zc_census_m9014.ts";
import {ZC_CENSUS_FIELD_ORDER,ZC_PROCESS_MAX_OUTPUT_BYTES,ZC_TARGET,parseZcCensusRun} from "../src/zc_census_protocol.ts";
import {assertTrue,startMcp} from "./mcp_client.ts";

function sha256Bytes(bytes:Buffer|string){return createHash("sha256").update(bytes).digest("hex")}
function sha256(path:string){return sha256Bytes(readFileSync(path))}
function bytesAndLines(path:string){
  const bytes=readFileSync(path);let lines=0;
  for(const byte of bytes)if(byte===10)lines++;
  if(bytes.length>0&&bytes.at(-1)!==10)lines++;
  return{bytes:bytes.length,lines};
}

function makeFixtureRoot(){
  const root=realpathSync(mkdtempSync(join(tmpdir(),"fusion-zc-protocol-")));
  const tools=join(root,"tools"),source=join(root,"src/core/tooling/backend_driver_dispatch_min.cheng");
  const driver=join(root,"artifacts/backend_driver/cheng"),guard=join(tools,"beat_c_process_group_guard.sh"),script=join(tools,"zc_enumerate.sh");
  mkdirSync(dirname(source),{recursive:true});mkdirSync(dirname(driver),{recursive:true});mkdirSync(tools,{recursive:true});
  writeFileSync(join(root,"cheng-package.toml"),'name = "zc-protocol"\n');
  writeFileSync(source,"fn main(): int32 =\n    return 0\n");
  for(const [relative,text] of [
    ["src/std/seqs.cheng","fn freeSeq(items: str[]): int32 =\n    return 0\n"],
    ["src/core/backend/primary_object_plan.cheng","fn BuildPlan(): int32 =\n    return 0\n"],
    ["src/core/lang/typed_expr.cheng","fn TypedExprV2FastBuild(): int32 =\n    return 0\n"],
  ]){const path=join(root,relative);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,text)}
  writeFileSync(driver,"#!/bin/bash\nexit 0\n");chmodSync(driver,0o755);
  writeFileSync(guard,"#!/bin/bash\nexit 0\n");chmodSync(guard,0o755);
  writeFileSync(script,'#!/bin/bash\nROOT="$(cd "$(dirname "$0")/.." && pwd)"\nexec bun "$ROOT/generator.ts" "$1"\n');chmodSync(script,0o755);
  const objectSource=join(root,"fixture.c"),objectFixture=join(root,"fixture.o");
  writeFileSync(objectSource,"int zc_fixture(void) { return 7; }\n");
  const compile=spawnSync("cc",["-c",objectSource,"-o",objectFixture],{encoding:"utf8"});
  if(compile.error||compile.status!==0||!existsSync(objectFixture))throw new Error(`cc -c fixture failed: ${compile.error?.message||compile.stderr||compile.status}`);
  return{root,source,driver,guard,script,objectFixture};
}

function rawFromStructured(row:string,index:number,total:number){
  const columns=row.split("|");
  const [fn,body,detail,line]=columns;
  const fz=columns.length===7?columns[4]:"0",stmt=columns.length===7?columns[5]:"0",bail=columns.length===7?(columns[6]||"0"):"0";
  return`ZC_NOT_READY idx=${index}/${total} function=${fn} body_kind=${body} detail=${detail} line=${line} fz_kind=${fz} stmt_kind=${stmt} bail=${bail} slot_diag=none`;
}

function materializeEvidence(paths:any,options:any={}){
  const rows=options.rows||["fnA|return||0|3|2|44","fnB|assign|calleeY|20|5|1|631"];
  const total=options.total===undefined?rows.length:options.total;
  const diagDir=options.diagDir,prefix=options.prefix;
  const provenance=total===0?"full_backend_ready":"not_ready_functions_present",fullBackend=total===0?"1":"0";
  mkdirSync(diagDir,{recursive:true});
  const evidence={
    manifest:join(diagDir,`${prefix}.manifest.txt`),report:join(diagDir,`${prefix}.report.txt`),stderr:join(diagDir,`${prefix}.stderr_full.txt`),
    stdout:join(diagDir,`${prefix}.stdout_full.txt`),guard:join(diagDir,`${prefix}.guard.txt`),resource:join(diagDir,`${prefix}.resource_trace.tsv`),
    phase:join(diagDir,`${prefix}.phase_trace.tsv`),object:join(diagDir,`${prefix}.object.o`),
  };
  const reportRows=options.reportRows===undefined?rows:options.reportRows;
  const reportCount=options.reportCount===undefined?total:options.reportCount;
  writeFileSync(evidence.report,[
    `primary_object_missing_function_count=${reportCount}`,
    `primary_object_missing_functions=${reportRows.length===0?"-":reportRows.join(";;")}`,
    `census_pure_provenance=${provenance}`,`full_backend_codegen=${fullBackend}`,"",
  ].join("\n"));
  const stderrRows=options.stderrRows===undefined?rows.map((row:string,index:number)=>rawFromStructured(row,index,rows.length)):options.stderrRows;
  const stderrTotal=options.stderrTotal===undefined?total:options.stderrTotal;
  writeFileSync(evidence.stderr,[...stderrRows,`ZC_NOT_READY_TOTAL count=${stderrTotal}`,""].join("\n"));
  writeFileSync(evidence.stdout,"driver stdout\n");
  copyFileSync(paths.objectFixture,evidence.object);
  writeFileSync(evidence.resource,options.resourceText===undefined?"1\t1\n2\t2\n3\t3\n":options.resourceText);
  writeFileSync(evidence.phase,options.phaseText===undefined?"2\t2\tZC phase\n":options.phaseText);
  const driverRc=total===0?"0":"2";
  writeFileSync(evidence.guard,[
    "tool=tools/beat_c_process_group_guard.sh","schema=beat_c_process_memory_guard","platform=darwin","status=completed",`rc=${driverRc}`,"abort_reason=",
    "memory_guard_mode=process_tree","memory_guard_scope=identity_history_union_group_and_descendants","process_tree_membership_metric=darwin_libproc_identity_history_group_and_descendants",
    "enforcement_kind=darwin_cooperative_process_tree_poll","observed_sample_limit_status=proved","hard_memory_limit_proof_status=not_provable_userspace_poll",
    "sampling_blind_spot=inter_sample_transient_peaks_not_provable_by_userspace_polling","memory_limit_bytes=1073741824",
    "memory_enforcement_metric=max_process_tree_resident_and_phys_footprint","process_tree_resident_metric=current_resident_bytes_sum",
    "process_tree_phys_footprint_metric=darwin_rusage_info_v0_phys_footprint_bytes_sum","process_tree_phys_footprint_status=available",
    "process_tree_resident_peak_bytes=100","process_tree_phys_footprint_peak_bytes=120","process_tree_enforced_peak_bytes=120",
    "process_tree_enforced_sample_peak_bytes=120","process_tree_peak_process_count=1","process_tree_identity_history_peak_count=1","root_identity_sampled=1",
    "process_tree_escape_pid=0","memory_measurement_status=available","memory_measurement_error=","memory_sample_count=3",
    "self_test_global_process_iter_trap_status=not_requested","self_test_global_process_iter_trap_probe_status=not_run","self_test_global_process_iter_trap_call_count=0",
    "timeout_seconds=0","poll_seconds=0.01",`stdout=${evidence.stdout}`,`stderr=${evidence.stderr}`,"",
  ].join("\n"));
  const resourceStats=bytesAndLines(evidence.resource),phaseStats=bytesAndLines(evidence.phase);
  const driverHash=sha256(paths.driver),enumeratorHash=sha256(paths.script),guardHash=sha256(paths.guard),sourceHash=sha256(paths.source),gitHash=sha256Bytes("real worktree state");
  const manifestRows=[
    "schema=zc_evidence_manifest","status=completed",`zc_enumerator=${paths.script}`,`zc_enumerator_sha256_before=${enumeratorHash}`,`zc_enumerator_sha256_after=${enumeratorHash}`,
    `source=${paths.source}`,`source_sha256=${sourceHash}`,`source_sha256_after=${sourceHash}`,"git_worktree_state_schema=git_worktree_state",
    `git_worktree_state_sha256_before=${gitHash}`,`git_worktree_state_sha256_after=${gitHash}`,`driver=${paths.driver}`,`driver_sha256=${driverHash}`,
    `driver_sha256_before=${driverHash}`,`driver_sha256_after=${driverHash}`,`rss_guard=${paths.guard}`,"rss_guard_schema=beat_c_process_memory_guard",
    `rss_guard_sha256_before=${guardHash}`,`rss_guard_sha256_after=${guardHash}`,`rss_guard_report=${evidence.guard}`,`rss_guard_report_sha256=${sha256(evidence.guard)}`,
    "rss_guard_limit_bytes=1073741824","rss_guard_enforcement_metric=max_process_tree_resident_and_phys_footprint","rss_guard_enforcement_kind=darwin_cooperative_process_tree_poll",
    "rss_guard_observed_sample_limit_status=proved","rss_guard_hard_memory_limit_proof_status=not_provable_userspace_poll","rss_guard_poll_seconds=0.01",
    "rss_guard_measurement_status=available","process_tree_resident_peak_bytes=100","process_tree_phys_footprint_peak_bytes=120","process_tree_enforced_peak_bytes=120",
    `target=${ZC_TARGET}`,`structured_report=${evidence.report}`,`structured_report_sha256=${sha256(evidence.report)}`,`stderr_full=${evidence.stderr}`,
    `stderr_full_sha256=${sha256(evidence.stderr)}`,`stdout_full=${evidence.stdout}`,`stdout_full_sha256=${sha256(evidence.stdout)}`,`object=${evidence.object}`,
    "object_status=present",`object_sha256=${sha256(evidence.object)}`,`object_size_bytes=${readFileSync(evidence.object).length}`,`resource_trace=${evidence.resource}`,
    `resource_trace_sha256=${sha256(evidence.resource)}`,`phase_trace=${evidence.phase}`,`phase_trace_sha256=${sha256(evidence.phase)}`,
    `structured_report_missing_function_count=${total}`,`structured_report_missing_function_row_count=${total}`,`stderr_full_missing_function_count=${total}`,
    `stderr_full_total_count=${total}`,`zc_missing_function_count=${total}`,`census_pure_provenance=${provenance}`,`full_backend_codegen=${fullBackend}`,"count_three_way_match=1",`driver_rc=${driverRc}`,"",
  ];
  writeFileSync(evidence.manifest,manifestRows.join("\n"));
  const fields:any={
    zc_status:"completed",zc_driver:paths.driver,zc_driver_sha256:driverHash,zc_driver_sha256_before:driverHash,zc_driver_sha256_after:driverHash,
    zc_enumerator_sha256:enumeratorHash,zc_enumerator_sha256_after:enumeratorHash,zc_shared_rss_guard:paths.guard,
    zc_shared_rss_guard_sha256:guardHash,zc_shared_rss_guard_sha256_after:guardHash,zc_rss_guard_report_sha256:sha256(evidence.guard),
    zc_target:ZC_TARGET,zc_file:paths.source,zc_source_sha256:sourceHash,zc_source_sha256_after:sourceHash,
    zc_git_worktree_state_sha256_before:gitHash,zc_git_worktree_state_sha256_after:gitHash,zc_driver_rc:driverRc,zc_compiler_csg_stderr:"0",zc_progress:"0",
    zc_rss_guard_schema:"beat_c_process_memory_guard",zc_rss_guard_status:"completed",zc_rss_guard_rc:driverRc,zc_rss_guard_abort_reason:"",
    zc_rss_guard_mode:"process_tree",zc_rss_guard_scope:"identity_history_union_group_and_descendants",zc_rss_requested_limit_bytes:"1073741824",zc_rss_limit_bytes:"1073741824",
    zc_rss_enforcement_metric:"max_process_tree_resident_and_phys_footprint",zc_rss_enforcement_kind:"darwin_cooperative_process_tree_poll",
    zc_rss_observed_sample_limit_status:"proved",zc_rss_hard_memory_limit_proof_status:"not_provable_userspace_poll",zc_rss_poll_seconds:"0.01",zc_rss_measurement_status:"available",
    zc_rss_sample_count:"3",zc_process_tree_resident_peak_bytes:"100",zc_process_tree_phys_footprint_peak_bytes:"120",zc_process_tree_enforced_peak_bytes:"120",
    zc_process_tree_peak_process_count:"1",zc_process_tree_identity_history_peak_count:"1",zc_root_identity_sampled:"1",zc_max_rss_bytes:"120",
    zc_max_rss_kind:"sampled_process_tree_enforced_peak",zc_max_rss_is_sampled:"1",zc_census_pure_provenance:provenance,zc_full_backend_codegen:fullBackend,
    zc_manifest:evidence.manifest,zc_manifest_sha256:sha256(evidence.manifest),zc_structured_report:evidence.report,zc_structured_report_sha256:sha256(evidence.report),
    zc_child_stderr_full:evidence.stderr,zc_child_stderr_full_sha256:sha256(evidence.stderr),zc_structured_report_missing_function_count:String(total),
    zc_structured_report_missing_function_row_count:String(total),zc_stderr_full_missing_function_count:String(total),zc_stderr_full_total_count:String(total),zc_count_three_way_match:"1",
    zc_resource_trace:evidence.resource,zc_resource_trace_bytes:String(resourceStats.bytes),zc_resource_trace_sample_count:String(resourceStats.lines),
    zc_phase_trace:evidence.phase,zc_phase_trace_bytes:String(phaseStats.bytes),zc_phase_trace_sample_count:String(phaseStats.lines),zc_missing_function_count:String(total),
    zc_zero:total===0?"proved":"not_proved",zc_zero_proof_scope:total===0?"semantic_census_and_observed_sample_resource_gate":"semantic_census_incomplete",
  };
  return{evidence,fields,rows};
}

function render(materialized:any,fieldOverrides:any={}){
  const fields={...materialized.fields,...fieldOverrides},rows=materialized.rows;
  const histogram=[...rows.reduce((map:Map<string,number>,row:string)=>{
    const columns=row.split("|"),bail=columns.length===7?(columns[6]||"none"):"none";map.set(bail,(map.get(bail)||0)+1);return map;
  },new Map())].map(([bail,count])=>({bail,count})).sort((a,b)=>b.count-a.count||a.bail.localeCompare(b.bail));
  return Buffer.from([
    ...ZC_CENSUS_FIELD_ORDER.map((key)=>`${key}=${fields[key]}`),"zc_bail_histogram (bail号 -> count):",
    ...histogram.map((entry)=>`  bail=${entry.bail} count=${entry.count}`),"zc_rows (function|body_kind|detail|line|fz_kind|stmt_kind|bail):",
    ...rows.map((row:string)=>`  ${row}`),"zc_cache=semantic_miss key=0123456789abcdef","",
  ].join("\n"));
}

function setManifestField(materialized:any,key:string,value:string){
  const lines=readFileSync(materialized.evidence.manifest,"utf8").trimEnd().split("\n");
  const matches=lines.map((line,index)=>line.startsWith(`${key}=`)?index:-1).filter((index)=>index>=0);
  if(matches.length!==1)throw new Error(`manifest field ${key} occurrence mismatch: ${matches.length}`);
  lines[matches[0]]=`${key}=${value}`;
  writeFileSync(materialized.evidence.manifest,`${lines.join("\n")}\n`);
  materialized.fields.zc_manifest_sha256=sha256(materialized.evidence.manifest);
}

function parse(paths:any,materialized:any,bytes=render(materialized),overrides:any={}){
  return parseZcCensusRun({missingDriver:false,exitCode:0,timedOut:false,overflow:false,stdout:bytes.toString("utf8"),stdoutBuffer:bytes,stderr:"",...overrides},{
    root:paths.root,script:paths.script,source:paths.source,driver:paths.driver,target:ZC_TARGET,
    diagDir:dirname(materialized.evidence.manifest),diagPrefix:"direct",
  });
}

function assertAborted(result:any,label:string,contains?:string){
  assertTrue(result.status==="aborted"&&result.total===null&&result.rowCount===0&&result.rows.length===0&&result.histogram.length===0,`${label}: aborted 且无误导结果`);
  if(contains)assertTrue(String(result.protocolError).includes(contains),`${label}: error 包含 ${contains}, got ${result.protocolError}`);
}

function createDirect(paths:any,options:any={}){
  const diagDir=realpathSync(mkdtempSync(join(tmpdir(),"fusion-zc-evidence-")));
  return materializeEvidence(paths,{diagDir,prefix:"direct",...options});
}

function installGenerator(paths:any){
  const generator=join(paths.root,"generator.ts");
  const source=[
    'import {createHash} from "node:crypto";',
    'import {copyFileSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";',
    'import {dirname,join} from "node:path";',
    'import {fileURLToPath} from "node:url";',
    `const ZC_CENSUS_FIELD_ORDER=${JSON.stringify(ZC_CENSUS_FIELD_ORDER)};`,
    `const ZC_PROCESS_MAX_OUTPUT_BYTES=${ZC_PROCESS_MAX_OUTPUT_BYTES};`,
    `const ZC_TARGET=${JSON.stringify(ZC_TARGET)};`,
    sha256Bytes.toString(),sha256.toString(),bytesAndLines.toString(),rawFromStructured.toString(),materializeEvidence.toString(),render.toString(),
    `const root=dirname(fileURLToPath(import.meta.url));const sourcePath=process.argv[2];
const paths={root,source:sourcePath,driver:process.env.ZC_DRIVER,guard:join(root,"tools/beat_c_process_group_guard.sh"),script:join(root,"tools/zc_enumerate.sh"),objectFixture:join(root,"fixture.o")};
const mode=readFileSync(join(root,"mode.txt"),"utf8").trim();
writeFileSync(join(root,"env-log.json"),JSON.stringify({zc:Object.fromEntries(Object.entries(process.env).filter(([key])=>key.startsWith("ZC_"))),diagDir:process.env.ZC_DIAG_DIR}));
if(mode==="oversize"){process.stdout.write(Buffer.alloc(ZC_PROCESS_MAX_OUTPUT_BYTES+65536,65));}else{
 const materialized=materializeEvidence(paths,{diagDir:process.env.ZC_DIAG_DIR,prefix:process.env.ZC_DIAG_PREFIX});process.stdout.write(render(materialized));
}`,
  ].join("\n");
  writeFileSync(generator,source);writeFileSync(join(paths.root,"mode.txt"),"success\n");
}

async function main(){
  const paths=makeFixtureRoot();installGenerator(paths);
  const directDirs:string[]=[];
  try{
    console.log("[A] canonical 协议必须由真实 evidence set 独立证明");
    const canonical=createDirect(paths);directDirs.push(dirname(canonical.evidence.manifest));
    const ok=parse(paths,canonical);
    assertTrue(ok.status==="completed"&&ok.total===2&&ok.rows[0].detail===""&&ok.rows[0].line===0,"空 detail/line=0 的正式结构行通过实物三方核验");
    const four=createDirect(paths,{rows:["fnA|return||0"]});directDirs.push(dirname(four.evidence.manifest));
    assertTrue(parse(paths,four).status==="completed","4-field 正式结构行与 raw stderr 独立证据一致");
    const zero=createDirect(paths,{rows:[],resourceText:"",phaseText:""});directDirs.push(dirname(zero.evidence.manifest));
    const zeroResult=parse(paths,zero);assertTrue(zeroResult.status==="completed"&&zeroResult.total===0&&zeroResult.zeroProof==="proved","零计数要求 full-backend provenance，trace bytes/lines 允许 canonical 0");
    const oldManifest=createDirect(paths);directDirs.push(dirname(oldManifest.evidence.manifest));
    setManifestField(oldManifest,"schema","zc_evidence_manifest.v1");
    assertAborted(parse(paths,oldManifest),"旧 manifest schema","manifest");
    const oldWorktree=createDirect(paths);directDirs.push(dirname(oldWorktree.evidence.manifest));
    setManifestField(oldWorktree,"git_worktree_state_schema","git_worktree_state.v1");
    assertAborted(parse(paths,oldWorktree),"旧 worktree schema","manifest");
    const oldGuard=createDirect(paths);directDirs.push(dirname(oldGuard.evidence.manifest));
    assertAborted(
      parse(paths,oldGuard,render(oldGuard,{zc_rss_guard_schema:"beat_c_process_memory_guard.v4"})),
      "旧 guard schema",
      "guard",
    );

    console.log("[B] 删除、替换、hash 与独立 count 冲突全部 aborted");
    const deleted=createDirect(paths);directDirs.push(dirname(deleted.evidence.manifest));unlinkSync(deleted.evidence.report);
    assertAborted(parse(paths,deleted),"report 删除","report");
    const replaced=createDirect(paths);directDirs.push(dirname(replaced.evidence.manifest));
    const resourceCopy=join(dirname(replaced.evidence.manifest),"resource-copy.tsv");writeFileSync(resourceCopy,readFileSync(replaced.evidence.resource));unlinkSync(replaced.evidence.resource);symlinkSync(resourceCopy,replaced.evidence.resource);
    assertAborted(parse(paths,replaced),"trace 链接替换","non-symlink");
    const changed=createDirect(paths);directDirs.push(dirname(changed.evidence.manifest));writeFileSync(changed.evidence.guard,readFileSync(changed.evidence.guard,"utf8")+"tampered=1\n");
    assertAborted(parse(paths,changed),"guard hash 变化","SHA-256");
    const reportMismatch=createDirect(paths,{reportCount:1});directDirs.push(dirname(reportMismatch.evidence.manifest));
    assertAborted(parse(paths,reportMismatch),"report 独立 count 冲突","structured report row count mismatch");
    const stderrMismatch=createDirect(paths,{stderrTotal:1});directDirs.push(dirname(stderrMismatch.evidence.manifest));
    assertAborted(parse(paths,stderrMismatch),"stderr 独立 total 冲突");

    const missingStdout=createDirect(paths);directDirs.push(dirname(missingStdout.evidence.manifest));unlinkSync(missingStdout.evidence.stdout);
    assertAborted(parse(paths,missingStdout),"stdout attachment 删除","child stdout");
    const stdoutLink=createDirect(paths);directDirs.push(dirname(stdoutLink.evidence.manifest));
    const stdoutCopy=join(dirname(stdoutLink.evidence.manifest),"stdout-copy.txt");copyFileSync(stdoutLink.evidence.stdout,stdoutCopy);unlinkSync(stdoutLink.evidence.stdout);symlinkSync(stdoutCopy,stdoutLink.evidence.stdout);
    assertAborted(parse(paths,stdoutLink),"stdout attachment symlink","non-symlink");
    const objectLink=createDirect(paths);directDirs.push(dirname(objectLink.evidence.manifest));
    const objectCopy=join(dirname(objectLink.evidence.manifest),"object-copy.o");copyFileSync(objectLink.evidence.object,objectCopy);unlinkSync(objectLink.evidence.object);symlinkSync(objectCopy,objectLink.evidence.object);
    assertAborted(parse(paths,objectLink),"object attachment symlink","non-symlink");
    const missingObject=createDirect(paths);directDirs.push(dirname(missingObject.evidence.manifest));unlinkSync(missingObject.evidence.object);
    assertAborted(parse(paths,missingObject),"object attachment 删除","ZC object");
    const stdoutHash=createDirect(paths);directDirs.push(dirname(stdoutHash.evidence.manifest));writeFileSync(stdoutHash.evidence.stdout,"tampered stdout\n");
    assertAborted(parse(paths,stdoutHash),"stdout attachment hash","child stdout SHA-256 mismatch");
    const invalidUtf8=createDirect(paths);directDirs.push(dirname(invalidUtf8.evidence.manifest));writeFileSync(invalidUtf8.evidence.stdout,Buffer.from([0xff,0x0a]));
    setManifestField(invalidUtf8,"stdout_full_sha256",sha256(invalidUtf8.evidence.stdout));
    assertAborted(parse(paths,invalidUtf8),"stdout attachment fatal UTF-8","not valid UTF-8");
    const absentObject=createDirect(paths);directDirs.push(dirname(absentObject.evidence.manifest));setManifestField(absentObject,"object_status","absent");
    assertAborted(parse(paths,absentObject),"object_status=absent","object_status mismatch");
    const missingStatus=createDirect(paths);directDirs.push(dirname(missingStatus.evidence.manifest));
    writeFileSync(missingStatus.evidence.manifest,readFileSync(missingStatus.evidence.manifest,"utf8").replace(/^object_status=.*\n/m,""));missingStatus.fields.zc_manifest_sha256=sha256(missingStatus.evidence.manifest);
    assertAborted(parse(paths,missingStatus),"object_status 缺失","field order/schema mismatch");
    const objectSize=createDirect(paths);directDirs.push(dirname(objectSize.evidence.manifest));setManifestField(objectSize,"object_size_bytes","1");
    assertAborted(parse(paths,objectSize),"object size mismatch","object size mismatch");
    const objectHash=createDirect(paths);directDirs.push(dirname(objectHash.evidence.manifest));writeFileSync(objectHash.evidence.object,Buffer.concat([readFileSync(objectHash.evidence.object),Buffer.from([0])]));
    assertAborted(parse(paths,objectHash),"object hash mismatch","object SHA-256 mismatch");
    const fakeObject=createDirect(paths);directDirs.push(dirname(fakeObject.evidence.manifest));writeFileSync(fakeObject.evidence.object,"not a relocatable object\n");
    setManifestField(fakeObject,"object_sha256",sha256(fakeObject.evidence.object));setManifestField(fakeObject,"object_size_bytes",String(readFileSync(fakeObject.evidence.object).length));
    assertAborted(parse(paths,fakeObject),"文本 object 禁止 completed","Mach-O 64");
    const publicDiag=createDirect(paths);directDirs.push(dirname(publicDiag.evidence.manifest));chmodSync(dirname(publicDiag.evidence.manifest),0o755);
    assertAborted(parse(paths,publicDiag),"非私有 diag 禁止 completed","must be private");
    const stdoutOversize=createDirect(paths);directDirs.push(dirname(stdoutOversize.evidence.manifest));truncateSync(stdoutOversize.evidence.stdout,64*1024*1024+1);
    assertAborted(parse(paths,stdoutOversize),"stdout attachment 64MiB 上限","exceeds 67108864 bytes");
    const objectOversize=createDirect(paths);directDirs.push(dirname(objectOversize.evidence.manifest));truncateSync(objectOversize.evidence.object,512*1024*1024+1);
    assertAborted(parse(paths,objectOversize),"object attachment 512MiB 上限","exceeds 536870912 bytes");

    console.log("[C] target/driver、canonical bounded integers 与协议上限严格失败");
    const numericCases=[
      ["line leading zero",["fnA|return||01|3|2|44"]],["fz overflow",[`fnA|return||0|${Number.MAX_SAFE_INTEGER+1}|2|44`]],
      ["bail negative zero",["fnA|return||0|3|2|-0"]],
    ];
    for(const [label,rows] of numericCases as any){const item=createDirect(paths,{rows});directDirs.push(dirname(item.evidence.manifest));assertAborted(parse(paths,item),label)}
    const target=createDirect(paths);directDirs.push(dirname(target.evidence.manifest));assertAborted(parse(paths,target,render(target,{zc_target:"x86_64-apple-darwin"})),"target mismatch","zc_target mismatch");
    const alternateDriver=join(paths.root,"alternate-driver");writeFileSync(alternateDriver,"#!/bin/bash\nexit 0\n");chmodSync(alternateDriver,0o755);
    const driverCase=createDirect(paths);directDirs.push(dirname(driverCase.evidence.manifest));const alternateHash=sha256(alternateDriver);
    assertAborted(parse(paths,driverCase,render(driverCase,{zc_driver:alternateDriver,zc_driver_sha256:alternateHash,zc_driver_sha256_before:alternateHash,zc_driver_sha256_after:alternateHash})),"driver mismatch","zc_driver path mismatch");
    const count=createDirect(paths,{rows:["fnA|return||0|3|2|44"]});directDirs.push(dirname(count.evidence.manifest));assertAborted(parse(paths,count,render(count,{zc_missing_function_count:"01"})),"count leading zero","canonical uint");
    const huge=Buffer.alloc(ZC_PROCESS_MAX_OUTPUT_BYTES+1,65);assertAborted(parse(paths,canonical,huge),"stdout parser cap","exceeds");
    assertAborted(parse(paths,canonical,render(canonical),{stdoutBuffer:undefined}),"缺失 stdoutBuffer","stdoutBuffer raw bytes are required");
    assertAborted(parse(paths,canonical,Buffer.from([0xff])),"协议 stdout fatal UTF-8","not valid UTF-8");

    console.log("[D] wrappers 清空 ambient ZC_*，固定私有 diag 并在 verdict 后清理");
    const mcp=startMcp({ZC_TARGET:"evil-target",ZC_DRIVER:"/evil-driver",ZC_DIAG_DIR:"/evil-diag",ZC_PROGRESS:"9",ZC_AMBIENT_POISON:"must-disappear"},paths.root);
    try{
      await mcp.initialize({rootUri:`file://${paths.root}`,workspaceFolders:[{uri:`file://${paths.root}`,name:"zc-protocol"}]});
      const census=await mcp.callTool("cheng_zc_census",{root:paths.root,source:paths.source,driver:paths.driver},undefined,20000);
      assertTrue(census.isError!==true&&census.parsed.status==="completed"&&census.parsed.total===2,"zc_census 严格 evidence verdict");
      assertTrue(census.parsed.schema==="cheng_zc_census","zc_census 使用唯一 canonical schema");
      assert.throws(()=>assertZcCensusReportSchema({...census.parsed,schema:"cheng_zc_census.v1"}),/unsupported ZC census report schema/);
      const censusEnv=JSON.parse(readFileSync(join(paths.root,"env-log.json"),"utf8"));
      assertTrue(censusEnv.zc.ZC_DRIVER===paths.driver&&censusEnv.zc.ZC_TARGET===ZC_TARGET&&censusEnv.zc.ZC_DIAG_PREFIX==="census"&&censusEnv.zc.ZC_NO_CACHE==="1","census 受控 env 固定");
      assertTrue(censusEnv.zc.ZC_AMBIENT_POISON===undefined&&!existsSync(censusEnv.diagDir),"census ambient ZC 清空且私有 diag 已清理");
      const peel=await mcp.callTool("cheng_residual_peel",{root:paths.root,mode:"full",source:paths.source,driver:paths.driver},undefined,20000);
      assertTrue(peel.isError!==true&&peel.parsed.census.status==="completed"&&peel.parsed.census.total===2,"residual full 共用严格 verdict");
      const peelEnv=JSON.parse(readFileSync(join(paths.root,"env-log.json"),"utf8"));
      assertTrue(peelEnv.zc.ZC_DIAG_PREFIX==="residual"&&peelEnv.zc.ZC_AMBIENT_POISON===undefined&&!existsSync(peelEnv.diagDir),"residual 私有 diag + env 隔离 + cleanup");
      writeFileSync(join(paths.root,"mode.txt"),"oversize\n");
      const overflow=await mcp.callTool("cheng_zc_census",{root:paths.root,source:paths.source,driver:paths.driver},undefined,20000);
      assertTrue(overflow.isError!==true&&overflow.parsed.status==="aborted"&&overflow.parsed.overflow===true&&overflow.parsed.total===null,"wrapper maxBuffer 超限硬中止");
      const overflowEnv=JSON.parse(readFileSync(join(paths.root,"env-log.json"),"utf8"));assertTrue(!existsSync(overflowEnv.diagDir),"overflow 路径也清理私有 diag");
    }finally{mcp.kill()}

    console.log("[E] attack comparator 对相同 depth/severity 满足确定性顺序");
    const phases=[{id:"same",depth:0,bodyKinds:[]}];
    const hits=[
      {phase:"same",severity:"medium",ruleId:"z",family:"zeta",path:"z",count:1},
      {phase:"same",severity:"high",ruleId:"h",family:"high",path:"h",count:1},
      {phase:"same",severity:"medium",ruleId:"a",family:"alpha",path:"a",count:1},
    ];
    const first=buildAttackOrder(phases,hits,null),second=buildAttackOrder(phases,[...hits].reverse(),null);
    assertTrue(JSON.stringify(first)===JSON.stringify(second)&&first.map((item:any)=>item.family).join(",")==="high,alpha,zeta","comparator 反对称且不依赖输入顺序");
  }finally{
    for(const path of directDirs)rmSync(path,{recursive:true,force:true});
    rmSync(paths.root,{recursive:true,force:true});
  }
  console.log("item21 zc protocol strict: PASS");
}

main().catch((error)=>{console.error("item21 zc protocol strict: FAIL",error);process.exit(1)});
