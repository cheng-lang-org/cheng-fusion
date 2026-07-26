import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {
  CHENG_EXECUTION_STAGE_BUNDLE_SCHEMA,
  CHENG_EXECUTION_STAGE_POLICY_SCHEMA,
  CHENG_EXECUTION_STAGE_RUNNER_KIND,
  CHENG_EXECUTION_STAGE_OFFICIAL_RUNNER_STATUS,
  validateCompilerExecutionStageReceipt,
  type CompilerExecutionStageReceiptPolicy,
} from "../src/cheng_execution_stage_receipt_validator.ts";

const IDENTITY_DOMAIN = "cheng.compiler.execution_identity";
const STAGE_DOMAIN = "cheng.compiler.execution_stage_receipt";
const ROOT_DOMAIN = "cheng.compiler.seven_stage_execution_root";

const GOLDEN = Object.freeze({
  executionRaw32: "d19f410fe0f3de1c6fb6d3129b94c77737b148f3c0e7adb53b011e3fa11deda1",
  stageReceiptRaw32s: Object.freeze([
    "cc572b2bd1eb27456a19b650bad11543535743adb73febdc534d3b58c7a943e0",
    "b43f64fc35ba47cf26ede919f4970c74a5667798b651a9739b306d584def4b4a",
    "7ba37a57120f8c622fdaa72b16816132f5c480cf1681739a262b6445fef5e284",
    "aea96b549de65e3de11c1b53c906dee2f2c8c804f5430cefd24daff43a04bcd4",
    "ab2c728f86abc28f3736c55f09d6492ef14f1381dfccba321bb837f32191ae90",
    "56cfba46aa4805e71983cefcf7ccb8d96b939237adab79be6345f038ea24349c",
    "ac51ff7348ad523ed7590724cac3b7dc1ae4970b37e49613f80d80a8d23977f9",
  ]),
  sevenStageRootRaw32: "49010897bd87514a8ea188e45d5fe2b3d6b5e84177f1b905e72f6f3f03565b42",
  receiptSha256: "d7835d06a452e5f5bde88414a53b82e42aa5ef4756e95d1d51ba895d292ea649",
  receiptFileBytesRaw32: "2a39b4ed5679166551ac0225c35407c675579d1f7e6a7d1b570b9c26c3ce4713",
});

const PLAN = [
  {ordinal: 1, kind: "typed_expr", lane: "shared", predecessor: "parser", predecessorIndex: -1, sidecarSchema: "cheng.compiler.stage_semantic_sidecar.typed_expr", artifactKind: "typed_expr_fact_table"},
  {ordinal: 2, kind: "csg", lane: "shared", predecessor: "typed_expr", predecessorIndex: 0, sidecarSchema: "cheng.compiler.stage_semantic_sidecar.csg", artifactKind: "compiler_csg_facts"},
  {ordinal: 3, kind: "lowering", lane: "shared", predecessor: "csg", predecessorIndex: 1, sidecarSchema: "cheng.compiler.stage_semantic_sidecar.lowering", artifactKind: "lowering_body_ir"},
  {ordinal: 4, kind: "primary", lane: "primary", predecessor: "lowering", predecessorIndex: 2, sidecarSchema: "cheng.compiler.stage_semantic_sidecar.primary", artifactKind: "primary_emission_ledger"},
  {ordinal: 5, kind: "primary_regalloc", lane: "primary", predecessor: "primary", predecessorIndex: 3, sidecarSchema: "cheng.compiler.stage_semantic_sidecar.primary_regalloc", artifactKind: "primary_regalloc_plan_action_fragment_symbol_bytes"},
  {ordinal: 6, kind: "backend2", lane: "backend2", predecessor: "lowering", predecessorIndex: 2, sidecarSchema: "cheng.compiler.stage_semantic_sidecar.backend2", artifactKind: "backend2_emission_ledger"},
  {ordinal: 7, kind: "backend2_regalloc", lane: "backend2", predecessor: "backend2", predecessorIndex: 5, sidecarSchema: "cheng.compiler.stage_semantic_sidecar.backend2_regalloc", artifactKind: "backend2_regalloc_plan_action_fragment_symbol_bytes"},
] as const;

