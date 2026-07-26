import {createHash} from "node:crypto";
import {basename} from "node:path";
import {fileURLToPath} from "node:url";

const CHENG_CSG_SUMMARY_SCHEMA = "cheng-cold-csg.summary";
const CHENG_CSG_SUMMARY_PRODUCER = "cheng-fusion/cheng_csg_roundtrip";
const CHENG_CSG_COMMIT_PROTOCOL = "content-addressed-generation+atomic-summary";
const CHENG_CSG_SCHEMA_DESC = "header(0){schema_version:u32,abi_version:u32,pointer_width:u8,endian:u8,producer_version:u32,target_triple:bytes32,entry_symbol:bytes64,schema_hash:u64,plan_hash:u64};target(1){triple:str};object_format(2){format:str};entry(3){symbol:str};function(4){item_id:u32,word_offset:u32,word_count:u32,symbol:str,body_kind:str};word_chunk(5){word_offset:u32,word_count:u32,words:u32le[]};reloc(6){source_item_id:u32,word_offset:u32,target_symbol:str};data(7){item_id:u32,symbol:str,align:u32,byte_count:u32,bytes:raw};data_reloc(8){source_item_id:u32,word_offset:u32,reloc_kind:u32,addend:u32,target_symbol:str};call_edge(9){source_item_id:u32,target_symbol:str}";
const CHENG_CSG_SCHEMA_DESC_SHA256_HEX = createHash("sha256").update(CHENG_CSG_SCHEMA_DESC).digest("hex");
const CHENG_CSG_SCHEMA_DESC_SHA256 = `sha256:${CHENG_CSG_SCHEMA_DESC_SHA256_HEX}`;
const CHENG_CSG_SUMMARY_KEY_ORDER = Object.freeze(["schema", "producer", "root", "source", "entrySource", "target", "driverIdentity", "toolIdentity", "generationId", "generationHash", "generationContractSha256", "artifactHashes", "commitProtocol", "facts", "factsRoot", "byteSize", "totals", "runtimeClosure", "writerReport", "readerReport", "objectOut", "current", "writerExitCode", "readerExitCode"]);
const CHENG_CSG_DRIVER_IDENTITY_KEY_ORDER = Object.freeze(["driverRole", "driverPath", "driverSha256", "receiptPath", "receiptSha256", "sourceManifestPath", "sourceClosureSha256", "patchPath", "patchSha256", "buildScriptPath", "buildScriptSha256", "contractPath", "contractSha256", "compilerPath", "compilerSha256", "compilerVersionSha256", "bunPath", "bunSha256", "bunVersionSha256", "csgSchemaVersion", "csgAbiVersion", "csgPointerWidth", "csgEndian", "csgSchemaDescSha256"]);
const CHENG_CSG_TOOL_IDENTITY_KEY_ORDER = Object.freeze(["producerPath", "producerSha256", "consumerPath", "consumerSha256", "contractPath", "contractSha256"]);
const CHENG_CSG_ARTIFACT_HASH_KEY_ORDER = Object.freeze(["facts", "factsLinemap", "writerReport", "readerReport", "object", "objectMap"]);
const CHENG_CSG_CURRENT_KEY_ORDER = Object.freeze(["facts", "writerReport", "readerReport", "objectOut"]);
const CHENG_CSG_TOTAL_KEY_ORDER = Object.freeze(["sourceFiles", "functions", "words", "relocs", "data", "dataRelocs", "callEdges", "symbols", "calls", "records", "bytes"]);
const CHENG_CSG_GENERATION_LAYOUT = Object.freeze(["current.facts", "current.facts.linemap", "current.reader.report.txt", "current.writer.report.txt", "<entry-object-name>", "<entry-object-name>.map", "summary.json"]);
const CHENG_CSG_GENERATION_OBJECT_NAME_RULE = "sanitize(entrySource.basename,[^A-Za-z0-9_.-]=>_)+.o";
const CHENG_CSG_GENERATION_HASH_PREIMAGE_KEY_ORDER = Object.freeze(["generationContractSha256", "root", "source", "entrySource", "target", "driverIdentity", "toolIdentity", "artifactHashes"]);
const CHENG_CSG_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const CHENG_CSG_GENERATION_ID_PATTERN = /^sha256-[0-9a-f]{64}$/;
const CHENG_CSG_CURRENT_CONTRACT_SOURCE_PATH = fileURLToPath(import.meta.url);
const CHENG_CSG_ROUNDTRIP_SOURCE_PATH = fileURLToPath(new URL("./cheng_csg_roundtrip_m9003.ts", import.meta.url));
const CHENG_CSG_TOOLKIT_SOURCE_PATH = fileURLToPath(new URL("./cheng_toolkit_m9000.ts", import.meta.url));

