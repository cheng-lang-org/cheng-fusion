#!/usr/bin/env python3
"""kernel_plugin_closure_check.py — 内核/插件归属闭合检查（docs/cheng-minimal-kernel-plan.md Step 0）。

输入：归属表 TSV（--tsv，默认 tools/kernel_plugin_attribution.tsv），每行
    <repo相对路径>\t<kernel|shared-format|x86_64|aarch64|riscv64|wasm32|unresolved>[\t<note>]
覆盖对象：src/core/backend/*.cheng 与 src/core/backend2/*.cheng 全集
（R2-C6 起归属表扩展覆盖 backend2，桶型新增 backend2）。

检查内容：
1. 覆盖：磁盘 backend .cheng 集合与归属表一一对应，缺行=失败，多行=表错。
2. 直接违规：kernel 文件 import 任何 x86_64/aarch64/riscv64/wasm32 归属文件 → 全部列出；
   Step0 模式（默认）只报告不判失败，`--require-closure` 转 Step1 正式门禁后判失败。
3. 警告：kernel 文件 import unresolved 文件（归属缺口，不算违规）。
4. 间接可达：kernel 经非 arch 中间层摸到 arch 单元（信息项，含最短路径示例）。
5. 分叉扫描：对 --diverge-files 指定大文件做大小写不敏感 arch 关键词扫描（信息项，全量行号清单）。
6. 严格模式：从 kernel manifest 的 compiler_entry_source（或显式 --kernel-entry）
   遍历整个 src/core 静态 import 图；实际闭包必须与 manifest 源集精确一致，闭包
   不得可达任何 arch 桶，架构 token 只能位于插件桶或显式合同权威文件。

退出码：0 通过；1 覆盖缺口、`--require-closure`/`--require-strict-closure`
下存在违规；2 归属表/环境错误（格式非法、悬空引用等）。

"""
from __future__ import annotations

import argparse
import re
import sys
from collections import deque
from pathlib import Path

BUCKETS = ("kernel", "shared-format", "backend2", "x86_64", "aarch64", "riscv32", "riscv64", "wasm32", "unresolved")
ARCH_BUCKETS = frozenset({"x86_64", "aarch64", "riscv32", "riscv64", "wasm32"})
# 归属门直接违规面：kernel 与 backend2（R2-C6 起收编进表，backend2 桶文件
# 严禁 arch 直 import——原 Step1 盲区撤销）。shared-format 允许持 arch import
# （B 系门面形态）。
DIRECT_VIOLATION_SOURCES = frozenset({"kernel", "backend2"})
# tracked .cheng 禁止的二进制魔数（Mach-O 全字节序；docs/cheng-minimal-kernel-plan.md 选项B③）
BINARY_MAGICS = (b"\xfe\xed\xfa\xce", b"\xfe\xed\xfa\xcf", b"\xce\xfa\xed\xfe", b"\xcf\xfa\xed\xfe")
BACKEND_REL = Path("src/core/backend")
BACKEND2_REL = Path("src/core/backend2")
BACKEND_MODULE_PREFIX = "cheng/core/backend/"
# 归属表覆盖目录（R2-C6 扩展：backend2 收进表，撤出 Step1 门盲区）
COVERED_RELS = (BACKEND_REL, BACKEND2_REL)
CORE_REL = Path("src/core")
CORE_MODULE_PREFIX = "cheng/core/"
KERNEL_MANIFEST_DEFAULT = Path("bootstrap/kernel_manifest.cheng")
KERNEL_ENTRY_KEY = "compiler_entry_source"

