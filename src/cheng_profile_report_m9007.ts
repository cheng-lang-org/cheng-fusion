// @ts-nocheck
import {existsSync,mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {isAbsolute,join} from "node:path";
import {b as defineModuleInitializer} from "./runtime.ts";
import {CHENG_CANARY,createChengTextTool,jsonResult,profileDriverForReport,profileResult,resolveChengProjectRoot,resolveProjectPath,assertInsideProject,runChengDriver,takeTrailingText,initChengToolkitModule,zodSchema} from "./cheng_toolkit_m9000.ts";

var chengProfileReportInputSchema,ChengProfileReportTool;

function nowMs(){return Number(process.hrtime.bigint()/1000000n)}

function resolveProfilePath(value,root){
  const path=isAbsolute(value)?value:join(root,value);
  assertInsideProject(path,root);
  return path;
}

async function runProfileHarness(action,source,input={}){
  const root=resolveChengProjectRoot({root:input.root,file:source});
  const driver=profileDriverForReport();
  const tempDir=input.out?null:mkdtempSync(join(tmpdir(),"cheng-profile-run-"));
  const out=input.out?resolveProfilePath(input.out,root):join(tempDir,"profile-run-exe");
  const compileArgs=["system-link-exec",`--root:${root}`,`--in:${source}`,`--out:${out}`,"--target:arm64-apple-darwin","--emit:exe"];
  const started=nowMs();
  const compileStarted=nowMs();
  const compile=await runChengDriver(driver,compileArgs,{root,cwd:root});
  const compileElapsedMs=nowMs()-compileStarted;
  let run={missingDriver:false,driver:out,exitCode:null,stdout:"",stderr:""};
  let runElapsedMs=0;
  if(!compile.missingDriver&&compile.exitCode===0&&existsSync(out)){
    const runStarted=nowMs();
    run=await runChengDriver(out,[],{root,cwd:root});
    runElapsedMs=nowMs()-runStarted;
  }
  const totalElapsedMs=nowMs()-started;
  const unsupportedReason=compile.missingDriver?`cheng driver not found: ${driver}`:compile.exitCode!==0?`system-link-exec failed (${compile.exitCode})`:null;
  const result={
    schema:"cheng_profile_report_tool.v1",
    action,
    driver,
    root,
    command:["cheng","profile-run",`--root:${root}`,`--in:${source}`,"--target:arm64-apple-darwin","--emit:exe"].join(" "),
    exitCode:run.exitCode,
    supported:unsupportedReason===null,
    unsupportedReason,
    profileSchema:"cheng_profile_v1",
    profile:{
      source,
      executable:input.out?out:null,
      temporaryExecutableCleaned:!input.out,
      profileHz:input.profileHz||null,
      compile:{exitCode:compile.exitCode,elapsedMs:compileElapsedMs,stdout:takeTrailingText(compile.stdout),stderr:takeTrailingText(compile.stderr)},
      run:{exitCode:run.exitCode,elapsedMs:runElapsedMs,stdout:takeTrailingText(run.stdout),stderr:takeTrailingText(run.stderr)},
      totalElapsedMs
    },
    stdout:takeTrailingText(run.stdout),
    stderr:takeTrailingText([compile.stderr,run.stderr].filter(Boolean).join("\n"))
  };
  if(input.reportOut)writeFileSync(resolveProfilePath(input.reportOut,root),JSON.stringify(result,null,2)+"\n");
  if(tempDir)rmSync(tempDir,{recursive:true,force:true});
  return result;
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
    profileHz:zodSchema.number().int().positive().optional()
  });
  ChengProfileReportTool=createChengTextTool({
    name:"cheng_profile_report",
    requiresChengProjectRoot:true,
    searchHint:"probe, run, or convert Cheng profiling reports",
    inputSchema:chengProfileReportInputSchema,
    description:"Run real Cheng profiling: profile-report for raw reports and system-link-exec plus executable timing for profile-run.",
    prompt:"Use this for Cheng performance work; start with action=probe.",
    toAutoClassifierInput:(input)=>`profile:${input.action}`,
    async execute(input){
      const action=input.action||"probe";
      const root=resolveChengProjectRoot({root:input.root,file:input.source||input.rawProfile});
      if(action==="probe"){
        const reportArgs=["profile-report"];
        const report=profileResult("probe:profile-report",reportArgs,await runChengDriver(profileDriverForReport(),reportArgs,{root,cwd:root}),{root});
        const canary=resolveProjectPath(CHENG_CANARY,root);
        const run=await runProfileHarness("probe:profile-run",canary,{...input,root,profileHz:input.profileHz});
        return jsonResult({schema:"cheng_profile_probe.v1",root,supported:report.supported||run.supported,report,run});
      }
      if(action==="report"){
        if(!input.rawProfile)return jsonResult({error:"action=report requires rawProfile"});
        const raw=isAbsolute(input.rawProfile)?input.rawProfile:join(root,input.rawProfile);
        assertInsideProject(raw,root);
        const args=["profile-report",`--in:${raw}`];
        if(input.out)args.push(`--out:${isAbsolute(input.out)?input.out:join(root,input.out)}`);
        return jsonResult(profileResult("report",args,await runChengDriver(profileDriverForReport(),args,{root,cwd:root}),{root}));
      }
      if(!input.source)return jsonResult({error:"action=run requires source"});
      const source=resolveProjectPath(input.source,root);
      assertInsideProject(source,root);
      return jsonResult(await runProfileHarness("run",source,{...input,root}));
    }
  });
});

export {ChengProfileReportTool,initChengProfileReportModule};
