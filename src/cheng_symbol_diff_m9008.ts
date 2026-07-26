// @ts-nocheck
import {constants,chmodSync,closeSync,fstatSync,fsyncSync,lstatSync,mkdtempSync,openSync,readSync,rmSync,writeSync} from "node:fs";
import {createHash} from "node:crypto";
import {tmpdir} from "node:os";
import {isAbsolute,join} from "node:path";
import {b as defineModuleInitializer} from "./runtime.ts";
import {createChengTextTool,jsonResult,snapshotChengSymbols,compareChengBinarySymbols,initChengToolkitModule,zodSchema} from "./cheng_toolkit_m9000.ts";

var chengSymbolDiffInputSchema,ChengSymbolDiffTool;

const CHENG_SYMBOL_COMPARE_MAX_OBJECT_BYTES=512*1024*1024;
const CHENG_SYMBOL_COMPARE_COPY_CHUNK_BYTES=1024*1024;

// compare 模式的 objectA/objectB 常是 /tmp 下的实验世代 .primary.o 或已链接可执行文件, 不必
// (也不应该)落在活跃 Cheng 项目 root 内 —— 同 cheng_exec_diff 的 driverA/driverB 一样对待。
function resolveArbitraryBinaryPath(value,label){
  if(!value)throw new Error(`${label} is required`);
  const path=String(value);
  if(!isAbsolute(path))throw new Error(`${label} must be an absolute path: ${path}`);
  return path;
}

function stableStatKey(stat){
  return [stat.dev,stat.ino,stat.size,stat.mode,stat.mtimeNs,stat.ctimeNs].map(String).join(":");
}

function assertSamePathGeneration(path,label,expected){
  let current;
  try{
    current=lstatSync(path,{bigint:true});
  }catch(error){
    throw new Error(`${label} changed while being snapshotted: ${path} (${error instanceof Error?error.message:String(error)})`);
  }
  if(current.isSymbolicLink()||!current.isFile()||stableStatKey(current)!==stableStatKey(expected)){
    throw new Error(`${label} changed while being snapshotted: ${path}`);
  }
}

// lstat 先拒绝链接和非普通文件，再通过 O_NOFOLLOW 打开同一 inode。内容用单个固定缓冲区
// 流式复制到私有快照并同步计算 SHA-256；不会将 A/B 整体同时驻留内存。
function snapshotCompareObject(path,label,snapshotPath){
  let pathStat;
  try{
    pathStat=lstatSync(path,{bigint:true});
  }catch(error){
    throw new Error(`${label} not found: ${path} (${error instanceof Error?error.message:String(error)})`);
  }
  if(pathStat.isSymbolicLink()||!pathStat.isFile()||pathStat.size<=0n){
    throw new Error(`${label} must be a non-empty regular non-symlink file: ${path}`);
  }
  if(pathStat.size>BigInt(CHENG_SYMBOL_COMPARE_MAX_OBJECT_BYTES)){
    throw new Error(`${label} exceeds the ${CHENG_SYMBOL_COMPARE_MAX_OBJECT_BYTES}-byte snapshot limit: ${path} (${pathStat.size} bytes)`);
  }
  if(typeof constants.O_NOFOLLOW!=="number"){
    throw new Error(`${label} cannot be opened safely because O_NOFOLLOW is unavailable: ${path}`);
  }

  let sourceFd;
  let snapshotFd;
  try{
    sourceFd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  }catch(error){
    throw new Error(`${label} cannot be opened safely: ${path} (${error instanceof Error?error.message:String(error)})`);
  }
  try{
    const before=fstatSync(sourceFd,{bigint:true});
    if(!before.isFile()||before.size<=0n||stableStatKey(before)!==stableStatKey(pathStat)){
      throw new Error(`${label} changed while being opened: ${path}`);
    }
    snapshotFd=openSync(snapshotPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL,0o600);
    const buffer=Buffer.allocUnsafe(CHENG_SYMBOL_COMPARE_COPY_CHUNK_BYTES);
    const hash=createHash("sha256");
    let total=0;
    for(;;){
      const bytesRead=readSync(sourceFd,buffer,0,buffer.length,null);
      if(bytesRead===0)break;
      total+=bytesRead;
      if(total>CHENG_SYMBOL_COMPARE_MAX_OBJECT_BYTES||BigInt(total)>before.size){
        throw new Error(`${label} changed or exceeded the ${CHENG_SYMBOL_COMPARE_MAX_OBJECT_BYTES}-byte snapshot limit while being read: ${path}`);
      }
      hash.update(buffer.subarray(0,bytesRead));
      let written=0;
      while(written<bytesRead){
        const count=writeSync(snapshotFd,buffer,written,bytesRead-written,null);
        if(count<=0)throw new Error(`${label} snapshot write made no progress: ${snapshotPath}`);
        written+=count;
      }
    }
    const after=fstatSync(sourceFd,{bigint:true});
    if(BigInt(total)!==before.size||stableStatKey(after)!==stableStatKey(before)){
      throw new Error(`${label} changed while being read: ${path}`);
    }
    assertSamePathGeneration(path,label,pathStat);
    fsyncSync(snapshotFd);
    closeSync(snapshotFd);
    snapshotFd=undefined;
    chmodSync(snapshotPath,0o600);
    return {size:total,sha256:`sha256:${hash.digest("hex")}`};
  }finally{
    if(snapshotFd!==undefined)closeSync(snapshotFd);
    closeSync(sourceFd);
  }
}

