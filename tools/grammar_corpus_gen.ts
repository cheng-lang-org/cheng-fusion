#!/usr/bin/env bun
// grammar_corpus_gen.ts — 966 parser receipt 消费半套之有界语料生成器。
//
// 框架沿袭 tools/semantic_gen.py 的 family×seed 形态(确定性生成、每条目带合同、
// 矩阵式 manifest、--check 自检); 此处 family=production shape, seed=variant。
// 改用 TS 是因为语料必须与 m9024 obligation 合同逐条 join(obligationId)。
//
// 输入(只读):
//   TREE/docs/cheng-formal-spec.md  → buildChengGrammarObligationContract(m9024)
//   fixtures/semantic/ebnf_parser_node_map.json → covered 集(MAPPED+PARTIAL 85)与 mapStatus
// 输出(确定性, 无时间戳/无 RNG):
//   fixtures/semantic/grammar_corpus/<shape>.cheng  最小真实 Cheng 源(过 lintChengPublicSource)
//   fixtures/semantic/grammar_corpus/corpus.json    manifest: 每条 source 的 claims
//     (obligationId/production/kind/structuralPath/variant/bound/mapStatus) + blocked 清单
//     + 按 obligation 类(production/choice/optional/repetition/recursion)的命中 production 集
// 完备性硬门: covered 85 production 的全部 required obligation 必须各有一条 claim,
//   否则除非在 BLOCKED 表(带仲裁 disposition: no-pointer 门禁排除 / 表面不可写); 不满足即非零退出。
//
// 用法: bun tools/grammar_corpus_gen.ts [--check]
//   默认写出文件; --check 只在内存重建并与磁盘逐字节比对。
import {readFileSync, writeFileSync, mkdirSync, existsSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {
  buildChengGrammarObligationContract,
  lintChengPublicSource,
  type ChengGrammarObligation,
} from "../src/cheng_semantic_pipeline_matrix_m9024.ts";
import {sha256} from "../src/cheng_semantic_matrix_m9023.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = process.env.CHENG_FORMAL_SPEC_PATH ?? "/Users/lbcheng/cheng-lang/docs/cheng-formal-spec.md";
const MAP_PATH = resolve(HERE, "../fixtures/semantic/ebnf_parser_node_map.json");
const OUT_DIR = resolve(HERE, "../fixtures/semantic/grammar_corpus");
const CORPUS_SCHEMA = "cheng_grammar_witness_corpus.v1";

// ---------------------------------------------------------------- EBNF walk
// 与 m9024 tokenizeEbnf/parseEbnfExpression/walk 同逻辑(逐 obligation fragmentSha256
// 校验过 596/596 一致, 见 diag_s1_corpus/REPORT.md); 这里额外保留 fragment 文本供
// plan 精确选择。
type GNodeKind = "atom" | "sequence" | "choice" | "optional" | "repetition" | "group";
interface GNode {readonly kind: GNodeKind; readonly text: string; readonly children: GNode[]}

function tokenizeEbnf(source: string): {text: string; structural: boolean}[] {
  const tokens: {text: string; structural: boolean}[] = [];
  let index = 0;
  while (index < source.length) {
    const ch = source[index]!;
    if (/\s/.test(ch)) {index += 1; continue;}
    if (ch === '"' || ch === "'" || ch === "`") {
      let end = index + 1;
      while (end < source.length) {
        const current = source[end]!;
        if (current === "\\") {end += 2; continue;}
        end += 1;
        if (current === ch) break;
      }
      tokens.push({text: source.slice(index, end), structural: false});
      index = end;
      continue;
    }
    if ("()[]{}|".includes(ch)) {tokens.push({text: ch, structural: true}); index += 1; continue;}
    let end = index + 1;
    while (end < source.length) {
      const current = source[end]!;
      if (/\s/.test(current) || "()[]{}|\"'`".includes(current)) break;
      end += 1;
    }
    tokens.push({text: source.slice(index, end), structural: false});
    index = end;
  }
  return tokens;
}

function parseEbnfExpression(rhs: string): GNode {
  const tokens = tokenizeEbnf(rhs);
  let cursor = 0;
  function parseChoice(stop: string | null): GNode {
    const alternatives: GNode[] = [];
    let sequence: GNode[] = [];
    while (cursor < tokens.length) {
      const token = tokens[cursor]!;
      if (stop !== null && token.structural && token.text === stop) break;
      if (token.structural && token.text === "|") {
        alternatives.push({kind: "sequence", text: "", children: sequence});
        sequence = [];
        cursor += 1;
        continue;
      }
      if (token.structural && "[({".includes(token.text)) {
        const close = token.text === "[" ? "]" : token.text === "{" ? "}" : ")";
        const kind: GNodeKind = token.text === "[" ? "optional" : token.text === "{" ? "repetition" : "group";
        cursor += 1;
        const nested = parseChoice(close);
        const actualClose = tokens[cursor];
        if (actualClose === undefined || !actualClose.structural || actualClose.text !== close) {
          throw new Error(`unclosed EBNF ${token.text}`);
        }
        cursor += 1;
        sequence.push({kind, text: "", children: [nested]});
        continue;
      }
      if (token.structural && "])}".includes(token.text)) throw new Error(`unexpected EBNF delimiter ${token.text}`);
      sequence.push({kind: "atom", text: token.text, children: []});
      cursor += 1;
    }
    alternatives.push({kind: "sequence", text: "", children: sequence});
    return alternatives.length === 1 ? alternatives[0]! : {kind: "choice", text: "", children: alternatives};
  }
  const root = parseChoice(null);
  if (cursor !== tokens.length) throw new Error("EBNF parser did not consume the complete expression");
  return root;
}

function normalizedFragment(node: GNode): string {
  if (node.kind === "atom") return node.text;
  return `${node.kind}(${node.children.map(normalizedFragment).join(",")})`;
}

interface StructuralNode {
  readonly kind: "choice" | "optional" | "repetition";
  readonly structuralPath: string;
  readonly fragment: string;
  readonly armFragments: readonly string[];
}

function enumerateStructuralNodes(rhs: string): StructuralNode[] {
  const ast = parseEbnfExpression(rhs);
  const out: StructuralNode[] = [];
  function walk(node: GNode, path: string): void {
    if (node.kind === "choice") {
      out.push({kind: "choice", structuralPath: path, fragment: normalizedFragment(node),
        armFragments: node.children.map(normalizedFragment)});
    } else if (node.kind === "optional" || node.kind === "repetition") {
      out.push({kind: node.kind, structuralPath: path, fragment: normalizedFragment(node), armFragments: []});
    }
    node.children.forEach((child, index) => walk(child, `${path}.${node.kind}${index}`));
  }
  walk(ast, "root");
  return out;
}

function parseProductions(ebnf: string): {name: string; rhs: string}[] {
  const productions: {name: string; rhs: string}[] = [];
  let pending = "";
  for (const line of ebnf.split("\n")) {
    if (pending.length === 0 && !/^[A-Za-z_][A-Za-z0-9_]*\s*::=/.test(line)) continue;
    pending += `${pending.length > 0 ? "\n" : ""}${line}`;
    if (!/;\s*(?:\/\*.*\*\/)?\s*$/.test(line)) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*::=\s*([\s\S]*?)\s*;\s*(?:\/\*[\s\S]*?\*\/)?\s*$/.exec(pending);
    if (match === null) throw new Error(`malformed EBNF production: ${pending}`);
    productions.push({name: match[1]!, rhs: match[2]!.trim()});
    pending = "";
  }
  return productions;
}

function extractEbnfBlock(spec: string): string {
  const matches = [...spec.matchAll(/```ebnf\s*\n([\s\S]*?)\n```/g)];
  if (matches.length !== 1) throw new Error(`expected exactly one ebnf fence, got ${matches.length}`);
  return matches[0]![1]!;
}

// ---------------------------------------------------------------- 语料源
// 每个 id 一个最小 Cheng 模块; 全部过 lintChengPublicSource(生成期硬门)。
const L = (...lines: string[]) => lines.join("\n") + "\n";

const SOURCES: Record<string, {note: string; code: string; evidence?: {has?: Record<string, number>; lacks?: string[]}}> = {
  mod_min: {
    note: "最小模块: 1 个 fn decl, 无 header/import/空行",
    code: L(
      "fn main(): int32 =",
      "    return 0",
    ),
    evidence: {has: {"fn": 1, "return": 1}, lacks: ["module", "import"]},
  },
  mod_hdr0: {
    note: "module 头 + 1 import + 1 decl, 全无空行(嵌套 NEWLINE 全 zero)",
    code: L(
      "module m",
      "import a",
      "fn f(): int32 =",
      "    return 1",
    ),
    evidence: {has: {"module": 1, "import": 1}, lacks: []},
  },
  mod_mid: {
    note: "每个 module 重复恰好 1 次(前导空行/header 后空行/import/decl/尾随空行)",
    code: L(
      "",
      "module m",
      "",
      "import a",
      "",
      "fn f(): int32 =",
      "    return 1",
      "",
    ),
    evidence: {has: {"module": 1, "import": 1, "fn": 1}},
  },
  mod_full: {
    note: "每个 module 重复 8 次 + importDecl/modulePath 全部 variant",
    code: L(
      "", "", "", "", "", "", "", "",
      "module m",
      "", "", "", "", "", "", "", "",
      "import a",
      "import b/c",
      "import d/e/f/g/h/i/j/k/l",
      "import e as x",
      "import f/[g]",
      "import h/[i, j]",
      "import k/[l, m, n, o, p, q, r, s, t]",
      "import n",
      "", "", "", "", "", "", "", "",
      "fn f1(): int32 =",
      "    return 1",
      "fn f2(): int32 =",
      "    return 2",
      "fn f3(): int32 =",
      "    return 3",
      "fn f4(): int32 =",
      "    return 4",
      "fn f5(): int32 =",
      "    return 5",
      "fn f6(): int32 =",
      "    return 6",
      "fn f7(): int32 =",
      "    return 7",
      "fn f8(): int32 =",
      "    return 8",
      "", "", "", "", "", "", "", "",
    ),
    evidence: {has: {"module": 1, "import": 8, "fn": 8, "as": 1}},
  },
  bind: {
    note: "storage/bindingDecl/bindingEntry 全 variant + 顶层 exprDecl + concept 外形 bindingEntry 裸 var",
    code: L(
      "let a = 1",
      "var b: int32",
      "const c: int32 = 2",
      "var p",
      "41 + 1",
      "let",
      "    d = 3",
      "    e = 4",
      "const",
      "    o = 12",
      "var",
      "    f: int32 = 5",
      "    g = 6",
      "    h: int32",
      "    i = 7",
      "    j: int32 = 8",
      "    k = 9",
      "    l: int32",
      "    m = 10",
      "    n = 11",
      "fn main(): int32 =",
      "    return 0",
    ),
    evidence: {has: {"let": 2, "var": 3, "const": 2}},
  },
  anno: {
    note: "annotations 重复 0/1/8 + annotation 参数 absent/present",
    code: L(
      "@inline",
      "fn f1(): int32 =",
      "    return 1",
      "@a",
      "@b",
      "@c",
      "@d",
      "@e",
      "@f",
      "@g",
      "@h",
      "fn f2(): int32 =",
      "    return 2",
      "@deprecated(\"x\")",
      "fn f3(): int32 =",
      "    return 3",
      "fn main(): int32 =",
      "    return 0",
    ),
    evidence: {has: {"@inline": 1, "@deprecated": 1, "@a": 1, "@h": 1}},
  },
  fn: {
    note: "fnDecl 单行形 + routineHead/paramList/param 全 variant",
    code: L(
      "fn f0() = 1",
      "fn f1(): int32 = 1",
      "fn f2[T](x: T): T = x",
      "fn f3(x: int32): int32 where x > 0 = x",
      "async fn f4(): int32 = 1",
      "fn f5(a: int32, b: int32, c: int32, d: int32, e: int32, f: int32, g: int32, h: int32, i: int32, j: int32): int32 = a",
      "fn f6(a: int32; b: int32): int32 = a",
      "fn f7(a = 1): int32 = a",
      "fn f8(a: int32 = 1): int32 = a",
      "fn v(): int32 =",
      "    return",
      "fn main(): int32 =",
      "    return 0",
    ),
    evidence: {has: {"async": 1, "where": 1, "fn": 11, "return": 2}, lacks: []},
  },
  fnblock: {
    note: "fnDecl 块形 + fnEntry 全 variant(async/fn 关键字)",
    code: L(
      "fn",
      "    g1(): int32 =",
      "        return 1",
      "    g2(): int32 =",
      "        return 2",
      "fn",
      "    z() = 0",
      "fn",
      "    h1() = 1",
      "    h2() = 2",
      "    h3() = 3",
      "    h4() = 4",
      "    h5() = 5",
      "    h6() = 6",
      "    h7() = 7",
      "    h8() = 8",
      "    h9() = 9",
      "fn",
      "    fn e1() = 1",
      "    async fn e2() = 2",
      "    async e3() = 3",
      "fn main(): int32 =",
      "    return 0",
    ),
    evidence: {has: {"async": 2, "fn": 6}},
  },
  routines: {
    note: "iterator/macro/template/concept/trait 声明与语句形 + yield + 顶层 concept/trait",
    code: L(
      "concept C0:",
      "    x0 = 1",
      "trait T0:",
      "    y0 = 2",
      "iterator it(): int32 =",
      "    yield 1",
      "    yield",
      "    return 0",
      "macro m(x: untyped): untyped = x",
      "macro mt[T](x: untyped): untyped where true = x",
      "template t1(x: int32): int32 = x + 1",
      "template t2[T](x: T): T where true = x",
      "template t3() = 41 + 1",
      "fn outer(): int32 =",
      "    fn inner(): int32 = 1",
      "    async fn inner2(): int32 = 2",
      "    iterator it2(): int32 =",
      "        yield 2",
      "        return 0",
      "    macro m2(y: untyped): untyped = y",
      "    template t4(z: int32): int32 = z",
      "    concept C1:",
      "        x1 = 3",
      "    trait T1:",
      "        y1 = 4",
      "    inner()",
      "    return inner()",
      "fn main(): int32 =",
      "    return 0",
    ),
    evidence: {has: {"yield": 3, "macro": 2, "template": 4, "iterator": 2, "concept": 2, "trait": 2, "where": 2}},
  },
  types: {
    note: "typeDecl/typeEntry/fieldDecl/tupleElem/enumField 全 variant + 语句位 typeDecl",
    code: L(
      "type A = int32",
      "type B[T] = T",
      "type W where 1 > 0 = int32",
      "type C = tuple[int32, str]",
      "type Tup = tuple[a: int32, b: str = \"t\"]",
      "type E1 = enum:",
      "    Red",
      "    Green = 2",
      "type Obj =",
      "    x: int32",
      "    y: str = \"d\"",
      "type",
      "    D = int32",
      "    E = str",
      "type",
      "    Z0 = int32",
      "type",
      "    F = int32",
      "    G = str",
      "    H = bool",
      "    I = char",
      "    J = float64",
      "    K = uint8",
      "    L2 = int64",
      "    M = uint64",
      "    N = float32",
      "type",
      "    P[T] = T",
      "    Q where 1 > 0 = int32",
      "    R =",
      "        a: int32",
      "        b: str = \"x\"",
      "fn main(): int32 =",
      "    type L3 = int32",
      "    return 0",
    ),
    evidence: {has: {"type": 12, "where": 2, "enum": 1, "tuple": 2}},
  },
  stmt: {
    note: "控制语句全族 + statementCore 多数臂 + suite 重复 one/max",
    code: L(
      "fn main(): int32 =",
      "    var r = 0",
      "    if r > 0:",
      "        r = 1",
      "    elif r > 1:",
      "        r = 2",
      "    else:",
      "        r = 3",
      "    if r < 0:",
      "        r = 9",
      "    while r > 0:",
      "        r = r - 1",
      "        if r == 2:",
      "            break",
      "        continue",
      "    for i in 0..<10:",
      "        r = r + i",
      "    defer:",
      "        r = 0",
      "    block:",
      "        r = 1",
      "    block b:",
      "        r = 2",
      "    when r > 0:",
      "        r = 5",
      "    elif r > 1:",
      "        r = 6",
      "    else:",
      "        r = 7",
      "    when r < 0:",
      "        r = 8",
      "    match r:",
      "        1 => r = 10",
      "        _ => r = 11",
      "    case r:",
      "        of 1: r = 1",
      "        else: r = 3",
      "    r = r + 1",
      "    r + 1",
      "    return r",
    ),
    evidence: {has: {"if": 3, "elif": 2, "else": 3, "while": 1, "for": 1, "defer": 1, "block": 2, "when": 2, "match": 1, "case": 1, "of": 1, "break": 1, "continue": 1, "return": 1}},
  },
  stmt_rep: {
    note: "语句级重复 max(8 elif/9 pattern/9 match 臂/9 case 分支) + match/case 形态",
    code: L(
      "fn main(): int32 =",
      "    var r = 0",
      "    if r == 0:",
      "        r = 1",
      "    elif r == 1:",
      "        r = 2",
      "    elif r == 2:",
      "        r = 3",
      "    elif r == 3:",
      "        r = 4",
      "    elif r == 4:",
      "        r = 5",
      "    elif r == 5:",
      "        r = 6",
      "    elif r == 6:",
      "        r = 7",
      "    elif r == 7:",
      "        r = 8",
      "    elif r == 8:",
      "        r = 9",
      "    for a, b in xs:",
      "        r = 1",
      "    for a, b, c, d, e, f, g, h, i in xs:",
      "        r = 2",
      "    when r > 0:",
      "        r = 1",
      "    elif r > 1:",
      "        r = 2",
      "    elif r > 2:",
      "        r = 3",
      "    elif r > 3:",
      "        r = 4",
      "    elif r > 4:",
      "        r = 5",
      "    elif r > 5:",
      "        r = 6",
      "    elif r > 6:",
      "        r = 7",
      "    elif r > 7:",
      "        r = 8",
      "    elif r > 8:",
      "        r = 9",
      "    else:",
      "        r = 9",
      "    match r: 1 => r = 1",
      "    match r:",
      "        1 => r = 1",
      "    match r:",
      "        1 => r = 1",
      "        2 => r = 2",
      "        3 => r = 3",
      "        4 => r = 4",
      "        5 => r = 5",
      "        6 => r = 6",
      "        7 => r = 7",
      "        8 => r = 8",
      "        _ => r = 9",
      "    case r: r = 1",
      "    case r:",
      "        of 1: r = 1",
      "    case r:",
      "        of 1: r = 1",
      "        of r + 1: r = 3",
      "        of 2 if r > 0: r = 2",
      "        of 3: r = 4",
      "        of 4: r = 5",
      "        of 5: r = 6",
      "        of 6: r = 7",
      "        of 7: r = 8",
      "        else: r = 9",
      "    case r",
      "    of 1: r = 1",
      "    case r",
      "    of 1: r = 1",
      "    else: r = 0",
      "    case r",
      "    of 1: r = 1",
      "    of 2: r = 2",
      "    of 3: r = 3",
      "    of 4: r = 4",
      "    of 5: r = 5",
      "    of 6: r = 6",
      "    of 7: r = 7",
      "    of 8: r = 8",
      "    else: r = 9",
      "    case r",
      "    return r",
    ),
    evidence: {has: {"elif": 16, "match": 3, "case": 7, "of": 19, "for": 2, "else": 4}},
  },
  expr_ops: {
    note: "全部二元层 one/zero + 三元 + 一元前缀 + await",
    code: L(
      "fn f(): int32 = 1",
      "fn main(): int32 =",
      "    let a = 1",
      "    let b = 2",
      "    let c = true",
      "    let z = a",
      "    let e1 = a == b",
      "    let e2 = a != b",
      "    let c1 = a < b",
      "    let c2 = a <= b",
      "    let c3 = a > b",
      "    let c4 = a >= b",
      "    let m1 = a in b",
      "    let m2 = a notin b",
      "    let r1 = a..b",
      "    let r2 = a..<b",
      "    let s1 = a + b",
      "    let s2 = a - b",
      "    let t1 = a / b",
      "    let t2 = a % b",
      "    let t0 = a * b",
      "    let bw1 = a & b",
      "    let l1 = c || c",
      "    let l2 = c && c",
      "    let l3 = a | b",
      "    let l4 = a ^ b",
      "    let q = c ? a : b",
      "    let u1 = +a",
      "    let u2 = -a",
      "    let u3 = !c",
      "    let u4 = ~a",
      "    let u5 = $a",
      "    let u6 = ^a",
      "    let u7 = %a",
      "    let aw = await f()",
      "    return a",
    ),
    evidence: {has: {"in": 1, "notin": 1, "..": 1, "..<": 1, "||": 1, "&&": 1, "|": 1, "^": 2, "?": 1, "await": 1, "~": 1, "$": 1, "*": 1, "&": 1, "=": 38}},
  },
  expr_rep8: {
    note: "各二元层重复 bounded_max=8",
    code: L(
      "fn main(): int32 =",
      "    let a = 1",
      "    let c = true",
      "    let r01 = a == a == a == a == a == a == a == a == a",
      "    let r02 = a < a < a < a < a < a < a < a < a",
      "    let r03 = a in a in a in a in a in a in a in a in a",
      "    let r04 = a..a..a..a..a..a..a..a..a",
      "    let r05 = a + a + a + a + a + a + a + a + a",
      "    let r06 = a / a / a / a / a / a / a / a / a",
      "    let r07 = c || c || c || c || c || c || c || c || c",
      "    let r08 = c && c && c && c && c && c && c && c && c",
      "    let r09 = a | a | a | a | a | a | a | a | a",
      "    let r10 = a ^ a ^ a ^ a ^ a ^ a ^ a ^ a ^ a",
      "    let r11 = a & a & a & a & a & a & a & a & a",
      "    return a",
    ),
    evidence: {has: {"=": 29, "<": 8, "in": 8, "..": 8, "+": 8, "/": 8, "||": 8, "&&": 8, "|": 8, "^": 8, "&": 8}},
  },
  expr_postfix: {
    note: "postfix 全臂 + callSuffix/callArg 全 variant + 切片 + try",
    code: L(
      "fn f(a: int32, b: int32): int32 = a",
      "fn main(): int32 =",
      "    let arr = [1, 2]",
      "    let o = f(1, 2)",
      "    let p0 = f(1, 2).abs",
      "    let p1 = arr[0]",
      "    let p2 = arr[0..1]",
      "    let p3 = arr[0..<1]",
      "    let p4 = f(1, 2)?",
      "    let p5 = f()",
      "    let p6 = f(1)",
      "    let p7 = f(1, 2, 3, 4, 5, 6, 7, 8, 9)",
      "    let p8 = f(a = 1, b = 2)",
      "    let p9 = f(a: 1, b: 2)",
      "    let p10 = o.x.y.z.w.v.u.t.s.r",
      "    return o",
    ),
    evidence: {has: {".": 9, "[": 4, "?": 1, ",": 14}},
  },
  expr_space: {
    note: "spaceCall/spaceAtom/spacePrimary 全臂",
    code: L(
      "fn f(x: int32): int32 = x",
      "fn main(): int32 =",
      "    let z = 1",
      "    let w = f z",
      "    let a = f 1",
      "    let b = f \"s\"",
      "    let c = f 'x'",
      "    let d = f true",
      "    let e = f (1, 2)",
      "    let g = f [1, 2]",
      "    let h = f {1, 2}",
      "    let i = f (1)",
      "    let j = f 1.abs",
      "    let k = f 1[0]",
      "    let l = f 1[0..1]",
      "    let m = f 1[0..<1]",
      "    let n = f 1?",
      "    let o = f 1(2)",
      "    let p = f 1.a.b.c.d.e.f.g.h",
      "    let q = f {}",
      "    let r = f {1, 2, 3, 4, 5, 6, 7, 8, 9}",
      "    let s = f {1,}",
      "    let s1 = f {1}",
      "    let t = f fn() = 1",
      "    let u = f iterator() = 1",
      "    return w",
    ),
    evidence: {has: {"{": 5, "}": 5, "f": 22}},
  },
  expr_primary: {
    note: "字面量/tuple/list 全 variant",
    code: L(
      "fn main(): int32 =",
      "    let i = 42",
      "    let f = 4.2",
      "    let s = \"str\"",
      "    let c = 'x'",
      "    let bt = true",
      "    let bf = false",
      "    let t1 = (1, 2)",
      "    let t2 = (a: 1, b: 2)",
      "    let t3 = (1, 2,)",
      "    let t4 = (1,)",
      "    let t5 = (1, 2, 3, 4, 5, 6, 7, 8, 9)",
      "    let l1 = [1]",
      "    let l2 = [1, 2]",
      "    let l3: int32[] = []",
      "    let l4 = [1, 2,]",
      "    let l5 = [1, 2, 3, 4, 5, 6, 7, 8, 9]",
      "    let p = (i)",
      "    let r = i",
      "    return i",
    ),
    evidence: {has: {"true": 1, "false": 1, "(": 6, "[": 5}},
  },
  expr_ifcase: {
    note: "ifExpr/whenExpr/caseExpr/caseExprBranch 全 variant",
    code: L(
      "fn main(): int32 =",
      "    let a = 1",
      "    let i0 = if a > 0: 1 else: 2",
      "    let i1 = if a > 0: 1 elif a > 1: 2 else: 3",
      "    let i2 = if a > 0: 1 elif a > 1: 2 elif a > 2: 3 elif a > 3: 4 elif a > 4: 5 elif a > 5: 6 elif a > 6: 7 elif a > 7: 8 elif a > 8: 9 else: 10",
      "    let w0 = when a > 0: 1 else: 2",
      "    let w1 = when a > 0: 1 elif a > 1: 2",
      "    let w2 = when a > 0: 1 elif a > 1: 2 elif a > 2: 3 elif a > 3: 4 elif a > 4: 5 elif a > 5: 6 elif a > 6: 7 elif a > 7: 8 elif a > 8: 9 else: 10",
      "    let c0 = case a: 1 else: 2",
      "    let c2 = case a:",
      "        of 1: 10",
      "        of 2: 20",
      "    let c3 = case a:",
      "        of 1: 10",
      "        of 2: 20",
      "        of 3: 30",
      "        of 4: 40",
      "        of 5: 50",
      "        of 6: 60",
      "        of 7: 70",
      "        of 8: 80",
      "        else: 90",
      "    let c4 = case a:",
      "        of 1 if a > 0: 10",
      "        else: 30",
      "    let c5 = case a:",
      "        of 1: 10",
      "    let c6 = case a",
      "        of 1: 10",
      "        else: 30",
      "    return a",
    ),
    evidence: {has: {"elif": 18, "else": 9, "case": 6, "of": 13, "when": 3, "if": 4}},
  },
  expr_compr: {
    note: "list/prefix comprehension 全 variant",
    code: L(
      "fn main(): int32 =",
      "    let xs = [1, 2, 3]",
      "    let a = [x for x in xs]",
      "    let b = [x + 1 for x in xs if x > 1]",
      "    let c = [r for x, y in xs]",
      "    let d = [r for a1, a2, a3, a4, a5, a6, a7, a8, a9 in xs]",
      "    let e = for x in xs: x",
      "    let f = for x in xs if x > 0: x + 1",
      "    return 0",
    ),
    evidence: {has: {"for": 6, "in": 6, "if": 2}},
  },
  expr_fnlit: {
    note: "fn/iterator 字面量全 optional variant",
    code: L(
      "fn main(): int32 =",
      "    let f0 = fn() = 1",
      "    let f1 = fn named() = 1",
      "    let f2 = fn[T](x: T) = x",
      "    let f3 = fn(): int32 = 1",
      "    let f4 = fn(x: int32): int32 where x > 0 = x",
      "    let i0 = iterator() = 1",
      "    let i1 = iterator named() = 1",
      "    let i2 = iterator[T](x: T) = x",
      "    let i3 = iterator(): int32 = 1",
      "    let i4 = iterator(x: int32): int32 where x > 0 = x",
      "    return f0()",
    ),
    evidence: {has: {"fn": 6, "iterator": 5, "where": 2}},
  },
  rec_expr: {
    note: "表达式递归深度巢(链/调用/空格调用/tuple/list/生成式/if/when/case/fn 字面量)",
    code: L(
      "fn f(x: int32): int32 = x",
      "fn main(): int32 =",
      "    let a = 1",
      "    let chain = ((((1))))",
      "    let calls = f(f(f(f(1))))",
      "    let spaces = f (f (f (f 1)))",
      "    let tuples = ((((1, 2), 2), 2), 2)",
      "    let lists = [[[[1]]]]",
      "    let comprs = [[[[w for w in ws] for x in xs] for y in ys] for z in zs]",
      "    let prefix = for q in xs: (for r in ys: (for s in zs: (for t in ws: t)))",
      "    let ifs = if a > 0: (if a > 1: (if a > 2: (if a > 3: 1 else: 2) else: 3) else: 4) else: 5",
      "    let whens = when a > 0: (when a > 1: (when a > 2: (when a > 3: 1 else: 2) else: 3) else: 4) else: 5",
      "    let cases = case a: (case a: (case a: (case a: 1 else: 2) else: 3) else: 4) else: 5",
      "    let fnlit = fn(): int32 = fn(): int32 = fn(): int32 = fn(): int32 = 1",
      "    let itlit = iterator(): int32 = iterator(): int32 = iterator(): int32 = iterator(): int32 = 1",
      "    let ceb = case a:",
      "        of 1: case a:",
      "            of 2: case a:",
      "                of 3: 1",
      "                else: 2",
      "            else: 3",
      "        else: 4",
      "    case a",
      "    of fn(): int32 =",
      "        case a",
      "        of fn(): int32 =",
      "            case a",
      "            of 1: 1",
      "            else: 2",
      "        return 3",
      "    else: 4",
      "    return a",
    ),
    evidence: {has: {"case": 10, "of": 6, "fn": 7, "iterator": 4, "for": 8}},
  },
  rec_stmt: {
    note: "语句递归深度巢(控制/binding/assign/return/yield/exprstmt)",
    code: L(
      "var g = 0",
      "fn main(): int32 =",
      "    if true:",
      "        if true:",
      "            if true:",
      "                if true:",
      "                    g = 1",
      "    while g > 0:",
      "        while g > 1:",
      "            while g > 2:",
      "                while g > 3:",
      "                    g = 1",
      "    for a in xs:",
      "        for b in xs:",
      "            for c in xs:",
      "                for d in xs:",
      "                    g = 1",
      "    when g > 0:",
      "        when g > 1:",
      "            when g > 2:",
      "                when g > 3:",
      "                    g = 1",
      "    defer:",
      "        defer:",
      "            defer:",
      "                defer:",
      "                    g = 1",
      "    block:",
      "        block:",
      "            block:",
      "                block:",
      "                    g = 1",
      "    match g:",
      "        1 => match g:",
      "            2 => match g:",
      "                3 => match g:",
      "                    4 => g = 1",
      "                    _ => g = 2",
      "                _ => g = 3",
      "            _ => g = 4",
      "        _ => g = 5",
      "    case g:",
      "        of 1: case g:",
      "            of 2: case g:",
      "                of 3: case g:",
      "                    of 4: g = 1",
      "                    else: g = 2",
      "                else: g = 3",
      "            else: g = 4",
      "        else: g = 5",
      "    let f0 = fn(): int32 =",
      "        let f1 = fn(): int32 =",
      "            let f2 = fn(): int32 =",
      "                let f3 = 1",
      "                return f3",
      "            return f2()",
      "        return f1()",
      "    g = fn(): int32 =",
      "        g = fn(): int32 =",
      "            g = fn(): int32 =",
      "                g = 1",
      "                return 1",
      "            return 1",
      "        return 1",
      "    return 0",
      "fn ret0(): int32 =",
      "    return fn(): int32 =",
      "        return fn(): int32 =",
      "            return fn(): int32 =",
      "                return 1",
      "iterator y0(): int32 =",
      "    yield iterator(): int32 =",
      "        yield iterator(): int32 =",
      "            yield iterator(): int32 =",
      "                yield 1",
      "fn e0(): int32 =",
      "    fn(): int32 =",
      "        fn(): int32 =",
      "            fn(): int32 =",
      "                1",
      "    return 0",
    ),
    evidence: {has: {"if": 4, "while": 4, "for": 4, "when": 4, "defer": 4, "block": 4, "match": 4, "case": 4, "fn": 15, "return": 12, "yield": 4, "iterator": 4}},
  },
  rec_decl: {
    note: "声明递归深度巢(param 默认值链/type 字段默认值链/enum/tuple/macro/template/iterator)",
    code: L(
      "fn p0(x: int32 = (fn(): int32 = fn p1(y: int32 = (fn(): int32 = fn p2(z: int32 = (fn(): int32 = fn p3(w: int32 = 1) = w)()) = z)()) = y)()) = x",
      "type T0 =",
      "    a: int32 = fn(): int32 =",
      "        type T1 =",
      "            b: int32 = fn(): int32 =",
      "                type T2 =",
      "                    c: int32 = fn(): int32 =",
      "                        type T3 =",
      "                            d: int32 = 1",
      "                        return 1",
      "                return 1",
      "        return 1",
      "type",
      "    U0 =",
      "        a: int32 = fn(): int32 =",
      "            type",
      "                U1 =",
      "                    b: int32 = fn(): int32 =",
      "                        type",
      "                            U2 =",
      "                                c: int32 = fn(): int32 =",
      "                                    type",
      "                                        U3 =",
      "                                            d: int32 = 1",
      "                                    return 1",
      "                        return 1",
      "            return 1",
      "type E0 = enum:",
      "    A0 = fn(): int32 =",
      "        type E1 = enum:",
      "            A1 = fn(): int32 =",
      "                type E2 = enum:",
      "                    A2 = fn(): int32 =",
      "                        type E3 = enum:",
      "                            A3 = 1",
      "                        return 1",
      "                return 1",
      "        return 1",
      "type TupRec = tuple[tuple[tuple[tuple[int32]]]]",
      "macro m0(x: untyped): untyped =",
      "    macro m1(y: untyped): untyped =",
      "        macro m2(z: untyped): untyped =",
      "            macro m3(w: untyped): untyped = w",
      "template t0(x: int32): int32 =",
      "    template t1(y: int32): int32 =",
      "        template t2(z: int32): int32 =",
      "            template t3(w: int32): int32 = w",
      "iterator i0(): int32 =",
      "    iterator i1(): int32 =",
      "        iterator i2(): int32 =",
      "            iterator i3(): int32 =",
      "                yield 1",
      "            return 0",
      "        return 0",
      "    return 0",
      "fn main(): int32 =",
      "    return p0()",
    ),
    evidence: {has: {"type": 12, "enum": 4, "macro": 4, "template": 4, "iterator": 4, "tuple": 4, "fn": 17, "return": 10}},
  },
};

// ---------------------------------------------------------------- BLOCKED
// 无法由过 lint 的真实表面见证的 obligation(如实, 每条绑机械理由 + 仲裁 disposition + spec 证据)。
// disposition 取值:
//   excluded_no_pointer_public_gate — 语法合法(spec §1.2)但 §0.2 no-pointer 生产门禁禁用的
//     指针操作(解引用 `*`/`->`、取址 `&`); lintChengPublicSource 是该门禁的公开表面镜像,
//     公开语料永无 lint-clean witness, 属合同级排除而非 lint bug。
//   excluded_surface_unwritable — repetition zero 要求空 INDENT 块; §1.1 无 pass/空语句,
//     statementCore 无空臂, INDENT 由缩进行触发(空块不产生 INDENT), 表面不可写。
// kind 取值同合同; key 精确匹配节点 fragment(见 dump_obligations)。
const BLOCKED: {
  production: string; kind: "choice" | "optional" | "repetition"; key: string; variant: string;
  disposition: "excluded_no_pointer_public_gate" | "excluded_surface_unwritable";
  reason: string; evidence: readonly string[];
}[] = [
  {production: "unary", kind: "choice", key: "sequence(\"*\",unary)", variant: "alternative_3",
    disposition: "excluded_no_pointer_public_gate",
    reason: "解引用 `*` unary 属 no-pointer 生产门禁禁用指针操作; lint M9024_L04 为其公开表面镜像(前缀位 `*` 仍禁, 二元乘法门禁不管)",
    evidence: ["docs/cheng-formal-spec.md §0.2 no-pointer 生产门禁: 禁用指针操作(解引用 `*`/`->`、取址 `&`)",
      "docs/cheng-formal-spec.md §1.2 unary ::= \"*\" unary(语法合法, 公开口径除外)"]},
  {production: "unary", kind: "choice", key: "sequence(\"&\",unary)", variant: "alternative_4",
    disposition: "excluded_no_pointer_public_gate",
    reason: "取址 `&` unary 属 no-pointer 生产门禁禁用指针操作; lint M9024_L03 前缀位 `&` 仍禁(二元按位与已放行)",
    evidence: ["docs/cheng-formal-spec.md §0.2 no-pointer 生产门禁: 禁用指针操作(取址 `&`)",
      "docs/cheng-formal-spec.md §1.2 unary ::= \"&\" unary(语法合法, 公开口径除外)"]},
  {production: "postfix", kind: "choice", key: "sequence(\"->\",ident)", variant: "alternative_1",
    disposition: "excluded_no_pointer_public_gate",
    reason: "`->` 唯一语法角色是 `T*` 指针成员访问(等价 `(*p).field`), 属 no-pointer 生产门禁禁用解引用; lint M9024_L03 恒禁",
    evidence: ["docs/cheng-formal-spec.md §0.2 指针成员访问: `T*` 的成员访问统一使用 `->`",
      "docs/cheng-formal-spec.md §0.2 no-pointer 生产门禁: 禁用指针操作(解引用 `*`/`->`)",
      "docs/cheng-formal-spec.md §1.2 postfix ::= unary { ... \"->\" ident ... }(语法合法, 公开口径除外)"]},
  {production: "suite", kind: "repetition", key: "repetition(sequence(statement))", variant: "zero",
    disposition: "excluded_surface_unwritable",
    reason: "repetition zero = NEWLINE INDENT DEDENT 空块; 无 pass/空语句, 空块不产生 INDENT, 表面不可写",
    evidence: ["docs/cheng-formal-spec.md §1.2 suite ::= NEWLINE INDENT { statement } DEDENT | statement(重复仅在 INDENT 臂内)",
      "docs/cheng-formal-spec.md §1.1 关键字表无 pass; statementCore 22 臂无空语句",
      "docs/cheng-formal-spec.md §1.1 INDENT/DEDENT 由行首缩进触发(空块无缩进行)"]},
  {production: "caseStmt", kind: "repetition", key: "@root.sequence3.group0.choice1.sequence1.optional0.choice0.sequence1", variant: "zero",
    disposition: "excluded_surface_unwritable",
    reason: "INDENT 形 0 个 caseBranch = `case r:` 后空 INDENT 块, 同 suite 空块不可写",
    evidence: ["docs/cheng-formal-spec.md §1.2 caseStmt ::= ... NEWLINE [ INDENT { caseBranch } DEDENT | { caseBranch } ]",
      "docs/cheng-formal-spec.md §1.1 无 pass/空语句; 空块不产生 INDENT"]},
  {production: "caseStmt", kind: "repetition", key: "@root.sequence3.group0.choice1.sequence1.optional0.choice1.sequence0", variant: "zero",
    disposition: "excluded_surface_unwritable",
    reason: "flat 形 0 个 caseBranch = `case r` 换行后无任何分支, 表面不可写(同空块)",
    evidence: ["docs/cheng-formal-spec.md §1.2 caseStmt ::= ... NEWLINE [ INDENT { caseBranch } DEDENT | { caseBranch } ]"]},
  {production: "module", kind: "repetition", key: "repetition(sequence(topLevelDecl,repetition(sequence(NEWLINE))))", variant: "zero",
    disposition: "excluded_surface_unwritable",
    reason: "0 个 topLevelDecl = 空模块(0 个公开 token), witness 模型要求非空 token span, 无法表达",
    evidence: ["src/cheng_semantic_pipeline_matrix_m9024.ts buildGrammarSourceCoverageReceipt: tokenEnd <= tokenStart 即 invalid grammar source witness span"]},
  {production: "caseExpr", kind: "repetition", key: "repetition(sequence(caseExprBranch))", variant: "zero",
    disposition: "excluded_surface_unwritable",
    reason: "0 个 caseExprBranch = `case a:` 后空 INDENT 块(caseExpr 无 flat 臂), 表面不可写",
    evidence: ["docs/cheng-formal-spec.md §1.2 caseExpr ::= \"case\" expression [\":\"] ( expression | NEWLINE INDENT { caseExprBranch } DEDENT ) [...]",
      "docs/cheng-formal-spec.md §1.1 无 pass/空语句; 空块不产生 INDENT"]},
  {production: "stringLiteral", kind: "choice", key: "sequence(MULTILINE_STRING)", variant: "alternative_1",
    disposition: "excluded_surface_unwritable",
    reason: "多行字符串字面量在语料 token 模型中被 chengCodeWithoutCommentsAndLiterals 逐字符抹空格(保偏移), 无 token 锚点可写 claim span; 短串臂已 claim",
    evidence: ["tools/grammar_span_receipt.ts chengCodeWithoutCommentsAndLiterals: 字符串/字符字面量逐字符抹空格(换行保留), 多行串内部无可见 token"]},
];

// ---------------------------------------------------------------- PLAN
// 每个 covered production 的 claim 计划。key 解析规则:
//   "@<path>"     → structuralPath 精确匹配
//   其他           → 节点 fragment 精确匹配(choice 时匹配臂 fragment)
// variant 映射: choice → 臂序; optional → absent/present 各自 src;
//               repetition → zero/one/max 各自 src; recursion → 单 src(三个深度同巢)。
interface ProdPlan {
  root?: string;
  choice?: Record<string, string>;
  optional?: Record<string, {absent: string; present: string}>;
  repetition?: Record<string, {zero: string | undefined; one: string | undefined; max: string | undefined}>;
  recursion?: string;
}

const OPT = (absent: string, present: string) => ({absent, present});
// zero/one/max 任一可 undefined → 该 variant 无 claim(落入 missing, 由 BLOCKED 承接)
const REP = (zero?: string, one?: string, max?: string): {zero: string | undefined; one: string | undefined; max: string | undefined} => ({zero, one, max});

const PLAN: Record<string, ProdPlan> = {
  module: {
    root: "mod_min",
    optional: {"optional(sequence(moduleHeader,repetition(sequence(NEWLINE))))": OPT("mod_min", "mod_mid")},
    repetition: {
      "@root.sequence0": REP("mod_min", "mod_mid", "mod_full"),
      "@root.sequence1.optional0.sequence1": REP("mod_hdr0", "mod_mid", "mod_full"),
      "repetition(sequence(importDecl,repetition(sequence(NEWLINE))))": REP("mod_min", "mod_hdr0", "mod_full"),
      "@root.sequence2.repetition0.sequence1": REP("mod_hdr0", "mod_mid", "mod_full"),
      "repetition(sequence(topLevelDecl,repetition(sequence(NEWLINE))))": REP(undefined, "mod_min", "mod_full"),
      "@root.sequence3.repetition0.sequence1": REP("mod_min", "mod_mid", "mod_full"),
    },
  },
  importDecl: {
    root: "mod_full",
    choice: {
      "sequence(\"import\",modulePath,optional(sequence(\"as\",ident)))": "mod_full",
      "sequence(\"import\",modulePath,\"/[\",modulePath,repetition(sequence(\",\",modulePath)),\"]\")": "mod_full",
    },
    optional: {"optional(sequence(\"as\",ident))": OPT("mod_full", "mod_full")},
    repetition: {"repetition(sequence(\",\",modulePath))": REP("mod_full", "mod_full", "mod_full")},
  },
  modulePath: {root: "mod_full", repetition: {"repetition(sequence(\"/\",ident))": REP("mod_full", "mod_full", "mod_full")}},
  topLevelDecl: {root: "mod_min"},
  topLevelCore: {
    root: "mod_min",
    choice: {
      "sequence(bindingDecl)": "bind", "sequence(fnDecl)": "mod_min", "sequence(iteratorDecl)": "routines",
      "sequence(macroDecl)": "routines", "sequence(templateDecl)": "routines", "sequence(conceptDecl)": "routines",
      "sequence(traitDecl)": "routines", "sequence(typeDecl)": "types", "sequence(exprDecl)": "bind",
    },
  },
  exprDecl: {root: "bind"},
  bindingDecl: {
    root: "bind",
    choice: {
      "sequence(storage,bindingEntry)": "bind",
      "sequence(storage,NEWLINE,INDENT,bindingEntry,repetition(sequence(NEWLINE,bindingEntry)),DEDENT)": "bind",
    },
    repetition: {"repetition(sequence(NEWLINE,bindingEntry))": REP("bind", "bind", "bind")},
    recursion: "rec_stmt",
  },
  bindingEntry: {
    root: "bind",
    optional: {
      "optional(sequence(\":\",typeExpr))": OPT("bind", "bind"),
      "optional(sequence(\"=\",expression))": OPT("bind", "bind"),
    },
    recursion: "rec_stmt",
  },
  storage: {root: "bind", choice: {"sequence(\"let\")": "bind", "sequence(\"var\")": "bind", "sequence(\"const\")": "bind"}},
  annotations: {root: "anno", repetition: {"repetition(sequence(annotation))": REP("anno", "anno", "anno")}},
  annotation: {root: "anno", optional: {"optional(sequence(annotationArgs))": OPT("anno", "anno")}},
  routineHead: {
    root: "fn",
    optional: {
      "optional(sequence(typeParamList))": OPT("fn", "fn"),
      "optional(sequence(\":\",typeExpr))": OPT("fn", "fn"),
      "optional(sequence(\"where\",expression))": OPT("fn", "fn"),
    },
    recursion: "rec_decl",
  },
  fnDecl: {
    root: "fn",
    choice: {
      "sequence(optional(sequence(\"async\")),\"fn\",routineHead,\"=\",suite)": "fn",
      "sequence(\"fn\",NEWLINE,INDENT,fnEntry,repetition(sequence(NEWLINE,fnEntry)),DEDENT)": "fnblock",
    },
    optional: {"optional(sequence(\"async\"))": OPT("fn", "fn")},
    repetition: {"repetition(sequence(NEWLINE,fnEntry))": REP("fnblock", "fnblock", "fnblock")},
  },
  fnEntry: {
    root: "fnblock",
    optional: {
      "optional(sequence(\"async\"))": OPT("fnblock", "fnblock"),
      "optional(sequence(\"fn\"))": OPT("fnblock", "fnblock"),
    },
  },
  iteratorDecl: {root: "routines"},
  macroDecl: {
    root: "routines",
    optional: {
      "optional(sequence(typeParamList))": OPT("routines", "routines"),
      "optional(sequence(\"where\",expression))": OPT("routines", "routines"),
    },
    recursion: "rec_decl",
  },
  templateDecl: {
    root: "routines",
    optional: {
      "optional(sequence(typeParamList))": OPT("routines", "routines"),
      "optional(sequence(\":\",typeExpr))": OPT("routines", "routines"),
      "optional(sequence(\"where\",expression))": OPT("routines", "routines"),
    },
    recursion: "rec_decl",
  },
  templateBody: {
    root: "routines",
    choice: {"sequence(suite)": "routines", "sequence(expression)": "routines"},
    recursion: "rec_decl",
  },
  typeDecl: {
    root: "types",
    choice: {
      "@root:0": "types",
      "@root:1": "types",
      "@root.choice0.sequence5.group0:0": "types",
      "@root.choice0.sequence5.group0:1": "types",
    },
    optional: {
      "optional(sequence(typeParamList))": OPT("types", "types"),
      "optional(sequence(\"where\",expression))": OPT("types", "types"),
    },
    repetition: {"repetition(sequence(NEWLINE,typeEntry))": REP("types", "types", "types")},
    recursion: "rec_decl",
  },
  typeEntry: {
    root: "types",
    optional: {
      "optional(sequence(typeParamList))": OPT("types", "types"),
      "optional(sequence(\"where\",expression))": OPT("types", "types"),
    },
    choice: {
      "sequence(typeExpr)": "types",
      "sequence(objectType)": "types",
    },
    recursion: "rec_decl",
  },
  fieldDecl: {root: "types", optional: {"optional(sequence(\"=\",expression))": OPT("types", "types")}, recursion: "rec_decl"},
  paramList: {
    root: "fn",
    optional: {"optional(sequence(param,repetition(sequence(group(choice(sequence(\",\"),sequence(\";\"))),param))))": OPT("fn", "fn")},
    repetition: {"repetition(sequence(group(choice(sequence(\",\"),sequence(\";\"))),param))": REP("fn", "fn", "fn")},
    choice: {"sequence(\",\")": "fn", "sequence(\";\")": "fn"},
    recursion: "rec_decl",
  },
  param: {
    root: "fn",
    optional: {
      "optional(sequence(\":\",typeExpr))": OPT("fn", "fn"),
      "optional(sequence(\"=\",expression))": OPT("fn", "fn"),
    },
    recursion: "rec_decl",
  },
  tupleElem: {
    root: "types",
    optional: {
      "optional(sequence(ident,\":\"))": OPT("types", "types"),
      "optional(sequence(\"=\",expression))": OPT("types", "types"),
    },
    recursion: "rec_decl",
  },
  enumField: {root: "types", optional: {"optional(sequence(\"=\",expression))": OPT("types", "types")}, recursion: "rec_decl"},
  suite: {
    root: "mod_min",
    choice: {
      "sequence(NEWLINE,INDENT,repetition(sequence(statement)),DEDENT)": "mod_min",
      "sequence(statement)": "fn",
    },
    repetition: {"repetition(sequence(statement))": REP(undefined, "mod_min", "stmt")},
    recursion: "rec_stmt",
  },
  statement: {root: "mod_min", recursion: "rec_stmt"},
  statementCore: {
    root: "mod_min",
    choice: {
      "sequence(bindingDecl)": "stmt", "sequence(typeDecl)": "types", "sequence(assignStmt)": "stmt",
      "sequence(returnStmt)": "mod_min", "sequence(yieldStmt)": "routines", "sequence(breakStmt)": "stmt",
      "sequence(continueStmt)": "stmt", "sequence(deferStmt)": "stmt", "sequence(ifStmt)": "stmt",
      "sequence(matchStmt)": "stmt", "sequence(whileStmt)": "stmt", "sequence(forStmt)": "stmt",
      "sequence(caseStmt)": "stmt", "sequence(whenStmt)": "stmt", "sequence(blockStmt)": "stmt",
      "sequence(macroStmt)": "routines", "sequence(templateStmt)": "routines", "sequence(conceptStmt)": "routines",
      "sequence(traitStmt)": "routines", "sequence(fnStmt)": "routines", "sequence(iteratorStmt)": "routines",
      "sequence(expressionStmt)": "stmt",
    },
    recursion: "rec_stmt",
  },
  assignStmt: {root: "stmt", recursion: "rec_stmt"},
  returnStmt: {root: "mod_min", optional: {"optional(sequence(expression))": OPT("fn", "mod_min")}, recursion: "rec_stmt"},
  yieldStmt: {root: "routines", optional: {"optional(sequence(expression))": OPT("routines", "routines")}, recursion: "rec_stmt"},
  breakStmt: {root: "stmt"},
  continueStmt: {root: "stmt"},
  deferStmt: {root: "stmt", recursion: "rec_stmt"},
  ifStmt: {
    root: "stmt",
    repetition: {"repetition(sequence(\"elif\",expression,\":\",suite))": REP("stmt", "stmt", "stmt_rep")},
    optional: {"optional(sequence(\"else\",\":\",suite))": OPT("stmt", "stmt")},
    recursion: "rec_stmt",
  },
  matchStmt: {
    root: "stmt",
    choice: {
      "sequence(\"match\",expression,\":\",NEWLINE,INDENT,matchArm,repetition(sequence(NEWLINE,matchArm)),DEDENT)": "stmt",
      "sequence(\"match\",expression,\":\",matchArm)": "stmt_rep",
    },
    repetition: {"repetition(sequence(NEWLINE,matchArm))": REP("stmt_rep", "stmt", "stmt_rep")},
    recursion: "rec_stmt",
  },
  matchArm: {root: "stmt", recursion: "rec_stmt"},
  whileStmt: {root: "stmt", recursion: "rec_stmt"},
  forStmt: {
    root: "stmt",
    repetition: {"repetition(sequence(\",\",pattern))": REP("stmt", "stmt_rep", "stmt_rep")},
    recursion: "rec_stmt",
  },
  caseStmt: {
    root: "stmt",
    optional: {
      "optional(sequence(\":\"))": OPT("stmt_rep", "stmt"),
      "optional(choice(sequence(INDENT,repetition(sequence(caseBranch)),DEDENT),sequence(repetition(sequence(caseBranch)))))": OPT("stmt_rep", "stmt"),
    },
    choice: {
      "sequence(suite)": "stmt_rep",
      "sequence(NEWLINE,optional(choice(sequence(INDENT,repetition(sequence(caseBranch)),DEDENT),sequence(repetition(sequence(caseBranch))))))": "stmt",
      "sequence(INDENT,repetition(sequence(caseBranch)),DEDENT)": "stmt",
      "sequence(repetition(sequence(caseBranch)))": "stmt_rep",
    },
    repetition: {
      "@root.sequence3.group0.choice1.sequence1.optional0.choice0.sequence1": REP(undefined, "stmt_rep", "stmt_rep"),
      "@root.sequence3.group0.choice1.sequence1.optional0.choice1.sequence0": REP(undefined, "stmt_rep", "stmt_rep"),
    },
    recursion: "rec_stmt",
  },
  caseBranch: {
    root: "stmt",
    choice: {
      "sequence(\"of\",caseArm,optional(sequence(\"if\",expression)),\":\",suite)": "stmt",
      "sequence(\"else\",\":\",suite)": "stmt",
    },
    optional: {"optional(sequence(\"if\",expression))": OPT("stmt", "stmt_rep")},
    recursion: "rec_stmt",
  },
  caseEntry: {
    root: "stmt",
    choice: {"sequence(pattern)": "stmt", "sequence(expression)": "stmt_rep"},
    recursion: "rec_expr",
  },
  whenStmt: {
    root: "stmt",
    repetition: {"repetition(sequence(\"elif\",expression,\":\",suite))": REP("stmt", "stmt", "stmt_rep")},
    optional: {"optional(sequence(\"else\",\":\",suite))": OPT("stmt", "stmt")},
    recursion: "rec_stmt",
  },
  blockStmt: {root: "stmt", optional: {"optional(sequence(ident))": OPT("stmt", "stmt")}, recursion: "rec_stmt"},
  fnStmt: {root: "routines", optional: {"optional(sequence(\"async\"))": OPT("routines", "routines")}, recursion: "rec_decl"},
  templateStmt: {root: "routines", recursion: "rec_decl"},
  macroStmt: {root: "routines", recursion: "rec_decl"},
  iteratorStmt: {root: "routines", recursion: "rec_decl"},
  expressionStmt: {root: "stmt", recursion: "rec_stmt"},
  expression: {root: "mod_min", recursion: "rec_expr"},
  conditionalExpr: {root: "expr_ops", optional: {"optional(sequence(\"?\",expression,\":\",conditionalExpr))": OPT("expr_ops", "expr_ops")}, recursion: "rec_expr"},
  logicalOr: {root: "expr_ops", repetition: {"repetition(sequence(\"||\",logicalAnd))": REP("expr_ops", "expr_ops", "expr_rep8")}, recursion: "rec_expr"},
  logicalAnd: {root: "expr_ops", repetition: {"repetition(sequence(\"&&\",bitwiseOr))": REP("expr_ops", "expr_ops", "expr_rep8")}, recursion: "rec_expr"},
  bitwiseOr: {root: "expr_ops", repetition: {"repetition(sequence(\"|\",bitwiseXor))": REP("expr_ops", "expr_ops", "expr_rep8")}, recursion: "rec_expr"},
  bitwiseXor: {root: "expr_ops", repetition: {"repetition(sequence(\"^\",bitwiseAnd))": REP("expr_ops", "expr_ops", "expr_rep8")}, recursion: "rec_expr"},
  bitwiseAnd: {root: "expr_ops", repetition: {"repetition(sequence(\"&\",equality))": REP("expr_ops", "expr_ops", "expr_rep8")}, recursion: "rec_expr"},
  equality: {
    root: "expr_ops",
    choice: {"sequence(\"==\")": "expr_ops", "sequence(\"!=\")": "expr_ops"},
    repetition: {"repetition(sequence(group(choice(sequence(\"==\"),sequence(\"!=\"))),comparison))": REP("expr_ops", "expr_ops", "expr_rep8")},
    recursion: "rec_expr",
  },
  comparison: {
    root: "expr_ops",
    choice: {"sequence(\"<\")": "expr_ops", "sequence(\"<=\")": "expr_ops", "sequence(\">\")": "expr_ops", "sequence(\">=\")": "expr_ops"},
    repetition: {"repetition(sequence(group(choice(sequence(\"<\"),sequence(\"<=\"),sequence(\">\"),sequence(\">=\"))),membership))": REP("expr_ops", "expr_ops", "expr_rep8")},
    recursion: "rec_expr",
  },
  membership: {
    root: "expr_ops",
    choice: {"sequence(\"in\")": "expr_ops", "sequence(\"notin\")": "expr_ops"},
    repetition: {"repetition(sequence(group(choice(sequence(\"in\"),sequence(\"notin\"))),rangeExpr))": REP("expr_ops", "expr_ops", "expr_rep8")},
    recursion: "rec_expr",
  },
  rangeExpr: {
    root: "expr_ops",
    choice: {"sequence(\"..\")": "expr_ops", "sequence(\"..<\")": "expr_ops"},
    repetition: {"repetition(sequence(group(choice(sequence(\"..\"),sequence(\"..<\"))),sum))": REP("expr_ops", "expr_ops", "expr_rep8")},
    recursion: "rec_expr",
  },
  sum: {
    root: "expr_ops",
    choice: {"sequence(\"+\")": "expr_ops", "sequence(\"-\")": "expr_ops"},
    repetition: {"repetition(sequence(group(choice(sequence(\"+\"),sequence(\"-\"))),term))": REP("expr_ops", "expr_ops", "expr_rep8")},
    recursion: "rec_expr",
  },
  term: {
    root: "expr_ops",
    choice: {"sequence(\"*\")": "expr_ops", "sequence(\"/\")": "expr_ops", "sequence(\"%\")": "expr_ops"},
    repetition: {"repetition(sequence(group(choice(sequence(\"*\"),sequence(\"/\"),sequence(\"%\"))),factor))": REP("expr_ops", "expr_ops", "expr_rep8")},
    recursion: "rec_expr",
  },
  factor: {
    root: "expr_ops",
    choice: {
      "sequence(spaceCall)": "expr_space", "sequence(postfix)": "expr_ops", "sequence(whenExpr)": "expr_ifcase",
      "sequence(ifExpr)": "expr_ifcase", "sequence(caseExpr)": "expr_ifcase",
    },
    recursion: "rec_expr",
  },
  postfix: {
    root: "expr_ops",
    choice: {
      "sequence(\".\",ident)": "expr_postfix", "sequence(callSuffix)": "expr_postfix",
      "sequence(\"[\",expression,\"]\")": "expr_postfix",
      "sequence(\"[\",expression,group(choice(sequence(\"..\"),sequence(\"..<\"))),expression,\"]\")": "expr_postfix",
      "sequence(\"?\")": "expr_postfix",
      "sequence(\"..\")": "expr_postfix", "sequence(\"..<\")": "expr_postfix",
    },
    repetition: {"@root.sequence1": REP("expr_ops", "expr_postfix", "expr_postfix")},
    recursion: "rec_expr",
  },
  callSuffix: {
    root: "expr_postfix",
    optional: {"optional(sequence(callArg,repetition(sequence(\",\",callArg))))": OPT("expr_postfix", "expr_postfix")},
    repetition: {"repetition(sequence(\",\",callArg))": REP("expr_postfix", "expr_postfix", "expr_postfix")},
    recursion: "rec_expr",
  },
  callArg: {
    root: "expr_postfix",
    optional: {"optional(sequence(ident,group(choice(sequence(\"=\"),sequence(\":\")))))": OPT("expr_postfix", "expr_postfix")},
    choice: {"sequence(\"=\")": "expr_postfix", "sequence(\":\")": "expr_postfix"},
    recursion: "rec_expr",
  },
  spaceCall: {root: "expr_space", recursion: "rec_expr"},
  spaceAtom: {
    root: "expr_space",
    choice: {
      "sequence(\".\",ident)": "expr_space", "sequence(callSuffix)": "expr_space",
      "sequence(\"[\",expression,\"]\")": "expr_space",
      "sequence(\"[\",expression,group(choice(sequence(\"..\"),sequence(\"..<\"))),expression,\"]\")": "expr_space",
      "sequence(\"?\")": "expr_space",
      "sequence(\"..\")": "expr_space", "sequence(\"..<\")": "expr_space",
    },
    repetition: {"@root.sequence1": REP("expr_space", "expr_space", "expr_space")},
    recursion: "rec_expr",
  },
  spacePrimary: {
    root: "expr_space",
    choice: {
      "sequence(ident)": "expr_space", "sequence(numberLiteral)": "expr_space", "sequence(stringLiteral)": "expr_space",
      "sequence(charLiteral)": "expr_space", "sequence(boolLiteral)": "expr_space", "sequence(tupleLiteral)": "expr_space",
      "sequence(listLiteral)": "expr_space",
      "sequence(\"{\",optional(sequence(expression,repetition(sequence(\",\",expression)),optional(sequence(\",\")))),\"}\")": "expr_space",
      "sequence(fnLiteral)": "expr_space", "sequence(iteratorLiteral)": "expr_space",
      "sequence(\"(\",expression,\")\")": "expr_space",
    },
    optional: {
      "optional(sequence(expression,repetition(sequence(\",\",expression)),optional(sequence(\",\"))))": OPT("expr_space", "expr_space"),
      "optional(sequence(\",\"))": OPT("expr_space", "expr_space"),
    },
    repetition: {"repetition(sequence(\",\",expression))": REP("expr_space", "expr_space", "expr_space")},
    recursion: "rec_expr",
  },
  unary: {
    root: "expr_ops",
    choice: {
      "sequence(primary)": "expr_ops",
      "sequence(group(choice(sequence(\"+\"),sequence(\"-\"),sequence(\"!\"),sequence(\"~\"),sequence(\"$\"),sequence(\"^\"),sequence(\"%\"))),unary)": "expr_ops",
      "sequence(\"await\",unary)": "expr_ops",
      "sequence(comprehension)": "expr_compr",
      "sequence(\"+\")": "expr_ops", "sequence(\"-\")": "expr_ops", "sequence(\"!\")": "expr_ops",
      "sequence(\"~\")": "expr_ops", "sequence(\"$\")": "expr_ops", "sequence(\"^\")": "expr_ops",
      "sequence(\"%\")": "expr_ops",
    },
    recursion: "rec_expr",
  },
  comprehension: {root: "expr_compr", optional: {"optional(sequence(\"if\",expression))": OPT("expr_compr", "expr_compr")}, recursion: "rec_expr"},
  primary: {
    root: "expr_ops",
    choice: {
      "sequence(ident)": "expr_ops", "sequence(numberLiteral)": "expr_primary", "sequence(stringLiteral)": "expr_primary",
      "sequence(charLiteral)": "expr_primary", "sequence(boolLiteral)": "expr_primary", "sequence(tupleLiteral)": "expr_primary",
      "sequence(listLiteral)": "expr_primary", "sequence(fnLiteral)": "expr_fnlit", "sequence(iteratorLiteral)": "expr_fnlit",
      "sequence(\"(\",expression,\")\")": "expr_primary",
    },
    recursion: "rec_expr",
  },
  tupleLiteral: {
    root: "expr_primary",
    repetition: {"repetition(sequence(\",\",tupleElement))": REP("expr_primary", "expr_primary", "expr_primary")},
    optional: {"optional(sequence(\",\"))": OPT("expr_primary", "expr_primary")},
    recursion: "rec_expr",
  },
  tupleElement: {root: "expr_primary", optional: {"optional(sequence(ident,\":\"))": OPT("expr_primary", "expr_primary")}, recursion: "rec_expr"},
  listLiteral: {root: "expr_primary", recursion: "rec_expr"},
  listLiteralBody: {
    root: "expr_primary",
    choice: {
      "sequence(listComprehension)": "expr_compr",
      "sequence(optional(sequence(expression,repetition(sequence(\",\",expression)),optional(sequence(\",\")))))": "expr_primary",
    },
    optional: {
      "optional(sequence(expression,repetition(sequence(\",\",expression)),optional(sequence(\",\"))))": OPT("expr_primary", "expr_primary"),
      "optional(sequence(\",\"))": OPT("expr_primary", "expr_primary"),
    },
    repetition: {"repetition(sequence(\",\",expression))": REP("expr_primary", "expr_primary", "expr_primary")},
    recursion: "rec_expr",
  },
  listComprehension: {
    root: "expr_compr",
    repetition: {"repetition(sequence(\",\",pattern))": REP("expr_compr", "expr_compr", "expr_compr")},
    optional: {"optional(sequence(\"if\",expression))": OPT("expr_compr", "expr_compr")},
    recursion: "rec_expr",
  },
  whenExpr: {
    root: "expr_ifcase",
    repetition: {"repetition(sequence(\"elif\",expression,\":\",expression))": REP("expr_ifcase", "expr_ifcase", "expr_ifcase")},
    optional: {"optional(sequence(\"else\",\":\",expression))": OPT("expr_ifcase", "expr_ifcase")},
    recursion: "rec_expr",
  },
  ifExpr: {
    root: "expr_ifcase",
    repetition: {"repetition(sequence(\"elif\",expression,\":\",expression))": REP("expr_ifcase", "expr_ifcase", "expr_ifcase")},
    recursion: "rec_expr",
  },
  caseExpr: {
    root: "expr_ifcase",
    optional: {
      "optional(sequence(\":\"))": OPT("expr_ifcase", "expr_ifcase"),
      "optional(sequence(\"else\",\":\",expression))": OPT("expr_ifcase", "expr_ifcase"),
    },
    choice: {
      "sequence(expression)": "expr_ifcase",
      "sequence(NEWLINE,INDENT,repetition(sequence(caseExprBranch)),DEDENT)": "expr_ifcase",
    },
    repetition: {"repetition(sequence(caseExprBranch))": REP(undefined, "expr_ifcase", "expr_ifcase")},
    recursion: "rec_expr",
  },
  caseExprBranch: {root: "expr_ifcase", optional: {"optional(sequence(\"if\",expression))": OPT("expr_ifcase", "expr_ifcase")}, recursion: "rec_expr"},
  fnLiteral: {
    root: "expr_fnlit",
    optional: {
      "optional(sequence(ident))": OPT("expr_fnlit", "expr_fnlit"),
      "optional(sequence(typeParamList))": OPT("expr_fnlit", "expr_fnlit"),
      "optional(sequence(\":\",typeExpr))": OPT("expr_fnlit", "expr_fnlit"),
      "optional(sequence(\"where\",expression))": OPT("expr_fnlit", "expr_fnlit"),
    },
    recursion: "rec_expr",
  },
  iteratorLiteral: {
    root: "expr_fnlit",
    optional: {
      "optional(sequence(ident))": OPT("expr_fnlit", "expr_fnlit"),
      "optional(sequence(typeParamList))": OPT("expr_fnlit", "expr_fnlit"),
      "optional(sequence(\":\",typeExpr))": OPT("expr_fnlit", "expr_fnlit"),
      "optional(sequence(\"where\",expression))": OPT("expr_fnlit", "expr_fnlit"),
    },
    recursion: "rec_expr",
  },
  boolLiteral: {root: "expr_primary", choice: {"sequence(\"true\")": "expr_primary", "sequence(\"false\")": "expr_primary"}},
  charLiteral: {root: "expr_primary"},
  ident: {root: "expr_primary"},
  numberLiteral: {root: "expr_primary", choice: {"sequence(INTEGER)": "expr_primary", "sequence(FLOAT)": "expr_primary"}},
  stringLiteral: {root: "expr_primary", choice: {"sequence(SHORT_STRING)": "expr_primary", "sequence(MULTILINE_STRING)": undefined}},
};

// typeDecl 的两个 choice 节点(root 与 group 内)臂 fragment 相同(sequence(typeExpr)/sequence(objectType)),
// 只能按 "@<path>:<臂序>" 指定 — 已在上方 PLAN 内联。

// ---------------------------------------------------------------- 解析与装配
type ObligationKindName = ChengGrammarObligation["kind"];

interface Claim {
  readonly obligationId: string;
  readonly production: string;
  readonly kind: ObligationKindName;
  readonly structuralPath: string;
  readonly variant: string;
  readonly bound: number | null;
  readonly mapStatus: "MAPPED" | "PARTIAL";
}

interface CorpusEntry {
  readonly relativePath: string;
  readonly shape: string;
  readonly note: string;
  readonly evidence: {readonly has: Record<string, number>; readonly lacks: readonly string[]};
  readonly sourceSha256: string;
  readonly lintTokenCount: number;
  readonly claims: readonly Claim[];
}

interface BlockedEntry {
  readonly obligationId: string;
  readonly production: string;
  readonly kind: ObligationKindName;
  readonly structuralPath: string;
  readonly variant: string;
  readonly bound: number | null;
  readonly disposition: "excluded_no_pointer_public_gate" | "excluded_surface_unwritable";
  readonly reason: string;
  readonly evidence: readonly string[];
}

function resolveKey(nodes: readonly StructuralNode[], kind: "choice" | "optional" | "repetition", key: string): StructuralNode {
  const sameKind = nodes.filter((n) => n.kind === kind);
  if (key.startsWith("@")) {
    const body = key.slice(1);
    const pathPart = body.includes(":") ? body.slice(0, body.lastIndexOf(":")) : body;
    const byPath = sameKind.filter((n) => n.structuralPath === pathPart);
    if (byPath.length === 1) return byPath[0]!;
    throw new Error(`key ${key}: path ${pathPart} 命中 ${byPath.length} 个 ${kind} 节点`);
  }
  const exact = sameKind.filter((n) => n.fragment === key);
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) throw new Error(`key ${key}: fragment 精确命中 ${exact.length} 个 ${kind} 节点`);
  const contains = sameKind.filter((n) => n.fragment.includes(key));
  if (contains.length === 1) return contains[0]!;
  throw new Error(`key ${key}: ${kind} 节点命中 ${exact.length}+${contains.length}(必须唯一); 候选=${sameKind.map((n) => n.structuralPath).join(",")}`);
}

