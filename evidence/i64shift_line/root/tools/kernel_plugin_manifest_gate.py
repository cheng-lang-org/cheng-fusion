#!/usr/bin/env python3
"""kernel_plugin_manifest_gate — Step2 插件清单与归属表一致性硬门。

对应 docs/cheng-minimal-kernel-plan.md Step 2 + Step 4（设计卷 §5.1）：
- x86_64 / aarch64 / riscv64 三个首版插件桶必须有同名 manifest；
- manifest 必须声明 plugin_canonical_triple 且与该 arch 正典 triple 一致；
- manifest 条目路径必须存在、唯一，且归属表判定为该架构；
- 归属表中该架构的每个 backend 源都必须恰好进对应 manifest；
- 插件清单之间不得重复；插件条目不得出现在 kernel manifest 中。

wasm32/riscv32 是计划明示的后续桶，本门不要求首版 manifest。
"""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
ACTIVE_ARCHES = ("x86_64", "aarch64", "riscv64")

# Step 4 取件接线（设计卷 step4-fetch-design-20260827 §5.1）：manifest 必须声明
# plugin_canonical_triple（PLUGIN_TARGET 语义的 manifest 化），组合根取件客户端
# 以它做权威互证；manifest 只声明事实，不钉 CID 字面量。
CANONICAL_KEY = "plugin_canonical_triple"
COMPOSITION_SCHEMA_KEY = "composition_schema"
COMPOSITION_KIND_KEY = "composition_kind"
COMPILER_ENTRY_KEY = "compiler_entry_source"
KERNEL_MANIFEST_KEY = "kernel_manifest"
COMPOSITION_SCHEMA = "cheng.composition.v1"
CANONICAL_TRIPLES = {
    "x86_64": "x86_64-unknown-linux-gnu",
    "aarch64": "arm64-apple-darwin",
    "riscv64": "riscv64-unknown-linux-gnu",
}


class GateError(Exception):
    pass


def strip_comment(raw: str) -> str:
    return raw.split("#", 1)[0].strip()


def load_tsv() -> dict[str, str]:
    path = ROOT / "tools/kernel_plugin_attribution.tsv"
    if not path.is_file():
        raise GateError(f"attribution table missing: {path}")
    table: dict[str, str] = {}
    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line:
            continue
        parts = raw.split("\t")
        if len(parts) < 2 or len(parts) > 3:
            raise GateError(f"{path}:{lineno}: malformed row: {raw!r}")
        rel = parts[0].strip()
        bucket = parts[1].strip()
        if rel in table:
            raise GateError(f"{path}:{lineno}: duplicate path {rel}")
        if not (rel.startswith("src/core/backend/") or rel.startswith("src/core/backend2/")):
            raise GateError(f"{path}:{lineno}: path outside covered backend dirs: {rel}")
        table[rel] = bucket
    return table


def parse_manifest(path: Path) -> list[tuple[str, str]]:
    if not path.is_file():
        raise GateError(f"plugin manifest missing: {path}")
    entries: list[tuple[str, str]] = []
    seen_keys: set[str] = set()
    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = strip_comment(raw)
        if not line:
            continue
        if "=" not in line:
            raise GateError(f"{path}:{lineno}: non-entry line {raw!r}")
        key, value = (part.strip() for part in line.split("=", 1))
        value = value.split()[0] if value.split() else ""
        if not key or not value:
            raise GateError(f"{path}:{lineno}: empty key/value")
        if key in seen_keys:
            raise GateError(f"{path}:{lineno}: duplicate key {key}")
        seen_keys.add(key)
        entries.append((key, value))
    if not entries:
        raise GateError(f"{path}: no manifest entries")
    return entries


