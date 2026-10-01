#!/usr/bin/env python3
"""move_into_field_completeness_gate.py — *Into 家族字段完整性棘轮门（只读静态分析）。

背景：`*MoveInto/TransferInto/CloneInto/CopyInto/StealInto/AdoptInto` 家族按字段
手工搬运结构体时，声明字段漏搬不报错（新字段不会让旧函数编译失败），池化/encode
阶段才 hard panic。实测 `PrimaryBodyIRMoveInto` 漏 7/85 字段导致池化后 encode panic；
`TypedExprIrMoveInto` 漏 22/325（同族，当前不可观测）。

分析口径（每步都有判词，无 "something wrong" 式输出）：

1. 类型表：扫 `src/**/*.cheng`，解析 `type` 块内 `Name =`（隐式 object）/
   `Name = object ...` / `Name = ref object ...` / 独立 `type Name =` 形式，
   字段取表头缩进 +4 处 `name:` 行；跳过注释、空行、更深缩进的嵌套构造。
2. 家族函数：`fn NAME(`，NAME 以 6 个后缀之一结尾；签名需存在同类型 source 参数，
   dst 取 out/dst/dest/destination/target/into/result 命名参数（无此命名 => 跳过并
   记 `ambiguous-direction`，不猜方向以免误报）。
3. 覆盖集 = 直接写 `S.f = ` / `S.f[...] = ` / `S.f.g = `（R1） ∪ 间接写：`S.f` 作为
   参数传给 `*Into` 家族（R2）、append 家族 `add/append/push/insert` 首参（R3）、
   名字含 Copy/Clone 的搬运 helper 且该 helper 有 var 形参（R4）。
4. 放行（不算命中，进 --explain）：`dst = src` 整体拷贝；`dst = <local>` /
   `dst = <call>(...)` 整体赋值（覆盖责任在生产者，例如 `out = staged`、
   `out = schema.XxxClone(base)`）；目标类型无声明（Bytes 等内建非结构目标，
   字节拷贝按位进行，不做字段级要求）或声明有歧义（多份不同字段表）。
5. 棘轮：命中按 (file, function) 建键，missing 字段集只允许减少——新键或旧键新增
   缺失字段 => 违规 exit 1；减少/消失只报告（stale/improved，不失败）。已知命中写
   `tools/move_into_field_completeness_baseline.tsv`（每行带 status/reason/出处）。

用法：
    python3 tools/move_into_field_completeness_gate.py                # 棘轮门（默认）
    python3 tools/move_into_field_completeness_gate.py --require-clean  # 严格：baseline 命中也算失败
    python3 tools/move_into_field_completeness_gate.py --explain        # 打印被放行函数及理由（误报可枚举）
    python3 tools/move_into_field_completeness_gate.py --json           # 机器可读
    python3 tools/move_into_field_completeness_gate.py --update-baseline
    python3 tools/move_into_field_completeness_gate.py --self-test      # 合成夹具契约测试（/private/tmp，只读仓库）
    python3 tools/move_into_field_completeness_gate.py --root DIR [--baseline PATH]

baseline schema（TSV，`#` 开头为注释）：
    # schema<TAB>cheng.move_into.field_completeness.v1
    file<TAB>function<TAB>type<TAB>declared<TAB>missing_count<TAB>missing_fields<TAB>status<TAB>reason

退出码：0 = PASS（无新增；--require-clean 下无任何命中）；1 = FAIL（新增命中 /
--require-clean 有命中 / baseline 缺失 / --self-test 断言失败）；
2 = 用法或环境错误（root 无 src/、baseline 列数/数字列非法）。

只读：本工具不写任何仓库文件（--update-baseline 除外，且必须显式给出）。
"""
from __future__ import annotations

import argparse
import contextlib
import io
import json
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path

SCHEMA = "cheng.move_into.field_completeness.v1"
FAMILY_SUFFIXES = ("MoveInto", "TransferInto", "CloneInto", "CopyInto", "StealInto", "AdoptInto")
DST_NAMES = ("out", "dst", "dest", "destination", "target", "into", "result")
SRC_NAMES = ("src", "source", "from", "in", "input", "value", "ir", "node", "other", "base")
APPEND_CALLEES = frozenset({"add", "append", "push", "insert"})
# 内建非结构目标：字节/字符串缓冲区，搬运按位或按长度进行，不存在"字段表"。
NON_STRUCT_TARGETS = frozenset({
    "Bytes", "str", "cstring", "FixedBytes32",
    "uint8", "uint16", "uint32", "uint64",
    "int8", "int16", "int32", "int64", "bool", "f32", "f64", "char",
})
COPY_CLONE_HELPER_RE = re.compile(r"(Copy|Clone)")