IMPORT_RE = re.compile(r"^import\s+([A-Za-z_][A-Za-z0-9_/]*)")
IMPORT_TAIL_RE = re.compile(r"(?:\s+as\s+[A-Za-z_]\w*)?\s*$")
CORE_IMPORT_RE = re.compile(r"^\s*import\s+([A-Za-z_][A-Za-z0-9_/]*)")
DIVERGE_KEYWORDS = ("x86_64", "aarch64", "arm64", "riscv", "wasm", "macho", "mach-o", "triple")
DIVERGE_DEFAULTS = (BACKEND_REL / "primary_object_plan.cheng", BACKEND_REL / "lowering_plan.cheng")
# 严格门只允许下列集中权威持有 target/arch token。插件实现本身按归属表的 arch
# 桶豁免；其他 kernel/shared/tooling 文件出现这些 token 都是尚未数据合同化的分叉。
ARCH_TOKEN_CONTRACT_FILES = frozenset({
    BACKEND_REL / "codegen_contract.cheng",
    BACKEND_REL / "target_matrix.cheng",
})
ARCH_TOKENS = ("x86_64", "x8664", "aarch64", "arm64", "riscv64", "riscv32", "wasm32")
# S4 契约版本权威唯一（docs/cheng-csg-pickup-design.md §5/§7）：定义只能落在
# codegen_contract.cheng；其他 Cheng 源只允许经模块限定符引用。
CONTRACT_REL = BACKEND_REL / "codegen_contract.cheng"
CONTRACT_VERSION = "CodegenContractVersion"
CONTRACT_VERSION_DEF_RE = re.compile(
    r"^\s*(?:pub\s+)?(?:const|var|let)\s+"
    + CONTRACT_VERSION
    + r"\s*(?::\s*[A-Za-z_][A-Za-z0-9_.]*(?:\[[^\]]+\])?)?\s*=(?!=)\s*\S.*$"
)
CONTRACT_VERSION_ASSIGN_RE = re.compile(
    r"^\s*" + CONTRACT_VERSION
    + r"\s*(?::\s*[A-Za-z_][A-Za-z0-9_.]*(?:\[[^\]]+\])?)?\s*=(?!=)\s*\S.*$"
)
CONTRACT_VERSION_TOKEN_RE = re.compile(r"(?<![A-Za-z0-9_.])" + CONTRACT_VERSION + r"(?![A-Za-z0-9_])")
CHENG_STRING_RE = re.compile(r'"(?:\\.|[^"\\])*"')


def repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


class TableError(Exception):
    """归属表或环境不可用（退出码 2）。"""


def load_table(tsv: Path, covered_dirs: list[Path]) -> dict[Path, str]:
    if not tsv.is_file():
        raise TableError(f"attribution tsv not found: {tsv}")
    covered = {d.resolve() for d in covered_dirs}
    table: dict[Path, str] = {}
    for lineno, raw in enumerate(tsv.read_text(encoding="utf-8").splitlines(), 1):
        if not raw.strip():
            continue
        parts = raw.split("\t")
        if len(parts) < 2 or len(parts) > 3:
            raise TableError(f"{tsv}:{lineno}: malformed row (expect 2-3 tab columns): {raw!r}")
        rel, bucket = parts[0].strip(), parts[1].strip()
        if bucket not in BUCKETS:
            raise TableError(f"{tsv}:{lineno}: unknown bucket {bucket!r} (valid: {'|'.join(BUCKETS)})")
        path = repo_root() / rel
        if path.parent not in covered:
            raise TableError(f"{tsv}:{lineno}: path outside covered dirs ({', '.join(str(d) for d in COVERED_RELS)}): {rel}")
        if path in table:
            raise TableError(f"{tsv}:{lineno}: duplicate path {rel}")
        table[path] = bucket
    return table


def parse_imports(path: Path) -> tuple[list[str], list[str], bool]:
    """返回 (backend 内模块引用列表, 未解析干净的 import 行, 是否严格 UTF-8)。"""
    strict = True
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        text = path.read_text(encoding="utf-8", errors="replace")
        strict = False
    mods: list[str] = []
    unparsed: list[str] = []
    for raw in text.splitlines():
        m = IMPORT_RE.match(raw)
        if m is None:
            continue
        tail = raw[m.end():]
        if IMPORT_TAIL_RE.fullmatch(tail) is None:
            unparsed.append(raw.strip())
            continue
        mod = m.group(1)
        if mod.startswith(BACKEND_MODULE_PREFIX) and "/" not in mod[len(BACKEND_MODULE_PREFIX):]:
            mods.append(mod)
    return mods, unparsed, strict


def _strip_cheng_comment(raw: str) -> str:
    """去掉字符串外的 # 注释；字符串内的 # 必须保留。"""
    in_string = False
    escaped = False
    for index, char in enumerate(raw):
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "#":
            return raw[:index]
    return raw


