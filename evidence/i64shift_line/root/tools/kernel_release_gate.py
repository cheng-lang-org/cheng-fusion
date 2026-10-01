#!/usr/bin/env python3
"""Single fail-closed release gate for the pure-Cheng kernel.

The gate has no skip or cache-on mode.  It always enters a task-owned scratch
scope, runs the static/adversarial contracts, runs the four user paths under
the process-tree guard, then creates and independently recomputes the canonical
``cheng.kernel.release.v1`` receipt.  The caller-visible receipt is published
only after every preceding check succeeds.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import os
import shutil
import stat
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType
from typing import Sequence


REPO = Path(__file__).resolve(strict=True).parents[1]
TOOLS = REPO / "tools"
SCRATCH_SCOPE = TOOLS / "cheng_scratch_scope.sh"
RECEIPT_TOOL = TOOLS / "kernel_release_receipt.py"
KERNEL_MANIFEST = REPO / "bootstrap" / "kernel_manifest.cheng"
USER_PATH_BASELINE = TOOLS / "testdata" / "user_path_gate" / "final.tsv"
SOURCE_SCOPES = ("bootstrap", "src", "tools")
RELEASE_TARGETS = frozenset(
    {
        "arm64-apple-darwin",
        "x86_64-unknown-linux-gnu",
        "riscv64-unknown-linux-gnu",
    }
)
KERNEL_COMPOSITION_ENTRY = (
    "src/core/tooling/compiler_composition_kernel_main.cheng"
)
PLUGIN_COMPOSITION_ENTRIES = {
    "arm64-apple-darwin": (
        "src/core/tooling/compiler_composition_aarch64_main.cheng"
    ),
    "x86_64-unknown-linux-gnu": (
        "src/core/tooling/compiler_composition_x86_64_main.cheng"
    ),
    "riscv64-unknown-linux-gnu": (
        "src/core/tooling/compiler_composition_riscv64_main.cheng"
    ),
}
USER_PATH_RSS_CAP_MIB = 200
GATE_TIMEOUT_SECONDS = 7_200
LOG_LIMIT_BYTES = 16_384


class GateError(RuntimeError):
    pass


@dataclass(frozen=True)
class ReleaseExecutionIdentity:
    source_closure_cid: str
    source_closure_manifest_sha256: str
    compiler_sha256: str
    compiler_identity: tuple[int, ...]
    interpreter_sha256: str
    interpreter_identity: tuple[int, ...]


def fail(message: str) -> None:
    raise GateError(message)


def task_scratch() -> Path:
    raw = os.environ.get("CHENG_TASK_TMPDIR", "")
    if not raw:
        fail("task_scratch_missing")
    path = Path(raw)
    if not path.is_absolute() or path.resolve(strict=True) != path:
        fail("task_scratch_not_canonical_absolute")
    metadata = path.stat()
    if (
        not stat.S_ISDIR(metadata.st_mode)
        or metadata.st_uid != os.getuid()
        or metadata.st_mode & 0o077
    ):
        fail("task_scratch_identity_invalid")
    return path


def enter_task_scratch(argv: Sequence[str]) -> None:
    if os.environ.get("CHENG_TASK_TMPDIR"):
        return
    if not SCRATCH_SCOPE.is_file() or not os.access(SCRATCH_SCOPE, os.X_OK):
        fail("scratch_scope_unavailable")
    script = Path(__file__).resolve(strict=True)
    os.execve(
        SCRATCH_SCOPE,
        (
            str(SCRATCH_SCOPE),
            "kernel-release-gate",
            sys.executable,
            str(script),
            *argv,
        ),
        {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
    )


def canonical_existing(raw: str, label: str, *, directory: bool = False) -> Path:
    path = Path(raw)
    if not path.is_absolute():
        fail(label + "_not_absolute")
    try:
        resolved = path.resolve(strict=True)
    except FileNotFoundError as error:
        raise GateError(label + "_missing") from error
    if resolved != path:
        fail(label + "_not_canonical")
    if directory:
        if not path.is_dir():
            fail(label + "_not_directory")
    elif not path.is_file():
        fail(label + "_not_file")
    return path


def canonical_output(raw: str) -> Path:
    path = Path(raw)
    if not path.is_absolute() or path.parent.resolve(strict=True) != path.parent:
        fail("receipt_output_parent_not_canonical_absolute")
    if path.name in ("", ".", ".."):
        fail("receipt_output_name_invalid")
    if path.exists() or path.is_symlink():
        fail("receipt_output_exists")
    return path


def stable_text_sha256(path: Path, label: str) -> tuple[str, str]:
    before = stable_identity(path)
    raw = path.read_bytes()
    after = stable_identity(path)
    if before != after:
        fail(label + "_changed_during_read")
    if not raw or not raw.endswith(b"\n") or b"\r" in raw or b"\0" in raw:
        fail(label + "_framing_invalid")
    try:
        text = raw.decode("utf-8", "strict")
    except UnicodeDecodeError as error:
        raise GateError(label + "_not_utf8") from error
    return text, hashlib.sha256(raw).hexdigest()


def validate_composition_manifest(path: Path, target: str) -> str:
    bootstrap = (REPO / "bootstrap").resolve(strict=True)
    if path.parent != bootstrap or path.suffix != ".cheng":
        fail("composition_manifest_location_invalid")
    text, digest = stable_text_sha256(path, "composition_manifest")
    values: dict[str, str] = {}
    sources: set[str] = set()
    source_count = 0
    for line_number, raw_line in enumerate(text.splitlines(), 1):
        line = raw_line.split("#", 1)[0].strip()
        if not line:
            continue
        if line.count("=") != 1:
            fail("composition_manifest_row_invalid:" + str(line_number))
        key, value = (part.strip() for part in line.split("=", 1))
        if (
            not key
            or not value
            or key in values
            or any(character not in "abcdefghijklmnopqrstuvwxyz0123456789_" for character in key)
        ):
            fail("composition_manifest_entry_invalid:" + str(line_number))
        if key.endswith("_source"):
            if (
                not value.startswith("src/core/")
                or not value.endswith(".cheng")
                or ".." in value.split("/")
            ):
                fail("composition_manifest_source_invalid:" + value)
            source = (REPO / value).resolve(strict=True)
            if source != REPO / value or not source.is_file():
                fail("composition_manifest_source_missing_or_escaped:" + value)
            if value in sources:
                fail("composition_manifest_duplicate_source:" + value)
            sources.add(value)
            source_count += 1
        elif key not in {
            "composition_schema",
            "composition_kind",
            "kernel_manifest",
            "plugin_canonical_triple",
        }:
            fail("composition_manifest_key_invalid:" + key)
        values[key] = value
    if values.get("composition_schema") != "cheng.composition.v1":
        fail("composition_manifest_schema_invalid")
    if source_count < 1 or "compiler_entry_source" not in values:
        fail("composition_manifest_source_set_empty")
    kind = values.get("composition_kind")
    if kind == "kernel-only":
        if (
            "kernel_manifest" in values
            or "plugin_canonical_triple" in values
            or values["compiler_entry_source"] != KERNEL_COMPOSITION_ENTRY
        ):
            fail("composition_manifest_kernel_contract_invalid")
    elif (
        kind != "plugin"
        or values.get("kernel_manifest") != "bootstrap/kernel_manifest.cheng"
        or values.get("plugin_canonical_triple") != target
        or values["compiler_entry_source"]
        != PLUGIN_COMPOSITION_ENTRIES.get(target)
    ):
        fail("composition_manifest_plugin_contract_invalid")
    return digest


def release_environment(work: Path) -> dict[str, str]:
    temporary = work / "tmp"
    cold_cache = work / "cold-object-cache"
    csg_cache = work / "csg-plugin-cache"
    for path in (temporary, cold_cache, csg_cache):
        path.mkdir(mode=0o700)
    environment = dict(os.environ)
    environment.update(
        {
            "BACKEND_BUILD_DRIVER_QUICK_SHARED_CACHE": "0",
            "BACKEND_BUILD_DRIVER_QUICK_STAMP_CACHE": "0",
            "BACKEND_INCREMENTAL": "0",
            "BACKEND_MULTI_MODULE_CACHE": "0",
            "CHENG_ENTRY_CACHE": "0",
            "CHENG_DISABLE_COLD_OBJECT_CACHE": "1",
            "CHENG_DISABLE_PRIMARY_OBJECT_CACHE": "1",
            "CHENG_DISABLE_PROVIDER_OBJECT_CACHE": "1",
            "CHENG_DISABLE_PURE_EXE_CACHE": "1",
            "CHENG_DISABLE_SYSTEM_LINK_EXEC_CACHE": "1",
            "CHENG_DISABLE_WINDOWS_PRIMARY_OBJECT_CACHE": "1",
            "CHENG_ENABLE_SYSTEM_LINK_EXEC_CACHE": "0",
            "CHENG_COLD_OBJECT_CACHE_ROOT": str(cold_cache),
            "CHENG_COMPILE_SKIP_CACHE_ROOT": "",
            "CHENG_CSGE_IR_CACHE_ROOT": "",
            "CHENG_CSG_PLUGIN_CACHE_ROOT": str(csg_cache),
            "CHENG_CSG_PLUGIN_ALLOW_NETWORK": "0",
            "CHENG_CSG_TOOL_CACHE": "",
            "CHENG_NO_CACHE": "1",
            "CHENG_STRICT_NO_CACHE": "1",
            "CHENG_SYSTEM_LINK_EXEC_NO_CACHE": "1",
            "PYTHONDONTWRITEBYTECODE": "1",
            "TMPDIR": str(temporary),
        }
    )
    return environment


def gate_commands(
    user_path_driver: Path,
) -> tuple[tuple[str, tuple[str, ...]], ...]:
    python = sys.executable
    return (
        (
            "export_duplicate",
            (python, str(TOOLS / "cheng_export_symbol_dup_gate.py")),
        ),
        (
            "closure_contract",
            (python, str(TOOLS / "kernel_plugin_closure_check_selftest.py")),
        ),
        (
            "kernel_closure",
            (
                python,
                str(TOOLS / "kernel_plugin_closure_check.py"),
                "--require-strict-closure",
                "--kernel-manifest",
                str(KERNEL_MANIFEST),
            ),
        ),
        (
            "cold_cache_contract",
            (
                str(TOOLS / "cold_object_cache_identity_static_gate.sh"),
                "--contract-test",
            ),
        ),
        (
            "system_link_cache_contract",
            (
                str(TOOLS / "system_link_cache_current_identity_static_gate.sh"),
                "--self-test",
            ),
        ),
        (
            "plugin_cid_contract",
            (str(TOOLS / "backend2_plugin_cid_gate.sh"), str(user_path_driver)),
        ),
        (
            "plugin_cache_contract",
            (str(TOOLS / "backend2_plugin_cache_gate.sh"), str(user_path_driver)),
        ),
        (
            "plugin_trade_contract",
            (str(TOOLS / "backend2_plugin_trade_gate.sh"), str(user_path_driver)),
        ),
        (
            "held_exec_contract",
            (python, str(TOOLS / "csg_core_held_exec_passcred_static_gate")),
        ),
        (
            "release_receipt_contract",
            (python, str(TOOLS / "kernel_release_receipt_contract_test.py")),
        ),
        (
            "user_path_guard_contract",
            (str(TOOLS / "user_path_gate_contract_test.bash"),),
        ),
        (
            "user_path_final",
            (
                str(TOOLS / "user_path_gate.sh"),
                "--driver",
                str(user_path_driver),
                "--baseline",
                str(USER_PATH_BASELINE),
                "--rss-cap-mib",
                str(USER_PATH_RSS_CAP_MIB),
                "--require-final-contract",
            ),
        ),
    )


def stable_identity(path: Path) -> tuple[int, ...]:
    value = path.stat()
    return (
        value.st_dev,
        value.st_ino,
        value.st_mode,
        value.st_nlink,
        value.st_uid,
        value.st_gid,
        value.st_size,
        value.st_mtime_ns,
        value.st_ctime_ns,
    )


def log_excerpt(path: Path) -> str:
    with path.open("rb") as stream:
        raw = stream.read(LOG_LIMIT_BYTES + 1)
    suffix = "\n[truncated]" if len(raw) > LOG_LIMIT_BYTES else ""
    return raw[:LOG_LIMIT_BYTES].decode("utf-8", "replace") + suffix


def run_gate(
    label: str,
    command: Sequence[str],
    environment: dict[str, str],
    work: Path,
) -> None:
    executable = Path(command[0]).resolve(strict=True)
    inputs: dict[Path, tuple[int, ...]] = {
        executable: stable_identity(executable)
    }
    for raw in command[1:]:
        candidate = Path(raw)
        if candidate.is_absolute() and candidate.is_file():
            canonical = candidate.resolve(strict=True)
            if canonical != candidate:
                fail("gate_input_not_canonical:" + label)
            inputs[canonical] = stable_identity(canonical)
    stdout_path = work / (label + ".stdout")
    stderr_path = work / (label + ".stderr")
    try:
        with stdout_path.open("xb") as stdout, stderr_path.open("xb") as stderr:
            process = subprocess.run(
                command,
                cwd=REPO,
                env=environment,
                stdin=subprocess.DEVNULL,
                stdout=stdout,
                stderr=stderr,
                check=False,
                timeout=GATE_TIMEOUT_SECONDS,
            )
    except subprocess.TimeoutExpired as error:
        raise GateError("gate_timeout:" + label) from error
    for path, identity in inputs.items():
        if stable_identity(path) != identity:
            fail("gate_input_changed:" + label + ":" + str(path))
    if process.returncode != 0:
        excerpt = log_excerpt(stderr_path)
        if not excerpt:
            excerpt = log_excerpt(stdout_path)
        fail(
            "gate_failed:"
            + label
            + ":rc="
            + str(process.returncode)
            + ":"
            + excerpt.replace("\r", " ").replace("\n", " | ")
        )


def load_receipt_tool() -> ModuleType:
    specification = importlib.util.spec_from_file_location(
        "cheng_kernel_release_receipt_gate_subject", RECEIPT_TOOL
    )
    if specification is None or specification.loader is None:
        fail("release_receipt_tool_unavailable")
    module = importlib.util.module_from_spec(specification)
    sys.modules[specification.name] = module
    specification.loader.exec_module(module)
    return module


def release_receipt_namespace(args: argparse.Namespace) -> argparse.Namespace:
    return argparse.Namespace(
        source_root=str(args.source_root),
        source_scope=list(SOURCE_SCOPES),
        composition_manifest=str(args.composition_manifest),
        composition_closure_manifest=str(args.composition_closure_manifest),
        compiler=str(args.compiler),
        compiler_composition_report=str(args.compiler_composition_report),
        toolchain_manifest=str(args.toolchain_manifest),
        memory_evidence_dir=str(args.memory_evidence_dir),
        memory_command_manifest=str(args.memory_command_manifest),
        memory_receipt=str(args.memory_receipt),
        artifact_manifest=str(args.artifact_manifest),
        target=args.target,
        jobs=args.jobs,
        cache_mode="off",
    )


def release_execution_identity(
    args: argparse.Namespace,
    receipt_module: ModuleType,
) -> ReleaseExecutionIdentity:
    source_cid, source_manifest_sha256 = receipt_module.source_closure_identity(
        str(args.source_root), SOURCE_SCOPES
    )
    compiler = receipt_module.stable_file(str(args.compiler), "release_compiler")
    interpreter_path = Path(sys.executable).resolve(strict=True)
    interpreter = receipt_module.stable_file(
        str(interpreter_path), "release_python_interpreter"
    )
    return ReleaseExecutionIdentity(
        source_closure_cid=source_cid,
        source_closure_manifest_sha256=source_manifest_sha256,
        compiler_sha256=compiler.sha256,
        compiler_identity=compiler.identity,
        interpreter_sha256=interpreter.sha256,
        interpreter_identity=interpreter.identity,
    )


def require_release_execution_identity(
    expected: ReleaseExecutionIdentity,
    args: argparse.Namespace,
    receipt_module: ModuleType,
    label: str,
) -> None:
    if release_execution_identity(args, receipt_module) != expected:
        fail("release_execution_identity_changed:" + label)


def remove_failed_publication(path: Path, identity: tuple[int, ...]) -> None:
    try:
        if stable_identity(path) != identity:
            fail("failed_publication_identity_changed")
    except FileNotFoundError:
        return
    directory = os.open(path.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.unlink(path)
        os.fsync(directory)
    finally:
        os.close(directory)


def receipt_arguments(args: argparse.Namespace) -> list[str]:
    output = [
        "--source-root",
        str(args.source_root),
    ]
    for scope in SOURCE_SCOPES:
        output.extend(("--source-scope", scope))
    output.extend(
        (
            "--composition-manifest",
            str(args.composition_manifest),
            "--composition-closure-manifest",
            str(args.composition_closure_manifest),
            "--compiler",
            str(args.compiler),
            "--compiler-composition-report",
            str(args.compiler_composition_report),
            "--toolchain-manifest",
            str(args.toolchain_manifest),
            "--memory-evidence-dir",
            str(args.memory_evidence_dir),
            "--memory-command-manifest",
            str(args.memory_command_manifest),
            "--memory-receipt",
            str(args.memory_receipt),
            "--artifact-manifest",
            str(args.artifact_manifest),
            "--target",
            args.target,
            "--jobs",
            args.jobs,
            "--cache-mode",
            "off",
        )
    )
    return output


def parse_arguments(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="kernel_release_gate.py")
    parser.add_argument("--source-root", required=True)
    parser.add_argument("--composition-manifest", required=True)
    parser.add_argument("--composition-closure-manifest", required=True)
    parser.add_argument("--compiler", required=True)
    parser.add_argument("--compiler-composition-report", required=True)
    parser.add_argument("--toolchain-manifest", required=True)
    parser.add_argument("--memory-evidence-dir", required=True)
    parser.add_argument("--memory-command-manifest", required=True)
    parser.add_argument("--memory-receipt", required=True)
    parser.add_argument("--artifact-manifest", required=True)
    parser.add_argument("--target", required=True)
    parser.add_argument("--jobs", required=True)
    parser.add_argument("--receipt-out", required=True)
    return parser.parse_args(argv)


def normalize_arguments(args: argparse.Namespace) -> argparse.Namespace:
    args.source_root = canonical_existing(
        args.source_root, "source_root", directory=True
    )
    if args.source_root != REPO:
        fail("source_root_must_match_gate_repository")
    args.composition_manifest = canonical_existing(
        args.composition_manifest, "composition_manifest"
    )
    args.composition_closure_manifest = canonical_existing(
        args.composition_closure_manifest, "composition_closure_manifest"
    )
    args.compiler = canonical_existing(args.compiler, "compiler")
    if not os.access(args.compiler, os.X_OK):
        fail("compiler_not_executable")
    args.compiler_composition_report = canonical_existing(
        args.compiler_composition_report, "compiler_composition_report"
    )
    args.toolchain_manifest = canonical_existing(
        args.toolchain_manifest, "toolchain_manifest"
    )
    args.memory_evidence_dir = canonical_existing(
        args.memory_evidence_dir, "memory_evidence_dir", directory=True
    )
    args.memory_command_manifest = canonical_existing(
        args.memory_command_manifest, "memory_command_manifest"
    )
    args.memory_receipt = canonical_existing(
        args.memory_receipt, "memory_receipt"
    )
    args.artifact_manifest = canonical_existing(
        args.artifact_manifest, "artifact_manifest"
    )
    canonical_existing(str(KERNEL_MANIFEST), "kernel_manifest")
    canonical_existing(str(USER_PATH_BASELINE), "user_path_baseline")
    if args.target not in RELEASE_TARGETS:
        fail("release_target_invalid")
    if (
        not args.jobs
        or not args.jobs.isascii()
        or not args.jobs.isdecimal()
        or (len(args.jobs) > 1 and args.jobs.startswith("0"))
        or int(args.jobs) < 1
        or int(args.jobs) > 65_536
    ):
        fail("release_jobs_invalid")
    validate_composition_manifest(args.composition_manifest, args.target)
    args.receipt_out = canonical_output(args.receipt_out)
    return args


def execute(args: argparse.Namespace) -> None:
    scratch = task_scratch()
    work = Path(tempfile.mkdtemp(prefix="release-gate.", dir=scratch))
    try:
        os.chmod(work, 0o700)
        environment = release_environment(work)
        receipt_module = load_receipt_tool()
        receipt_namespace = release_receipt_namespace(args)
        # Validate every caller-supplied proof before executing any release
        # workload.  The exact projected fields are frozen for the full run;
        # a later proof or artifact replacement cannot be paired with gates
        # that ran against an earlier state.
        initial_receipt_fields = receipt_module.common_fields(receipt_namespace)
        execution_identity = release_execution_identity(args, receipt_module)
        initial_receipt_values = dict(initial_receipt_fields)
        if (
            initial_receipt_values["source_closure_cid"]
            != execution_identity.source_closure_cid
            or initial_receipt_values["source_closure_manifest_sha256"]
            != execution_identity.source_closure_manifest_sha256
            or initial_receipt_values["compiler_sha256"]
            != execution_identity.compiler_sha256
        ):
            fail("release_execution_identity_changed_before_gates")
        for label, command in gate_commands(args.compiler):
            run_gate(label, command, environment, work)
            require_release_execution_identity(
                execution_identity, args, receipt_module, label
            )

        if receipt_module.common_fields(receipt_namespace) != initial_receipt_fields:
            fail("release_receipt_inputs_changed_during_gates")

        candidate = work / "release.receipt.kv"
        common = receipt_arguments(args)
        run_gate(
            "receipt_create",
            (sys.executable, str(RECEIPT_TOOL), "create", *common, "--out", str(candidate)),
            environment,
            work,
        )
        run_gate(
            "receipt_verify_candidate",
            (
                sys.executable,
                str(RECEIPT_TOOL),
                "verify",
                *common,
                "--receipt",
                str(candidate),
            ),
            environment,
            work,
        )
        require_release_execution_identity(
            execution_identity, args, receipt_module, "receipt_verify_candidate"
        )
        candidate_identity = receipt_module.stable_file(
            str(candidate), "release_candidate", collect=True
        )
        if candidate_identity.raw is None:
            fail("release_candidate_bytes_missing")
        candidate_rows = receipt_module.parse_receipt(candidate_identity.raw)
        candidate_values = dict(candidate_rows)
        manifest_sha256 = validate_composition_manifest(
            args.composition_manifest, args.target
        )
        if candidate_values["composition_manifest_sha256"] != manifest_sha256:
            fail("composition_manifest_changed_before_publication")
        receipt_module.write_atomic_exclusive(
            str(args.receipt_out), candidate_identity.raw
        )
        published_identity = stable_identity(args.receipt_out)
        try:
            run_gate(
                "receipt_verify_published",
                (
                    sys.executable,
                    str(RECEIPT_TOOL),
                    "verify",
                    *common,
                    "--receipt",
                    str(args.receipt_out),
                ),
                environment,
                work,
            )
            require_release_execution_identity(
                execution_identity,
                args,
                receipt_module,
                "receipt_verify_published",
            )
            if (
                receipt_module.common_fields(receipt_namespace)
                != initial_receipt_fields
            ):
                fail("release_receipt_inputs_changed_before_publication")
        except BaseException:
            remove_failed_publication(args.receipt_out, published_identity)
            raise
    finally:
        try:
            shutil.rmtree(work)
        except BaseException:
            if "published_identity" in locals():
                remove_failed_publication(args.receipt_out, published_identity)
            raise
    print("kernel_release_gate_status=green")
    print("kernel_release_cache_mode=off")
    print("kernel_release_user_path_rss_cap_mib=200")


def main() -> int:
    try:
        enter_task_scratch(sys.argv[1:])
        execute(normalize_arguments(parse_arguments(sys.argv[1:])))
    except (GateError, OSError) as error:
        print("kernel_release_gate_error=" + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
