#!/usr/bin/env python3
"""cheng_export_symbol_dup_gate.py —— @exportc 符号重复定义棘轮门。

背景（2026-08-29 实测）：`src/core/runtime/program_support_backend.cheng` 与
`src/core/runtime/program_support_entry_link_provider.cheng` 各自定义了
`__cheng_setCmdLine` / `__cheng_rt_paramStr` / `__cheng_rt_paramCount`，且各自
持有一份**互不共享**的 backing store（`cheng_saved_*` vs `cheng_link_saved_*`）。
链接器最终只留一份，一旦「写」落在一侧、「读」落在另一侧就是
「写入 A 读 B → nil」，表现为 `absolute argv0 required` 这类难查的运行时墙。

本门不试图一次清零历史债（那会把门直接挂红、失去信号），而是**棘轮**：
已知重复记进 baseline，只允许减少、不允许新增；新增即 rc=1。

口径：
- 扫描范围 `src/core/runtime/`、`src/core/tooling/`、`src/core/backend/`
  （只审计 git 跟踪的 .cheng；codex/ 历史快照与 src/tests/ 探针不计入）。
- **平台变体折叠**：`core_runtime_provider_darwin` / `_linux` 这类同一符号的
  互斥平台实现属于正常（同一时刻只链一份），按「剥掉平台后缀后同名」判定并放行。
- baseline 缺项（某重复已被修掉）记 info，不判失败。

退出码：0 通过；1 出现 baseline 之外的新增重复；2 环境/用法错误。

用法：
    python3 tools/cheng_export_symbol_dup_gate.py
    python3 tools/cheng_export_symbol_dup_gate.py --update-baseline
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASELINE = Path(__file__).resolve().parent / "cheng_export_symbol_dup_baseline.txt"
SCOPES = ("src/core/runtime/", "src/core/tooling/", "src/core/backend/")
PLATFORM_TOKENS = ("_darwin", "_linux", "_windows", "_android", "_ios", "_macos", "_wasm")
EXPORTC_RE = re.compile(
    r'^\s*(?:@[A-Za-z_][A-Za-z0-9_]*(?:\([^\r\n)]*\))?\s+)*'
    r'@exportc\(\s*"([^"]+)"\s*\)'
)


def export_symbol_on_annotation_line(line: str) -> str | None:
    """Return only a real leading annotation, never comments or literals."""
    match = EXPORTC_RE.match(line)
    return match.group(1) if match else None


def validate_lexical_contract() -> None:
    positives = (
        '@exportc("plain")',
        '    @exportc( "spaced" )',
        '@weak @exportc("weak")',
    )
    negatives = (
        '# @exportc("comment")',
        '    # @exportc("indented_comment")',
        'let x = "@exportc(\\"literal\\")"',
        'fn f() = @exportc("expression")',
    )
    if [export_symbol_on_annotation_line(line) for line in positives] != [
        "plain", "spaced", "weak"
    ]:
        raise RuntimeError("exportc annotation scanner rejected valid syntax")
    if any(export_symbol_on_annotation_line(line) is not None for line in negatives):
        raise RuntimeError("exportc annotation scanner accepted non-annotation text")


def platform_key(rel: str) -> str:
    """剥掉平台后缀：折叠后同名即互斥平台变体，不算重复。"""
    stem = rel[:-len(".cheng")] if rel.endswith(".cheng") else rel
    for tok in PLATFORM_TOKENS:
        stem = stem.replace(tok, "")
    return stem


def scan() -> dict[str, list[tuple[str, int]]]:
    validate_lexical_contract()
    out = subprocess.run(["git", "-C", str(ROOT), "ls-files", "--", "*.cheng"],
                         capture_output=True, check=True, text=True).stdout
    defs: dict[str, list[tuple[str, int]]] = defaultdict(list)
    for rel in out.splitlines():
        if not rel or not rel.startswith(SCOPES):
            continue
        p = ROOT / rel
        if not p.is_file():
            continue  # tracked-but-missing 属并发 lane 中间态，不属本门
        try:
            lines = p.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            continue
        for i, ln in enumerate(lines, 1):
            symbol = export_symbol_on_annotation_line(ln)
            if symbol is not None:
                defs[symbol].append((rel, i))
    return defs


def real_duplicates(defs: dict[str, list[tuple[str, int]]]) -> dict[str, list[tuple[str, int]]]:
    real: dict[str, list[tuple[str, int]]] = {}
    for sym, locs in defs.items():
        if len(locs) < 2:
            continue
        if len({platform_key(rel) for rel, _ in locs}) < len(locs):
            continue  # 平台变体折叠 → 互斥，放行
        real[sym] = locs
    return real


def read_baseline() -> list[str]:
    if not BASELINE.is_file():
        return []
    return [ln.strip() for ln in BASELINE.read_text(encoding="utf-8").splitlines()
            if ln.strip() and not ln.startswith("#")]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--update-baseline", action="store_true",
                    help="把当前实测重复集重写进 baseline（仅在有意识收债/扩容时用）")
    args = ap.parse_args()

    defs = scan()
    real = real_duplicates(defs)

    if args.update_baseline:
        BASELINE.write_text(
            "# @exportc 重复定义 baseline（棘轮：只允许减少，不允许新增）\n"
            "# 由 tools/cheng_export_symbol_dup_gate.py --update-baseline 生成\n"
            + "".join(f"{s}\n" for s in sorted(real)),
            encoding="utf-8")
        print(f"baseline updated: {len(real)} symbols -> {BASELINE.name}")
        return 0

    baseline = set(read_baseline())
    current = set(real)
    new = sorted(current - baseline)
    gone = sorted(baseline - current)

    print(f"exportc_symbols_scoped={len(defs)} duplicates_raw={sum(1 for v in defs.values() if len(v) > 1)} "
          f"duplicates_after_platform_collapse={len(real)} baseline={len(baseline)}")
    for sym in new:
        print(f"NEW_DUPLICATE {sym}")
        for rel, i in real[sym]:
            print(f"    {rel}:{i}")
    for sym in gone:
        print(f"BASELINE_STALE {sym} (已不再重复，可 --update-baseline 收紧)")
    if new:
        print(f"result: FAIL (new_duplicates={len(new)})")
        return 1
    print(f"result: PASS (no new duplicates; baseline_stale={len(gone)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