def parse_manifest_sources(path: Path, root: Path) -> tuple[dict[str, Path], list[str]]:
    """解析 key=path manifest，返回 src/core Cheng 源条目与格式错误。"""
    if not path.is_file():
        return {}, [f"strict_manifest_missing: {path}"]
    sources: dict[str, Path] = {}
    seen_keys: set[str] = set()
    seen_sources: dict[Path, str] = {}
    errors: list[str] = []
    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = _strip_cheng_comment(raw).strip()
        if not line:
            continue
        if "=" not in line:
            errors.append(f"strict_manifest_malformed {path}:{lineno}: {raw.strip()}")
            continue
        key, value_tail = (part.strip() for part in line.split("=", 1))
        values = value_tail.split()
        if not key or not values:
            errors.append(f"strict_manifest_empty_entry {path}:{lineno}")
            continue
        if key in seen_keys:
            errors.append(f"strict_manifest_duplicate_key {path}:{lineno}: {key}")
            continue
        seen_keys.add(key)
        value = values[0]
        if not value.startswith("src/core/"):
            continue
        if not value.endswith(".cheng"):
            errors.append(f"strict_manifest_non_cheng_source {path}:{lineno}: {value}")
            continue
        if ".." in Path(value).parts:
            errors.append(f"strict_manifest_source_traversal {path}:{lineno}: {value}")
            continue
        source = (root / value).resolve()
        try:
            source.relative_to((root / CORE_REL).resolve())
        except ValueError:
            errors.append(f"strict_manifest_source_outside_core {path}:{lineno}: {value}")
            continue
        if not source.is_file():
            errors.append(f"strict_manifest_source_missing {path}:{lineno}: {value}")
            continue
        previous_key = seen_sources.get(source)
        if previous_key is not None:
            errors.append(
                f"strict_manifest_duplicate_source {path}:{lineno}: {value} "
                f"(keys={previous_key},{key})"
            )
            continue
        seen_sources[source] = key
        sources[key] = source
    return sources, errors


def parse_core_imports(path: Path, core_dir: Path) -> tuple[list[Path], list[str], bool]:
    """解析单个 Cheng 源的 src/core import；不把 std/cheng/std 纳入内核图。"""
    strict_utf8 = True
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        text = path.read_text(encoding="utf-8", errors="replace")
        strict_utf8 = False
    targets: list[Path] = []
    errors: list[str] = []
    for raw in text.splitlines():
        code = _strip_cheng_comment(raw)
        if not re.match(r"^\s*import\b", code):
            continue
        match = CORE_IMPORT_RE.match(code)
        if match is None:
            errors.append(f"unparsed_core_import {path}: {raw.strip()}")
            continue
        tail = code[match.end():]
        if IMPORT_TAIL_RE.fullmatch(tail) is None:
            errors.append(f"unparsed_core_import {path}: {raw.strip()}")
            continue
        module = match.group(1)
        if not module.startswith(CORE_MODULE_PREFIX):
            continue
        suffix = module[len(CORE_MODULE_PREFIX):]
        target = core_dir / (suffix + ".cheng")
        if not target.is_file():
            errors.append(f"dangling_core_import {path}: {module}")
            continue
        targets.append(target)
    return sorted(set(targets)), errors, strict_utf8


def build_core_import_graph(
    root: Path,
) -> tuple[dict[Path, list[Path]], dict[Path, list[str]], set[Path]]:
    """构造 src/core 全图；解析错误按源文件挂账，严格门只消费可达节点错误。"""
    core_dir = root / CORE_REL
    edges: dict[Path, list[Path]] = {}
    errors: dict[Path, list[str]] = {}
    non_utf8: set[Path] = set()
    for path in sorted(core_dir.rglob("*.cheng")):
        targets, issues, strict_utf8 = parse_core_imports(path, core_dir)
        edges[path] = targets
        if issues:
            errors[path] = issues
        if not strict_utf8:
            non_utf8.add(path)
    return edges, errors, non_utf8