TYPE_BLOCK_RE = re.compile(r"^(\s*)type\s*$")
TYPE_INLINE_RE = re.compile(r"^(\s*)type\s+([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*=\s*(.*)$")
HEADER_IN_BLOCK_RE = re.compile(r"^(\s*)([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*=\s*(.*)$")
# 字段：`name: Type`，允许类型写在下一行（如 TypedExprIr 的
# valueDefinitions_borrowOwnerValueDefinitionRows:）。
FIELD_RE = re.compile(r"^(\s*)([A-Za-z_]\w*)\s*:(?:\s*\S|\s*$)")
FN_RE = re.compile(r"^(\s*)(?:export\s+)?fn\s+([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*\(")
# Cheng 形参写法是 `name: var Type`（var 在冒号之后，不是 `var name: Type`）。
PARAM_RE = re.compile(r"^([A-Za-z_]\w*)\s*:\s*(var\s+)?(.+)$")
# 直接字段写：S.f = / S.f[i] = / S.f.g = ，排除 ==/<=/>=/!= 比较。
FIELD_WRITE_RE_TMPL = r"^[ \t]*{S}\.([A-Za-z_]\w*)[^\n=]*?(?<![<>=!])=(?!=)"
CALLEE_RE = re.compile(r"([A-Za-z_][\w.]*)\s*\(")


class TypeDecl:
    __slots__ = ("name", "file", "line", "fields", "indent")

    def __init__(self, name, file, line, fields, indent):
        self.name = name
        self.file = file
        self.line = line
        self.fields = fields
        self.indent = indent


class Param:
    __slots__ = ("name", "type", "is_var")

    def __init__(self, name, type_, is_var):
        self.name = name
        self.type = type_
        self.is_var = is_var


class Func:
    __slots__ = ("name", "file", "line", "params", "body")

    def __init__(self, name, file, line, params, body):
        self.name = name
        self.file = file
        self.line = line
        self.params = params
        self.body = body


class Verdict:
    __slots__ = ("status", "reason", "func", "type_name", "declared", "covered_direct",
                 "covered_indirect", "missing", "pending_delegation")

    def __init__(self, status, reason, func=None, type_name=None, declared=None,
                 covered_direct=None, covered_indirect=None, missing=None):
        self.status = status  # hit | clean | skip
        self.reason = reason
        self.func = func
        self.type_name = type_name
        self.declared = declared or []
        self.covered_direct = covered_direct or set()
        self.covered_indirect = covered_indirect or set()
        self.missing = missing or []
        self.pending_delegation = None

    @property
    def key(self):
        return (self.func.file, self.func.name) if self.func else None


