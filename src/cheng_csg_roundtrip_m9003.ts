// @ts-nocheck
import {existsSync,mkdirSync,readFileSync,renameSync,rmSync,writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {basename,join} from "node:path";
import {tmpdir} from "node:os";
import {createHash} from "node:crypto";
import {b as defineModuleInitializer} from "./runtime.ts";
import {CHENG_DRIVER,CHENG_STAGE3_DRIVER,CHENG_TOOLCHAIN_ROOT,chengColdCsgDir,chengColdSummaryPath,chengDriverSpawnEnv,createChengTextTool,csgProjectRoot,jsonResult,readChengSummary,resolveProjectPath,assertInsideProject,runChengDriver,takeTrailingText,initChengToolkitModule,zodSchema} from "./cheng_toolkit_m9000.ts";

var chengCsgRoundtripInputSchema,ChengCsgRoundtripTool;

function readReport(path){
  if(!existsSync(path))return{};
  const out={};
  for(const line of readFileSync(path,"utf8").split(/\r?\n/)){
    const index=line.indexOf("=");
    if(index<=0)continue;
    const key=line.slice(0,index),value=line.slice(index+1);
    out[key]=/^-?[0-9]+$/.test(value)?Number(value):value;
  }
  return out;
}

function commandOutput(result){
  return `${result.stdout||""}\n${result.stderr||""}`;
}

function driverSupportsColdCsg(driver){
  if(!driver||!existsSync(driver))return false;
  const probe=spawnSync(driver,["emit-cold-csg"],{encoding:"utf8",timeout:5000,killSignal:"SIGKILL",maxBuffer:1024*1024,env:chengDriverSpawnEnv()});
  const text=commandOutput(probe);
  if(text.includes("requires full selfhost CSG facts lowering"))return false;
  return !text.includes("unknown command")&&(text.includes("missing --in")||text.includes("emit-cold-csg"));
}

function compileCachedColdDriver(){
  const bootstrapDir=join(CHENG_TOOLCHAIN_ROOT,"bootstrap");
  const source=join(bootstrapDir,"cheng_cold.c");
  const inputs=["cheng_cold.c","cold_chengcsg_format.h","cold_parser.c","cold_parser.h","macho_direct.h","elf64_direct.h","rv64_emit.h"].map((name)=>join(bootstrapDir,name));
  const missing=inputs.find((path)=>!existsSync(path));
  if(missing)return{error:`cheng cold build input not found: ${missing}`};
  const digest=createHash("sha256");
  for(const path of inputs)digest.update(path).update("\0").update(readFileSync(path)).update("\0");
  const key=digest.digest("hex").slice(0,16);
  const cacheDir=join(tmpdir(),"openclaude-cheng-cold-driver");
  mkdirSync(cacheDir,{recursive:true});
  const driver=join(cacheDir,`cheng_cold_${key}`);
  if(existsSync(driver))return{driver};
  const tempDriver=`${driver}.tmp-${process.pid}-${Date.now()}`;
  const cc=process.env.CC||"cc";
  const compile=spawnSync(cc,["-std=c11","-O2","-o",tempDriver,source],{encoding:"utf8",timeout:60000,maxBuffer:16*1024*1024,env:{...process.env}});
  if(compile.status!==0){
    rmSync(tempDriver,{force:true});
    return{error:`failed to compile cheng cold driver (${compile.status}): ${takeTrailingText(commandOutput(compile),2000)}`};
  }
  if(process.platform==="darwin"){
    const sign=spawnSync("codesign",["--force","-s","-","-i",`openclaude.cheng-cold.${key}`,tempDriver],{encoding:"utf8",timeout:15000,maxBuffer:1024*1024,env:{...process.env}});
    if(sign.status!==0){
      rmSync(tempDriver,{force:true});
      return{error:`failed to sign cheng cold driver (${sign.status}): ${takeTrailingText(commandOutput(sign),2000)}`};
    }
  }
  try{renameSync(tempDriver,driver)}catch(error){
    rmSync(tempDriver,{force:true});
    if(!existsSync(driver))return{error:`failed to install cheng cold driver: ${error instanceof Error?error.message:String(error)}`};
  }
  return{driver};
}

function resolveColdCsgDriver(){
  const candidates=[process.env.CHENG_COLD_DRIVER,process.env.CHENG_CSG_DRIVER,CHENG_DRIVER,CHENG_STAGE3_DRIVER].filter(Boolean);
  for(const candidate of candidates)if(driverSupportsColdCsg(candidate))return{driver:candidate};
  const compiled=compileCachedColdDriver();
  if(compiled.driver&&driverSupportsColdCsg(compiled.driver))return compiled;
  return{error:compiled.error||`no Cheng driver with emit-cold-csg support found; checked ${candidates.join(", ")}`};
}

var initChengCsgRoundtripModule=defineModuleInitializer(()=>{
  initChengToolkitModule();
  chengCsgRoundtripInputSchema=zodSchema.strictObject({
    action:zodSchema.enum(["check"]).optional().describe("Emit Cheng cold CSG facts and verify cold reader consumption. Defaults to check."),
    root:zodSchema.string().optional().describe("Explicit Cheng project root for this call. Must contain cheng-package.toml."),
    source:zodSchema.string().optional().describe("Project-relative or absolute .cheng source to emit."),
    outDir:zodSchema.string().optional().describe("Project-relative or absolute output directory. Defaults to conversion-reports/cheng-csg."),
    target:zodSchema.string().optional().describe("Target triple. Defaults to arm64-apple-darwin.")
  });
  ChengCsgRoundtripTool=createChengTextTool({
    name:"cheng_csg_roundtrip",
    requiresChengProjectRoot:true,
    searchHint:"emit Cheng cold CSG facts and verify cold reader stability",
    inputSchema:chengCsgRoundtripInputSchema,
    description:"Run Cheng emit-cold-csg for the current project source, then load it through the cold reader and write project-local CSG summary.",
    prompt:"Run after Cheng edits to materialize the current project's CSG facts before cheng_csg_query/cheng_evidence.",
    toAutoClassifierInput:(input)=>`csg_roundtrip:${input.action}`,
    async execute(input){
      if(!input.source)return jsonResult({error:"source is required for Cheng project CSG roundtrip"});
      const root=csgProjectRoot({root:input.root,file:input.source});
      const source=resolveProjectPath(input.source,root);
      assertInsideProject(source,root);
      if(!existsSync(source))return jsonResult({error:`source not found: ${source}`});
      const target=input.target||"arm64-apple-darwin";
      const outDir=input.outDir?resolveProjectPath(input.outDir,root):chengColdCsgDir(root);
      assertInsideProject(outDir,root);
      mkdirSync(outDir,{recursive:true});
      mkdirSync(chengColdCsgDir(root),{recursive:true});
      const facts=join(outDir,"current.facts");
      const writerReport=join(outDir,"current.writer.report.txt");
      const readerReport=join(outDir,"current.reader.report.txt");
      const objectOut=join(outDir,`${basename(source).replace(/[^A-Za-z0-9_.-]/g,"_")}.o`);
      const driverResult=resolveColdCsgDriver();
      if(!driverResult.driver)return jsonResult({error:driverResult.error});
      const driver=driverResult.driver;
      const before=readChengSummary({root,cwd:root});
      const writer=await runChengDriver(driver,["emit-cold-csg",`--root:${root}`,`--in:${source}`,`--out:${facts}`,`--target:${target}`,`--report-out:${writerReport}`],{cwd:root});
      let reader={exitCode:null,stderr:"",stdout:""};
      if(writer.exitCode===0&&existsSync(facts)){
        reader=await runChengDriver(driver,["system-link-exec",`--csg-in:${facts}`,"--emit:obj",`--target:${target}`,`--out:${objectOut}`,`--report-out:${readerReport}`],{cwd:root});
      }
      let factsRoot=null,byteSize=0,summary=null,readError=null;
      if(writer.exitCode===0&&reader.exitCode===0&&existsSync(facts))try{
        const raw=readFileSync(facts);
        if(!raw.toString("utf8",0,10).startsWith("CHENG_CSG\n"))throw new Error(`writer output is not CHENG_CSG facts: ${facts}`);
        byteSize=raw.length;
        factsRoot=`sha256:${createHash("sha256").update(raw).digest("hex")}`;
        const writerReportData=readReport(writerReport);
        const readerReportData=readReport(readerReport);
        summary={
          schema:"cheng-cold-csg.summary.v1",
          root,
          source,
          target,
          facts,
          factsRoot,
          byteSize,
          totals:{
            sourceFiles:1,
            functions:readerReportData.facts_function_count??writerReportData.facts_function_count??0,
            symbols:0,
            calls:readerReportData.facts_reloc_count??writerReportData.facts_reloc_count??0,
            records:readerReportData.facts_record_count??writerReportData.facts_record_count??0,
            bytes:byteSize
          },
          runtimeClosure:null,
          writerReport,
          readerReport,
          objectOut,
          writerExitCode:writer.exitCode,
          readerExitCode:reader.exitCode,
          generatedAt:new Date().toISOString()
        };
        writeFileSync(chengColdSummaryPath(root),JSON.stringify(summary,null,2)+"\n");
      }catch(error){readError=error instanceof Error?error.message:String(error)}
      return jsonResult({
        root,
        source,
        driver,
        facts,
        writerExitCode:writer.exitCode,
        readerExitCode:reader.exitCode,
        factsRootBefore:before?.factsRoot,
        factsRootAfter:factsRoot,
        stable:Boolean(before&&factsRoot&&before.factsRoot===factsRoot),
        byteSize,
        summary,
        readError,
        writerStderr:takeTrailingText(writer.stderr,1000),
        readerStderr:takeTrailingText(reader.stderr,1000)
      });
    }
  });
});

export {ChengCsgRoundtripTool,initChengCsgRoundtripModule};
