#!/usr/bin/env python3
"""Create or verify the canonical pure-Cheng kernel release receipt.

Every identity in the receipt is derived from bytes read from a stable regular
file.  Caller supplied digests are only accepted after the referenced file has
been read again and matched.  The receipt itself is an ordered LF-only KV
record; its final field seals every preceding byte.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import platform
import re
import secrets
import stat
import subprocess
import sys
from dataclasses import dataclass
from types import ModuleType
from typing import Any, Iterable, Sequence


RECEIPT_SCHEMA = "cheng.kernel.release.v1"
COMPOSITION_CLOSURE_SCHEMA = "cheng.kernel.composition_closure.v1"
TOOLCHAIN_MANIFEST_SCHEMA = "cheng.kernel.toolchain_manifest.v1"
ARTIFACT_MANIFEST_SCHEMA = "cheng.kernel.artifact_manifest.v1"
FORMAL_MEMORY_RECEIPT_SCHEMA = "csg_core.exact_1g_process_tree.receipt"
FORMAL_MEMORY_PROOF_STATUS = "proved_linux_kernel_cgroup_v2_aggregate"
MEMORY_AUTHORITY = "linux_cgroup_v2_memory.max"
MEMORY_SCOPE = "cgroup_and_all_descendants"
PROCESS_TREE_PLACEMENT = "attach_before_exec_kernel_inherited"
PROCESS_TREE_COMPLETION = "subreaper_waits_all_descendants"
RELEASE_TARGETS = frozenset(
    {
        "arm64-apple-darwin",
        "x86_64-unknown-linux-gnu",
        "riscv64-unknown-linux-gnu",
    }
)
KERNEL_COMPOSITION_ENTRY = (
    b"src/core/tooling/compiler_composition_kernel_main.cheng"
)
PLUGIN_COMPOSITION_ENTRIES = {
    "arm64-apple-darwin": (
        b"src/core/tooling/compiler_composition_aarch64_main.cheng"
    ),
    "x86_64-unknown-linux-gnu": (
        b"src/core/tooling/compiler_composition_x86_64_main.cheng"
    ),
    "riscv64-unknown-linux-gnu": (
        b"src/core/tooling/compiler_composition_riscv64_main.cheng"
    ),
}
COMPILER_COMPOSITION_UNIT_IDS = {
    "arm64-apple-darwin": 1,
    "x86_64-unknown-linux-gnu": 2,
    "riscv64-unknown-linux-gnu": 3,
}
FORMAL_MEMORY_LIMIT_BYTES = 1_073_741_824
FORMAL_MEMORY_SWAP_BYTES = 0
FORMAL_VALIDATOR_TIMEOUT_SECONDS = 600
SELF_HASH_DOMAIN = b"cheng.kernel.release.v1.self\0"
MAX_TEXT_BYTES = 16 * 1024 * 1024
MAX_FILE_BYTES = 64 * 1024 * 1024 * 1024
MAX_ENTRY_COUNT = 1_000_000
READ_CHUNK_BYTES = 1024 * 1024
TOKEN_RE = re.compile(r"[A-Za-z0-9_.+:-]{1,256}\Z")
HASH_RE = re.compile(r"[0-9a-f]{64}\Z")


RECEIPT_KEYS = (
    "schema",
    "source_closure_cid",
    "source_closure_manifest_sha256",
    "composition_manifest_sha256",
    "composition_manifest_size_bytes",
    "composition_kind",
    "composition_entry_source_fshex",
    "composition_plugin_canonical_triple",
    "composition_kernel_contract_sha256",
    "composition_declared_sources_sha256",
    "composition_declared_source_count",
    "composition_closure_manifest_sha256",
    "composition_closure_cid",
    "composition_closure_count",
    "compiler_composition_report_sha256",
    "compiler_composition_report_size_bytes",
    "compiler_report_source_bundle_cid",
    "compiler_report_source_identity_receipt_cid",
    "compiler_report_compile_receipt_cid",
    "compiler_report_output_receipt_cid",
    "compiler_report_output_sha256",
    "compiler_sha256",
    "compiler_size_bytes",
    "compiler_mode_decimal",
    "toolchain_manifest_sha256",
    "toolchain_identity_cid",
    "toolchain_count",
    "target",
    "jobs",
    "cache_mode",
    "wall_ms",
    "memory_evidence_directory_fshex",
    "memory_command_manifest_sha256",
    "memory_formal_receipt_sha256",
    "memory_formal_receipt_self_sha256",
    "memory_validator_sha256",
    "memory_gate_sha256",
    "memory_kernel_runner_sha256",
    "memory_proof_schema",
    "memory_proof_status",
    "memory_command_count",
    "memory_release_command_id",
    "memory_release_command_argv_sha256",
    "memory_exit_code",
    "memory_authority",
    "memory_limit_bytes",
    "memory_swap_limit_bytes",
    "memory_peak_bytes",
    "memory_oom_kill_count",
    "memory_scope",
    "process_tree_placement",
    "process_tree_completion",
    "artifact_manifest_sha256",
    "artifact_identity_cid",
    "artifact_count",
    "receipt_sha256",
)


class ReceiptError(RuntimeError):
    pass


def fail(message: str) -> None:
    raise ReceiptError(message)


def sha256_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def canonical_json(value: Any) -> bytes:
    return json.dumps(
        value,
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def strict_json_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            fail("formal_memory_receipt_duplicate_json_key:" + key)
        result[key] = value
    return result


def frame(raw: bytes) -> bytes:
    return len(raw).to_bytes(8, "big") + raw


def canonical_uint(raw: str, label: str, *, positive: bool = False) -> int:
    if (
        not raw
        or any(character not in "0123456789" for character in raw)
        or (len(raw) > 1 and raw.startswith("0"))
    ):
        fail(label + "_not_canonical_uint")
    value = int(raw)
    if value > (1 << 63) - 1 or (positive and value == 0):
        fail(label + "_out_of_range")
    return value


def require_hash(raw: str, label: str) -> str:
    if not isinstance(raw, str) or HASH_RE.fullmatch(raw) is None or raw == "0" * 64:
        fail(label + "_invalid")
    return raw


def require_token(raw: str, label: str) -> str:
    if not isinstance(raw, str) or TOKEN_RE.fullmatch(raw) is None:
        fail(label + "_invalid")
    return raw


def require_canonical_absolute(path: str | bytes, label: str) -> bytes:
    raw = os.fsencode(path)
    if (
        not raw
        or b"\0" in raw
        or not os.path.isabs(raw)
        or os.path.normpath(raw) != raw
        or os.path.realpath(raw) != raw
    ):
        fail(label + "_path_not_canonical_absolute")
    return raw


def required_task_tmpdir() -> str:
    task_root_raw = require_canonical_absolute(
        os.environ.get("CHENG_TASK_TMPDIR", ""), "task_scratch"
    )
    temporary_raw = require_canonical_absolute(
        os.environ.get("TMPDIR", ""), "task_tmpdir"
    )
    task_root = os.fsdecode(task_root_raw)
    temporary = os.fsdecode(temporary_raw)
    if (
        not os.path.isdir(task_root_raw)
        or not os.path.isdir(temporary_raw)
        or os.path.commonpath((task_root, temporary)) != task_root
    ):
        fail("task_tmpdir_outside_scratch")
    return temporary


def require_canonical_relative(raw: bytes, label: str) -> None:
    if not raw or raw.startswith(b"/") or b"\0" in raw:
        fail(label + "_path_not_canonical_relative")
    if any(part in (b"", b".", b"..") for part in raw.split(b"/")):
        fail(label + "_path_not_canonical_relative")
    if os.path.normpath(raw) != raw:
        fail(label + "_path_not_canonical_relative")


def decode_canonical_hex(raw: str, label: str) -> bytes:
    if len(raw) % 2 or any(character not in "0123456789abcdef" for character in raw):
        fail(label + "_hex_invalid")
    try:
        decoded = bytes.fromhex(raw)
    except ValueError as error:
        raise ReceiptError(label + "_hex_invalid") from error
    if decoded.hex() != raw:
        fail(label + "_hex_not_canonical")
    return decoded


def stat_identity(value: os.stat_result) -> tuple[int, ...]:
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


@dataclass(frozen=True)
class StableFile:
    sha256: str
    size: int
    mode: int
    identity: tuple[int, ...]
    raw: bytes | None


def stable_file(
    path: str | bytes,
    label: str,
    *,
    collect: bool = False,
    maximum_bytes: int = MAX_FILE_BYTES,
) -> StableFile:
    raw_path = require_canonical_absolute(path, label)
    try:
        before_path = os.lstat(raw_path)
    except FileNotFoundError as error:
        raise ReceiptError(label + "_missing") from error
    if not stat.S_ISREG(before_path.st_mode):
        fail(label + "_not_regular")
    if before_path.st_size < 0 or before_path.st_size > maximum_bytes:
        fail(label + "_size_out_of_range")
    flags = os.O_RDONLY
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(raw_path, flags)
    chunks: list[bytes] = []
    digest = hashlib.sha256()
    observed = 0
    try:
        before_fd = os.fstat(descriptor)
        if stat_identity(before_fd) != stat_identity(before_path):
            fail(label + "_changed_before_read")
        while True:
            chunk = os.read(descriptor, READ_CHUNK_BYTES)
            if not chunk:
                break
            observed += len(chunk)
            if observed > maximum_bytes:
                fail(label + "_read_limit_exceeded")
            digest.update(chunk)
            if collect:
                chunks.append(chunk)
        after_fd = os.fstat(descriptor)
    finally:
        os.close(descriptor)
    after_path = os.lstat(raw_path)
    if (
        stat_identity(before_path) != stat_identity(after_fd)
        or stat_identity(before_path) != stat_identity(after_path)
        or observed != before_path.st_size
    ):
        fail(label + "_changed_during_read")
    return StableFile(
        sha256=digest.hexdigest(),
        size=observed,
        mode=before_path.st_mode,
        identity=stat_identity(before_path),
        raw=b"".join(chunks) if collect else None,
    )


def require_lf_text(raw: bytes, label: str) -> None:
    if not raw or not raw.endswith(b"\n") or b"\r" in raw or b"\0" in raw:
        fail(label + "_not_lf_text")
    try:
        raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ReceiptError(label + "_not_utf8") from error


def ordered_kv(
    raw: bytes,
    label: str,
    expected_keys: Sequence[str],
) -> list[tuple[str, str]]:
    require_lf_text(raw, label)
    rows: list[tuple[str, str]] = []
    seen: set[str] = set()
    for line in raw[:-1].decode("utf-8").split("\n"):
        if line.count("=") != 1:
            fail(label + "_row_invalid")
        key, value = line.split("=", 1)
        if not key or not value:
            fail(label + "_row_invalid")
        if key in seen:
            fail(label + "_duplicate_key:" + key)
        seen.add(key)
        rows.append((key, value))
    actual_keys = tuple(key for key, _ in rows)
    unknown = sorted(set(actual_keys) - set(expected_keys))
    missing = sorted(set(expected_keys) - set(actual_keys))
    if unknown:
        fail(label + "_unknown_key:" + unknown[0])
    if missing:
        fail(label + "_missing_key:" + missing[0])
    if actual_keys != tuple(expected_keys):
        fail(label + "_key_order_invalid")
    return rows


def encode_rows(rows: Iterable[tuple[str, str]]) -> bytes:
    output = bytearray()
    for key, value in rows:
        if (
            not key
            or not value
            or "=" in key
            or any(character in key + value for character in "\r\n\0")
        ):
            fail("output_row_invalid")
        output.extend(key.encode("utf-8"))
        output.extend(b"=")
        output.extend(value.encode("utf-8"))
        output.extend(b"\n")
    return bytes(output)


def load_source_manifest_module() -> ModuleType:
    sys.dont_write_bytecode = True
    module_path = os.path.realpath(
        os.path.join(os.path.dirname(__file__), "current_source_closure_manifest.py")
    )
    specification = importlib.util.spec_from_file_location(
        "cheng_current_source_closure_manifest", module_path
    )
    if specification is None or specification.loader is None:
        fail("source_closure_module_unavailable")
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    return module


def source_closure_identity(root: str, scopes: Sequence[str]) -> tuple[str, str]:
    require_canonical_absolute(root, "source_root")
    if not scopes or len(scopes) != len(set(scopes)):
        fail("source_scope_empty_or_duplicate")
    for scope in scopes:
        require_canonical_relative(os.fsencode(scope), "source_scope")
    module = load_source_manifest_module()
    try:
        manifest = module.build_manifest(root, list(scopes))
        cid = module.content_cid_from_manifest(manifest)
    except (OSError, RuntimeError) as error:
        raise ReceiptError("source_closure_invalid:" + str(error)) from error
    require_hash(cid, "source_closure_cid")
    return cid, sha256_bytes(manifest)


def file_manifest_expected_keys(count: int) -> tuple[str, ...]:
    keys = ["schema", "root_fshex", "entry_count"]
    for index in range(count):
        prefix = f"entry.{index}."
        keys.extend(
            (
                prefix + "path_fshex",
                prefix + "sha256",
                prefix + "size_bytes",
                prefix + "mode_decimal",
            )
        )
    return tuple(keys)


@dataclass(frozen=True)
class FileManifestEntry:
    relative_path: bytes
    sha256: str
    size: int
    mode: int


@dataclass(frozen=True)
class FileManifestIdentity:
    raw_sha256: str
    identity_cid: str
    count: int
    root: bytes
    entries: tuple[FileManifestEntry, ...]


def verify_file_manifest(
    path: str,
    label: str,
    expected_schema: str,
    cid_domain: bytes,
    *,
    require_nonempty_files: bool,
) -> FileManifestIdentity:
    manifest = stable_file(
        path, label, collect=True, maximum_bytes=MAX_TEXT_BYTES
    )
    assert manifest.raw is not None
    require_lf_text(manifest.raw, label)
    preliminary = manifest.raw[:-1].decode("utf-8").split("\n")
    if len(preliminary) < 3:
        fail(label + "_header_truncated")
    if not preliminary[2].startswith("entry_count="):
        fail(label + "_key_order_invalid")
    count = canonical_uint(
        preliminary[2][len("entry_count="):], label + "_entry_count", positive=True
    )
    if count > MAX_ENTRY_COUNT:
        fail(label + "_entry_count_out_of_range")
    if len(preliminary) != 3 + count * 4:
        fail(label + "_entry_count_mismatch")
    rows = ordered_kv(
        manifest.raw, label, file_manifest_expected_keys(count)
    )
    values = dict(rows)
    if values["schema"] != expected_schema:
        fail(label + "_schema_invalid")
    root_raw = decode_canonical_hex(values["root_fshex"], label + "_root")
    require_canonical_absolute(root_raw, label + "_root")
    try:
        root_stat = os.lstat(root_raw)
    except FileNotFoundError as error:
        raise ReceiptError(label + "_root_missing") from error
    if not stat.S_ISDIR(root_stat.st_mode):
        fail(label + "_root_not_directory")
    digest = hashlib.sha256()
    digest.update(frame(cid_domain))
    digest.update(count.to_bytes(8, "big"))
    prior = b""
    entries: list[FileManifestEntry] = []
    for index in range(count):
        prefix = f"entry.{index}."
        relative = decode_canonical_hex(
            values[prefix + "path_fshex"], label + f"_entry_{index}_path"
        )
        require_canonical_relative(relative, label + f"_entry_{index}")
        if relative <= prior:
            fail(label + "_entry_order_invalid")
        prior = relative
        claimed_hash = require_hash(
            values[prefix + "sha256"], label + f"_entry_{index}_sha256"
        )
        claimed_size = canonical_uint(
            values[prefix + "size_bytes"], label + f"_entry_{index}_size"
        )
        claimed_mode = canonical_uint(
            values[prefix + "mode_decimal"], label + f"_entry_{index}_mode"
        )
        absolute = os.path.join(root_raw, relative)
        if os.path.realpath(absolute) != absolute:
            fail(label + f"_entry_{index}_path_escape_or_symlink")
        actual = stable_file(absolute, label + f"_entry_{index}")
        if require_nonempty_files and actual.size == 0:
            fail(label + f"_entry_{index}_empty")
        if (
            actual.sha256 != claimed_hash
            or actual.size != claimed_size
            or actual.mode != claimed_mode
        ):
            fail(label + f"_entry_{index}_identity_mismatch")
        digest.update(frame(relative))
        digest.update(bytes.fromhex(actual.sha256))
        digest.update(actual.size.to_bytes(8, "big"))
        digest.update(actual.mode.to_bytes(8, "big"))
        entries.append(
            FileManifestEntry(
                relative_path=relative,
                sha256=actual.sha256,
                size=actual.size,
                mode=actual.mode,
            )
        )
    root_after = os.lstat(root_raw)
    if stat_identity(root_after) != stat_identity(root_stat):
        fail(label + "_root_changed_during_read")
    identity_cid = digest.hexdigest()
    require_hash(identity_cid, label + "_identity_cid")
    return FileManifestIdentity(
        raw_sha256=manifest.sha256,
        identity_cid=identity_cid,
        count=count,
        root=root_raw,
        entries=tuple(entries),
    )


@dataclass(frozen=True)
class FormalMemoryIdentity:
    evidence_directory_fshex: str
    command_manifest_sha256: str
    receipt_sha256: str
    receipt_self_sha256: str
    validator_sha256: str
    gate_sha256: str
    kernel_runner_sha256: str
    schema: str
    proof_status: str
    command_count: int
    release_command_id: str
    release_command_argv_sha256: str
    peak_bytes: int
    wall_ms: int


def parse_canonical_json(raw: bytes, label: str) -> dict[str, Any]:
    if not raw.endswith(b"\n") or b"\r" in raw or b"\0" in raw:
        fail(label + "_framing_invalid")
    try:
        value = json.loads(
            raw.decode("utf-8", "strict"),
            object_pairs_hook=strict_json_object,
            parse_constant=lambda item: (_ for _ in ()).throw(
                ReceiptError(label + "_non_finite_number:" + item)
            ),
        )
    except (json.JSONDecodeError, UnicodeError) as error:
        raise ReceiptError(label + "_json_invalid") from error
    if not isinstance(value, dict) or canonical_json(value) + b"\n" != raw:
        fail(label + "_not_canonical")
    return value


def require_exact_int(value: Any, expected: int, label: str) -> None:
    if type(value) is not int or value != expected:
        fail(label + "_invalid")


def require_bounded_int(
    value: Any,
    label: str,
    *,
    minimum: int,
    maximum: int,
) -> int:
    if type(value) is not int or value < minimum or value > maximum:
        fail(label + "_invalid")
    return value


def fixed_formal_tool_path(name: str, label: str) -> str:
    path = os.path.realpath(os.path.join(os.path.dirname(__file__), name))
    require_canonical_absolute(path, label)
    return path


def open_stable_held_source(
    path: str,
    expected: StableFile,
    label: str,
) -> int:
    raw_path = require_canonical_absolute(path, label)
    before = os.lstat(raw_path)
    flags = os.O_RDONLY
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(raw_path, flags)
    try:
        held = os.fstat(descriptor)
        if (
            stat_identity(held) != stat_identity(before)
            or stat_identity(held) != expected.identity
        ):
            fail(label + "_changed_before_hold")
        digest = hashlib.sha256()
        observed = 0
        while True:
            chunk = os.pread(descriptor, READ_CHUNK_BYTES, observed)
            if not chunk:
                break
            observed += len(chunk)
            if observed > MAX_TEXT_BYTES:
                fail(label + "_held_read_limit_exceeded")
            digest.update(chunk)
        if (
            observed != expected.size
            or digest.hexdigest() != expected.sha256
            or held.st_mode != expected.mode
        ):
            fail(label + "_held_identity_mismatch")
        os.set_inheritable(descriptor, True)
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def run_formal_validator(
    evidence_directory: str,
    command_manifest: str,
    formal_receipt: str,
    validator_path: str,
    validator: StableFile,
) -> None:
    task_tmpdir = required_task_tmpdir()
    descriptor = open_stable_held_source(
        validator_path,
        validator,
        "formal_memory_validator",
    )
    interpreter = os.path.realpath(sys.executable)
    require_canonical_absolute(interpreter, "python_interpreter")
    try:
        process = subprocess.run(
            [
                interpreter,
                "-I",
                "-S",
                "-B",
                f"/proc/self/fd/{descriptor}",
                "--evidence-dir",
                evidence_directory,
                "--manifest",
                command_manifest,
                "--receipt",
                formal_receipt,
            ],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=FORMAL_VALIDATOR_TIMEOUT_SECONDS,
            pass_fds=(descriptor,),
            env={
                "HOME": "/nonexistent",
                "LANG": "C",
                "LC_ALL": "C",
                "PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
                "TMPDIR": task_tmpdir,
                "TZ": "UTC",
                "PYTHONDONTWRITEBYTECODE": "1",
                "CHENG_EXACT_VALIDATOR_SOURCE": validator_path,
                "CHENG_EXACT_VALIDATOR_SOURCE_FD": str(descriptor),
                "CHENG_EXACT_VALIDATOR_SOURCE_SHA256": validator.sha256,
            },
        )
    except subprocess.TimeoutExpired as error:
        raise ReceiptError("formal_memory_validator_timeout") from error
    finally:
        os.close(descriptor)
    if (
        process.returncode != 0
        or process.stdout != b"csg_core_exact_1g_receipt_validation=passed\n"
        or process.stderr
    ):
        fail("formal_memory_independent_validation_failed")


def framed_text_sequence_sha256(values: Sequence[str]) -> str:
    digest = hashlib.sha256()
    digest.update(len(values).to_bytes(8, "big"))
    for value in values:
        raw = value.encode("utf-8")
        digest.update(len(raw).to_bytes(8, "big"))
        digest.update(raw)
    return digest.hexdigest()


def formal_release_command_projection(
    raw_manifest: bytes,
    *,
    source_root: str,
    composition_manifest: str,
    compiler_path: str,
    compiler: StableFile,
    compiler_report_path: str,
    composition: CompositionIdentity,
    compiler_report: CompilerCompositionReportIdentity,
    target: str,
    jobs: int,
) -> tuple[int, str, str]:
    manifest = parse_canonical_json(raw_manifest, "formal_memory_command_manifest")
    if (
        set(manifest)
        != {"schema", "limitBytes", "runUid", "runGid", "commands"}
        or manifest.get("schema") != "csg_core.exact_1g_process_tree.command_list"
    ):
        fail("formal_memory_command_manifest_shape_invalid")
    require_exact_int(
        manifest.get("limitBytes"),
        FORMAL_MEMORY_LIMIT_BYTES,
        "formal_memory_command_manifest_limit",
    )
    source_root_raw = require_canonical_absolute(source_root, "source_root")
    composition_manifest_raw = require_canonical_absolute(
        composition_manifest, "composition_manifest"
    )
    compiler_raw = require_canonical_absolute(compiler_path, "compiler")
    compiler_report_raw = require_canonical_absolute(
        compiler_report_path, "compiler_composition_report"
    )
    input_raw = os.path.join(source_root_raw, composition.entry_source)
    if os.path.realpath(input_raw) != input_raw:
        fail("formal_memory_release_input_path_invalid")
    expected_argv = [
        os.fsdecode(compiler_raw),
        "system-link-exec",
        "--root:" + os.fsdecode(source_root_raw),
        "--in:" + os.fsdecode(input_raw),
        "--composition-manifest:" + os.fsdecode(composition_manifest_raw),
        "--emit:exe",
        "--target:" + target,
        "--backend-jobs:" + str(jobs),
        "--cache-disabled:1",
        "--require-pure-system-link-exec",
        "--out:" + os.fsdecode(compiler_report.output_path),
        "--report-out:" + os.fsdecode(compiler_report_raw),
    ]
    required_env = {
        "BACKEND_JOBS": str(jobs),
        "CHENG_DISABLE_COLD_OBJECT_CACHE": "1",
        "CHENG_DISABLE_PRIMARY_OBJECT_CACHE": "1",
        "CHENG_DISABLE_PROVIDER_OBJECT_CACHE": "1",
        "CHENG_DISABLE_PURE_EXE_CACHE": "1",
        "CHENG_DISABLE_SYSTEM_LINK_EXEC_CACHE": "1",
        "CHENG_ENTRY_CACHE": "0",
        "CHENG_NO_CACHE": "1",
        "CHENG_STRICT_NO_CACHE": "1",
        "CHENG_SYSTEM_LINK_EXEC_NO_CACHE": "1",
    }
    commands = manifest.get("commands")
    if not isinstance(commands, list) or not commands:
        fail("formal_memory_command_manifest_commands_invalid")
    matches: list[tuple[int, str]] = []
    for index, command in enumerate(commands):
        if not isinstance(command, dict):
            fail(f"formal_memory_command_manifest_command_{index}_invalid")
        if command.get("argv") != expected_argv:
            continue
        command_id = require_token(
            command.get("id", ""),
            f"formal_memory_release_command_{index}_id",
        )
        if command.get("cwd") != os.fsdecode(source_root_raw):
            fail("formal_memory_release_command_cwd_mismatch")
        environment = command.get("env")
        if not isinstance(environment, dict) or environment != required_env:
            fail("formal_memory_release_command_cache_mode_mismatch")
        matches.append((index, command_id))
    if len(matches) != 1:
        fail("formal_memory_release_command_cardinality_invalid")
    index, command_id = matches[0]
    compiler_now = stable_file(compiler_raw, "formal_memory_release_compiler")
    if compiler_now != compiler:
        fail("formal_memory_release_compiler_identity_changed")
    argv_sha256 = framed_text_sequence_sha256(expected_argv)
    require_hash(argv_sha256, "formal_memory_release_command_argv_sha256")
    return index, command_id, argv_sha256


def formal_evidence_member(
    evidence_root: bytes,
    relative_value: Any,
    label: str,
) -> StableFile:
    if not isinstance(relative_value, str):
        fail(label + "_path_invalid")
    relative = os.fsencode(relative_value)
    require_canonical_relative(relative, label)
    absolute = os.path.join(evidence_root, relative)
    if os.path.realpath(absolute) != absolute:
        fail(label + "_path_escape_or_symlink")
    return stable_file(
        absolute,
        label,
        collect=True,
        maximum_bytes=MAX_TEXT_BYTES,
    )


def verify_release_command_artifact_attestation(
    evidence_root: bytes,
    command: dict[str, Any],
    compiler_report: CompilerCompositionReportIdentity,
) -> None:
    stdout = formal_evidence_member(
        evidence_root,
        command.get("stdoutRelativePath"),
        "formal_memory_release_stdout",
    )
    stderr = formal_evidence_member(
        evidence_root,
        command.get("stderrRelativePath"),
        "formal_memory_release_stderr",
    )
    claimed_stdout_sha256 = require_hash(
        command.get("stdoutSha256", ""),
        "formal_memory_release_stdout_sha256",
    )
    claimed_stderr_sha256 = require_hash(
        command.get("stderrSha256", ""),
        "formal_memory_release_stderr_sha256",
    )
    claimed_stdout_bytes = require_bounded_int(
        command.get("stdoutBytes"),
        "formal_memory_release_stdout_bytes",
        minimum=1,
        maximum=MAX_TEXT_BYTES,
    )
    require_exact_int(
        command.get("stderrBytes"),
        0,
        "formal_memory_release_stderr_bytes",
    )
    expected_stdout = encode_rows(
        (
            (
                "composition_execution_output_sha256",
                compiler_report.output_sha256,
            ),
            (
                "composition_execution_report_sha256",
                compiler_report.sha256,
            ),
        )
    )
    if (
        stdout.raw != expected_stdout
        or stdout.sha256 != claimed_stdout_sha256
        or stdout.size != claimed_stdout_bytes
        or stderr.raw != b""
        or stderr.sha256 != claimed_stderr_sha256
        or stderr.size != 0
    ):
        fail("formal_memory_release_artifact_attestation_mismatch")


def verify_formal_memory_proof(
    evidence_path: str,
    manifest_path: str,
    receipt_path: str,
    *,
    source_root: str,
    composition_manifest: str,
    compiler_path: str,
    compiler: StableFile,
    compiler_report_path: str,
    composition: CompositionIdentity,
    compiler_report: CompilerCompositionReportIdentity,
    target: str,
    jobs: int,
) -> FormalMemoryIdentity:
    evidence_raw = require_canonical_absolute(
        evidence_path,
        "formal_memory_evidence_directory",
    )
    command_manifest_raw = require_canonical_absolute(
        manifest_path,
        "formal_memory_command_manifest",
    )
    formal_receipt_raw = require_canonical_absolute(
        receipt_path,
        "formal_memory_receipt",
    )
    evidence_directory = os.fsdecode(evidence_raw)
    command_manifest_path = os.fsdecode(command_manifest_raw)
    formal_receipt_path = os.fsdecode(formal_receipt_raw)
    evidence_before = os.lstat(evidence_raw)
    if not stat.S_ISDIR(evidence_before.st_mode):
        fail("formal_memory_evidence_not_directory")
    command_manifest = stable_file(
        command_manifest_raw,
        "formal_memory_command_manifest",
        collect=True,
        maximum_bytes=MAX_TEXT_BYTES,
    )
    formal_receipt = stable_file(
        formal_receipt_raw,
        "formal_memory_receipt",
        collect=True,
        maximum_bytes=MAX_TEXT_BYTES,
    )
    assert command_manifest.raw is not None
    assert formal_receipt.raw is not None
    (
        release_command_index,
        release_command_id,
        release_command_argv_sha256,
    ) = formal_release_command_projection(
        command_manifest.raw,
        source_root=source_root,
        composition_manifest=composition_manifest,
        compiler_path=compiler_path,
        compiler=compiler,
        compiler_report_path=compiler_report_path,
        composition=composition,
        compiler_report=compiler_report,
        target=target,
        jobs=jobs,
    )
    value = parse_canonical_json(formal_receipt.raw, "formal_memory_receipt")
    if value.get("schema") != FORMAL_MEMORY_RECEIPT_SCHEMA:
        fail("formal_memory_receipt_schema_invalid")
    if value.get("status") != "passed":
        fail("formal_memory_proof_not_passed")
    if value.get("hostSystem") != "Linux" or platform.system() != "Linux":
        fail("formal_memory_proof_requires_linux_validation_host")

    validator_path = fixed_formal_tool_path(
        "csg_core_exact_1g_process_tree_receipt_validator",
        "formal_memory_validator",
    )
    gate_path = fixed_formal_tool_path(
        "csg_core_exact_1g_process_tree_gate",
        "formal_memory_gate",
    )
    runner_path = fixed_formal_tool_path(
        "beat_c_linux_cgroup_v2_native_hard_memory_gate.sh",
        "formal_memory_kernel_runner",
    )
    validator = stable_file(
        validator_path,
        "formal_memory_validator",
        maximum_bytes=MAX_TEXT_BYTES,
    )
    gate = stable_file(
        gate_path,
        "formal_memory_gate",
        maximum_bytes=MAX_TEXT_BYTES,
    )
    runner = stable_file(
        runner_path,
        "formal_memory_kernel_runner",
        maximum_bytes=MAX_TEXT_BYTES,
    )
    run_formal_validator(
        evidence_directory,
        command_manifest_path,
        formal_receipt_path,
        validator_path,
        validator,
    )

    exact = {
        "proofStatus": FORMAL_MEMORY_PROOF_STATUS,
        "limitBytes": FORMAL_MEMORY_LIMIT_BYTES,
        "swapBytes": FORMAL_MEMORY_SWAP_BYTES,
        "memoryScope": MEMORY_SCOPE,
        "kernelAuthority": MEMORY_AUTHORITY,
        "processTreePlacement": PROCESS_TREE_PLACEMENT,
        "processTreeCompletion": PROCESS_TREE_COMPLETION,
        "userSpacePollingAuthority": 0,
        "manifestSha256": command_manifest.sha256,
        "validatorSha256": validator.sha256,
        "gateSha256": gate.sha256,
        "kernelRunnerSha256": runner.sha256,
    }
    if any(value.get(key) != expected for key, expected in exact.items()):
        fail("formal_memory_proof_projection_mismatch")
    try:
        receipt_evidence = decode_canonical_hex(
            value["evidenceDirectoryFshex"],
            "formal_memory_receipt_evidence_directory",
        )
        receipt_manifest = decode_canonical_hex(
            value["manifestPathFshex"],
            "formal_memory_receipt_manifest_path",
        )
    except (KeyError, TypeError) as error:
        raise ReceiptError("formal_memory_proof_path_binding_invalid") from error
    if receipt_evidence != evidence_raw or receipt_manifest != command_manifest_raw:
        fail("formal_memory_proof_path_binding_mismatch")
    self_hash = require_hash(
        value.get("receiptSha256", ""),
        "formal_memory_receipt_self_sha256",
    )
    payload = dict(value)
    del payload["receiptSha256"]
    if sha256_bytes(canonical_json(payload)) != self_hash:
        fail("formal_memory_receipt_self_hash_mismatch")
    command_count = require_bounded_int(
        value.get("commandCount"),
        "formal_memory_command_count",
        minimum=1,
        maximum=128,
    )
    commands = value.get("commands")
    if not isinstance(commands, list) or len(commands) != command_count:
        fail("formal_memory_commands_invalid")
    peak_bytes = 0
    elapsed_ns = 0
    for index, command in enumerate(commands):
        if not isinstance(command, dict):
            fail(f"formal_memory_command_{index}_invalid")
        if index == release_command_index:
            release_exact = {
                "id": release_command_id,
                "argvSha256": release_command_argv_sha256,
                "executablePathFshex": require_canonical_absolute(
                    compiler_path, "formal_memory_release_compiler"
                ).hex(),
                "executableSha256": compiler.sha256,
                "executableSize": compiler.size,
            }
            if any(
                command.get(key) != expected
                for key, expected in release_exact.items()
            ):
                fail("formal_memory_release_command_receipt_mismatch")
            verify_release_command_artifact_attestation(
                evidence_raw,
                command,
                compiler_report,
            )
        require_exact_int(
            command.get("workloadRc"),
            0,
            f"formal_memory_command_{index}_exit_code",
        )
        require_exact_int(
            command.get("oomKill"),
            0,
            f"formal_memory_command_{index}_oom_kill",
        )
        peak_bytes = max(
            peak_bytes,
            require_bounded_int(
                command.get("memoryPeakBytes"),
                f"formal_memory_command_{index}_peak",
                minimum=1,
                maximum=FORMAL_MEMORY_LIMIT_BYTES,
            ),
        )
        command_elapsed_ns = require_bounded_int(
            command.get("elapsedNs"),
            f"formal_memory_command_{index}_elapsed_ns",
            minimum=1,
            maximum=(1 << 63) - 1,
        )
        elapsed_ns += command_elapsed_ns
        if elapsed_ns > (1 << 63) - 1:
            fail("formal_memory_elapsed_ns_overflow")
    aggregate = value.get("aggregateProbe")
    if not isinstance(aggregate, dict):
        fail("formal_memory_aggregate_probe_invalid")
    aggregate_rc = aggregate.get("workloadRc")
    aggregate_oom = aggregate.get("oomKill")
    if (
        type(aggregate_rc) is not int
        or aggregate_rc == 0
        or type(aggregate_oom) is not int
        or aggregate_oom <= 0
    ):
        fail("formal_memory_aggregate_enforcement_invalid")

    evidence_after = os.lstat(evidence_raw)
    command_manifest_after = stable_file(
        command_manifest_raw,
        "formal_memory_command_manifest",
        collect=True,
        maximum_bytes=MAX_TEXT_BYTES,
    )
    formal_receipt_after = stable_file(
        formal_receipt_raw,
        "formal_memory_receipt",
        collect=True,
        maximum_bytes=MAX_TEXT_BYTES,
    )
    validator_after = stable_file(
        validator_path,
        "formal_memory_validator",
        maximum_bytes=MAX_TEXT_BYTES,
    )
    gate_after = stable_file(
        gate_path,
        "formal_memory_gate",
        maximum_bytes=MAX_TEXT_BYTES,
    )
    runner_after = stable_file(
        runner_path,
        "formal_memory_kernel_runner",
        maximum_bytes=MAX_TEXT_BYTES,
    )
    if (
        stat_identity(evidence_after) != stat_identity(evidence_before)
        or command_manifest_after != command_manifest
        or formal_receipt_after != formal_receipt
        or validator_after != validator
        or gate_after != gate
        or runner_after != runner
    ):
        fail("formal_memory_evidence_changed_during_validation")
    return FormalMemoryIdentity(
        evidence_directory_fshex=evidence_raw.hex(),
        command_manifest_sha256=command_manifest.sha256,
        receipt_sha256=formal_receipt.sha256,
        receipt_self_sha256=self_hash,
        validator_sha256=validator.sha256,
        gate_sha256=gate.sha256,
        kernel_runner_sha256=runner.sha256,
        schema=FORMAL_MEMORY_RECEIPT_SCHEMA,
        proof_status=FORMAL_MEMORY_PROOF_STATUS,
        command_count=command_count,
        release_command_id=release_command_id,
        release_command_argv_sha256=release_command_argv_sha256,
        peak_bytes=peak_bytes,
        wall_ms=(elapsed_ns + 999_999) // 1_000_000,
    )


@dataclass(frozen=True)
class ParsedCompositionManifest:
    sha256: str
    size: int
    kind: str
    entry_source: bytes
    kernel_manifest: bytes | None
    plugin_triple: str | None
    source_paths: tuple[bytes, ...]


@dataclass(frozen=True)
class CompositionIdentity:
    manifest_sha256: str
    manifest_size: int
    kernel_manifest_sha256: str | None
    kind: str
    entry_source: bytes
    plugin_triple: str | None
    declared_sources_sha256: str
    sources: tuple[bytes, ...]


@dataclass(frozen=True)
class CompilerCompositionReportIdentity:
    sha256: str
    size: int
    output_path: bytes
    source_bundle_cid: str
    source_identity_receipt_cid: str
    compile_receipt_cid: str
    output_receipt_cid: str
    output_sha256: str


def parse_composition_manifest(
    path: str | bytes,
    label: str,
    *,
    include_entry_source: bool,
) -> ParsedCompositionManifest:
    manifest = stable_file(path, label, collect=True, maximum_bytes=MAX_TEXT_BYTES)
    assert manifest.raw is not None
    require_lf_text(manifest.raw, label)
    values: dict[str, str] = {}
    sources: list[bytes] = []
    for line_number, raw_line in enumerate(
        manifest.raw[:-1].decode("utf-8").split("\n"), 1
    ):
        line = raw_line.split("#", 1)[0].strip()
        if not line:
            continue
        if line.count("=") != 1:
            fail(label + f"_row_{line_number}_invalid")
        key, value = (part.strip() for part in line.split("=", 1))
        if (
            not key
            or not value
            or key in values
            or any(
                character not in "abcdefghijklmnopqrstuvwxyz0123456789_"
                for character in key
            )
        ):
            fail(label + f"_entry_{line_number}_invalid")
        if key.endswith("_source"):
            raw_source = os.fsencode(value)
            require_canonical_relative(
                raw_source, label + f"_source_{line_number}"
            )
            if not value.startswith("src/core/") or not value.endswith(".cheng"):
                fail(label + f"_source_{line_number}_outside_core")
            if key != "compiler_entry_source" or include_entry_source:
                if raw_source in sources:
                    fail(label + "_duplicate_source:" + value)
                sources.append(raw_source)
        elif key not in {
            "composition_schema",
            "composition_kind",
            "kernel_manifest",
            "plugin_canonical_triple",
        }:
            fail(label + "_unknown_key:" + key)
        values[key] = value
    if values.get("composition_schema") != "cheng.composition.v1":
        fail(label + "_schema_invalid")
    entry = values.get("compiler_entry_source", "")
    if not entry:
        fail(label + "_entry_source_missing")
    entry_raw = os.fsencode(entry)
    require_canonical_relative(entry_raw, label + "_entry_source")
    kernel_raw: bytes | None = None
    if "kernel_manifest" in values:
        kernel_raw = os.fsencode(values["kernel_manifest"])
        require_canonical_relative(kernel_raw, label + "_kernel_manifest")
    plugin_triple = values.get("plugin_canonical_triple")
    return ParsedCompositionManifest(
        sha256=manifest.sha256,
        size=manifest.size,
        kind=values.get("composition_kind", ""),
        entry_source=entry_raw,
        kernel_manifest=kernel_raw,
        plugin_triple=plugin_triple,
        source_paths=tuple(sources),
    )


def composition_declared_sources_sha256(sources: Sequence[bytes]) -> str:
    digest_input = bytearray(b"cheng.composition.declared_sources.v1\n")
    for source in sorted(sources):
        digest_input.extend(str(len(source)).encode("ascii"))
        digest_input.extend(b":")
        digest_input.extend(source)
        digest_input.extend(b"\n")
    digest = sha256_bytes(bytes(digest_input))
    return require_hash(digest, "composition_declared_sources_sha256")


def verify_composition_identity(
    source_root: str,
    manifest_path: str,
    closure: FileManifestIdentity,
    target: str,
) -> CompositionIdentity:
    if target not in RELEASE_TARGETS:
        fail("composition_target_invalid")
    root_raw = require_canonical_absolute(source_root, "source_root")
    bootstrap = os.path.join(root_raw, b"bootstrap")
    manifest_raw = require_canonical_absolute(
        manifest_path, "composition_manifest"
    )
    if os.path.dirname(manifest_raw) != bootstrap:
        fail("composition_manifest_outside_bootstrap")
    primary = parse_composition_manifest(
        manifest_raw, "composition_manifest", include_entry_source=True
    )
    kernel_sha256: str | None = None
    expected_sources: list[bytes] = []
    if primary.kind == "kernel-only":
        if (
            primary.kernel_manifest is not None
            or primary.plugin_triple is not None
            or primary.entry_source != KERNEL_COMPOSITION_ENTRY
        ):
            fail("composition_kernel_only_contract_invalid")
    elif primary.kind == "plugin":
        if (
            primary.kernel_manifest != b"bootstrap/kernel_manifest.cheng"
            or primary.plugin_triple != target
            or PLUGIN_COMPOSITION_ENTRIES.get(target) != primary.entry_source
        ):
            fail("composition_plugin_contract_invalid")
        kernel_path = os.path.join(root_raw, primary.kernel_manifest)
        if os.path.realpath(kernel_path) != kernel_path:
            fail("composition_kernel_manifest_path_invalid")
        kernel = parse_composition_manifest(
            kernel_path,
            "composition_kernel_manifest",
            include_entry_source=False,
        )
        if (
            kernel.kind != "kernel-only"
            or kernel.kernel_manifest is not None
            or kernel.plugin_triple is not None
            or kernel.entry_source != KERNEL_COMPOSITION_ENTRY
        ):
            fail("composition_kernel_manifest_contract_invalid")
        kernel_sha256 = kernel.sha256
        expected_sources.extend(kernel.source_paths)
    else:
        fail("composition_kind_invalid")
    for source in primary.source_paths:
        if source in expected_sources:
            fail("composition_cross_manifest_duplicate_source:" + os.fsdecode(source))
        expected_sources.append(source)
    expected = tuple(sorted(expected_sources))
    if not expected:
        fail("composition_declared_source_set_empty")
    if closure.root != root_raw:
        fail("composition_closure_root_mismatch")
    actual = tuple(entry.relative_path for entry in closure.entries)
    if actual != expected:
        missing = sorted(set(expected) - set(actual))
        extra = sorted(set(actual) - set(expected))
        if missing:
            fail("composition_closure_source_missing:" + os.fsdecode(missing[0]))
        if extra:
            fail("composition_closure_source_extra:" + os.fsdecode(extra[0]))
        fail("composition_closure_source_order_invalid")
    for source in expected:
        absolute = os.path.join(root_raw, source)
        if os.path.realpath(absolute) != absolute:
            fail("composition_source_path_invalid:" + os.fsdecode(source))
    return CompositionIdentity(
        manifest_sha256=primary.sha256,
        manifest_size=primary.size,
        kernel_manifest_sha256=kernel_sha256,
        kind=primary.kind,
        entry_source=primary.entry_source,
        plugin_triple=primary.plugin_triple,
        declared_sources_sha256=composition_declared_sources_sha256(expected),
        sources=expected,
    )


def compiler_report_values(raw: bytes) -> dict[str, str]:
    require_lf_text(raw, "compiler_composition_report")
    required = (
        "target",
        "output",
        "source_bundle_cid",
        "canonical_compiler_csg_cid",
        "source_identity_receipt_cid",
        "semantic_receipt_cid",
        "source_to_csg_binding_seal",
        "compile_receipt_target",
        "compile_receipt_cid",
        "composition_manifest_schema",
        "composition_manifest_sha256",
        "composition_kernel_manifest_sha256",
        "composition_kind",
        "composition_entry_source",
        "composition_plugin_canonical_triple",
        "composition_declared_source_count",
        "composition_declared_sources_sha256",
        "composition_source_closure_count",
        "composition_source_closure_sha256",
        "composition_source_identity_receipt_cid",
        "system_link_exec_runtime_execute",
        "final_output_sha256",
        "final_source_identity_receipt_cid",
        "final_semantic_receipt_cid",
        "final_source_to_csg_binding_seal",
        "system_link_exec",
        "real_backend_codegen",
        "cold_system_link_exec",
        "system_link_exec_scope",
        "full_backend_codegen",
        "compiler_executable_cid",
        "compiler_composition_kind",
        "compiler_composition_unit_id",
        "compiler_composition_unit_triple",
        "output_sha256",
        "compiler_output_receipt_cid",
    )
    wanted = set(required)
    values: dict[str, str] = {}
    for line_number, line in enumerate(raw[:-1].decode("utf-8").split("\n"), 1):
        if not line:
            continue
        key, separator, value = line.partition("=")
        if separator != "=" or key not in wanted:
            continue
        if not value:
            fail(f"compiler_composition_report_{key}_empty:{line_number}")
        if key in values:
            fail(f"compiler_composition_report_{key}_duplicate")
        values[key] = value
    missing = [key for key in required if key not in values]
    if missing:
        fail("compiler_composition_report_field_missing:" + missing[0])
    return values


def compiler_composition_projection(target: str) -> dict[str, str]:
    try:
        unit_id = COMPILER_COMPOSITION_UNIT_IDS[target]
    except KeyError as error:
        raise ReceiptError("compiler_composition_target_invalid") from error
    return {
        "compiler_composition_kind": "plugin",
        "compiler_composition_unit_id": str(unit_id),
        "compiler_composition_unit_triple": target,
    }


def verify_compiler_composition_report(
    report_path: str,
    compiler: StableFile,
    composition: CompositionIdentity,
    composition_closure: FileManifestIdentity,
    artifacts: FileManifestIdentity,
    target: str,
) -> CompilerCompositionReportIdentity:
    report = stable_file(
        report_path,
        "compiler_composition_report",
        collect=True,
        maximum_bytes=MAX_TEXT_BYTES,
    )
    assert report.raw is not None
    values = compiler_report_values(report.raw)
    exact = {
        "target": target,
        "composition_manifest_schema": "cheng.composition.v1",
        "composition_manifest_sha256": composition.manifest_sha256,
        "composition_kernel_manifest_sha256": (
            composition.kernel_manifest_sha256 or "-"
        ),
        "composition_kind": composition.kind,
        "composition_entry_source": os.fsdecode(composition.entry_source),
        "composition_plugin_canonical_triple": composition.plugin_triple or "-",
        "composition_declared_source_count": str(len(composition.sources)),
        "composition_declared_sources_sha256": (
            composition.declared_sources_sha256
        ),
        "composition_source_closure_count": str(composition_closure.count),
        "system_link_exec_runtime_execute": "1",
        "system_link_exec": "1",
        "real_backend_codegen": "1",
        "cold_system_link_exec": "0",
        "system_link_exec_scope": "selfhost_direct",
        "full_backend_codegen": "1",
        "compile_receipt_target": target,
    }
    exact.update(compiler_composition_projection(target))
    if any(values[key] != expected for key, expected in exact.items()):
        fail("compiler_composition_report_projection_mismatch")
    source_bundle_cid = require_hash(
        values["source_bundle_cid"],
        "compiler_composition_report_source_bundle_cid",
    )
    if values["composition_source_closure_sha256"] != source_bundle_cid:
        fail("compiler_composition_report_source_closure_cid_mismatch")
    source_identity_receipt_cid = require_hash(
        values["source_identity_receipt_cid"],
        "compiler_composition_report_source_identity_receipt_cid",
    )
    if (
        values["composition_source_identity_receipt_cid"]
        != source_identity_receipt_cid
        or values["final_source_identity_receipt_cid"]
        != source_identity_receipt_cid
    ):
        fail("compiler_composition_report_source_identity_projection_mismatch")
    semantic_receipt_cid = require_hash(
        values["semantic_receipt_cid"],
        "compiler_composition_report_semantic_receipt_cid",
    )
    if values["final_semantic_receipt_cid"] != semantic_receipt_cid:
        fail("compiler_composition_report_semantic_projection_mismatch")
    source_to_csg_binding_seal = require_hash(
        values["source_to_csg_binding_seal"],
        "compiler_composition_report_source_to_csg_binding_seal",
    )
    if values["final_source_to_csg_binding_seal"] != source_to_csg_binding_seal:
        fail("compiler_composition_report_binding_seal_projection_mismatch")
    require_hash(
        values["canonical_compiler_csg_cid"],
        "compiler_composition_report_canonical_compiler_csg_cid",
    )
    compile_receipt_cid = require_hash(
        values["compile_receipt_cid"],
        "compiler_composition_report_compile_receipt_cid",
    )
    output_receipt_cid = require_hash(
        values["compiler_output_receipt_cid"],
        "compiler_composition_report_output_receipt_cid",
    )
    compiler_executable_cid = values["compiler_executable_cid"]
    if compiler_executable_cid != "sha256:" + compiler.sha256:
        fail("compiler_composition_report_executable_identity_mismatch")
    output_sha256 = require_hash(
        values["output_sha256"],
        "compiler_composition_report_output_sha256",
    )
    if values["final_output_sha256"] != output_sha256:
        fail("compiler_composition_report_final_output_mismatch")
    output_raw = require_canonical_absolute(
        values["output"], "compiler_composition_report_output"
    )
    output_path = os.fsdecode(output_raw)
    artifact_root = os.fsdecode(artifacts.root)
    try:
        relative_text = os.path.relpath(output_path, artifact_root)
        within = os.path.commonpath((output_path, artifact_root)) == artifact_root
    except ValueError as error:
        raise ReceiptError(
            "compiler_composition_report_output_outside_artifacts"
        ) from error
    relative = os.fsencode(relative_text)
    if not within:
        fail("compiler_composition_report_output_outside_artifacts")
    require_canonical_relative(
        relative, "compiler_composition_report_output_relative"
    )
    matches = [entry for entry in artifacts.entries if entry.relative_path == relative]
    if len(matches) != 1:
        fail("compiler_composition_report_output_artifact_missing")
    output = stable_file(output_raw, "compiler_composition_report_output_artifact")
    artifact = matches[0]
    if (
        output.sha256 != output_sha256
        or artifact.sha256 != output_sha256
        or output.size != artifact.size
        or output.mode != artifact.mode
    ):
        fail("compiler_composition_report_output_artifact_identity_mismatch")
    return CompilerCompositionReportIdentity(
        sha256=report.sha256,
        size=report.size,
        output_path=output_raw,
        source_bundle_cid=source_bundle_cid,
        source_identity_receipt_cid=source_identity_receipt_cid,
        compile_receipt_cid=compile_receipt_cid,
        output_receipt_cid=output_receipt_cid,
        output_sha256=output_sha256,
    )


def common_fields(args: argparse.Namespace) -> list[tuple[str, str]]:
    target = require_token(args.target, "target")
    jobs = canonical_uint(args.jobs, "jobs", positive=True)
    if jobs > 65536:
        fail("jobs_out_of_range")
    if args.cache_mode != "off":
        fail("formal_cache_mode_must_be_off")
    source_cid, source_manifest_hash = source_closure_identity(
        args.source_root, args.source_scope
    )
    require_hash(source_manifest_hash, "source_closure_manifest_sha256")
    composition_closure = verify_file_manifest(
        args.composition_closure_manifest,
        "composition_closure_manifest",
        COMPOSITION_CLOSURE_SCHEMA,
        b"cheng.kernel.composition_closure.v1.identity",
        require_nonempty_files=False,
    )
    composition = verify_composition_identity(
        args.source_root,
        args.composition_manifest,
        composition_closure,
        target,
    )
    require_hash(composition.manifest_sha256, "composition_manifest_sha256")
    kernel_contract_sha256 = require_hash(
        composition.kernel_manifest_sha256 or composition.manifest_sha256,
        "composition_kernel_contract_sha256",
    )
    require_hash(
        composition_closure.raw_sha256,
        "composition_closure_manifest_sha256",
    )
    compiler = stable_file(args.compiler, "compiler")
    if compiler.size == 0:
        fail("compiler_empty")
    compiler_hash = require_hash(compiler.sha256, "compiler_sha256")
    toolchain = verify_file_manifest(
        args.toolchain_manifest,
        "toolchain_manifest",
        TOOLCHAIN_MANIFEST_SCHEMA,
        b"cheng.kernel.toolchain_manifest.v1.identity",
        require_nonempty_files=True,
    )
    require_hash(toolchain.raw_sha256, "toolchain_manifest_sha256")
    artifacts = verify_file_manifest(
        args.artifact_manifest,
        "artifact_manifest",
        ARTIFACT_MANIFEST_SCHEMA,
        b"cheng.kernel.artifact_manifest.v1.identity",
        require_nonempty_files=True,
    )
    require_hash(artifacts.raw_sha256, "artifact_manifest_sha256")
    compiler_report = verify_compiler_composition_report(
        args.compiler_composition_report,
        compiler,
        composition,
        composition_closure,
        artifacts,
        target,
    )
    memory = verify_formal_memory_proof(
        args.memory_evidence_dir,
        args.memory_command_manifest,
        args.memory_receipt,
        source_root=args.source_root,
        composition_manifest=args.composition_manifest,
        compiler_path=args.compiler,
        compiler=compiler,
        compiler_report_path=args.compiler_composition_report,
        composition=composition,
        compiler_report=compiler_report,
        target=target,
        jobs=jobs,
    )
    return [
        ("schema", RECEIPT_SCHEMA),
        ("source_closure_cid", source_cid),
        ("source_closure_manifest_sha256", source_manifest_hash),
        ("composition_manifest_sha256", composition.manifest_sha256),
        ("composition_manifest_size_bytes", str(composition.manifest_size)),
        ("composition_kind", composition.kind),
        ("composition_entry_source_fshex", composition.entry_source.hex()),
        (
            "composition_plugin_canonical_triple",
            composition.plugin_triple or "none",
        ),
        ("composition_kernel_contract_sha256", kernel_contract_sha256),
        (
            "composition_declared_sources_sha256",
            composition.declared_sources_sha256,
        ),
        ("composition_declared_source_count", str(len(composition.sources))),
        ("composition_closure_manifest_sha256", composition_closure.raw_sha256),
        ("composition_closure_cid", composition_closure.identity_cid),
        ("composition_closure_count", str(composition_closure.count)),
        ("compiler_composition_report_sha256", compiler_report.sha256),
        (
            "compiler_composition_report_size_bytes",
            str(compiler_report.size),
        ),
        ("compiler_report_source_bundle_cid", compiler_report.source_bundle_cid),
        (
            "compiler_report_source_identity_receipt_cid",
            compiler_report.source_identity_receipt_cid,
        ),
        (
            "compiler_report_compile_receipt_cid",
            compiler_report.compile_receipt_cid,
        ),
        (
            "compiler_report_output_receipt_cid",
            compiler_report.output_receipt_cid,
        ),
        ("compiler_report_output_sha256", compiler_report.output_sha256),
        ("compiler_sha256", compiler_hash),
        ("compiler_size_bytes", str(compiler.size)),
        ("compiler_mode_decimal", str(compiler.mode)),
        ("toolchain_manifest_sha256", toolchain.raw_sha256),
        ("toolchain_identity_cid", toolchain.identity_cid),
        ("toolchain_count", str(toolchain.count)),
        ("target", target),
        ("jobs", str(jobs)),
        ("cache_mode", "off"),
        ("wall_ms", str(memory.wall_ms)),
        ("memory_evidence_directory_fshex", memory.evidence_directory_fshex),
        ("memory_command_manifest_sha256", memory.command_manifest_sha256),
        ("memory_formal_receipt_sha256", memory.receipt_sha256),
        ("memory_formal_receipt_self_sha256", memory.receipt_self_sha256),
        ("memory_validator_sha256", memory.validator_sha256),
        ("memory_gate_sha256", memory.gate_sha256),
        ("memory_kernel_runner_sha256", memory.kernel_runner_sha256),
        ("memory_proof_schema", memory.schema),
        ("memory_proof_status", memory.proof_status),
        ("memory_command_count", str(memory.command_count)),
        ("memory_release_command_id", memory.release_command_id),
        (
            "memory_release_command_argv_sha256",
            memory.release_command_argv_sha256,
        ),
        ("memory_exit_code", "0"),
        ("memory_authority", MEMORY_AUTHORITY),
        ("memory_limit_bytes", str(FORMAL_MEMORY_LIMIT_BYTES)),
        ("memory_swap_limit_bytes", str(FORMAL_MEMORY_SWAP_BYTES)),
        ("memory_peak_bytes", str(memory.peak_bytes)),
        ("memory_oom_kill_count", "0"),
        ("memory_scope", MEMORY_SCOPE),
        ("process_tree_placement", PROCESS_TREE_PLACEMENT),
        ("process_tree_completion", PROCESS_TREE_COMPLETION),
        ("artifact_manifest_sha256", artifacts.raw_sha256),
        ("artifact_identity_cid", artifacts.identity_cid),
        ("artifact_count", str(artifacts.count)),
    ]


def sealed_receipt(fields: Sequence[tuple[str, str]]) -> bytes:
    if tuple(key for key, _ in fields) != RECEIPT_KEYS[:-1]:
        fail("internal_receipt_key_order_invalid")
    prefix = encode_rows(fields)
    self_hash = sha256_bytes(SELF_HASH_DOMAIN + prefix)
    require_hash(self_hash, "receipt_sha256")
    return prefix + encode_rows((("receipt_sha256", self_hash),))


def parse_receipt(raw: bytes) -> list[tuple[str, str]]:
    rows = ordered_kv(raw, "receipt", RECEIPT_KEYS)
    values = dict(rows)
    if values["schema"] != RECEIPT_SCHEMA:
        fail("receipt_schema_invalid")
    for key in RECEIPT_KEYS:
        if key.endswith("sha256") or key.endswith("_cid"):
            require_hash(values[key], "receipt_" + key)
    for key in (
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
        "memory_exit_code",
        "memory_limit_bytes",
        "memory_swap_limit_bytes",
        "memory_peak_bytes",
        "memory_oom_kill_count",
        "artifact_count",
    ):
        canonical_uint(values[key], "receipt_" + key)
    entry_source = decode_canonical_hex(
        values["composition_entry_source_fshex"],
        "receipt_composition_entry_source",
    )
    require_canonical_relative(entry_source, "receipt_composition_entry_source")
    if (
        values["target"] not in RELEASE_TARGETS
        or values["composition_kind"] not in ("kernel-only", "plugin")
        or values["composition_declared_source_count"]
        != values["composition_closure_count"]
    ):
        fail("receipt_composition_projection_invalid")
    if values["composition_kind"] == "kernel-only":
        if values["composition_plugin_canonical_triple"] != "none":
            fail("receipt_composition_kernel_only_plugin_invalid")
    elif (
        values["composition_plugin_canonical_triple"] != values["target"]
    ):
        fail("receipt_composition_plugin_target_mismatch")
    require_token(
        values["memory_release_command_id"],
        "receipt_memory_release_command_id",
    )
    prefix = encode_rows(rows[:-1])
    expected = sha256_bytes(SELF_HASH_DOMAIN + prefix)
    if values["receipt_sha256"] != expected:
        fail("receipt_self_hash_mismatch")
    return rows


def write_atomic_exclusive(path: str, raw: bytes) -> None:
    output = require_canonical_absolute(path, "output")
    parent = os.path.dirname(output)
    name = os.path.basename(output)
    if not name or name in (b".", b".."):
        fail("output_name_invalid")
    if not os.path.isdir(parent):
        fail("output_parent_missing")
    directory_flags = os.O_RDONLY
    if hasattr(os, "O_DIRECTORY"):
        directory_flags |= os.O_DIRECTORY
    if hasattr(os, "O_CLOEXEC"):
        directory_flags |= os.O_CLOEXEC
    directory = os.open(parent, directory_flags)
    temporary = b"." + name + b"." + secrets.token_hex(16).encode("ascii") + b".tmp"
    descriptor = -1
    try:
        try:
            os.stat(name, dir_fd=directory, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            fail("output_exists")
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        if hasattr(os, "O_CLOEXEC"):
            flags |= os.O_CLOEXEC
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        descriptor = os.open(temporary, flags, 0o600, dir_fd=directory)
        view = memoryview(raw)
        while view:
            written = os.write(descriptor, view)
            if written <= 0:
                fail("output_short_write")
            view = view[written:]
        os.fsync(descriptor)
        os.close(descriptor)
        descriptor = -1
        os.link(
            temporary,
            name,
            src_dir_fd=directory,
            dst_dir_fd=directory,
            follow_symlinks=False,
        )
        os.unlink(temporary, dir_fd=directory)
        os.fsync(directory)
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        try:
            os.unlink(temporary, dir_fd=directory)
        except FileNotFoundError:
            pass
        os.close(directory)


def add_common_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--source-root", required=True)
    parser.add_argument("--source-scope", action="append", required=True)
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
    parser.add_argument("--cache-mode", required=True)


def argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="kernel_release_receipt.py")
    subparsers = parser.add_subparsers(dest="command", required=True)
    create = subparsers.add_parser("create")
    add_common_arguments(create)
    create.add_argument("--out", required=True)
    verify = subparsers.add_parser("verify")
    add_common_arguments(verify)
    verify.add_argument("--receipt", required=True)
    return parser


def execute(args: argparse.Namespace) -> None:
    fields = common_fields(args)
    confirmation = common_fields(args)
    if confirmation != fields:
        fail("release_inputs_changed_during_capture")
    expected = sealed_receipt(fields)
    if args.command == "create":
        write_atomic_exclusive(args.out, expected)
        print("kernel_release_receipt_status=created")
        return
    receipt = stable_file(
        args.receipt, "receipt", collect=True, maximum_bytes=MAX_TEXT_BYTES
    )
    assert receipt.raw is not None
    parse_receipt(receipt.raw)
    if receipt.raw != expected:
        fail("receipt_recomputed_identity_mismatch")
    print("kernel_release_receipt_status=verified")


def main() -> int:
    try:
        execute(argument_parser().parse_args())
    except (OSError, ReceiptError) as error:
        print("kernel_release_receipt_error=" + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
