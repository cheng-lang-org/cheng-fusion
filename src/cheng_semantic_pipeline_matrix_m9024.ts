// Formal-grammar obligations, real Cheng source materialization, and bounded
// pipeline-profile coverage layered on the m9023 semantic model.
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {
  CHENG_SEMANTIC_AXIS_ORDER,
  CHENG_SEMANTIC_MODEL_SCHEMA,
  buildSemanticMaterializationRecipe,
  canonicalJson,
  enumerateSemanticUniverse,
  sha256,
  validateSemanticCase,
  type SemanticAxisName,
  type SemanticCase,
  type SemanticConstraintCode,
  type SemanticDimensions,
  type SemanticTypeName,
} from "./cheng_semantic_matrix_m9023.ts";

export const CHENG_SEMANTIC_PIPELINE_MATRIX_SCHEMA = "cheng_semantic_pipeline_matrix";
export const CHENG_SOURCE_BUNDLE_SCHEMA = "cheng_semantic_source_bundle";
export const CHENG_GRAMMAR_OBLIGATION_SCHEMA = "cheng_formal_grammar_obligations";
export const CHENG_GRAMMAR_PARSER_SPAN_RECEIPT_SCHEMA = "cheng_parser_obligation_span_receipt";
export const CHENG_GRAMMAR_SOURCE_COVERAGE_SCHEMA = "cheng_grammar_source_coverage_receipt";
export const CHENG_SEMANTIC_PIPELINE_RUNNER_KIND = "cheng-real-source-bound-seven-stage-pipeline";

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value as Readonly<T>;
}

function hashCanonical(value: unknown): string {
  return sha256(canonicalJson(value));
}

export const CHENG_SOURCE_MATERIALIZER_BYTES_SHA256 = sha256(
  readFileSync(fileURLToPath(import.meta.url)),
);

type GrammarNodeKind = "atom" | "sequence" | "choice" | "optional" | "repetition" | "group";

interface GrammarNode {
  readonly kind: GrammarNodeKind;
  readonly text: string;
  readonly children: readonly GrammarNode[];
}

interface GrammarToken {
  readonly text: string;
  readonly structural: boolean;
}

export type GrammarObligationKind =
  | "production"
  | "choice"
  | "optional"
  | "repetition"
  | "recursion";

export type GrammarObligationDisposition = "required" | "excluded";

export interface ChengGrammarObligation {
  readonly obligationId: string;
  readonly production: string;
  readonly kind: GrammarObligationKind;
  readonly structuralPath: string;
  readonly variant: string;
  readonly fragmentSha256: string;
  readonly disposition: GrammarObligationDisposition;
  readonly reasonCode: string;
  readonly bound: number | null;
}

export interface ChengGrammarObligationContract {
  readonly schema: typeof CHENG_GRAMMAR_OBLIGATION_SCHEMA;
  readonly formalSpecSha256: string;
  readonly ebnfSha256: string;
  readonly productionCount: number;
  readonly requiredCount: number;
  readonly excludedCount: number;
  readonly bounds: {
    readonly optionalPresence: readonly [0, 1];
    readonly repetitionCount: readonly [0, 1, 8, 9];
    readonly recursionDepth: readonly [0, 1, 3, 4];
    readonly repetitionMaxIncluded: 8;
    readonly recursionMaxIncluded: 3;
  };
  readonly closureStatus: "red_source_witness_and_real_pipeline_receipts_required";
  readonly obligations: readonly ChengGrammarObligation[];
  readonly obligationRootSha256: string;
  readonly contractSha256: string;
}

function extractEbnfBlock(formalSpecSource: string): string {
  const matches = [...formalSpecSource.matchAll(/```ebnf\s*\n([\s\S]*?)\n```/g)];
  if (matches.length !== 1 || matches[0]?.[1] === undefined) {
    throw new Error(`formal spec must contain exactly one machine-readable ebnf fence, found ${matches.length}`);
  }
  return matches[0][1].replace(/\r\n?/g, "\n").trimEnd();
}