def rel(path: Path, root: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.as_posix()


def indent_of(line: str) -> int:
    return len(line) - len(line.lstrip())


def object_rhs_ok(rhs: str) -> bool:
    rhs = rhs.strip()
    return rhs == "" or rhs.startswith("object") or rhs.startswith("ref object")


def parse_types(path: Path, root: Path):
    """解析一个 .cheng 文件的 object 字段表，返回 [TypeDecl]。"""
    decls = []
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    n = len(lines)
    relpath = rel(path, root)
    i = 0
    while i < n:
        line = lines[i]

        inline = TYPE_INLINE_RE.match(line)
        if inline and object_rhs_ok(inline.group(3)):
            decls.append(_collect_fields(lines, relpath, i, inline.group(2), indent_of(line)))
            i += 1
            continue

        block = TYPE_BLOCK_RE.match(line)
        if block:
            block_indent = indent_of(line)
            i += 1
            while i < n:
                cur = lines[i]
                if not cur.strip():
                    i += 1
                    continue
                if indent_of(cur) <= block_indent:
                    break
                hm = HEADER_IN_BLOCK_RE.match(cur)
                if hm and indent_of(cur) == block_indent + 4 and object_rhs_ok(hm.group(3)):
                    decls.append(_collect_fields(lines, relpath, i, hm.group(2), indent_of(cur)))
                    i += 1
                    continue
                i += 1
            continue

        i += 1
    return decls


def _collect_fields(lines, relpath, header_idx, name, header_indent) -> TypeDecl:
    fields = []
    field_indent = None
    j = header_idx + 1
    n = len(lines)
    while j < n:
        cur = lines[j]
        if not cur.strip() or cur.lstrip().startswith("#"):
            j += 1
            continue
        ci = indent_of(cur)
        if ci <= header_indent:
            break
        fm = FIELD_RE.match(cur)
        if fm:
            if field_indent is None:
                field_indent = ci
            if ci == field_indent:
                fields.append(fm.group(2))
        j += 1
    return TypeDecl(name, relpath, header_idx + 1, fields, header_indent)


def parse_funcs(path: Path, root: Path):
    """解析一个 .cheng 文件的函数定义，返回 [Func]（含全部函数，不筛家族）。"""
    funcs = []
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    n = len(lines)
    relpath = rel(path, root)
    for idx, line in enumerate(lines):
        m = FN_RE.match(line)
        if not m:
            continue
        name = m.group(2)
        # 收集签名直到括号配平
        depth = 0
        started = False
        sig_parts = []
        j = idx
        while j < n:
            for ch in lines[j]:
                if ch == "(":
                    depth += 1
                    started = True
                elif ch == ")":
                    depth -= 1
            sig_parts.append(lines[j])
            if started and depth <= 0:
                break
            j += 1
        sigtext = "\n".join(sig_parts)
        body = []
        k = j + 1
        while k < n:
            bl = lines[k]
            if bl.strip() and indent_of(bl) == 0:
                break
            body.append(bl)
            k += 1
        funcs.append(Func(name, relpath, idx + 1, parse_params(sigtext), "\n".join(body)))
    return funcs


def parse_params(sigtext: str):
    start = sigtext.find("(")
    if start < 0:
        return []
    depth = 0
    end = None
    for p in range(start, len(sigtext)):
        ch = sigtext[p]
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                end = p
                break
    if end is None:
        return []
    inner = sigtext[start + 1:end]
    parts, cur, d = [], "", 0
    for ch in inner:
        if ch in "([":
            d += 1
        elif ch in ")]":
            d -= 1
        if ch == "," and d == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    if cur.strip():
        parts.append(cur)
    params = []
    for p in parts:
        p = " ".join(p.split())
        if not p:
            continue
        pm = PARAM_RE.match(p)
        if not pm:
            continue
        params.append(Param(pm.group(1), pm.group(3).strip(), bool(pm.group(2))))
    return params


def short_type(t: str) -> str:
    t = t.replace("var ", "").strip()
    # 去泛型实参
    if "[" in t:
        t = t[:t.index("[")]
    if "." in t:
        t = t.split(".")[-1]
    return t


def build_sig_index(funcs):
    """短名 -> [params]，用于 R4 的 var 形参判定。"""
    idx = {}
    for f in funcs:
        idx.setdefault(f.name, []).append(f.params)
    return idx


def resolve_type(name: str, func_file: str, type_index):
    decls = type_index.get(name, [])
    if name in NON_STRUCT_TARGETS:
        return None, "non-struct-target:%s" % name
    if not decls:
        return None, "unresolved-type:%s" % name
    same = [d for d in decls if d.file == func_file]
    if len(same) == 1:
        return same[0], "same-file"
    cand = [d for d in decls if not d.file.startswith("src/tests/")]
    if len(cand) == 1:
        return cand[0], "unique-non-test"
    pool = cand or decls
    if len({tuple(d.fields) for d in pool}) == 1:
        return pool[0], "identical-duplicate-decl"
    return None, "ambiguous-declaration:%s(%d)" % (name, len(pool))


def split_call_args(text: str, open_idx: int):
    """返回 (args, end_idx)，args 为顶层逗号切分的实参文本。"""
    depth = 0
    args = []
    cur = []
    i = open_idx
    n = len(text)
    while i < n:
        ch = text[i]
        if ch in "([{":
            depth += 1
            if depth == 1:
                i += 1
                continue
        elif ch in ")]}":
            depth -= 1
            if depth == 0:
                args.append("".join(cur))
                return args, i
        elif ch == "," and depth == 1:
            args.append("".join(cur))
            cur = []
            i += 1
            continue
        cur.append(ch)
        i += 1
    return None, -1


def direct_writes(subject: str, body: str):
    covered = set()
    pattern = re.compile(FIELD_WRITE_RE_TMPL.format(S=re.escape(subject)), re.M)
    for m in pattern.finditer(body):
        covered.add(m.group(1))
    return covered


def indirect_writes(subject: str, body: str, declared, sig_index):
    covered = set()
    declared_set = set(declared)
    for cm in CALLEE_RE.finditer(body):
        callee = cm.group(1)
        open_idx = cm.end() - 1
        args, _ = split_call_args(body, open_idx)
        if args is None:
            continue
        short = callee.split(".")[-1]
        is_family = short.endswith(FAMILY_SUFFIXES)
        is_copy_clone = bool(COPY_CLONE_HELPER_RE.search(short))
        is_append = short in APPEND_CALLEES
        if not (is_family or is_copy_clone or is_append):
            continue
        decls = sig_index.get(short, [])
        for ai, arg in enumerate(args):
            for fm in re.finditer(r"\b%s\.([A-Za-z_]\w*)\b" % re.escape(subject), arg):
                fld = fm.group(1)
                if fld not in declared_set:
                    continue
                if is_family:
                    covered.add(fld)
                elif is_append and ai == 0:
                    covered.add(fld)
                elif is_copy_clone and decls and any(
                        ai < len(params) and params[ai].is_var for params in decls):
                    covered.add(fld)
    return covered


def whole_assignments(subject: str, body: str):
    """返回对 subject 的整体赋值 RHS 列表（多行 RHS 合并为一条逻辑语句）。"""
    rhs_list = []
    lines = body.splitlines()
    pat = re.compile(r"^\s*%s\s*=(?!=)\s*(.*)$" % re.escape(subject))
    for i, line in enumerate(lines):
        m = pat.match(line)
        if not m:
            continue
        rhs = m.group(1).strip()
        base_indent = indent_of(line)
        j = i + 1
        while j < len(lines) and (not rhs or rhs.endswith(("=", ",", "(", "[", "+"))):
            nxt = lines[j].strip()
            if not nxt:
                j += 1
                continue
            if indent_of(lines[j]) <= base_indent:
                break
            rhs = (rhs + " " + nxt).strip()
            j += 1
        rhs_list.append(rhs)
    return rhs_list


def delegation_target(subject: str, body: str, sig_index):
    """dst 整体作为实参传给家族 *Into 函数 => 覆盖责任交给 callee。"""
    for cm in CALLEE_RE.finditer(body):
        short = cm.group(1).split(".")[-1]
        if not short.endswith(FAMILY_SUFFIXES):
            continue
        args, _ = split_call_args(body, cm.end() - 1)
        if not args:
            continue
        if any(a.strip() == subject for a in args):
            return short
    return None


def whole_field_write_targets(body: str):
    """字段写目标标识符 -> 写次数（用于判断 by-local 搬运）。"""
    counts = {}
    pat = re.compile(r"^[ \t]*([A-Za-z_]\w*)\.[A-Za-z_0-9\.\[\]]*?(?<![<>=!])=(?!=)", re.M)
    for m in pat.finditer(body):
        counts[m.group(1)] = counts.get(m.group(1), 0) + 1
    return counts


def is_reset_call(rhs: str) -> bool:
    """零参调用 = 重置为空值（如 coreir.BodyIRNew()/T()），之后仍逐字段搬运；
    带参调用 = 整体值构造（如 XxxClone(base)/Value(cloned)），覆盖责任在生产者。"""
    return bool(re.match(r"^(?:[A-Za-z_][\w.]*\.)?[A-Za-z_]\w*\s*\(\s*\)$", rhs.strip()))


def analyze_func(fn: Func, type_index, sig_index):
    if not fn.name.endswith(FAMILY_SUFFIXES):
        return None
    typed = [p for p in fn.params if p.name]
    if len(typed) < 2:
        return Verdict("skip", "params<2", fn)

    dst_cands = [p for p in typed if p.name in DST_NAMES]
    if len(dst_cands) == 1:
        dst = dst_cands[0]
    elif len(dst_cands) > 1:
        return Verdict("skip", "ambiguous-direction:multiple-dst-names", fn)
    else:
        var_same = {}
        for p in typed:
            var_same.setdefault(short_type(p.type), []).append(p)
        pairs = [v for v in var_same.values() if len(v) == 2]
        if len(pairs) == 1 and sum(1 for p in pairs[0] if p.is_var) == 1:
            dst = [p for p in pairs[0] if p.is_var][0]
        else:
            return Verdict("skip", "ambiguous-direction:no-dst-name", fn)

    dst_type = short_type(dst.type)
    src_cands = [p for p in typed if p.name != dst.name and short_type(p.type) == dst_type]
    if not src_cands:
        return Verdict("skip", "no-same-type-source:%s" % dst_type, fn)
    named = [p for p in src_cands if p.name in SRC_NAMES]
    src = named[0] if named else src_cands[0]

    decl, how = resolve_type(dst_type, fn.file, type_index)
    if decl is None:
        return Verdict("skip", how, fn, dst_type)
    if not decl.fields:
        return Verdict("skip", "empty-field-table:%s" % dst_type, fn, dst_type)
    declared = list(decl.fields)

    subject = dst.name
    dst_whole = whole_assignments(subject, fn.body)
    for rhs in dst_whole:
        if rhs == src.name:
            return Verdict("skip", "whole-copy:%s->%s" % (src.name, subject), fn, dst_type)
    direct = direct_writes(subject, fn.body)
    # by-local：dst 不逐字段写，但某本地量被逐字段写且整体赋给 dst（覆盖算在本地量上）。
    counts = whole_field_write_targets(fn.body)
    counts.pop(subject, None)
    counts.pop(src.name, None)
    local = None
    for cand, _ in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])):
        if any(r == cand for r in dst_whole):
            local = cand
            break
    if local is not None and not direct:
        subject = local
        direct = direct_writes(subject, fn.body)
        indirect = indirect_writes(subject, fn.body, declared, sig_index)
        covered = direct | indirect
        missing = [f for f in declared if f not in covered]
        status = "hit" if missing else "clean"
        return Verdict(status, "via-local:%s" % local, fn, dst_type, declared,
                       direct, indirect, missing)
    # dst 整体被带参调用/非 src 标识符赋值 => 覆盖责任在生产者（克隆/构造完整值）。
    non_reset = [r for r in dst_whole if not is_reset_call(r) and r != local]
    if non_reset:
        return Verdict("skip", "whole-value-assignment:%s" % non_reset[0][:60], fn, dst_type)
    if not direct:
        deleg = delegation_target(subject, fn.body, sig_index)
        if deleg:
            v = Verdict("skip", "delegated-to:%s" % deleg, fn, dst_type)
            v.pending_delegation = deleg
            return v
        return Verdict("skip", "no-destination-field-write", fn, dst_type)

    indirect = indirect_writes(subject, fn.body, declared, sig_index)
    covered = direct | indirect
    missing = [f for f in declared if f not in covered]
    if missing:
        return Verdict("hit", "field-omission", fn, dst_type, declared, direct, indirect, missing)
    return Verdict("clean", "all-fields-covered", fn, dst_type, declared, direct, indirect, [])


