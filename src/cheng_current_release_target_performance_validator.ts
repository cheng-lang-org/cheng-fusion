import { createHash } from "node:crypto";
import { canonicalJson } from "./cheng_semantic_matrix_m9023.ts";
import {
  assertExactCurrentObjectKeys,
  parseUniqueCurrentJson,
} from "./current_schema_json.ts";
import { currentReleaseDomainCid } from "./cheng_current_release_evidence_validator.ts";

export const CHENG_CURRENT_TARGET_ACTION_SCHEMA =
  "cheng_current_target_regalloc_action";
export const CHENG_CURRENT_TARGET_FRAGMENT_SCHEMA =
  "cheng_current_target_object_fragment";
export const CHENG_CURRENT_ORC_EVENT_SCHEMA = "cheng_current_orc_event_log";
export const CHENG_CURRENT_PERFORMANCE_EVIDENCE_SCHEMA =
  "cheng_current_performance_evidence";
export const CHENG_CURRENT_PERFORMANCE_TRACE_SCHEMA =
  "cheng_current_performance_sample_trace";
export const CHENG_CURRENT_PERFORMANCE_COMMAND_SCHEMA =
  "cheng_current_performance_command";
export const CHENG_CURRENT_PERFORMANCE_ENVIRONMENT_SCHEMA =
  "cheng_current_performance_environment";

const HASH = /^[0-9a-f]{64}$/;
const UINT = /^(?:0|[1-9][0-9]*)$/;
const MEMORY_LIMIT_BYTES = 1073741824;
const TARGETS = [
  ["aarch64-apple-darwin", "arm64"],
  ["aarch64-unknown-linux-gnu", "aarch64"],
  ["x86_64-unknown-linux-gnu", "x86_64"],
] as const;
const BACKENDS = ["primary", "backend2"] as const;
const DEBUG_NAMES = new Set([
  "__debug_line",
  "__debug_info",
  "__debug_abbrev",
  ".debug_line",
  ".debug_info",
  ".debug_abbrev",
]);

export interface CurrentRawPin {
  readonly path: string;
  readonly byteLength: number;
  readonly bytesRaw32: string;
}

export type CurrentRawReader = (pin: CurrentRawPin, label: string) => Buffer;

export interface CurrentTargetIdentity {
  readonly sourceBundleRaw32: string;
  readonly executionRaw32: string;
}

export interface CurrentTargetBackendRawEvidence {
  readonly backend: "primary" | "backend2";
  readonly object: CurrentRawPin;
  readonly executable: CurrentRawPin;
  readonly action: CurrentRawPin;
  readonly fragment: CurrentRawPin;
  readonly runStatus: CurrentRawPin;
  readonly runStdout: CurrentRawPin;
  readonly runStderr: CurrentRawPin;
  readonly orcEvents: CurrentRawPin;
}

export interface CurrentTargetRawEvidence {
  readonly targetTriple:
    | "aarch64-apple-darwin"
    | "aarch64-unknown-linux-gnu"
    | "x86_64-unknown-linux-gnu";
  readonly architecture: "arm64" | "aarch64" | "x86_64";
  readonly driverRaw32: string;
  readonly backends: readonly CurrentTargetBackendRawEvidence[];
}

export interface CurrentActionValidation {
  readonly raw32: string;
  readonly bodyIrRaw32: string;
  readonly spillDensityPpm: number;
}

export interface CurrentFragmentValidation {
  readonly raw32: string;
  readonly actionRaw32: string;
  readonly objectRaw32: string;
}

export interface CurrentTargetBackendValidation {
  readonly targetTriple: CurrentTargetRawEvidence["targetTriple"];
  readonly architecture: CurrentTargetRawEvidence["architecture"];
  readonly backend: CurrentTargetBackendRawEvidence["backend"];
  readonly driverRaw32: string;
  readonly objectRaw32: string;
  readonly executableRaw32: string;
  readonly action: CurrentActionValidation;
  readonly fragment: CurrentFragmentValidation;
  readonly objectSemanticRaw32: string;
  readonly debugProjectionRaw32: string;
  readonly runResultRaw32: string;
  readonly orcResultRaw32: string;
  readonly destructorOrderRaw32: string;
  readonly evidenceRaw32: string;
}

export interface CurrentTargetMatrixValidation {
  readonly raw32: string;
  readonly backends: readonly CurrentTargetBackendValidation[];
}

export interface CurrentPerformanceValidation {
  readonly raw32: string;
  readonly compileWallRatioPpm: number;
  readonly peakMemoryRatioPpm: number;
  readonly maxGroupSpreadPpm: number;
  readonly spillDensityPpm: number;
  readonly baselineSpillDensityPpm: number;
  readonly textBytes: number;
  readonly baselineTextBytes: number;
  readonly clangTextBytes: number;
  readonly textToClangRatioPpm: number;
}

interface SectionRow {
  readonly ordinal: number;
  readonly name: string;
  readonly kind: "semantic" | "debug" | "metadata";
  readonly fileOffset: number;
  readonly byteLength: number;
  readonly bytesRaw32: string;
}

interface ObjectProjection {
  readonly targetTriple: CurrentTargetRawEvidence["targetTriple"];
  readonly architecture: CurrentTargetRawEvidence["architecture"];
  readonly kind: "object" | "executable";
  readonly sections: readonly SectionRow[];
  readonly semanticRaw32: string;
  readonly debugRaw32: string;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hash(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !HASH.test(value) ||
    value === "0".repeat(64) ||
    value === sha256(Buffer.alloc(0))
  ) {
    throw new Error(`${label}_raw32_invalid`);
  }
  return value;
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    throw new Error(`${label}_integer_invalid`);
  }
  return Number(value);
}