// work 只能拿到私有快照路径；原路径在闭包执行期间被替换或删除，不会影响这次比较。
function withChengBinarySymbolSnapshots(objectAValue,objectBValue,work){
  const objectA=resolveArbitraryBinaryPath(objectAValue,"objectA");
  const objectB=resolveArbitraryBinaryPath(objectBValue,"objectB");
  const snapshotRoot=mkdtempSync(join(tmpdir(),"cheng-symbol-diff-snapshot-"));
  const snapshotA=join(snapshotRoot,"objectA.o");
  const snapshotB=join(snapshotRoot,"objectB.o");
  try{
    chmodSync(snapshotRoot,0o700);
    const capturedA=snapshotCompareObject(objectA,"objectA",snapshotA);
    const capturedB=snapshotCompareObject(objectB,"objectB",snapshotB);
    return work({
      objectA:{originalPath:objectA,snapshotPath:snapshotA,size:capturedA.size,sha256:capturedA.sha256},
      objectB:{originalPath:objectB,snapshotPath:snapshotB,size:capturedB.size,sha256:capturedB.sha256}
    });
  }finally{
    rmSync(snapshotRoot,{recursive:true,force:true});
  }
}

var initChengSymbolDiffModule=defineModuleInitializer(()=>{
  initChengToolkitModule();
  chengSymbolDiffInputSchema=zodSchema.strictObject({
    action:zodSchema.enum(["snapshot","compare"]),
    root:zodSchema.string().optional().describe("Explicit Cheng project root for this call. Must contain cheng-package.toml."),
    source:zodSchema.string().optional().describe("snapshot mode: .cheng source to run print-symbols against."),
    objectA:zodSchema.string().optional().describe("compare mode: absolute path to the first thin Mach-O MH_OBJECT .o."),
    objectB:zodSchema.string().optional().describe("compare mode: absolute path to the second thin Mach-O MH_OBJECT .o."),
    limit:zodSchema.number().int().positive().optional().describe("compare mode: cap on defined/undefined name lists. Default 2000; counts and relocation caller records are always exact."),
    includeCommon:zodSchema.boolean().optional().describe("compare mode: also return the (usually large, low-signal) common defined and undefined symbol name lists. Default false (count only).")
  });
  ChengSymbolDiffTool=createChengTextTool({
    name:"cheng_symbol_diff",
    requiresChengProjectRoot:true,
    searchHint:"snapshot Cheng compiler symbols via print-symbols, or diff defined T and undefined U symbols between two binaries",
    inputSchema:chengSymbolDiffInputSchema,
    description:"action:snapshot runs cheng print-symbols and returns cheng_symbols counts (primary_unsupported_count > 0 is a compiler lowering regression signal). action:compare takes two thin Mach-O MH_OBJECT .o paths (objectA, objectB), preserves the defined global T diff, adds undefined U set diffs, and attributes direct undefined calls from real Darwin relocation addresses to exact nm text-function ranges; local t labels are boundaries only, while ambiguous or out-of-range sites are explicit unresolved-owner. Fat or non-object Mach-O inputs are rejected because their relocation addresses cannot use this attribution model.",
    prompt:"Use {action:snapshot} after Cheng compiler edits; default canary should stay primary_unsupported_count=0. Use {action:compare,objectA,objectB} to diff two build generations' thin Mach-O .primary.o files, then inspect undefinedOnlyInA/undefinedOnlyInB and undefinedCallersA/undefinedCallersB for link gaps and their owning functions.",
    toAutoClassifierInput:(input)=>input.action==="compare"?`symbol_diff_compare:${input.objectA}:${input.objectB}`:`symbol_diff:${input.source||"canary"}`,
    async execute(input){
      if(input.action==="compare"){
        return withChengBinarySymbolSnapshots(input.objectA,input.objectB,(snapshots)=>{
          const compared=compareChengBinarySymbols(snapshots.objectA.snapshotPath,snapshots.objectB.snapshotPath,{limit:input.limit,includeCommon:input.includeCommon});
          return jsonResult({...compared,
            objectA:snapshots.objectA.originalPath,
            objectB:snapshots.objectB.originalPath,
            objectASha256:snapshots.objectA.sha256,
            objectBSha256:snapshots.objectB.sha256
          });
        });
      }
      const result=await snapshotChengSymbols(input.source,{root:input.root});
      return jsonResult(result);
    }
  });
});

export {CHENG_SYMBOL_COMPARE_MAX_OBJECT_BYTES,ChengSymbolDiffTool,initChengSymbolDiffModule,withChengBinarySymbolSnapshots};
