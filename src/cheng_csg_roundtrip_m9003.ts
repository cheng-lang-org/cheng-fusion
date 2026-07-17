// @ts-nocheck
import {chmodSync,closeSync,constants as fsConstants,copyFileSync,existsSync,fstatSync,fsyncSync,linkSync,lstatSync,mkdirSync,mkdtempSync,openSync,readSync,readdirSync,realpathSync,renameSync,rmdirSync,rmSync,unlinkSync,writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {basename,dirname,join,relative} from "node:path";
import {createHash,randomUUID} from "node:crypto";
import {b as defineModuleInitializer} from "./runtime.ts";
import {CHENG_FUSION_VENDOR_COLD_DRIVER,chengColdCsgDir,chengColdSummaryPath,chengDriverSpawnEnv,createChengTextTool,csgProjectRoot,jsonResult,readChengSummary,resolveProjectPath,assertInsideProject,runChengDriver,takeTrailingText,initChengToolkitModule,zodSchema} from "./cheng_toolkit_m9000.ts";

var chengCsgRoundtripInputSchema,ChengCsgRoundtripTool;

function commandOutput(result){
  return `${result.stdout||""}\n${result.stderr||""}`;
}

function driverSupportsColdCsg(driver){
  if(!driver||!existsSync(driver))return false;
  const probe=spawnSync(driver,["emit-cold-csg"],{encoding:"utf8",timeout:5000,killSignal:"SIGKILL",maxBuffer:1024*1024,env:chengDriverSpawnEnv()});
  if(probe.error||probe.signal||!Number.isInteger(probe.status))return false;
  const text=commandOutput(probe);
  if(text.includes("requires full selfhost CSG facts lowering"))return false;
  return !text.includes("unknown command")&&(text.includes("missing --in")||text.includes("emit-cold-csg"));
}

const ROUNDTRIP_MAX_OUTPUT_BYTES=16*1024*1024;
const ROUNDTRIP_MAX_FACTS_BYTES=256*1024*1024;
const ROUNDTRIP_MAX_REPORT_BYTES=8*1024*1024;
const ROUNDTRIP_MAX_OBJECT_BYTES=512*1024*1024;
const ROUNDTRIP_MAX_SUMMARY_BYTES=1024*1024;
const ROUNDTRIP_GENERATIONS_TO_KEEP=4;
const ROUNDTRIP_GENERATION_PREFIX="sha256-";
const ROUNDTRIP_PRODUCER="cheng-fusion/cheng_csg_roundtrip";
const COLD_CSG_FNV64_BASIS=1469598103934665603n;
const COLD_CSG_FNV64_PRIME=1099511628211n;
const COLD_CSG_SCHEMA_DESC="header(0){schema_version:u32,abi_version:u32,pointer_width:u8,endian:u8,producer_version:u32,target_triple:bytes32,entry_symbol:bytes64,schema_hash:u64,plan_hash:u64};target(1){triple:str};object_format(2){format:str};entry(3){symbol:str};function(4){item_id:u32,word_offset:u32,word_count:u32,symbol:str,body_kind:str};word(5){word:u32};reloc(6){source_item_id:u32,word_offset:u32,target_symbol:str};data(7){item_id:u32,symbol:str,align:u32,byte_count:u32,bytes:raw};data_reloc(8){source_item_id:u32,word_offset:u32,reloc_kind:u32,addend:u32,target_symbol:str};call_edge(9){source_item_id:u32,target_symbol:str}";

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

function decodeFatalUtf8(raw,label,path){
  try{return new TextDecoder("utf-8",{fatal:true}).decode(raw)}catch(error){
    throw new Error(`${label} must be valid UTF-8: ${path} (${error instanceof Error?error.message:String(error)})`);
  }
}

function requireFreshRegularArtifact(path,label,maxBytes=ROUNDTRIP_MAX_OBJECT_BYTES){
  return readStableRegularArtifact(path,label,maxBytes).stat;
}

function requireCanonicalDirectory(path,label){
  const stat=lstatSync(path);
  if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error(`${label} must be a real directory, not a symlink or non-directory: ${path}`);
  if(realpathSync(path)!==path)throw new Error(`${label} must not traverse symlink ancestors: ${path}`);
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
    else if(kind===5)counts.words++;
    else if(kind===6)counts.relocs++;
    else if(kind===7)counts.data++;
    else if(kind===8)counts.dataRelocs++;
    else if(kind===9)counts.callEdges++;
  }
  if(records.length===0||records[0].kind!==0)throw new Error(`CHENG_CSG facts must begin with the canonical header record: ${path}`);
  const header=records[0].payload;
  if(header.length!==126)throw new Error(`CHENG_CSG header payload must be exactly 126 bytes: ${path}`);
  if(header.readUInt32LE(0)!==1||header.readUInt32LE(4)!==1||header[8]!==8||header[9]!==1){
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
    }else if(kind===5){readU32("word")}
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
  return{raw:artifact.raw,hash:artifact.hash,counts};
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

function generationHashFor(root,source,target,artifactHashes){
  return sha256Digest(Buffer.from(JSON.stringify({root,source,target,artifactHashes}),"utf8"));
}

function generationIdFor(hash){
  const match=String(hash).match(/^sha256:([0-9a-f]{64})$/);
  if(!match)throw new Error(`invalid CSG generation hash: ${hash}`);
  return `${ROUNDTRIP_GENERATION_PREFIX}${match[1]}`;
}

function generationObjectName(source){
  return `${basename(source).replace(/[^A-Za-z0-9_.-]/g,"_")}.o`;
}

function exactGenerationPaths(generationDir,source){
  const objectName=generationObjectName(source);
  return{
    facts:join(generationDir,"current.facts"),
    writerReport:join(generationDir,"current.writer.report.txt"),
    readerReport:join(generationDir,"current.reader.report.txt"),
    objectOut:join(generationDir,objectName),
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
  return{summary,raw:artifact.raw};
}

function sameArtifactHashes(left,right){
  return["facts","writerReport","readerReport","object"].every((key)=>left?.[key]===right?.[key]&&/^sha256:[0-9a-f]{64}$/.test(String(left?.[key]||"")));
}

function validateOwnedGenerationDirectory(generationDir,expected=null){
  requireCanonicalDirectory(generationDir,"CSG immutable generation");
  const parsed=parseGenerationSummary(join(generationDir,"summary.json"));
  const summary=parsed.summary;
  const summaryKeys=["artifactHashes","byteSize","commitProtocol","current","facts","factsRoot","generatedAt","generationHash","generationId","objectOut","producer","readerExitCode","readerReport","root","runtimeClosure","schema","source","target","totals","writerExitCode","writerReport"].sort();
  if(JSON.stringify(Object.keys(summary).sort())!==JSON.stringify(summaryKeys))throw new Error(`generation summary fields are not canonical: ${generationDir}`);
  if(summary.schema!=="cheng-cold-csg.summary.v3"||summary.producer!==ROUNDTRIP_PRODUCER||summary.commitProtocol!=="content-addressed-generation+atomic-summary"){
    throw new Error(`generation is not owned by ${ROUNDTRIP_PRODUCER}: ${generationDir}`);
  }
  const paths=exactGenerationPaths(generationDir,summary.source);
  const expectedNames=["current.facts","current.reader.report.txt","current.writer.report.txt",paths.objectName,"summary.json"].sort();
  const actualNames=readdirSync(generationDir).sort();
  if(JSON.stringify(actualNames)!==JSON.stringify(expectedNames))throw new Error(`owned generation has unexpected directory entries: ${generationDir}`);
  if(summary.generationId!==basename(generationDir)||summary.generationHash!==generationHashFor(summary.root,summary.source,summary.target,summary.artifactHashes)||generationIdFor(summary.generationHash)!==summary.generationId){
    throw new Error(`owned generation content address mismatch: ${generationDir}`);
  }
  if(summary.facts!==paths.facts||summary.writerReport!==paths.writerReport||summary.readerReport!==paths.readerReport||summary.objectOut!==paths.objectOut){
    throw new Error(`owned generation declares paths outside its directory: ${generationDir}`);
  }
  const outDir=dirname(dirname(generationDir));
  const expectedCurrent={facts:join(outDir,"current.facts"),writerReport:join(outDir,"current.writer.report.txt"),readerReport:join(outDir,"current.reader.report.txt"),objectOut:join(outDir,paths.objectName)};
  if(JSON.stringify(summary.current)!==JSON.stringify(expectedCurrent))throw new Error(`owned generation current projection paths are invalid: ${generationDir}`);
  if(expected){
    if(summary.root!==expected.root||summary.source!==expected.source||summary.target!==expected.target||summary.generationId!==expected.generationId||summary.generationHash!==expected.generationHash||!sameArtifactHashes(summary.artifactHashes,expected.artifactHashes)){
      throw new Error(`existing content-addressed generation does not match requested artifacts: ${generationDir}`);
    }
  }
  const factsEvidence=validateChengColdFacts(paths.facts,summary.target);
  const writerEvidence=parseAndValidateReport(paths.writerReport,"writer report",factsEvidence.counts);
  const readerEvidence=parseAndValidateReport(paths.readerReport,"reader report",factsEvidence.counts);
  const objectEvidence=validateObjectArtifact(paths.objectOut,summary.target,factsEvidence.objectFormat);
  const hashes={facts:factsEvidence.hash,writerReport:writerEvidence.hash,readerReport:readerEvidence.hash,object:objectEvidence.hash};
  if(!sameArtifactHashes(hashes,summary.artifactHashes))throw new Error(`owned generation artifact hash mismatch: ${generationDir}`);
  const expectedTotals={sourceFiles:1,functions:factsEvidence.counts.functions,words:factsEvidence.counts.words,relocs:factsEvidence.counts.relocs,data:factsEvidence.counts.data,dataRelocs:factsEvidence.counts.dataRelocs,callEdges:factsEvidence.counts.callEdges,symbols:factsEvidence.counts.functions+factsEvidence.counts.data,calls:factsEvidence.counts.relocs+factsEvidence.counts.dataRelocs+factsEvidence.counts.callEdges,records:factsEvidence.counts.records,bytes:factsEvidence.raw.length};
  if(JSON.stringify(summary.totals)!==JSON.stringify(expectedTotals)||summary.factsRoot!==factsEvidence.hash||summary.byteSize!==factsEvidence.raw.length)throw new Error(`owned generation summary totals mismatch: ${generationDir}`);
  if(summary.writerExitCode!==0||summary.readerExitCode!==0||summary.runtimeClosure!==null)throw new Error(`owned generation summary process status is invalid: ${generationDir}`);
  for(const path of [paths.facts,paths.writerReport,paths.readerReport,paths.objectOut,paths.summary]){
    const stat=lstatSync(path);
    if(stat.isSymbolicLink()||!stat.isFile()||(stat.mode&0o222)!==0)throw new Error(`owned generation artifact must be immutable regular file: ${path}`);
  }
  const generatedAt=Date.parse(summary.generatedAt);
  if(!Number.isFinite(generatedAt))throw new Error(`owned generation generatedAt is invalid: ${generationDir}`);
  return{summary,paths,generatedAt};
}

function removeProvenGenerationDirectory(generationDir,paths){
  const tombstone=join(dirname(generationDir),`.cheng-csg-gc-${randomUUID()}`);
  renameSync(generationDir,tombstone);
  const names=["current.facts","current.reader.report.txt","current.writer.report.txt",paths.objectName,"summary.json"].sort();
  let deletionStarted=false;
  try{
    requireCanonicalDirectory(tombstone,"CSG generation GC tombstone");
    if(JSON.stringify(readdirSync(tombstone).sort())!==JSON.stringify(names))throw new Error(`generation changed before GC deletion: ${generationDir}`);
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
  verified.sort((left,right)=>right.generatedAt-left.generatedAt||left.name.localeCompare(right.name));
  const keep=new Set([...retainedIds].filter((name)=>/^sha256-[0-9a-f]{64}$/.test(String(name))));
  for(const entry of verified)if(keep.size<ROUNDTRIP_GENERATIONS_TO_KEEP)keep.add(entry.name);
  for(const entry of verified)if(!keep.has(entry.name))removeProvenGenerationDirectory(entry.generationDir,entry.paths);
  fsyncDirectory(generationRoot);
}

function resolveColdCsgDriver(){
  // The generic main-repo drivers are deliberately excluded: their schema
  // descriptor predates kind=9, so selecting them as an implicit fallback
  // would let the producer contract silently regress. An explicit override
  // remains available for a separately built compatible driver.
  const candidates=[process.env.CHENG_COLD_DRIVER,CHENG_FUSION_VENDOR_COLD_DRIVER].filter(Boolean);
  for(const candidate of candidates)if(driverSupportsColdCsg(candidate))return{driver:candidate};
  return{error:`no explicit or fusion-vendored CSG kind=9 driver with emit-cold-csg support found; checked ${candidates.join(", ")}`};
}

var initChengCsgRoundtripModule=defineModuleInitializer(()=>{
  initChengToolkitModule();
  chengCsgRoundtripInputSchema=zodSchema.strictObject({
    action:zodSchema.enum(["check"]).optional().describe("Emit Cheng cold CSG facts and verify cold reader consumption. Defaults to check."),
    root:zodSchema.string().optional().describe("Explicit Cheng project root for this call. Must contain cheng-package.toml."),
    source:zodSchema.string().optional().describe("Project-relative or absolute .cheng source to emit."),
    outDir:zodSchema.string().optional().describe("Project-relative or absolute output directory. Defaults to conversion-reports/cheng-csg."),
    target:zodSchema.string().min(1).max(128).regex(/^[A-Za-z0-9_.+-]+$/).optional().describe("Target triple. Defaults to arm64-apple-darwin.")
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
      if(!input.source)throw new Error("source is required for Cheng project CSG roundtrip");
      const root=csgProjectRoot({root:input.root,file:input.source});
      const source=resolveProjectPath(input.source,root);
      assertInsideProject(source,root);
      let sourceStat;
      try{sourceStat=lstatSync(source)}catch(error){throw new Error(`source not found: ${source} (${error instanceof Error?error.message:String(error)})`)}
      if(sourceStat.isSymbolicLink()||!sourceStat.isFile()||sourceStat.size<=0)throw new Error(`source must be a non-empty regular non-symlink file: ${source}`);
      if(!source.endsWith(".cheng"))throw new Error(`source must be a .cheng file: ${source}`);
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
      const objectName=generationObjectName(source);
      const currentFacts=join(outDir,"current.facts");
      const currentWriterReport=join(outDir,"current.writer.report.txt");
      const currentReaderReport=join(outDir,"current.reader.report.txt");
      const currentObject=join(outDir,objectName);
      const driverResult=resolveColdCsgDriver();
      if(!driverResult.driver)throw new Error(driverResult.error);
      const driver=driverResult.driver;
      preflightReplaceTarget(canonicalSummary,"existing canonical summary");
      let before=null;
      const transactionId=`${Date.now().toString(36)}-${randomUUID()}`;
      const lockDir=join(canonicalDir,".cheng-csg-roundtrip.lock");
      let generationId=null,generationHash=null,artifactHashes=null,summary=null,summaryBytes=null,reusedGeneration=false;
      let staging=null,generationDir=null,generationInstalled=false,committed=false,lockOwned=false,rollbackFailed=false;
      let writer=null,reader=null;
      const replacements=[];
      let summaryReplacement=null;
      try{
        try{mkdirSync(lockDir,{mode:0o700})}catch(error){
          if(error?.code==="EEXIST")throw new Error(`another cheng_csg_roundtrip transaction owns ${lockDir}`);
          throw error;
        }
        lockOwned=true;
        chmodSync(lockDir,0o700);
        requireCanonicalDirectory(lockDir,"roundtrip transaction lock");
        writeFileSync(join(lockDir,"owner.json"),JSON.stringify({pid:process.pid,transactionId,startedAt:new Date().toISOString()})+"\n",{flag:"wx",mode:0o600});
        before=readChengSummary({root,cwd:root});
        staging=mkdtempSync(join(outDir,".cheng-csg-stage-"));
        requireCanonicalDirectory(staging,"roundtrip staging directory");
        const stagedFacts=join(staging,"current.facts");
        const stagedWriterReport=join(staging,"current.writer.report.txt");
        const stagedReaderReport=join(staging,"current.reader.report.txt");
        const stagedObject=join(staging,objectName);
        const stagedSummary=join(staging,"summary.json");

        writer=await runChengDriver(driver,["emit-cold-csg",`--root:${root}`,`--in:${source}`,`--out:${stagedFacts}`,`--target:${target}`,`--report-out:${stagedWriterReport}`],{cwd:root,maxBuffer:ROUNDTRIP_MAX_OUTPUT_BYTES});
        if(!processOk(writer))throw new Error(`emit-cold-csg process failed: exit=${writer.exitCode} missing=${Boolean(writer.missingDriver)} timeout=${Boolean(writer.timedOut)} overflow=${Boolean(writer.overflow)} stderr=${takeTrailingText(writer.stderr,1000)}`);
        const factsEvidence=validateChengColdFacts(stagedFacts,target);
        const factsRaw=factsEvidence.raw;
        const writerEvidence=parseAndValidateReport(stagedWriterReport,"writer report",factsEvidence.counts);

        reader=await runChengDriver(driver,["system-link-exec",`--csg-in:${stagedFacts}`,"--emit:obj",`--target:${target}`,`--out:${stagedObject}`,`--report-out:${stagedReaderReport}`],{cwd:root,maxBuffer:ROUNDTRIP_MAX_OUTPUT_BYTES});
        if(!processOk(reader))throw new Error(`system-link-exec process failed: exit=${reader.exitCode} missing=${Boolean(reader.missingDriver)} timeout=${Boolean(reader.timedOut)} overflow=${Boolean(reader.overflow)} stderr=${takeTrailingText(reader.stderr,1000)}`);
        const factsAfterReader=validateChengColdFacts(stagedFacts,target);
        if(factsAfterReader.hash!==factsEvidence.hash)throw new Error(`CSG facts changed while the reader consumed them: before=${factsEvidence.hash} after=${factsAfterReader.hash}`);
        const writerAfterReader=parseAndValidateReport(stagedWriterReport,"writer report",factsEvidence.counts);
        if(writerAfterReader.hash!==writerEvidence.hash)throw new Error(`writer report changed after validation: before=${writerEvidence.hash} after=${writerAfterReader.hash}`);
        const readerEvidence=parseAndValidateReport(stagedReaderReport,"reader report",factsEvidence.counts);
        const objectEvidence=validateObjectArtifact(stagedObject,target,factsEvidence.objectFormat);

        artifactHashes={
          facts:factsEvidence.hash,
          writerReport:writerEvidence.hash,
          readerReport:readerEvidence.hash,
          object:objectEvidence.hash
        };
        generationHash=generationHashFor(root,source,target,artifactHashes);
        generationId=generationIdFor(generationHash);
        const generationRoot=join(outDir,".cheng-csg-generations");
        ensureCanonicalDirectoryUnderRoot(generationRoot,root,"CSG generation directory");
        generationDir=join(generationRoot,generationId);
        const generationPaths=exactGenerationPaths(generationDir,source);
        const facts=generationPaths.facts;
        const writerReport=generationPaths.writerReport;
        const readerReport=generationPaths.readerReport;
        const objectOut=generationPaths.objectOut;
        const factsRoot=artifactHashes.facts;
        const byteSize=factsRaw.length;
        summary={
          schema:"cheng-cold-csg.summary.v3",
          producer:ROUNDTRIP_PRODUCER,
          root,
          source,
          target,
          generationId,
          generationHash,
          artifactHashes,
          commitProtocol:"content-addressed-generation+atomic-summary",
          facts,
          factsRoot,
          byteSize,
          totals:{
            sourceFiles:1,
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
          readerExitCode:reader.exitCode,
          generatedAt:new Date().toISOString()
        };
        summaryBytes=Buffer.from(JSON.stringify(summary,null,2)+"\n","utf8");
        if(existsSync(generationDir)){
          const existing=validateOwnedGenerationDirectory(generationDir,{root,source,target,generationId,generationHash,artifactHashes});
          summary=existing.summary;
          summaryBytes=Buffer.from(JSON.stringify(summary,null,2)+"\n","utf8");
          reusedGeneration=true;
          removeOwnedDirectory(staging);
          staging=null;
        }else{
          writeFileSync(stagedSummary,summaryBytes,{flag:"wx",mode:0o600});
          for(const [path,label,maxBytes] of [[stagedFacts,"CSG facts",ROUNDTRIP_MAX_FACTS_BYTES],[stagedWriterReport,"writer report",ROUNDTRIP_MAX_REPORT_BYTES],[stagedReaderReport,"reader report",ROUNDTRIP_MAX_REPORT_BYTES],[stagedObject,"reader object",ROUNDTRIP_MAX_OBJECT_BYTES],[stagedSummary,"generation summary",ROUNDTRIP_MAX_SUMMARY_BYTES]]){
            requireFreshRegularArtifact(path,label,maxBytes);
            chmodSync(path,0o444);
            fsyncFile(path);
          }
          fsyncDirectory(staging);
          renameSync(staging,generationDir);
          staging=null;
          generationInstalled=true;
          fsyncDirectory(generationRoot);
          validateOwnedGenerationDirectory(generationDir,{root,source,target,generationId,generationHash,artifactHashes});
        }

        garbageCollectOwnedGenerations(generationRoot,new Set([generationId,before?.generationId]));

        for(const [sourcePath,targetPath] of [[facts,currentFacts],[writerReport,currentWriterReport],[readerReport,currentReaderReport],[objectOut,currentObject]]){
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
          driver,
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
          if(generationInstalled&&!committed&&generationDir)try{removeOwnedDirectory(generationDir)}catch{}
          if(lockOwned)try{removeOwnedDirectory(lockDir)}catch{}
        }
      }
    }
  });
});

export {ChengCsgRoundtripTool,initChengCsgRoundtripModule};