function canonicalObject(raw: Buffer, label: string): Record<string, unknown> {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  if (!text.endsWith("\n")) throw new Error(`${label}_newline_invalid`);
  const value = parseUniqueCurrentJson(text, label);
  if (`${canonicalJson(value)}\n` !== text) {
    throw new Error(`${label}_canonical_json_invalid`);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}_object_required`);
  }
  return value as Record<string, unknown>;
}

function read(
  pin: CurrentRawPin,
  label: string,
  reader: CurrentRawReader,
): Buffer {
  assertExactCurrentObjectKeys(
    pin,
    ["path", "byteLength", "bytesRaw32"],
    label,
  );
  if (
    typeof pin.path !== "string" ||
    pin.path.length === 0 ||
    pin.path !== pin.path.trim() ||
    !Number.isSafeInteger(pin.byteLength) ||
    pin.byteLength <= 0
  ) {
    throw new Error(`${label}_pin_invalid`);
  }
  const expected = hash(pin.bytesRaw32, `${label}_pin`);
  const raw = reader(pin, label);
  if (
    !Buffer.isBuffer(raw) ||
    raw.length !== pin.byteLength ||
    sha256(raw) !== expected
  ) {
    throw new Error(`${label}_raw_pin_drift`);
  }
  return raw;
}

function cString(raw: Buffer, start: number, length: number): string {
  const end = raw.indexOf(0, start);
  const stop = end < 0 || end > start + length ? start + length : end;
  return raw.subarray(start, stop).toString("ascii");
}

function sectionKind(name: string): SectionRow["kind"] {
  if (
    name.startsWith(".debug") ||
    name.startsWith("__debug") ||
    name.startsWith("__DWARF,")
  ) {
    return "debug";
  }
  if (
    name.startsWith(".symtab") ||
    name.startsWith(".strtab") ||
    name.startsWith(".shstrtab") ||
    name.startsWith(".comment") ||
    name.startsWith(".note") ||
    name.startsWith("__LINKEDIT,")
  ) {
    return "metadata";
  }
  return "semantic";
}

function projection(
  targetTriple: CurrentTargetRawEvidence["targetTriple"],
  architecture: CurrentTargetRawEvidence["architecture"],
  kind: ObjectProjection["kind"],
  sections: SectionRow[],
): ObjectProjection {
  const semantic = sections.filter((row) => row.kind === "semantic");
  const debug = sections.filter((row) => row.kind === "debug");
  if (semantic.length === 0) {
    throw new Error("current_target_object_semantic_sections_empty");
  }
  if (kind === "object") {
    const names = new Set(debug.map((row) => row.name.split(",").at(-1)!));
    for (const required of DEBUG_NAMES) {
      if (
        (required.startsWith(".") && targetTriple.includes("apple")) ||
        (required.startsWith("__") && !targetTriple.includes("apple"))
      ) {
        continue;
      }
      if (!names.has(required)) {
        throw new Error(`current_target_debug_section_missing:${required}`);
      }
    }
  }
  const parts = (rows: readonly SectionRow[]) =>
    rows.flatMap((row) => [row.name, String(row.byteLength), row.bytesRaw32]);
  return Object.freeze({
    targetTriple,
    architecture,
    kind,
    sections: Object.freeze(sections),
    semanticRaw32: currentReleaseDomainCid(
      "cheng.compiler.current_object_semantic_projection",
      [targetTriple, ...parts(semantic)],
    ),
    debugRaw32: currentReleaseDomainCid(
      "cheng.compiler.current_debug_section_projection",
      [targetTriple, ...parts(debug)],
    ),
  });
}

function parseMachO(
  raw: Buffer,
  targetTriple: CurrentTargetRawEvidence["targetTriple"],
  architecture: CurrentTargetRawEvidence["architecture"],
  expectedKind: ObjectProjection["kind"],
): ObjectProjection {
  if (
    raw.length < 32 ||
    raw.readUInt32LE(0) !== 0xfeedfacf ||
    raw.readUInt32LE(4) !== 0x0100000c ||
    raw.readUInt32LE(12) !== (expectedKind === "object" ? 1 : 2)
  ) {
    throw new Error("current_target_macho_header_invalid");
  }
  const commandCount = raw.readUInt32LE(16);
  const commandBytes = raw.readUInt32LE(20);
  if (32 + commandBytes > raw.length || commandCount <= 0) {
    throw new Error("current_target_macho_load_commands_invalid");
  }
  const sections: SectionRow[] = [];
  let cursor = 32;
  for (let commandIndex = 0; commandIndex < commandCount; commandIndex += 1) {
    if (cursor + 8 > 32 + commandBytes) {
      throw new Error("current_target_macho_command_truncated");
    }
    const command = raw.readUInt32LE(cursor);
    const size = raw.readUInt32LE(cursor + 4);
    if (size < 8 || cursor + size > 32 + commandBytes) {
      throw new Error("current_target_macho_command_size_invalid");
    }
    if (command === 0x19) {
      if (size < 72) throw new Error("current_target_macho_segment_invalid");
      const segmentName = cString(raw, cursor + 8, 16);
      const sectionCount = raw.readUInt32LE(cursor + 64);
      if (72 + sectionCount * 80 > size) {
        throw new Error("current_target_macho_section_table_invalid");
      }
      for (let index = 0; index < sectionCount; index += 1) {
        const base = cursor + 72 + index * 80;
        const sectionName = cString(raw, base, 16);
        const sectionSegment = cString(raw, base + 16, 16);
        if (sectionSegment !== segmentName) {
          throw new Error("current_target_macho_section_segment_drift");
        }
        const byteLengthBig = raw.readBigUInt64LE(base + 40);
        if (byteLengthBig > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new Error("current_target_macho_section_too_large");
        }
        const byteLength = Number(byteLengthBig);
        const fileOffset = raw.readUInt32LE(base + 48);
        const flags = raw.readUInt32LE(base + 64) & 0xff;
        const payload =
          flags === 1
            ? Buffer.alloc(0)
            : raw.subarray(fileOffset, fileOffset + byteLength);
        if (flags !== 1 && (payload.length !== byteLength || byteLength <= 0)) {
          throw new Error("current_target_macho_section_payload_invalid");
        }
        const relocationOffset = raw.readUInt32LE(base + 56);
        const relocationCount = raw.readUInt32LE(base + 60);
        const relocationLength = relocationCount * 8;
        const relocation = raw.subarray(
          relocationOffset,
          relocationOffset + relocationLength,
        );
        if (relocation.length !== relocationLength) {
          throw new Error("current_target_macho_relocation_invalid");
        }
        const name = `${sectionSegment},${sectionName}`;
        const bytes = Buffer.concat([payload, relocation]);
        sections.push({
          ordinal: sections.length,
          name,
          kind: sectionKind(name),
          fileOffset,
          byteLength: bytes.length,
          bytesRaw32: sha256(bytes),
        });
      }
    }
    cursor += size;
  }
  if (cursor !== 32 + commandBytes) {
    throw new Error("current_target_macho_command_boundary_invalid");
  }
  return projection(targetTriple, architecture, expectedKind, sections);
}

function parseElf(
  raw: Buffer,
  targetTriple: CurrentTargetRawEvidence["targetTriple"],
  architecture: CurrentTargetRawEvidence["architecture"],
  expectedKind: ObjectProjection["kind"],
): ObjectProjection {
  const machine = architecture === "aarch64" ? 183 : 62;
  if (
    raw.length < 64 ||
    raw.subarray(0, 4).toString("hex") !== "7f454c46" ||
    raw[4] !== 2 ||
    raw[5] !== 1 ||
    (raw.readUInt16LE(16) !== (expectedKind === "object" ? 1 : 2) &&
      !(expectedKind === "executable" && raw.readUInt16LE(16) === 3)) ||
    raw.readUInt16LE(18) !== machine
  ) {
    throw new Error("current_target_elf_header_invalid");
  }
  const sectionOffsetBig = raw.readBigUInt64LE(40);
  if (sectionOffsetBig > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("current_target_elf_section_offset_invalid");
  }
  const sectionOffset = Number(sectionOffsetBig);
  const entrySize = raw.readUInt16LE(58);
  const count = raw.readUInt16LE(60);
  const stringIndex = raw.readUInt16LE(62);
  if (
    entrySize !== 64 ||
    count <= 1 ||
    stringIndex <= 0 ||
    stringIndex >= count ||
    sectionOffset + entrySize * count > raw.length
  ) {
    throw new Error("current_target_elf_section_table_invalid");
  }
  const header = (index: number) => sectionOffset + index * entrySize;
  const stringsHeader = header(stringIndex);
  const stringsOffset = Number(raw.readBigUInt64LE(stringsHeader + 24));
  const stringsLength = Number(raw.readBigUInt64LE(stringsHeader + 32));
  const strings = raw.subarray(stringsOffset, stringsOffset + stringsLength);
  if (strings.length !== stringsLength) {
    throw new Error("current_target_elf_section_names_invalid");
  }
  const sections: SectionRow[] = [];
  for (let index = 1; index < count; index += 1) {
    const base = header(index);
    const nameOffset = raw.readUInt32LE(base);
    const end = strings.indexOf(0, nameOffset);
    if (nameOffset >= strings.length || end < 0) {
      throw new Error("current_target_elf_section_name_invalid");
    }
    const name = strings.subarray(nameOffset, end).toString("utf8");
    const type = raw.readUInt32LE(base + 4);
    if (type === 8) continue;
    const offsetBig = raw.readBigUInt64LE(base + 24);
    const lengthBig = raw.readBigUInt64LE(base + 32);
    if (
      offsetBig > BigInt(Number.MAX_SAFE_INTEGER) ||
      lengthBig > BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      throw new Error("current_target_elf_section_range_invalid");
    }
    const fileOffset = Number(offsetBig);
    const byteLength = Number(lengthBig);
    const bytes = raw.subarray(fileOffset, fileOffset + byteLength);
    if (byteLength <= 0 || bytes.length !== byteLength) {
      continue;
    }
    sections.push({
      ordinal: sections.length,
      name,
      kind: sectionKind(name),
      fileOffset,
      byteLength,
      bytesRaw32: sha256(bytes),
    });
  }
  return projection(targetTriple, architecture, expectedKind, sections);
}

function parseObject(
  raw: Buffer,
  targetTriple: CurrentTargetRawEvidence["targetTriple"],
  architecture: CurrentTargetRawEvidence["architecture"],
  expectedKind: ObjectProjection["kind"],
): ObjectProjection {
  return targetTriple === "aarch64-apple-darwin"
    ? parseMachO(raw, targetTriple, architecture, expectedKind)
    : parseElf(raw, targetTriple, architecture, expectedKind);
}

function exactIdentity(
  value: Record<string, unknown>,
  expected: {
    targetTriple: string;
    architecture: string;
    backend: string;
    sourceBundleRaw32: string;
    driverRaw32: string;
    executionRaw32: string;
    driverRole: "production" | "immutable_baseline";
  },
  label: string,
): void {
  for (const key of [
    "targetTriple",
    "architecture",
    "backend",
    "sourceBundleRaw32",
    "driverRaw32",
    "executionRaw32",
    "driverRole",
  ] as const) {
    if (value[key] !== expected[key]) {
      throw new Error(`${label}_${key}_identity_drift`);
    }
  }
}

export function validateCurrentActionArtifact(
  raw: Buffer,
  expected: {
    readonly targetTriple: string;
    readonly architecture: string;
    readonly backend: string;
    readonly sourceBundleRaw32: string;
    readonly driverRaw32: string;
    readonly executionRaw32: string;
    readonly driverRole: "production" | "immutable_baseline";
  },
): CurrentActionValidation {
  const value = canonicalObject(raw, "current_target_action");
  assertExactCurrentObjectKeys(
    value,
    [
      "schema",
      "status",
      "driverRole",
      "targetTriple",
      "architecture",
      "backend",
      "sourceBundleRaw32",
      "driverRaw32",
      "executionRaw32",
      "bodyIrRaw32",
      "actions",
    ],
    "current_target_action",
  );
  if (
    value.schema !== CHENG_CURRENT_TARGET_ACTION_SCHEMA ||
    value.status !== "COMPLETE" ||
    !Array.isArray(value.actions) ||
    value.actions.length === 0
  ) {
    throw new Error("current_target_action_header_invalid");
  }
  exactIdentity(value, expected, "current_target_action");
  const bodyIrRaw32 = hash(value.bodyIrRaw32, "current_target_body_ir");
  let spillEvents = 0;
  for (let index = 0; index < value.actions.length; index += 1) {
    const action = value.actions[index];
    assertExactCurrentObjectKeys(
      action,
      [
        "ordinal",
        "opId",
        "kind",
        "registerClass",
        "virtualRegister",
        "location",
      ],
      `current_target_action_${index}`,
    );
    if (
      action.ordinal !== index ||
      !Number.isSafeInteger(action.opId) ||
      Number(action.opId) < 0 ||
      !["assign", "fixed", "copy", "spill", "reload"].includes(
        String(action.kind),
      ) ||
      !["gpr", "fpr"].includes(String(action.registerClass)) ||
      !Number.isSafeInteger(action.virtualRegister) ||
      Number(action.virtualRegister) < 0 ||
      !Number.isSafeInteger(action.location) ||
      Number(action.location) < 0
    ) {
      throw new Error(`current_target_action_${index}_invalid`);
    }
    if (action.kind === "spill" || action.kind === "reload") spillEvents += 1;
  }
  return Object.freeze({
    raw32: sha256(raw),
    bodyIrRaw32,
    spillDensityPpm: Math.floor(
      (spillEvents * 1_000_000) / value.actions.length,
    ),
  });
}

function validateFragment(
  raw: Buffer,
  expected: {
    readonly targetTriple: string;
    readonly architecture: string;
    readonly backend: string;
    readonly sourceBundleRaw32: string;
    readonly driverRaw32: string;
    readonly executionRaw32: string;
    readonly driverRole: "production" | "immutable_baseline";
    readonly bodyIrRaw32: string;
    readonly actionRaw32: string;
    readonly objectRaw32: string;
    readonly sections: readonly SectionRow[];
  },
): CurrentFragmentValidation {
  const value = canonicalObject(raw, "current_target_fragment");
  assertExactCurrentObjectKeys(
    value,
    [
      "schema",
      "status",
      "driverRole",
      "targetTriple",
      "architecture",
      "backend",
      "sourceBundleRaw32",
      "driverRaw32",
      "executionRaw32",
      "bodyIrRaw32",
      "actionRaw32",
      "objectRaw32",
      "sections",
    ],
    "current_target_fragment",
  );
  if (
    value.schema !== CHENG_CURRENT_TARGET_FRAGMENT_SCHEMA ||
    value.status !== "COMPLETE"
  ) {
    throw new Error("current_target_fragment_header_invalid");
  }
  exactIdentity(value, expected, "current_target_fragment");
  if (
    value.bodyIrRaw32 !== expected.bodyIrRaw32 ||
    value.actionRaw32 !== expected.actionRaw32 ||
    value.objectRaw32 !== expected.objectRaw32 ||
    canonicalJson(value.sections) !== canonicalJson(expected.sections)
  ) {
    throw new Error("current_target_fragment_projection_drift");
  }
  return Object.freeze({
    raw32: sha256(raw),
    actionRaw32: expected.actionRaw32,
    objectRaw32: expected.objectRaw32,
  });
}

function unwrapStream(raw: Buffer, kind: "stdout" | "stderr"): Buffer {
  const magic = kind === "stdout" ? "CROUTPUT" : "CRERROR!";
  if (raw.length < 16 || raw.subarray(0, 8).toString("ascii") !== magic) {
    throw new Error(`current_target_run_${kind}_header_invalid`);
  }
  const length = raw.readBigUInt64BE(8);
  if (
    length > BigInt(Number.MAX_SAFE_INTEGER) ||
    Number(length) !== raw.length - 16
  ) {
    throw new Error(`current_target_run_${kind}_length_invalid`);
  }
  return raw.subarray(16);
}

function validateRun(
  statusRaw: Buffer,
  stdoutRaw: Buffer,
  stderrRaw: Buffer,
  identityParts: readonly string[],
): string {
  if (
    statusRaw.length !== 16 ||
    statusRaw.subarray(0, 8).toString("ascii") !== "CRSTATUS" ||
    statusRaw.readInt32BE(8) !== 0 ||
    statusRaw.readInt32BE(12) !== 0
  ) {
    throw new Error("current_target_run_status_invalid");
  }
  const stdout = unwrapStream(stdoutRaw, "stdout");
  const stderr = unwrapStream(stderrRaw, "stderr");
  return currentReleaseDomainCid("cheng.compiler.current_target_run_result", [
    ...identityParts,
    statusRaw,
    stdout,
    stderr,
  ]);
}

function validateOrc(
  raw: Buffer,
  expected: {
    readonly targetTriple: string;
    readonly architecture: string;
    readonly backend: string;
    readonly sourceBundleRaw32: string;
    readonly driverRaw32: string;
    readonly executionRaw32: string;
    readonly driverRole: "production";
    readonly actionRaw32: string;
    readonly fragmentRaw32: string;
    readonly objectRaw32: string;
    readonly executableRaw32: string;
  },
): {
  readonly resultRaw32: string;
  readonly destructorOrderRaw32: string;
  readonly raw32: string;
} {
  const value = canonicalObject(raw, "current_target_orc");
  assertExactCurrentObjectKeys(
    value,
    [
      "schema",
      "status",
      "driverRole",
      "targetTriple",
      "architecture",
      "backend",
      "sourceBundleRaw32",
      "driverRaw32",
      "executionRaw32",
      "actionRaw32",
      "fragmentRaw32",
      "objectRaw32",
      "executableRaw32",
      "events",
    ],
    "current_target_orc",
  );
  if (
    value.schema !== CHENG_CURRENT_ORC_EVENT_SCHEMA ||
    value.status !== "COMPLETE" ||
    !Array.isArray(value.events) ||
    value.events.length === 0
  ) {
    throw new Error("current_target_orc_header_invalid");
  }
  exactIdentity(value, expected, "current_target_orc");
  for (const key of [
    "actionRaw32",
    "fragmentRaw32",
    "objectRaw32",
    "executableRaw32",
  ] as const) {
    if (value[key] !== expected[key]) {
      throw new Error(`current_target_orc_${key}_drift`);
    }
  }
  const live = new Map<string, number>();
  const results: string[] = [];
  const destructors: string[][] = [];
  let iteration = 0;
  let sawResult = false;
  let destructorOrdinal = 0;
  let currentDestructors: string[] = [];
  let allocCount = 0;
  let freeCount = 0;
  for (let index = 0; index < value.events.length; index += 1) {
    const event = value.events[index] as Record<string, unknown>;
    if (
      event === null ||
      typeof event !== "object" ||
      Array.isArray(event) ||
      event.sequence !== index ||
      event.iteration !== iteration
    ) {
      throw new Error(`current_target_orc_event_${index}_identity_invalid`);
    }
    const kind = event.kind;
    if (kind === "alloc" || kind === "free") {
      assertExactCurrentObjectKeys(
        event,
        ["sequence", "iteration", "kind", "valueId", "bytes"],
        `current_target_orc_event_${index}`,
      );
      const valueId = integer(
        event.valueId,
        `current_target_orc_event_${index}_value`,
      );
      const bytes = integer(
        event.bytes,
        `current_target_orc_event_${index}_bytes`,
        1,
      );
      const key = `${iteration}:${valueId}`;
      if (kind === "alloc") {
        if (live.has(key)) {
          throw new Error("current_target_orc_duplicate_alloc");
        }
        live.set(key, bytes);
        allocCount += 1;
      } else {
        if (live.get(key) !== bytes) {
          throw new Error("current_target_orc_unmatched_free");
        }
        live.delete(key);
        freeCount += 1;
      }
    } else if (kind === "result") {
      assertExactCurrentObjectKeys(
        event,
        ["sequence", "iteration", "kind", "resultRaw32"],
        `current_target_orc_event_${index}`,
      );
      if (sawResult) throw new Error("current_target_orc_duplicate_result");
      results.push(
        hash(event.resultRaw32, `current_target_orc_event_${index}_result`),
      );
      sawResult = true;
    } else if (kind === "destructor") {
      assertExactCurrentObjectKeys(
        event,
        ["sequence", "iteration", "kind", "valueId", "ordinal"],
        `current_target_orc_event_${index}`,
      );
      if (
        event.ordinal !== destructorOrdinal ||
        !Number.isSafeInteger(event.valueId) ||
        Number(event.valueId) < 0
      ) {
        throw new Error("current_target_orc_destructor_order_invalid");
      }
      currentDestructors.push(String(event.valueId));
      destructorOrdinal += 1;
    } else if (kind === "iteration_end") {
      assertExactCurrentObjectKeys(
        event,
        ["sequence", "iteration", "kind"],
        `current_target_orc_event_${index}`,
      );
      if (live.size !== 0 || !sawResult || currentDestructors.length === 0) {
        throw new Error("current_target_orc_iteration_incomplete");
      }
      destructors.push(currentDestructors);
      iteration += 1;
      sawResult = false;
      destructorOrdinal = 0;
      currentDestructors = [];
    } else {
      throw new Error("current_target_orc_event_kind_invalid");
    }
  }
  if (
    iteration !== 5000 ||
    live.size !== 0 ||
    allocCount === 0 ||
    allocCount !== freeCount ||
    results.length !== iteration ||
    destructors.length !== iteration ||
    new Set(results).size !== 1 ||
    new Set(destructors.map((rows) => canonicalJson(rows))).size !== 1
  ) {
    throw new Error("current_target_orc_balance_or_fixed_point_invalid");
  }
  return Object.freeze({
    resultRaw32: results[0]!,
    destructorOrderRaw32: currentReleaseDomainCid(
      "cheng.compiler.current_target_destructor_order",
      destructors[0]!,
    ),
    raw32: sha256(raw),
  });
}

export function validateCurrentTargetMatrix(
  targets: readonly CurrentTargetRawEvidence[],
  identity: CurrentTargetIdentity,
  reader: CurrentRawReader,
): CurrentTargetMatrixValidation {
  if (targets.length !== TARGETS.length) {
    throw new Error("current_target_matrix_header_invalid");
  }
  hash(identity.sourceBundleRaw32, "current_target_matrix_source_bundle");
  hash(identity.executionRaw32, "current_target_matrix_execution");
  const validations: CurrentTargetBackendValidation[] = [];
  for (let targetIndex = 0; targetIndex < TARGETS.length; targetIndex += 1) {
    const target = targets[targetIndex]!;
    assertExactCurrentObjectKeys(
      target,
      ["targetTriple", "architecture", "driverRaw32", "backends"],
      `current_target_${targetIndex}`,
    );
    const expectedTarget = TARGETS[targetIndex]!;
    if (
      target.targetTriple !== expectedTarget[0] ||
      target.architecture !== expectedTarget[1] ||
      target.backends.length !== BACKENDS.length
    ) {
      throw new Error(`current_target_${targetIndex}_identity_invalid`);
    }
    const driverRaw32 = hash(
      target.driverRaw32,
      `current_target_${targetIndex}_driver`,
    );
    for (
      let backendIndex = 0;
      backendIndex < BACKENDS.length;
      backendIndex += 1
    ) {
      const backend = target.backends[backendIndex]!;
      assertExactCurrentObjectKeys(
        backend,
        [
          "backend",
          "object",
          "executable",
          "action",
          "fragment",
          "runStatus",
          "runStdout",
          "runStderr",
          "orcEvents",
        ],
        `current_target_${targetIndex}_backend_${backendIndex}`,
      );
      if (backend.backend !== BACKENDS[backendIndex]) {
        throw new Error("current_target_backend_order_invalid");
      }
      const label = `current_target_${targetIndex}_${backend.backend}`;
      const objectRaw = read(backend.object, `${label}_object`, reader);
      const executableRaw = read(
        backend.executable,
        `${label}_executable`,
        reader,
      );
      const objectRaw32 = sha256(objectRaw);
      const executableRaw32 = sha256(executableRaw);
      const object = parseObject(
        objectRaw,
        target.targetTriple,
        target.architecture,
        "object",
      );
      parseObject(
        executableRaw,
        target.targetTriple,
        target.architecture,
        "executable",
      );
      const expectedIdentity = {
        targetTriple: target.targetTriple,
        architecture: target.architecture,
        backend: backend.backend,
        sourceBundleRaw32: identity.sourceBundleRaw32,
        driverRaw32,
        executionRaw32: identity.executionRaw32,
        driverRole: "production" as const,
      };
      const actionRaw = read(backend.action, `${label}_action`, reader);
      const action = validateCurrentActionArtifact(actionRaw, expectedIdentity);
      const fragmentRaw = read(backend.fragment, `${label}_fragment`, reader);
      const fragment = validateFragment(fragmentRaw, {
        ...expectedIdentity,
        bodyIrRaw32: action.bodyIrRaw32,
        actionRaw32: action.raw32,
        objectRaw32,
        sections: object.sections,
      });
      const runStatusRaw = read(
        backend.runStatus,
        `${label}_run_status`,
        reader,
      );
      const runStdoutRaw = read(
        backend.runStdout,
        `${label}_run_stdout`,
        reader,
      );
      const runStderrRaw = read(
        backend.runStderr,
        `${label}_run_stderr`,
        reader,
      );
      const runResultRaw32 = validateRun(
        runStatusRaw,
        runStdoutRaw,
        runStderrRaw,
        [
          target.targetTriple,
          identity.sourceBundleRaw32,
          identity.executionRaw32,
        ],
      );
      const orcRaw = read(backend.orcEvents, `${label}_orc`, reader);
      const orc = validateOrc(orcRaw, {
        ...expectedIdentity,
        actionRaw32: action.raw32,
        fragmentRaw32: fragment.raw32,
        objectRaw32,
        executableRaw32,
      });
      validations.push(
        Object.freeze({
          targetTriple: target.targetTriple,
          architecture: target.architecture,
          backend: backend.backend,
          driverRaw32,
          objectRaw32,
          executableRaw32,
          action,
          fragment,
          objectSemanticRaw32: object.semanticRaw32,
          debugProjectionRaw32: object.debugRaw32,
          runResultRaw32,
          orcResultRaw32: orc.resultRaw32,
          destructorOrderRaw32: orc.destructorOrderRaw32,
          evidenceRaw32: currentReleaseDomainCid(
            "cheng.compiler.current_target_backend_raw_evidence",
            [
              target.targetTriple,
              backend.backend,
              driverRaw32,
              objectRaw32,
              executableRaw32,
              action.raw32,
              fragment.raw32,
              sha256(runStatusRaw),
              sha256(runStdoutRaw),
              sha256(runStderrRaw),
              orc.raw32,
              object.semanticRaw32,
              object.debugRaw32,
              runResultRaw32,
              orc.resultRaw32,
              orc.destructorOrderRaw32,
            ],
          ),
        }),
      );
    }
    const pair = validations.slice(-2);
    if (pair[0]!.action.bodyIrRaw32 !== pair[1]!.action.bodyIrRaw32) {
      throw new Error(
        `current_target_${target.targetTriple}_body_ir_backend_drift`,
      );
    }
    for (const key of [
      "objectSemanticRaw32",
      "debugProjectionRaw32",
      "runResultRaw32",
      "orcResultRaw32",
      "destructorOrderRaw32",
    ] as const) {
      if (pair[0]![key] !== pair[1]![key]) {
        throw new Error(
          `current_target_${target.targetTriple}_${key}_backend_drift`,
        );
      }
    }
  }
  return Object.freeze({
    raw32: currentReleaseDomainCid(
      "cheng.compiler.current_target_matrix_raw_evidence",
      validations.map((row) => row.evidenceRaw32),
    ),
    backends: Object.freeze(validations),
  });
}

function decimal(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !UINT.test(value)) {
    throw new Error(`${label}_decimal_invalid`);
  }
  return BigInt(value);
}

function ppm(numerator: bigint, denominator: bigint): number {
  if (denominator <= 0n) throw new Error("current_performance_ratio_zero");
  const value = (numerator * 1_000_000n + denominator - 1n) / denominator;
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("current_performance_ratio_overflow");
  }
  return Number(value);
}

function textBytes(raw: Buffer): number {
  if (
    raw.length < 32 ||
    raw.readUInt32LE(0) !== 0xfeedfacf ||
    raw.readUInt32LE(4) !== 0x0100000c
  ) {
    throw new Error("current_performance_text_macho_invalid");
  }
  const count = raw.readUInt32LE(16);
  const commandBytes = raw.readUInt32LE(20);
  if (32 + commandBytes > raw.length) {
    throw new Error("current_performance_text_commands_invalid");
  }
  let cursor = 32;
  let observed: number | undefined;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 8 > 32 + commandBytes) {
      throw new Error("current_performance_text_command_truncated");
    }
    const command = raw.readUInt32LE(cursor);
    const size = raw.readUInt32LE(cursor + 4);
    if (size < 8 || cursor + size > 32 + commandBytes) {
      throw new Error("current_performance_text_command_size_invalid");
    }
    if (command === 0x19 && cString(raw, cursor + 8, 16) === "__TEXT") {
      if (size < 72 || observed !== undefined) {
        throw new Error("current_performance_text_segment_invalid");
      }
      const value = raw.readBigUInt64LE(cursor + 48);
      if (value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("current_performance_text_size_invalid");
      }
      observed = Number(value);
    }
    cursor += size;
  }
  if (observed === undefined) {
    throw new Error("current_performance_text_segment_missing");
  }
  return observed;
}

interface PerfTrace {
  readonly role: "candidate" | "baseline";
  readonly jobs: number;
  readonly wallNs: bigint;
  readonly peakBytes: bigint;
  readonly raw32: string;
}

function validatePerformanceCommand(
  raw: Buffer,
  expected: {
    readonly role: "candidate" | "baseline";
    readonly jobs: number;
    readonly identity: {
      readonly sourceBundleRaw32: string;
      readonly driverRaw32: string;
      readonly executionRaw32: string;
    };
    readonly artifacts: {
      readonly actionRaw32: string;
      readonly fragmentRaw32: string;
      readonly objectRaw32: string;
    };
  },
): string {
  const value = canonicalObject(raw, "current_performance_command");
  assertExactCurrentObjectKeys(
    value,
    [
      "schema",
      "status",
      "role",
      "jobs",
      "sourceBundleRaw32",
      "driverRaw32",
      "executionRaw32",
      "actionRaw32",
      "fragmentRaw32",
      "objectRaw32",
      "argv",
    ],
    "current_performance_command",
  );
  for (const [key, expectedValue] of Object.entries({
    schema: CHENG_CURRENT_PERFORMANCE_COMMAND_SCHEMA,
    status: "COMPLETE",
    role: expected.role,
    jobs: expected.jobs,
    ...expected.identity,
    ...expected.artifacts,
  })) {
    if (value[key] !== expectedValue) {
      throw new Error(`current_performance_command_${key}_drift`);
    }
  }
  if (
    !Array.isArray(value.argv) ||
    value.argv.length === 0 ||
    value.argv.some(
      (argument) =>
        typeof argument !== "string" ||
        argument.length === 0 ||
        argument !== argument.trim(),
    )
  ) {
    throw new Error("current_performance_command_argv_invalid");
  }
  return sha256(raw);
}

function validatePerformanceEnvironment(
  raw: Buffer,
  jobs: number,
): {
  readonly raw32: string;
  readonly hostRaw32: string;
  readonly toolchainRaw32: string;
} {
  const value = canonicalObject(raw, "current_performance_environment");
  assertExactCurrentObjectKeys(
    value,
    [
      "schema",
      "status",
      "jobs",
      "samplingScope",
      "sampleClock",
      "hostRaw32",
      "toolchainRaw32",
    ],
    "current_performance_environment",
  );
  if (
    value.schema !== CHENG_CURRENT_PERFORMANCE_ENVIRONMENT_SCHEMA ||
    value.status !== "COMPLETE" ||
    value.jobs !== jobs ||
    value.samplingScope !== "process_tree_recursive" ||
    value.sampleClock !== "monotonic_ns"
  ) {
    throw new Error("current_performance_environment_identity_drift");
  }
  return Object.freeze({
    raw32: sha256(raw),
    hostRaw32: hash(value.hostRaw32, "current_performance_environment_host"),
    toolchainRaw32: hash(
      value.toolchainRaw32,
      "current_performance_environment_toolchain",
    ),
  });
}

function validateTrace(
  raw: Buffer,
  expected: {
    ordinal: number;
    order: "ABBA" | "BAAB";
    position: number;
    jobs: number;
    role: "candidate" | "baseline";
    identity: {
      sourceBundleRaw32: string;
      driverRaw32: string;
      executionRaw32: string;
    };
    actionRaw32: string;
    fragmentRaw32: string;
    objectRaw32: string;
    commandRaw32: string;
    environmentRaw32: string;
  },
): PerfTrace {
  const value = canonicalObject(raw, "current_performance_trace");
  assertExactCurrentObjectKeys(
    value,
    [
      "schema",
      "status",
      "ordinal",
      "order",
      "position",
      "jobs",
      "role",
      "sourceBundleRaw32",
      "driverRaw32",
      "executionRaw32",
      "actionRaw32",
      "fragmentRaw32",
      "objectRaw32",
      "commandRaw32",
      "environmentRaw32",
      "startMonotonicNs",
      "endMonotonicNs",
      "samples",
    ],
    "current_performance_trace",
  );
  for (const [key, expectedValue] of Object.entries({
    schema: CHENG_CURRENT_PERFORMANCE_TRACE_SCHEMA,
    status: "COMPLETE",
    ordinal: expected.ordinal,
    order: expected.order,
    position: expected.position,
    jobs: expected.jobs,
    role: expected.role,
    sourceBundleRaw32: expected.identity.sourceBundleRaw32,
    driverRaw32: expected.identity.driverRaw32,
    executionRaw32: expected.identity.executionRaw32,
    actionRaw32: expected.actionRaw32,
    fragmentRaw32: expected.fragmentRaw32,
    objectRaw32: expected.objectRaw32,
    commandRaw32: expected.commandRaw32,
    environmentRaw32: expected.environmentRaw32,
  })) {
    if (value[key] !== expectedValue) {
      throw new Error(`current_performance_trace_${key}_drift`);
    }
  }
  const start = decimal(
    value.startMonotonicNs,
    "current_performance_trace_start",
  );
  const end = decimal(value.endMonotonicNs, "current_performance_trace_end");
  if (
    end <= start ||
    !Array.isArray(value.samples) ||
    value.samples.length < 2
  ) {
    throw new Error("current_performance_trace_range_invalid");
  }
  let prior = start - 1n;
  let peak = 0n;
  for (let index = 0; index < value.samples.length; index += 1) {
    const sample = value.samples[index];
    assertExactCurrentObjectKeys(
      sample,
      ["ordinal", "monotonicNs", "processTreeBytes"],
      `current_performance_trace_sample_${index}`,
    );
    const time = decimal(
      sample.monotonicNs,
      `current_performance_trace_sample_${index}_time`,
    );
    const bytes = BigInt(
      integer(
        sample.processTreeBytes,
        `current_performance_trace_sample_${index}_bytes`,
        1,
      ),
    );
    if (
      sample.ordinal !== index ||
      time <= prior ||
      time < start ||
      time > end ||
      bytes >= BigInt(MEMORY_LIMIT_BYTES)
    ) {
      throw new Error(`current_performance_trace_sample_${index}_invalid`);
    }
    prior = time;
    if (bytes > peak) peak = bytes;
  }
  return Object.freeze({
    role: expected.role,
    jobs: expected.jobs,
    wallNs: end - start,
    peakBytes: peak,
    raw32: sha256(raw),
  });
}

function parsePerfPin(value: unknown, label: string): CurrentRawPin {
  assertExactCurrentObjectKeys(
    value,
    ["path", "byteLength", "bytesRaw32"],
    label,
  );
  const pin = value as Record<string, unknown>;
  if (
    typeof pin.path !== "string" ||
    !Number.isSafeInteger(pin.byteLength) ||
    Number(pin.byteLength) <= 0
  ) {
    throw new Error(`${label}_invalid`);
  }
  return {
    path: pin.path,
    byteLength: Number(pin.byteLength),
    bytesRaw32: hash(pin.bytesRaw32, `${label}_bytes`),
  };
}

export function validateCurrentPerformanceEvidence(
  value: unknown,
  identity: CurrentTargetIdentity & { readonly officialDriverRaw32: string },
  targets: CurrentTargetMatrixValidation,
  expectedPins: {
    readonly candidateAction: CurrentRawPin;
    readonly candidateFragment: CurrentRawPin;
    readonly candidateObject: CurrentRawPin;
    readonly currentTextBinary: CurrentRawPin;
    readonly baselineTextBinary: CurrentRawPin;
  },
  reader: CurrentRawReader,
): CurrentPerformanceValidation {
  assertExactCurrentObjectKeys(
    value,
    [
      "schema",
      "status",
      "sourceBundleRaw32",
      "officialDriverRaw32",
      "executionRaw32",
      "jobsN",
      "baselineIdentity",
      "candidateAction",
      "candidateFragment",
      "candidateObject",
      "baselineAction",
      "baselineFragment",
      "baselineObject",
      "currentTextBinary",
      "baselineTextBinary",
      "clangTextBinary",
      "commands",
      "environments",
      "samples",
    ],
    "current_performance_evidence",
  );
  const evidence = value as Record<string, unknown>;
  if (
    evidence.schema !== CHENG_CURRENT_PERFORMANCE_EVIDENCE_SCHEMA ||
    evidence.status !== "COMPLETE" ||
    evidence.sourceBundleRaw32 !== identity.sourceBundleRaw32 ||
    evidence.officialDriverRaw32 !== identity.officialDriverRaw32 ||
    evidence.executionRaw32 !== identity.executionRaw32
  ) {
    throw new Error("current_performance_evidence_identity_invalid");
  }
  const jobsN = integer(evidence.jobsN, "current_performance_jobs_n", 2);
  const evidencePaths = new Set<string>();
  const performancePin = (pinValue: unknown, label: string): CurrentRawPin => {
    const pin = parsePerfPin(pinValue, label);
    if (evidencePaths.has(pin.path)) {
      throw new Error(`current_performance_artifact_path_alias:${pin.path}`);
    }
    evidencePaths.add(pin.path);
    return pin;
  };
  assertExactCurrentObjectKeys(
    evidence.baselineIdentity,
    ["sourceBundleRaw32", "driverRaw32", "executionRaw32"],
    "current_performance_baseline_identity",
  );
  const baselineIdentity = evidence.baselineIdentity as Record<string, unknown>;
  const baseline = {
    sourceBundleRaw32: hash(
      baselineIdentity.sourceBundleRaw32,
      "current_performance_baseline_source",
    ),
    driverRaw32: hash(
      baselineIdentity.driverRaw32,
      "current_performance_baseline_driver",
    ),
    executionRaw32: hash(
      baselineIdentity.executionRaw32,
      "current_performance_baseline_execution",
    ),
  };
  if (
    expectedPins.currentTextBinary.bytesRaw32 !==
      identity.officialDriverRaw32 ||
    expectedPins.baselineTextBinary.bytesRaw32 !== baseline.driverRaw32
  ) {
    throw new Error("current_performance_driver_binary_identity_drift");
  }
  const candidateBackend = targets.backends.find(
    (row) =>
      row.targetTriple === "aarch64-apple-darwin" && row.backend === "primary",
  );
  if (candidateBackend === undefined) {
    throw new Error("current_performance_candidate_backend_missing");
  }
  const candidatePins = [
    ["candidateAction", expectedPins.candidateAction],
    ["candidateFragment", expectedPins.candidateFragment],
    ["candidateObject", expectedPins.candidateObject],
    ["currentTextBinary", expectedPins.currentTextBinary],
    ["baselineTextBinary", expectedPins.baselineTextBinary],
  ] as const;
  for (const [key, expected] of candidatePins) {
    if (canonicalJson(evidence[key]) !== canonicalJson(expected)) {
      throw new Error(`current_performance_${key}_pin_drift`);
    }
  }
  const candidateActionPin = performancePin(
    evidence.candidateAction,
    "current_performance_candidate_action",
  );
  const candidateFragmentPin = performancePin(
    evidence.candidateFragment,
    "current_performance_candidate_fragment",
  );
  const candidateObjectPin = performancePin(
    evidence.candidateObject,
    "current_performance_candidate_object",
  );
  if (
    candidateActionPin.bytesRaw32 !== candidateBackend.action.raw32 ||
    candidateFragmentPin.bytesRaw32 !== candidateBackend.fragment.raw32 ||
    candidateObjectPin.bytesRaw32 !== candidateBackend.objectRaw32
  ) {
    throw new Error("current_performance_candidate_raw_binding_drift");
  }
  const baselineActionPin = performancePin(
    evidence.baselineAction,
    "current_performance_baseline_action",
  );
  const baselineFragmentPin = performancePin(
    evidence.baselineFragment,
    "current_performance_baseline_fragment",
  );
  const baselineObjectPin = performancePin(
    evidence.baselineObject,
    "current_performance_baseline_object",
  );
  const baselineObjectRaw = read(
    baselineObjectPin,
    "current_performance_baseline_object",
    reader,
  );
  const baselineProjection = parseObject(
    baselineObjectRaw,
    "aarch64-apple-darwin",
    "arm64",
    "object",
  );
  const baselineActionRaw = read(
    baselineActionPin,
    "current_performance_baseline_action",
    reader,
  );
  const baselineAction = validateCurrentActionArtifact(baselineActionRaw, {
    targetTriple: "aarch64-apple-darwin",
    architecture: "arm64",
    backend: "primary",
    ...baseline,
    driverRole: "immutable_baseline",
  });
  const baselineFragmentRaw = read(
    baselineFragmentPin,
    "current_performance_baseline_fragment",
    reader,
  );
  const baselineFragment = validateFragment(baselineFragmentRaw, {
    targetTriple: "aarch64-apple-darwin",
    architecture: "arm64",
    backend: "primary",
    ...baseline,
    driverRole: "immutable_baseline",
    bodyIrRaw32: baselineAction.bodyIrRaw32,
    actionRaw32: baselineAction.raw32,
    objectRaw32: sha256(baselineObjectRaw),
    sections: baselineProjection.sections,
  });
  const benchmarkIdentity = (role: "candidate" | "baseline") =>
    role === "candidate"
      ? {
          sourceBundleRaw32: identity.sourceBundleRaw32,
          driverRaw32: identity.officialDriverRaw32,
          executionRaw32: identity.executionRaw32,
        }
      : baseline;
  const benchmarkArtifacts = (role: "candidate" | "baseline") =>
    role === "candidate"
      ? {
          actionRaw32: candidateBackend.action.raw32,
          fragmentRaw32: candidateBackend.fragment.raw32,
          objectRaw32: candidateBackend.objectRaw32,
        }
      : {
          actionRaw32: baselineAction.raw32,
          fragmentRaw32: baselineFragment.raw32,
          objectRaw32: sha256(baselineObjectRaw),
        };
  const currentTextRaw = read(
    performancePin(
      evidence.currentTextBinary,
      "current_performance_current_text",
    ),
    "current_performance_current_text",
    reader,
  );
  const baselineTextRaw = read(
    performancePin(
      evidence.baselineTextBinary,
      "current_performance_baseline_text",
    ),
    "current_performance_baseline_text",
    reader,
  );
  const clangTextRaw = read(
    performancePin(evidence.clangTextBinary, "current_performance_clang_text"),
    "current_performance_clang_text",
    reader,
  );
  const currentTextBytes = textBytes(currentTextRaw);
  const baselineTextBytes = textBytes(baselineTextRaw);
  const clangTextBytes = textBytes(clangTextRaw);
  const textRatio = ppm(BigInt(currentTextBytes), BigInt(clangTextBytes));
  if (currentTextBytes >= baselineTextBytes || textRatio > 2_000_000) {
    throw new Error("current_performance_text_contract_failed");
  }
  if (!Array.isArray(evidence.commands) || evidence.commands.length !== 4) {
    throw new Error("current_performance_command_set_invalid");
  }
  const commandRows = [
    ["candidate", 1],
    ["baseline", 1],
    ["candidate", jobsN],
    ["baseline", jobsN],
  ] as const;
  const commands = new Map<string, string>();
  for (let index = 0; index < commandRows.length; index += 1) {
    const row = evidence.commands[index];
    assertExactCurrentObjectKeys(
      row,
      ["role", "jobs", "artifact"],
      `current_performance_command_${index}`,
    );
    const expected = commandRows[index]!;
    if (row.role !== expected[0] || row.jobs !== expected[1]) {
      throw new Error(`current_performance_command_${index}_identity_drift`);
    }
    const pin = performancePin(
      row.artifact,
      `current_performance_command_${index}`,
    );
    const raw = read(pin, `current_performance_command_${index}`, reader);
    commands.set(
      `${row.role}:${row.jobs}`,
      validatePerformanceCommand(raw, {
        role: row.role,
        jobs: row.jobs,
        identity: benchmarkIdentity(row.role),
        artifacts: benchmarkArtifacts(row.role),
      }),
    );
  }
  if (
    !Array.isArray(evidence.environments) ||
    evidence.environments.length !== 2
  ) {
    throw new Error("current_performance_environment_set_invalid");
  }
  const environments = new Map<
    number,
    {
      readonly raw32: string;
      readonly hostRaw32: string;
      readonly toolchainRaw32: string;
    }
  >();
  for (let index = 0; index < 2; index += 1) {
    const row = evidence.environments[index];
    assertExactCurrentObjectKeys(
      row,
      ["jobs", "artifact"],
      `current_performance_environment_${index}`,
    );
    const expectedJobs = index === 0 ? 1 : jobsN;
    if (row.jobs !== expectedJobs) {
      throw new Error(`current_performance_environment_${index}_jobs_drift`);
    }
    const pin = performancePin(
      row.artifact,
      `current_performance_environment_${index}`,
    );
    environments.set(
      expectedJobs,
      validatePerformanceEnvironment(
        read(pin, `current_performance_environment_${index}`, reader),
        expectedJobs,
      ),
    );
  }
  const jobs1Environment = environments.get(1)!;
  const jobsNEnvironment = environments.get(jobsN)!;
  if (
    jobs1Environment.hostRaw32 !== jobsNEnvironment.hostRaw32 ||
    jobs1Environment.toolchainRaw32 !== jobsNEnvironment.toolchainRaw32
  ) {
    throw new Error("current_performance_environment_host_or_toolchain_drift");
  }
  if (!Array.isArray(evidence.samples) || evidence.samples.length !== 12) {
    throw new Error("current_performance_sample_set_invalid");
  }
  const blocks = [
    ["ABBA", 1],
    ["BAAB", 1],
    ["ABBA", jobsN],
  ] as const;
  const traces: PerfTrace[] = [];
  for (let block = 0; block < blocks.length; block += 1) {
    const [order, jobs] = blocks[block]!;
    const roles =
      order === "ABBA"
        ? (["baseline", "candidate", "candidate", "baseline"] as const)
        : (["candidate", "baseline", "baseline", "candidate"] as const);
    for (let position = 0; position < 4; position += 1) {
      const ordinal = block * 4 + position;
      const row = evidence.samples[ordinal];
      assertExactCurrentObjectKeys(
        row,
        ["ordinal", "order", "position", "jobs", "role", "trace"],
        `current_performance_sample_${ordinal}`,
      );
      const role = roles[position]!;
      if (
        row.ordinal !== ordinal ||
        row.order !== order ||
        row.position !== position ||
        row.jobs !== jobs ||
        row.role !== role
      ) {
        throw new Error(`current_performance_sample_${ordinal}_identity_drift`);
      }
      const tracePin = performancePin(
        row.trace,
        `current_performance_sample_${ordinal}_trace`,
      );
      const roleIdentity = benchmarkIdentity(role);
      const roleArtifacts = benchmarkArtifacts(role);
      traces.push(
        validateTrace(
          read(tracePin, `current_performance_sample_${ordinal}_trace`, reader),
          {
            ordinal,
            order,
            position,
            jobs,
            role,
            identity: roleIdentity,
            ...roleArtifacts,
            commandRaw32: commands.get(`${role}:${jobs}`)!,
            environmentRaw32: environments.get(jobs)!.raw32,
          },
        ),
      );
    }
  }
  let wallRatio = 0;
  let peakRatio = 0;
  let maxSpread = 0;
  for (const jobs of [1, jobsN]) {
    const candidate = traces.filter(
      (trace) => trace.jobs === jobs && trace.role === "candidate",
    );
    const baselineRows = traces.filter(
      (trace) => trace.jobs === jobs && trace.role === "baseline",
    );
    const sum = (rows: PerfTrace[], key: "wallNs" | "peakBytes") =>
      rows.reduce((total, row) => total + row[key], 0n);
    wallRatio = Math.max(
      wallRatio,
      ppm(sum(candidate, "wallNs"), sum(baselineRows, "wallNs")),
    );
    peakRatio = Math.max(
      peakRatio,
      ppm(sum(candidate, "peakBytes"), sum(baselineRows, "peakBytes")),
    );
    for (const rows of [candidate, baselineRows]) {
      for (const key of ["wallNs", "peakBytes"] as const) {
        const values = rows.map((row) => row[key]);
        maxSpread = Math.max(
          maxSpread,
          ppm(
            values.reduce((maximum, value) =>
              value > maximum ? value : maximum,
            ),
            values.reduce((minimum, value) =>
              value < minimum ? value : minimum,
            ),
          ) - 1_000_000,
        );
      }
    }
  }
  if (
    wallRatio > 1_050_000 ||
    peakRatio > 1_050_000 ||
    maxSpread > 100_000 ||
    candidateBackend.action.spillDensityPpm > 250_000 ||
    candidateBackend.action.spillDensityPpm >= baselineAction.spillDensityPpm
  ) {
    throw new Error("current_performance_raw_contract_failed");
  }
  return Object.freeze({
    raw32: currentReleaseDomainCid(
      "cheng.compiler.current_performance_raw_evidence",
      [
        identity.sourceBundleRaw32,
        identity.officialDriverRaw32,
        identity.executionRaw32,
        baseline.sourceBundleRaw32,
        baseline.driverRaw32,
        baseline.executionRaw32,
        candidateBackend.action.raw32,
        candidateBackend.fragment.raw32,
        candidateBackend.objectRaw32,
        baselineAction.raw32,
        baselineFragment.raw32,
        sha256(baselineObjectRaw),
        ...commands.values(),
        ...[...environments.values()].map((environment) => environment.raw32),
        ...traces.map((trace) => trace.raw32),
        String(wallRatio),
        String(peakRatio),
        String(maxSpread),
        String(candidateBackend.action.spillDensityPpm),
        String(baselineAction.spillDensityPpm),
        String(currentTextBytes),
        String(baselineTextBytes),
        String(clangTextBytes),
        String(textRatio),
      ],
    ),
    compileWallRatioPpm: wallRatio,
    peakMemoryRatioPpm: peakRatio,
    maxGroupSpreadPpm: maxSpread,
    spillDensityPpm: candidateBackend.action.spillDensityPpm,
    baselineSpillDensityPpm: baselineAction.spillDensityPpm,
    textBytes: currentTextBytes,
    baselineTextBytes,
    clangTextBytes,
    textToClangRatioPpm: textRatio,
  });
}
