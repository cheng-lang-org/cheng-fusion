#!/usr/bin/env bun
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  CHENG_CURRENT_ORC_EVENT_SCHEMA,
  CHENG_CURRENT_PERFORMANCE_COMMAND_SCHEMA,
  CHENG_CURRENT_PERFORMANCE_ENVIRONMENT_SCHEMA,
  CHENG_CURRENT_PERFORMANCE_EVIDENCE_SCHEMA,
  CHENG_CURRENT_PERFORMANCE_TRACE_SCHEMA,
  CHENG_CURRENT_TARGET_ACTION_SCHEMA,
  CHENG_CURRENT_TARGET_FRAGMENT_SCHEMA,
  validateCurrentPerformanceEvidence,
  validateCurrentTargetMatrix,
  type CurrentRawPin,
  type CurrentTargetRawEvidence,
} from "../src/cheng_current_release_target_performance_validator.ts";
import { canonicalJson } from "../src/cheng_semantic_matrix_m9023.ts";

type Json = Record<string, any>;

function sha(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function json(value: unknown): Buffer {
  return Buffer.from(`${canonicalJson(value)}\n`, "utf8");
}

function name(raw: Buffer, offset: number, value: string): void {
  raw.write(value, offset, "ascii");
}

interface BuiltObject {
  readonly raw: Buffer;
  readonly sections: readonly Json[];
}

function machObject(kind: "object" | "executable", textSize = 32): BuiltObject {
  const text = Buffer.alloc(textSize, 0x90);
  const debug = [
    ["__debug_line", Buffer.from("line-table\n")],
    ["__debug_info", Buffer.from("debug-info\n")],
    ["__debug_abbrev", Buffer.from("debug-abbrev\n")],
  ] as const;
  const textCommandSize = 72 + 80;
  const debugCommandSize = 72 + debug.length * 80;
  const commandBytes = textCommandSize + debugCommandSize;
  const payloadStart = 32 + commandBytes;
  const payloadLength =
    text.length + debug.reduce((total, row) => total + row[1].length, 0);
  const raw = Buffer.alloc(payloadStart + payloadLength);
  raw.writeUInt32LE(0xfeedfacf, 0);
  raw.writeUInt32LE(0x0100000c, 4);
  raw.writeUInt32LE(kind === "object" ? 1 : 2, 12);
  raw.writeUInt32LE(2, 16);
  raw.writeUInt32LE(commandBytes, 20);
  let command = 32;
  raw.writeUInt32LE(0x19, command);
  raw.writeUInt32LE(textCommandSize, command + 4);
  name(raw, command + 8, "__TEXT");
  raw.writeBigUInt64LE(BigInt(payloadStart), command + 40);
  raw.writeBigUInt64LE(BigInt(text.length), command + 48);
  raw.writeUInt32LE(1, command + 64);
  let section = command + 72;
  name(raw, section, "__text");
  name(raw, section + 16, "__TEXT");
  raw.writeBigUInt64LE(BigInt(text.length), section + 40);
  raw.writeUInt32LE(payloadStart, section + 48);
  text.copy(raw, payloadStart);
  const sections: Json[] = [
    {
      ordinal: 0,
      name: "__TEXT,__text",
      kind: "semantic",
      fileOffset: payloadStart,
      byteLength: text.length,
      bytesRaw32: sha(text),
    },
  ];
  command += textCommandSize;
  raw.writeUInt32LE(0x19, command);
  raw.writeUInt32LE(debugCommandSize, command + 4);
  name(raw, command + 8, "__DWARF");
  raw.writeUInt32LE(debug.length, command + 64);
  let payload = payloadStart + text.length;
  for (let index = 0; index < debug.length; index += 1) {
    section = command + 72 + index * 80;
    name(raw, section, debug[index]![0]);
    name(raw, section + 16, "__DWARF");
    raw.writeBigUInt64LE(BigInt(debug[index]![1].length), section + 40);
    raw.writeUInt32LE(payload, section + 48);
    debug[index]![1].copy(raw, payload);
    sections.push({
      ordinal: sections.length,
      name: `__DWARF,${debug[index]![0]}`,
      kind: "debug",
      fileOffset: payload,
      byteLength: debug[index]![1].length,
      bytesRaw32: sha(debug[index]![1]),
    });
    payload += debug[index]![1].length;
  }
  return { raw, sections };
}

function elfObject(
  architecture: "aarch64" | "x86_64",
  kind: "object" | "executable",
): BuiltObject {
  const names = Buffer.from(
    "\0.shstrtab\0.text\0.debug_line\0.debug_info\0.debug_abbrev\0",
  );
  const payloads = [
    names,
    Buffer.from("machine-code\n"),
    Buffer.from("line-table\n"),
    Buffer.from("debug-info\n"),
    Buffer.from("debug-abbrev\n"),
  ];
  const sectionNames = [
    ".shstrtab",
    ".text",
    ".debug_line",
    ".debug_info",
    ".debug_abbrev",
  ];
  const offsets: number[] = [];
  let cursor = 64;
  for (const payload of payloads) {
    offsets.push(cursor);
    cursor += payload.length;
  }
  const sectionTable = (cursor + 7) & ~7;
  const raw = Buffer.alloc(sectionTable + 6 * 64);
  raw.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1], 0);
  raw.writeUInt16LE(kind === "object" ? 1 : 2, 16);
  raw.writeUInt16LE(architecture === "aarch64" ? 183 : 62, 18);
  raw.writeUInt32LE(1, 20);
  raw.writeBigUInt64LE(BigInt(sectionTable), 40);
  raw.writeUInt16LE(64, 52);
  raw.writeUInt16LE(64, 58);
  raw.writeUInt16LE(6, 60);
  raw.writeUInt16LE(1, 62);
  payloads.forEach((payload, index) => payload.copy(raw, offsets[index]!));
  const sections: Json[] = [];
  for (let index = 0; index < payloads.length; index += 1) {
    const base = sectionTable + (index + 1) * 64;
    raw.writeUInt32LE(names.indexOf(`${sectionNames[index]}\0`), base);
    raw.writeUInt32LE(index === 0 ? 3 : 1, base + 4);
    if (index === 1) raw.writeBigUInt64LE(6n, base + 8);
    raw.writeBigUInt64LE(BigInt(offsets[index]!), base + 24);
    raw.writeBigUInt64LE(BigInt(payloads[index]!.length), base + 32);
    sections.push({
      ordinal: sections.length,
      name: sectionNames[index],
      kind: index === 0 ? "metadata" : index === 1 ? "semantic" : "debug",
      fileOffset: offsets[index],
      byteLength: payloads[index]!.length,
      bytesRaw32: sha(payloads[index]!),
    });
  }
  return { raw, sections };
}

