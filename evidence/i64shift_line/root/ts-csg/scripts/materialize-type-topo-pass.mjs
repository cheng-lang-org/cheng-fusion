#!/usr/bin/env node
// Reorder Cheng `type` block structs so field dependencies are emitted first.
// Cold ABI freezes RealtimeChessRoom.game: ChessGameState at 128B when
// ChessGameState/Piece/Move/Position are still unseen; expected 144B after
// the later decls. Production rematerialize must not hand that order to stage3.
import { readFileSync, writeFileSync } from "node:fs";

const BUILTIN = new Set([
  "str", "bool", "void",
  "int8", "int16", "int32", "int64",
  "uint8", "uint16", "uint32", "uint64",
  "f32", "f64",
  "json.JsonNode",
]);

const structStart = /^    ([A-Za-z_][\w$]*) =$/;
const fieldLine = /^        ([A-Za-z_][\w$]*): (.+)$/;

function typeRefs(raw) {
  const refs = [];
  let text = String(raw || "").trim();
  while (text.endsWith("[]")) text = text.slice(0, -2).trim();
  if (!text || BUILTIN.has(text) || text.includes(".")) return refs;
  if (/^[A-Z][A-Za-z0-9_]*$/.test(text)) refs.push(text);
  return refs;
}

function parseStructs(lines) {
  const structs = [];
  let i = 0;
  while (i < lines.length && lines[i] === "") i += 1;
  while (i < lines.length) {
    while (i < lines.length && lines[i] === "") i += 1;
    if (i >= lines.length) break;
    const m = structStart.exec(lines[i]);
    if (!m) {
      if (structs.length === 0) return null;
      break;
    }
    const name = m[1];
    const body = [lines[i]];
    const deps = [];
    i += 1;
    while (i < lines.length) {
      if (structStart.test(lines[i])) break;
      if (lines[i] !== "" && !lines[i].startsWith("        ") && !lines[i].startsWith("    ")) break;
      const f = fieldLine.exec(lines[i]);
      if (f) deps.push(...typeRefs(f[2]));
      body.push(lines[i]);
      i += 1;
    }
    while (body.length > 0 && body[body.length - 1] === "") body.pop();
    structs.push({ name, body, deps: [...new Set(deps)] });
  }
  return structs;
}

function topoStructs(structs) {
  const names = new Set(structs.map((s) => s.name));
  const incoming = new Map(structs.map((s) => [s.name, 0]));
  const edges = new Map(structs.map((s) => [s.name, []]));
  for (const s of structs) {
    for (const dep of s.deps) {
      if (!names.has(dep) || dep === s.name) continue;
      edges.get(dep).push(s.name);
      incoming.set(s.name, incoming.get(s.name) + 1);
    }
  }
  const ready = structs.filter((s) => incoming.get(s.name) === 0).map((s) => s.name);
  const byName = new Map(structs.map((s) => [s.name, s]));
  const out = [];
  while (ready.length > 0) {
    const name = ready.shift();
    out.push(byName.get(name));
    for (const nxt of edges.get(name)) {
      incoming.set(nxt, incoming.get(nxt) - 1);
      if (incoming.get(nxt) === 0) ready.push(nxt);
    }
  }
  if (out.length !== structs.length) {
    const seen = new Set(out.map((s) => s.name));
    for (const s of structs) if (!seen.has(s.name)) out.push(s);
  }
  return out;
}

function rewriteTypeBlock(lines) {
  const structs = parseStructs(lines);
  if (!structs || structs.length < 2) return null;
  const ordered = topoStructs(structs);
  const same = ordered.every((s, i) => s.name === structs[i].name);
  if (same) return null;
  const out = [];
  for (const s of ordered) {
    out.push(...s.body);
  }
  return out;
}

function rewriteSource(text) {
  const lines = text.split("\n");
  const out = [];
  let changed = 0;
  let i = 0;
  while (i < lines.length) {
    if (lines[i] !== "type") {
      out.push(lines[i]);
      i += 1;
      continue;
    }
    const start = i;
    i += 1;
    const block = [];
    while (i < lines.length) {
      if (lines[i] === "type") break;
      if (lines[i].startsWith("fn ") || lines[i].startsWith("@") || lines[i].startsWith("import ") || lines[i].startsWith("const") || lines[i].startsWith("var")) break;
      block.push(lines[i]);
      i += 1;
    }
    while (block.length > 0 && block[block.length - 1] === "") block.pop();
    const rewritten = rewriteTypeBlock(block);
    out.push("type");
    if (rewritten) {
      out.push(...rewritten);
      changed += 1;
    } else {
      out.push(...block);
    }
    if (i < lines.length && lines[i] === "") out.push("");
    void start;
  }
  return { text: out.join("\n"), changed };
}

const path = process.argv[2];
if (!path) {
  process.stderr.write("usage: materialize-type-topo-pass.mjs <file.cheng>\n");
  process.exit(2);
}
const src = readFileSync(path, "utf8");
const result = rewriteSource(src);
if (result.changed > 0) writeFileSync(path, result.text.endsWith("\n") ? result.text : `${result.text}\n`, "utf8");
process.stdout.write(`type-topo-pass: blocks=${result.changed} ${path}\n`);