const CHENG_CSG_GENERATION_CONTRACT_SHA256 = `sha256:${createHash("sha256").update(JSON.stringify({
  schema: CHENG_CSG_SUMMARY_SCHEMA,
  producer: CHENG_CSG_SUMMARY_PRODUCER,
  commitProtocol: CHENG_CSG_COMMIT_PROTOCOL,
  summaryKeyOrder: CHENG_CSG_SUMMARY_KEY_ORDER,
  artifactHashKeyOrder: CHENG_CSG_ARTIFACT_HASH_KEY_ORDER,
  driverIdentityKeyOrder: CHENG_CSG_DRIVER_IDENTITY_KEY_ORDER,
  toolIdentityKeyOrder: CHENG_CSG_TOOL_IDENTITY_KEY_ORDER,
  currentKeyOrder: CHENG_CSG_CURRENT_KEY_ORDER,
  totalsKeyOrder: CHENG_CSG_TOTAL_KEY_ORDER,
  generationLayout: CHENG_CSG_GENERATION_LAYOUT,
  generationObjectNameRule: CHENG_CSG_GENERATION_OBJECT_NAME_RULE,
  generationHashPreimageKeyOrder: CHENG_CSG_GENERATION_HASH_PREIMAGE_KEY_ORDER,
})).digest("hex")}`;

function chengCsgHasExactKeyOrder(value: unknown, keys: readonly string[]): boolean {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value as object)) === JSON.stringify(keys);
}

function chengCsgOrderedRecord(value: any, keys: readonly string[], label: string): Record<string, unknown> {
  if (!chengCsgHasExactKeyOrder(value, keys)) throw new Error(`${label} fields or field order are not canonical`);
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}

function chengCsgCanonicalArtifactHashes(value: any, label: string): Record<string, string> {
  const ordered = chengCsgOrderedRecord(value, CHENG_CSG_ARTIFACT_HASH_KEY_ORDER, label) as Record<string, string>;
  for (const key of CHENG_CSG_ARTIFACT_HASH_KEY_ORDER) {
    if (!CHENG_CSG_HASH_PATTERN.test(String(ordered[key] || ""))) throw new Error(`${label} ${key} is invalid`);
  }
  return ordered;
}

function chengCsgGenerationHash(root: string, source: string, entrySource: string, target: string, driverIdentity: any, toolIdentity: any, artifactHashes: any): string {
  const orderedDriverIdentity = chengCsgOrderedRecord(driverIdentity, CHENG_CSG_DRIVER_IDENTITY_KEY_ORDER, "generation cold driver identity");
  const orderedToolIdentity = chengCsgOrderedRecord(toolIdentity, CHENG_CSG_TOOL_IDENTITY_KEY_ORDER, "generation CSG tool identity");
  for (const key of ["producerSha256", "consumerSha256", "contractSha256"]) {
    if (!CHENG_CSG_HASH_PATTERN.test(String(orderedToolIdentity[key] || ""))) throw new Error(`generation CSG tool identity ${key} is invalid`);
  }
  const orderedArtifactHashes = chengCsgCanonicalArtifactHashes(artifactHashes, "generation artifact hashes");
  return `sha256:${createHash("sha256").update(JSON.stringify({
    generationContractSha256: CHENG_CSG_GENERATION_CONTRACT_SHA256,
    root,
    source,
    entrySource,
    target,
    driverIdentity: orderedDriverIdentity,
    toolIdentity: orderedToolIdentity,
    artifactHashes: orderedArtifactHashes,
  })).digest("hex")}`;
}

function chengCsgGenerationObjectName(source: string): string {
  return `${basename(source).replace(/[^A-Za-z0-9_.-]/g, "_")}.o`;
}

export {
  CHENG_CSG_SUMMARY_SCHEMA,
  CHENG_CSG_SUMMARY_PRODUCER,
  CHENG_CSG_COMMIT_PROTOCOL,
  CHENG_CSG_SCHEMA_DESC,
  CHENG_CSG_SCHEMA_DESC_SHA256,
  CHENG_CSG_SCHEMA_DESC_SHA256_HEX,
  CHENG_CSG_SUMMARY_KEY_ORDER,
  CHENG_CSG_DRIVER_IDENTITY_KEY_ORDER,
  CHENG_CSG_TOOL_IDENTITY_KEY_ORDER,
  CHENG_CSG_ARTIFACT_HASH_KEY_ORDER,
  CHENG_CSG_CURRENT_KEY_ORDER,
  CHENG_CSG_TOTAL_KEY_ORDER,
  CHENG_CSG_GENERATION_LAYOUT,
  CHENG_CSG_GENERATION_OBJECT_NAME_RULE,
  CHENG_CSG_GENERATION_HASH_PREIMAGE_KEY_ORDER,
  CHENG_CSG_GENERATION_CONTRACT_SHA256,
  CHENG_CSG_HASH_PATTERN,
  CHENG_CSG_GENERATION_ID_PATTERN,
  CHENG_CSG_CURRENT_CONTRACT_SOURCE_PATH,
  CHENG_CSG_ROUNDTRIP_SOURCE_PATH,
  CHENG_CSG_TOOLKIT_SOURCE_PATH,
  chengCsgHasExactKeyOrder,
  chengCsgOrderedRecord,
  chengCsgCanonicalArtifactHashes,
  chengCsgGenerationHash,
  chengCsgGenerationObjectName,
};