const artifacts = new Map<string, Buffer>();
let artifactOrdinal = 0;
function pin(raw: Buffer, suffix: string): CurrentRawPin {
  const path = `/raw/${String(artifactOrdinal++).padStart(3, "0")}-${suffix}`;
  artifacts.set(path, raw);
  return { path, byteLength: raw.length, bytesRaw32: sha(raw) };
}

const reader = (evidence: CurrentRawPin): Buffer => {
  const raw = artifacts.get(evidence.path);
  if (raw === undefined) throw new Error(`missing:${evidence.path}`);
  return raw;
};

function stream(kind: "stdout" | "stderr", payload: Buffer): Buffer {
  const raw = Buffer.alloc(16 + payload.length);
  raw.write(kind === "stdout" ? "CROUTPUT" : "CRERROR!", 0, "ascii");
  raw.writeBigUInt64BE(BigInt(payload.length), 8);
  payload.copy(raw, 16);
  return raw;
}

function runStatus(): Buffer {
  const raw = Buffer.alloc(16);
  raw.write("CRSTATUS", 0, "ascii");
  return raw;
}

function actions(
  expected: {
    driverRole: "production" | "immutable_baseline";
    targetTriple: string;
    architecture: string;
    backend: string;
    sourceBundleRaw32: string;
    driverRaw32: string;
    executionRaw32: string;
  },
  baseline = false,
): Buffer {
  const kinds = baseline
    ? ["assign", "spill", "reload", "fixed", "copy", "assign", "fixed", "copy"]
    : ["assign", "spill", "fixed", "copy", "assign", "fixed", "copy", "assign"];
  return json({
    schema: CHENG_CURRENT_TARGET_ACTION_SCHEMA,
    status: "COMPLETE",
    ...expected,
    bodyIrRaw32: sha(`body:${expected.targetTriple}`),
    actions: kinds.map((kind, ordinal) => ({
      ordinal,
      opId: ordinal,
      kind,
      registerClass: "gpr",
      virtualRegister: ordinal,
      location: ordinal,
    })),
  });
}

