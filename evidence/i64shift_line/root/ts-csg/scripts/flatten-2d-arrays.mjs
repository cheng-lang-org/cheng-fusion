// 2-D managed array flattening for CSG-emitted Cheng runtime sources.
//
// The current compiler cannot decompose any managed value whose type
// transitively contains a T[][] field ("value-object decomposition tree is
// not exact"), which poisons every struct holding one. Serialization fidelity
// is preserved by storing such fields flat plus explicit row/column counts
// and re-nesting at the JSON boundary, so the emitted wire format keeps the
// original nested-array shape.
//
// Transform scope: type fields declared as "E: Elem[][]" inside grouped type
// blocks, plus their __chtJsonOf_<T> / __chtFromJson_<T> codec statements.
// Cold still type-checks unreachable bodies, so T[][] JsonArray/FromJsonArray
// helpers must be deleted after flatten (stage3: lacks exact current definition).

function stripNestedArrayHelpers(lines) {
  let stripped = 0;
  let i = 0;
  while (i < lines.length) {
    if (/^fn __cht(?:JsonArray|FromJsonArray)_[0-9a-f]+\b/.test(lines[i]) && /\[\]\[\]/.test(lines[i])) {
      let end = i + 1;
      while (end < lines.length && !/^fn /.test(lines[end]) && !/^@/.test(lines[end]) && !/^type /.test(lines[end])) {
        end += 1;
      }
      while (end > i && lines[end - 1] === "") end -= 1;
      lines.splice(i, end - i);
      stripped += 1;
      continue;
    }
    i += 1;
  }
  return stripped;
}

export function flatten2DArrays(lines) {
  const twoD = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)([A-Za-z_$][\w$]*): ([A-Za-z0-9_]+)\[\]\[\]\s*$/);
    if (!m) continue;
    let tname = null;
    for (let k = i - 1; k >= 0; k--) {
      const tm = lines[k].match(/^\s*([A-Za-z0-9_]+) =\s*$/);
      if (tm) { tname = tm[1]; break; }
      if (/^fn /.test(lines[k])) break;
    }
    if (!tname) continue;
    twoD.push({ line: i, indent: m[1], field: m[2], elem: m[3], type: tname });
  }
  if (twoD.length === 0) {
    return { flattened: 0, stripped: stripNestedArrayHelpers(lines) };
  }
  // 1) rewrite declarations: flat field + explicit dims
  for (const d of twoD) {
    lines[d.line] = d.indent + d.field + ": " + d.elem + "[]";
    lines.splice(d.line + 1, 0,
      d.indent + d.field + "Rows: int64",
      d.indent + d.field + "Cols: int64");
  }
  // 2) rewrite JsonOf bodies: re-nest flat rows at the JSON boundary
  for (const d of twoD) {
    const qi = lines.findIndex((l) => l.startsWith("fn __chtJsonOf_" + d.type));
    if (qi < 0) continue;
    const li = lines.findIndex((l, k) =>
      k > qi &&
      l.includes('json.JsonSetField(out, "' + d.field + '"') &&
      l.includes("(value." + d.field + ")"));
    if (li < 0) continue;
    const ind = lines[li].match(/^\s*/)[0];
    const block = [
      ind + "var __chtB = value." + d.field,
      ind + "var __chtFlat = json.NewJArray()",
      ind + "var __chtRow = json.NewJArray()",
      ind + "var __chtI = 0",
      ind + "for item in __chtB:",
      ind + "    json.JsonAdd(__chtRow, __chtJsonOf_" + d.elem + "(item))",
      ind + "    __chtI = __chtI + 1",
      ind + "    if __chtI == value." + d.field + "Cols:",
      ind + "        json.JsonAdd(__chtFlat, __chtRow)",
      ind + "        __chtRow = json.NewJArray()",
      ind + "        __chtI = 0",
      ind + "if __chtI > 0:",
      ind + "    json.JsonAdd(__chtFlat, __chtRow)",
      ind + 'json.JsonSetField(out, "' + d.field + '", __chtFlat)',
    ];
    lines.splice(li, 1, ...block);
  }
  // 3) rewrite FromJson bodies: read nested rows into the flat storage
  for (const d of twoD) {
    const qi = lines.findIndex((l) => l.startsWith("fn __chtFromJson_" + d.type));
    if (qi < 0) continue;
    const li = lines.findIndex((l, k) =>
      k > qi &&
      l.includes("out." + d.field + " =") &&
      l.includes('json.JsonGetField(node, "' + d.field + '")'));
    if (li < 0) continue;
    const ind = lines[li].match(/^\s*/)[0];
    const block = [
      ind + 'var __chtNode = json.JsonGetField(node, "' + d.field + '")',
      ind + "if __chtNode.kind == json.JArray:",
      ind + "    var __chtRi = 0",
      ind + "    while __chtRi < __chtNode.a.len:",
      ind + "        var __chtRn = __chtNode.a[__chtRi]",
      ind + "        var __chtCi = 0",
      ind + "        while __chtCi < __chtRn.a.len:",
      ind + "            add(out." + d.field + ", __chtFromJson_" + d.elem + "(json.JsonOwnedClone(__chtRn.a[__chtCi])))",
      ind + "            __chtCi = __chtCi + 1",
      ind + "        __chtRi = __chtRi + 1",
      ind + "    out." + d.field + "Rows = int64(__chtNode.a.len)",
      ind + "    if __chtNode.a.len > 0:",
      ind + "        out." + d.field + "Cols = int64(__chtNode.a[0].a.len)",
    ];
    lines.splice(li, 1, ...block);
  }
  return { flattened: twoD.length, stripped: stripNestedArrayHelpers(lines) };
}
