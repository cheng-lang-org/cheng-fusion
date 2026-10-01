#!/usr/bin/env python3
"""Strict standalone validator for canonical descendant-exec ledger receipts."""

from __future__ import annotations

import argparse
import errno
import hashlib
import json
import os
import stat
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, NoReturn, Sequence

sys.dont_write_bytecode = True

RECEIPT_SCHEMA = "cheng.linux_ptrace_exec_ledger"
MANIFEST_SCHEMA = "cheng.linux_ptrace_exec_manifest"
APPLICABILITY = "native_linux_parent_owned_ptrace_only"
PROOF_STATUS = "PROVED"
EXIT_CONTRACT_STATUS = "verified"

MAX_RECEIPT_BYTES = 32 * 1024 * 1024
MAX_MANIFEST_BYTES = 4 * 1024 * 1024
MAX_EXECUTABLE_BYTES = 512 * 1024 * 1024
MAX_BOUND_FILE_BYTES = 512 * 1024 * 1024
MAX_EVENTS = 32_768
MAX_TASKS = 4_096
MAX_ARGV_COUNT = 4_096
MAX_ARGV_BYTES = 1024 * 1024
MAX_ARGV_FILE_BINDINGS = 512
MAX_MUTABLE_OUTPUT_PATHS = 64
MAX_GENERATED_ARGV_FILES = 512
MAX_EVENT_JSON_BYTES = 16 * 1024 * 1024
MAX_OUTPUT_BYTES = 32 * 1024 * 1024
HASH_CHUNK_BYTES = 1024 * 1024

ARGV_AUTHORITY_IMMUTABLE = "immutable_manifest"
ARGV_AUTHORITY_MUTABLE_OUTPUT = "mutable_output"
ARGV_AUTHORITY_GENERATED = "generated_argv"

PTRACE_OPTION_NAMES = (
    "PTRACE_O_TRACEFORK",
    "PTRACE_O_TRACEVFORK",
    "PTRACE_O_TRACECLONE",
    "PTRACE_O_TRACEEXEC",
    "PTRACE_O_TRACEEXIT",
    "PTRACE_O_EXITKILL",
    "PTRACE_O_TRACESYSGOOD",
    "PTRACE_O_TRACESECCOMP",
)
PTRACE_OPTION_MASK = (
    0x00000002
    | 0x00000004
    | 0x00000008
    | 0x00000010
    | 0x00000040
    | 0x00100000
    | 0x00000001
    | 0x00000080
)

FILE_IDENTITY_KEYS = (
    "pathFshex",
    "sha256",
    "device",
    "inode",
    "size",
    "mode",
    "uid",
    "gid",
)
DYNAMIC_ARGV_BINDING_KEYS = (
    "linkCount",
    "mtimeNs",
    "ctimeNs",
)
PROCESS_KEYS = ("pid", "starttimeTicks")


class ValidationError(RuntimeError):
    pass


@dataclass(frozen=True)
class ValidatedReceipt:
    receipt_sha256: str
    payload_sha256: str
    manifest_sha256: str
    producer_sha256: str
    expected_root_exit_code: int
    actual_root_exit_code: int
    event_count: int


@dataclass
class TaskAudit:
    parent: tuple[int, int]
    generation: int = 0
    pending: dict[str, Any] | None = None
    exit_prepared: int | None = None
    closed: bool = False


def fail(message: str) -> NoReturn:
    raise ValidationError(message)