type MutableJson = Record<string, any>;

interface Fixture {
  readonly root: string;
  readonly bundle: MutableJson;
  readonly policy: MutableJson;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: any): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function u32(value: number): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(value >>> 0);
  return out;
}

function text(value: string): Buffer[] {
  const raw = Buffer.from(value, "utf8");
  return [u32(raw.length), raw];
}

function i32(value: number): Buffer[] {
  return [u32(4), u32(value)];
}

function i64(value: number): Buffer[] {
  const raw = Buffer.alloc(8);
  raw.writeBigUInt64BE(BigInt(value));
  return [u32(8), raw];
}

function raw32(value: string): Buffer[] {
  return [u32(32), Buffer.from(value, "hex")];
}

function digest(parts: readonly Buffer[]): string {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part);
  return hash.digest("hex");
}

function executionRaw32(identity: MutableJson): string {
  return digest([
    ...text(IDENTITY_DOMAIN), ...text(identity.caseId),
    ...raw32(identity.sourceBundleRaw32), ...raw32(identity.materializerBytesRaw32),
    ...raw32(identity.grammarObligationRootRaw32), ...raw32(identity.compilerSourceClosureRaw32),
    ...raw32(identity.driverBytesRaw32), ...raw32(identity.toolchainManifestRaw32),
    ...raw32(identity.commandManifestRaw32), ...text(identity.targetTriple),
  ]);
}

function stageRaw32(stage: MutableJson): string {
  return digest([
    ...text(STAGE_DOMAIN), ...i32(stage.stageOrdinal), ...text(stage.stageKind),
    ...text(stage.laneKind), ...raw32(stage.producerSourceRaw32),
    ...raw32(stage.executionRaw32), ...text(stage.predecessorStageKind), ...raw32(stage.predecessorReceiptRaw32),
    ...raw32(stage.inputSemanticRaw32), ...raw32(stage.outputSemanticRaw32), ...text(stage.sidecarSchema),
    ...text(stage.sidecarPath), ...i64(stage.sidecarByteLength), ...raw32(stage.sidecarBytesRaw32),
    ...text(stage.artifactKind), ...text(stage.artifactPath), ...i64(stage.artifactByteLength),
    ...raw32(stage.artifactBytesRaw32),
  ]);
}

function sevenStageRoot(bundle: MutableJson): string {
  const parts = [
    ...text(ROOT_DOMAIN), ...raw32(bundle.identity.executionRaw32),
    ...raw32(bundle.parserReceiptRaw32), ...raw32(bundle.parserSemanticRaw32), ...i32(bundle.stages.length),
  ];
  for (const stage of bundle.stages) parts.push(...raw32(stage.receiptRaw32), ...raw32(stage.outputSemanticRaw32));
  return digest(parts);
}

function put(root: string, relativePath: string, value: string | Buffer): {path: string; bytesRaw32: string} {
  const absolute = join(root, ...relativePath.split("/"));
  mkdirSync(dirname(absolute), {recursive: true});
  const raw = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  writeFileSync(absolute, raw);
  return {path: relativePath, bytesRaw32: sha256(raw)};
}