function fragment(
  expected: {
    driverRole: "production" | "immutable_baseline";
    targetTriple: string;
    architecture: string;
    backend: string;
    sourceBundleRaw32: string;
    driverRaw32: string;
    executionRaw32: string;
  },
  actionRaw: Buffer,
  object: BuiltObject,
): Buffer {
  const actionValue = JSON.parse(actionRaw.toString("utf8"));
  return json({
    schema: CHENG_CURRENT_TARGET_FRAGMENT_SCHEMA,
    status: "COMPLETE",
    ...expected,
    bodyIrRaw32: actionValue.bodyIrRaw32,
    actionRaw32: sha(actionRaw),
    objectRaw32: sha(object.raw),
    sections: object.sections,
  });
}

function orc(
  expected: {
    driverRole: "production";
    targetTriple: string;
    architecture: string;
    backend: string;
    sourceBundleRaw32: string;
    driverRaw32: string;
    executionRaw32: string;
  },
  actionRaw: Buffer,
  fragmentRaw: Buffer,
  objectRaw: Buffer,
  executableRaw: Buffer,
): Buffer {
  const events: Json[] = [];
  const resultRaw32 = sha("program-result");
  for (let iteration = 0; iteration < 5000; iteration += 1) {
    events.push({
      sequence: events.length,
      iteration,
      kind: "alloc",
      valueId: 1,
      bytes: 64,
    });
    events.push({
      sequence: events.length,
      iteration,
      kind: "result",
      resultRaw32,
    });
    events.push({
      sequence: events.length,
      iteration,
      kind: "destructor",
      valueId: 1,
      ordinal: 0,
    });
    events.push({
      sequence: events.length,
      iteration,
      kind: "free",
      valueId: 1,
      bytes: 64,
    });
    events.push({
      sequence: events.length,
      iteration,
      kind: "iteration_end",
    });
  }
  return json({
    schema: CHENG_CURRENT_ORC_EVENT_SCHEMA,
    status: "COMPLETE",
    ...expected,
    actionRaw32: sha(actionRaw),
    fragmentRaw32: sha(fragmentRaw),
    objectRaw32: sha(objectRaw),
    executableRaw32: sha(executableRaw),
    events,
  });
}

const currentTextRaw = machObject("executable", 900).raw;
const identity = {
  sourceBundleRaw32: sha("current-source"),
  officialDriverRaw32: sha(currentTextRaw),
  executionRaw32: sha("current-execution"),
};
const targetSpecs = [
  ["aarch64-apple-darwin", "arm64"],
  ["aarch64-unknown-linux-gnu", "aarch64"],
  ["x86_64-unknown-linux-gnu", "x86_64"],
] as const;
const targets: CurrentTargetRawEvidence[] = [];
for (const [targetTriple, architecture] of targetSpecs) {
  const driverRaw32 =
    targetTriple === "aarch64-apple-darwin"
      ? identity.officialDriverRaw32
      : sha(`driver:${targetTriple}`);
  const object =
    targetTriple === "aarch64-apple-darwin"
      ? machObject("object")
      : elfObject(architecture as "aarch64" | "x86_64", "object");
  const executable =
    targetTriple === "aarch64-apple-darwin"
      ? machObject("executable")
      : elfObject(architecture as "aarch64" | "x86_64", "executable");
  const backends = ["primary", "backend2"].map((backend) => {
    const expected = {
      driverRole: "production" as const,
      targetTriple,
      architecture,
      backend,
      sourceBundleRaw32: identity.sourceBundleRaw32,
      driverRaw32,
      executionRaw32: identity.executionRaw32,
    };
    const actionRaw = actions(expected);
    const fragmentRaw = fragment(expected, actionRaw, object);
    return {
      backend: backend as "primary" | "backend2",
      object: pin(object.raw, `${targetTriple}-${backend}.o`),
      executable: pin(executable.raw, `${targetTriple}-${backend}.exe`),
      action: pin(actionRaw, `${targetTriple}-${backend}.action.json`),
      fragment: pin(fragmentRaw, `${targetTriple}-${backend}.fragment.json`),
      runStatus: pin(runStatus(), `${targetTriple}-${backend}.status.bin`),
      runStdout: pin(
        stream("stdout", Buffer.from("program=pass\n")),
        `${targetTriple}-${backend}.stdout.bin`,
      ),
      runStderr: pin(
        stream("stderr", Buffer.alloc(0)),
        `${targetTriple}-${backend}.stderr.bin`,
      ),
      orcEvents: pin(
        orc(expected, actionRaw, fragmentRaw, object.raw, executable.raw),
        `${targetTriple}-${backend}.orc.json`,
      ),
    };
  });
  targets.push({ targetTriple, architecture, driverRaw32, backends });
}