def run_analysis(root: Path):
    files = sorted(root.glob("src/**/*.cheng"))
    if not files:
        return None, "no .cheng under %s/src" % root
    type_index = {}
    funcs = []
    for f in files:
        for d in parse_types(f, root):
            type_index.setdefault(d.name, []).append(d)
        funcs.extend(parse_funcs(f, root))
    sig_index = build_sig_index(funcs)
    verdicts = []
    for fn in funcs:
        v = analyze_func(fn, type_index, sig_index)
        if v is not None:
            verdicts.append(v)
    # 委派链一级收口：若 callee 自身是命中，委派者按 `delegated-to-hit:<callee>`
    # 记账（可见、可枚举，但不重复计数，缺口的修复点在 callee）。
    hit_names = {v.func.name for v in verdicts if v.status == "hit"}
    for v in verdicts:
        if v.pending_delegation and v.pending_delegation in hit_names:
            v.reason = "delegated-to-hit:%s" % v.pending_delegation
    return verdicts, None


def load_baseline(path: Path):
    if not path.exists():
        return None, []
    entries = []
    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        cols = raw.split("\t")
        if len(cols) < 7:
            return None, ["baseline line %d: expected >=7 tab columns, got %d" % (lineno, len(cols))]
        file_, fn, type_, declared, mcount, mfields = cols[0], cols[1], cols[2], cols[3], cols[4], cols[5]
        status = cols[6] if len(cols) > 6 else ""
        reason = cols[7] if len(cols) > 7 else ""
        if not declared.isdigit() or not mcount.isdigit():
            return None, ["baseline line %d: declared/missing_count not numeric" % lineno]
        entries.append({
            "file": file_, "function": fn, "type": type_,
            "declared": int(declared), "missing_count": int(mcount),
            "missing": [x for x in mfields.split(",") if x],
            "status": status, "reason": reason,
        })
    return entries, []