def main() -> int:
    try:
        table = load_tsv()
        all_plugin_paths: list[str] = []
        summaries: list[str] = []

        for arch in ACTIVE_ARCHES:
            manifest_path = ROOT / f"bootstrap/plugin_manifest_{arch}.cheng"
            entries = parse_manifest(manifest_path)
            values_by_key = dict(entries)
            if values_by_key.get(COMPOSITION_SCHEMA_KEY) != COMPOSITION_SCHEMA:
                raise GateError(
                    f"{manifest_path}: {COMPOSITION_SCHEMA_KEY} must be {COMPOSITION_SCHEMA}"
                )
            if values_by_key.get(COMPOSITION_KIND_KEY) != "plugin":
                raise GateError(
                    f"{manifest_path}: {COMPOSITION_KIND_KEY} must be plugin"
                )
            if values_by_key.get(KERNEL_MANIFEST_KEY) != "bootstrap/kernel_manifest.cheng":
                raise GateError(
                    f"{manifest_path}: {KERNEL_MANIFEST_KEY} must name canonical kernel manifest"
                )
            expected_entry = f"src/core/tooling/compiler_composition_{arch}_main.cheng"
            if values_by_key.get(COMPILER_ENTRY_KEY) != expected_entry:
                raise GateError(
                    f"{manifest_path}: {COMPILER_ENTRY_KEY}={values_by_key.get(COMPILER_ENTRY_KEY)}, "
                    f"expected {expected_entry}"
                )
            canonicals = [value for key, value in entries if key == CANONICAL_KEY]
            if len(canonicals) != 1:
                raise GateError(
                    f"{manifest_path}: expected exactly one {CANONICAL_KEY}, got {len(canonicals)}"
                )
            if canonicals[0] != CANONICAL_TRIPLES[arch]:
                raise GateError(
                    f"{manifest_path}: {CANONICAL_KEY}={canonicals[0]}, "
                    f"expected {CANONICAL_TRIPLES[arch]}"
                )
            metadata_keys = {
                CANONICAL_KEY,
                COMPOSITION_SCHEMA_KEY,
                COMPOSITION_KIND_KEY,
                COMPILER_ENTRY_KEY,
                KERNEL_MANIFEST_KEY,
            }
            paths = [value for key, value in entries if key not in metadata_keys]
            duplicated = sorted({p for p in paths if paths.count(p) > 1})
            if duplicated:
                raise GateError(f"{manifest_path}: duplicate paths {duplicated}")
            for rel in paths:
                if not rel.startswith("src/core/backend/"):
                    raise GateError(f"{manifest_path}: entry outside backend dir: {rel}")
                if not (ROOT / rel).is_file():
                    raise GateError(f"{manifest_path}: missing source {rel}")
                bucket = table.get(rel)
                if bucket is None:
                    raise GateError(f"{manifest_path}: source missing from attribution table: {rel}")
                if bucket != arch:
                    raise GateError(
                        f"{manifest_path}: {rel} attributed to {bucket}, expected {arch}"
                    )
            expected = sorted(rel for rel, bucket in table.items() if bucket == arch)
            actual = sorted(set(paths))
            missing = sorted(set(expected) - set(actual))
            extra = sorted(set(actual) - set(expected))
            if missing or extra:
                raise GateError(
                    f"{manifest_path}: attribution mismatch missing={missing} extra={extra}"
                )
            all_plugin_paths.extend(paths)
            summaries.append(f"{arch}={len(paths)}")

        cross_duplicates = sorted({p for p in all_plugin_paths if all_plugin_paths.count(p) > 1})
        if cross_duplicates:
            raise GateError(f"plugin manifests repeat sources: {cross_duplicates}")

        kernel_manifest = ROOT / "bootstrap/kernel_manifest.cheng"

        kernel_entries = dict(parse_manifest(kernel_manifest))
        if kernel_entries.get(COMPOSITION_SCHEMA_KEY) != COMPOSITION_SCHEMA:
            raise GateError(
                f"{kernel_manifest}: {COMPOSITION_SCHEMA_KEY} must be {COMPOSITION_SCHEMA}"
            )
        if kernel_entries.get(COMPOSITION_KIND_KEY) != "kernel-only":
            raise GateError(
                f"{kernel_manifest}: {COMPOSITION_KIND_KEY} must be kernel-only"
            )
        if kernel_entries.get(COMPILER_ENTRY_KEY) != "src/core/tooling/compiler_composition_kernel_main.cheng":
            raise GateError(
                f"{kernel_manifest}: production compiler entry is not kernel composition root"
            )

        def manifest_paths(path: Path) -> set[str]:
            return {
                value
                for key, value in parse_manifest(path)
                if key.endswith("_source") and key != COMPILER_ENTRY_KEY
            }

        overlap = sorted(manifest_paths(kernel_manifest) & set(all_plugin_paths))
        if overlap:
            raise GateError(f"sources occur in both kernel and plugin manifests: {overlap}")

        print(
            "manifest-gate: PASS ("
            + ", ".join(summaries)
            + "; coverage=exact; cross_manifest_unique=true)"
        )
        return 0
    except GateError as exc:
        print(f"manifest-gate: FAIL ({exc})")
        return 1


if __name__ == "__main__":
    sys.exit(main())