const matrix = validateCurrentTargetMatrix(targets, identity, reader);
assert.equal(matrix.backends.length, 6);
assert.match(matrix.raw32, /^[0-9a-f]{64}$/);

function rejectTarget(
  name: string,
  mutation: (value: any) => void,
  pattern: RegExp,
): void {
  const mutated = clone(targets);
  mutation(mutated);
  assert.throws(
    () => validateCurrentTargetMatrix(mutated, identity, reader),
    pattern,
    name,
  );
}

rejectTarget(
  "missing-field",
  (value) => delete value[0].backends[0].runStatus,
  /keys_invalid/,
);
rejectTarget(
  "backend-swap",
  (value) => {
    [value[0].backends[0].action, value[0].backends[1].action] = [
      value[0].backends[1].action,
      value[0].backends[0].action,
    ];
  },
  /backend_identity_drift/,
);
rejectTarget(
  "object-architecture-swap",
  (value) => {
    value[0].backends[0].object = value[1].backends[0].object;
  },
  /macho_header_invalid/,
);
rejectTarget(
  "target-identity",
  (value) => {
    value[2].targetTriple = "aarch64-unknown-linux-gnu";
  },
  /identity_invalid/,
);

function replaceRaw(
  pinValue: Json,
  raw: Buffer,
  store: Map<string, Buffer>,
): void {
  store.set(pinValue.path, raw);
  pinValue.byteLength = raw.length;
  pinValue.bytesRaw32 = sha(raw);
}

function rejectTargetRaw(
  name: string,
  mutation: (value: any, store: Map<string, Buffer>) => void,
  pattern: RegExp,
): void {
  const mutated = clone(targets);
  const store = new Map(artifacts);
  mutation(mutated, store);
  assert.throws(
    () =>
      validateCurrentTargetMatrix(mutated, identity, (pinValue) =>
        store.get(pinValue.path)!,
      ),
    pattern,
    name,
  );
}

rejectTargetRaw(
  "raw-object-byte",
  (value, store) => {
    const objectPin = value[0].backends[0].object;
    const raw = Buffer.from(store.get(objectPin.path)!);
    raw[raw.length - 1] ^= 1;
    replaceRaw(objectPin, raw, store);
  },
  /fragment_projection_drift/,
);
rejectTargetRaw(
  "raw-run-output",
  (value, store) => {
    const stdoutPin = value[0].backends[0].runStdout;
    replaceRaw(
      stdoutPin,
      stream("stdout", Buffer.from("program=mutated\n")),
      store,
    );
  },
  /runResultRaw32_backend_drift/,
);
rejectTargetRaw(
  "raw-orc-unmatched-free",
  (value, store) => {
    const orcPin = value[0].backends[0].orcEvents;
    const orcValue = JSON.parse(store.get(orcPin.path)!.toString("utf8"));
    orcValue.events[3].bytes = 65;
    replaceRaw(orcPin, json(orcValue), store);
  },
  /unmatched_free/,
);
rejectTargetRaw(
  "raw-body-ir-backend-drift",
  (value, store) => {
    const backend = value[0].backends[1];
    const action = JSON.parse(store.get(backend.action.path)!.toString("utf8"));
    action.bodyIrRaw32 = sha("other-body-ir");
    const actionRaw = json(action);
    replaceRaw(backend.action, actionRaw, store);
    const fragment = JSON.parse(
      store.get(backend.fragment.path)!.toString("utf8"),
    );
    fragment.bodyIrRaw32 = action.bodyIrRaw32;
    fragment.actionRaw32 = sha(actionRaw);
    const fragmentRaw = json(fragment);
    replaceRaw(backend.fragment, fragmentRaw, store);
    const orcValue = JSON.parse(
      store.get(backend.orcEvents.path)!.toString("utf8"),
    );
    orcValue.actionRaw32 = sha(actionRaw);
    orcValue.fragmentRaw32 = sha(fragmentRaw);
    replaceRaw(backend.orcEvents, json(orcValue), store);
  },
  /body_ir_backend_drift/,
);
rejectTargetRaw(
  "raw-orc-extra-iteration",
  (value, store) => {
    const orcPin = value[0].backends[0].orcEvents;
    const orcValue = JSON.parse(store.get(orcPin.path)!.toString("utf8"));
    const iteration = 5000;
    for (const event of [
      { kind: "alloc", valueId: 1, bytes: 64 },
      { kind: "result", resultRaw32: sha("program-result") },
      { kind: "destructor", valueId: 1, ordinal: 0 },
      { kind: "free", valueId: 1, bytes: 64 },
      { kind: "iteration_end" },
    ]) {
      orcValue.events.push({
        sequence: orcValue.events.length,
        iteration,
        ...event,
      });
    }
    replaceRaw(orcPin, json(orcValue), store);
  },
  /balance_or_fixed_point_invalid/,
);