def reachable_core_closure(
    roots: list[Path], edges: dict[Path, list[Path]]
) -> tuple[set[Path], dict[Path, Path | None]]:
    """返回 roots 的完整静态 import 闭包及 BFS 前驱。"""
    parents: dict[Path, Path | None] = {}
    queue: deque[Path] = deque()
    for root in roots:
        if root in parents:
            continue
        parents[root] = None
        queue.append(root)
    while queue:
        source = queue.popleft()
        for target in edges.get(source, ()):  # BFS 冻结最短证据链
            if target in parents:
                continue
            parents[target] = source
            queue.append(target)
    return set(parents), parents


def shortest_path_to(node: Path, parents: dict[Path, Path | None]) -> list[Path]:
    path: list[Path] = []
    cursor: Path | None = node
    while cursor is not None:
        path.append(cursor)
        cursor = parents[cursor]
    path.reverse()
    return path


def arch_reachable_paths(
    reachable: set[Path], parents: dict[Path, Path | None], bucket: dict[Path, str]
) -> list[tuple[Path, list[Path]]]:
    hits = [path for path in reachable if bucket.get(path) in ARCH_BUCKETS]
    return [(path, shortest_path_to(path, parents)) for path in sorted(hits)]


def architecture_tokens_in_code_line(raw: str) -> tuple[str, ...]:
    code = _strip_cheng_comment(raw).lower()
    return tuple(token for token in ARCH_TOKENS if token in code)


def scan_strict_arch_tokens(
    reachable: set[Path], root: Path, bucket: dict[Path, str]
) -> tuple[list[tuple[Path, int, tuple[str, ...], int, str]], int]:
    """每个违规文件返回首条证据和总命中行数，避免上千行报告淹没闭包证据。"""
    files: list[tuple[Path, int, tuple[str, ...], int, str]] = []
    total_lines = 0
    for path in sorted(reachable):
        rel = path.relative_to(root)
        if rel in ARCH_TOKEN_CONTRACT_FILES or bucket.get(path) in ARCH_BUCKETS:
            continue
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            continue
        first: tuple[int, tuple[str, ...], str] | None = None
        file_lines = 0
        for lineno, raw in enumerate(lines, 1):
            tokens = architecture_tokens_in_code_line(raw)
            if not tokens:
                continue
            file_lines += 1
            if first is None:
                excerpt = raw.strip()
                if len(excerpt) > 120:
                    excerpt = excerpt[:117] + "..."
                first = (lineno, tokens, excerpt)
        if first is None:
            continue
        total_lines += file_lines
        files.append((path, first[0], first[1], file_lines, first[2]))
    return files, total_lines


def manifest_closure_diff(
    manifest_sources: set[Path], reachable: set[Path]
) -> tuple[list[Path], list[Path]]:
    """返回 (manifest 声明但入口不可达, 入口可达但 manifest 未声明)。"""
    return sorted(manifest_sources - reachable), sorted(reachable - manifest_sources)


def bfs_indirect(start: Path, edges: dict[Path, list[Path]], bucket: dict[Path, str]) -> list[tuple[Path, list[Path]]]:
    """从 start 出发、只穿过非 arch 节点，返回 (可达 arch 文件, 最短路径) 列表。"""
    found: dict[Path, list[Path]] = {}
    queue: list[tuple[Path, list[Path]]] = [(start, [start])]
    seen: set[Path] = {start}
    while queue:
        node, path = queue.pop(0)
        for nxt in edges.get(node, ()):  # BFS 保证首条即最短
            if nxt in seen:
                continue
            seen.add(nxt)
            if bucket.get(nxt) in ARCH_BUCKETS:
                if nxt not in found:
                    found[nxt] = path + [nxt]
                continue  # 不穿过 arch 节点继续扩散
            queue.append((nxt, path + [nxt]))
    return sorted(found.items(), key=lambda kv: kv[0].name)


def scan_binary_magic(root: Path) -> list[str]:
    """git 跟踪的 .cheng 里扫 Mach-O 魔数（防止构建产物再次入库冒充源码）。"""
    import subprocess
    try:
        out = subprocess.run(["git", "-C", str(root), "ls-files", "--", "*.cheng"],
                             capture_output=True, check=True, text=True).stdout
    except subprocess.CalledProcessError as exc:
        return [f"binary_magic_scan: git ls-files failed: {exc}"]
    hits: list[str] = []
    for rel in out.splitlines():
        if not rel:
            continue
        f = root / rel
        if not f.is_file():
            continue  # tracked 但磁盘缺失（并发 lane 中间态）不属本门范围
        with open(f, "rb") as fh:
            head = fh.read(4)
        if head in BINARY_MAGICS:
            hits.append(f"binary_magic_tracked {rel} (Mach-O magic {head.hex()})")
    return hits


