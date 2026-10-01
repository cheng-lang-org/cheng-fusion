#!/usr/bin/env node
// Managed-argument materialization pass for CHT-generated Cheng sources.
//
// Cheng moves owned values on parameter passing. Codec snapshot structs
// (RealtimeChessRoom etc.) cannot be shared, borrowed, or even dropped - their
// drop-helper decomposition is rejected by the compiler - so such a value must
// be CONSUMED exactly once, immediately, and never reach a scope exit.
//
// This pass rewrites handler bodies to that discipline:
//   1. A multi-use managed capture (struct param / FromJson local) is converted
//      once into JSON text: json.Stringify(__chtJsonOf_T(x)).
//   2. Every former use becomes a fresh temporary at the use site:
//      __chtFromJson_T(json.ParseJsonNodeOrDie(...)) moved straight into the
//      callee, or through a field extractor helper for field reads.
//   3. Multi-read strings copy via strings.ConcatStr(x, "").
// Aliases (var b = a) are resolved to their root capture before decisions.
// Parse failure panics: text comes from Stringify of a valid node.
import { readFileSync, writeFileSync } from "node:fs";
import { flatten2DArrays } from "./flatten-2d-arrays.mjs";

const SCALARS = new Set(["int8","int16","int32","int64","uint8","uint16","uint32","uint64","bool","f32","f64","str","void"]);
const sigRe = /^fn ([A-Za-z_][\w$]*)\((.*)\)(?:\s*:\s*([\w.\[\]$ ]+))?\s*=$/;
const isStructType = (t) => /^[A-Z][A-Za-z0-9_]*$/.test(t) && !SCALARS.has(t);
const splitTopSA = (s) => {
  const parts = []; let d = 0, cur = "", inStr = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) { cur += ch; if (ch === "\\") { cur += s[i+1] ?? ""; i++; } else if (ch === '"') inStr = false; continue; }
    if (ch === '"') { inStr = true; cur += ch; continue; }
    if (ch === "(" || ch === "[") { d++; cur += ch; }
    else if (ch === ")" || ch === "]") { d--; cur += ch; }
    else if (ch === "," && d === 0) { parts.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
};
const findCalls = (line) => {
  const res = []; let inStr = false;
  for (let j = 0; j < line.length; j++) {
    if (inStr) { if (line[j] === "\\") j++; else if (line[j] === '"') inStr = false; continue; }
    if (line[j] === '"') { inStr = true; continue; }
    if (line[j] === "(" && j > 0 && /[A-Za-z_$][\w$]*$/.test(line.slice(0, j)) && !/[.]\s*[A-Za-z_$][\w$]*$/.test(line.slice(0, j))) {
      let d = 1, closeIdx = -1, s2 = false;
      for (let k = j + 1; k < line.length; k++) {
        if (s2) { if (line[k] === "\\") k++; else if (line[k] === '"') s2 = false; continue; }
        if (line[k] === '"') { s2 = true; continue; }
        if (line[k] === "(") d++;
        else if (line[k] === ")") { d--; if (d === 0) { closeIdx = k; break; } }
      }
      if (closeIdx < 0 || s2) break;
      const cm = line.slice(0, j).match(/([A-Za-z_$][\w$]*)$/);
      if (cm) res.push({ callee: cm[1], idx: j, closeIdx });
      j = closeIdx;
    }
  }
  return res;
};