const candidate = targets[0]!.backends[0]!;
const baselineTextRaw = machObject("executable", 1000).raw;
const baselineIdentity = {
  sourceBundleRaw32: sha("baseline-source"),
  driverRaw32: sha(baselineTextRaw),
  executionRaw32: sha("baseline-execution"),
};
const baselineObject = machObject("object");
const baselineExpected = {
  driverRole: "immutable_baseline" as const,
  targetTriple: "aarch64-apple-darwin",
  architecture: "arm64",
  backend: "primary",
  ...baselineIdentity,
};
const baselineActionRaw = actions(baselineExpected, true);
const baselineFragmentRaw = fragment(
  baselineExpected,
  baselineActionRaw,
  baselineObject,
);
const baselineAction = pin(baselineActionRaw, "baseline.action.json");
const baselineFragment = pin(baselineFragmentRaw, "baseline.fragment.json");
const baselineObjectPin = pin(baselineObject.raw, "baseline.o");
const currentTextBinary = pin(currentTextRaw, "current-text");
const baselineTextBinary = pin(baselineTextRaw, "baseline-text");
const clangTextBinary = pin(machObject("executable", 500).raw, "clang-text");
const jobsN = 8;
const candidateActionRaw = artifacts.get(candidate.action.path)!;
const candidateFragmentRaw = artifacts.get(candidate.fragment.path)!;
const performanceIdentity = (role: "candidate" | "baseline") =>
  role === "candidate"
    ? {
        sourceBundleRaw32: identity.sourceBundleRaw32,
        driverRaw32: identity.officialDriverRaw32,
        executionRaw32: identity.executionRaw32,
      }
    : baselineIdentity;
const performanceArtifacts = (role: "candidate" | "baseline") =>
  role === "candidate"
    ? {
        actionRaw32: sha(candidateActionRaw),
        fragmentRaw32: sha(candidateFragmentRaw),
        objectRaw32: candidate.object.bytesRaw32,
      }
    : {
        actionRaw32: baselineAction.bytesRaw32,
        fragmentRaw32: baselineFragment.bytesRaw32,
        objectRaw32: baselineObjectPin.bytesRaw32,
      };