def _strip_cheng_comment_and_strings(raw: str) -> str:
    """去掉字符串字面量与 # 注释，避免报文/文档文本干扰权威判定。"""
    code = raw.split("#", 1)[0]
    return CHENG_STRING_RE.sub('""', code)


def scan_contract_version_authority(root: Path) -> tuple[int, list[str]]:
    """返回 (契约内定义数, 契约外定义/赋值违规)。只审计 git 跟踪的 Cheng 源。"""
    import subprocess
    try:
        out = subprocess.run(["git", "-C", str(root), "ls-files", "--", "*.cheng"],
                             capture_output=True, check=True, text=True).stdout
    except subprocess.CalledProcessError as exc:
        return 0, [f"contract_version_scan: git ls-files failed: {exc}"]
    definitions = 0
    hits: list[str] = []
    contract_path = root / CONTRACT_REL
    for rel_text in out.splitlines():
        if not rel_text:
            continue
        path = root / rel_text
        if not path.is_file():
            continue  # tracked-but-missing 属并发 lane 中间态，不属本扫描
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            continue  # 非文本 Cheng 由 Mach-O 魔数门处置
        rel = path.relative_to(root)
        for lineno, raw in enumerate(lines, 1):
            code = _strip_cheng_comment_and_strings(raw)
            is_def = bool(CONTRACT_VERSION_DEF_RE.fullmatch(code))
            is_assign = bool(CONTRACT_VERSION_ASSIGN_RE.fullmatch(code))
            if not is_def and not is_assign:
                continue
            if path == contract_path:
                definitions += 1
                continue
            kind = "definition" if is_def else "assignment"
            hits.append(
                f"contract_version_authority {rel}:{lineno}: "
                f"{CONTRACT_VERSION} {kind} outside {CONTRACT_REL}"
            )
    return definitions, hits