function tokenizeEbnf(input: string): readonly GrammarToken[] {
  const source = input.replace(/\/\*[\s\S]*?\*\//g, " ");
  const tokens: GrammarToken[] = [];
  let index = 0;
  while (index < source.length) {
    const ch = source[index];
    if (ch === undefined) break;
    if (/\s/.test(ch)) {
      index += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      let end = index + 1;
      while (end < source.length) {
        const current = source[end];
        if (current === "\\") {
          end += 2;
          continue;
        }
        end += 1;
        if (current === quote) break;
      }
      tokens.push({text: source.slice(index, end), structural: false});
      index = end;
      continue;
    }
    if ("()[]{}|".includes(ch)) {
      tokens.push({text: ch, structural: true});
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < source.length) {
      const current = source[end];
      if (current === undefined || /\s/.test(current) || "()[]{}|\"'`".includes(current)) break;
      end += 1;
    }
    tokens.push({text: source.slice(index, end), structural: false});
    index = end;
  }
  return tokens;
}

function grammarNode(kind: GrammarNodeKind, children: readonly GrammarNode[], text = ""): GrammarNode {
  return {kind, text, children};
}

function parseEbnfExpression(rhs: string): GrammarNode {
  const tokens = tokenizeEbnf(rhs);
  let cursor = 0;

  function parseChoice(stop: string | null): GrammarNode {
    const alternatives: GrammarNode[] = [];
    let sequence: GrammarNode[] = [];
    while (cursor < tokens.length) {
      const token = tokens[cursor];
      if (token === undefined) break;
      if (stop !== null && token.structural && token.text === stop) break;
      if (token.structural && token.text === "|") {
        alternatives.push(grammarNode("sequence", sequence));
        sequence = [];
        cursor += 1;
        continue;
      }
      if (token.structural && "[({".includes(token.text)) {
        const close = token.text === "[" ? "]" : token.text === "{" ? "}" : ")";
        const kind: GrammarNodeKind = token.text === "[" ? "optional" : token.text === "{" ? "repetition" : "group";
        cursor += 1;
        const nested = parseChoice(close);
        const actualClose = tokens[cursor];
        if (actualClose === undefined || !actualClose.structural || actualClose.text !== close) {
          throw new Error(`unclosed EBNF ${token.text} in production fragment`);
        }
        cursor += 1;
        sequence.push(grammarNode(kind, [nested]));
        continue;
      }
      if (token.structural && "])}".includes(token.text)) {
        throw new Error(`unexpected EBNF delimiter ${token.text}`);
      }
      sequence.push(grammarNode("atom", [], token.text));
      cursor += 1;
    }
    alternatives.push(grammarNode("sequence", sequence));
    return alternatives.length === 1 ? alternatives[0] ?? grammarNode("sequence", []) : grammarNode("choice", alternatives);
  }

  const root = parseChoice(null);
  if (cursor !== tokens.length) throw new Error("EBNF parser did not consume the complete expression");
  return root;
}

function normalizedGrammarFragment(node: GrammarNode): string {
  if (node.kind === "atom") return node.text;
  return `${node.kind}(${node.children.map(normalizedGrammarFragment).join(",")})`;
}

interface ParsedProduction {
  readonly name: string;
  readonly rhs: string;
  readonly ast: GrammarNode;
}

function parseProductions(ebnf: string): readonly ParsedProduction[] {
  const productions: ParsedProduction[] = [];
  let pending = "";
  for (const line of ebnf.split("\n")) {
    if (pending.length === 0 && !/^[A-Za-z_][A-Za-z0-9_]*\s*::=/.test(line)) continue;
    pending += `${pending.length > 0 ? "\n" : ""}${line}`;
    if (!/;\s*(?:\/\*.*\*\/)?\s*$/.test(line)) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*::=\s*([\s\S]*?)\s*;\s*(?:\/\*[\s\S]*?\*\/)?\s*$/.exec(pending);
    if (match === null || match[1] === undefined || match[2] === undefined) throw new Error(`malformed EBNF production: ${pending}`);
    const name = match[1];
    const rhs = match[2];
    try {
      productions.push({name, rhs: rhs.trim(), ast: parseEbnfExpression(rhs)});
    } catch (error) {
      throw new Error(`failed to parse EBNF production ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
    pending = "";
  }
  if (pending.length !== 0) throw new Error(`unterminated EBNF production: ${pending}`);
  if (productions.length === 0) throw new Error("machine-readable EBNF contains no productions");
  if (new Set(productions.map((entry) => entry.name)).size !== productions.length) {
    throw new Error("machine-readable EBNF contains duplicate production names");
  }
  return productions;
}

function obligation(
  production: string,
  kind: GrammarObligationKind,
  structuralPath: string,
  variant: string,
  fragmentSha256: string,
  disposition: GrammarObligationDisposition,
  reasonCode: string,
  bound: number | null,
): ChengGrammarObligation {
  const identity = {schema: CHENG_GRAMMAR_OBLIGATION_SCHEMA, production, kind, structuralPath, variant, fragmentSha256, disposition, reasonCode, bound};
  return deepFreeze({
    obligationId: `grammar.${hashCanonical(identity)}`,
    production,
    kind,
    structuralPath,
    variant,
    fragmentSha256,
    disposition,
    reasonCode,
    bound,
  });
}

function structuralObligations(production: ParsedProduction): ChengGrammarObligation[] {
  const out: ChengGrammarObligation[] = [];
  const rootSha = sha256(production.rhs.replace(/\s+/g, " ").trim());
  out.push(obligation(production.name, "production", "root", "root", rootSha, "required", "M9024_G_REQUIRED_PRODUCTION", null));

  function walk(node: GrammarNode, path: string): void {
    const fragmentSha = sha256(normalizedGrammarFragment(node));
    if (node.kind === "choice") {
      node.children.forEach((child, index) => {
        out.push(obligation(production.name, "choice", path, `alternative_${index}`, sha256(normalizedGrammarFragment(child)), "required", "M9024_G_REQUIRED_CHOICE", index));
      });
    } else if (node.kind === "optional") {
      out.push(obligation(production.name, "optional", path, "absent", fragmentSha, "required", "M9024_G_REQUIRED_OPTIONAL_ABSENT", 0));
      out.push(obligation(production.name, "optional", path, "present", fragmentSha, "required", "M9024_G_REQUIRED_OPTIONAL_PRESENT", 1));
    } else if (node.kind === "repetition") {
      out.push(obligation(production.name, "repetition", path, "zero", fragmentSha, "required", "M9024_G_REQUIRED_REPETITION_ZERO", 0));
      out.push(obligation(production.name, "repetition", path, "one", fragmentSha, "required", "M9024_G_REQUIRED_REPETITION_ONE", 1));
      out.push(obligation(production.name, "repetition", path, "bounded_max", fragmentSha, "required", "M9024_G_REQUIRED_REPETITION_BOUNDARY", 8));
      out.push(obligation(production.name, "repetition", path, "plus_one_reject", fragmentSha, "excluded", "M9024_G01_UNBOUNDED_REPETITION_EXCLUDED", 9));
    }
    node.children.forEach((child, index) => walk(child, `${path}.${node.kind}${index}`));
  }
  walk(production.ast, "root");
  return out;
}

function recursiveProductionNames(productions: readonly ParsedProduction[]): ReadonlySet<string> {
  const names = new Set(productions.map((entry) => entry.name));
  const edges = new Map<string, readonly string[]>();
  for (const production of productions) {
    const refs = tokenizeEbnf(production.rhs)
      .filter((token) => !token.structural && /^[A-Za-z_][A-Za-z0-9_]*$/.test(token.text) && names.has(token.text))
      .map((token) => token.text);
    edges.set(production.name, [...new Set(refs)]);
  }

  // A production is recursive exactly when it belongs to a non-trivial SCC,
  // or its singleton SCC has a self edge. Enumerating paths is exponential on
  // a mutually-recursive grammar graph; Tarjan visits every node and edge once.
  const recursive = new Set<string>();
  const nodeIndex = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  let nextIndex = 0;

  function strongConnect(node: string): void {
    const index = nextIndex;
    nextIndex += 1;
    nodeIndex.set(node, index);
    lowLink.set(node, index);
    stack.push(node);
    onStack.add(node);

    for (const next of edges.get(node) ?? []) {
      const priorIndex = nodeIndex.get(next);
      if (priorIndex === undefined) {
        strongConnect(next);
        const childLow = lowLink.get(next);
        const nodeLow = lowLink.get(node);
        if (childLow === undefined || nodeLow === undefined) throw new Error("Tarjan low-link state escaped grammar graph");
        lowLink.set(node, Math.min(nodeLow, childLow));
      } else if (onStack.has(next)) {
        const nodeLow = lowLink.get(node);
        if (nodeLow === undefined) throw new Error("Tarjan node state escaped grammar graph");
        lowLink.set(node, Math.min(nodeLow, priorIndex));
      }
    }

    if (lowLink.get(node) !== nodeIndex.get(node)) return;
    const component: string[] = [];
    while (stack.length > 0) {
      const member = stack.pop();
      if (member === undefined) throw new Error("Tarjan stack underflow");
      onStack.delete(member);
      component.push(member);
      if (member === node) break;
    }
    if (component.length > 1) {
      for (const member of component) recursive.add(member);
    } else if ((edges.get(node) ?? []).includes(node)) {
      recursive.add(node);
    }
  }

  for (const name of names) if (!nodeIndex.has(name)) strongConnect(name);
  return recursive;
}

export function buildChengGrammarObligationContract(formalSpecSource: string | Buffer): ChengGrammarObligationContract {
  const sourceBytes = Buffer.isBuffer(formalSpecSource) ? formalSpecSource : Buffer.from(formalSpecSource, "utf8");
  const source = sourceBytes.toString("utf8");
  const ebnf = extractEbnfBlock(source);
  const productions = parseProductions(ebnf);
  const obligations = productions.flatMap(structuralObligations);
  for (const name of recursiveProductionNames(productions)) {
    const production = productions.find((entry) => entry.name === name);
    if (production === undefined) throw new Error("recursive production escaped parsed set");
    const fragmentSha = sha256(production.rhs.replace(/\s+/g, " ").trim());
    obligations.push(obligation(name, "recursion", "root", "depth_zero", fragmentSha, "required", "M9024_G_REQUIRED_RECURSION_ZERO", 0));
    obligations.push(obligation(name, "recursion", "root", "depth_one", fragmentSha, "required", "M9024_G_REQUIRED_RECURSION_ONE", 1));
    obligations.push(obligation(name, "recursion", "root", "bounded_depth", fragmentSha, "required", "M9024_G_REQUIRED_RECURSION_BOUNDARY", 3));
    obligations.push(obligation(name, "recursion", "root", "plus_one_reject", fragmentSha, "excluded", "M9024_G02_UNBOUNDED_RECURSION_EXCLUDED", 4));
  }
  obligations.sort((left, right) => left.obligationId.localeCompare(right.obligationId));
  const requiredCount = obligations.filter((entry) => entry.disposition === "required").length;
  const excludedCount = obligations.length - requiredCount;
  const rootPayload = obligations.map((entry) => ({
    obligationId: entry.obligationId,
    disposition: entry.disposition,
    reasonCode: entry.reasonCode,
  }));
  const payload = {
    schema: CHENG_GRAMMAR_OBLIGATION_SCHEMA as typeof CHENG_GRAMMAR_OBLIGATION_SCHEMA,
    formalSpecSha256: sha256(sourceBytes),
    ebnfSha256: sha256(ebnf),
    productionCount: productions.length,
    requiredCount,
    excludedCount,
    bounds: {
      optionalPresence: [0, 1] as const,
      repetitionCount: [0, 1, 8, 9] as const,
      recursionDepth: [0, 1, 3, 4] as const,
      repetitionMaxIncluded: 8 as const,
      recursionMaxIncluded: 3 as const,
    },
    closureStatus: "red_source_witness_and_real_pipeline_receipts_required" as const,
    obligations,
    obligationRootSha256: hashCanonical(rootPayload),
  };
  return deepFreeze({...payload, contractSha256: hashCanonical(payload)});
}

export function validateChengGrammarObligationContract(
  formalSpecSource: string | Buffer,
  contract: ChengGrammarObligationContract,
): Readonly<{obligationCount: number; requiredCount: number; obligationRootSha256: string}> {
  const expected = buildChengGrammarObligationContract(formalSpecSource);
  if (canonicalJson(expected) !== canonicalJson(contract)) throw new Error("formal grammar obligation contract mismatch");
  return deepFreeze({
    obligationCount: contract.obligations.length,
    requiredCount: contract.requiredCount,
    obligationRootSha256: contract.obligationRootSha256,
  });
}

function assertGrammarContractSelfConsistent(contract: ChengGrammarObligationContract): void {
  if (contract.schema !== CHENG_GRAMMAR_OBLIGATION_SCHEMA) throw new Error("invalid grammar obligation schema");
  const {contractSha256, ...payload} = contract;
  if (contractSha256 !== hashCanonical(payload)) throw new Error("grammar obligation contract hash mismatch");
  if (contract.obligations.length !== contract.requiredCount + contract.excludedCount) throw new Error("grammar obligation count mismatch");
  const ids = new Set(contract.obligations.map((entry) => entry.obligationId));
  if (ids.size !== contract.obligations.length) throw new Error("duplicate grammar obligation identity");
  const root = hashCanonical(contract.obligations.map((entry) => ({
    obligationId: entry.obligationId,
    disposition: entry.disposition,
    reasonCode: entry.reasonCode,
  })));
  if (root !== contract.obligationRootSha256) throw new Error("grammar obligation root mismatch");
}

const PROFILE_AXES = {
  useSite: ["binding", "assign", "call_arg", "return", "condition", "element", "field_init"],
  targetPlace: ["local", "global", "inline_field", "ref_boundary", "index"],
  abiBoundary: ["internal", "importc", "export"],
  lifetime: ["straight", "branch", "loop", "defer"],
  regallocPressure: ["low", "call_live", "parallel_copy", "register_boundary", "plus_one_spill", "address_escape"],
} as const;

export type PipelineProfileAxisName = keyof typeof PROFILE_AXES;
export type PipelineProfileDimensions = {
  readonly [K in PipelineProfileAxisName]: (typeof PROFILE_AXES)[K][number];
};

export const CHENG_PIPELINE_PROFILE_AXIS_ORDER = Object.freeze([
  "useSite",
  "targetPlace",
  "abiBoundary",
  "lifetime",
  "regallocPressure",
] as const satisfies readonly PipelineProfileAxisName[]);

export const CHENG_PIPELINE_REGISTER_BOUNDARY_LIVE_VALUES = 12;
export const CHENG_PIPELINE_PLUS_ONE_SPILL_LIVE_VALUES = 13;

const PROFILE_CONSTRAINT_CODES = Object.freeze([
  "M9024_C01_CONDITION_REQUIRES_BOOL",
  "M9024_C02_USE_SITE_TARGET_PLACE_EXACT",
  "M9024_C03_PUBLIC_IMPORTC_FORBIDDEN",
  "M9024_C04_PUBLIC_EXPORT_FORBIDDEN",
  "M9024_C05_IMPLICIT_BORROW_RETURN_FORBIDDEN",
  "M9024_C06_ADDRESS_ESCAPE_SHAPE_EXACT",
  "M9024_C07_ADDRESS_ESCAPE_REQUIRES_LVALUE",
] as const);

export type PipelineProfileConstraintCode = (typeof PROFILE_CONSTRAINT_CODES)[number];

export interface PipelineProfileClassification {
  readonly schema: "cheng_pipeline_profile_classification";
  readonly legal: boolean;
  readonly violations: readonly PipelineProfileConstraintCode[];
}

const CONDITION_BOOL_BIT = 1 << 0;
const USE_PLACE_BIT = 1 << 1;
const IMPORTC_BIT = 1 << 2;
const EXPORT_BIT = 1 << 3;
const BORROW_RETURN_BIT = 1 << 4;
const ESCAPE_SHAPE_BIT = 1 << 5;
const ESCAPE_LVALUE_BIT = 1 << 6;

function generationUsePlaceLegal(profile: PipelineProfileDimensions): boolean {
  if (profile.useSite === "binding") return profile.targetPlace === "local";
  if (profile.useSite === "assign") return profile.targetPlace !== "ref_boundary";
  if (profile.useSite === "call_arg") return profile.targetPlace === "local" || profile.targetPlace === "ref_boundary";
  if (profile.useSite === "return" || profile.useSite === "condition") return profile.targetPlace === "local";
  if (profile.useSite === "element") return profile.targetPlace === "index";
  return profile.targetPlace === "inline_field";
}

function profileGenerationViolationMask(base: SemanticDimensions, profile: PipelineProfileDimensions): number {
  let mask = 0;
  if (profile.useSite === "condition" && base.type !== "bool") mask |= CONDITION_BOOL_BIT;
  if (!generationUsePlaceLegal(profile)) mask |= USE_PLACE_BIT;
  if (profile.abiBoundary === "importc") mask |= IMPORTC_BIT;
  if (profile.abiBoundary === "export") mask |= EXPORT_BIT;
  if (base.sourceSurface === "implicit_var_borrow" && profile.useSite === "return") mask |= BORROW_RETURN_BIT;
  const escapeShape = profile.useSite === "call_arg" && profile.targetPlace === "ref_boundary";
  if ((profile.regallocPressure === "address_escape") !== escapeShape) mask |= ESCAPE_SHAPE_BIT;
  const lvalueOrigin = base.valueCategory === "ident" || base.valueCategory === "field" || base.valueCategory === "index";
  if (profile.regallocPressure === "address_escape" && !lvalueOrigin) mask |= ESCAPE_LVALUE_BIT;
  return mask;
}

// Independent proof classifier: no calls to the generation classifier or its
// use-site/place helper, and no use of m9023 type descriptors.
function profileProofViolationMask(base: SemanticDimensions, profile: PipelineProfileDimensions): number {
  let mask = 0;
  if (profile.useSite === "condition") {
    if (base.type !== "bool") mask |= CONDITION_BOOL_BIT;
  }
  let placeOkay = false;
  switch (profile.targetPlace) {
    case "local":
      placeOkay = profile.useSite === "binding" || profile.useSite === "assign" || profile.useSite === "call_arg"
        || profile.useSite === "return" || profile.useSite === "condition";
      break;
    case "global":
      placeOkay = profile.useSite === "assign";
      break;
    case "inline_field":
      placeOkay = profile.useSite === "assign" || profile.useSite === "field_init";
      break;
    case "ref_boundary":
      placeOkay = profile.useSite === "call_arg";
      break;
    case "index":
      placeOkay = profile.useSite === "assign" || profile.useSite === "element";
      break;
  }
  if (!placeOkay) mask |= USE_PLACE_BIT;
  if (profile.abiBoundary !== "internal") {
    mask |= profile.abiBoundary === "importc" ? IMPORTC_BIT : EXPORT_BIT;
  }
  if (profile.useSite === "return" && base.sourceSurface === "implicit_var_borrow") mask |= BORROW_RETURN_BIT;
  const wantsEscape = profile.regallocPressure === "address_escape";
  const hasEscapeSurface = profile.targetPlace === "ref_boundary" && profile.useSite === "call_arg";
  if (wantsEscape !== hasEscapeSurface) mask |= ESCAPE_SHAPE_BIT;
  if (wantsEscape && !(base.valueCategory === "ident" || base.valueCategory === "field" || base.valueCategory === "index")) {
    mask |= ESCAPE_LVALUE_BIT;
  }
  return mask;
}

function classificationFromMask(mask: number): PipelineProfileClassification {
  const violations: PipelineProfileConstraintCode[] = [];
  for (let index = 0; index < PROFILE_CONSTRAINT_CODES.length; index += 1) {
    const code = PROFILE_CONSTRAINT_CODES[index];
    if (code === undefined) throw new Error("pipeline profile constraint escaped schema bounds");
    if ((mask & (1 << index)) !== 0) violations.push(code);
  }
  return deepFreeze({schema: "cheng_pipeline_profile_classification", legal: mask === 0, violations});
}

function orderedProfile(input: PipelineProfileDimensions): PipelineProfileDimensions {
  const record = input as unknown as Record<string, string>;
  if (Object.keys(record).length !== CHENG_PIPELINE_PROFILE_AXIS_ORDER.length) throw new Error("pipeline profile axes are incomplete");
  const out: Record<string, string> = {};
  for (const axis of CHENG_PIPELINE_PROFILE_AXIS_ORDER) {
    const value = record[axis];
    if (value === undefined || !(PROFILE_AXES[axis] as readonly string[]).includes(value)) {
      throw new Error(`unknown pipeline profile axis value ${axis}=${String(value)}`);
    }
    out[axis] = value;
  }
  return out as unknown as PipelineProfileDimensions;
}

export function classifyPipelineProfile(baseCase: SemanticCase, profileInput: PipelineProfileDimensions): PipelineProfileClassification {
  if (!validateSemanticCase(baseCase).legal) throw new Error("pipeline profiles join only legal m9023 semantic cases");
  const profile = orderedProfile(profileInput);
  return classificationFromMask(profileGenerationViolationMask(baseCase.dimensions, profile));
}

export function proofClassifyPipelineProfile(baseCase: SemanticCase, profile: PipelineProfileDimensions): PipelineProfileClassification {
  if (!validateSemanticCase(baseCase).legal) throw new Error("pipeline profile proof joins only legal m9023 semantic cases");
  return classificationFromMask(profileProofViolationMask(baseCase.dimensions, profile));
}

export const CHENG_SEMANTIC_PIPELINE_PROFILE_SCHEMA = deepFreeze({
  schema: CHENG_SEMANTIC_PIPELINE_MATRIX_SCHEMA,
  baseModelSchemaSha256: hashCanonical(CHENG_SEMANTIC_MODEL_SCHEMA),
  axes: PROFILE_AXES,
  constraints: PROFILE_CONSTRAINT_CODES,
  bounds: {
    registerBoundaryLiveValues: CHENG_PIPELINE_REGISTER_BOUNDARY_LIVE_VALUES,
    plusOneSpillLiveValues: CHENG_PIPELINE_PLUS_ONE_SPILL_LIVE_VALUES,
  },
  publicSurface: {
    allowedBorrowSyntax: "var T implicit borrow",
    importcAndExportDisposition: "stable_reject_under_default_public_no_pointer_gate",
  },
  scopeClaim: "bounded_profile_join_not_infinite_grammar_and_not_real_pipeline_completion",
});

export const CHENG_SEMANTIC_PIPELINE_PROFILE_SCHEMA_SHA256 = hashCanonical(CHENG_SEMANTIC_PIPELINE_PROFILE_SCHEMA);

type JoinedAxisName = SemanticAxisName | PipelineProfileAxisName;

const JOINED_AXIS_ORDER = Object.freeze([
  ...CHENG_SEMANTIC_AXIS_ORDER,
  ...CHENG_PIPELINE_PROFILE_AXIS_ORDER,
] as readonly JoinedAxisName[]);

interface ProjectionSpec {
  readonly group: "critical" | "pairwise" | "higher";
  readonly name: string;
  readonly axes: readonly JoinedAxisName[];
}

const CRITICAL_PROJECTIONS: readonly ProjectionSpec[] = deepFreeze([
  {group: "critical", name: "ownership_recursive_use_place", axes: ["type", "ownership", "valueCategory", "useSite", "targetPlace"]},
  {group: "critical", name: "field_boundary_lifetime", axes: ["type", "ownership", "fieldPath", "sourceSurface", "targetPlace", "lifetime"]},
  {group: "critical", name: "exact_call_abi_transport", axes: ["type", "valueCategory", "callIdentity", "overload", "moduleScope", "resultTransport", "abiBoundary"]},
  {group: "critical", name: "alias_escape_place", axes: ["ownership", "storage", "alias", "sourceSurface", "targetPlace", "regallocPressure"]},
  {group: "critical", name: "cfg_lifetime_pressure", axes: ["controlFlow", "lifetime", "regallocPressure"]},
  {group: "critical", name: "managed_descriptor_use", axes: ["type", "ownership", "resultTransport", "useSite"]},
]);

const HIGHER_ORDER_PROJECTIONS: readonly ProjectionSpec[] = deepFreeze([
  {group: "higher", name: "abi_transport_pressure", axes: ["resultTransport", "abiBoundary", "regallocPressure"]},
  {group: "higher", name: "register_boundary_use_place_lifetime", axes: ["useSite", "targetPlace", "lifetime", "regallocPressure"]},
]);

function pairwiseProjectionSpecs(): readonly ProjectionSpec[] {
  const out: ProjectionSpec[] = [];
  for (let left = 0; left < JOINED_AXIS_ORDER.length; left += 1) {
    const leftAxis = JOINED_AXIS_ORDER[left];
    if (leftAxis === undefined) throw new Error("joined left axis escaped schema bounds");
    for (let right = left + 1; right < JOINED_AXIS_ORDER.length; right += 1) {
      const rightAxis = JOINED_AXIS_ORDER[right];
      if (rightAxis === undefined) throw new Error("joined right axis escaped schema bounds");
      out.push({group: "pairwise", name: `${leftAxis}__${rightAxis}`, axes: [leftAxis, rightAxis]});
    }
  }
  return deepFreeze(out);
}

const PAIRWISE_PROJECTIONS = pairwiseProjectionSpecs();

function baseAxisValues(axis: SemanticAxisName): readonly string[] {
  const axes = CHENG_SEMANTIC_MODEL_SCHEMA.axes as unknown as Record<string, readonly string[]>;
  const values = axes[axis];
  if (values === undefined) throw new Error(`missing m9023 axis values for ${axis}`);
  return values;
}

function joinedAxisValues(axis: JoinedAxisName): readonly string[] {
  if (CHENG_PIPELINE_PROFILE_AXIS_ORDER.includes(axis as PipelineProfileAxisName)) {
    return PROFILE_AXES[axis as PipelineProfileAxisName] as readonly string[];
  }
  return baseAxisValues(axis as SemanticAxisName);
}

function joinedAxisValue(base: SemanticDimensions, profile: PipelineProfileDimensions, axis: JoinedAxisName): string {
  if (CHENG_PIPELINE_PROFILE_AXIS_ORDER.includes(axis as PipelineProfileAxisName)) {
    return profile[axis as PipelineProfileAxisName];
  }
  return base[axis as SemanticAxisName];
}

let cachedProfileAssignments: readonly PipelineProfileDimensions[] | null = null;

export function enumeratePipelineProfileAssignments(): readonly PipelineProfileDimensions[] {
  if (cachedProfileAssignments !== null) return cachedProfileAssignments;
  const out: PipelineProfileDimensions[] = [];
  const current: Record<string, string> = {};
  function walk(axisIndex: number): void {
    if (axisIndex === CHENG_PIPELINE_PROFILE_AXIS_ORDER.length) {
      out.push(deepFreeze({...current}) as unknown as PipelineProfileDimensions);
      return;
    }
    const axis = CHENG_PIPELINE_PROFILE_AXIS_ORDER[axisIndex];
    if (axis === undefined) throw new Error("profile enumeration escaped axis bounds");
    for (const value of PROFILE_AXES[axis]) {
      current[axis] = value;
      walk(axisIndex + 1);
    }
  }
  walk(0);
  cachedProfileAssignments = deepFreeze(out);
  return cachedProfileAssignments;
}

interface PreparedProjection {
  readonly spec: ProjectionSpec;
  readonly baseAxes: readonly SemanticAxisName[];
  readonly profileAxes: readonly PipelineProfileAxisName[];
  readonly baseCardinality: number;
  readonly profileCardinality: number;
  readonly generationBaseIndex: Int32Array;
  readonly generationProfileIndex: Int32Array;
  readonly proofBaseIndex: Int32Array;
  readonly proofProfileIndex: Int32Array;
  readonly generationWitness: Int32Array;
  readonly proofWitness: Int32Array;
}

function mixedIndex(
  axes: readonly JoinedAxisName[],
  base: SemanticDimensions,
  profile: PipelineProfileDimensions,
): number {
  let index = 0;
  for (const axis of axes) {
    const values = joinedAxisValues(axis);
    const ordinal = values.indexOf(joinedAxisValue(base, profile, axis));
    if (ordinal < 0) throw new Error(`projection value escaped axis ${axis}`);
    index = index * values.length + ordinal;
  }
  return index;
}

function axisCardinality(axes: readonly JoinedAxisName[]): number {
  let cardinality = 1;
  for (const axis of axes) cardinality *= joinedAxisValues(axis).length;
  return cardinality;
}

function prepareProjection(
  spec: ProjectionSpec,
  bases: readonly SemanticCase[],
  profiles: readonly PipelineProfileDimensions[],
): PreparedProjection {
  const baseAxes = spec.axes.filter((axis): axis is SemanticAxisName => CHENG_SEMANTIC_AXIS_ORDER.includes(axis as SemanticAxisName));
  const profileAxes = spec.axes.filter((axis): axis is PipelineProfileAxisName => CHENG_PIPELINE_PROFILE_AXIS_ORDER.includes(axis as PipelineProfileAxisName));
  if (canonicalJson([...baseAxes, ...profileAxes]) !== canonicalJson(spec.axes)) {
    throw new Error(`projection ${spec.name} must order m9023 axes before profile axes`);
  }
  const baseCardinality = axisCardinality(baseAxes);
  const profileCardinality = axisCardinality(profileAxes);
  const dummyBase = bases[0];
  const dummyProfile = profiles[0];
  if (dummyBase === undefined || dummyProfile === undefined) throw new Error("projection preparation requires non-empty bounded domains");
  const generationBaseIndex = Int32Array.from(bases, (entry) => mixedIndex(baseAxes, entry.dimensions, dummyProfile));
  const generationProfileIndex = Int32Array.from(profiles, (entry) => mixedIndex(profileAxes, dummyBase.dimensions, entry));
  const proofBaseAxes = [...baseAxes].reverse();
  const proofProfileAxes = [...profileAxes].reverse();
  const proofBaseIndex = Int32Array.from(bases, (entry) => mixedIndex(proofBaseAxes, entry.dimensions, dummyProfile));
  const proofProfileIndex = Int32Array.from(profiles, (entry) => mixedIndex(proofProfileAxes, dummyBase.dimensions, entry));
  const generationWitness = new Int32Array(baseCardinality * profileCardinality);
  const proofWitness = new Int32Array(baseCardinality * profileCardinality);
  generationWitness.fill(-1);
  proofWitness.fill(-1);
  return {
    spec,
    baseAxes,
    profileAxes,
    baseCardinality,
    profileCardinality,
    generationBaseIndex,
    generationProfileIndex,
    proofBaseIndex,
    proofProfileIndex,
    generationWitness,
    proofWitness,
  };
}

function recordProjection(projection: PreparedProjection, baseIndex: number, profileIndex: number, joinOrdinal: number): void {
  const generationBase = projection.generationBaseIndex[baseIndex];
  const generationProfile = projection.generationProfileIndex[profileIndex];
  const proofBase = projection.proofBaseIndex[baseIndex];
  const proofProfile = projection.proofProfileIndex[profileIndex];
  if (generationBase === undefined || generationProfile === undefined || proofBase === undefined || proofProfile === undefined) {
    throw new Error("projection index escaped prepared bounds");
  }
  const generationIndex = generationBase * projection.profileCardinality + generationProfile;
  const proofIndex = proofProfile * projection.baseCardinality + proofBase;
  if (projection.generationWitness[generationIndex] === -1) projection.generationWitness[generationIndex] = joinOrdinal;
  if (projection.proofWitness[proofIndex] === -1) projection.proofWitness[proofIndex] = joinOrdinal;
}

function generationProjectionToken(
  spec: ProjectionSpec,
  base: SemanticDimensions,
  profile: PipelineProfileDimensions,
): string {
  return `${spec.group}:${spec.name}|${spec.axes.map((axis) => `${axis}=${joinedAxisValue(base, profile, axis)}`).join("|")}`;
}

// Separate proof encoder: it does not call generationProjectionToken and builds
// the projection columns using an explicit loop.
function proofProjectionToken(
  spec: ProjectionSpec,
  base: SemanticDimensions,
  profile: PipelineProfileDimensions,
): string {
  let token = `${spec.group}:${spec.name}`;
  for (let index = 0; index < spec.axes.length; index += 1) {
    const axis = spec.axes[index];
    if (axis === undefined) throw new Error("proof projection axis escaped schema bounds");
    let value: string;
    if (CHENG_SEMANTIC_AXIS_ORDER.includes(axis as SemanticAxisName)) value = base[axis as SemanticAxisName];
    else value = profile[axis as PipelineProfileAxisName];
    token += `|${axis}=${value}`;
  }
  return token;
}

export interface PipelineProfileCase {
  readonly schema: "cheng_pipeline_profile_case";
  readonly profileCaseId: string;
  readonly baseCaseId: string;
  readonly baseSemanticSha256: string;
  readonly baseCaseOrdinal: number;
  readonly profileOrdinal: number;
  readonly expected: "accept" | "reject";
  readonly violationCodes: readonly PipelineProfileConstraintCode[];
  readonly profile: PipelineProfileDimensions;
  readonly profileCaseSha256: string;
}

function profileCaseFromJoin(
  baseCase: SemanticCase,
  baseCaseOrdinal: number,
  profile: PipelineProfileDimensions,
  profileOrdinal: number,
  expected: "accept" | "reject",
  violations: readonly PipelineProfileConstraintCode[],
): PipelineProfileCase {
  const identity = {
    schema: CHENG_SEMANTIC_PIPELINE_MATRIX_SCHEMA,
    baseCaseId: baseCase.caseId,
    profile: orderedProfile(profile),
  };
  const profileCaseId = `sempipe.${hashCanonical(identity)}`;
  const payload = {
    identity,
    baseSemanticSha256: baseCase.semanticSha256,
    baseCaseOrdinal,
    profileOrdinal,
    expected,
    violationCodes: [...violations],
  };
  return deepFreeze({
    schema: "cheng_pipeline_profile_case",
    profileCaseId,
    baseCaseId: baseCase.caseId,
    baseSemanticSha256: baseCase.semanticSha256,
    baseCaseOrdinal,
    profileOrdinal,
    expected,
    violationCodes: [...violations],
    profile: orderedProfile(profile),
    profileCaseSha256: hashCanonical(payload),
  });
}

export interface PipelineCoverageContract {
  readonly schema: "cheng_pipeline_coverage_contract";
  readonly profileSchemaSha256: string;
  readonly baseLegalCount: number;
  readonly profileAssignmentCount: number;
  readonly joinedAssignmentCount: number;
  readonly legalJoinedCount: number;
  readonly classifierAgreementCount: number;
  readonly classifierAgreementSha256: string;
  readonly critical: readonly string[];
  readonly pairwise: readonly string[];
  readonly higherOrder: readonly string[];
  readonly negative: readonly string[];
  readonly contractSha256: string;
}

interface CoverageDerivation {
  readonly contract: PipelineCoverageContract;
  readonly generationWitnessByToken: ReadonlyMap<string, number>;
  readonly negativeCases: readonly PipelineProfileCase[];
  readonly bases: readonly SemanticCase[];
  readonly profiles: readonly PipelineProfileDimensions[];
}

function joinFromOrdinal(
  joinOrdinal: number,
  bases: readonly SemanticCase[],
  profiles: readonly PipelineProfileDimensions[],
): Readonly<{base: SemanticCase; profile: PipelineProfileDimensions; baseIndex: number; profileIndex: number}> {
  const baseIndex = Math.floor(joinOrdinal / profiles.length);
  const profileIndex = joinOrdinal % profiles.length;
  const base = bases[baseIndex];
  const profile = profiles[profileIndex];
  if (base === undefined || profile === undefined) throw new Error("joined witness ordinal escaped bounded domain");
  return {base, profile, baseIndex, profileIndex};
}

function projectionTokens(
  projections: readonly PreparedProjection[],
  side: "generation" | "proof",
  bases: readonly SemanticCase[],
  profiles: readonly PipelineProfileDimensions[],
): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  for (const projection of projections) {
    const witnesses = side === "generation" ? projection.generationWitness : projection.proofWitness;
    for (let index = 0; index < witnesses.length; index += 1) {
      const joinOrdinal = witnesses[index];
      if (joinOrdinal === undefined || joinOrdinal < 0) continue;
      const joined = joinFromOrdinal(joinOrdinal, bases, profiles);
      const token = side === "generation"
        ? generationProjectionToken(projection.spec, joined.base.dimensions, joined.profile)
        : proofProjectionToken(projection.spec, joined.base.dimensions, joined.profile);
      if (out.has(token)) throw new Error(`duplicate ${side} projection token ${token}`);
      out.set(token, joinOrdinal);
    }
  }
  return out;
}

function popcount(maskInput: number): number {
  let mask = maskInput >>> 0;
  let count = 0;
  while (mask !== 0) {
    mask &= mask - 1;
    count += 1;
  }
  return count;
}

let cachedCoverageDerivation: CoverageDerivation | null = null;

function deriveCoverage(): CoverageDerivation {
  if (cachedCoverageDerivation !== null) return cachedCoverageDerivation;
  const bases = enumerateSemanticUniverse().legalCases;
  const profiles = enumeratePipelineProfileAssignments();
  const critical = CRITICAL_PROJECTIONS.map((spec) => prepareProjection(spec, bases, profiles));
  const higher = HIGHER_ORDER_PROJECTIONS.map((spec) => prepareProjection(spec, bases, profiles));
  const pairwise = PAIRWISE_PROJECTIONS.map((spec) => prepareProjection(spec, bases, profiles));
  const crossCritical = [...critical, ...higher];
  const basePairs = pairwise.filter((entry) => entry.profileAxes.length === 0);
  const profilePairs = pairwise.filter((entry) => entry.baseAxes.length === 0);
  const mixedPairs = pairwise.filter((entry) => entry.baseAxes.length > 0 && entry.profileAxes.length > 0);

  const firstLegalProfileByBase = new Int32Array(bases.length);
  const firstLegalBaseByProfile = new Int32Array(profiles.length);
  firstLegalProfileByBase.fill(-1);
  firstLegalBaseByProfile.fill(-1);
  const firstProfileByBaseAxisValue = new Map<PipelineProfileAxisName, Int32Array>();
  for (const axis of CHENG_PIPELINE_PROFILE_AXIS_ORDER) {
    const rows = new Int32Array(bases.length * PROFILE_AXES[axis].length);
    rows.fill(-1);
    firstProfileByBaseAxisValue.set(axis, rows);
  }
  const negativeWitnesses = new Int32Array(PROFILE_CONSTRAINT_CODES.length);
  negativeWitnesses.fill(-1);

  const agreementHash = createHash("sha256");
  const agreementRecordBytes = 12;
  const agreementChunk = Buffer.allocUnsafe(agreementRecordBytes * 8192);
  let agreementOffset = 0;
  let legalJoinedCount = 0;
  let classifierAgreementCount = 0;
  function appendAgreement(baseIndex: number, profileIndex: number, generationMask: number, proofMask: number): void {
    agreementChunk.writeUInt16LE(baseIndex, agreementOffset);
    agreementChunk.writeUInt16LE(profileIndex, agreementOffset + 2);
    agreementChunk.writeUInt32LE(generationMask >>> 0, agreementOffset + 4);
    agreementChunk.writeUInt32LE(proofMask >>> 0, agreementOffset + 8);
    agreementOffset += agreementRecordBytes;
    if (agreementOffset === agreementChunk.length) {
      agreementHash.update(agreementChunk);
      agreementOffset = 0;
    }
  }

  for (let baseIndex = 0; baseIndex < bases.length; baseIndex += 1) {
    const base = bases[baseIndex];
    if (base === undefined) throw new Error("base semantic case escaped legal universe");
    for (let profileIndex = 0; profileIndex < profiles.length; profileIndex += 1) {
      const profile = profiles[profileIndex];
      if (profile === undefined) throw new Error("profile assignment escaped bounded universe");
      const generationMask = profileGenerationViolationMask(base.dimensions, profile);
      const proofMask = profileProofViolationMask(base.dimensions, profile);
      appendAgreement(baseIndex, profileIndex, generationMask, proofMask);
      classifierAgreementCount += 1;
      if (generationMask !== proofMask) {
        throw new Error(`independent profile classifiers disagree at base=${base.caseId} profile=${canonicalJson(profile)}`);
      }
      const joinOrdinal = baseIndex * profiles.length + profileIndex;
      if (generationMask !== 0) {
        if (popcount(generationMask) === 1) {
          const bitIndex = 31 - Math.clz32(generationMask);
          if (negativeWitnesses[bitIndex] === -1) negativeWitnesses[bitIndex] = joinOrdinal;
        }
        continue;
      }
      legalJoinedCount += 1;
      if (firstLegalProfileByBase[baseIndex] === -1) firstLegalProfileByBase[baseIndex] = profileIndex;
      if (firstLegalBaseByProfile[profileIndex] === -1) firstLegalBaseByProfile[profileIndex] = baseIndex;
      for (const axis of CHENG_PIPELINE_PROFILE_AXIS_ORDER) {
        const rows = firstProfileByBaseAxisValue.get(axis);
        if (rows === undefined) throw new Error("missing profile-axis witness rows");
        const valueOrdinal = (PROFILE_AXES[axis] as readonly string[]).indexOf(profile[axis]);
        const rowIndex = baseIndex * PROFILE_AXES[axis].length + valueOrdinal;
        if (rows[rowIndex] === -1) rows[rowIndex] = profileIndex;
      }
      for (const projection of crossCritical) recordProjection(projection, baseIndex, profileIndex, joinOrdinal);
    }
  }
  if (agreementOffset > 0) agreementHash.update(agreementChunk.subarray(0, agreementOffset));

  for (let baseIndex = 0; baseIndex < bases.length; baseIndex += 1) {
    const profileIndex = firstLegalProfileByBase[baseIndex];
    if (profileIndex === undefined || profileIndex < 0) throw new Error(`m9023 base case ${baseIndex} has no legal pipeline profile`);
    const joinOrdinal = baseIndex * profiles.length + profileIndex;
    for (const projection of basePairs) recordProjection(projection, baseIndex, profileIndex, joinOrdinal);
    for (const projection of mixedPairs) {
      const profileAxis = projection.profileAxes[0];
      if (profileAxis === undefined) throw new Error("mixed pair lacks profile axis");
      const rows = firstProfileByBaseAxisValue.get(profileAxis);
      if (rows === undefined) throw new Error("mixed pair lacks witness rows");
      for (let valueOrdinal = 0; valueOrdinal < PROFILE_AXES[profileAxis].length; valueOrdinal += 1) {
        const witnessProfile = rows[baseIndex * PROFILE_AXES[profileAxis].length + valueOrdinal];
        if (witnessProfile === undefined || witnessProfile < 0) continue;
        recordProjection(projection, baseIndex, witnessProfile, baseIndex * profiles.length + witnessProfile);
      }
    }
  }

  for (let profileIndex = 0; profileIndex < profiles.length; profileIndex += 1) {
    const baseIndex = firstLegalBaseByProfile[profileIndex];
    if (baseIndex === undefined || baseIndex < 0) continue;
    const joinOrdinal = baseIndex * profiles.length + profileIndex;
    for (const projection of profilePairs) recordProjection(projection, baseIndex, profileIndex, joinOrdinal);
  }

  const allPrepared = [...critical, ...pairwise, ...higher];
  const generationTokens = projectionTokens(allPrepared, "generation", bases, profiles);
  const proofTokens = projectionTokens(allPrepared, "proof", bases, profiles);
  const generationSorted = [...generationTokens.keys()].sort();
  const proofSorted = [...proofTokens.keys()].sort();
  if (canonicalJson(generationSorted) !== canonicalJson(proofSorted)) {
    throw new Error("independent generation/proof projection encoders disagree over the complete legal joined domain");
  }

  const negativeCases: PipelineProfileCase[] = [];
  for (let bitIndex = 0; bitIndex < PROFILE_CONSTRAINT_CODES.length; bitIndex += 1) {
    const joinOrdinal = negativeWitnesses[bitIndex];
    if (joinOrdinal === undefined || joinOrdinal < 0) {
      throw new Error(`no isolated single-violation witness for ${String(PROFILE_CONSTRAINT_CODES[bitIndex])}`);
    }
    const joined = joinFromOrdinal(joinOrdinal, bases, profiles);
    const classification = classificationFromMask(profileGenerationViolationMask(joined.base.dimensions, joined.profile));
    if (classification.violations.length !== 1) throw new Error("negative profile witness is not isolated");
    negativeCases.push(profileCaseFromJoin(joined.base, joined.baseIndex, joined.profile, joined.profileIndex, "reject", classification.violations));
  }

  const criticalTokens = generationSorted.filter((token) => token.startsWith("critical:"));
  const pairwiseTokens = generationSorted.filter((token) => token.startsWith("pairwise:"));
  const higherTokens = generationSorted.filter((token) => token.startsWith("higher:"));
  const negativeTokens = PROFILE_CONSTRAINT_CODES.map((code) => `negative|${code}`).sort();
  const payload = {
    schema: "cheng_pipeline_coverage_contract" as const,
    profileSchemaSha256: CHENG_SEMANTIC_PIPELINE_PROFILE_SCHEMA_SHA256,
    baseLegalCount: bases.length,
    profileAssignmentCount: profiles.length,
    joinedAssignmentCount: bases.length * profiles.length,
    legalJoinedCount,
    classifierAgreementCount,
    classifierAgreementSha256: agreementHash.digest("hex"),
    critical: criticalTokens,
    pairwise: pairwiseTokens,
    higherOrder: higherTokens,
    negative: negativeTokens,
  };
  const contract = deepFreeze({...payload, contractSha256: hashCanonical(payload)});
  cachedCoverageDerivation = deepFreeze({contract, generationWitnessByToken: generationTokens, negativeCases, bases, profiles});
  return cachedCoverageDerivation;
}

export function derivePipelineCoverageContract(): PipelineCoverageContract {
  return deriveCoverage().contract;
}

function validateProfileCase(testCase: PipelineProfileCase, bases: readonly SemanticCase[], profiles: readonly PipelineProfileDimensions[]): void {
  const base = bases[testCase.baseCaseOrdinal];
  const profile = profiles[testCase.profileOrdinal];
  if (base === undefined || profile === undefined) throw new Error("pipeline profile case ordinal escaped bounded domain");
  if (base.caseId !== testCase.baseCaseId || base.semanticSha256 !== testCase.baseSemanticSha256) throw new Error("pipeline profile base identity mismatch");
  if (canonicalJson(profile) !== canonicalJson(testCase.profile)) throw new Error("pipeline profile ordinal identity mismatch");
  const mask = profileProofViolationMask(base.dimensions, profile);
  const classification = classificationFromMask(mask);
  if ((testCase.expected === "accept") !== classification.legal) throw new Error("pipeline profile expectation mismatch");
  if (canonicalJson(testCase.violationCodes) !== canonicalJson(classification.violations)) throw new Error("pipeline profile violation code mismatch");
  const expected = profileCaseFromJoin(base, testCase.baseCaseOrdinal, profile, testCase.profileOrdinal, testCase.expected, classification.violations);
  if (canonicalJson(expected) !== canonicalJson(testCase)) throw new Error("pipeline profile case hash or identity mismatch");
}

function proofCoverageTokensForCase(testCase: PipelineProfileCase, base: SemanticCase): readonly string[] {
  if (testCase.expected === "reject") return testCase.violationCodes.map((code) => `negative|${code}`);
  return [
    ...CRITICAL_PROJECTIONS.map((spec) => proofProjectionToken(spec, base.dimensions, testCase.profile)),
    ...PAIRWISE_PROJECTIONS.map((spec) => proofProjectionToken(spec, base.dimensions, testCase.profile)),
    ...HIGHER_ORDER_PROJECTIONS.map((spec) => proofProjectionToken(spec, base.dimensions, testCase.profile)),
  ];
}

export interface PipelineCoverageReceipt {
  readonly schema: "cheng_pipeline_coverage_receipt";
  readonly contractSha256: string;
  readonly caseCount: number;
  readonly acceptCount: number;
  readonly rejectCount: number;
  readonly coveredTokenCount: number;
  readonly receiptSha256: string;
}

export function validatePipelineCoverage(cases: readonly PipelineProfileCase[]): PipelineCoverageReceipt {
  const derivation = deriveCoverage();
  const seenIds = new Set<string>();
  const covered = new Set<string>();
  let acceptCount = 0;
  let rejectCount = 0;
  for (const testCase of cases) {
    if (seenIds.has(testCase.profileCaseId)) throw new Error(`duplicate pipeline profile case ${testCase.profileCaseId}`);
    seenIds.add(testCase.profileCaseId);
    validateProfileCase(testCase, derivation.bases, derivation.profiles);
    const base = derivation.bases[testCase.baseCaseOrdinal];
    if (base === undefined) throw new Error("coverage case base escaped domain");
    for (const token of proofCoverageTokensForCase(testCase, base)) covered.add(token);
    if (testCase.expected === "accept") acceptCount += 1;
    else rejectCount += 1;
  }
  const required = [
    ...derivation.contract.critical,
    ...derivation.contract.pairwise,
    ...derivation.contract.higherOrder,
    ...derivation.contract.negative,
  ];
  const missing = required.filter((token) => !covered.has(token));
  if (missing.length > 0) throw new Error(`pipeline profile coverage incomplete: ${missing.length} obligations missing; first=${String(missing[0])}`);
  const payload = {
    schema: "cheng_pipeline_coverage_receipt" as const,
    contractSha256: derivation.contract.contractSha256,
    caseCount: cases.length,
    acceptCount,
    rejectCount,
    coveredTokenCount: required.length,
  };
  return deepFreeze({...payload, receiptSha256: hashCanonical(payload)});
}

export interface PipelineMatrixManifest {
  readonly schema: "cheng_pipeline_matrix_manifest";
  readonly seed: string;
  readonly generator: "deterministic_first_obligation_witness_set_cover_non_minimal";
  readonly coverageContractSha256: string;
  readonly caseCount: number;
  readonly acceptCount: number;
  readonly rejectCount: number;
  readonly caseIdsSha256: string;
  readonly casesSha256: string;
  readonly manifestSha256: string;
}

export interface PipelineMatrix {
  readonly schema: typeof CHENG_SEMANTIC_PIPELINE_MATRIX_SCHEMA;
  readonly manifest: PipelineMatrixManifest;
  readonly coverage: PipelineCoverageReceipt;
  readonly cases: readonly PipelineProfileCase[];
}

function assertSeed(seed: string): void {
  if (seed.length === 0 || Buffer.byteLength(seed, "utf8") > 1024) throw new Error("pipeline matrix seed must be 1..1024 UTF-8 bytes");
}

function buildPipelineManifest(seed: string, cases: readonly PipelineProfileCase[], coverage: PipelineCoverageReceipt): PipelineMatrixManifest {
  const payload = {
    schema: "cheng_pipeline_matrix_manifest" as const,
    seed,
    generator: "deterministic_first_obligation_witness_set_cover_non_minimal" as const,
    coverageContractSha256: coverage.contractSha256,
    caseCount: cases.length,
    acceptCount: cases.filter((entry) => entry.expected === "accept").length,
    rejectCount: cases.filter((entry) => entry.expected === "reject").length,
    caseIdsSha256: hashCanonical(cases.map((entry) => entry.profileCaseId)),
    casesSha256: hashCanonical(cases),
  };
  return deepFreeze({...payload, manifestSha256: hashCanonical(payload)});
}

export function generatePipelineMatrix(seed: string): PipelineMatrix {
  assertSeed(seed);
  const derivation = deriveCoverage();
  const requiredTokens = [
    ...derivation.contract.critical,
    ...derivation.contract.pairwise,
    ...derivation.contract.higherOrder,
  ];
  const witnessOrdinals = new Set<number>();
  for (const token of requiredTokens) {
    const ordinal = derivation.generationWitnessByToken.get(token);
    if (ordinal === undefined) throw new Error(`generation set cover lacks witness for ${token}`);
    witnessOrdinals.add(ordinal);
  }
  const cases: PipelineProfileCase[] = [];
  for (const joinOrdinal of witnessOrdinals) {
    const joined = joinFromOrdinal(joinOrdinal, derivation.bases, derivation.profiles);
    cases.push(profileCaseFromJoin(joined.base, joined.baseIndex, joined.profile, joined.profileIndex, "accept", []));
  }
  cases.push(...derivation.negativeCases);
  cases.sort((left, right) => {
    const leftTie = sha256(`${seed}\0${left.profileCaseId}`);
    const rightTie = sha256(`${seed}\0${right.profileCaseId}`);
    return leftTie.localeCompare(rightTie) || left.profileCaseId.localeCompare(right.profileCaseId);
  });
  const coverage = validatePipelineCoverage(cases);
  return deepFreeze({
    schema: CHENG_SEMANTIC_PIPELINE_MATRIX_SCHEMA,
    manifest: buildPipelineManifest(seed, cases, coverage),
    coverage,
    cases,
  });
}

export function validatePipelineMatrix(matrix: PipelineMatrix): Readonly<{caseCount: number; manifestSha256: string}> {
  if (matrix.schema !== CHENG_SEMANTIC_PIPELINE_MATRIX_SCHEMA) throw new Error("invalid pipeline matrix schema");
  assertSeed(matrix.manifest.seed);
  const coverage = validatePipelineCoverage(matrix.cases);
  const manifest = buildPipelineManifest(matrix.manifest.seed, matrix.cases, coverage);
  if (canonicalJson(manifest) !== canonicalJson(matrix.manifest)) throw new Error("pipeline matrix manifest mismatch");
  if (canonicalJson(coverage) !== canonicalJson(matrix.coverage)) throw new Error("pipeline matrix coverage receipt mismatch");
  return deepFreeze({caseCount: matrix.cases.length, manifestSha256: matrix.manifest.manifestSha256});
}

export function baseCaseForPipelineCase(testCase: PipelineProfileCase): SemanticCase {
  const base = deriveCoverage().bases[testCase.baseCaseOrdinal];
  if (base === undefined || base.caseId !== testCase.baseCaseId) throw new Error("pipeline case base identity is invalid");
  return base;
}

export interface ChengPublicSurfaceLintReceipt {
  readonly schema: "cheng_public_surface_lint";
  readonly sourceSha256: string;
  readonly normalizedTokenSha256: string;
  readonly tokenCount: number;
  readonly violations: readonly string[];
  readonly passed: boolean;
  readonly receiptSha256: string;
}

function chengCodeWithoutCommentsAndLiterals(source: string): string {
  let out = "";
  let index = 0;
  while (index < source.length) {
    const ch = source[index];
    if (ch === undefined) break;
    if (ch === "#") {
      while (index < source.length && source[index] !== "\n") {
        out += " ";
        index += 1;
      }
      continue;
    }
    if (ch === '"') {
      const triple = source.slice(index, index + 3) === '"""';
      const width = triple ? 3 : 1;
      out += " ".repeat(width);
      index += width;
      while (index < source.length) {
        if (triple && source.slice(index, index + 3) === '"""') {
          out += "   ";
          index += 3;
          break;
        }
        const current = source[index];
        if (!triple && current === "\\") {
          out += "  ";
          index += 2;
          continue;
        }
        out += current === "\n" ? "\n" : " ";
        index += 1;
        if (!triple && current === '"') break;
      }
      continue;
    }
    if (ch === "'") {
      out += " ";
      index += 1;
      while (index < source.length) {
        const current = source[index];
        if (current === "\\") {
          out += "  ";
          index += 2;
          continue;
        }
        out += " ";
        index += 1;
        if (current === "'") break;
      }
      continue;
    }
    out += ch;
    index += 1;
  }
  return out;
}

function chengPublicTokens(source: string): readonly string[] {
  const code = chengCodeWithoutCommentsAndLiterals(source);
  return code.match(/@[A-Za-z_][A-Za-z0-9_]*|->|&&|\|\||\.\.<|\.\.|[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|\S/g) ?? [];
}

const FORBIDDEN_PUBLIC_IDENTIFIERS = new Set([
  "ptr",
  "ref",
  "string",
  "proc",
  "method",
  "converter",
  "dataPtr",
  "getPointer",
  "ptr_add",
  "load_ptr",
  "store_ptr",
  "copyMem",
  "setMem",
  "zeroMem",
  "alloc",
  "dealloc",
  "newSeq",
  "newSeqWithCap",
]);

// 表达式关键字: 其后不能直接结束操作数(return *p 的 * 仍是前缀解引用, 不得误判为二元)。
const LINT_EXPRESSION_KEYWORDS = new Set([
  "module", "const", "let", "var", "type", "concept", "trait", "fn", "iterator", "macro", "template",
  "async", "mut", "if", "elif", "else", "for", "while", "break", "continue", "return", "yield",
  "defer", "await", "import", "as", "in", "when", "match", "case", "of", "where", "block", "enum",
  "is", "notin",
]);
const LINT_PREFIX_OPERATOR_TOKENS = new Set(["+", "-", "!", "~", "$", "^", "%", "*", "&"]);

function tokenCanEndOperand(token: string | undefined): boolean {
  if (token === undefined) return false;
  if (token === ")" || token === "]" || token === "?") return true;
  if (/^\d/.test(token)) return true;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(token) && !LINT_EXPRESSION_KEYWORDS.has(token);
}

function tokenCanStartOperand(token: string | undefined): boolean {
  if (token === undefined) return false;
  if (token === "(" || token === "[" || token === "{") return true;
  if (LINT_PREFIX_OPERATOR_TOKENS.has(token)) return true;
  if (/^\d/.test(token)) return true;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(token);
}

// 二元中缀位置: 前一 token 可结束操作数且后一 token 可开始操作数。
// 该位置的 `*`/`&` 是合法乘法/按位与(spec §1.2 term/bitwiseAnd), 不是 no-pointer 门禁对象。
function isBinaryInfixOperatorPosition(tokens: readonly string[], index: number): boolean {
  return tokenCanEndOperand(tokens[index - 1]) && tokenCanStartOperand(tokens[index + 1]);
}

export function lintChengPublicSource(source: string): ChengPublicSurfaceLintReceipt {
  const tokens = chengPublicTokens(source);
  const violations = new Set<string>();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    if (token === undefined) continue;
    const managedRefObject =
      token === "ref" && next === "object";
    if (FORBIDDEN_PUBLIC_IDENTIFIERS.has(token) &&
        !managedRefObject) {
      violations.add(`M9024_L01_FORBIDDEN_IDENTIFIER:${token}`);
    }
    if (token === "@importc" || token === "@exportc") violations.add(`M9024_L02_PUBLIC_C_ABI_FORBIDDEN:${token}`);
    // `->` 唯一语法角色是指针成员访问(spec §0.2), 任何位置都属禁用指针操作;
    // `&`/`*` 仅在前缀(取址/解引用)或指针类型位置禁用, 二元中缀位置合法放行。
    if (token === "->") violations.add(`M9024_L03_RAW_ADDRESS_OPERATOR_FORBIDDEN:${token}`);
    if (token === "&" && !isBinaryInfixOperatorPosition(tokens, index)) violations.add(`M9024_L03_RAW_ADDRESS_OPERATOR_FORBIDDEN:${token}`);
    if (token === "*" && !isBinaryInfixOperatorPosition(tokens, index)) violations.add("M9024_L04_RAW_POINTER_OR_AMBIGUOUS_STAR_FORBIDDEN:*");
    if ((token === "seq" || token === "array") && next === "[") violations.add(`M9024_L05_REMOVED_CONTAINER_SURFACE:${token}`);
    if (token === "else" && next === "if") violations.add("M9024_L06_ELSE_IF_REMOVED");
    if (token === "cast" && next === "[") violations.add("M9024_L07_REMOVED_CAST_SURFACE");
  }
  const normalized = tokens.join("\u001f");
  const payload = {
    schema: "cheng_public_surface_lint" as const,
    sourceSha256: sha256(source),
    normalizedTokenSha256: sha256(normalized),
    tokenCount: tokens.length,
    violations: [...violations].sort(),
    passed: violations.size === 0,
  };
  return deepFreeze({...payload, receiptSha256: hashCanonical(payload)});
}

function requireLintPass(source: string, relativePath: string): ChengPublicSurfaceLintReceipt {
  const receipt = lintChengPublicSource(source);
  if (!receipt.passed) throw new Error(`generated Cheng source failed public-surface lint at ${relativePath}: ${receipt.violations.join(",")}`);
  return receipt;
}

interface ChengTypePlan {
  readonly imports: readonly string[];
  readonly definitions: string;
  readonly typeExpr: string;
  readonly seedExpr: string;
  readonly alternateExpr: string;
  readonly observeBody: string;
}

function typePlan(type: SemanticTypeName): ChengTypePlan {
  switch (type) {
    case "i32":
      return {imports: [], definitions: "type SemValue = int32", typeExpr: "SemValue", seedExpr: "11", alternateExpr: "17", observeBody: "return value"};
    case "i64":
      return {imports: [], definitions: "type SemValue = int64", typeExpr: "SemValue", seedExpr: "101", alternateExpr: "103", observeBody: "return int32(value)"};
    case "f64":
      return {imports: [], definitions: "type SemValue = float64", typeExpr: "SemValue", seedExpr: "1.5", alternateExpr: "2.5", observeBody: "return int32(value)"};
    case "bool":
      return {imports: [], definitions: "type SemValue = bool", typeExpr: "SemValue", seedExpr: "true", alternateExpr: "true", observeBody: "if value:\n    return 1\nreturn -1"};
    case "str":
      return {imports: [], definitions: "type SemValue = str", typeExpr: "SemValue", seedExpr: '"semantic-seed"', alternateExpr: '"semantic-alt"', observeBody: "return len(value)"};
    case "seq_i32":
      return {imports: [], definitions: "type SemValue = int32[]", typeExpr: "SemValue", seedExpr: "[11, 13]", alternateExpr: "[17, 19]", observeBody: "return len(value)"};
    case "seq_str":
      return {imports: [], definitions: "type SemValue = str[]", typeExpr: "SemValue", seedExpr: '["seed-a", "seed-b"]', alternateExpr: '["alt-a", "alt-b"]', observeBody: "return len(value)"};
    case "fixed_str":
      return {imports: [], definitions: "type SemValue = str[2]", typeExpr: "SemValue", seedExpr: '["fixed-a", "fixed-b"]', alternateExpr: '["fixed-c", "fixed-d"]', observeBody: "return len(value)"};
    case "object_str":
      return {
        imports: [],
        definitions: "type\n    TextBox =\n        value: str\n    SemValue = TextBox",
        typeExpr: "SemValue",
        seedExpr: 'TextBox(value: "object-seed")',
        alternateExpr: 'TextBox(value: "object-alt")',
        observeBody: "return len(value.value)",
      };
    case "managed_object_seq":
      return {
        imports: [],
        definitions: "type\n    TextBox =\n        value: str\n    SemValue = TextBox[]",
        typeExpr: "SemValue",
        seedExpr: '[TextBox(value: "object-seed-a"), TextBox(value: "object-seed-b")]',
        alternateExpr: '[TextBox(value: "object-alt-a"), TextBox(value: "object-alt-b")]',
        observeBody: "if len(value) > 0:\n    return len(value[0].value)\nreturn -1",
      };
    case "nested_inline_object_str":
      return {
        imports: [],
        definitions: "type\n    InnerText =\n        value: str\n    OuterText =\n        inner: InnerText\n    SemValue = OuterText",
        typeExpr: "SemValue",
        seedExpr: 'OuterText(inner: InnerText(value: "nested-seed"))',
        alternateExpr: 'OuterText(inner: InnerText(value: "nested-alt"))',
        observeBody: "return len(value.inner.value)",
      };
    case "result_str":
      return {
        imports: ["std/result"],
        definitions: "type SemValue = Result[str]",
        typeExpr: "SemValue",
        seedExpr: 'Ok[str]("result-seed")',
        alternateExpr: 'Ok[str]("result-alt")',
        observeBody: "if IsOk(value):\n    return len(Value(value))\nreturn -1",
      };
  }
}

function indent(text: string, spaces: number): string {
  const prefix = " ".repeat(spaces);
  return text.split("\n").map((line) => line.length === 0 ? line : `${prefix}${line}`).join("\n");
}

function modulePreamble(moduleName: string, imports: readonly string[]): string {
  const lines = [`module ${moduleName}`];
  for (const imported of [...new Set(imports)]) lines.push(`import ${imported}`);
  return `${lines.join("\n")}\n\n`;
}

function commonValueFunctions(plan: ChengTypePlan): string {
  return `${plan.definitions}\n\nfn SeedValue(): ${plan.typeExpr} =\n${indent(`return ${plan.seedExpr}`, 4)}\n\nfn AltValue(): ${plan.typeExpr} =\n${indent(`return ${plan.alternateExpr}`, 4)}\n\nfn ObserveValue(value: ${plan.typeExpr}): int32 =\n${indent(plan.observeBody, 4)}`;
}

interface MaterializationEnvironment {
  readonly imports: readonly string[];
  readonly prelude: string;
  readonly typeExpr: string;
  readonly seedCall: string;
  readonly altCall: string;
  readonly observeCall: (expression: string) => string;
  readonly callExpression: string | null;
  readonly supportFile: SourceFileDraft | null;
}

interface SourceFileDraft {
  readonly relativePath: string;
  readonly modulePath: string;
  readonly role: "entry" | "support";
  readonly source: string;
}

function callFixtureSource(baseCase: SemanticCase, plan: ChengTypePlan, exported: boolean): string {
  if (baseCase.dimensions.valueCategory !== "call") return "";
  const name = exported ? "CaseValue" : "CaseValue";
  const borrowed = baseCase.dimensions.ownership === "Borrowed";
  const target = borrowed
    ? `@borrow_result\nfn ${name}(value: var ${plan.typeExpr}): ${plan.typeExpr} =\n    return value`
    : `fn ${name}(selector: int32): ${plan.typeExpr} =\n    return SeedValue()`;
  if (baseCase.dimensions.overload !== "same_name_same_arity") return target;
  const distractor = borrowed
    ? `fn ${name}(selector: int32): ${plan.typeExpr} =\n    return AltValue()`
    : `fn ${name}(selector: bool): ${plan.typeExpr} =\n    return AltValue()`;
  return `${distractor}\n\n${target}`;
}

function materializationEnvironment(baseCase: SemanticCase, identitySuffix: string): MaterializationEnvironment {
  const plan = typePlan(baseCase.dimensions.type);
  const imported = baseCase.dimensions.valueCategory === "call" && baseCase.dimensions.moduleScope === "imported_module";
  if (imported) {
    const supportModule = `sempipesupport_${identitySuffix}`;
    const supportSource = `${modulePreamble(supportModule, plan.imports)}${commonValueFunctions(plan)}\n\n${callFixtureSource(baseCase, plan, true)}\n`;
    const supportFile: SourceFileDraft = {
      relativePath: `src/${supportModule}.cheng`,
      modulePath: supportModule,
      role: "support",
      source: supportSource,
    };
    const borrowed = baseCase.dimensions.ownership === "Borrowed";
    return {
      imports: [supportModule],
      prelude: "",
      typeExpr: `${supportModule}.SemValue`,
      seedCall: `${supportModule}.SeedValue()`,
      altCall: `${supportModule}.AltValue()`,
      observeCall: (expression) => `${supportModule}.ObserveValue(${expression})`,
      callExpression: borrowed ? `${supportModule}.CaseValue(source_value)` : `${supportModule}.CaseValue(23)`,
      supportFile,
    };
  }
  const fixture = callFixtureSource(baseCase, plan, false);
  const borrowed = baseCase.dimensions.ownership === "Borrowed";
  return {
    imports: plan.imports,
    prelude: `${commonValueFunctions(plan)}${fixture.length > 0 ? `\n\n${fixture}` : ""}`,
    typeExpr: plan.typeExpr,
    seedCall: "SeedValue()",
    altCall: "AltValue()",
    observeCall: (expression) => `ObserveValue(${expression})`,
    callExpression: baseCase.dimensions.valueCategory === "call" ? (borrowed ? "CaseValue(source_value)" : "CaseValue(23)") : null,
    supportFile: null,
  };
}

interface OriginPlan {
  readonly setup: string;
  readonly expression: string;
  readonly lvalue: string;
  readonly helper: string;
}

function originPlan(baseCase: SemanticCase, env: MaterializationEnvironment, globalSource: boolean): OriginPlan {
  const plan = typePlan(baseCase.dimensions.type);
  const prefix = globalSource ? "Global" : "source";
  const sourceValue = globalSource ? "GlobalSourceValue" : "source_value";
  const sourceBox = globalSource ? "GlobalSourceBox" : "source_box";
  const sourceBoxes = globalSource ? "GlobalSourceBoxes" : "source_boxes";
  const setup = globalSource
    ? `var GlobalSourceValue: ${env.typeExpr} = ${env.seedCall}\nvar GlobalSourceBox: SourceBox = SourceBox(value: ${env.seedCall})\nvar GlobalSourceBoxes: SourceBox[] = [SourceBox(value: ${env.seedCall}), SourceBox(value: ${env.altCall})]`
    : `var source_value: ${env.typeExpr} = ${env.seedCall}\nvar source_box: SourceBox = SourceBox(value: ${env.seedCall})\nvar source_boxes: SourceBox[] = [SourceBox(value: ${env.seedCall}), SourceBox(value: ${env.altCall})]`;
  void prefix;
  if (baseCase.dimensions.valueCategory === "literal") {
    return {setup, expression: plan.seedExpr, lvalue: sourceValue, helper: ""};
  }
  if (baseCase.dimensions.valueCategory === "ident") return {setup, expression: sourceValue, lvalue: sourceValue, helper: ""};
  if (baseCase.dimensions.valueCategory === "index") {
    const lvalue = `${sourceBoxes}[0].value`;
    return {setup, expression: lvalue, lvalue, helper: ""};
  }
  if (baseCase.dimensions.valueCategory === "field") {
    const lvalue = `${sourceBox}.value`;
    if (baseCase.dimensions.fieldPath === "ref_boundary_field") {
      const helper = `fn BoundaryRead(box: var SourceBox): ${env.typeExpr} =\n    return box.value\n\nfn BoundaryBorrow(box: var SourceBox): int32 =\n    return BorrowConsume(box.value)\n\nfn BoundarySelfAssign(box: var SourceBox) =\n    box.value = box.value`;
      return {setup, expression: `BoundaryRead(${sourceBox})`, lvalue, helper};
    }
    return {setup, expression: lvalue, lvalue, helper: ""};
  }
  if (env.callExpression === null) throw new Error("call semantic case lacks exact call fixture expression");
  return {setup, expression: env.callExpression, lvalue: sourceValue, helper: ""};
}

function wrapControlFlow(controlFlow: SemanticDimensions["controlFlow"], operation: string): string {
  if (controlFlow === "straight") return operation;
  if (controlFlow === "if_join") {
    return `if CaseGate(1):\n${indent(operation, 4)}\nelse:\n${indent(operation, 4)}`;
  }
  return `for case_step in 0..<2:\n${indent(operation, 4)}`;
}

function semanticIdentityConstants(caseId: string, grammar: ChengGrammarObligationContract, marker: string): string {
  return `const SemanticCaseIdentity: str = "${caseId}"\nconst SemanticGrammarRoot: str = "${grammar.obligationRootSha256}"\nconst SemanticMaterializerIdentity: str = "${CHENG_SOURCE_MATERIALIZER_BYTES_SHA256}"\nconst SemanticRuntimeMarker: str = "${marker}"`;
}

function baseSemanticMainSource(baseCase: SemanticCase, grammar: ChengGrammarObligationContract, env: MaterializationEnvironment, moduleName: string, marker: string): string {
  const globalSource = baseCase.dimensions.storage === "global" || baseCase.dimensions.alias === "self_alias";
  const origin = originPlan(baseCase, env, globalSource);
  const sourceBoxType = `type\n    SourceBox =\n        value: ${env.typeExpr}`;
  const globals: string[] = [];
  if (globalSource) globals.push(origin.setup);
  if (baseCase.dimensions.storage === "global") globals.push(`var GlobalTarget: ${env.typeExpr} = ${env.altCall}`);
  const localSetup = globalSource ? "" : origin.setup;
  const targetName = baseCase.dimensions.storage === "global" ? "GlobalTarget" : "target_value";
  const setupLines = [localSetup, baseCase.dimensions.storage === "local" ? `var target_value: ${env.typeExpr} = ${env.altCall}` : ""].filter((entry) => entry.length > 0).join("\n");
  let operation: string;
  let observed = targetName;
  if (baseCase.dimensions.alias === "self_alias") {
    if (baseCase.dimensions.valueCategory === "ident") operation = "GlobalTarget = GlobalTarget";
    else if (baseCase.dimensions.fieldPath === "ref_boundary_field") operation = "BoundarySelfAssign(GlobalSourceBox)";
    else if (baseCase.dimensions.valueCategory === "field") operation = "GlobalSourceBox.value = GlobalSourceBox.value";
    else operation = "GlobalSourceBoxes[0].value = GlobalSourceBoxes[0].value";
    observed = baseCase.dimensions.valueCategory === "ident" ? "GlobalTarget"
      : baseCase.dimensions.valueCategory === "field" ? "GlobalSourceBox.value" : "GlobalSourceBoxes[0].value";
  } else if (baseCase.dimensions.sourceSurface === "implicit_var_borrow") {
    operation = baseCase.dimensions.fieldPath === "ref_boundary_field" ? (globalSource ? "BoundaryBorrow(GlobalSourceBox)" : "BoundaryBorrow(source_box)") : `BorrowConsume(${origin.lvalue})`;
    observed = origin.lvalue;
  } else if (baseCase.dimensions.alias === "may_alias") {
    operation = `${targetName} = share(${origin.expression})\n${targetName} = ${origin.expression}`;
  } else {
    operation = `${targetName} = ${origin.expression}`;
  }
  const runBody = `${setupLines}${setupLines.length > 0 ? "\n" : ""}${wrapControlFlow(baseCase.dimensions.controlFlow, operation)}\nreturn ${env.observeCall(observed)}`;
  const helpers = [
    "fn CaseGate(value: int32): bool =\n    return value > 0",
    `fn BorrowConsume(value: var ${env.typeExpr}): int32 =\n    return 1`,
    origin.helper,
  ].filter((entry) => entry.length > 0).join("\n\n");
  return `${modulePreamble(moduleName, env.imports)}${semanticIdentityConstants(baseCase.caseId, grammar, marker)}\n\n${env.prelude}${env.prelude.length > 0 ? "\n\n" : ""}${sourceBoxType}\n\n${helpers}${globals.length > 0 ? `\n\n${globals.join("\n")}` : ""}\n\nfn RunSemanticCase(): int32 =\n${indent(runBody, 4)}\n\nfn main(): int32 =\n    let score: int32 = RunSemanticCase()\n    if score < 0:\n        return 1\n    echo(SemanticRuntimeMarker)\n    return 0\n\nmain()\n`;
}

export interface ChengSourceFile {
  readonly relativePath: string;
  readonly modulePath: string;
  readonly role: "entry" | "support";
  readonly source: string;
  readonly sourceSha256: string;
  readonly lint: ChengPublicSurfaceLintReceipt;
}

export interface ProfileAxisSourceWitness {
  readonly axis: PipelineProfileAxisName;
  readonly value: string;
  readonly templateId: string;
  readonly relativePath: string;
  readonly tokenStart: number;
  readonly tokenEnd: number;
  readonly renderedTokenSha256: string;
  readonly renderedTokenCount: number;
  readonly witnessSha256: string;
}

export interface ChengSemanticSourceBundle {
  readonly schema: typeof CHENG_SOURCE_BUNDLE_SCHEMA;
  readonly bundleKind: "m9023_base" | "m9024_profile";
  readonly caseId: string;
  readonly semanticCaseSha256: string;
  readonly profileCaseId: string | null;
  readonly profileCaseSha256: string | null;
  readonly grammarObligationRootSha256: string;
  readonly formalSpecSha256: string;
  readonly materializerBytesSha256: string;
  readonly entryModulePath: string;
  readonly expectedRuntimeMarker: string;
  readonly expectedRuntimeMarkerSha256: string;
  readonly sourceFiles: readonly ChengSourceFile[];
  readonly sourceRootSha256: string;
  readonly profileAxisSourceWitnesses: readonly ProfileAxisSourceWitness[];
  readonly sourceWitnessRootSha256: string;
  readonly manifestSha256: string;
  readonly bundleSha256: string;
}

function finalizedSourceFile(draft: SourceFileDraft): ChengSourceFile {
  const lint = requireLintPass(draft.source, draft.relativePath);
  return deepFreeze({...draft, sourceSha256: sha256(draft.source), lint});
}

function finalizeBundle(input: {
  readonly bundleKind: "m9023_base" | "m9024_profile";
  readonly baseCase: SemanticCase;
  readonly profileCase: PipelineProfileCase | null;
  readonly grammar: ChengGrammarObligationContract;
  readonly entryModulePath: string;
  readonly marker: string;
  readonly drafts: readonly SourceFileDraft[];
  readonly witnesses: readonly ProfileAxisSourceWitness[];
}): ChengSemanticSourceBundle {
  assertGrammarContractSelfConsistent(input.grammar);
  const sourceFiles = input.drafts.map(finalizedSourceFile).sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  if (sourceFiles.filter((entry) => entry.role === "entry").length !== 1) throw new Error("source bundle must contain exactly one entry module");
  const sourceRootSha256 = hashCanonical(sourceFiles.map((entry) => ({
    relativePath: entry.relativePath,
    modulePath: entry.modulePath,
    role: entry.role,
    sourceSha256: entry.sourceSha256,
    lintReceiptSha256: entry.lint.receiptSha256,
  })));
  const sourceWitnessRootSha256 = hashCanonical(input.witnesses);
  const manifestPayload = {
    schema: CHENG_SOURCE_BUNDLE_SCHEMA,
    bundleKind: input.bundleKind,
    caseId: input.baseCase.caseId,
    semanticCaseSha256: input.baseCase.semanticSha256,
    profileCaseId: input.profileCase?.profileCaseId ?? null,
    profileCaseSha256: input.profileCase?.profileCaseSha256 ?? null,
    grammarObligationRootSha256: input.grammar.obligationRootSha256,
    formalSpecSha256: input.grammar.formalSpecSha256,
    materializerBytesSha256: CHENG_SOURCE_MATERIALIZER_BYTES_SHA256,
    entryModulePath: input.entryModulePath,
    expectedRuntimeMarker: input.marker,
    expectedRuntimeMarkerSha256: sha256(input.marker),
    sourceRootSha256,
    sourceWitnessRootSha256,
  };
  const manifestSha256 = hashCanonical(manifestPayload);
  const payload = {
    ...manifestPayload,
    sourceFiles,
    profileAxisSourceWitnesses: input.witnesses,
    manifestSha256,
  };
  return deepFreeze({...payload, bundleSha256: hashCanonical(payload)}) as ChengSemanticSourceBundle;
}

export function buildBaseSemanticSourceBundle(
  baseCase: SemanticCase,
  grammar: ChengGrammarObligationContract,
): ChengSemanticSourceBundle {
  if (!validateSemanticCase(baseCase).legal) throw new Error(`cannot source-materialize illegal m9023 case ${baseCase.caseId}`);
  buildSemanticMaterializationRecipe(baseCase);
  const suffix = baseCase.caseId.slice(-16);
  const moduleName = `semcase_${suffix}`;
  const marker = `CHENG_SEMANTIC_OK_${suffix}`;
  const env = materializationEnvironment(baseCase, suffix);
  const mainSource = baseSemanticMainSource(baseCase, grammar, env, moduleName, marker);
  const drafts: SourceFileDraft[] = [{relativePath: `src/${moduleName}.cheng`, modulePath: moduleName, role: "entry", source: mainSource}];
  if (env.supportFile !== null) drafts.push(env.supportFile);
  return finalizeBundle({bundleKind: "m9023_base", baseCase, profileCase: null, grammar, entryModulePath: moduleName, marker, drafts, witnesses: []});
}

export function validateBaseSemanticSourceBundle(
  baseCase: SemanticCase,
  grammar: ChengGrammarObligationContract,
  bundle: ChengSemanticSourceBundle,
): Readonly<{sourceRootSha256: string; bundleSha256: string}> {
  const expected = buildBaseSemanticSourceBundle(baseCase, grammar);
  if (canonicalJson(expected) !== canonicalJson(bundle)) throw new Error("m9023 Cheng source bundle identity, lint, or hash mismatch");
  return deepFreeze({sourceRootSha256: bundle.sourceRootSha256, bundleSha256: bundle.bundleSha256});
}

function findTokenSpan(source: string, fragment: string): Readonly<{start: number; end: number; tokenSha256: string; tokenCount: number}> {
  const sourceTokens = chengPublicTokens(source);
  const fragmentTokens = chengPublicTokens(fragment);
  if (fragmentTokens.length === 0) throw new Error("profile axis source witness fragment has no Cheng tokens");
  outer: for (let start = 0; start <= sourceTokens.length - fragmentTokens.length; start += 1) {
    for (let offset = 0; offset < fragmentTokens.length; offset += 1) {
      if (sourceTokens[start + offset] !== fragmentTokens[offset]) continue outer;
    }
    return deepFreeze({
      start,
      end: start + fragmentTokens.length,
      tokenSha256: sha256(fragmentTokens.join("\u001f")),
      tokenCount: fragmentTokens.length,
    });
  }
  throw new Error(`profile axis witness fragment is absent from rendered Cheng source: ${fragment.slice(0, 120)}`);
}

function profileAxisWitness(
  axis: PipelineProfileAxisName,
  value: string,
  templateId: string,
  relativePath: string,
  source: string,
  fragment: string,
): ProfileAxisSourceWitness {
  const span = findTokenSpan(source, fragment);
  const payload = {
    axis,
    value,
    templateId,
    relativePath,
    tokenStart: span.start,
    tokenEnd: span.end,
    renderedTokenSha256: span.tokenSha256,
    renderedTokenCount: span.tokenCount,
  };
  return deepFreeze({...payload, witnessSha256: hashCanonical(payload)});
}

interface ProfileSourceFragments {
  readonly target: string;
  readonly useSite: string;
  readonly abi: string;
  readonly lifetime: string;
  readonly pressure: string;
  readonly completeBody: string;
}

function profileTargetSetup(profile: PipelineProfileDimensions, env: MaterializationEnvironment): Readonly<{setup: string; lvalue: string; witness: string}> {
  if (profile.targetPlace === "local") {
    const setup = `var profile_target_value: ${env.typeExpr} = ${env.altCall}`;
    return {setup, lvalue: "profile_target_value", witness: setup};
  }
  if (profile.targetPlace === "global") return {setup: "", lvalue: "ProfileGlobalTarget", witness: "ProfileGlobalTarget"};
  if (profile.targetPlace === "inline_field") {
    const setup = `var profile_target_box: ProfileTargetBox = ProfileTargetBox(value: ${env.altCall})`;
    return {setup, lvalue: "profile_target_box.value", witness: setup};
  }
  if (profile.targetPlace === "index") {
    const setup = `var profile_target_values: ${env.typeExpr}[] = [${env.altCall}]`;
    return {setup, lvalue: "profile_target_values[0]", witness: setup};
  }
  return {setup: "", lvalue: "profile_borrow_boundary", witness: "ProfileAbiBorrowBoundary"};
}

function renderProfileUseSite(
  profile: PipelineProfileDimensions,
  env: MaterializationEnvironment,
  origin: OriginPlan,
  targetLvalue: string,
): string {
  const value = origin.expression;
  switch (profile.useSite) {
    case "binding":
      return `let profile_bound_value: ${env.typeExpr} = ProfileAbiIdentity(${value})\nprofile_score = ${env.observeCall("profile_bound_value")}`;
    case "assign":
      return `${targetLvalue} = ProfileAbiIdentity(${value})\nprofile_score = ${env.observeCall(targetLvalue)}`;
    case "call_arg":
      return profile.targetPlace === "ref_boundary"
        ? `profile_score = ProfileAbiBorrowBoundary(${origin.lvalue})`
        : `profile_score = ProfileConsume(ProfileAbiIdentity(${value}))`;
    case "return":
      return `let profile_returned_value: ${env.typeExpr} = ProfileReturnValue(${value})\nprofile_score = ${env.observeCall("profile_returned_value")}`;
    case "condition":
      return `if ProfileAbiIdentity(${value}):\n    profile_score = 11\nelse:\n    profile_score = -1`;
    case "element":
      return `profile_target_values[0] = ProfileAbiIdentity(${value})\nprofile_score = ${env.observeCall("profile_target_values[0]")}`;
    case "field_init":
      return `let profile_initialized_box: ProfileTargetBox = ProfileTargetBox(value: ProfileAbiIdentity(${value}))\nprofile_score = ${env.observeCall("profile_initialized_box.value")}`;
  }
}

function profileAliasAndBorrowPrefix(baseCase: SemanticCase, env: MaterializationEnvironment, origin: OriginPlan, profile: PipelineProfileDimensions): string {
  const lines: string[] = [];
  if (baseCase.dimensions.alias === "self_alias") lines.push(`${origin.lvalue} = ${origin.lvalue}`);
  else if (baseCase.dimensions.alias === "may_alias") {
    lines.push(`var profile_alias_value: ${env.typeExpr} = share(${origin.expression})`);
    lines.push(`profile_score = ${env.observeCall("profile_alias_value")}`);
  }
  if (baseCase.dimensions.sourceSurface === "implicit_var_borrow"
      && !(profile.useSite === "call_arg" && profile.targetPlace === "ref_boundary")) {
    lines.push(`profile_score = ProfileAbiBorrowBoundary(${origin.lvalue})`);
  }
  return lines.join("\n");
}

function renderLifetime(lifetime: PipelineProfileDimensions["lifetime"], body: string): string {
  if (lifetime === "straight") return body;
  if (lifetime === "branch") return `if ProfileGate(profile_score):\n${indent(body, 4)}\nelse:\n${indent(body, 4)}`;
  if (lifetime === "loop") return `for profile_step in 0..<2:\n${indent(body, 4)}`;
  return `defer:\n    ProfileDeferred(profile_score)\n${body}`;
}

function pressureDeclarations(count: number): string {
  return Array.from({length: count}, (_, index) => `let pressure_live_${String(index).padStart(2, "0")}: int64 = ${101 + index * 2}`).join("\n");
}

function pressureSum(count: number): string {
  return Array.from({length: count}, (_, index) => `pressure_live_${String(index).padStart(2, "0")}`).join(" + ");
}

function renderPressure(pressure: PipelineProfileDimensions["regallocPressure"], body: string): string {
  if (pressure === "low") {
    return `let pressure_low_value: int64 = 11\n${body}\nprofile_score = profile_score + int32(pressure_low_value)`;
  }
  if (pressure === "call_live") {
    return `let pressure_call_a: int64 = 11\nlet pressure_call_b: int64 = 13\nlet pressure_call_c: int64 = 17\nlet pressure_call_d: int64 = 19\nlet pressure_call_result: int64 = ProfilePressureCall(pressure_call_a, pressure_call_b)\n${body}\nprofile_score = profile_score + int32(pressure_call_a + pressure_call_b + pressure_call_c + pressure_call_d + pressure_call_result)`;
  }
  if (pressure === "parallel_copy") {
    return `var pressure_copy_left: int64 = 11\nvar pressure_copy_right: int64 = 13\nif ProfileGate(profile_score):\n    let pressure_copy_prior: int64 = pressure_copy_left\n    pressure_copy_left = pressure_copy_right\n    pressure_copy_right = pressure_copy_prior\nelse:\n    let pressure_copy_prior: int64 = pressure_copy_right\n    pressure_copy_right = pressure_copy_left\n    pressure_copy_left = pressure_copy_prior\n${body}\nprofile_score = profile_score + int32(pressure_copy_left + pressure_copy_right)`;
  }
  if (pressure === "register_boundary" || pressure === "plus_one_spill") {
    const count = pressure === "register_boundary" ? CHENG_PIPELINE_REGISTER_BOUNDARY_LIVE_VALUES : CHENG_PIPELINE_PLUS_ONE_SPILL_LIVE_VALUES;
    return `${pressureDeclarations(count)}\n${body}\nprofile_score = profile_score + int32(${pressureSum(count)})`;
  }
  return `var pressure_escape_value: int64 = 11\nProfilePressureEscape(pressure_escape_value)\n${body}\nprofile_score = profile_score + int32(pressure_escape_value)`;
}

function renderProfileFragments(
  baseCase: SemanticCase,
  profile: PipelineProfileDimensions,
  env: MaterializationEnvironment,
  origin: OriginPlan,
): ProfileSourceFragments {
  const target = profileTargetSetup(profile, env);
  const useSite = renderProfileUseSite(profile, env, origin, target.lvalue);
  const prefix = profileAliasAndBorrowPrefix(baseCase, env, origin, profile);
  const semanticUse = `${prefix}${prefix.length > 0 ? "\n" : ""}${useSite}`;
  const lifetime = renderLifetime(profile.lifetime, semanticUse);
  const pressure = renderPressure(profile.regallocPressure, lifetime);
  const completeBody = `${target.setup}${target.setup.length > 0 ? "\n" : ""}${pressure}`;
  const abi = `fn ProfileAbiIdentity(value: ${env.typeExpr}): ${env.typeExpr} =\n    return value\n\nfn ProfileAbiBorrowBoundary(value: var ${env.typeExpr}): int32 =\n    return 1`;
  return {target: target.witness, useSite, abi, lifetime, pressure, completeBody};
}

function profileMainSource(
  baseCase: SemanticCase,
  profileCase: PipelineProfileCase,
  grammar: ChengGrammarObligationContract,
  env: MaterializationEnvironment,
  moduleName: string,
  marker: string,
): Readonly<{source: string; fragments: ProfileSourceFragments}> {
  const profile = profileCase.profile;
  const globalSource = baseCase.dimensions.storage === "global" || baseCase.dimensions.alias === "self_alias";
  const origin = originPlan(baseCase, env, globalSource);
  const fragments = renderProfileFragments(baseCase, profile, env, origin);
  const globals: string[] = [];
  if (globalSource) globals.push(origin.setup);
  if (profile.targetPlace === "global") globals.push(`var ProfileGlobalTarget: ${env.typeExpr} = ${env.altCall}`);
  const localSource = globalSource ? "" : origin.setup;
  const helpers = [
    fragments.abi,
    `fn ProfileConsume(value: ${env.typeExpr}): int32 =\n    return ${env.observeCall("value")}`,
    `fn ProfileReturnValue(value: ${env.typeExpr}): ${env.typeExpr} =\n    return ProfileAbiIdentity(value)`,
    "fn ProfileGate(value: int32): bool =\n    return value > 0",
    "fn ProfileDeferred(value: var int32) =\n    value = value + 1",
    "fn ProfilePressureCall(left: int64, right: int64): int64 =\n    return left + right",
    "fn ProfilePressureEscape(value: var int64) =\n    value = value + 1",
    `fn BorrowConsume(value: var ${env.typeExpr}): int32 =\n    return 1`,
    origin.helper,
  ].filter((entry) => entry.length > 0).join("\n\n");
  const profileBox = `type\n    SourceBox =\n        value: ${env.typeExpr}\n    ProfileTargetBox =\n        value: ${env.typeExpr}`;
  const controlledBody = wrapControlFlow(baseCase.dimensions.controlFlow, fragments.completeBody);
  const runBody = `${localSource}${localSource.length > 0 ? "\n" : ""}var profile_score: int32 = 1\n${controlledBody}\nreturn profile_score`;
  const identities = `${semanticIdentityConstants(baseCase.caseId, grammar, marker)}\nconst PipelineProfileIdentity: str = "${profileCase.profileCaseId}"`;
  const source = `${modulePreamble(moduleName, env.imports)}${identities}\n\n${env.prelude}${env.prelude.length > 0 ? "\n\n" : ""}${profileBox}\n\n${helpers}${globals.length > 0 ? `\n\n${globals.join("\n")}` : ""}\n\nfn RunPipelineProfile(): int32 =\n${indent(runBody, 4)}\n\nfn main(): int32 =\n    let score: int32 = RunPipelineProfile()\n    if score < 0:\n        return 1\n    echo(SemanticRuntimeMarker)\n    return 0\n\nmain()\n`;
  return {source, fragments};
}

export function buildPipelineProfileSourceBundle(
  profileCase: PipelineProfileCase,
  grammar: ChengGrammarObligationContract,
): ChengSemanticSourceBundle {
  const derivation = deriveCoverage();
  validateProfileCase(profileCase, derivation.bases, derivation.profiles);
  if (profileCase.expected !== "accept") throw new Error(`cannot source-materialize rejected profile case ${profileCase.profileCaseId}`);
  const baseCase = derivation.bases[profileCase.baseCaseOrdinal];
  if (baseCase === undefined) throw new Error("profile source base escaped bounded domain");
  const suffix = profileCase.profileCaseId.slice(-16);
  const moduleName = `sempipeline_${suffix}`;
  const marker = `CHENG_PIPELINE_OK_${suffix}`;
  const env = materializationEnvironment(baseCase, suffix);
  const rendered = profileMainSource(baseCase, profileCase, grammar, env, moduleName, marker);
  const relativePath = `src/${moduleName}.cheng`;
  const templateIds: Readonly<Record<PipelineProfileAxisName, string>> = {
    useSite: `use_site.${profileCase.profile.useSite}`,
    targetPlace: `target_place.${profileCase.profile.targetPlace}`,
    abiBoundary: `abi_boundary.${profileCase.profile.abiBoundary}`,
    lifetime: `lifetime.${profileCase.profile.lifetime}`,
    regallocPressure: `regalloc_pressure.${profileCase.profile.regallocPressure}`,
  };
  const fragmentByAxis: Readonly<Record<PipelineProfileAxisName, string>> = {
    useSite: rendered.fragments.useSite,
    targetPlace: rendered.fragments.target,
    abiBoundary: rendered.fragments.abi,
    lifetime: rendered.fragments.lifetime,
    regallocPressure: rendered.fragments.pressure,
  };
  const witnesses = CHENG_PIPELINE_PROFILE_AXIS_ORDER.map((axis) => profileAxisWitness(
    axis,
    profileCase.profile[axis],
    templateIds[axis],
    relativePath,
    rendered.source,
    fragmentByAxis[axis],
  ));
  const drafts: SourceFileDraft[] = [{relativePath, modulePath: moduleName, role: "entry", source: rendered.source}];
  if (env.supportFile !== null) drafts.push(env.supportFile);
  return finalizeBundle({bundleKind: "m9024_profile", baseCase, profileCase, grammar, entryModulePath: moduleName, marker, drafts, witnesses});
}

export function validatePipelineProfileSourceBundle(
  profileCase: PipelineProfileCase,
  grammar: ChengGrammarObligationContract,
  bundle: ChengSemanticSourceBundle,
): Readonly<{sourceRootSha256: string; sourceWitnessRootSha256: string; bundleSha256: string}> {
  const expected = buildPipelineProfileSourceBundle(profileCase, grammar);
  if (canonicalJson(expected) !== canonicalJson(bundle)) throw new Error("pipeline profile Cheng source bundle identity, lint, span, or hash mismatch");
  return deepFreeze({sourceRootSha256: bundle.sourceRootSha256, sourceWitnessRootSha256: bundle.sourceWitnessRootSha256, bundleSha256: bundle.bundleSha256});
}

export interface GrammarParserCanonicalToken {
  readonly index: number;
  readonly kind: number;
  readonly kindText: string;
  readonly sourceTextId: number;
  readonly startByte: number;
  readonly endByte: number;
}

export function grammarParserCanonicalTokenSpanSha256(
  source: string,
  spanStartByte: number,
  spanEndByte: number,
  tokens: readonly GrammarParserCanonicalToken[],
): string {
  const sourceBytes = Buffer.from(source, "utf8");
  if (!Number.isInteger(spanStartByte) ||
      !Number.isInteger(spanEndByte) ||
      spanStartByte < 0 ||
      spanEndByte <= spanStartByte ||
      spanEndByte > sourceBytes.length ||
      tokens.length === 0) {
    throw new Error("grammar parser canonical token span invalid");
  }
  const canonicalRows: Array<GrammarParserCanonicalToken & {
    readonly rawBytesBase64: string;
  }> = [];
  let previousIndex = -1;
  let previousEnd = -1;
  for (const token of tokens) {
    if (canonicalJson(Object.keys(token).sort()) !== canonicalJson([
      "endByte",
      "index",
      "kind",
      "kindText",
      "sourceTextId",
      "startByte",
    ]) ||
        !Number.isInteger(token.index) ||
        token.index < 0 ||
        (previousIndex >= 0 && token.index !== previousIndex + 1) ||
        !Number.isInteger(token.kind) ||
        token.kind <= 0 ||
        !/^ParserValueToken[A-Za-z0-9_]+$/.test(token.kindText) ||
        token.sourceTextId !== 0 ||
        !Number.isInteger(token.startByte) ||
        !Number.isInteger(token.endByte) ||
        token.startByte < spanStartByte ||
        token.endByte <= token.startByte ||
        token.endByte > spanEndByte ||
        (previousEnd >= 0 && token.startByte < previousEnd)) {
      throw new Error("grammar parser canonical token row invalid");
    }
    const rawBytes = sourceBytes.subarray(token.startByte, token.endByte);
    const rawText = rawBytes.toString("utf8");
    if ((rawText.startsWith('"') &&
         token.kindText !== "ParserValueTokenString") ||
        (rawText.startsWith("'") &&
         token.kindText !== "ParserValueTokenChar") ||
        (rawText.startsWith('Fmt"') &&
         token.kindText !== "ParserValueTokenFmtString")) {
      throw new Error("grammar parser literal token kind invalid");
    }
    canonicalRows.push({
      ...token,
      rawBytesBase64: rawBytes.toString("base64"),
    });
    previousIndex = token.index;
    previousEnd = token.endByte;
  }
  if (tokens[0]!.startByte !== spanStartByte ||
      tokens[tokens.length - 1]!.endByte !== spanEndByte) {
    throw new Error("grammar parser canonical token boundary mismatch");
  }
  return sha256(canonicalJson({
    spanStartByte,
    spanEndByte,
    rawSpanBase64: sourceBytes
      .subarray(spanStartByte, spanEndByte)
      .toString("base64"),
    tokens: canonicalRows,
  }));
}

export interface GrammarParserSpanReceipt {
  readonly schema: typeof CHENG_GRAMMAR_PARSER_SPAN_RECEIPT_SCHEMA;
  readonly stage: "parser";
  readonly obligationId: string;
  readonly production: string;
  readonly kind: GrammarObligationKind;
  readonly structuralPath: string;
  readonly variant: string;
  readonly bound: number | null;
  readonly relativePath: string;
  readonly sourceSha256: string;
  readonly tokenStart: number;
  readonly tokenEnd: number;
  readonly spanStartByte: number;
  readonly spanEndByte: number;
  readonly canonicalTokens: readonly GrammarParserCanonicalToken[];
  readonly tokenSha256: string;
  readonly parserNodeKind: string;
  readonly parserNodeIdentitySha256: string;
  readonly parserTraceRootSha256: string;
  readonly driverBytesSha256: string;
  readonly toolchainManifestSha256: string;
  readonly receiptSha256: string;
}

export interface GrammarSourceWitness {
  readonly obligationId: string;
  readonly relativePath: string;
  readonly sourceSha256: string;
  readonly tokenStart: number;
  readonly tokenEnd: number;
  readonly tokenSha256: string;
  readonly parserSpanReceipt: GrammarParserSpanReceipt;
  readonly witnessSha256: string;
}

export interface GrammarSourceCoverageReceipt {
  readonly schema: typeof CHENG_GRAMMAR_SOURCE_COVERAGE_SCHEMA;
  readonly grammarObligationRootSha256: string;
  readonly requiredCount: number;
  readonly witnessedRequiredCount: number;
  readonly missingRequiredCount: number;
  readonly excludedCount: number;
  readonly missingObligationIds: readonly string[];
  readonly excludedProofs: readonly Readonly<{obligationId: string; reasonCode: string; bound: number | null}>[];
  readonly witnesses: readonly GrammarSourceWitness[];
  readonly parserEvidenceRootSha256: string;
  readonly status: "green" | "red_required_source_witnesses_missing";
  readonly receiptSha256: string;
}

export function buildGrammarSourceCoverageReceipt(
  grammar: ChengGrammarObligationContract,
  witnessesInput: readonly GrammarSourceWitness[],
  sourceFiles: readonly Readonly<{relativePath: string; source: string}>[] = [],
): GrammarSourceCoverageReceipt {
  assertGrammarContractSelfConsistent(grammar);
  const required = new Set(grammar.obligations.filter((entry) => entry.disposition === "required").map((entry) => entry.obligationId));
  const witnesses = [...witnessesInput].sort((left, right) => left.obligationId.localeCompare(right.obligationId));
  const sourceByPath = new Map(sourceFiles.map((entry) => [entry.relativePath, entry.source]));
  const obligationById = new Map(grammar.obligations.map((entry) => [entry.obligationId, entry]));
  const seen = new Set<string>();
  for (const witness of witnesses) {
    if (!required.has(witness.obligationId)) throw new Error(`grammar witness does not bind a required obligation: ${witness.obligationId}`);
    if (seen.has(witness.obligationId)) throw new Error(`duplicate grammar source witness: ${witness.obligationId}`);
    if (!/^[0-9a-f]{64}$/.test(witness.sourceSha256) || witness.tokenStart < 0 || witness.tokenEnd <= witness.tokenStart) {
      throw new Error(`invalid grammar source witness span: ${witness.obligationId}`);
    }
    const source = sourceByPath.get(witness.relativePath);
    if (source === undefined || sha256(source) !== witness.sourceSha256) throw new Error(`grammar witness source bytes are missing or changed: ${witness.obligationId}`);
    const parserReceipt = witness.parserSpanReceipt;
    if (parserReceipt === undefined || parserReceipt === null) {
      throw new Error(`grammar parser span receipt missing: ${witness.obligationId}`);
    }
    let tokenSha256: string;
    try {
      tokenSha256 = grammarParserCanonicalTokenSpanSha256(
        source,
        parserReceipt.spanStartByte,
        parserReceipt.spanEndByte,
        parserReceipt.canonicalTokens,
      );
    } catch {
      throw new Error(`grammar witness canonical parser token span invalid: ${witness.obligationId}`);
    }
    if (parserReceipt.canonicalTokens[0]!.index !== witness.tokenStart ||
        parserReceipt.canonicalTokens[
          parserReceipt.canonicalTokens.length - 1
        ]!.index + 1 !== witness.tokenEnd) {
      throw new Error(`grammar witness token indexes changed: ${witness.obligationId}`);
    }
    if (tokenSha256 !== witness.tokenSha256) throw new Error(`grammar witness token bytes changed: ${witness.obligationId}`);
    const obligation = obligationById.get(witness.obligationId);
    if (obligation === undefined) throw new Error(`grammar witness obligation escaped contract: ${witness.obligationId}`);
    const {receiptSha256: parserReceiptSha256, ...parserReceiptIdentity} = parserReceipt;
    if (parserReceipt.schema !== CHENG_GRAMMAR_PARSER_SPAN_RECEIPT_SCHEMA ||
        parserReceipt.stage !== "parser" ||
        parserReceiptSha256 !== hashCanonical(parserReceiptIdentity)) {
      throw new Error(`grammar parser span receipt identity mismatch: ${witness.obligationId}`);
    }
    if (parserReceipt.obligationId !== obligation.obligationId ||
        parserReceipt.production !== obligation.production ||
        parserReceipt.kind !== obligation.kind ||
        parserReceipt.structuralPath !== obligation.structuralPath ||
        parserReceipt.variant !== obligation.variant ||
        parserReceipt.bound !== obligation.bound) {
      throw new Error(`grammar parser span receipt obligation binding mismatch: ${witness.obligationId}`);
    }
    if (parserReceipt.relativePath !== witness.relativePath ||
        parserReceipt.sourceSha256 !== witness.sourceSha256 ||
        parserReceipt.tokenStart !== witness.tokenStart ||
        parserReceipt.tokenEnd !== witness.tokenEnd ||
        parserReceipt.tokenSha256 !== witness.tokenSha256) {
      throw new Error(`grammar parser span receipt source binding mismatch: ${witness.obligationId}`);
    }
    if (parserReceipt.parserNodeKind.length === 0 ||
        !/^[0-9a-f]{64}$/.test(parserReceipt.parserNodeIdentitySha256) ||
        !/^[0-9a-f]{64}$/.test(parserReceipt.parserTraceRootSha256) ||
        !/^[0-9a-f]{64}$/.test(parserReceipt.driverBytesSha256) ||
        !/^[0-9a-f]{64}$/.test(parserReceipt.toolchainManifestSha256)) {
      throw new Error(`grammar parser span receipt provenance missing: ${witness.obligationId}`);
    }
    const {witnessSha256, ...identity} = witness;
    if (witnessSha256 !== hashCanonical(identity)) throw new Error(`grammar source witness hash mismatch: ${witness.obligationId}`);
    seen.add(witness.obligationId);
  }
  const missingObligationIds = [...required].filter((id) => !seen.has(id)).sort();
  const excludedProofs = grammar.obligations
    .filter((entry) => entry.disposition === "excluded")
    .map((entry) => ({obligationId: entry.obligationId, reasonCode: entry.reasonCode, bound: entry.bound}))
    .sort((left, right) => left.obligationId.localeCompare(right.obligationId));
  const payload = {
    schema: CHENG_GRAMMAR_SOURCE_COVERAGE_SCHEMA as typeof CHENG_GRAMMAR_SOURCE_COVERAGE_SCHEMA,
    grammarObligationRootSha256: grammar.obligationRootSha256,
    requiredCount: grammar.requiredCount,
    witnessedRequiredCount: seen.size,
    missingRequiredCount: missingObligationIds.length,
    excludedCount: grammar.excludedCount,
    missingObligationIds,
    excludedProofs,
    witnesses,
    parserEvidenceRootSha256: hashCanonical(witnesses.map((entry) => ({
      obligationId: entry.obligationId,
      parserSpanReceiptSha256: entry.parserSpanReceipt.receiptSha256,
    }))),
    status: missingObligationIds.length === 0 ? "green" as const : "red_required_source_witnesses_missing" as const,
  };
  return deepFreeze({...payload, receiptSha256: hashCanonical(payload)});
}

export function requireGrammarSourceClosure(receipt: GrammarSourceCoverageReceipt): void {
  const {receiptSha256, ...payload} = receipt;
  if (receipt.schema !== CHENG_GRAMMAR_SOURCE_COVERAGE_SCHEMA) throw new Error("grammar source coverage schema mismatch");
  if (receiptSha256 !== hashCanonical(payload)) throw new Error("grammar source coverage receipt hash mismatch");
  if (receipt.status !== "green" || receipt.missingRequiredCount !== 0) {
    throw new Error(`GRAMMAR_SOURCE_WITNESSES_REQUIRED: ${receipt.missingRequiredCount} formal EBNF obligations have no source span`);
  }
}

export type SourceBundleMutation =
  | "source_bytes_replace"
  | "case_binding_swap"
  | "materializer_binding_swap"
  | "grammar_root_swap"
  | "axis_span_drop";

function mutableJsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

interface MutableSourceBundle {
  bundleKind: string;
  caseId: string;
  materializerBytesSha256: string;
  grammarObligationRootSha256: string;
  sourceFiles: Array<{source: string}>;
  profileAxisSourceWitnesses: Array<{tokenEnd: number}>;
}

export function mutateSourceBundle(bundle: ChengSemanticSourceBundle, mutation: SourceBundleMutation): ChengSemanticSourceBundle {
  const mutated = mutableJsonClone(bundle) as unknown as MutableSourceBundle;
  if (mutation === "source_bytes_replace") {
    const file = mutated.sourceFiles[0];
    if (file === undefined) throw new Error("source mutation requires a source file");
    file.source = `${file.source}\nconst MutatedSourceBytes: str = "mutation"\n`;
  } else if (mutation === "case_binding_swap") mutated.caseId = `sem.${"0".repeat(64)}`;
  else if (mutation === "materializer_binding_swap") mutated.materializerBytesSha256 = "0".repeat(64);
  else if (mutation === "grammar_root_swap") mutated.grammarObligationRootSha256 = "0".repeat(64);
  else {
    const witness = mutated.profileAxisSourceWitnesses[0];
    if (witness === undefined) throw new Error("axis span mutation requires a profile source bundle");
    witness.tokenEnd = 0;
  }
  return deepFreeze(mutated as unknown as ChengSemanticSourceBundle);
}

export interface PipelineDeltaReduction {
  readonly schema: "cheng_pipeline_delta_reduction";
  readonly originalCaseIds: readonly string[];
  readonly reducedCaseIds: readonly string[];
  readonly predicateCalls: number;
  readonly semanticLegalityPreserved: true;
  readonly failurePredicatePreserved: true;
  readonly reducedCases: readonly PipelineProfileCase[];
  readonly receiptSha256: string;
}

export async function deltaReduceFailingPipelineCases(
  cases: readonly PipelineProfileCase[],
  failurePredicate: (candidate: readonly PipelineProfileCase[]) => boolean | Promise<boolean>,
): Promise<PipelineDeltaReduction> {
  if (cases.length === 0) throw new Error("pipeline delta reduction requires non-empty cases");
  const derivation = deriveCoverage();
  for (const testCase of cases) {
    validateProfileCase(testCase, derivation.bases, derivation.profiles);
    if (testCase.expected !== "accept") throw new Error("pipeline delta reduction accepts only legal acceptance cases");
  }
  let current = [...new Map(cases.map((entry) => [entry.profileCaseId, entry])).values()];
  let predicateCalls = 1;
  if (!(await failurePredicate(current))) throw new Error("pipeline delta reduction initial set does not preserve failure");
  let granularity = 2;
  while (current.length >= 2) {
    const chunkSize = Math.ceil(current.length / granularity);
    let reduced = false;
    for (let start = 0; start < current.length; start += chunkSize) {
      const candidate = current.slice(0, start).concat(current.slice(start + chunkSize));
      if (candidate.length === 0) continue;
      predicateCalls += 1;
      if (await failurePredicate(candidate)) {
        current = candidate;
        granularity = Math.max(2, granularity - 1);
        reduced = true;
        break;
      }
    }
    if (reduced) continue;
    if (granularity >= current.length) break;
    granularity = Math.min(current.length, granularity * 2);
  }
  predicateCalls += 1;
  if (!(await failurePredicate(current))) throw new Error("pipeline delta reduction lost failure predicate");
  const payload = {
    schema: "cheng_pipeline_delta_reduction" as const,
    originalCaseIds: cases.map((entry) => entry.profileCaseId),
    reducedCaseIds: current.map((entry) => entry.profileCaseId),
    predicateCalls,
    semanticLegalityPreserved: true as const,
    failurePredicatePreserved: true as const,
  };
  return deepFreeze({...payload, reducedCases: current, receiptSha256: hashCanonical(payload)});
}

export const CHENG_REAL_PIPELINE_RECEIPT_PROTOCOL = deepFreeze({
  schema: "cheng_real_source_bound_seven_stage_protocol",
  receiptSchema: "cheng.compiler.execution_stage_bundle",
  kind: CHENG_SEMANTIC_PIPELINE_RUNNER_KIND,
  implemented: false,
  requiredStages: ["typed_expr", "csg", "lowering", "primary", "primary_regalloc", "backend2", "backend2_regalloc"],
  sourceBindings: [
    "case_id",
    "source_bundle_raw32",
    "materializer_bytes_raw32",
    "grammar_obligation_root_raw32",
    "compiler_source_closure_raw32",
    "driver_bytes_raw32",
    "toolchain_manifest_raw32",
    "command_manifest_raw32",
    "target_triple",
  ],
  requiredObservedFacts: ["int32_node_decl_value_def_identity", "expr_class", "owner_type_layout_offsets", "body_ir_use_def_alias", "emission_bytes", "regalloc_plan_actions_fragments_ingress_roots"],
  requiredMutations: [
    "ownership_flip", "declaration_rebind", "layout_offset_change", "codec_cid_field_drop", "cache_stale_hit", "stage_drop",
    "alias_write", "address_escape", "regalloc_action_change", "regalloc_fragment_change", "regalloc_ingress_change",
    "both_backends_same_wrong", "driver_replace", "toolchain_replace", "source_replace",
  ],
});

export class RealPipelineReceiptUnavailableError extends Error {
  readonly code = "REAL_PIPELINE_RUNNER_REQUIRED";

  constructor() {
    super("REAL_PIPELINE_RUNNER_REQUIRED: compiler-owned source-bound TypedExpr, CSG/lowering, primary/backend2, and both regalloc structured receipts are unavailable");
    this.name = "RealPipelineReceiptUnavailableError";
  }
}

export async function executePipelineMatrix(
  matrix: PipelineMatrix,
  grammarReceipt: GrammarSourceCoverageReceipt,
  _runner: unknown = null,
): Promise<never> {
  validatePipelineMatrix(matrix);
  requireGrammarSourceClosure(grammarReceipt);
  throw new RealPipelineReceiptUnavailableError();
}

export async function executeSourceBoundSevenStageRunner(
  matrix: PipelineMatrix,
  _runner: unknown = null,
): Promise<never> {
  validatePipelineMatrix(matrix);
  throw new RealPipelineReceiptUnavailableError();
}