function makeFixture(name: string): Fixture {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), `fusion-receipt-${name}-`)));
  const sourceBundle = put(root, "identity/source-bundle.json", '{"rawSourceFiles":["case.cheng"]}\n');
  const materializerBytes = put(root, "identity/materializer.ts", "export const materializer = 'exact';\n");
  const grammarObligation = put(root, "identity/grammar-obligation-contract.json", '{"required":966,"schema":"cheng_grammar_obligation_contract"}\n');
  const compilerSourceClosure = put(root, "identity/compiler-source-closure.rec", "schema=compiler_source_closure\n");
  const driverBytes = put(root, "identity/cheng", "exact current-source driver bytes\n");
  const toolchainManifest = put(root, "identity/toolchain.manifest", "schema=private_toolchain\n");
  const commandManifest = put(root, "identity/command.manifest", "target=arm64-apple-darwin\nBACKEND_JOBS=1\n");
  const identity: MutableJson = {
    caseId: "bounded.case.validator.0001",
    sourceBundleRaw32: sourceBundle.bytesRaw32,
    materializerBytesRaw32: materializerBytes.bytesRaw32,
    grammarObligationRootRaw32: grammarObligation.bytesRaw32,
    compilerSourceClosureRaw32: compilerSourceClosure.bytesRaw32,
    driverBytesRaw32: driverBytes.bytesRaw32,
    toolchainManifestRaw32: toolchainManifest.bytesRaw32,
    commandManifestRaw32: commandManifest.bytesRaw32,
    targetTriple: "arm64-apple-darwin",
    executionRaw32: "",
  };
  identity.executionRaw32 = executionRaw32(identity);
  const parserReceiptRaw32 = sha256("parser-receipt:exact-trace");
  const parserSemanticRaw32 = sha256("parser-semantic:exact-trace");
  const stages: MutableJson[] = [];
  const policyStages: MutableJson[] = [];
  for (let index = 0; index < PLAN.length; index += 1) {
    const plan = PLAN[index];
    assert.ok(plan);
    const prefix = `stages/${String(plan.ordinal).padStart(2, "0")}-${plan.kind}`;
    const producerSource = put(root, `producers/${plan.kind}.cheng`, `module ${plan.kind}\nfn Produce${plan.ordinal}(): int32 =\n    return ${plan.ordinal}\n`);
    const sidecarRaw = Buffer.from(`${plan.kind}:canonical semantic sidecar bytes\n`, "utf8");
    const artifactRaw = Buffer.from(`${plan.kind}:canonical real artifact bytes\0${plan.ordinal}`, "utf8");
    const sidecar = put(root, `${prefix}/semantic.sidecar.bin`, sidecarRaw);
    const artifact = put(root, `${prefix}/artifact.bin`, artifactRaw);
    const predecessorReceiptRaw32 = plan.predecessorIndex < 0 ? parserReceiptRaw32 : stages[plan.predecessorIndex]?.receiptRaw32;
    const inputSemanticRaw32 = plan.predecessorIndex < 0 ? parserSemanticRaw32 : stages[plan.predecessorIndex]?.outputSemanticRaw32;
    assert.equal(typeof predecessorReceiptRaw32, "string");
    assert.equal(typeof inputSemanticRaw32, "string");
    const stage: MutableJson = {
      stageOrdinal: plan.ordinal,
      stageKind: plan.kind,
      laneKind: plan.lane,
      producerSourcePath: producerSource.path,
      producerSourceRaw32: producerSource.bytesRaw32,
      executionRaw32: identity.executionRaw32,
      predecessorStageKind: plan.predecessor,
      predecessorReceiptRaw32,
      inputSemanticRaw32,
      outputSemanticRaw32: sidecar.bytesRaw32,
      sidecarSchema: plan.sidecarSchema,
      sidecarPath: sidecar.path,
      sidecarByteLength: sidecarRaw.length,
      sidecarBytesRaw32: sidecar.bytesRaw32,
      artifactKind: plan.artifactKind,
      artifactPath: artifact.path,
      artifactByteLength: artifactRaw.length,
      artifactBytesRaw32: artifact.bytesRaw32,
      receiptRaw32: "",
    };
    stage.receiptRaw32 = stageRaw32(stage);
    stages.push(stage);
    policyStages.push({
      stageKind: plan.kind,
      producerSource,
      sidecarPath: sidecar.path,
      sidecarBytesRaw32: sidecar.bytesRaw32,
      artifactPath: artifact.path,
      artifactBytesRaw32: artifact.bytesRaw32,
    });
  }
  const bundle: MutableJson = {
    schema: CHENG_EXECUTION_STAGE_BUNDLE_SCHEMA,
    runnerKind: CHENG_EXECUTION_STAGE_RUNNER_KIND,
    identity,
    observedIdentityPaths: {
      sourceBundlePath: sourceBundle.path,
      materializerBytesPath: materializerBytes.path,
      grammarObligationPath: grammarObligation.path,
      compilerSourceClosurePath: compilerSourceClosure.path,
      driverBytesPath: driverBytes.path,
      toolchainManifestPath: toolchainManifest.path,
      commandManifestPath: commandManifest.path,
    },
    parserReceiptRaw32,
    parserSemanticRaw32,
    stages,
    sevenStageRootRaw32: "",
    receiptSha256: "",
  };
  bundle.sevenStageRootRaw32 = sevenStageRoot(bundle);
  const receiptPath = "execution-stage-receipt.json";
  const receipt = put(root, receiptPath, sealBundleBytes(bundle));
  const policy: MutableJson = {
    schema: CHENG_EXECUTION_STAGE_POLICY_SCHEMA,
    evidenceRoot: root,
    receipt,
    caseId: identity.caseId,
    targetTriple: identity.targetTriple,
    identityInputs: {
      sourceBundle,
      materializerBytes,
      grammarObligation,
      compilerSourceClosure,
      driverBytes,
      toolchainManifest,
      commandManifest,
    },
    parserReceiptRaw32,
    parserSemanticRaw32,
    stages: policyStages,
  };
  return {root, bundle, policy};
}

