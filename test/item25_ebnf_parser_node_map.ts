#!/usr/bin/env bun
// item25: EBNF↔parser 节点映射表自检。
// 校验 fixtures/semantic/ebnf_parser_node_map.json:
//   1) 124 个 production 全有行, 名称/顺序与 spec ebnf fence 一致;
//   2) 每行 body_ref.sha256 与 obligation 合同 production-root fragmentSha256 逐条相等;
//   3) meta 的 formalSpecSha256/ebnfSha256 与当次合同一致(spec dirty 时会变, 绑当次根);
//   4) status/span_model 枚举合法; UNMAPPED 行 parser_fn/node_kinds 必空, MAPPED 行 parser_fn 非空;
//   5) parser_fn 引用的函数名+行号在 TREE parser.cheng 中真实存在(`^fn <name>` 行号一致);
//   6) node_kinds 标识符(非 <...> 占位)在 parser.cheng 中真实出现;
//   7) 打印 MAPPED/PARTIAL/UNMAPPED 计数与 UNMAPPED 清单规模。
// 退出码非零即失败; 不兜底, 不静默跳过。
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, resolve} from "node:path";
import {buildChengGrammarObligationContract} from "../src/cheng_semantic_pipeline_matrix_m9024.ts";

const here = dirname(fileURLToPath(import.meta.url));
const mapPath = resolve(here, "../fixtures/semantic/ebnf_parser_node_map.json");
const specPath = process.env.CHENG_FORMAL_SPEC_PATH ?? "/Users/lbcheng/cheng-lang/docs/cheng-formal-spec.md";
const parserPath = process.env.CHENG_PARSER_PATH ?? "/Users/lbcheng/cheng-lang/src/core/lang/parser.cheng";

type MapStatus = "MAPPED" | "PARTIAL" | "UNMAPPED";

interface MapRow {
  readonly production: number;
  readonly name: string;
  readonly body_ref: {readonly body: string; readonly sha256: string};
  readonly parser_fn: readonly {readonly name: string; readonly file: string; readonly line: number}[];
  readonly node_kinds: readonly string[];
  readonly span_model: string;
  readonly status: MapStatus;
  readonly notes: string;
}

interface MapDoc {
  readonly schema: string;
  readonly spec: {readonly formalSpecSha256: string; readonly ebnfSha256: string};
  readonly counts: {readonly total: number; readonly MAPPED: number; readonly PARTIAL: number; readonly UNMAPPED: number};
  readonly rows: readonly MapRow[];
}

const STATUS = new Set(["MAPPED", "PARTIAL", "UNMAPPED"]);
const SPAN_MODELS = new Set([
  "value_node_char_span",
  "statement_root_span",
  "line_fact_span",
  "record_fact",
  "whole_file",
  "none",
]);

function main() {
  const doc = JSON.parse(readFileSync(mapPath, "utf8")) as MapDoc;
  assert.equal(doc.schema, "cheng_ebnf_parser_node_map.v1", "schema 版本不符");

  const specBytes = readFileSync(specPath);
  const contract = buildChengGrammarObligationContract(specBytes);
  assert.equal(doc.spec.formalSpecSha256, contract.formalSpecSha256,
    "formalSpecSha256 与当次合同不一致(spec 已变, 需重新生成映射表)");
  assert.equal(doc.spec.ebnfSha256, contract.ebnfSha256, "ebnfSha256 与当次合同不一致");

  // production-root obligation 的 fragmentSha256 以 production 名为键
  const rootFrag = new Map<string, string>();
  for (const ob of contract.obligations) {
    if (ob.kind === "production" && ob.structuralPath === "root") {
      assert.equal(rootFrag.has(ob.production), false, `重复 production-root obligation: ${ob.production}`);
      rootFrag.set(ob.production, ob.fragmentSha256);
    }
  }
  assert.equal(rootFrag.size, 124, `合同 production 数=${rootFrag.size}, 期望 124`);

  const rows = doc.rows;
  assert.equal(rows.length, 124, `映射表行数=${rows.length}, 期望 124`);

  const parserLines = readFileSync(parserPath, "utf8").split("\n");
  const parserSource = parserLines.join("\n");
  const fnLine = new Map<string, number>();
  parserLines.forEach((line, i) => {
    const m = /^fn\s+([A-Za-z_][A-Za-z0-9_]*)\b/.exec(line);
    if (m !== null && m[1] !== undefined && !fnLine.has(m[1])) fnLine.set(m[1], i + 1);
  });

  const seen = new Set<string>();
  const counts: Record<MapStatus, number> = {MAPPED: 0, PARTIAL: 0, UNMAPPED: 0};
  const unmappedNames: string[] = [];
  rows.forEach((row, i) => {
    assert.equal(row.production, i + 1, `行 ${i}: production 序号必须连续`);
    assert.equal(typeof row.name, "string", `行 ${i}: name 缺失`);
    assert.equal(seen.has(row.name), false, `重复行: ${row.name}`);
    seen.add(row.name);
    assert.equal(rootFrag.get(row.name), row.body_ref.sha256,
      `${row.name}: body_ref.sha256 与 production-root fragmentSha256 不一致`);
    assert.ok(STATUS.has(row.status), `${row.name}: 非法 status ${row.status}`);
    assert.ok(SPAN_MODELS.has(row.span_model), `${row.name}: 非法 span_model ${row.span_model}`);
    counts[row.status] += 1;
    if (row.status === "UNMAPPED") {
      unmappedNames.push(row.name);
      assert.equal(row.parser_fn.length, 0, `${row.name}: UNMAPPED 行不得引用 parser_fn`);
      assert.equal(row.node_kinds.length, 0, `${row.name}: UNMAPPED 行不得引用 node_kinds`);
      assert.equal(row.span_model, "none", `${row.name}: UNMAPPED 行 span_model 必须为 none`);
    }
    if (row.status === "MAPPED") {
      assert.ok(row.parser_fn.length > 0, `${row.name}: MAPPED 行必须有 parser_fn`);
    }
    for (const ref of row.parser_fn) {
      assert.equal(ref.file, "src/core/lang/parser.cheng", `${row.name}: parser_fn.file 非法`);
      assert.equal(fnLine.get(ref.name), ref.line,
        `${row.name}: parser_fn ${ref.name} 行号漂移(表中 ${ref.line}, parser.cheng 实得 ${fnLine.get(ref.name) ?? "不存在"})`);
    }
    for (const kind of row.node_kinds) {
      if (kind.startsWith("<")) continue; // 占位说明, 非标识符
      assert.ok(parserSource.includes(kind), `${row.name}: node_kind ${kind} 在 parser.cheng 中不存在`);
    }
  });
  // 名称集合与合同完全一致(顺序即 spec 顺序, 上面序号+rootFrag 已双向锁定)
  assert.deepEqual([...seen].sort(), [...rootFrag.keys()].sort(), "映射表 production 集合与合同不一致");

  assert.deepEqual(doc.counts, {total: 124, ...counts}, "counts 汇总与行级实算不一致");
  console.log(`[item25] rows=${rows.length} MAPPED=${counts.MAPPED} PARTIAL=${counts.PARTIAL} UNMAPPED=${counts.UNMAPPED}`);
  console.log(`[item25] UNMAPPED 清单(${unmappedNames.length}): ${unmappedNames.join(", ")}`);
  console.log("[item25] ebnf_parser_node_map 自检通过");
}

main();