def main() -> int:
    root = repo_root()
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--tsv", default=str(Path("tools") / "kernel_plugin_attribution.tsv"),
                    help="归属表路径（repo 相对或绝对）")
    ap.add_argument("--require-closure", action="store_true",
                    help="Step1 正式门禁：kernel→arch 直接违规也判失败（默认 Step0 模式只报告）")
    ap.add_argument("--require-strict-closure", action="store_true",
                    help="严格门：从 kernel entry 遍历 src/core，要求 manifest 精确且 arch 不可达/token 不外泄")
    ap.add_argument("--kernel-manifest", default=str(KERNEL_MANIFEST_DEFAULT),
                    help="严格门使用的 kernel manifest（repo 相对或绝对）")
    ap.add_argument("--kernel-entry", action="append", default=[],
                    help="严格门显式入口（repo 相对或绝对，可重复）；省略时取 manifest compiler_entry_source")
    ap.add_argument("--diverge-files", nargs="*", default=[str(p) for p in DIVERGE_DEFAULTS],
                    help="分叉关键词扫描目标文件（repo 相对路径）")
    args = ap.parse_args()

    backend_dir = root / BACKEND_REL
    tsv = Path(args.tsv)
    tsv = tsv if tsv.is_absolute() else root / tsv

    hard_errors: list[str] = []      # 退出码 2
    violations: list[str] = []       # 退出码 1
    warnings: list[str] = []         # 信息项

    covered_dirs = [root / rel for rel in COVERED_RELS]
    try:
        table = load_table(tsv, covered_dirs)
    except TableError as exc:
        print(f"table_error: {exc}", file=sys.stderr)
        return 2

    disk_files: list[Path] = []
    for rel in COVERED_RELS:
        disk_files.extend(sorted((root / rel).glob("*.cheng")))
    uncovered = [p for p in disk_files if p not in table]
    stale = [p for p in table if p not in set(disk_files)]
    for p in stale:
        hard_errors.append(f"stale_table_entry: {p.relative_to(root)} (no such file on disk)")

    # 解析全部 backend 文件的 import 图
    edges: dict[Path, list[Path]] = {}
    non_utf8: list[str] = []
    for p in disk_files:
        mods, unparsed, strict = parse_imports(p)
        if not strict:
            non_utf8.append(str(p.relative_to(root)))
        for line in unparsed:
            hard_errors.append(f"unparsed_import {p.relative_to(root)}: {line}")
        resolved: list[Path] = []
        for mod in mods:
            target = backend_dir / (mod[len(BACKEND_MODULE_PREFIX):] + ".cheng")
            if not target.is_file():
                hard_errors.append(f"dangling_import {p.relative_to(root)}: {mod}")
                continue
            resolved.append(target)
        edges[p] = sorted(set(resolved))

    bucket_of = table
    direct_viol_edges: list[tuple[Path, Path]] = []
    warn_edges: list[tuple[Path, Path]] = []
    for src in disk_files:
        if bucket_of.get(src) not in DIRECT_VIOLATION_SOURCES:
            continue
        for dst in edges.get(src, ()):
            b = bucket_of.get(dst)
            if b in ARCH_BUCKETS:
                direct_viol_edges.append((src, dst))
            elif b == "unresolved":
                warn_edges.append((src, dst))
    violations.extend(
        f"VIOLATION {s.relative_to(root)} -> {d.relative_to(root)} ({bucket_of[d]})"
        for s, d in sorted(direct_viol_edges))
    warnings.extend(
        f"WARNING kernel->unresolved {s.relative_to(root)} -> {d.relative_to(root)}"
        for s, d in sorted(warn_edges))

    # 选项B③：tracked .cheng 拒绝 Mach-O 魔数（硬违规，任何模式下都判失败）
    binary_hits = scan_binary_magic(root)
    violations.extend(binary_hits)

    # S4 §5：契约版本定义权威唯一（任何模式下都判失败，防版本绑定被旁路）
    contract_version_definitions, contract_version_hits = scan_contract_version_authority(root)
    if contract_version_definitions == 0:
        contract_version_hits.append(
            f"contract_version_authority: {CONTRACT_VERSION} declaration missing in {CONTRACT_REL}"
        )

    indirect: list[str] = []
    indirect_src_count = 0
    for src in disk_files:
        # 间接面 BFS 根仍只取 kernel 桶（内核组合成员）；backend2 桶是独立
        # 组合领地，其 arch 直 import 已由直接违规面（DIRECT_VIOLATION_SOURCES）
        # 把门，不进 kernel 间接边账（R2-C6 口径）。
        if bucket_of.get(src) != "kernel":
            continue
        hits = bfs_indirect(src, edges, bucket_of)
        if not hits:
            continue
        indirect_src_count += 1
        direct_targets = {d for s, d in direct_viol_edges if s == src}
        for dst, path in hits:
            if dst in direct_targets:
                continue  # 已计入直接违规，不重复计间接
            chain = " > ".join(n.relative_to(root).name for n in path)
            indirect.append(f"INDIRECT {src.relative_to(root)} ~~> {dst.relative_to(root)} via {chain}")

    # 严格门：实际构建脚本只把 compiler_entry_source 交给 system-link-exec，因此
    # 入口的全 src/core import 闭包才是组合真值，manifest 其他行不能替代可达性。
    strict_manifest_path: Path | None = None
    strict_manifest_sources: dict[str, Path] = {}
    strict_roots: list[Path] = []
    strict_reachable: set[Path] = set()
    strict_manifest_only: list[Path] = []
    strict_unmanifested: list[Path] = []
    strict_arch_hits: list[tuple[Path, list[Path]]] = []
    strict_token_hits: list[tuple[Path, int, tuple[str, ...], int, str]] = []
    strict_token_lines = 0
    strict_violations: list[str] = []
    if args.require_strict_closure:
        strict_manifest_path = Path(args.kernel_manifest)
        if not strict_manifest_path.is_absolute():
            strict_manifest_path = root / strict_manifest_path
        strict_manifest_sources, manifest_errors = parse_manifest_sources(
            strict_manifest_path, root
        )
        hard_errors.extend(manifest_errors)

        if args.kernel_entry:
            for raw_entry in args.kernel_entry:
                entry = Path(raw_entry)
                if not entry.is_absolute():
                    entry = root / entry
                entry = entry.resolve()
                try:
                    entry.relative_to((root / CORE_REL).resolve())
                except ValueError:
                    hard_errors.append(f"strict_entry_outside_core: {raw_entry}")
                    continue
                if not entry.is_file():
                    hard_errors.append(f"strict_entry_missing: {raw_entry}")
                    continue
                strict_roots.append(entry)
        else:
            entry = strict_manifest_sources.get(KERNEL_ENTRY_KEY)
            if entry is None:
                hard_errors.append(
                    f"strict_manifest_entry_missing: {KERNEL_ENTRY_KEY} in {strict_manifest_path}"
                )
            else:
                strict_roots.append(entry)

        if strict_roots:
            core_edges, core_parse_errors, core_non_utf8 = build_core_import_graph(root)
            strict_reachable, strict_parents = reachable_core_closure(
                strict_roots, core_edges
            )
            for source in sorted(strict_reachable):
                hard_errors.extend(core_parse_errors.get(source, ()))
                if source in core_non_utf8:
                    hard_errors.append(
                        f"strict_non_utf8_source: {source.relative_to(root)}"
                    )

            strict_manifest_only, strict_unmanifested = manifest_closure_diff(
                set(strict_manifest_sources.values()), strict_reachable
            )
            strict_violations.extend(
                f"STRICT_MANIFEST_UNREACHABLE {path.relative_to(root)}"
                for path in strict_manifest_only
            )
            strict_violations.extend(
                f"STRICT_CLOSURE_UNMANIFESTED {path.relative_to(root)}"
                for path in strict_unmanifested
            )

            strict_arch_hits = arch_reachable_paths(
                strict_reachable, strict_parents, bucket_of
            )
            for target, path in strict_arch_hits:
                chain = " > ".join(str(node.relative_to(root)) for node in path)
                strict_violations.append(
                    f"STRICT_ARCH_REACH {target.relative_to(root)} "
                    f"bucket={bucket_of[target]} via {chain}"
                )

            strict_token_hits, strict_token_lines = scan_strict_arch_tokens(
                strict_reachable, root, bucket_of
            )
            for path, lineno, tokens, file_lines, excerpt in strict_token_hits:
                strict_violations.append(
                    f"STRICT_ARCH_TOKEN {path.relative_to(root)}:{lineno} "
                    f"tokens={','.join(tokens)} hit_lines={file_lines} first={excerpt}"
                )

    diverge_blocks: list[str] = []
    diverge_totals: dict[str, int] = {}
    for rel in args.diverge_files:
        f = Path(rel)
        f = f if f.is_absolute() else root / f
        if not f.is_file():
            hard_errors.append(f"diverge_target_missing: {rel}")
            continue
        try:
            lines = f.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            lines = f.read_text(encoding="utf-8", errors="replace").splitlines()
        hits: list[str] = []
        per_kw: dict[str, int] = {}
        low = [ln.lower() for ln in lines]
        for kw in DIVERGE_KEYWORDS:
            kws_hits = [i for i, ln in enumerate(low, 1) if kw in ln]
            per_kw[kw] = len(kws_hits)
            diverge_totals[kw] = diverge_totals.get(kw, 0) + len(kws_hits)
        for i, ln in enumerate(low, 1):
            matched = [kw for kw in DIVERGE_KEYWORDS if kw in ln]
            if matched:
                text = lines[i - 1].strip()
                if len(text) > 120:
                    text = text[:117] + "..."
                hits.append(f"DIVERGE {f.relative_to(root)}:{i} [{'|'.join(matched)}] {text}")
        total = sum(per_kw.values())
        diverge_blocks.append(
            f"--- diverge scan: {f.relative_to(root)} total={total}\n"
            + "\n".join(f"  {k}={v}" for k, v in per_kw.items() if v)
            + ("\n" + "\n".join(hits) if hits else ""))

    # ---- 明细输出 ----
    for block in diverge_blocks:
        print(block)
    if indirect:
        print(f"--- indirect reach ({len(indirect)}) ---")
        print("\n".join(indirect))
    if warnings:
        print(f"--- warnings ({len(warnings)}) ---")
        print("\n".join(warnings))
    if violations:
        print(f"--- direct violations ({len(violations)}) ---")
        print("\n".join(violations))
    if contract_version_hits:
        print(f"--- contract version authority violations ({len(contract_version_hits)}) ---")
        print("\n".join(contract_version_hits))
    if strict_violations:
        print(f"--- strict kernel closure violations ({len(strict_violations)}) ---")
        print("\n".join(strict_violations))
    if hard_errors:
        print(f"--- errors ({len(hard_errors)}) ---", file=sys.stderr)
        print("\n".join(hard_errors), file=sys.stderr)

    # ---- 汇总（放最后，截断也保得住）----
    counts = {b: sum(1 for v in table.values() if v == b) for b in BUCKETS}
    viol_sources = sorted({s.name for s, _ in direct_viol_edges})
    print("==== Step0 closure summary ====")
    print(f"backend_files_total={len(disk_files)} attributed={len(table)} uncovered={len(uncovered)}")
    print("buckets: " + " ".join(f"{b}={counts[b]}" for b in BUCKETS))
    if non_utf8:
        print(f"non_utf8_files={len(non_utf8)}: {','.join(non_utf8)}")
    print(f"direct_violations={len(direct_viol_edges)} sources={','.join(viol_sources) or '-'}")
    print(f"kernel_to_unresolved_warnings={len(warn_edges)}")
    print(f"indirect_reach_sources={indirect_src_count} indirect_edges={len(indirect)}")
    print("divergence_hits_total=" + str(sum(diverge_totals.values()))
          + " (" + ", ".join(f"{k}={v}" for k, v in diverge_totals.items() if v) + ")")
    print(f"contract_version_definitions={contract_version_definitions} "
          f"contract_version_authority_violations={len(contract_version_hits)}")
    if args.require_strict_closure:
        manifest_text = "-"
        if strict_manifest_path is not None:
            try:
                manifest_text = str(strict_manifest_path.relative_to(root))
            except ValueError:
                manifest_text = str(strict_manifest_path)
        root_text = ",".join(
            str(path.relative_to(root)) for path in strict_roots
        ) or "-"
        print("==== strict kernel closure summary ====")
        print(f"strict_manifest={manifest_text}")
        print(f"strict_entry_roots={root_text}")
        print(
            f"strict_manifest_sources={len(strict_manifest_sources)} "
            f"strict_core_closure_files={len(strict_reachable)}"
        )
        print(
            f"strict_manifest_unreachable={len(strict_manifest_only)} "
            f"strict_closure_unmanifested={len(strict_unmanifested)}"
        )
        print(f"strict_arch_reachable_files={len(strict_arch_hits)}")
        print(
            f"strict_arch_token_files={len(strict_token_hits)} "
            f"strict_arch_token_lines={strict_token_lines}"
        )
    if hard_errors:
        print(f"result: FAIL (errors={len(hard_errors)})")
        return 2
    if uncovered:
        print(f"result: FAIL (uncovered={len(uncovered)})")
        return 1
    if binary_hits:
        print(f"result: FAIL (binary_magic_tracked={len(binary_hits)})")
        return 1
    if contract_version_hits:
        print(f"result: FAIL (contract_version_authority={len(contract_version_hits)})")
        return 1
    if args.require_strict_closure and strict_violations:
        print(
            "result: FAIL_STRICT "
            f"(violations={len(strict_violations)} "
            f"manifest_unreachable={len(strict_manifest_only)} "
            f"closure_unmanifested={len(strict_unmanifested)} "
            f"arch_reachable={len(strict_arch_hits)} "
            f"arch_token_files={len(strict_token_hits)})"
        )
        return 1
    if violations:
        if args.require_closure or args.require_strict_closure:
            print(f"result: FAIL_STEP1 (direct_violations={len(violations)})")
            return 1
        print("result: PASS_STEP0 (coverage_complete; "
              f"known_direct_violations={len(violations)}; "
              "rerun with --require-closure for Step1 gate)")
        return 0
    print("result: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