def write_baseline(path: Path, hits, prior):
    prior_map = {(e["file"], e["function"]): e for e in (prior or [])}
    lines = [
        "# schema\t%s" % SCHEMA,
        "# key\t(file, function)；missing 集合只允许减少：新键或旧键新增缺失字段 => exit 1；"
        "减少/消失只报告（improved/stale），不失败。",
        "# 字段\tfile\tfunction\ttype\tdeclared\tmissing_count\tmissing_fields\tstatus\treason",
    ]
    for v in sorted(hits, key=lambda x: (-len(x.missing), x.func.file, x.func.name)):
        key = (v.func.file, v.func.name)
        old = prior_map.get(key)
        status = old["status"] if old and old["status"] else "UNREVIEWED"
        reason = old["reason"] if old and old["reason"] else "UNREVIEWED: 新增命中需人工判真/假后补理由"
        lines.append("\t".join([
            v.func.file, v.func.name, v.type_name or "", str(len(v.declared)),
            str(len(v.missing)), ",".join(v.missing), status, reason,
        ]))
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def compare_baseline(hits, baseline):
    cur = {(v.func.file, v.func.name): v for v in hits}
    base = {(e["file"], e["function"]): e for e in baseline}
    new_keys = sorted(set(cur) - set(base))
    stale_keys = sorted(set(base) - set(cur))
    grew, improved, same = [], [], []
    for k in sorted(set(cur) & set(base)):
        cur_set = set(cur[k].missing)
        base_set = set(base[k]["missing"])
        added = sorted(cur_set - base_set)
        removed = sorted(base_set - cur_set)
        if added:
            grew.append((k, added))
        elif removed:
            improved.append((k, removed))
        else:
            same.append(k)
    return {"new": new_keys, "stale": stale_keys, "grew": grew,
            "improved": improved, "same": same}