function sealBundleBytes(bundle: MutableJson): Buffer {
  const payload = {...bundle};
  delete payload.receiptSha256;
  bundle.receiptSha256 = sha256(canonical(payload));
  return Buffer.from(`${canonical(bundle)}\n`, "utf8");
}

function rewriteReceipt(fixture: Fixture, rootChanged = true): void {
  if (rootChanged) fixture.bundle.sevenStageRootRaw32 = sevenStageRoot(fixture.bundle);
  const raw = sealBundleBytes(fixture.bundle);
  const relativePath = fixture.policy.receipt.path;
  writeFileSync(join(fixture.root, ...relativePath.split("/")), raw);
  fixture.policy.receipt.bytesRaw32 = sha256(raw);
}

function mutateFile(fixture: Fixture, relativePath: string, suffix: string): void {
  const path = join(fixture.root, ...relativePath.split("/"));
  const raw = readFileSync(path);
  writeFileSync(path, Buffer.concat([raw, Buffer.from(suffix, "utf8")]));
}

function reject(name: string, mutation: (fixture: Fixture) => void, pattern: RegExp): void {
  const fixture = makeFixture(name);
  try {
    mutation(fixture);
    assert.throws(() => validateCompilerExecutionStageReceipt(fixture.policy), pattern, name);
  } finally {
    rmSync(fixture.root, {recursive: true, force: true});
  }
}