const commandRows = [
  ["candidate", 1],
  ["baseline", 1],
  ["candidate", jobsN],
  ["baseline", jobsN],
].map(([roleValue, jobs]) => {
  const role = roleValue as "candidate" | "baseline";
  return {
    role,
    jobs,
    artifact: pin(
      json({
        schema: CHENG_CURRENT_PERFORMANCE_COMMAND_SCHEMA,
        status: "COMPLETE",
        role,
        jobs,
        ...performanceIdentity(role),
        ...performanceArtifacts(role),
        argv: [`/driver/${role}`, "compile", `--jobs=${jobs}`],
      }),
      "command",
    ),
  };
});
const hostRaw32 = sha("performance-host");
const toolchainRaw32 = sha("performance-toolchain");
const environmentRows = [1, jobsN].map((jobs) => ({
  jobs,
  artifact: pin(
    json({
      schema: CHENG_CURRENT_PERFORMANCE_ENVIRONMENT_SCHEMA,
      status: "COMPLETE",
      jobs,
      samplingScope: "process_tree_recursive",
      sampleClock: "monotonic_ns",
      hostRaw32,
      toolchainRaw32,
    }),
    "environment",
  ),
}));
const commandRaw32 = new Map(
  commandRows.map((row) => [
    `${row.role}:${row.jobs}`,
    row.artifact.bytesRaw32,
  ]),
);
const environmentRaw32 = new Map(
  environmentRows.map((row) => [row.jobs, row.artifact.bytesRaw32]),
);
const blocks = [
  ["ABBA", 1],
  ["BAAB", 1],
  ["ABBA", jobsN],
] as const;
const samples: Json[] = [];
for (let block = 0; block < blocks.length; block += 1) {
  const [order, jobs] = blocks[block]!;
  const roles =
    order === "ABBA"
      ? ["baseline", "candidate", "candidate", "baseline"]
      : ["candidate", "baseline", "baseline", "candidate"];
  for (let position = 0; position < 4; position += 1) {
    const ordinal = block * 4 + position;
    const role = roles[position]!;
    const roleIdentity =
      role === "candidate"
        ? {
            sourceBundleRaw32: identity.sourceBundleRaw32,
            driverRaw32: identity.officialDriverRaw32,
            executionRaw32: identity.executionRaw32,
          }
        : baselineIdentity;
    const roleArtifacts =
      role === "candidate"
        ? {
            actionRaw32: sha(candidateActionRaw),
            fragmentRaw32: sha(candidateFragmentRaw),
            objectRaw32: candidate.object.bytesRaw32,
          }
        : {
            actionRaw32: baselineAction.bytesRaw32,
            fragmentRaw32: baselineFragment.bytesRaw32,
            objectRaw32: baselineObjectPin.bytesRaw32,
          };
    const start = BigInt(ordinal * 1000 + 100);
    const end = start + 100n;
    const trace = json({
      schema: CHENG_CURRENT_PERFORMANCE_TRACE_SCHEMA,
      status: "COMPLETE",
      ordinal,
      order,
      position,
      jobs,
      role,
      ...roleIdentity,
      ...roleArtifacts,
      commandRaw32: commandRaw32.get(`${role}:${jobs}`),
      environmentRaw32: environmentRaw32.get(jobs),
      startMonotonicNs: start.toString(),
      endMonotonicNs: end.toString(),
      samples: [
        {
          ordinal: 0,
          monotonicNs: start.toString(),
          processTreeBytes: 700_000_000,
        },
        {
          ordinal: 1,
          monotonicNs: end.toString(),
          processTreeBytes: 700_000_000,
        },
      ],
    });
    samples.push({
      ordinal,
      order,
      position,
      jobs,
      role,
      trace: pin(trace, `sample-${ordinal}.json`),
    });
  }
}
const performance = {
  schema: CHENG_CURRENT_PERFORMANCE_EVIDENCE_SCHEMA,
  status: "COMPLETE",
  sourceBundleRaw32: identity.sourceBundleRaw32,
  officialDriverRaw32: identity.officialDriverRaw32,
  executionRaw32: identity.executionRaw32,
  jobsN,
  baselineIdentity,
  candidateAction: candidate.action,
  candidateFragment: candidate.fragment,
  candidateObject: candidate.object,
  baselineAction,
  baselineFragment,
  baselineObject: baselineObjectPin,
  currentTextBinary,
  baselineTextBinary,
  clangTextBinary,
  commands: commandRows,
  environments: environmentRows,
  samples,
};
const performanceResult = validateCurrentPerformanceEvidence(
  performance,
  identity,
  matrix,
  {
    candidateAction: candidate.action,
    candidateFragment: candidate.fragment,
    candidateObject: candidate.object,
    currentTextBinary,
    baselineTextBinary,
  },
  reader,
);
assert.equal(performanceResult.compileWallRatioPpm, 1_000_000);
assert.equal(performanceResult.peakMemoryRatioPpm, 1_000_000);
assert.equal(performanceResult.maxGroupSpreadPpm, 0);
assert.equal(performanceResult.spillDensityPpm, 125_000);
assert.equal(performanceResult.baselineSpillDensityPpm, 250_000);
assert.equal(performanceResult.textToClangRatioPpm, 1_800_000);