for (const path of process.argv.slice(2)) {
  let lines = readFileSync(path, "utf8").split("\n");
{
  const __f2 = flatten2DArrays(lines);
  if (__f2.flattened > 0) console.error(`flatten-2d: ${__f2.flattened} field(s) flattened`);
}
  const fnInfo = new Map();
  const fnInfoRet = new Map();
  for (const line of lines) {
    const m = line.match(sigRe);
    if (!m || !m[2].trim()) continue;
    const retTy = (m[3] || "").trim();
    fnInfo.set(m[1], splitTopSA(m[2]).map((p) => {
      const pm = p.match(/^(?:var\s+)?([A-Za-z_$][\w$]*):\s*(?:var\s+)?(.+)$/);
      if (!pm) return null;
      const ty = pm[2].trim();
      return { pname: pm[1], type: ty, isStr: ty === "str", isStruct: isStructType(ty) };
    }).filter(Boolean));
    fnInfoRet.set(m[1], retTy);
  }
  // field types from __chtFromJson_T bodies
  const fieldType = new Map();
  {
    let cur = null;
    for (const line of lines) {
      const m = line.match(/^fn __chtFromJson_([A-Za-z0-9_]+)\(/);
      if (m) { cur = m[1]; continue; }
      if (/^fn /.test(line)) cur = null;
      if (!cur) continue;
      const am = line.match(/^\s*out\.([A-Za-z_$][\w$]*)\s*=\s*(.+?)\s*$/);
      if (!am) continue;
      const rhs = am[2];
      let ty = null;
      const cj = rhs.match(/^__chtFromJson_([A-Za-z0-9_]+)\(/);
      if (cj) ty = cj[1];
      else if (/json\.GetStr\(/.test(rhs)) ty = "str";
      else if (/json\.GetBool\(/.test(rhs)) ty = "bool";
      else if (/json\.GetInt64\(/.test(rhs)) ty = "int64";
      else if (/json\.GetInt32\(|json\.GetInt\(/.test(rhs)) ty = "int32";
      if (ty) fieldType.set(cur + "::" + am[1], ty);
    }
  }
  const jsonOfTypes = new Set();
  for (const line of lines) {
    const m = line.match(/^fn __chtJsonOf_([A-Za-z0-9_]+)\(/);
    if (m) jsonOfTypes.add(m[1]);
  }
  // parse struct definitions from the module type block
  const structDefs = new Map(); // T -> [{name,ty}] or null when ungeneratable
  {
    let curT = null;
    for (const line of lines) {
      if (curT === null) {
        if (/^type\s*$/.test(line)) curT = "in";
        continue;
      }
      if (curT === "in") {
        const tm = line.match(/^    ([A-Za-z_$][\w$]*)\s*=$/);
        if (tm) { curT = tm[1]; structDefs.set(tm[1], []); }
        else if (/^\S/.test(line)) curT = null;
        continue;
      }
      const fm = line.match(/^    ([A-Za-z_$][\w$]*)\s*=\s*$/);
      if (fm) { curT = fm[1]; structDefs.set(fm[1], []); continue; }
      const fm2 = line.match(/^        ([A-Za-z_$][\w$]*)\s*:\s*(.+?)\s*$/);
      if (fm2) {
        const cur = structDefs.get(curT);
        if (!cur) continue;
        cur.push({ name: fm2[1], ty: fm2[2].trim() });
        continue;
      }
      if (/^\S/.test(line)) curT = null;
    }
  }
  // mark ungeneratable: missing def or non-int64 numerics
  {
    let changed = true;
    while (changed) {
      changed = false;
      const elemOk = (ty) => {
        if (SCALARS.has(ty)) return true;
        if (!structDefs.has(ty)) return false;
        return structDefs.get(ty) !== null;
      };
      for (const [t, fields] of structDefs) {
        if (!fields || jsonOfTypes.has(t)) continue;
        for (const f of fields) {
          let ty = f.ty;
          let bad;
          if (ty.endsWith("[]")) bad = !elemOk(ty.slice(0, -2));
          else if (!(ty === "str" || ty === "bool" || ty === "int64")) bad = !(structDefs.has(ty) && structDefs.get(ty) !== null);
          else bad = false;
          if (bad) {
            structDefs.set(t, null);
            changed = true;
            break;
          }
        }
      }
    }
  }
  // generate codec function text for types still marked generatable
  const generatedCodecLines = [];
  const emitOrder = [];
  {
    const emitted = new Set();
    const tryEmit = (t, stack) => {
      if (emitted.has(t) || jsonOfTypes.has(t)) return true;
      const fields = structDefs.get(t);
      if (!fields) return false;
      if (stack.includes(t)) return false;
      for (const f of fields) {
        let ty = f.ty;
        if (ty.endsWith("[]")) ty = ty.slice(0, -2);
        if (SCALARS.has(ty)) continue;
        if (!tryEmit(ty, stack.concat([t]))) return false;
      }
      emitted.add(t);
      emitOrder.push(t);
      return true;
    };
    for (const [t, fields] of structDefs) {
      if (fields) tryEmit(t, []);
    }
    const arrTag = (el) => el.replace(/[^A-Za-z0-9_]/g, "_");
    const arrElemJson = (el) => el === "str" ? "json.NewJString(item)" : el === "bool" ? "json.NewJBool(item)" : SCALARS.has(el) ? "json.NewJInt(item)" : `__chtJsonOf_${el}(item)`;
    const arrElemFrom = (el) => el === "str" ? "json.GetStr(itemNode)" : el === "bool" ? "json.GetBool(itemNode)" : SCALARS.has(el) ? "json.GetInt64(itemNode)" : `__chtFromJson_${el}(itemNode)`;
    const genArrElems = new Set();
    for (const t of emitOrder) {
      const fields = structDefs.get(t);
      generatedCodecLines.push(
        `@borrows`,
        `fn __chtJsonOf_${t}(value: ${t}): json.JsonNode =`,
        `    var out = json.NewJObject()`
      );
      for (const f of fields) {
        let g;
        if (f.ty.endsWith("[]")) { const el = f.ty.slice(0, -2); genArrElems.add(el); g = `__chtGenArr_${arrTag(el)}(value.${f.name})`; }
        else if (f.ty === "str") g = `json.NewJString(value.${f.name})`;
        else if (f.ty === "bool") g = `json.NewJBool(value.${f.name})`;
        else if (structDefs.has(f.ty)) g = `__chtJsonOf_${f.ty}(value.${f.name})`;
        else g = `json.NewJInt(value.${f.name})`;
        generatedCodecLines.push(`    json.JsonSetField(out, "${f.name}", ${g})`);
      }
      generatedCodecLines.push("    return out", "");
      generatedCodecLines.push(
        `fn __chtFromJson_${t}(node: json.JsonNode): ${t} =`,
        `    var out: ${t}`,
        `    if node.kind != json.JObject:`,
        `        return out`
      );
      for (const f of fields) {
        if (f.ty.endsWith("[]")) {
          const el = f.ty.slice(0, -2); genArrElems.add(el);
          generatedCodecLines.push(`    out.${f.name} = __chtGenFromArr_${arrTag(el)}(json.JsonGetField(node, "${f.name}"))`);
        } else if (f.ty !== "str" && f.ty !== "bool" && !structDefs.has(f.ty)) {
          generatedCodecLines.push(`    out.${f.name} = json.GetInt64(json.JsonGetField(node, "${f.name}"))`);
        } else if (structDefs.has(f.ty)) {
          generatedCodecLines.push(`    out.${f.name} = __chtFromJson_${f.ty}(json.JsonGetField(node, "${f.name}"))`);
        } else {
          const getter = f.ty === "bool" ? "json.GetBool" : "json.GetStr";
          generatedCodecLines.push(`    out.${f.name} = ${getter}(json.JsonGetField(node, "${f.name}"))`);
        }
        fieldType.set(t + "::" + f.name, f.ty);
      }
      generatedCodecLines.push("    return out", "");
      jsonOfTypes.add(t);
    }
    for (const el of genArrElems) {
      generatedCodecLines.push(
        `@borrows`,
        `fn __chtGenArr_${arrTag(el)}(value: ${el}[]): json.JsonNode =`,
        `    var out = json.NewJArray()`,
        `    for item in value:`,
        `        json.JsonAdd(out, ${arrElemJson(el)})`,
        `    return out`,
        "",
        `fn __chtGenFromArr_${arrTag(el)}(node: json.JsonNode): ${el}[] =`,
        `    var out: ${el}[]`,
        `    if node.kind != json.JArray:`,
        `        return out`,
        `    for i in 0..<node.a.len:`,
        `        let itemNode: json.JsonNode = json.JsonOwnedClone(node.a[i])`,
        `        add(out, ${arrElemFrom(el)})`,
        `    return out`,
        ""
      );
    }
  }
  const fnsAt = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(sigRe);
    if (m) fnsAt.push([i, m[1], /^__cht(JsonOf_|FromJson_|GenArr_|GenFromArr_|Fld_)/.test(m[1])]);
  }
  const extractorMap = new Map();
  if (process.env.DBG) console.error('lines:', lines.length, 'sample:', JSON.stringify(lines[77936]?.slice(0,60)), 'sigTest:', sigRe.test(lines[77936] || ''));
  if (process.env.DBG) console.error('fnsAt:', fnsAt.length, 'fnInfo:', fnInfo.size, [...fnInfo.keys()].slice(0,4).join(','));
  let snapCount = 0, freshSites = 0, strWraps = 0, fieldReads = 0;
  let snapK = 0;
  let narrowK = 0;
  const editsGlobal = [];
  const producerFormals = new Map(); // r17: fn -> {formal, paramName}
  const inlineTypeFields = new Map(); // r17: type -> fields[]
  for (let i = 0; i < lines.length; i++) {
    const pfM = /^fn ([A-Za-z_][\w$]*)\(([A-Za-z_][\w$]*): (ChtInlineObj_[0-9a-f]{8})\): /.exec(lines[i]);
    if (pfM) producerFormals.set(pfM[1], { formal: pfM[3], paramName: pfM[2] });
    const tfM = /^    (ChtInlineObj_[0-9a-f]{8}) =$/.exec(lines[i]);
    if (tfM) {
      const flds = [];
      let te = i + 1;
      while (te < lines.length) {
        const fm = /^        ([A-Za-z_][\w$]*): /.exec(lines[te]);
        if (!fm) break;
        flds.push(fm[1]);
        te++;
      }
      inlineTypeFields.set(tfM[1], flds);
    }
  }
  for (let fi = 0; fi < fnsAt.length; fi++) {
    const [start, fnName, skipFn] = fnsAt[fi];
    if (skipFn) continue;
    const sigM0 = lines[start].match(sigRe);
    const fnRetType = sigM0 && sigM0[3] ? sigM0[3].trim() : "";
    const isVoidFn = fnRetType === "" || fnRetType === "void";
    const end = fi + 1 < fnsAt.length ? fnsAt[fi + 1][0] : lines.length;
    const infos = fnInfo.get(fnName) || [];
    const strVars = new Set();
    const structParams = new Map(); // paramName -> type
    for (const info of infos) {
      if (info.isStr) strVars.add(info.pname);
      if (info.isStruct) structParams.set(info.pname, info.type);
    }
    const payloadTypes = new Map(); // var -> {type, declLine}
    const recreateLocals = new Map(); // local -> {producer, payload, payloadType, initLine}
    for (let i = start + 1; i < end; i++) {
      const td = lines[i].match(/^\s*var\s+([A-Za-z_$][\w$]*)\s*:\s*(ChtInlineObj[A-Za-z0-9_]*)\s*$/);
      if (td) payloadTypes.set(td[1], { type: td[2], declLine: i });
      const ci = lines[i].match(/^\s*(?:var|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(create[A-Za-z0-9_]+)\(([A-Za-z_$][\w$]*)\)\s*$/);
      if (ci) {
        const ptInfo = payloadTypes.get(ci[3]);
        const pt = ptInfo ? ptInfo.type : null;
        const prt = fnInfoRet.get(ci[2]);
        if (pt && prt && isStructType(prt) && !jsonOfTypes.has(prt)) {
          recreateLocals.set(ci[1], { producer: ci[2], payload: ci[3], payloadType: pt, payloadDeclLine: ptInfo.declLine, initLine: i, useSites: [] });
        }
      }
    }
    const aliasRoot = new Map(); // local -> root param name
    const fromJsonLocals = new Map(); // local -> {type, initLine, initRhs}
    const mutationRoots = new Set(); // roots with field-store assignments
    const elemLocals = new Set(); // loop element locals (borrow roots from seq elem reads)
    const uses = new Map(); // root -> count
    const fieldsByRoot = new Map(); // root -> Set(field)
    for (let i = start + 1; i < end; i++) {
      const line = lines[i];
      const mst = line.match(/^\s*([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*=[^=]/);
      if (mst && (structParams.has(mst[1]) || fromJsonLocals.has(mst[1]) || payloadTypes.has(mst[1]))) mutationRoots.add(mst[1]);
      const dm = line.match(/^\s*(?:var|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(.+?)\s*$/);
      if (dm) {
        const nm = dm[1], rhs = dm[2].trim();
        const elb = rhs.match(/^([A-Za-z_$][\w$]*)\[[^\[\]]+\]$/);
        if (elb) elemLocals.add(nm);
        const fj = rhs.match(/^__chtFromJson_([A-Za-z0-9_]+)\(/);
        const cc = rhs.match(/^([A-Za-z_$][\w$]*)\(/);
        if (fj) {
          fromJsonLocals.set(nm, { type: fj[1], initLine: i, initRhs: rhs });
        } else if (cc && !strVars.has(nm)) {
          const rt2 = fnInfoRet.get(cc[1]);
          if (rt2 && isStructType(rt2) && jsonOfTypes.has(rt2)) fromJsonLocals.set(nm, { type: rt2, initLine: i, initRhs: rhs });
          else if (rt2 === "str") strVars.add(nm);
        } else if (/^".*"$/.test(rhs) || /^__t\d+_tern$/.test(rhs) || /^strings\.ConcatStr\(/.test(rhs)) {
          strVars.add(nm);
        } else if (/^[A-Za-z_$][\w$]*$/.test(rhs)) {
          if (strVars.has(rhs)) {
            strVars.add(nm);
          } else {
            const rt = aliasRoot.get(rhs) || (structParams.has(rhs) ? rhs : null);
            if (rt) aliasRoot.set(nm, rt);
          }
        } else {
          if (rhs.startsWith("__chtFld_")) {
            const fm = rhs.slice(9).match(/^([A-Za-z0-9_]+)_([A-Za-z_$][\w$]*)\(/);
            if (fm) {
              const fty2 = fieldType.get(fm[1] + "::" + fm[2]);
              if (fty2 === "str") strVars.add(nm);
            }
          } else {
            const cm2 = rhs.match(/^([A-Za-z_$][\w$]*)\(/);
            if (cm2 && fnInfoRet.get(cm2[1]) === "str") strVars.add(nm);
          }
        }
      }
      const dmRe = line.match(/^\s*([A-Za-z_$][\w$]*)\s*=\s*(.+?)\s*$/);
      if (!dm && dmRe) {
        const nm = dmRe[1], rhs = dmRe[2].trim();
        if (/^".*"$/.test(rhs) || /^__t\d+_tern$/.test(rhs) || /^strings\.ConcatStr\(/.test(rhs)) {
          strVars.add(nm);
        } else if (/^[A-Za-z_$][\w$]*$/.test(rhs)) {
          if (strVars.has(rhs)) strVars.add(nm);
        } else {
          const cm3 = rhs.match(/^([A-Za-z_$][\w$]*)\(/);
          if (cm3 && fnInfoRet.get(cm3[1]) === "str") strVars.add(nm);
          else if (rhs.startsWith("__chtFld_")) {
            const fm3 = rhs.slice(9).match(/^([A-Za-z0-9_]+)_([A-Za-z_$][\w$]*)\(/);
            if (fm3 && fieldType.get(fm3[1] + "::" + fm3[2]) === "str") strVars.add(nm);
          }
        }
      }
      const rootOf = (n) => aliasRoot.get(n) || (structParams.has(n) ? n : null) || (fromJsonLocals.has(n) ? n : null);
      for (const fr of line.matchAll(/([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)/g)) {
        const root = rootOf(fr[1]);
        if (root) {
          if (!fieldsByRoot.has(root)) fieldsByRoot.set(root, new Set());
          fieldsByRoot.get(root).add(fr[2]);
        }
      }
      for (const call of findCalls(line)) {
        const cinfos = fnInfo.get(call.callee);
        if (!cinfos) continue;
        const parts = splitTopSA(line.slice(call.idx + 1, call.closeIdx));
        if (parts.length !== cinfos.length) continue;
        for (let a = 0; a < parts.length; a++) {
          const formal = cinfos[a], arg = parts[a];
          if (!formal || !formal.isStruct || !/^[A-Za-z_$][\w$]*$/.test(arg)) continue;
          const root = rootOf(arg);
          if (root) uses.set(root, (uses.get(root) || 0) + 1);
          else if (recreateLocals.has(arg)) {
            uses.set(arg, (uses.get(arg) || 0) + 1);
            recreateLocals.get(arg).useSites.push(i);
          }
        }
      }
    }
    // decide snapshots (managed params need entry snapshots even when never used as call args)
    const snapOf = new Map(); // root -> snapVar
    const snapInsert = new Map(); // lineIdx -> preLines[]
    const snapReplace = new Map(); // lineIdx -> replacement (init lines)
    const recreateUse = new Map(); // local -> {clones:[{site,lines,varName}] }
    for (const [nm, info] of recreateLocals) {
      const nUses = info.useSites.length;
      if (nUses >= 2) recreateUse.set(nm, { info });
    }
    const snapCandidates = new Set([...uses.keys()]);
    for (const p of structParams.keys()) snapCandidates.add(p);
    for (const root of snapCandidates) {
      const cnt = uses.get(root) || 0;
      const isParam = structParams.has(root);
      const t = structParams.get(root) || fromJsonLocals.get(root)?.type;
      if (!t) continue;
      if (isParam) {
        // every managed param with a codec gets an entry snapshot: guarantees the
        // value is consumed before any early-return path (drop is inexact otherwise)
        if (!jsonOfTypes.has(t)) continue;
      } else {
        if (cnt < 2 && !(fieldsByRoot.get(root)?.size >= 1)) continue;
      }
      const sv = `__chtSnapJson${snapK++}`;
      snapOf.set(root, sv);
      const fl = fromJsonLocals.get(root);
      if (fl && mutationRoots.has(root)) {
        // mutated local: rebuild from snapshot at init site; all other uses stay
        // untouched so mutation flows keep working (single-owner semantics preserved)
        const ind0 = lines[fl.initLine].match(/^\s*/)[0];
        snapInsert.set(fl.initLine, [`${ind0}var ${sv} = json.Stringify(__chtJsonOf_${t}(${fl.initRhs}))`]);
        snapReplace.set(fl.initLine, `${ind0}var ${root} = __chtFromJson_${t}(json.ParseJsonNodeOrDie(strings.ConcatStr(${sv}, "")))`);
        snapOf.delete(root);
        snapCount--;
        continue;
      } else if (isParam) {
        // managed struct param: snapshot MUST sit at fn entry so every early-return
        // path finds the param already consumed (scope-exit drop is inexact).
        const li = start + 1;
        const indent = lines[li].match(/^\s*/)[0];
        const prevPre = snapInsert.get(li);
        const snapLine = `${indent}var ${sv} = json.Stringify(__chtJsonOf_${t}(${root}))`;
        if (prevPre) prevPre.push(snapLine);
        else snapInsert.set(li, [snapLine]);
      } else {
        // pure-value local: consume the produced value at its init line; every
        // use site is rebuilt fresh from the snapshot (multi-consumer safe)
        const ind0 = lines[fl.initLine].match(/^\s*/)[0];
        snapReplace.set(fl.initLine, `${ind0}var ${sv} = json.Stringify(__chtJsonOf_${t}(${fl.initRhs}))`);
      }
      snapCount++;
    }
    // note: even with empty snapOf, rebuilt-mutation locals still need the rewrite pass
    const freshFor = (root, type) => {
      freshSites++;
      return `__chtFromJson_${type}(json.ParseJsonNodeOrDie(strings.ConcatStr(${snapOf.get(root)}, "")))`;
    };
    const rewriteLineText = (inputLine) => {
      let line = inputLine;
      const amA = line.match(/^\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s*=\s*([A-Za-z_$][\w$]*)\s*$/);
      let wrapped = false;
      if (amA && strVars.has(amA[2])) {
        line = line.match(/^\s*/)[0] + amA[1] + ' = strings.ConcatStr(' + amA[2] + ', "")';
        wrapped = true;
      }
      let out2 = "";
      let fxChanged = false;
      let k2 = 0, inS2 = false, ch2 = false;
      while (k2 < line.length) {
        const c3 = line[k2];
        if (inS2) { out2 += c3; if (c3 === "\\") { out2 += line[k2+1] ?? ""; k2 += 2; continue; } if (c3 === '"') inS2 = false; k2++; continue; }
        if (c3 === '"') { inS2 = true; out2 += c3; k2++; continue; }
        if (/[A-Za-z_$]/.test(c3)) {
          let j3 = k2; while (j3 < line.length && /[\w$]/.test(line[j3])) j3++;
          const w3 = line.slice(k2, j3);
          const rt3 = aliasRoot.get(w3) || (structParams.has(w3) ? w3 : null) || (fromJsonLocals.has(w3) ? w3 : null);
          if (line[j3] === "." && rt3 && snapOf.has(rt3)) {
            let f3 = j3 + 1; while (f3 < line.length && /[\w$]/.test(line[f3])) f3++;
            const fld3 = line.slice(j3 + 1, f3);
            const ty3 = structParams.get(rt3) || fromJsonLocals.get(rt3).type;
            const ek3 = ty3 + "::" + fld3;
            const ft3 = fieldType.get(ek3);
            if (ft3 === "str" || ft3 === "bool" || ft3 === "int64" || ft3 === "int32") {
              extractorMap.set(ek3, { ty: ty3, fld: fld3, fty: ft3 });
              fieldReads++; ch2 = true;
              out2 += `__chtFld_${ty3}_${fld3}(${freshFor(rt3, ty3)})`;
              k2 = f3;
              continue;
            }
          }
          out2 += w3; k2 = j3;
          continue;
        }
        if (c3 === "(" && out2.length > 0) {
          const cm4 = out2.match(/([A-Za-z_$][\w$]*)$/);
          const cal4 = cm4 ? cm4[1] : "";
          const bc4 = out2.slice(0, out2.length - cal4.length);
          if (!cal4 || /[.]$/.test(bc4) || !fnInfo.has(cal4)) { out2 += c3; k2++; continue; }
          let d4 = 1, ci4 = -1, s4 = false;
          for (let j4 = k2 + 1; j4 < line.length; j4++) {
            if (s4) { if (line[j4] === "\\") j4++; else if (line[j4] === '"') s4 = false; continue; }
            if (line[j4] === '"') { s4 = true; continue; }
            if (line[j4] === "(") d4++;
            else if (line[j4] === ")") { d4--; if (d4 === 0) { ci4 = j4; break; } }
          }
          if (ci4 < 0 || s4) { out2 += c3; k2++; continue; }
          const ps4 = splitTopSA(line.slice(k2 + 1, ci4));
          const cf4 = fnInfo.get(cal4) || [];
          const fx4 = ps4.map((arg, ai) => {
            const fo = cf4[ai];
            if (!fo) return arg;
            const adx = arg.indexOf(".");
            if (adx > 0 && /^[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*$/.test(arg) && fo.isStr && elemLocals.has(arg.slice(0, adx))) {
              strWraps++;
              fxChanged = true;
              return `strings.CloneStr(${arg})`;
            }
            if (fo.isStruct && elemLocals.has(arg) && jsonOfTypes.has(fo.type)) {
              fxChanged = true;
              return `__chtFromJson_${fo.type}(json.ParseJsonNodeOrDie(json.JsonStringify(__chtJsonOf_${fo.type}(${arg}))))`;
            }
            if (!/^[A-Za-z_$][\w$]*$/.test(arg)) return arg;
            const rr = aliasRoot.get(arg) || (structParams.has(arg) ? arg : null) || (fromJsonLocals.has(arg) ? arg : null);
            if (fo.isStr && strVars.has(arg)) { return `strings.ConcatStr(${arg}, "")`; }
            if (fo.isStruct && rr && snapOf.has(rr)) {
              const ty5 = structParams.get(rr) || fromJsonLocals.get(rr).type;
              if (ty5 !== fo.type) return arg;
              return freshFor(rr, ty5);
            }
            return arg;
          }).join(', ');
          out2 += "(" + fx4 + ")";
          k2 = ci4 + 1;
          continue;
        }
        out2 += c3; k2++;
      }
      return (ch2 || fxChanged) ? out2 : (wrapped ? line : null);
    };
    // ---- rewrite body
    const cloneEdits = [];
    for (const [nm2, rr] of recreateUse) {
      const info = rr.info;
      const nUses = info.useSites.length;
      if (nUses < 2) continue;
      const blkStart = info.payloadDeclLine;
      const blkEnd = info.initLine;
      if (!(blkStart < blkEnd)) continue;
      const origL = lines.slice(blkStart, blkEnd + 1);
      for (let k2 = 2; k2 <= nUses; k2++) {
        const suffix = "__c" + k2;
        const declNames = new Set([info.payload, nm2]);
        for (const dl of origL) {
          const ddm = dl.match(/^\s*(?:var|let)\s+([A-Za-z_$][\w$]*)\s*(?::|=(?!=))/);
          if (ddm) declNames.add(ddm[1]);
        }
        const renamedRaw = origL.map((l) => {
          let outl = l;
          for (const dn of declNames) {
            outl = outl.replace(new RegExp("\\b" + dn + "\\b", "g"), dn + suffix);
          }
          return outl;
        });
        const renamedT = renamedRaw.map((l) => { const t = rewriteLineText(l); return t === null ? l : t; });
        cloneEdits.push({ lineIndex: info.useSites[k2 - 1], insertBefore: renamedT, renameFrom: nm2, renameTo: nm2 + suffix });
      }
    }
    const editsArr = [];
    const collapse = new Set();
    for (let i = start + 1; i < end; i++) {
      if (collapse.has(i)) continue;
      let line = lines[i];
      const preLines = snapInsert.get(i) || [];
      const repl0 = snapReplace.get(i);
      {
        const ci0 = line.match(/^\s*if !\(len\(([A-Za-z_$][\w$]*)\) > 0\):\s*$/);
        if (ci0 && i + 1 < end) {
          const as1 = lines[i + 1].match(/^\s*[A-Za-z_$][\w$]*\s*=\s*""\s*$/);
          const nmC = ci0[1];
          if (as1 && lines[i + 1].trim().startsWith(nmC + " =") && strVars.has(nmC)) {
            collapse.add(i);
            collapse.add(i + 1);
            const ind = line.match(/^\s*/)[0];
            editsArr.push({ lineIndex: i + 1, pre: [], replacement: null, drop: true });
            editsArr.push({ lineIndex: i, pre: preLines, replacement: ind + nmC + " = __chtStrNonEmpty(" + nmC + ")", drop: false });
            continue;
          }
        }
      }
      const dmPure = line.match(/^(\s*)(?:var|let)\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*$/);
      if (dmPure && !repl0) {
        const rt = aliasRoot.get(dmPure[3]) || dmPure[3];
        if (snapOf.has(rt)) {
          editsArr.push({ lineIndex: i, pre: preLines, replacement: null, drop: true });
          continue;
        }
      }
      if (repl0 !== undefined) {
        editsArr.push({ lineIndex: i, pre: preLines, replacement: repl0, drop: false });
        continue;
      }
      const dmInit = line.match(/^\s*(?:var|let)\s+([A-Za-z_$][\w$]*)\s*=\s*__chtFromJson_[A-Za-z0-9_]+\(/);
      if (dmInit && snapOf.has(dmInit[2])) {
        editsArr.push({ lineIndex: i, pre: preLines, replacement: null, drop: true });
        continue;
      }
      // CSG emits JS-style `return 0` inside void async handlers; a void fn
      // must return nothing, so strip the literal (contract admission rejects it)
      if (isVoidFn && /^\s*return\s+-?[0-9]+\s*$/.test(line)) {
        const indR = line.match(/^\s*/)[0];
        editsArr.push({ lineIndex: i, pre: preLines, replacement: indR + "return", drop: false });
        continue;
      }
      // bare dotted-projection statement (e.g. `snapshot.callSessions`): pure field
      // read with no side effect; dropping it removes a stray consume point
      if (/^\s*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\s*$/.test(line)) {
        editsArr.push({ lineIndex: i, pre: preLines, replacement: null, drop: true });
        continue;
      }
      const amAssign = line.match(/^\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s*=\s*([A-Za-z_$][\w$]*)\s*$/);
      let assignWrapped = false;
      if (amAssign && strVars.has(amAssign[2]) && !/^(__chtAsyncError|__t1_tryErr)$/.test(amAssign[2].split(".")[0]) && !/^(__chtAsyncError|__t1_tryErr)/.test(amAssign[1])) {
        line = line.match(/^\s*/)[0] + amAssign[1] + ' = strings.ConcatStr(' + amAssign[2] + ', "")';
        strWraps++;
        assignWrapped = true;
      }
      let out = "";
      let k = 0, inStr = false, changed = assignWrapped;
      while (k < line.length) {
        const ch = line[k];
        if (inStr) { out += ch; if (ch === "\\") { out += line[k+1] ?? ""; k += 2; continue; } if (ch === '"') inStr = false; k++; continue; }
        if (ch === '"') { inStr = true; out += ch; k++; continue; }
        if (/[A-Za-z_$]/.test(ch)) {
          let j = k; while (j < line.length && /[\w$]/.test(line[j])) j++;
          const word = line.slice(k, j);
          const root = aliasRoot.get(word) || (structParams.has(word) ? word : null) || (fromJsonLocals.has(word) ? word : null);
          const bareTy = structParams.get(word) || fromJsonLocals.get(word)?.type;
          if (line[j] !== "." && line[j] !== "(" && !out.endsWith(".") && bareTy && snapOf.has(word)) {
            out += freshFor(word, bareTy);
            changed = true;
            k = j;
            continue;
          }
          if (line[j] === "." && root && snapOf.has(root)) {
            let ty0 = structParams.get(root) || fromJsonLocals.get(root)?.type;
            let curTy = ty0;
            let k2 = j;
            const chain = [];
            while (line[k2] === ".") {
              let f2 = k2 + 1; while (f2 < line.length && /[\w$]/.test(line[f2])) f2++;
              const fname = line.slice(k2 + 1, f2);
              const ft = fieldType.get(curTy + "::" + fname);
              if (!ft) break;
              chain.push({ fname, ft, prevTy: curTy });
              curTy = ft;
              k2 = f2;
            }
            if (chain.length > 0) {
              let text = freshFor(root, ty0);
              for (const it of chain) {
                extractorMap.set(it.prevTy + "::" + it.fname, { ty: it.prevTy, fld: it.fname, fty: it.ft });
                text = `__chtFld_${it.prevTy}_${it.fname}(${text})`;
              }
              fieldReads += chain.length; changed = true;
              out += text; k = k2;
              continue;
            }
          }
          out += word; k = j;
          continue;
        }
        if (ch === "(" && out.length > 0) {
          const cm = out.match(/([A-Za-z_$][\w$]*)$/);
          const callee = cm ? cm[1] : "";
          const beforeCallee = out.slice(0, out.length - callee.length);
          if (!callee || /[.]$/.test(beforeCallee) || !fnInfo.has(callee)) { out += ch; k++; continue; }
          let d = 1, closeIdx = -1, s2 = false;
          for (let j = k + 1; j < line.length; j++) {
            if (s2) { if (line[j] === "\\") j++; else if (line[j] === '"') s2 = false; continue; }
            if (line[j] === '"') { s2 = true; continue; }
            if (line[j] === "(") d++;
            else if (line[j] === ")") { d--; if (d === 0) { closeIdx = j; break; } }
          }
          if (closeIdx < 0 || s2) { out += ch; k++; continue; }
          const parts = splitTopSA(line.slice(k + 1, closeIdx));
          const cinfos = fnInfo.get(callee) || [];
          const fixed = parts.map((arg, idx2) => {
            const formal = cinfos[idx2];
            if (!formal && strVars.has(arg) && !snapOf.has(aliasRoot.get(arg) || arg)) {
              // unknown external callee: copy str args so the local is never moved
              strWraps++;
              changed = true;
              return `strings.ConcatStr(${arg}, "")`;
            }
            const adx2 = arg.indexOf(".");
            if (adx2 > 0 && /^[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*$/.test(arg) && formal.isStr && elemLocals.has(arg.slice(0, adx2))) {
              strWraps++;
              changed = true;
              return `strings.CloneStr(${arg})`;
            }
            if (!formal || !/^[A-Za-z_$][\w$]*$/.test(arg)) {
              if (!snapOf.size) return arg;
              if (/^[A-Za-z_$][\w$]*$/.test(arg)) {
                const rt3 = aliasRoot.get(arg) || (structParams.has(arg) ? arg : null) || (fromJsonLocals.has(arg) ? arg : null);
                const ty3 = rt3 ? (structParams.get(rt3) || fromJsonLocals.get(rt3)?.type) : null;
                if (rt3 && ty3 && snapOf.has(rt3)) {
                  changed = true;
                  return freshFor(rt3, ty3);
                }
              }
              arg = arg.replace(/\(([A-Za-z_$][\w$]*)\)\./g, "$1.");
              return arg.replace(/\b([A-Za-z_$][\w$]*)\.([\w$]*)/g, (mm, w, fld) => {
                const rt2 = aliasRoot.get(w) || (structParams.has(w) ? w : null) || (fromJsonLocals.has(w) ? w : null);
                if (!rt2 || !snapOf.has(rt2)) return mm;
                const ty2 = structParams.get(rt2) || fromJsonLocals.get(rt2)?.type;
                const fty2 = fieldType.get(ty2 + "::" + fld);
                if (!(fty2 === "str" || fty2 === "bool" || fty2 === "int64" || fty2 === "int32")) return mm;
                extractorMap.set(ty2 + "::" + fld, { ty: ty2, fld, fty: fty2 });
                fieldReads++;
                changed = true;
                return `__chtFld_${ty2}_${fld}(${freshFor(rt2, ty2)})`;
              });
            }
            const root = aliasRoot.get(arg) || (structParams.has(arg) ? arg : null) || (fromJsonLocals.has(arg) ? arg : null);
            if (formal.isStr && strVars.has(arg)) { strWraps++; changed = true; return `strings.ConcatStr(${arg}, "")`; }
            if (formal.isStruct && elemLocals.has(arg) && jsonOfTypes.has(formal.type)) {
              changed = true;
              return `__chtFromJson_${formal.type}(json.ParseJsonNodeOrDie(json.JsonStringify(__chtJsonOf_${formal.type}(${arg}))))`;
            }
            if (formal.isStruct && root && recreateUse.has(root)) {
              const rr = recreateUse.get(root);
              changed = true;
              return `${rr.producer}(__chtFromJson_${rr.payloadType}(json.ParseJsonNodeOrDie(strings.ConcatStr(${rr.snap}, ""))))`;
            }
            if (formal.isStruct && root) {
              const ty = structParams.get(root) || fromJsonLocals.get(root)?.type;
              if (!ty) return arg;
              if (ty === formal.type) {
                if (snapOf.has(root)) {
                  changed = true;
                  return freshFor(root, ty);
                }
                return arg;
              }
              // nominal typing: a wider struct arg must be narrowed to the
              // formal's type via an explicit field-wise conversion temp
              if (!structDefs.has(ty) || !structDefs.has(formal.type)) return arg;
              const srcV = `__chtNarrowSrc${narrowK}`;
              const nv = `__chtNarrow${narrowK++}`;
              const indM = line.match(/^\s*/);
              const ind2 = indM ? indM[0] : "    ";
              const srcE = snapOf.has(root) ? freshFor(root, ty) : arg;
              preLines.push(`${ind2}var ${srcV}: ${ty} = ${srcE}`);
              preLines.push(`${ind2}var ${nv}: ${formal.type}`);
              for (const ff of structDefs.get(formal.type)) {
                if (ff.ty === "str") preLines.push(`${ind2}${nv}.${ff.name} = strings.ConcatStr(${srcV}.${ff.name}, "")`);
                else preLines.push(`${ind2}${nv}.${ff.name} = ${srcV}.${ff.name}`);
              }
              if (jsonOfTypes.has(ty)) preLines.push(`${ind2}json.Stringify(__chtJsonOf_${ty}(${srcV}))`);
              changed = true;
              return nv;
            }
            return arg;
          }).join(', ');
          out += "(" + fixed + ")";
          k = closeIdx + 1;
          continue;
        }
        out += ch; k++;
      }
        if (changed || preLines.length > 0) {
        editsArr.push({ lineIndex: i, pre: preLines, replacement: changed ? out : null, drop: false });
      }
    }

    for (const e of editsArr) editsGlobal.push(e);
    for (const ce of cloneEdits) editsGlobal.push(ce);
  }
  editsGlobal.sort((a, b) => b.lineIndex - a.lineIndex);
  for (const e of editsGlobal) {
    if (e.insertBefore) {
      const re = new RegExp("\\b" + e.renameFrom + "\\b");
      lines[e.lineIndex] = lines[e.lineIndex].replace(re, e.renameTo);
      lines.splice(e.lineIndex, 0, ...e.insertBefore);
      continue;
    }
    const orig = lines[e.lineIndex];
    const repl = e.drop ? null : (e.replacement !== null ? e.replacement : orig);
    lines.splice(e.lineIndex, 1, ...e.pre, repl);
  }
  // r17: align inline-object call sites with producer formal types.
  // TS optional fields are materialized as required cheng struct fields, so a
  // call site whose literal omits optional members gets its own narrower
  // ChtInlineObj hash; passing it to the producer (declared on the superset)
  // fails nominal identity. When the formal's field set is a superset of the
  // site type's, retype the site local to the formal — every existing field
  // assignment stays valid and unset extras stay at zero value, exactly like
  // the original TS semantics (missing optional = undefined/zero).
  {
    let retyped = 0;
    for (let i = 0; i < lines.length; i++) {
      const dm = /^    var ([A-Za-z_$][\w$]*): (ChtInlineObj_[0-9a-f]{8})$/.exec(lines[i]);
      if (!dm) continue;
      const localName = dm[1];
      const siteType = dm[2];
      let fnEnd = i + 1;
      while (fnEnd < lines.length && /^\s/.test(lines[fnEnd])) fnEnd++;
      for (let k = i + 1; k < fnEnd; k++) {
        const callIdx = lines[k].indexOf("(" + localName + ")");
        if (callIdx <= 0) continue;
        const before = lines[k].slice(0, callIdx);
        const idm = /([A-Za-z_][A-Za-z0-9_]*)$/.exec(before);
        if (!idm) continue;
        const pf = producerFormals.get(idm[1]);
        if (!pf || pf.formal === siteType) continue;
        const fFields = inlineTypeFields.get(pf.formal);
        const sFields = inlineTypeFields.get(siteType);
        if (!fFields || !sFields) continue;
        let superset = true;
        for (const f of sFields) if (!fFields.includes(f)) { superset = false; break; }
        if (!superset) continue;
        lines[i] = "    var " + localName + ": " + pf.formal;
        retyped++;
        break;
      }
    }
    if (retyped > 0) process.stderr.write("  r17 inline-site retype: " + retyped + " local(s) aligned to producer formals\n");
  }

  const helperLines = [];
  for (const key of [...extractorMap.keys()].sort()) {
    const { ty, fld, fty } = extractorMap.get(key);
    if (fty === "str") {
      helperLines.push(
        `fn __chtFld_${ty}_${fld}(v: ${ty}): str =`,
        `    var out = strings.ConcatStr(v.${fld}, "")`,
        `    json.Stringify(__chtJsonOf_${ty}(v))`,
        `    return out`, ""
      );
    } else {
      helperLines.push(
        `fn __chtFld_${ty}_${fld}(v: ${ty}): ${fty} =`,
        `    var out = v.${fld}`,
        `    json.Stringify(__chtJsonOf_${ty}(v))`,
        `    return out`, ""
      );
    }
  }
  let finalLines = lines.filter((l) => l !== null);
  if (extractorMap.size > 0 || generatedCodecLines.length > 0) {
    helperLines.push(
      'fn __chtStrNonEmpty(s: var str): str =',
      '    var c = strings.CloneStr(s)',
      '    if len(c) > 0:',
      '        return c',
      '    return ""',
      ""
    );
  }
  if (generatedCodecLines.length > 0) helperLines.push("", ...generatedCodecLines);
  if (helperLines.length > 0) {
    let li = -1;
    for (let i = 0; i < finalLines.length; i++) if (/^import /.test(finalLines[i])) li = i;
    finalLines.splice(li + 1, 0, "", ...helperLines);
  }
  writeFileSync(path, finalLines.join("\n"));
  console.error(`managed-args-pass ${path}: snapshots=${snapCount} freshSites=${freshSites} fieldReads=${fieldReads} strWraps=${strWraps} extractors=${extractorMap.size}`);
}