def canonical_json(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def sha256_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def framed_sha256(values: Iterable[bytes]) -> str:
    digest = hashlib.sha256()
    count = 0
    for value in values:
        count += 1
        digest.update(len(value).to_bytes(8, "big"))
        digest.update(value)
    digest.update(count.to_bytes(8, "big"))
    return digest.hexdigest()


def canonical_sha256(raw: Any, label: str) -> str:
    if (
        not isinstance(raw, str)
        or len(raw) != 64
        or any(char not in "0123456789abcdef" for char in raw)
    ):
        fail(f"{label} is not canonical sha256")
    return raw


def canonical_uint(raw: Any, label: str, maximum: int | None = None) -> int:
    if type(raw) is not int or raw < 0 or (
        maximum is not None and raw > maximum
    ):
        fail(f"{label} is outside canonical unsigned range")
    return raw


def require_exact_keys(value: Any, keys: Sequence[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != set(keys):
        fail(f"{label} keys are not exact")
    return value


def exact_path(path: Path, label: str) -> Path:
    if not path.is_absolute():
        fail(f"{label} path is not absolute")
    try:
        resolved = path.resolve(strict=True)
    except OSError as exc:
        raise ValidationError(f"{label} path cannot be resolved") from exc
    if resolved != path:
        fail(f"{label} path contains a symlink or alias")
    return path


def canonical_path_from_fshex(raw: Any, label: str) -> Path:
    if (
        not isinstance(raw, str)
        or not raw
        or raw.lower() != raw
        or len(raw) % 2 != 0
    ):
        fail(f"{label} pathFshex is not canonical lowercase hex")
    try:
        encoded = bytes.fromhex(raw)
    except ValueError as exc:
        raise ValidationError(f"{label} pathFshex is invalid") from exc
    if not encoded or b"\0" in encoded or encoded.hex() != raw:
        fail(f"{label} pathFshex is not exact")
    path = Path(os.fsdecode(encoded))
    if (
        not path.is_absolute()
        or path == Path("/")
        or os.fsencode(path) != encoded
        or any(part in (".", "..") for part in path.parts)
    ):
        fail(f"{label} pathFshex is not a canonical absolute path")
    return path


def path_from_fshex(raw: Any, label: str) -> Path:
    return exact_path(canonical_path_from_fshex(raw, label), label)


def stat_signature(info: os.stat_result) -> tuple[int, ...]:
    return (
        info.st_dev,
        info.st_ino,
        info.st_mode,
        info.st_uid,
        info.st_gid,
        info.st_size,
        info.st_mtime_ns,
        info.st_ctime_ns,
    )


def read_stable(path: Path, label: str, maximum: int) -> tuple[bytes, os.stat_result]:
    path = exact_path(path, label)
    try:
        before_path = os.stat(path, follow_symlinks=False)
    except OSError as exc:
        raise ValidationError(f"{label} stat failed") from exc
    if (
        not stat.S_ISREG(before_path.st_mode)
        or before_path.st_size < 0
        or before_path.st_size > maximum
    ):
        fail(f"{label} is not a bounded regular file")
    if not hasattr(os, "O_NOFOLLOW"):
        fail("O_NOFOLLOW is unavailable")
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | os.O_NOFOLLOW
    try:
        descriptor = os.open(path, flags)
    except OSError as exc:
        raise ValidationError(f"{label} O_NOFOLLOW open failed") from exc
    try:
        before = os.fstat(descriptor)
        if stat_signature(before) != stat_signature(before_path):
            fail(f"{label} changed before open")
        chunks: list[bytes] = []
        remaining = before.st_size
        while remaining:
            chunk = os.read(descriptor, min(HASH_CHUNK_BYTES, remaining))
            if not chunk:
                fail(f"{label} short read")
            chunks.append(chunk)
            remaining -= len(chunk)
        if os.read(descriptor, 1):
            fail(f"{label} grew during read")
        after = os.fstat(descriptor)
    finally:
        os.close(descriptor)
    try:
        after_path = os.stat(path, follow_symlinks=False)
    except OSError as exc:
        raise ValidationError(f"{label} post-read stat failed") from exc
    if (
        stat_signature(before) != stat_signature(after)
        or stat_signature(before) != stat_signature(after_path)
    ):
        fail(f"{label} changed during read")
    return b"".join(chunks), before


def parse_canonical_json_file(
    path: Path,
    label: str,
    maximum: int,
) -> tuple[dict[str, Any], bytes, os.stat_result]:
    raw, info = read_stable(path, label, maximum)
    if not raw.endswith(b"\n"):
        fail(f"{label} is not newline terminated")
    try:
        value = json.loads(raw.decode("utf-8", "strict"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValidationError(f"{label} is not strict UTF-8 JSON") from exc
    if not isinstance(value, dict) or canonical_json(value) + b"\n" != raw:
        fail(f"{label} is not canonical JSON")
    return value, raw, info


def file_identity(
    path: Path,
    label: str,
    *,
    executable: bool,
) -> dict[str, Any]:
    maximum = MAX_EXECUTABLE_BYTES if executable else MAX_BOUND_FILE_BYTES
    raw, info = read_stable(path, label, maximum)
    if executable:
        if not info.st_mode & stat.S_IXUSR:
            fail(f"{label} is not owner-executable")
        if (
            len(raw) < 20
            or raw[:4] != b"\x7fELF"
            or raw[4] != 2
            or raw[5] != 1
            or int.from_bytes(raw[18:20], "little") not in (62, 183)
        ):
            fail(f"{label} is not canonical Linux x86_64/aarch64 ELF64")
    return {
        "pathFshex": os.fsencode(path).hex(),
        "sha256": sha256_bytes(raw),
        "device": info.st_dev,
        "inode": info.st_ino,
        "size": info.st_size,
        "mode": info.st_mode,
        "uid": info.st_uid,
        "gid": info.st_gid,
    }


def validate_identity_shape(value: Any, label: str) -> dict[str, Any]:
    identity = require_exact_keys(value, FILE_IDENTITY_KEYS, label)
    canonical_path_from_fshex(identity["pathFshex"], label)
    canonical_sha256(identity["sha256"], f"{label} sha256")
    for key in ("device", "inode", "size", "mode", "uid", "gid"):
        canonical_uint(identity[key], f"{label} {key}")
    if identity["size"] > MAX_EXECUTABLE_BYTES:
        fail(f"{label} size exceeds absolute identity bound")
    return identity


def validate_current_identity(
    expected: Any,
    label: str,
    *,
    executable: bool,
) -> tuple[Path, dict[str, Any]]:
    identity = validate_identity_shape(expected, label)
    path = path_from_fshex(identity["pathFshex"], label)
    current = file_identity(path, label, executable=executable)
    if current != identity:
        fail(f"{label} current path identity mismatch")
    return path, identity


def load_manifest(
    manifest_path: Path,
) -> tuple[
    dict[str, dict[str, Any]],
    dict[str, dict[str, Any]],
    int,
    int,
    Path,
    frozenset[str],
    str,
]:
    value, raw, _info = parse_canonical_json_file(
        manifest_path,
        "exec manifest",
        MAX_MANIFEST_BYTES,
    )
    require_exact_keys(
        value,
        (
            "schema",
            "executables",
            "boundArgvFiles",
            "dynamicArgvUid",
            "dynamicArgvGid",
            "generatedArgvDirectoryPathFshex",
            "mutableOutputPathFshexes",
        ),
        "exec manifest",
    )
    if value["schema"] != MANIFEST_SCHEMA:
        fail("exec manifest schema mismatch")
    executables_raw = value["executables"]
    bound_raw = value["boundArgvFiles"]
    dynamic_argv_uid = canonical_uint(
        value["dynamicArgvUid"],
        "exec manifest dynamic argv uid",
    )
    dynamic_argv_gid = canonical_uint(
        value["dynamicArgvGid"],
        "exec manifest dynamic argv gid",
    )
    if dynamic_argv_uid == 0 or dynamic_argv_gid == 0:
        fail("exec manifest dynamic argv owner is privileged")
    generated_directory = canonical_path_from_fshex(
        value["generatedArgvDirectoryPathFshex"],
        "generated argv directory",
    )
    mutable_raw = value["mutableOutputPathFshexes"]
    if (
        not isinstance(executables_raw, list)
        or not executables_raw
        or len(executables_raw) > 512
        or not isinstance(bound_raw, list)
        or len(bound_raw) > 512
        or not isinstance(mutable_raw, list)
        or len(mutable_raw) > MAX_MUTABLE_OUTPUT_PATHS
        or mutable_raw != sorted(mutable_raw)
        or len(set(mutable_raw)) != len(mutable_raw)
    ):
        fail("exec manifest entry count is invalid")
    if generated_directory.exists() or generated_directory.is_symlink():
        fail("generated argv directory survived the trace")
    if exact_path(
        generated_directory.parent,
        "generated argv directory parent",
    ) != generated_directory.parent:
        fail("generated argv directory parent is not exact")
    mutable_outputs = frozenset(
        os.fsencode(canonical_path_from_fshex(
            raw_path,
            f"mutable output path[{index}]",
        )).hex()
        for index, raw_path in enumerate(mutable_raw)
    )
    for rows, label in (
        (executables_raw, "executable"),
        (bound_raw, "bound file"),
    ):
        if rows != sorted(
            rows,
            key=lambda item: (
                item.get("pathFshex", "") if isinstance(item, dict) else ""
            ),
        ):
            fail(f"exec manifest {label} entries are not sorted")
    executables: dict[str, dict[str, Any]] = {}
    bound_files: dict[str, dict[str, Any]] = {}
    for index, entry in enumerate(executables_raw):
        _path, identity = validate_current_identity(
            entry,
            f"manifest executable[{index}]",
            executable=True,
        )
        key = identity["pathFshex"]
        if key in executables:
            fail("exec manifest executable path is duplicated")
        executables[key] = identity
    for index, entry in enumerate(bound_raw):
        _path, identity = validate_current_identity(
            entry,
            f"manifest bound file[{index}]",
            executable=False,
        )
        key = identity["pathFshex"]
        if key in bound_files or key in executables:
            fail("exec manifest path appears in multiple roles")
        bound_files[key] = identity
    if (
        mutable_outputs.intersection(executables)
        or mutable_outputs.intersection(bound_files)
        or os.fsencode(generated_directory).hex() in mutable_outputs
        or any(
            canonical_path_from_fshex(path_fshex, "mutable output path").parent
            == generated_directory
            for path_fshex in mutable_outputs
        )
    ):
        fail("exec manifest path authority domains overlap")
    return (
        executables,
        bound_files,
        dynamic_argv_uid,
        dynamic_argv_gid,
        generated_directory,
        mutable_outputs,
        sha256_bytes(raw),
    )


def process_key(
    value: Any,
    label: str,
    *,
    generation: bool = False,
) -> tuple[int, int, int | None]:
    keys = (*PROCESS_KEYS, "generation") if generation else PROCESS_KEYS
    process = require_exact_keys(value, keys, label)
    pid = canonical_uint(process["pid"], f"{label} pid")
    start = canonical_uint(
        process["starttimeTicks"],
        f"{label} starttimeTicks",
    )
    if pid <= 0 or start <= 0:
        fail(f"{label} process identity is invalid")
    observed_generation: int | None = None
    if generation:
        observed_generation = canonical_uint(
            process["generation"],
            f"{label} generation",
        )
    return pid, start, observed_generation


def validate_event_identity(
    value: Any,
    label: str,
    executables: dict[str, dict[str, Any]],
    bound_files: dict[str, dict[str, Any]],
    *,
    executable: bool,
) -> dict[str, Any]:
    identity = validate_identity_shape(value, label)
    allowed = executables if executable else {**executables, **bound_files}
    expected = allowed.get(identity["pathFshex"])
    if expected is None or identity != expected:
        fail(f"{label} is outside immutable manifest identity")
    return identity


def validate_dynamic_argv_identity(
    identity: dict[str, Any],
    label: str,
    authority_domain: str,
    authority_generation: int,
    link_count: int,
    mtime_ns: int,
    ctime_ns: int,
    expected_uid: int,
    expected_gid: int,
    generated_directory: Path,
    mutable_outputs: frozenset[str],
    generated_seen: dict[str, dict[str, Any]],
) -> None:
    path_fshex = identity["pathFshex"]
    path = canonical_path_from_fshex(path_fshex, label)
    mode = identity["mode"]
    if (
        not stat.S_ISREG(mode)
        or identity["uid"] != expected_uid
        or identity["gid"] != expected_gid
        or identity["size"] > MAX_BOUND_FILE_BYTES
        or mode & stat.S_IXUSR
    ):
        fail(f"{label} dynamic file identity is invalid")
    if path_fshex in mutable_outputs:
        if (
            authority_domain != ARGV_AUTHORITY_MUTABLE_OUTPUT
            or authority_generation != 0
            or link_count != 1
            or mode & (stat.S_IWGRP | stat.S_IWOTH)
        ):
            fail(f"{label} mutable output permissions are invalid")
        return
    if (
        authority_domain != ARGV_AUTHORITY_GENERATED
        or path.parent != generated_directory
    ):
        fail(f"{label} is outside all manifest argv authority domains")
    if link_count != 1 or mode & (stat.S_IRWXG | stat.S_IRWXO):
        fail(f"{label} generated file permissions are invalid")
    physical = {
        key: identity[key]
        for key in ("pathFshex", "device", "inode", "mode", "uid", "gid")
    }
    physical["linkCount"] = link_count
    version_identity = {
        "sha256": identity["sha256"],
        "size": identity["size"],
        "mtimeNs": mtime_ns,
        "ctimeNs": ctime_ns,
    }
    prior = generated_seen.get(path_fshex)
    if prior is None:
        if len(generated_seen) >= MAX_GENERATED_ARGV_FILES:
            fail("generated argv file count exceeds contract")
        if authority_generation != 0:
            fail(f"{label} first generated file generation is not zero")
        generated_seen[path_fshex] = {
            "physical": physical,
            "versionIdentity": version_identity,
            "generation": authority_generation,
        }
        return
    if prior["physical"] != physical:
        fail(f"{label} generated file physical identity changed")
    if prior["versionIdentity"] == version_identity:
        if prior["generation"] != authority_generation:
            fail(f"{label} stable generated file generation changed")
        return
    if authority_generation != prior["generation"] + 1:
        fail(f"{label} generated file generation is not contiguous")
    prior["versionIdentity"] = version_identity
    prior["generation"] = authority_generation


def validate_argv_bindings(
    value: Any,
    label: str,
    argv_count: int,
    executables: dict[str, dict[str, Any]],
    bound_files: dict[str, dict[str, Any]],
    dynamic_argv_uid: int,
    dynamic_argv_gid: int,
    generated_directory: Path,
    mutable_outputs: frozenset[str],
    generated_seen: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    if (
        not isinstance(value, list)
        or len(value) > MAX_ARGV_FILE_BINDINGS
    ):
        fail(f"{label} is not a bounded binding list")
    previous_index = 0
    result: list[dict[str, Any]] = []
    for row_index, raw in enumerate(value):
        if not isinstance(raw, dict):
            fail(f"{label}[{row_index}] is not an object")
        authority_domain = raw.get("authorityDomain")
        dynamic = authority_domain in (
            ARGV_AUTHORITY_MUTABLE_OUTPUT,
            ARGV_AUTHORITY_GENERATED,
        )
        binding = require_exact_keys(
            raw,
            (
                "index",
                "authorityDomain",
                "authorityGeneration",
                *FILE_IDENTITY_KEYS,
                *(DYNAMIC_ARGV_BINDING_KEYS if dynamic else ()),
            ),
            f"{label}[{row_index}]",
        )
        index = canonical_uint(
            binding["index"],
            f"{label}[{row_index}] index",
        )
        if index <= previous_index or index >= argv_count:
            fail(f"{label} indices are not unique ascending argv positions")
        previous_index = index
        authority_generation = canonical_uint(
            binding["authorityGeneration"],
            f"{label}[{row_index}] authority generation",
            MAX_EVENTS,
        )
        identity = {
            key: binding[key]
            for key in FILE_IDENTITY_KEYS
        }
        validate_identity_shape(
            identity,
            f"{label}[{row_index}] identity",
        )
        immutable = (
            executables.get(identity["pathFshex"])
            or bound_files.get(identity["pathFshex"])
        )
        if immutable is not None:
            if (
                authority_domain != ARGV_AUTHORITY_IMMUTABLE
                or authority_generation != 0
                or identity != immutable
            ):
                fail(f"{label}[{row_index}] immutable identity mismatch")
        else:
            if not dynamic:
                fail(f"{label}[{row_index}] dynamic authority domain is invalid")
            validate_dynamic_argv_identity(
                identity,
                f"{label}[{row_index}] identity",
                authority_domain,
                authority_generation,
                canonical_uint(
                    binding["linkCount"],
                    f"{label}[{row_index}] link count",
                ),
                canonical_uint(
                    binding["mtimeNs"],
                    f"{label}[{row_index}] mtime",
                ),
                canonical_uint(
                    binding["ctimeNs"],
                    f"{label}[{row_index}] ctime",
                ),
                dynamic_argv_uid,
                dynamic_argv_gid,
                generated_directory,
                mutable_outputs,
                generated_seen,
            )
        result.append(binding)
    return result


def wait_status_matches(
    wait_status: int,
    exit_code: int,
    signal_number: int,
) -> bool:
    if signal_number == 0:
        return wait_status & 0x7F == 0 and (wait_status >> 8) & 0xFF == exit_code
    return (
        exit_code == -1
        and wait_status & 0x7F == signal_number
        and signal_number != 0x7F
    )


def validate_closed_event_graph(
    events: Any,
    root_value: Any,
    actual_root_exit_code: int,
    executables: dict[str, dict[str, Any]],
    bound_files: dict[str, dict[str, Any]],
    dynamic_argv_uid: int,
    dynamic_argv_gid: int,
    generated_directory: Path,
    mutable_outputs: frozenset[str],
) -> tuple[tuple[int, int], dict[str, Any], int]:
    if not isinstance(events, list) or not events or len(events) > MAX_EVENTS:
        fail("closed event graph count is invalid")
    root_pid, root_start, _ = process_key(root_value, "receipt root")
    root_key = (root_pid, root_start)
    tasks: dict[tuple[int, int], TaskAudit] = {}
    root_first_exec: dict[str, Any] | None = None
    generated_seen: dict[str, dict[str, Any]] = {}
    for sequence, raw_event in enumerate(events):
        if not isinstance(raw_event, dict):
            fail("event is not an object")
        if raw_event.get("sequence") != sequence:
            fail("event sequence is not contiguous")
        kind = raw_event.get("kind")
        if kind == "root":
            event = require_exact_keys(
                raw_event,
                ("sequence", "kind", "process", "parent"),
                "root event",
            )
            if sequence != 0 or tasks:
                fail("root event is not unique and first")
            pid, start, _ = process_key(event["process"], "root process")
            parent_pid, parent_start, _ = process_key(
                event["parent"],
                "root parent",
            )
            key = (pid, start)
            if key != root_key or key == (parent_pid, parent_start):
                fail("root event identity mismatch")
            tasks[key] = TaskAudit(parent=(parent_pid, parent_start))
            continue
        process_value = raw_event.get("process")
        if kind == "fork":
            event = require_exact_keys(
                raw_event,
                (
                    "sequence",
                    "kind",
                    "forkKind",
                    "parent",
                    "parentGeneration",
                    "child",
                ),
                "fork event",
            )
            parent_pid, parent_start, _ = process_key(
                event["parent"],
                "fork parent",
            )
            child_pid, child_start, _ = process_key(
                event["child"],
                "fork child",
            )
            parent_key = (parent_pid, parent_start)
            child_key = (child_pid, child_start)
            parent = tasks.get(parent_key)
            parent_generation = canonical_uint(
                event["parentGeneration"],
                "fork parent generation",
            )
            if (
                event["forkKind"] not in ("fork", "vfork", "clone")
                or parent is None
                or parent.closed
                or parent.generation != parent_generation
                or child_key in tasks
                or sum(not observed.closed for observed in tasks.values())
                >= MAX_TASKS
            ):
                fail("fork event does not extend live task graph")
            tasks[child_key] = TaskAudit(parent=parent_key)
            continue
        if kind == "exec":
            pid, start, generation = process_key(
                process_value,
                "exec process",
                generation=True,
            )
        else:
            pid, start, _ = process_key(process_value, f"{kind} process")
            generation = None
        key = (pid, start)
        task = tasks.get(key)
        if task is None or task.closed:
            fail(f"{kind} event references a non-live task")
        if kind == "exec_attempt":
            event = require_exact_keys(
                raw_event,
                (
                    "sequence",
                    "kind",
                    "process",
                    "nextGeneration",
                    "requestedPathFshex",
                    "executable",
                    "argvSha256",
                    "argvCount",
                    "argvBytes",
                    "argvFileBindings",
                ),
                "exec attempt event",
            )
            next_generation = canonical_uint(
                event["nextGeneration"],
                "exec next generation",
            )
            argv_count = canonical_uint(
                event["argvCount"],
                "exec attempt argvCount",
                MAX_ARGV_COUNT,
            )
            canonical_uint(
                event["argvBytes"],
                "exec attempt argvBytes",
                MAX_ARGV_BYTES,
            )
            canonical_sha256(
                event["argvSha256"],
                "exec attempt argvSha256",
            )
            canonical_path_from_fshex(
                event["requestedPathFshex"],
                "exec attempt requested path",
            )
            attempt_executable = event["executable"]
            if attempt_executable is not None:
                validate_event_identity(
                    attempt_executable,
                    "exec attempt executable",
                    executables,
                    bound_files,
                    executable=True,
                )
                if (
                    attempt_executable["pathFshex"]
                    != event["requestedPathFshex"]
                ):
                    fail(
                        "exec attempt identity differs from requested path"
                    )
            validate_argv_bindings(
                event["argvFileBindings"],
                "exec attempt argv bindings",
                argv_count,
                executables,
                bound_files,
                dynamic_argv_uid,
                dynamic_argv_gid,
                generated_directory,
                mutable_outputs,
                generated_seen,
            )
            if task.pending is not None or next_generation != task.generation + 1:
                fail("exec attempt generation is invalid")
            task.pending = event
            if key == root_key and task.generation == 0:
                if root_first_exec is not None:
                    fail("root initial exec attempt is duplicated")
                root_first_exec = event
        elif kind == "exec":
            event = require_exact_keys(
                raw_event,
                (
                    "sequence",
                    "kind",
                    "process",
                    "lineageParent",
                    "currentPpid",
                    "currentParent",
                    "executable",
                    "argvSha256",
                    "argvCount",
                    "argvBytes",
                    "argvFileBindings",
                ),
                "exec event",
            )
            pending = task.pending
            if pending is None or generation != task.generation + 1:
                fail("exec event is missing exact attempt")
            parent_pid, parent_start, _ = process_key(
                event["lineageParent"],
                "exec lineage parent",
            )
            current_ppid = canonical_uint(
                event["currentPpid"],
                "exec currentPpid",
            )
            if current_ppid <= 0:
                fail("exec currentPpid is invalid")
            current_parent = event["currentParent"]
            if current_parent is not None:
                current_parent_pid, _start, _ = process_key(
                    current_parent,
                    "exec current parent",
                )
                if current_parent_pid != current_ppid:
                    fail("exec current parent/ppid mismatch")
            validate_event_identity(
                event["executable"],
                "exec executable",
                executables,
                bound_files,
                executable=True,
            )
            argv_count = canonical_uint(
                event["argvCount"],
                "exec argvCount",
                MAX_ARGV_COUNT,
            )
            canonical_uint(
                event["argvBytes"],
                "exec argvBytes",
                MAX_ARGV_BYTES,
            )
            canonical_sha256(event["argvSha256"], "exec argvSha256")
            validate_argv_bindings(
                event["argvFileBindings"],
                "exec argv bindings",
                argv_count,
                executables,
                bound_files,
                dynamic_argv_uid,
                dynamic_argv_gid,
                generated_directory,
                mutable_outputs,
                generated_seen,
            )
            if (
                (parent_pid, parent_start) != task.parent
                or pending["executable"] is None
                or event["executable"] != pending["executable"]
                or event["argvSha256"] != pending["argvSha256"]
                or event["argvCount"] != pending["argvCount"]
                or event["argvBytes"] != pending["argvBytes"]
                or event["argvFileBindings"] != pending["argvFileBindings"]
            ):
                fail("exec event differs from its exact attempt")
            task.generation = generation
            task.pending = None
        elif kind == "exec_failed":
            event = require_exact_keys(
                raw_event,
                (
                    "sequence",
                    "kind",
                    "process",
                    "attemptedGeneration",
                    "errno",
                    "requestedPathFshex",
                    "executable",
                    "argvSha256",
                ),
                "exec failed event",
            )
            pending = task.pending
            attempted = canonical_uint(
                event["attemptedGeneration"],
                "exec failed generation",
            )
            error_number = canonical_uint(event["errno"], "exec failed errno")
            canonical_path_from_fshex(
                event["requestedPathFshex"],
                "exec failed requested path",
            )
            failed_executable = event["executable"]
            if failed_executable is not None:
                validate_event_identity(
                    failed_executable,
                    "exec failed executable",
                    executables,
                    bound_files,
                    executable=True,
                )
            canonical_sha256(
                event["argvSha256"],
                "exec failed argvSha256",
            )
            if (
                pending is None
                or attempted != task.generation + 1
                or error_number <= 0
                or event["requestedPathFshex"]
                != pending["requestedPathFshex"]
                or event["executable"] != pending["executable"]
                or event["argvSha256"] != pending["argvSha256"]
                or (
                    pending["executable"] is None
                    and error_number != errno.ENOENT
                )
            ):
                fail("failed exec does not close exact attempt")
            task.pending = None
        elif kind == "signal":
            event = require_exact_keys(
                raw_event,
                ("sequence", "kind", "process", "signal"),
                "signal event",
            )
            if canonical_uint(event["signal"], "signal number") <= 0:
                fail("signal event number is invalid")
        elif kind == "exit_prepare":
            event = require_exact_keys(
                raw_event,
                (
                    "sequence",
                    "kind",
                    "process",
                    "generation",
                    "waitStatus",
                ),
                "exit prepare event",
            )
            observed_generation = canonical_uint(
                event["generation"],
                "exit prepare generation",
            )
            wait_status = canonical_uint(
                event["waitStatus"],
                "exit prepare waitStatus",
                0xFFFF,
            )
            if (
                task.pending is not None
                or task.exit_prepared is not None
                or observed_generation != task.generation
            ):
                fail("exit prepare event is invalid")
            task.exit_prepared = wait_status
        elif kind == "exit":
            event = require_exact_keys(
                raw_event,
                (
                    "sequence",
                    "kind",
                    "process",
                    "generation",
                    "exitCode",
                    "signal",
                ),
                "exit event",
            )
            observed_generation = canonical_uint(
                event["generation"],
                "exit generation",
            )
            exit_code = event["exitCode"]
            signal_number = canonical_uint(event["signal"], "exit signal", 255)
            if (
                type(exit_code) is not int
                or exit_code < -1
                or exit_code > 255
                or task.pending is not None
                or task.exit_prepared is None
                or observed_generation != task.generation
                or not wait_status_matches(
                    task.exit_prepared,
                    exit_code,
                    signal_number,
                )
            ):
                fail("exit event is invalid")
            task.closed = True
            if key == root_key and (
                signal_number != 0 or exit_code != actual_root_exit_code
            ):
                fail("root exit event differs from receipt actual exit")
        else:
            fail(f"closed event graph contains unknown kind: {kind}")
    if (
        root_key not in tasks
        or root_first_exec is None
        or any(not task.closed for task in tasks.values())
    ):
        fail("closed event graph has live or missing tasks")
    return root_key, root_first_exec, len(generated_seen)


def parse_expected_exit_code(raw: str) -> int:
    if (
        not raw
        or any(char < "0" or char > "9" for char in raw)
        or (len(raw) > 1 and raw.startswith("0"))
    ):
        raise argparse.ArgumentTypeError(
            "expected exit code must be canonical decimal 0..255"
        )
    value = int(raw)
    if value > 255:
        raise argparse.ArgumentTypeError(
            "expected exit code must be canonical decimal 0..255"
        )
    return value


def validate_receipt(
    *,
    receipt_path: Path,
    manifest_path: Path,
    expected_producer_path: Path,
    expected_producer_sha256: str,
    expected_root_exit_code: int,
    command: Sequence[str],
) -> ValidatedReceipt:
    if not command:
        fail("expected command argv is empty")
    expected_producer_path = exact_path(
        expected_producer_path,
        "expected producer",
    )
    manifest_path = exact_path(manifest_path, "expected manifest")
    receipt_path = exact_path(receipt_path, "ledger receipt")
    expected_producer_sha256 = canonical_sha256(
        expected_producer_sha256,
        "expected producer sha256",
    )
    canonical_uint(
        expected_root_exit_code,
        "expected root exit code",
        255,
    )
    command_path = exact_path(Path(command[0]), "expected root command")
    command_bytes = tuple(os.fsencode(item) for item in command)
    if (
        len(command_bytes) > MAX_ARGV_COUNT
        or sum(len(item) + 1 for item in command_bytes) > MAX_ARGV_BYTES
    ):
        fail("expected command argv exceeds contract")

    (
        executables,
        bound_files,
        dynamic_argv_uid,
        dynamic_argv_gid,
        generated_directory,
        mutable_outputs,
        manifest_sha256,
    ) = load_manifest(manifest_path)
    command_identity = executables.get(os.fsencode(command_path).hex())
    if command_identity is None:
        fail("expected root command is outside immutable manifest")

    value, receipt_raw, _receipt_info = parse_canonical_json_file(
        receipt_path,
        "ledger receipt",
        MAX_RECEIPT_BYTES,
    )
    receipt = require_exact_keys(
        value,
        ("payload", "payloadSha256"),
        "ledger receipt",
    )
    payload = require_exact_keys(
        receipt["payload"],
        (
            "schema",
            "status",
            "applicability",
            "producer",
            "manifest",
            "ptraceOptions",
            "ptraceOptionMask",
            "limits",
            "commandArgvSha256",
            "root",
            "expectedRootExitCode",
            "actualRootExitCode",
            "rootExitCodeContractStatus",
            "eventCount",
            "eventsSha256",
            "events",
        ),
        "ledger payload",
    )
    payload_sha256 = canonical_sha256(
        receipt["payloadSha256"],
        "payload sha256",
    )
    if sha256_bytes(canonical_json(payload)) != payload_sha256:
        fail("ledger payload sha256 mismatch")
    if (
        payload["schema"] != RECEIPT_SCHEMA
        or payload["status"] != PROOF_STATUS
        or payload["applicability"] != APPLICABILITY
    ):
        fail("ledger payload schema/status/applicability mismatch")

    producer_path, producer_identity = validate_current_identity(
        payload["producer"],
        "ledger producer",
        executable=False,
    )
    if (
        producer_path != expected_producer_path
        or producer_identity["sha256"] != expected_producer_sha256
    ):
        fail("ledger producer differs from caller authority")

    manifest_receipt = require_exact_keys(
        payload["manifest"],
        (
            "pathFshex",
            "sha256",
            "executableCount",
            "boundArgvFileCount",
            "generatedArgvFileCount",
            "mutableOutputPathCount",
        ),
        "ledger manifest binding",
    )
    manifest_receipt_path = path_from_fshex(
        manifest_receipt["pathFshex"],
        "ledger manifest binding",
    )
    if (
        manifest_receipt_path != manifest_path
        or canonical_sha256(
            manifest_receipt["sha256"],
            "ledger manifest sha256",
        )
        != manifest_sha256
        or canonical_uint(
            manifest_receipt["executableCount"],
            "ledger manifest executableCount",
            512,
        )
        != len(executables)
        or canonical_uint(
            manifest_receipt["boundArgvFileCount"],
            "ledger manifest boundArgvFileCount",
            512,
        )
        != len(bound_files)
        or canonical_uint(
            manifest_receipt["mutableOutputPathCount"],
            "ledger manifest mutableOutputPathCount",
            MAX_MUTABLE_OUTPUT_PATHS,
        )
        != len(mutable_outputs)
    ):
        fail("ledger manifest binding mismatch")

    limits = require_exact_keys(
        payload["limits"],
        (
            "maxEvents",
            "maxTasks",
            "maxArgvCount",
            "maxArgvBytes",
            "maxArgvFileBindings",
            "maxEventJsonBytes",
            "maxOutputBytes",
        ),
        "ledger limits",
    )
    if limits != {
        "maxEvents": MAX_EVENTS,
        "maxTasks": MAX_TASKS,
        "maxArgvCount": MAX_ARGV_COUNT,
        "maxArgvBytes": MAX_ARGV_BYTES,
        "maxArgvFileBindings": MAX_ARGV_FILE_BINDINGS,
        "maxEventJsonBytes": MAX_EVENT_JSON_BYTES,
        "maxOutputBytes": MAX_OUTPUT_BYTES,
    }:
        fail("ledger limits mismatch")
    if (
        payload["ptraceOptions"] != list(PTRACE_OPTION_NAMES)
        or payload["ptraceOptionMask"] != PTRACE_OPTION_MASK
    ):
        fail("ledger ptrace option contract mismatch")

    expected_in_receipt = canonical_uint(
        payload["expectedRootExitCode"],
        "receipt expected root exit",
        255,
    )
    actual_in_receipt = canonical_uint(
        payload["actualRootExitCode"],
        "receipt actual root exit",
        255,
    )
    if (
        expected_in_receipt != expected_root_exit_code
        or actual_in_receipt != expected_root_exit_code
        or payload["rootExitCodeContractStatus"] != EXIT_CONTRACT_STATUS
    ):
        fail("receipt root exit contract mismatch")
    command_argv_sha256 = framed_sha256(command_bytes)
    if (
        canonical_sha256(
            payload["commandArgvSha256"],
            "receipt command argv sha256",
        )
        != command_argv_sha256
    ):
        fail("receipt command argv differs from caller authority")

    events = payload["events"]
    event_count = canonical_uint(
        payload["eventCount"],
        "receipt eventCount",
        MAX_EVENTS,
    )
    if not isinstance(events, list) or event_count != len(events):
        fail("receipt event count mismatch")
    event_raw = canonical_json(events)
    if (
        len(event_raw) > MAX_EVENT_JSON_BYTES
        or canonical_sha256(
            payload["eventsSha256"],
            "receipt events sha256",
        )
        != sha256_bytes(event_raw)
    ):
        fail("receipt event ledger sha256 mismatch")
    _root_key, root_exec, generated_file_count = validate_closed_event_graph(
        events,
        payload["root"],
        actual_in_receipt,
        executables,
        bound_files,
        dynamic_argv_uid,
        dynamic_argv_gid,
        generated_directory,
        mutable_outputs,
    )
    if canonical_uint(
        manifest_receipt["generatedArgvFileCount"],
        "ledger manifest generatedArgvFileCount",
        MAX_GENERATED_ARGV_FILES,
    ) != generated_file_count:
        fail("ledger generated argv file count mismatch")
    expected_argv_bytes = sum(len(item) + 1 for item in command_bytes)
    if (
        root_exec["executable"] != command_identity
        or root_exec["argvSha256"] != command_argv_sha256
        or root_exec["argvCount"] != len(command_bytes)
        or root_exec["argvBytes"] != expected_argv_bytes
    ):
        fail("root initial exec event differs from expected command")
    root_bindings = {
        binding["index"]: binding
        for binding in root_exec["argvFileBindings"]
    }
    for binding in root_bindings.values():
        index = binding["index"]
        argument_path = Path(command[index])
        if not argument_path.is_absolute():
            fail("root bound argv path is not absolute")
        if exact_path(argument_path, "root bound argv") != path_from_fshex(
            binding["pathFshex"],
            "root bound argv identity",
        ):
            fail("root bound argv identity differs from expected command")
    for index, raw_argument in enumerate(command[1:], start=1):
        encoded_argument = os.fsencode(raw_argument)
        if encoded_argument.startswith(b"-"):
            continue
        argument_path = Path(raw_argument)
        if not argument_path.is_absolute():
            continue
        try:
            argument_info = argument_path.lstat()
        except FileNotFoundError:
            continue
        except OSError as exc:
            raise ValidationError("root argv path stat failed") from exc
        if stat.S_ISLNK(argument_info.st_mode):
            fail("root argv names a symlink")
        if stat.S_ISDIR(argument_info.st_mode):
            if exact_path(argument_path, "root argv directory") != argument_path:
                fail("root argv directory contains a symlink or alias")
            continue
        if not stat.S_ISREG(argument_info.st_mode):
            fail("root argv names a non-directory non-regular path")
        if exact_path(argument_path, "root argv file") != argument_path:
            fail("root argv file contains a symlink or alias")
        binding = root_bindings.get(index)
        if binding is None:
            if os.fsencode(argument_path).hex() in mutable_outputs:
                continue
            fail("root absolute regular argv file is not bound")

    return ValidatedReceipt(
        receipt_sha256=sha256_bytes(receipt_raw),
        payload_sha256=payload_sha256,
        manifest_sha256=manifest_sha256,
        producer_sha256=producer_identity["sha256"],
        expected_root_exit_code=expected_in_receipt,
        actual_root_exit_code=actual_in_receipt,
        event_count=event_count,
    )


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Strictly validate a descendant-exec ledger receipt.",
    )
    parser.add_argument("--receipt", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--expected-producer-path", required=True)
    parser.add_argument("--expected-producer-sha256", required=True)
    parser.add_argument(
        "--expected-exit-code",
        type=parse_expected_exit_code,
        required=True,
    )
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args(argv)
    if args.command and args.command[0] == "--":
        args.command = args.command[1:]
    if not args.command:
        parser.error("expected command after -- is required")
    return args


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    try:
        result = validate_receipt(
            receipt_path=Path(args.receipt),
            manifest_path=Path(args.manifest),
            expected_producer_path=Path(args.expected_producer_path),
            expected_producer_sha256=args.expected_producer_sha256,
            expected_root_exit_code=args.expected_exit_code,
            command=args.command,
        )
    except (ValidationError, OSError) as exc:
        print("descendant_exec_ledger_receipt_validation_status=HARD_RED", file=sys.stderr)
        print(
            "descendant_exec_ledger_receipt_validation_error="
            + str(exc).replace("\n", " ")[:4096],
            file=sys.stderr,
        )
        return 1
    print("descendant_exec_ledger_receipt_validation_status=PROVED")
    print(f"receipt_sha256={result.receipt_sha256}")
    print(f"payload_sha256={result.payload_sha256}")
    print(f"manifest_sha256={result.manifest_sha256}")
    print(f"producer_sha256={result.producer_sha256}")
    print(f"expected_root_exit_code={result.expected_root_exit_code}")
    print(f"actual_root_exit_code={result.actual_root_exit_code}")
    print(f"event_count={result.event_count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