function rejectPerformance(
  name: string,
  mutation: (value: Json) => void,
  pattern: RegExp,
): void {
  const mutated = clone(performance);
  mutation(mutated);
  assert.throws(
    () =>
      validateCurrentPerformanceEvidence(
        mutated,
        identity,
        matrix,
        {
          candidateAction: candidate.action,
          candidateFragment: candidate.fragment,
          candidateObject: candidate.object,
          currentTextBinary,
          baselineTextBinary,
        },
        reader,
      ),
    pattern,
    name,
  );
}

rejectPerformance(
  "sample-delete",
  (value) => value.samples.splice(5, 1),
  /sample_set_invalid/,
);
rejectPerformance(
  "sample-order",
  (value) => (value.samples[0].order = "BAAB"),
  /sample_0_identity_drift/,
);
rejectPerformance(
  "jobs-drift",
  (value) => (value.samples[8].jobs = 1),
  /sample_8_identity_drift/,
);
rejectPerformance(
  "candidate-object",
  (value) => (value.candidateObject = { ...value.baselineObject }),
  /candidateObject_pin_drift/,
);
rejectPerformance(
  "identity",
  (value) => (value.executionRaw32 = sha("other-execution")),
  /evidence_identity_invalid/,
);
rejectPerformance(
  "baseline-driver-binary-identity",
  (value) => (value.baselineIdentity.driverRaw32 = sha("other-driver")),
  /driver_binary_identity_drift/,
);
rejectPerformance(
  "artifact-path-alias",
  (value) => (value.samples[1].trace = { ...value.samples[0].trace }),
  /artifact_path_alias/,
);
rejectPerformance(
  "command-role-swap",
  (value) => {
    [value.commands[0].artifact, value.commands[1].artifact] = [
      value.commands[1].artifact,
      value.commands[0].artifact,
    ];
  },
  /command_role_drift/,
);
rejectPerformance(
  "environment-jobs-swap",
  (value) => {
    [value.environments[0].artifact, value.environments[1].artifact] = [
      value.environments[1].artifact,
      value.environments[0].artifact,
    ];
  },
  /environment_identity_drift/,
);

function rejectPerformanceRaw(
  name: string,
  mutation: (value: Json, store: Map<string, Buffer>) => void,
  pattern: RegExp,
): void {
  const mutated = clone(performance);
  const store = new Map(artifacts);
  mutation(mutated, store);
  assert.throws(
    () =>
      validateCurrentPerformanceEvidence(
        mutated,
        identity,
        matrix,
        {
          candidateAction: candidate.action,
          candidateFragment: candidate.fragment,
          candidateObject: candidate.object,
          currentTextBinary,
          baselineTextBinary,
        },
        (pinValue) => store.get(pinValue.path)!,
      ),
    pattern,
    name,
  );
}

rejectPerformanceRaw(
  "raw-peak-over-limit",
  (value, store) => {
    const tracePin = value.samples[0].trace;
    const trace = JSON.parse(store.get(tracePin.path)!.toString("utf8"));
    trace.samples[0].processTreeBytes = 1073741824;
    replaceRaw(tracePin, json(trace), store);
  },
  /trace_sample_0_invalid/,
);
rejectPerformanceRaw(
  "raw-wall-regression",
  (value, store) => {
    for (const sample of value.samples.filter(
      (row: Json) => row.role === "candidate",
    )) {
      const trace = JSON.parse(store.get(sample.trace.path)!.toString("utf8"));
      const end = BigInt(trace.startMonotonicNs) + 106n;
      trace.endMonotonicNs = end.toString();
      trace.samples.at(-1).monotonicNs = end.toString();
      replaceRaw(sample.trace, json(trace), store);
    }
  },
  /raw_contract_failed/,
);

console.log(
  "item35 current target/performance raw validator: PASS " +
    "3 targets x 2 backends and exact 12-sample jobs1/N ABBA/BAAB mutations hard-red",
);