function main(): void {
  assert.deepEqual(CHENG_EXECUTION_STAGE_OFFICIAL_RUNNER_STATUS, {
    schema: "cheng_fusion.execution_stage_receipt_runner_status",
    implemented: true,
    status: "READY",
    code: "OFFICIAL_EXECUTION_STAGE_CURRENT_CONSUMER_READY",
  });

  const good = makeFixture("good");
  try {
    assert.equal(good.bundle.identity.executionRaw32, GOLDEN.executionRaw32);
    assert.deepEqual(good.bundle.stages.map((stage: MutableJson) => stage.receiptRaw32), GOLDEN.stageReceiptRaw32s);
    assert.equal(good.bundle.sevenStageRootRaw32, GOLDEN.sevenStageRootRaw32);
    assert.equal(good.bundle.receiptSha256, GOLDEN.receiptSha256);
    assert.equal(good.policy.receipt.bytesRaw32, GOLDEN.receiptFileBytesRaw32);
    const result = validateCompilerExecutionStageReceipt(good.policy as CompilerExecutionStageReceiptPolicy);
    assert.equal(result.status, "VERIFIED");
    assert.equal(result.officialRunnerStatus, "CURRENT_CONSUMER_REQUIRED");
    assert.equal(result.executionRaw32, good.bundle.identity.executionRaw32);
    assert.equal(result.sevenStageRootRaw32, good.bundle.sevenStageRootRaw32);
    assert.equal(result.stageReceiptRaw32s.length, 7);
    assert.equal(result.stageBindings.length, 7);
    assert.ok(result.stageBindings.every((stage) =>
      stage.sourceBundleRaw32 === good.bundle.identity.sourceBundleRaw32 &&
      stage.compilerSourceClosureRaw32 ===
        good.bundle.identity.compilerSourceClosureRaw32 &&
      stage.toolchainManifestRaw32 ===
        good.bundle.identity.toolchainManifestRaw32
    ));
  } finally {
    rmSync(good.root, {recursive: true, force: true});
  }

  reject("missing", (fixture) => {
    fixture.bundle.stages.splice(4, 1);
    rewriteReceipt(fixture);
  }, /missing stage|exactly seven/);

  reject("reorder", (fixture) => {
    [fixture.bundle.stages[0], fixture.bundle.stages[1]] = [fixture.bundle.stages[1], fixture.bundle.stages[0]];
    rewriteReceipt(fixture);
  }, /reordered/);

  reject("wrong-branch", (fixture) => {
    const backend2 = fixture.bundle.stages[5];
    backend2.predecessorStageKind = "primary_regalloc";
    backend2.predecessorReceiptRaw32 = fixture.bundle.stages[4].receiptRaw32;
    backend2.inputSemanticRaw32 = fixture.bundle.stages[4].outputSemanticRaw32;
    backend2.receiptRaw32 = stageRaw32(backend2);
    rewriteReceipt(fixture);
  }, /wrong lane or branch|wrong branch/);

  reject("path", (fixture) => {
    const stage = fixture.bundle.stages[0];
    const raw = readFileSync(join(fixture.root, ...stage.sidecarPath.split("/")));
    const replacement = "stages/01-typed_expr/renamed.sidecar.bin";
    put(fixture.root, replacement, raw);
    stage.sidecarPath = replacement;
    stage.receiptRaw32 = stageRaw32(stage);
    rewriteReceipt(fixture);
  }, /path differs from policy/);

  reject("identity-path", (fixture) => {
    const original = fixture.bundle.observedIdentityPaths.driverBytesPath;
    const replacement = "identity/cheng-renamed";
    put(fixture.root, replacement, readFileSync(join(fixture.root, ...original.split("/"))));
    fixture.bundle.observedIdentityPaths.driverBytesPath = replacement;
    rewriteReceipt(fixture);
  }, /driverBytesPath differs from external policy/);

  reject("duplicate-identity-path", (fixture) => {
    fixture.policy.identityInputs.driverBytes = {...fixture.policy.identityInputs.sourceBundle};
    fixture.bundle.observedIdentityPaths.driverBytesPath = fixture.bundle.observedIdentityPaths.sourceBundlePath;
    rewriteReceipt(fixture);
  }, /identity evidence paths must be pairwise distinct/);

  reject("source", (fixture) => mutateFile(fixture, fixture.policy.identityInputs.sourceBundle.path, "source mutation"), /sourceBundlePath bytes differ/);
  reject("grammar", (fixture) => mutateFile(fixture, fixture.policy.identityInputs.grammarObligation.path, "grammar mutation"), /grammarObligationPath bytes differ/);
  reject("driver", (fixture) => mutateFile(fixture, fixture.policy.identityInputs.driverBytes.path, "driver mutation"), /driverBytesPath bytes differ/);
  reject("toolchain", (fixture) => mutateFile(fixture, fixture.policy.identityInputs.toolchainManifest.path, "toolchain mutation"), /toolchainManifestPath bytes differ/);
  reject("producer-source", (fixture) => mutateFile(fixture, fixture.policy.stages[2].producerSource.path, "producer mutation"), /producer source bytes differ/);
  reject("sidecar", (fixture) => mutateFile(fixture, fixture.bundle.stages[3].sidecarPath, "sidecar mutation"), /sidecar bytes (?:differ|mismatch)/);
  reject("artifact", (fixture) => mutateFile(fixture, fixture.bundle.stages[6].artifactPath, "artifact mutation"), /artifact bytes (?:differ|mismatch)/);

  reject("resealed-regalloc-action-fragment", (fixture) => {
    const stage = fixture.bundle.stages[4];
    const path = join(fixture.root, ...stage.artifactPath.split("/"));
    const raw = Buffer.concat([
      readFileSync(path),
      Buffer.from("\nforged_action=17\nforged_fragment=23\nforged_ingress=29\n", "utf8"),
    ]);
    writeFileSync(path, raw);
    stage.artifactByteLength = raw.length;
    stage.artifactBytesRaw32 = sha256(raw);
    stage.receiptRaw32 = stageRaw32(stage);
    rewriteReceipt(fixture);
  }, /artifact bytes differ from the external policy pin/);

  reject("symlink", (fixture) => {
    const relativePath = fixture.bundle.stages[2].sidecarPath;
    const original = join(fixture.root, ...relativePath.split("/"));
    const target = `${original}.target`;
    renameSync(original, target);
    symlinkSync(target, original);
  }, /exact canonical evidence path|non-symlink/);

  reject("hardlink", (fixture) => {
    const relativePath = fixture.bundle.stages[5].artifactPath;
    const original = join(fixture.root, ...relativePath.split("/"));
    const target = `${original}.target`;
    renameSync(original, target);
    linkSync(target, original);
  }, /unaliased/);

  reject("output", (fixture) => {
    const stage = fixture.bundle.stages[0];
    stage.outputSemanticRaw32 = sha256("unrelated semantic root");
    stage.receiptRaw32 = stageRaw32(stage);
    rewriteReceipt(fixture);
  }, /output semantic root/);

  reject("self-hash", (fixture) => {
    fixture.bundle.stages[4].receiptRaw32 = sha256("forged receipt self hash");
    rewriteReceipt(fixture);
  }, /receipt self hash/);

  reject("envelope-self-hash", (fixture) => {
    fixture.bundle.receiptSha256 = sha256("forged envelope self hash");
    const raw = Buffer.from(`${canonical(fixture.bundle)}\n`, "utf8");
    writeFileSync(join(fixture.root, fixture.policy.receipt.path), raw);
    fixture.policy.receipt.bytesRaw32 = sha256(raw);
  }, /payload self hash/);

  reject("root", (fixture) => {
    fixture.bundle.sevenStageRootRaw32 = sha256("forged seven stage root");
    rewriteReceipt(fixture, false);
  }, /seven-stage root self hash/);

  reject("execution", (fixture) => {
    fixture.bundle.identity.executionRaw32 = sha256("forged execution identity");
    rewriteReceipt(fixture);
  }, /execution identity self hash/);

  reject("stage-execution-identity", (fixture) => {
    const stage = fixture.bundle.stages[6];
    stage.executionRaw32 = sha256("different source/driver execution");
    stage.receiptRaw32 = stageRaw32(stage);
    rewriteReceipt(fixture);
  }, /execution identity drift/);

  reject("unknown-key", (fixture) => {
    fixture.bundle.identity.extra = "forbidden";
    rewriteReceipt(fixture, false);
  }, /identity keys mismatch/);

  reject("reordered-key", (fixture) => {
    const raw = Buffer.from(`${JSON.stringify(fixture.bundle)}\n`, "utf8");
    writeFileSync(join(fixture.root, fixture.policy.receipt.path), raw);
    fixture.policy.receipt.bytesRaw32 = sha256(raw);
  }, /not canonical JSON/);

  console.log("item28 execution stage receipt validator: PASS");
}

main();