function choiceArmIndex(node: StructuralNode, key: string): number {
  if (key.startsWith("@")) {
    const armPart = key.slice(key.lastIndexOf(":") + 1);
    const idx = Number(armPart);
    if (Number.isInteger(idx) && idx >= 0 && idx < node.armFragments.length) return idx;
    throw new Error(`key ${key}: 臂序号越界(共 ${node.armFragments.length} 臂)`);
  }
  const hits = node.armFragments.map((a, i) => a === key ? i : -1).filter((i) => i >= 0);
  if (hits.length !== 1) throw new Error(`choice key ${key} 命中 ${hits.length} 臂 @ ${node.structuralPath}`);
  return hits[0]!;
}

export function buildCorpus() {
  const specBytes = readFileSync(SPEC_PATH);
  const specText = specBytes.toString("utf8");
  const grammar = buildChengGrammarObligationContract(specBytes);
  const ebnf = extractEbnfBlock(specText);
  const productions = parseProductions(ebnf);
  const nodesByProd = new Map(productions.map((p) => [p.name, enumerateStructuralNodes(p.rhs)]));
  const mapDoc = JSON.parse(readFileSync(MAP_PATH, "utf8")) as {
    spec: {formalSpecSha256: string; ebnfSha256: string};
    rows: {name: string; status: "MAPPED" | "PARTIAL" | "UNMAPPED"}[];
  };
  if (mapDoc.spec.formalSpecSha256 !== grammar.formalSpecSha256) {
    throw new Error("ebnf_parser_node_map.json 与当前 spec 不一致(先重跑 diag_ebnf_map/gen_map.py)");
  }
  const statusByProd = new Map(mapDoc.rows.map((r) => [r.name, r.status]));
  const covered = mapDoc.rows.filter((r) => r.status !== "UNMAPPED").map((r) => r.name);

  // 每个 covered production 的 required obligations
  const obsByProd = new Map<string, ChengGrammarObligation[]>();
  for (const o of grammar.obligations) {
    if (o.disposition !== "required") continue;
    if (!obsByProd.has(o.production)) obsByProd.set(o.production, []);
    obsByProd.get(o.production)!.push(o);
  }

  // claim 汇总: obligationId → {src, claim}
  const claimByObligation = new Map<string, {src: string; claim: Claim}>();
  const addClaim = (src: string, o: ChengGrammarObligation) => {
    if (!(src in SOURCES)) throw new Error(`plan 引用未知 source id: ${src}`);
    if (claimByObligation.has(o.obligationId)) {
      throw new Error(`obligation ${o.obligationId}(${o.production}/${o.kind}/${o.variant}) 被重复 claim(${claimByObligation.get(o.obligationId)!.src}, ${src})`);
    }
    const mapStatus = statusByProd.get(o.production);
    if (mapStatus !== "MAPPED" && mapStatus !== "PARTIAL") throw new Error(`claim 落到 UNMAPPED production: ${o.production}`);
    claimByObligation.set(o.obligationId, {src, claim: {
      obligationId: o.obligationId, production: o.production, kind: o.kind,
      structuralPath: o.structuralPath, variant: o.variant, bound: o.bound, mapStatus,
    }});
  };

  const missing = new Map<string, string>(); // obligationId → 描述
  for (const name of covered) {
    const plan = PLAN[name];
    const obligations = obsByProd.get(name) ?? [];
    if (plan === undefined) {
      for (const o of obligations) missing.set(o.obligationId, `${name}/${o.kind}/${o.structuralPath}/${o.variant}(无 PLAN)`);
      continue;
    }
    const nodes = nodesByProd.get(name)!;
    for (const o of obligations) {
      if (o.kind === "production") {
        if (plan.root !== undefined) {addClaim(plan.root, o);} else missing.set(o.obligationId, `${name}/production/root/root`);
        continue;
      }
      if (o.kind === "recursion") {
        if (plan.recursion !== undefined) {addClaim(plan.recursion, o);} else missing.set(o.obligationId, `${name}/recursion/${o.variant}`);
        continue;
      }
      if (o.kind === "choice") {
        const node = nodes.find((n) => n.kind === "choice" && n.structuralPath === o.structuralPath);
        if (node === undefined) throw new Error(`${name}: choice 节点消失 @ ${o.structuralPath}`);
        const armFragment = node.armFragments[o.bound ?? -1];
        const src = plan.choice?.[armFragment ?? ""] ?? plan.choice?.[`@${o.structuralPath}:${o.bound}`];
        if (src !== undefined) {addClaim(src, o);} else missing.set(o.obligationId, `${name}/choice/${o.structuralPath}/${o.variant} arm=${armFragment}`);
        continue;
      }
      if (o.kind === "optional" || o.kind === "repetition") {
        const table = o.kind === "optional" ? plan.optional : plan.repetition;
        const node = nodes.find((n) => n.kind === o.kind && n.structuralPath === o.structuralPath);
        if (node === undefined) throw new Error(`${name}: ${o.kind} 节点消失 @ ${o.structuralPath}`);
        let src: string | undefined;
        if (table !== undefined) {
          for (const [key, value] of Object.entries(table)) {
            const resolved = resolveKey(nodes, o.kind, key);
            if (resolved.structuralPath !== o.structuralPath) continue;
            if (o.kind === "optional") src = o.variant === "absent" ? (value as {absent: string; present: string}).absent : (value as {absent: string; present: string}).present;
            else src = o.variant === "zero" ? (value as {zero: string | undefined; one: string | undefined; max: string | undefined}).zero
              : o.variant === "one" ? (value as {zero: string | undefined; one: string | undefined; max: string | undefined}).one
              : (value as {zero: string | undefined; one: string | undefined; max: string | undefined}).max;
            break;
          }
        }
        if (src !== undefined) {addClaim(src, o);} else missing.set(o.obligationId, `${name}/${o.kind}/${o.structuralPath}/${o.variant} frag=${node.fragment.slice(0, 120)}`);
        continue;
      }
      missing.set(o.obligationId, `${name}/${o.kind}/${o.structuralPath}/${o.variant}(未知 kind)`);
    }
  }

  // BLOCKED 解析
  const blockedEntries: BlockedEntry[] = [];
  const blockedIds = new Set<string>();
  for (const b of BLOCKED) {
    const nodes = nodesByProd.get(b.production);
    if (nodes === undefined) throw new Error(`BLOCKED 引用未知 production: ${b.production}`);
    const node = resolveKey(nodes, b.kind, b.key);
    const candidates = (obsByProd.get(b.production) ?? []).filter((o) =>
      o.kind === b.kind && o.structuralPath === node.structuralPath && o.variant === b.variant);
    if (candidates.length !== 1) throw new Error(`BLOCKED ${b.production}/${b.kind}/${b.variant} 命中 ${candidates.length} 条 obligation`);
    const o = candidates[0]!;
    blockedIds.add(o.obligationId);
    blockedEntries.push({
      obligationId: o.obligationId, production: o.production, kind: o.kind,
      structuralPath: o.structuralPath, variant: o.variant, bound: o.bound,
      disposition: b.disposition, reason: b.reason, evidence: b.evidence,
    });
  }
  // BLOCKED 机械佐证: disposition 与节点形态必须相符
  for (const b of BLOCKED) {
    if (b.evidence.length === 0) throw new Error(`BLOCKED 缺 spec 证据: ${b.production} ${b.key}`);
    if (b.disposition === "excluded_no_pointer_public_gate" &&
        !b.key.includes("\"->\"") && !b.key.includes("\"&\"") && !b.key.includes("\"*\"")) {
      throw new Error(`BLOCKED no-pointer disposition 与 fragment 不符: ${b.production} ${b.key}`);
    }
    if (b.disposition === "excluded_surface_unwritable" &&
        !(b.kind === "repetition" && b.variant === "zero") &&
        !(b.kind === "choice" && b.key.includes("_STRING"))) {
      throw new Error(`BLOCKED surface-unwritable disposition 仅适用 repetition zero 或字面量 strip 后无 token 锚的 choice 臂: ${b.production} ${b.kind} ${b.variant}`);
    }
  }

  // BLOCKED 与 claim 互斥: 被 blocked 的 obligation 不得同时存在 claim
  for (const id of blockedIds) {
    if (claimByObligation.has(id)) {
      const hit = claimByObligation.get(id)!;
      throw new Error(`BLOCKED 与 claim 冲突: ${id} 同时被 source ${hit.src} claim`);
    }
  }
  const uncovered = [...missing.entries()].filter(([id]) => !blockedIds.has(id)).map(([, desc]) => desc);
  if (uncovered.length > 0) {
    throw new Error(`covered production 存在未 claim 且未 blocked 的 obligation(${uncovered.length}):\n  ${uncovered.join("\n  ")}`);
  }

  // 逐 source 装配 entries
  const entries: CorpusEntry[] = [];
  for (const [shape, def] of Object.entries(SOURCES)) {
    const relativePath = `fixtures/semantic/grammar_corpus/${shape}.cheng`;
    const lint = lintChengPublicSource(def.code);
    if (!lint.passed) throw new Error(`corpus source ${shape} 未过 lint: ${lint.violations.join(",")}`);
    const claims = [...claimByObligation.values()]
      .filter((c) => c.src === shape)
      .map((c) => c.claim)
      .sort((a, b2) => a.obligationId.localeCompare(b2.obligationId));
    entries.push({
      relativePath, shape, note: def.note,
      evidence: {has: def.evidence?.has ?? {}, lacks: def.evidence?.lacks ?? []},
      sourceSha256: sha256(def.code),
      lintTokenCount: lint.tokenCount,
      claims,
    });
  }
  const claimedShapes = new Set([...claimByObligation.values()].map((c) => c.src));
  for (const shape of claimedShapes) {
    if (!entries.some((e) => e.shape === shape)) throw new Error(`source ${shape} 有 claim 但无 entry`);
  }
  const emptyEntries = entries.filter((e) => e.claims.length === 0).map((e) => e.shape);
  if (emptyEntries.length > 0) throw new Error(`source 无任何 claim(删掉或补 claim): ${emptyEntries.join(",")}`);

  // 按 obligation 类汇总命中 production 集
  const hitSets: Record<string, string[]> = {production: [], choice: [], optional: [], repetition: [], recursion: []};
  for (const {claim} of claimByObligation.values()) {
    const list = hitSets[claim.kind];
    if (list !== undefined && !list.includes(claim.production)) list.push(claim.production);
  }
  for (const list of Object.values(hitSets)) list.sort();

  const manifest = {
    schema: CORPUS_SCHEMA,
    generated: "deterministic(无时间戳/无 RNG, 同 semantic_gen 纪律)",
    spec: {
      formalSpecSha256: grammar.formalSpecSha256,
      ebnfSha256: grammar.ebnfSha256,
      mapSha256: sha256(readFileSync(MAP_PATH)),
      productionCount: grammar.productionCount,
    },
    counts: {
      coveredProductions: covered.length,
      sources: entries.length,
      claims: claimByObligation.size,
      blocked: blockedEntries.length,
      coveredRequiredObligations: [...obsByProd.entries()]
        .filter(([name]) => covered.includes(name))
        .reduce((acc, [, list]) => acc + list.length, 0),
    },
    hitProductionsByKind: hitSets,
    blocked: blockedEntries.sort((a, b2) => a.obligationId.localeCompare(b2.obligationId)),
    entries,
  };
  const files = new Map<string, string>();
  for (const [shape, def] of Object.entries(SOURCES)) files.set(`${shape}.cheng`, def.code);
  files.set("corpus.json", JSON.stringify(manifest, null, 2) + "\n");
  return {manifest, files};
}