def render_hit(v: Verdict):
    return "HIT %s:%d %s type=%s declared=%d copied=%d missing=%d fields=%s" % (
        v.func.file, v.func.line, v.func.name, v.type_name or "?",
        len(v.declared), len(v.covered_direct | v.covered_indirect),
        len(v.missing), ",".join(v.missing))


def cmd_run(args) -> int:
    root = Path(args.root).resolve()
    if not (root / "src").is_dir():
        print("ERROR root has no src/: %s" % root, file=sys.stderr)
        return 2
    verdicts, err = run_analysis(root)
    if err:
        print("ERROR %s" % err, file=sys.stderr)
        return 2
    hits = [v for v in verdicts if v.status == "hit"]
    skips = [v for v in verdicts if v.status == "skip"]
    cleans = [v for v in verdicts if v.status == "clean"]
    baseline_path = Path(args.baseline) if args.baseline else root / "tools/move_into_field_completeness_baseline.tsv"
    baseline, berr = load_baseline(baseline_path)
    if berr:
        print("ERROR baseline malformed: %s" % "; ".join(berr), file=sys.stderr)
        return 2

    cmp_result = None
    if not args.update_baseline:
        if args.require_clean:
            violations = [(v.func.file, v.func.name, v.missing) for v in hits]
        elif baseline is None:
            print("ERROR baseline missing: %s (run --update-baseline once, review reasons)" % baseline_path,
                  file=sys.stderr)
            return 1
        else:
            cmp_result = compare_baseline(hits, baseline)
            violations = list(cmp_result["new"]) + [k for k, _ in cmp_result["grew"]]
    else:
        violations = []

    if args.json:
        payload = {
            "schema": SCHEMA,
            "root": str(root),
            "baseline": str(baseline_path),
            "summary": {
                "family_functions": len(verdicts), "hits": len(hits),
                "clean": len(cleans), "skipped": len(skips),
                "baseline_entries": len(baseline or []),
            },
            "hits": [{"file": v.func.file, "line": v.func.line, "function": v.func.name,
                      "type": v.type_name, "declared": len(v.declared),
                      "copied": len(v.covered_direct | v.covered_indirect),
                      "missing": v.missing} for v in sorted(hits, key=lambda x: (-len(x.missing), x.func.file))],
            "excluded": [{"file": v.func.file, "line": v.func.line, "function": v.func.name,
                          "reason": v.reason} for v in skips],
            "ratchet": None if cmp_result is None else {
                "new": ["%s|%s" % k for k in cmp_result["new"]],
                "stale": ["%s|%s" % k for k in cmp_result["stale"]],
                "grew": ["%s|%s +%s" % (k[0], k[1], ",".join(f)) for k, f in cmp_result["grew"]],
                "improved": ["%s|%s -%s" % (k[0], k[1], ",".join(f)) for k, f in cmp_result["improved"]],
            },
            "violations": ["%s|%s" % (v[0], v[1]) if isinstance(v, tuple) else str(v) for v in violations],
            "result": "FAIL" if violations else "PASS",
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
    else:
        for v in sorted(hits, key=lambda x: (-len(x.missing), x.func.file, x.func.name)):
            print(render_hit(v))
        if args.explain:
            print("\n# 被放行/跳过的家族函数（每条都有判词；误报可枚举）")
            for v in sorted(skips, key=lambda x: (x.reason.split(":")[0], x.func.file)):
                print("SKIP %s:%d %s reason=%s" % (v.func.file, v.func.line, v.func.name, v.reason))
        base_hits = 0
        if baseline is not None:
            base_keys = {(e["file"], e["function"]) for e in baseline}
            base_hits = len([v for v in hits if (v.func.file, v.func.name) in base_keys])
        print("summary: family_functions=%d hits=%d clean=%d skipped=%d baseline_entries=%d baseline_hits=%d"
              % (len(verdicts), len(hits), len(cleans), len(skips), len(baseline or []), base_hits))
        if cmp_result is not None:
            print("ratchet: new=%d grew=%d improved=%d stale=%d same=%d"
                  % (len(cmp_result["new"]), len(cmp_result["grew"]),
                     len(cmp_result["improved"]), len(cmp_result["stale"]), len(cmp_result["same"])))
            for k in cmp_result["new"]:
                print("NEW %s|%s" % k)
            for k, f in cmp_result["grew"]:
                print("GREW %s|%s +%s" % (k[0], k[1], ",".join(f)))
            for k, f in cmp_result["improved"]:
                print("IMPROVED %s|%s -%s" % (k[0], k[1], ",".join(f)))
            for k in cmp_result["stale"]:
                print("STALE %s|%s （baseline 条目已不再命中：已清零或已放行）" % k)
        if args.require_clean:
            print("strict: require-clean hits=%d" % len(hits))
        print("result: %s%s" % ("FAIL" if violations else "PASS",
                                "" if not violations else " violations=%d" % len(violations)))

    if args.update_baseline:
        write_baseline(baseline_path, hits, baseline)
        print("baseline updated: %s rows=%d" % (baseline_path, len(hits)))
        return 0
    return 1 if violations else 0


# ---------------------------------------------------------------- self-test

SELFTEST_FILES = {
    "src/pos_full.cheng": """type
    SelPosFull =
        alpha: int32
        beta: str

fn selPosFullMoveInto(out: var SelPosFull, src: var SelPosFull) =
    out.alpha = src.alpha
    out.beta = src.beta
""",
    "src/neg_missing.cheng": """type
    SelNegMissing =
        alpha: int32
        beta: str
        gamma: bool

fn selNegMissingMoveInto(out: var SelNegMissing, src: var SelNegMissing) =
    out.alpha = src.alpha
    out.beta = src.beta
""",
    "src/neg_extra.cheng": """type
    SelNegExtra =
        alpha: int32
        beta: str
        gamma: bool

fn selNegExtraMoveInto(out: var SelNegExtra, src: var SelNegExtra) =
    out.alpha = src.alpha
""",
    "src/whole_copy.cheng": """type
    SelWholeCopy =
        alpha: int32
        beta: str

fn selWholeCopyMoveInto(out: var SelWholeCopy, src: var SelWholeCopy) =
    out = src
""",
    "src/non_struct.cheng": """fn selBytesCopyInto(out: var Bytes, src: Bytes) =
    for i in 0..<src.len:
        out[i] = src[i]
""",
}


def _selftest_case(name, expect, got_ok, detail):
    verdict = "PASS" if got_ok else "FAIL"
    print("[self-test] case=%s expected=%s actual=%s verdict=%s" % (name, expect, detail, verdict))
    return got_ok


def run_self_test() -> int:
    tmp_base = "/private/tmp" if os.path.isdir("/private/tmp") else None
    work = Path(tempfile.mkdtemp(prefix="move_into_gate_selftest.", dir=tmp_base))
    ok = True
    try:
        root = work / "fixture"
        for relpath, content in SELFTEST_FILES.items():
            p = root / relpath
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content, encoding="utf-8")

        def analyze_subset(names):
            sub = work / ("sub_" + "_".join(sorted(names)))
            for n in names:
                p = sub / n
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(SELFTEST_FILES[n], encoding="utf-8")
            verdicts, err = run_analysis(sub)
            if err:
                raise RuntimeError(err)
            return ([v for v in verdicts if v.status == "hit"],
                    [v for v in verdicts if v.status == "skip"],
                    [v for v in verdicts if v.status == "clean"])

        # case 1: 正例（全字段）→ 无命中
        hits, skips, cleans = analyze_subset(["src/pos_full.cheng"])
        ok &= _selftest_case("positive_full_fields", "hits=0 clean=1",
                             len(hits) == 0 and len(cleans) == 1,
                             "hits=%d clean=%d skips=%d" % (len(hits), len(cleans), len(skips)))

        # case 2: 负例（故意漏 1 个）→ 1 命中，缺 gamma
        hits, _, _ = analyze_subset(["src/neg_missing.cheng"])
        got = (len(hits) == 1 and hits[0].missing == ["gamma"]
               and len(hits[0].declared) == 3
               and len(hits[0].covered_direct | hits[0].covered_indirect) == 2)
        ok &= _selftest_case("negative_missing_one", "hits=1 missing=gamma declared=3 copied=2", got,
                             "hits=%d missing=%s" % (len(hits), hits[0].missing if hits else "-"))

        # case 3: 整体拷贝 dst = src → 放行（skip reason=whole-copy）
        hits, skips, _ = analyze_subset(["src/whole_copy.cheng"])
        got = (len(hits) == 0 and len(skips) == 1 and skips[0].reason.startswith("whole-copy"))
        ok &= _selftest_case("whole_copy_released", "hits=0 skip=whole-copy", got,
                             "hits=%d skip_reason=%s" % (len(hits), skips[0].reason if skips else "-"))

        # case 4: 非结构目标 Bytes 字节拷贝 → 跳过
        hits, skips, _ = analyze_subset(["src/non_struct.cheng"])
        got = (len(hits) == 0 and len(skips) == 1 and skips[0].reason == "non-struct-target:Bytes")
        ok &= _selftest_case("non_struct_bytes_skipped", "hits=0 skip=non-struct-target:Bytes", got,
                             "hits=%d skip_reason=%s" % (len(hits), skips[0].reason if skips else "-"))

        # case 5: 棘轮——baseline 覆盖既有命中 → exit 0；新增键 → exit 1；旧键新增缺失字段
        # （grew）→ exit 1；--require-clean → 即使全在 baseline 也 exit 1。
        root5 = work / "ratchet"
        for n in ("src/neg_missing.cheng",):
            p = root5 / n
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(SELFTEST_FILES[n], encoding="utf-8")
        baseline = root5 / "baseline.tsv"
        v_all, _ = run_analysis(root5)
        write_baseline(baseline, [v for v in v_all if v.status == "hit"], None)

        def run_quiet(**kw):
            ns = argparse.Namespace(root=str(root5), baseline=str(baseline), require_clean=False,
                                    update_baseline=False, json=False, explain=False)
            for k, val in kw.items():
                setattr(ns, k, val)
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                rc = cmd_run(ns)
            return rc, buf.getvalue()

        rc_base, _ = run_quiet()
        (root5 / "src/neg_extra.cheng").write_text(
            SELFTEST_FILES["src/neg_extra.cheng"], encoding="utf-8")
        rc_new, _ = run_quiet()
        rc_strict, _ = run_quiet(require_clean=True)
        # grew：同一函数再丢一个字段（beta），键不变但缺失集新增 => 违规
        (root5 / "src/neg_extra.cheng").unlink()
        grew_src = SELFTEST_FILES["src/neg_missing.cheng"].replace(
            "    out.beta = src.beta\n", "")
        (root5 / "src/neg_missing.cheng").write_text(grew_src, encoding="utf-8")
        rc_grew, grew_out = run_quiet()
        grew_detected = "GREW src/neg_missing.cheng|selNegMissingMoveInto +beta" in grew_out
        got = (rc_base == 0 and rc_new == 1 and rc_strict == 1 and rc_grew == 1 and grew_detected)
        ok &= _selftest_case("ratchet_baseline_then_new_then_grew_then_strict",
                             "baseline_rc=0 new_key_rc=1 grew_rc=1 grew_判词=True strict_rc=1", got,
                             "baseline_rc=%d new_key_rc=%d grew_rc=%d grew_判词=%s strict_rc=%d"
                             % (rc_base, rc_new, rc_grew, grew_detected, rc_strict))
    finally:
        shutil.rmtree(work, ignore_errors=True)
    print("[self-test] result: %s (tmpdir removed: %s)" % ("PASS" if ok else "FAIL", work))
    return 0 if ok else 1


def main() -> int:
    ap = argparse.ArgumentParser(description="*Into family field-completeness ratchet gate")
    ap.add_argument("--root", default=str(Path(__file__).resolve().parent.parent))
    ap.add_argument("--baseline", default=None)
    ap.add_argument("--require-clean", action="store_true")
    ap.add_argument("--update-baseline", action="store_true")
    ap.add_argument("--explain", action="store_true")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        return run_self_test()
    return cmd_run(args)


if __name__ == "__main__":
    sys.exit(main())
