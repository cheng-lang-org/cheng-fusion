#!/usr/bin/env python3
"""Darwin-safe negative and codec contracts for kernel_release_receipt.py.

A positive release receipt is intentionally impossible without Linux, root-owned
cgroup-v2 evidence from csg_core_exact_1g_process_tree_gate. This test proves
the local hard-red boundary and exercises the canonical receipt codec without
introducing a fake validator or a proof bypass.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import stat
import subprocess
import sys
from pathlib import Path
from types import ModuleType
from typing import Any, Iterable


SELF_HASH_DOMAIN = b"cheng.kernel.release.v1.self\0"
LIMIT_BYTES = 1_073_741_824


def die(message: str) -> None:
    raise RuntimeError(message)


def canonical_json(value: Any) -> bytes:
    return json.dumps(
        value,
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def write_bytes(path: Path, raw: bytes, mode: int | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)
    if mode is not None:
        path.chmod(mode)


def encode_rows(rows: Iterable[tuple[str, str]]) -> bytes:
    return b"".join(
        key.encode("utf-8") + b"=" + value.encode("utf-8") + b"\n"
        for key, value in rows
    )


def file_manifest(schema: str, root: Path, relatives: list[str]) -> bytes:
    root = root.resolve(strict=True)
    rows: list[tuple[str, str]] = [
        ("schema", schema),
        ("root_fshex", os.fsencode(root).hex()),
        ("entry_count", str(len(relatives))),
    ]
    for index, relative in enumerate(relatives):
        path = root / relative
        raw = path.read_bytes()
        metadata = path.lstat()
        if not stat.S_ISREG(metadata.st_mode):
            die("test_manifest_member_not_regular")
        prefix = f"entry.{index}."
        rows.extend(
            (
                (prefix + "path_fshex", os.fsencode(relative).hex()),
                (prefix + "sha256", hashlib.sha256(raw).hexdigest()),
                (prefix + "size_bytes", str(len(raw))),
                (prefix + "mode_decimal", str(metadata.st_mode)),
            )
        )
    return encode_rows(rows)


def declared_sources_sha256(relatives: list[str]) -> str:
    raw = bytearray(b"cheng.composition.declared_sources.v1\n")
    for relative in sorted(relatives):
        encoded = relative.encode("utf-8")
        raw.extend(str(len(encoded)).encode("ascii"))
        raw.extend(b":")
        raw.extend(encoded)
        raw.extend(b"\n")
    return hashlib.sha256(raw).hexdigest()


def load_tool(path: Path) -> ModuleType:
    name = "cheng_kernel_release_receipt_contract_subject"
    specification = importlib.util.spec_from_file_location(name, path)
    if specification is None or specification.loader is None:
        die("release_tool_import_unavailable")
    module = importlib.util.module_from_spec(specification)
    sys.modules[name] = module
    specification.loader.exec_module(module)
    return module


def run(
    arguments: list[str],
    *,
    cwd: Path,
    expect_success: bool,
    label: str,
) -> subprocess.CompletedProcess[bytes]:
    task_tmp = os.environ.get("TMPDIR", "")
    if not task_tmp or not Path(task_tmp).is_dir():
        die("task_tmpdir_missing")
    environment = {
        "CHENG_TASK_TMPDIR": os.environ["CHENG_TASK_TMPDIR"],
        "HOME": "/nonexistent",
        "LANG": "C",
        "LC_ALL": "C",
        "PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
        "TMPDIR": task_tmp,
        "TZ": "UTC",
        "PYTHONDONTWRITEBYTECODE": "1",
    }
    process = subprocess.run(
        arguments,
        cwd=cwd,
        env=environment,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if (process.returncode == 0) != expect_success:
        die(
            label
            + ":unexpected_rc="
            + str(process.returncode)
            + ":stdout="
            + process.stdout.decode("utf-8", "replace")
            + ":stderr="
            + process.stderr.decode("utf-8", "replace")
        )
    return process


class Fixture:
    def __init__(self, work: Path, repo: Path) -> None:
        self.work = work
        self.repo = repo
        self.tool = repo / "tools" / "kernel_release_receipt.py"
        self.formal_gate = repo / "tools" / "csg_core_exact_1g_process_tree_gate"
        self.formal_validator = (
            repo / "tools" / "csg_core_exact_1g_process_tree_receipt_validator"
        )
        self.source_root = work / "source"
        source_file = self.source_root / "src" / "main.cheng"
        write_bytes(source_file, b"fn main() -> int32 { return 0 }\n")
        kernel_entry = (
            self.source_root
            / "src"
            / "core"
            / "tooling"
            / "compiler_composition_kernel_main.cheng"
        )
        plugin_entry = (
            self.source_root
            / "src"
            / "core"
            / "tooling"
            / "compiler_composition_aarch64_main.cheng"
        )
        write_bytes(kernel_entry, b"fn main() -> int32 { return 0 }\n")
        write_bytes(plugin_entry, b"fn main() -> int32 { return 0 }\n")
        write_bytes(
            self.source_root / "src" / "core" / "kernel-unit.cheng",
            b"fn kernelUnit() -> int32 { return 7 }\n",
        )
        write_bytes(
            self.source_root / "src" / "core" / "aarch64-unit.cheng",
            b"fn pluginUnit() -> int32 { return 8 }\n",
        )
        self.git("init", "-q", "--object-format=sha1")
        self.git("config", "user.email", "kernel-release-test@example.invalid")
        self.git("config", "user.name", "Kernel Release Contract Test")
        self.git("add", "src")
        self.git("-c", "commit.gpgsign=false", "commit", "-qm", "fixture")

        self.kernel_manifest = (
            self.source_root / "bootstrap" / "kernel_manifest.cheng"
        )
        write_bytes(
            self.kernel_manifest,
            encode_rows(
                (
                    ("composition_schema", "cheng.composition.v1"),
                    ("composition_kind", "kernel-only"),
                    (
                        "compiler_entry_source",
                        "src/core/tooling/compiler_composition_kernel_main.cheng",
                    ),
                    ("kernel_unit_source", "src/core/kernel-unit.cheng"),
                )
            ),
        )
        self.composition_manifest = (
            self.source_root / "bootstrap" / "plugin_manifest_aarch64.cheng"
        )
        write_bytes(
            self.composition_manifest,
            encode_rows(
                (
                    ("composition_schema", "cheng.composition.v1"),
                    ("composition_kind", "plugin"),
                    ("kernel_manifest", "bootstrap/kernel_manifest.cheng"),
                    (
                        "plugin_canonical_triple",
                        "arm64-apple-darwin",
                    ),
                    (
                        "compiler_entry_source",
                        "src/core/tooling/compiler_composition_aarch64_main.cheng",
                    ),
                    ("plugin_unit_source", "src/core/aarch64-unit.cheng"),
                )
            ),
        )
        self.composition_closure = work / "composition-closure.kv"
        write_bytes(
            self.composition_closure,
            file_manifest(
                "cheng.kernel.composition_closure.v1",
                self.source_root,
                [
                    "src/core/aarch64-unit.cheng",
                    "src/core/kernel-unit.cheng",
                    "src/core/tooling/compiler_composition_aarch64_main.cheng",
                ],
            ),
        )
        self.kernel_composition_closure = work / "kernel-composition-closure.kv"
        write_bytes(
            self.kernel_composition_closure,
            file_manifest(
                "cheng.kernel.composition_closure.v1",
                self.source_root,
                [
                    "src/core/kernel-unit.cheng",
                    "src/core/tooling/compiler_composition_kernel_main.cheng",
                ],
            ),
        )
        self.compiler = work / "compiler.bin"
        write_bytes(self.compiler, b"test-compiler-v1\n", 0o755)
        toolchain_root = work / "toolchain"
        write_bytes(toolchain_root / "ld", b"test-linker-v1\n", 0o755)
        self.toolchain_manifest = work / "toolchain.kv"
        write_bytes(
            self.toolchain_manifest,
            file_manifest(
                "cheng.kernel.toolchain_manifest.v1",
                toolchain_root,
                ["ld"],
            ),
        )
        artifact_root = work / "artifacts"
        write_bytes(artifact_root / "cheng", b"test-release-artifact-v1\n", 0o755)
        self.artifact_manifest = work / "artifacts.kv"
        write_bytes(
            self.artifact_manifest,
            file_manifest(
                "cheng.kernel.artifact_manifest.v1",
                artifact_root,
                ["cheng"],
            ),
        )
        source_bundle_cid = "1" * 64
        source_identity_receipt_cid = "2" * 64
        semantic_receipt_cid = "3" * 64
        binding_seal = "4" * 64
        output_sha256 = hashlib.sha256(
            (artifact_root / "cheng").read_bytes()
        ).hexdigest()
        compiler_sha256 = hashlib.sha256(self.compiler.read_bytes()).hexdigest()
        manifest_sha256 = hashlib.sha256(
            self.composition_manifest.read_bytes()
        ).hexdigest()
        kernel_manifest_sha256 = hashlib.sha256(
            self.kernel_manifest.read_bytes()
        ).hexdigest()
        declared = [
            "src/core/aarch64-unit.cheng",
            "src/core/kernel-unit.cheng",
            "src/core/tooling/compiler_composition_aarch64_main.cheng",
        ]
        self.compiler_report = work / "compiler-composition.report.kv"
        write_bytes(
            self.compiler_report,
            encode_rows(
                (
                    ("target", "arm64-apple-darwin"),
                    ("output", str((artifact_root / "cheng").resolve())),
                    ("source_bundle_cid", source_bundle_cid),
                    ("canonical_compiler_csg_cid", "5" * 64),
                    (
                        "source_identity_receipt_cid",
                        source_identity_receipt_cid,
                    ),
                    ("semantic_receipt_cid", semantic_receipt_cid),
                    ("source_to_csg_binding_seal", binding_seal),
                    ("compile_receipt_target", "arm64-apple-darwin"),
                    ("compile_receipt_cid", "6" * 64),
                    ("composition_manifest_schema", "cheng.composition.v1"),
                    ("composition_manifest_sha256", manifest_sha256),
                    (
                        "composition_kernel_manifest_sha256",
                        kernel_manifest_sha256,
                    ),
                    ("composition_kind", "plugin"),
                    (
                        "composition_entry_source",
                        "src/core/tooling/compiler_composition_aarch64_main.cheng",
                    ),
                    (
                        "composition_plugin_canonical_triple",
                        "arm64-apple-darwin",
                    ),
                    ("composition_declared_source_count", "3"),
                    (
                        "composition_declared_sources_sha256",
                        declared_sources_sha256(declared),
                    ),
                    ("composition_source_closure_count", "3"),
                    ("composition_source_closure_sha256", source_bundle_cid),
                    (
                        "composition_source_identity_receipt_cid",
                        source_identity_receipt_cid,
                    ),
                    ("system_link_exec_runtime_execute", "1"),
                    ("final_output_sha256", output_sha256),
                    (
                        "final_source_identity_receipt_cid",
                        source_identity_receipt_cid,
                    ),
                    ("final_semantic_receipt_cid", semantic_receipt_cid),
                    ("final_source_to_csg_binding_seal", binding_seal),
                    ("system_link_exec", "1"),
                    ("real_backend_codegen", "1"),
                    ("cold_system_link_exec", "0"),
                    ("system_link_exec_scope", "selfhost_direct"),
                    ("full_backend_codegen", "1"),
                    ("compiler_executable_cid", "sha256:" + compiler_sha256),
                    ("compiler_composition_kind", "plugin"),
                    ("compiler_composition_unit_id", "1"),
                    (
                        "compiler_composition_unit_triple",
                        "arm64-apple-darwin",
                    ),
                    ("output_sha256", output_sha256),
                    ("compiler_output_receipt_cid", "7" * 64),
                )
            ),
        )
        self.formal_manifest = work / "formal-command-manifest.json"
        uid = os.getuid() if os.getuid() > 0 else 65534
        gid = os.getgid() if os.getgid() > 0 else 65534
        formal_manifest = {
            "schema": "csg_core.exact_1g_process_tree.command_list",
            "limitBytes": LIMIT_BYTES,
            "runUid": uid,
            "runGid": gid,
            "commands": [
                {
                    "id": "kernel-release-build",
                    "argv": [
                        str(self.compiler.resolve()),
                        "system-link-exec",
                        "--root:" + str(self.source_root.resolve()),
                        "--in:" + str(plugin_entry.resolve()),
                        "--composition-manifest:"
                        + str(self.composition_manifest.resolve()),
                        "--emit:exe",
                        "--target:arm64-apple-darwin",
                        "--backend-jobs:4",
                        "--cache-disabled:1",
                        "--require-pure-system-link-exec",
                        "--out:" + str((artifact_root / "cheng").resolve()),
                        "--report-out:" + str(self.compiler_report.resolve()),
                    ],
                    "cwd": str(self.source_root.resolve()),
                    "env": {
                        "BACKEND_JOBS": "4",
                        "CHENG_DISABLE_COLD_OBJECT_CACHE": "1",
                        "CHENG_DISABLE_PRIMARY_OBJECT_CACHE": "1",
                        "CHENG_DISABLE_PROVIDER_OBJECT_CACHE": "1",
                        "CHENG_DISABLE_PURE_EXE_CACHE": "1",
                        "CHENG_DISABLE_SYSTEM_LINK_EXEC_CACHE": "1",
                        "CHENG_ENTRY_CACHE": "0",
                        "CHENG_NO_CACHE": "1",
                        "CHENG_STRICT_NO_CACHE": "1",
                        "CHENG_SYSTEM_LINK_EXEC_NO_CACHE": "1",
                    },
                    "timeoutSeconds": 1,
                }
            ],
        }
        write_bytes(self.formal_manifest, canonical_json(formal_manifest) + b"\n")
        self.evidence = work / "formal-evidence"
        gate = run(
            [
                sys.executable,
                str(self.formal_gate),
                "--manifest",
                str(self.formal_manifest.resolve()),
                "--evidence-dir",
                str(self.evidence.resolve()),
            ],
            cwd=repo,
            expect_success=False,
            label="formal_gate_must_be_hard_red_without_linux_held_authority",
        )
        if b"csg_core_exact_1g_gate_status=hard_red\n" not in gate.stderr:
            die("formal_gate_hard_red_marker_missing")
        self.formal_receipt = self.evidence / "receipt.json"
        if not self.formal_receipt.is_file():
            die("formal_gate_hard_red_receipt_missing")
        self.output = work / "release.receipt.kv"

    def git(self, *arguments: str) -> None:
        process = subprocess.run(
            ["git", "-C", str(self.source_root), *arguments],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        if process.returncode != 0:
            die("git_fixture_failed:" + process.stderr.decode("utf-8", "replace"))

    def args(self, command: str, receipt: Path | None = None) -> list[str]:
        arguments = [
            sys.executable,
            str(self.tool),
            command,
            "--source-root",
            str(self.source_root.resolve()),
            "--source-scope",
            "src",
            "--composition-manifest",
            str(self.composition_manifest.resolve()),
            "--composition-closure-manifest",
            str(self.composition_closure.resolve()),
            "--compiler",
            str(self.compiler.resolve()),
            "--compiler-composition-report",
            str(self.compiler_report.resolve()),
            "--toolchain-manifest",
            str(self.toolchain_manifest.resolve()),
            "--memory-evidence-dir",
            str(self.evidence.resolve()),
            "--memory-command-manifest",
            str(self.formal_manifest.resolve()),
            "--memory-receipt",
            str((receipt or self.formal_receipt).resolve()),
            "--artifact-manifest",
            str(self.artifact_manifest.resolve()),
            "--target",
            "arm64-apple-darwin",
            "--jobs",
            "4",
            "--cache-mode",
            "off",
        ]
        if command == "create":
            arguments.extend(("--out", str(self.output.resolve())))
        else:
            arguments.extend(("--receipt", str(self.output.resolve())))
        return arguments


def expect_release_failure(
    fixture: Fixture,
    arguments: list[str],
    label: str,
    marker: bytes | None = None,
) -> None:
    process = run(
        arguments,
        cwd=fixture.repo,
        expect_success=False,
        label=label,
    )
    if marker is not None and marker not in process.stderr:
        die(label + ":expected_error_marker_missing")
    if fixture.output.exists():
        die(label + ":failed_release_left_output")


def codec_contract(module: ModuleType, scratch: Path) -> None:
    rows: list[tuple[str, str]] = []
    for key in module.RECEIPT_KEYS[:-1]:
        if key == "schema":
            value = module.RECEIPT_SCHEMA
        elif key.endswith("sha256") or key.endswith("_cid"):
            value = "1" * 64
        elif key == "composition_entry_source_fshex":
            value = b"src/core/main.cheng".hex()
        elif key.endswith("_fshex"):
            value = os.fsencode(str(scratch.resolve())).hex()
        elif key in {
            "composition_manifest_size_bytes",
            "composition_declared_source_count",
            "composition_closure_count",
            "compiler_composition_report_size_bytes",
            "compiler_size_bytes",
            "compiler_mode_decimal",
            "toolchain_count",
            "jobs",
            "wall_ms",
            "memory_command_count",
            "memory_limit_bytes",
            "memory_peak_bytes",
            "artifact_count",
        }:
            value = "1"
        elif key in {
            "memory_exit_code",
            "memory_swap_limit_bytes",
            "memory_oom_kill_count",
        }:
            value = "0"
        elif key == "composition_kind":
            value = "plugin"
        elif key in ("composition_plugin_canonical_triple", "target"):
            value = "arm64-apple-darwin"
        else:
            value = "contract-token"
        rows.append((key, value))
    raw = module.sealed_receipt(rows)
    module.parse_receipt(raw)
    lines = raw[:-1].split(b"\n")

    def reseal(candidate: list[bytes]) -> bytes:
        prefix = b"\n".join(candidate[:-1]) + b"\n"
        digest = hashlib.sha256(SELF_HASH_DOMAIN + prefix).hexdigest().encode("ascii")
        return prefix + b"receipt_sha256=" + digest + b"\n"

    attacks: dict[str, bytes] = {}
    duplicate = list(lines)
    duplicate.insert(1, duplicate[0])
    attacks["duplicate"] = reseal(duplicate)
    missing = [line for line in lines if not line.startswith(b"compiler_size_bytes=")]
    attacks["missing"] = reseal(missing)
    reordered = list(lines)
    reordered[1], reordered[2] = reordered[2], reordered[1]
    attacks["reordered"] = reseal(reordered)
    unknown = list(lines)
    unknown.insert(-1, b"unknown=forbidden")
    attacks["unknown"] = reseal(unknown)
    attacks["bad_self"] = raw[:-65] + b"2" * 64 + b"\n"
    attacks["crlf"] = raw.replace(b"\n", b"\r\n")
    for label, attacked in attacks.items():
        try:
            module.parse_receipt(attacked)
        except module.ReceiptError:
            pass
        else:
            die("codec_attack_accepted:" + label)

    output = scratch / "atomic-exclusive.bin"
    module.write_atomic_exclusive(str(output.resolve()), b"first\n")
    try:
        module.write_atomic_exclusive(str(output.resolve()), b"second\n")
    except module.ReceiptError:
        pass
    else:
        die("atomic_non_overwrite_missing")
    if output.read_bytes() != b"first\n":
        die("atomic_non_overwrite_changed_output")

    held_path = scratch / "held-source.py"
    replacement_path = scratch / "held-source-replacement.py"
    write_bytes(held_path, b"print('same bytes')\n", 0o755)
    write_bytes(replacement_path, b"print('same bytes')\n", 0o755)
    expected = module.stable_file(str(held_path.resolve()), "held_source_fixture")
    if held_path.stat().st_ino == replacement_path.stat().st_ino:
        die("held_source_fixture_inode_not_distinct")
    os.replace(replacement_path, held_path)
    try:
        descriptor = module.open_stable_held_source(
            str(held_path.resolve()),
            expected,
            "held_source_fixture",
        )
    except module.ReceiptError:
        pass
    else:
        os.close(descriptor)
        die("same_content_different_inode_validator_source_accepted")


def inner_main() -> None:
    scratch_raw = os.environ.get("CHENG_TASK_TMPDIR")
    if not scratch_raw:
        die("scratch_scope_missing")
    scratch = Path(scratch_raw).resolve(strict=True)
    repo = Path(__file__).resolve().parent.parent
    tool = repo / "tools" / "kernel_release_receipt.py"
    module = load_tool(tool)
    source = tool.read_text(encoding="utf-8")
    forbidden = (
        "cheng.kernel.guard.v1",
        'parser.add_argument("--guard-report"',
        'parser.add_argument("--memory-limit-bytes"',
        'parser.add_argument("--memory-authority"',
        'parser.add_argument("--memory-validator"',
        'parser.add_argument("--wall-ms"',
    )
    if any(fragment in source for fragment in forbidden):
        die("legacy_or_caller_controlled_memory_proof_interface_present")
    required = (
        "csg_core_exact_1g_process_tree_receipt_validator",
        "csg_core_exact_1g_process_tree_gate",
        "beat_c_linux_cgroup_v2_native_hard_memory_gate.sh",
        "formal_release_command_projection",
        'parser.add_argument("--compiler-composition-report", required=True)',
        '"--require-pure-system-link-exec"',
        '"compiler_executable_cid"',
        'f"/proc/self/fd/{descriptor}"',
        '"-I",',
        '"-S",',
        "FORMAL_MEMORY_LIMIT_BYTES = 1_073_741_824",
    )
    if any(fragment not in source for fragment in required):
        die("formal_memory_revalidation_contract_missing")

    original_tmpdir = os.environ["TMPDIR"]
    if Path(original_tmpdir).resolve(strict=True) != Path(original_tmpdir):
        die("contract_tmpdir_not_canonical")
    if module.required_task_tmpdir() != original_tmpdir:
        die("task_tmpdir_projection_mismatch")
    os.environ["TMPDIR"] = "/"
    try:
        module.required_task_tmpdir()
    except module.ReceiptError:
        pass
    else:
        die("task_tmpdir_escape_accepted")
    finally:
        os.environ["TMPDIR"] = original_tmpdir

    codec_contract(module, scratch)
    fixture = Fixture(scratch / "case", repo)
    closure = module.verify_file_manifest(
        str(fixture.composition_closure.resolve()),
        "composition_contract_fixture",
        module.COMPOSITION_CLOSURE_SCHEMA,
        b"cheng.kernel.composition_closure.v1.identity",
        require_nonempty_files=False,
    )
    composition = module.verify_composition_identity(
        str(fixture.source_root.resolve()),
        str(fixture.composition_manifest.resolve()),
        closure,
        "arm64-apple-darwin",
    )
    if (
        composition.kind != "plugin"
        or composition.plugin_triple != "arm64-apple-darwin"
        or len(composition.sources) != 3
    ):
        die("composition_manifest_closure_projection_invalid")
    artifacts = module.verify_file_manifest(
        str(fixture.artifact_manifest.resolve()),
        "artifact_contract_fixture",
        module.ARTIFACT_MANIFEST_SCHEMA,
        b"cheng.kernel.artifact_manifest.v1.identity",
        require_nonempty_files=True,
    )
    compiler = module.stable_file(
        str(fixture.compiler.resolve()), "compiler_contract_fixture"
    )
    report = module.verify_compiler_composition_report(
        str(fixture.compiler_report.resolve()),
        compiler,
        composition,
        closure,
        artifacts,
        "arm64-apple-darwin",
    )
    if report.output_sha256 != artifacts.entries[0].sha256:
        die("compiler_composition_report_output_projection_invalid")

    # The output composition and the compiler doing the build are independent:
    # a kernel-only output must be built by the target's active plugin compiler.
    kernel_closure = module.verify_file_manifest(
        str(fixture.kernel_composition_closure.resolve()),
        "kernel_composition_contract_fixture",
        module.COMPOSITION_CLOSURE_SCHEMA,
        b"cheng.kernel.composition_closure.v1.identity",
        require_nonempty_files=False,
    )
    kernel_composition = module.verify_composition_identity(
        str(fixture.source_root.resolve()),
        str(fixture.kernel_manifest.resolve()),
        kernel_closure,
        "arm64-apple-darwin",
    )
    kernel_report_values = []
    kernel_report_updates = {
        "composition_manifest_sha256": kernel_composition.manifest_sha256,
        "composition_kernel_manifest_sha256": "-",
        "composition_kind": "kernel-only",
        "composition_entry_source": os.fsdecode(kernel_composition.entry_source),
        "composition_plugin_canonical_triple": "-",
        "composition_declared_source_count": str(len(kernel_composition.sources)),
        "composition_declared_sources_sha256": (
            kernel_composition.declared_sources_sha256
        ),
        "composition_source_closure_count": str(kernel_closure.count),
    }
    for raw_line in fixture.compiler_report.read_bytes()[:-1].split(b"\n"):
        key_raw, separator, value_raw = raw_line.partition(b"=")
        if separator != b"=":
            die("kernel_composition_report_fixture_row_invalid")
        key = key_raw.decode("utf-8")
        value = kernel_report_updates.get(key, value_raw.decode("utf-8"))
        kernel_report_values.append((key, value))
    kernel_report_path = fixture.work / "kernel-composition.report.kv"
    write_bytes(kernel_report_path, encode_rows(kernel_report_values))
    kernel_report = module.verify_compiler_composition_report(
        str(kernel_report_path.resolve()),
        compiler,
        kernel_composition,
        kernel_closure,
        artifacts,
        "arm64-apple-darwin",
    )
    if kernel_report.output_sha256 != report.output_sha256:
        die("kernel_output_plugin_compiler_positive_projection_invalid")
    attestation_root = fixture.work / "attestation-evidence"
    attestation_root.mkdir()
    attestation_stdout = encode_rows(
        (
            ("composition_execution_output_sha256", report.output_sha256),
            ("composition_execution_report_sha256", report.sha256),
        )
    )
    write_bytes(attestation_root / "stdout", attestation_stdout)
    write_bytes(attestation_root / "stderr", b"")
    attestation_command = {
        "stdoutRelativePath": "stdout",
        "stdoutSha256": hashlib.sha256(attestation_stdout).hexdigest(),
        "stdoutBytes": len(attestation_stdout),
        "stderrRelativePath": "stderr",
        "stderrSha256": hashlib.sha256(b"").hexdigest(),
        "stderrBytes": 0,
    }
    module.verify_release_command_artifact_attestation(
        os.fsencode(attestation_root.resolve()),
        attestation_command,
        report,
    )
    write_bytes(
        attestation_root / "stdout",
        attestation_stdout.replace(report.output_sha256.encode("ascii"), b"8" * 64),
    )
    try:
        module.verify_release_command_artifact_attestation(
            os.fsencode(attestation_root.resolve()),
            attestation_command,
            report,
        )
    except module.ReceiptError:
        pass
    else:
        die("formal_release_artifact_substitution_attestation_accepted")
    write_bytes(attestation_root / "stdout", attestation_stdout)
    release_index, release_id, release_argv_sha256 = (
        module.formal_release_command_projection(
            fixture.formal_manifest.read_bytes(),
            source_root=str(fixture.source_root.resolve()),
            composition_manifest=str(fixture.composition_manifest.resolve()),
            compiler_path=str(fixture.compiler.resolve()),
            compiler=compiler,
            compiler_report_path=str(fixture.compiler_report.resolve()),
            composition=composition,
            compiler_report=report,
            target="arm64-apple-darwin",
            jobs=4,
        )
    )
    if (
        release_index != 0
        or release_id != "kernel-release-build"
        or len(release_argv_sha256) != 64
    ):
        die("formal_release_command_projection_invalid")
    unrelated_manifest = json.loads(
        fixture.formal_manifest.read_text(encoding="utf-8")
    )
    unrelated_manifest["commands"][0]["argv"][1] = "unrelated-workload"
    try:
        module.formal_release_command_projection(
            canonical_json(unrelated_manifest) + b"\n",
            source_root=str(fixture.source_root.resolve()),
            composition_manifest=str(fixture.composition_manifest.resolve()),
            compiler_path=str(fixture.compiler.resolve()),
            compiler=compiler,
            compiler_report_path=str(fixture.compiler_report.resolve()),
            composition=composition,
            compiler_report=report,
            target="arm64-apple-darwin",
            jobs=4,
        )
    except module.ReceiptError:
        pass
    else:
        die("unrelated_formal_memory_workload_accepted")
    injected_environment_manifest = json.loads(
        fixture.formal_manifest.read_text(encoding="utf-8")
    )
    injected_environment_manifest["commands"][0]["env"]["LD_PRELOAD"] = (
        "/unbound/injection.so"
    )
    try:
        module.formal_release_command_projection(
            canonical_json(injected_environment_manifest) + b"\n",
            source_root=str(fixture.source_root.resolve()),
            composition_manifest=str(fixture.composition_manifest.resolve()),
            compiler_path=str(fixture.compiler.resolve()),
            compiler=compiler,
            compiler_report_path=str(fixture.compiler_report.resolve()),
            composition=composition,
            compiler_report=report,
            target="arm64-apple-darwin",
            jobs=4,
        )
    except module.ReceiptError:
        pass
    else:
        die("formal_release_unbound_environment_accepted")
    original_report = fixture.compiler_report.read_bytes()
    for label, attacked_report in (
        (
            "false_green",
            original_report.replace(
                b"full_backend_codegen=1", b"full_backend_codegen=0"
            ),
        ),
        (
            "legacy_driver",
            original_report.replace(
                b"compiler_composition_kind=plugin",
                b"compiler_composition_kind=legacy",
            ),
        ),
        (
            "wrong_active_unit",
            original_report.replace(
                b"compiler_composition_unit_id=1",
                b"compiler_composition_unit_id=2",
            ),
        ),
        (
            "kernel_compiler",
            original_report.replace(
                b"compiler_composition_kind=plugin",
                b"compiler_composition_kind=kernel-only",
            )
            .replace(
                b"compiler_composition_unit_id=1",
                b"compiler_composition_unit_id=0",
            )
            .replace(
                b"compiler_composition_unit_triple=arm64-apple-darwin",
                b"compiler_composition_unit_triple=-",
            ),
        ),
    ):
        fixture.compiler_report.write_bytes(attacked_report)
        try:
            module.verify_compiler_composition_report(
                str(fixture.compiler_report.resolve()),
                compiler,
                composition,
                closure,
                artifacts,
                "arm64-apple-darwin",
            )
        except module.ReceiptError:
            pass
        else:
            die("compiler_composition_report_attack_accepted:" + label)
    fixture.compiler_report.write_bytes(original_report)
    for label, bad_closure, bad_target in (
        (
            "missing_source",
            module.FileManifestIdentity(
                raw_sha256=closure.raw_sha256,
                identity_cid=closure.identity_cid,
                count=closure.count - 1,
                root=closure.root,
                entries=closure.entries[:-1],
            ),
            "arm64-apple-darwin",
        ),
        ("target_drift", closure, "x86_64-unknown-linux-gnu"),
    ):
        try:
            module.verify_composition_identity(
                str(fixture.source_root.resolve()),
                str(fixture.composition_manifest.resolve()),
                bad_closure,
                bad_target,
            )
        except module.ReceiptError:
            pass
        else:
            die("composition_contract_attack_accepted:" + label)
    original_manifest = fixture.composition_manifest.read_bytes()
    fixture.composition_manifest.write_bytes(
        original_manifest.replace(
            b"compiler_composition_aarch64_main.cheng",
            b"compiler_composition_kernel_main.cheng",
        )
    )
    try:
        module.verify_composition_identity(
            str(fixture.source_root.resolve()),
            str(fixture.composition_manifest.resolve()),
            closure,
            "arm64-apple-darwin",
        )
    except module.ReceiptError:
        pass
    else:
        die("composition_entry_unit_mismatch_accepted")
    fixture.composition_manifest.write_bytes(original_manifest)
    validator = run(
        [
            sys.executable,
            str(fixture.formal_validator),
            "--evidence-dir",
            str(fixture.evidence.resolve()),
            "--manifest",
            str(fixture.formal_manifest.resolve()),
            "--receipt",
            str(fixture.formal_receipt.resolve()),
        ],
        cwd=repo,
        expect_success=False,
        label="independent_validator_rejects_hard_red",
    )
    if validator.stdout != b"csg_core_exact_1g_receipt_validation=hard_red\n":
        die("hard_red_validator_result_invalid")
    expect_release_failure(
        fixture,
        fixture.args("create"),
        "hard_red_proof",
        b"formal_memory_proof_not_passed",
    )

    forged = json.loads(fixture.formal_receipt.read_text(encoding="utf-8"))
    forged["status"] = "passed"
    forged["hostSystem"] = "Linux"
    payload = dict(forged)
    payload.pop("receiptSha256", None)
    forged["receiptSha256"] = hashlib.sha256(canonical_json(payload)).hexdigest()
    forged_path = fixture.work / "forged-passed-receipt.json"
    write_bytes(forged_path, canonical_json(forged) + b"\n")
    expect_release_failure(
        fixture,
        fixture.args("create", forged_path),
        "forged_passed_proof",
    )

    malformed_path = fixture.work / "malformed-formal-receipt.json"
    write_bytes(malformed_path, fixture.formal_receipt.read_bytes() + b" \n")
    expect_release_failure(
        fixture,
        fixture.args("create", malformed_path),
        "malformed_formal_receipt",
        b"formal_memory_receipt_not_canonical",
    )
    for option, value in (
        ("--guard-report", str(fixture.formal_receipt)),
        ("--memory-limit-bytes", str(LIMIT_BYTES)),
        ("--memory-authority", "linux_cgroup_v2_memory.max"),
        ("--memory-validator", str(fixture.formal_validator)),
        ("--wall-ms", "12345"),
    ):
        expect_release_failure(
            fixture,
            fixture.args("create") + [option, value],
            "removed_option_" + option[2:].replace("-", "_"),
            b"unrecognized arguments:",
        )

    print("kernel_release_receipt_contract_test_status=pass")


def main() -> int:
    if len(sys.argv) == 1:
        repo = Path(__file__).resolve().parent.parent
        scratch_runner = repo / "tools" / "cheng_scratch_scope.sh"
        process = subprocess.run(
            [
                str(scratch_runner),
                "kernel-release-receipt-contract",
                sys.executable,
                str(Path(__file__).resolve()),
                "--inside",
            ],
            cwd=repo,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
            check=False,
        )
        return process.returncode
    if sys.argv != [sys.argv[0], "--inside"]:
        print("usage: kernel_release_receipt_contract_test.py", file=sys.stderr)
        return 2
    try:
        inner_main()
    except (OSError, RuntimeError) as error:
        print("kernel_release_receipt_contract_test_error=" + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