function main() {
  const check = process.argv.includes("--check");
  const {manifest, files} = buildCorpus();
  if (check) {
    const mismatches: string[] = [];
    for (const [name, content] of files) {
      const path = resolve(OUT_DIR, name);
      if (!existsSync(path)) {mismatches.push(`${name}: 磁盘缺失`); continue;}
      if (readFileSync(path, "utf8") !== content) mismatches.push(`${name}: 内容漂移`);
    }
    for (const name of ["corpus.json", ...Object.keys(SOURCES).map((s) => `${s}.cheng`)]) {
      if (!files.has(name)) mismatches.push(`${name}: 生成侧缺失`);
    }
    if (mismatches.length > 0) {
      console.error(`--check 失败:\n  ${mismatches.join("\n  ")}`);
      process.exit(1);
    }
    console.log(`[grammar_corpus_gen] --check 通过: ${files.size} 文件逐字节一致, claims=${manifest.counts.claims}, blocked=${manifest.counts.blocked}`);
    return;
  }
  mkdirSync(OUT_DIR, {recursive: true});
  for (const [name, content] of files) writeFileSync(resolve(OUT_DIR, name), content);
  console.log(`[grammar_corpus_gen] wrote ${files.size} files → ${OUT_DIR}`);
  console.log(`[grammar_corpus_gen] sources=${manifest.counts.sources} claims=${manifest.counts.claims}/${manifest.counts.coveredRequiredObligations} blocked=${manifest.counts.blocked}`);
}

if (process.argv[1]?.endsWith("grammar_corpus_gen.ts")) main();
