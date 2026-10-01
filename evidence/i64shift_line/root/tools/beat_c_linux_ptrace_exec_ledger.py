#!/usr/bin/env python3
"""Produce a fail-closed Linux ptrace descendant exec ledger."""

from __future__ import annotations

import argparse
import ctypes
import errno
import hashlib
import json
import os
import platform
import signal
import stat
import struct
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, NoReturn, Sequence

sys.dont_write_bytecode = True

SCHEMA = "cheng.linux_ptrace_exec_ledger"
MANIFEST_SCHEMA = "cheng.linux_ptrace_exec_manifest"
APPLICABILITY = "native_linux_parent_owned_ptrace_only"
PROOF_STATUS = "PROVED"
HARD_RED_STATUS = "HARD_RED"

MAX_EVENTS = 32_768
MAX_TASKS = 4_096
MAX_MANIFEST_EXECUTABLES = 512
MAX_MANIFEST_BOUND_FILES = 512
MAX_MANIFEST_MUTABLE_OUTPUT_PATHS = 64
MAX_GENERATED_ARGV_FILES = 512
MAX_MANIFEST_BYTES = 4 * 1024 * 1024
MAX_EXECUTABLE_BYTES = 512 * 1024 * 1024
MAX_BOUND_FILE_BYTES = 512 * 1024 * 1024
MAX_ARGV_COUNT = 4_096
MAX_ARGV_BYTES = 1024 * 1024
MAX_ARGV_FILE_BINDINGS = 512
MAX_PATH_BYTES = 16 * 1024
MAX_OUTPUT_BYTES = 32 * 1024 * 1024
MAX_EVENT_JSON_BYTES = 16 * 1024 * 1024
MAX_TIMEOUT_SECONDS = 86_400
HASH_CHUNK_BYTES = 1024 * 1024

ARGV_AUTHORITY_IMMUTABLE = "immutable_manifest"
ARGV_AUTHORITY_MUTABLE_OUTPUT = "mutable_output"
ARGV_AUTHORITY_GENERATED = "generated_argv"

WALL = 0x40000000

PTRACE_TRACEME = 0
PTRACE_PEEKDATA = 2
PTRACE_CONT = 7
PTRACE_KILL = 8
PTRACE_SYSCALL = 24
PTRACE_SETOPTIONS = 0x4200
PTRACE_GETEVENTMSG = 0x4201
PTRACE_GET_SYSCALL_INFO = 0x420E

PTRACE_O_TRACESYSGOOD = 0x00000001
PTRACE_O_TRACEFORK = 0x00000002
PTRACE_O_TRACEVFORK = 0x00000004
PTRACE_O_TRACECLONE = 0x00000008
PTRACE_O_TRACEEXEC = 0x00000010
PTRACE_O_TRACEEXIT = 0x00000040
PTRACE_O_TRACESECCOMP = 0x00000080
PTRACE_O_EXITKILL = 0x00100000

PTRACE_EVENT_FORK = 1
PTRACE_EVENT_VFORK = 2
PTRACE_EVENT_CLONE = 3
PTRACE_EVENT_EXEC = 4
PTRACE_EVENT_EXIT = 6
PTRACE_EVENT_SECCOMP = 7

PTRACE_SYSCALL_INFO_ENTRY = 1
PTRACE_SYSCALL_INFO_EXIT = 2
PTRACE_SYSCALL_INFO_SECCOMP = 3
SYSCALL_STOP_SIGNAL = signal.SIGTRAP | 0x80

REQUIRED_PTRACE_OPTIONS = (
    ("PTRACE_O_TRACEFORK", PTRACE_O_TRACEFORK),
    ("PTRACE_O_TRACEVFORK", PTRACE_O_TRACEVFORK),
    ("PTRACE_O_TRACECLONE", PTRACE_O_TRACECLONE),
    ("PTRACE_O_TRACEEXEC", PTRACE_O_TRACEEXEC),
    ("PTRACE_O_TRACEEXIT", PTRACE_O_TRACEEXIT),
    ("PTRACE_O_EXITKILL", PTRACE_O_EXITKILL),
)
SUPPORT_PTRACE_OPTIONS = (
    ("PTRACE_O_TRACESYSGOOD", PTRACE_O_TRACESYSGOOD),
    ("PTRACE_O_TRACESECCOMP", PTRACE_O_TRACESECCOMP),
)
PTRACE_OPTION_NAMES = tuple(
    name for name, _value in (*REQUIRED_PTRACE_OPTIONS, *SUPPORT_PTRACE_OPTIONS)
)
PTRACE_OPTION_MASK = sum(
    value for _name, value in (*REQUIRED_PTRACE_OPTIONS, *SUPPORT_PTRACE_OPTIONS)
)

PR_SET_PDEATHSIG = 1
PR_SET_NO_NEW_PRIVS = 38
PR_SET_SECCOMP = 22
SECCOMP_MODE_FILTER = 2

BPF_LD_W_ABS = 0x20
BPF_JMP_JEQ_K = 0x15
BPF_JMP_JSET_K = 0x45
BPF_RET_K = 0x06
SECCOMP_DATA_NR_OFFSET = 0
SECCOMP_DATA_ARCH_OFFSET = 4
SECCOMP_RET_KILL_PROCESS = 0x80000000
SECCOMP_RET_TRACE = 0x7FF00000
SECCOMP_RET_ALLOW = 0x7FFF0000
X32_SYSCALL_BIT = 0x40000000

AT_FDCWD = -100

ARCH_CONTRACTS = {
    "x86_64": {
        "audit_arch": 0xC000003E,
        "elf_machine": 62,
        "execve": 59,
        "execveat": 322,
        "reject_x32": True,
    },
    "aarch64": {
        "audit_arch": 0xC00000B7,
        "elf_machine": 183,
        "execve": 221,
        "execveat": 281,
        "reject_x32": False,
    },
}

FORK_EVENT_NAMES = {
    PTRACE_EVENT_FORK: "fork",
    PTRACE_EVENT_VFORK: "vfork",
    PTRACE_EVENT_CLONE: "clone",
}

LIBC = ctypes.CDLL(None, use_errno=True)
PTRACE_FUNCTION = getattr(LIBC, "ptrace", None)
PRCTL_FUNCTION = getattr(LIBC, "prctl", None)
if PTRACE_FUNCTION is not None:
    PTRACE_FUNCTION.restype = ctypes.c_long
if PRCTL_FUNCTION is not None:
    PRCTL_FUNCTION.restype = ctypes.c_int


class LedgerError(RuntimeError):
    pass


class SockFilter(ctypes.Structure):
    _fields_ = [
        ("code", ctypes.c_ushort),
        ("jt", ctypes.c_ubyte),
        ("jf", ctypes.c_ubyte),
        ("k", ctypes.c_uint32),
    ]


class SockFprog(ctypes.Structure):
    _fields_ = [
        ("length", ctypes.c_ushort),
        ("filters", ctypes.POINTER(SockFilter)),
    ]


@dataclass(frozen=True)
class FileIdentity:
    path: Path
    path_fshex: str
    sha256: str
    device: int
    inode: int
    size: int
    mode: int
    uid: int
    gid: int
    link_count: int
    mtime_ns: int
    ctime_ns: int

    def receipt(self) -> dict[str, Any]:
        return {
            "pathFshex": self.path_fshex,
            "sha256": self.sha256,
            "device": self.device,
            "inode": self.inode,
            "size": self.size,
            "mode": self.mode,
            "uid": self.uid,
            "gid": self.gid,
        }

    def manifest_entry(self) -> dict[str, Any]:
        return self.receipt()


@dataclass
class HeldFile:
    identity: FileIdentity
    fd: int

    def close(self) -> None:
        if self.fd >= 0:
            os.close(self.fd)
            self.fd = -1


@dataclass
class GeneratedFileState:
    physical_identity: FileIdentity
    latest_identity: FileIdentity
    generation: int


@dataclass
class Manifest:
    path: Path
    sha256: str
    executables: dict[str, HeldFile]
    bound_files: dict[str, HeldFile]
    dynamic_argv_uid: int
    dynamic_argv_gid: int
    generated_argv_directory: Path
    generated_argv_directory_fd: int
    generated_argv_directory_identity: tuple[int, int, int, int, int]
    generated_files: dict[str, GeneratedFileState]
    mutable_output_paths: frozenset[str]

    def close(self) -> None:
        errors: list[str] = []
        for held in (*self.executables.values(), *self.bound_files.values()):
            try:
                held.close()
            except OSError as exc:
                errors.append(str(exc))
        if self.generated_argv_directory_fd >= 0:
            try:
                os.close(self.generated_argv_directory_fd)
            except OSError as exc:
                errors.append(str(exc))
            self.generated_argv_directory_fd = -1
        if errors:
            raise LedgerError("manifest descriptor close failed: " + "; ".join(errors))


@dataclass(frozen=True)
class ProcessIdentity:
    pid: int
    starttime_ticks: int

    def receipt(self) -> dict[str, int]:
        return {
            "pid": self.pid,
            "starttimeTicks": self.starttime_ticks,
        }


@dataclass(frozen=True)
class PendingExec:
    syscall_number: int
    requested_path_fshex: str
    requested: FileIdentity | None
    argv_sha256: str
    argv_count: int
    argv_bytes: int
    argv_file_bindings: tuple[dict[str, Any], ...]


@dataclass
class TaskState:
    identity: ProcessIdentity
    lineage_parent: ProcessIdentity
    generation: int = 0
    awaiting_initial_stop: bool = False
    pending_exec: PendingExec | None = None
    exit_prepared_status: int | None = None


@dataclass
class TraceResult:
    root: ProcessIdentity
    root_exit_code: int
    events: list[dict[str, Any]]


@dataclass
class ClosedTaskAudit:
    parent: tuple[int, int]
    generation: int = 0
    pending: dict[str, Any] | None = None
    exit_prepared: int | None = None
    closed: bool = False


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


def exact_path_from_fshex(raw: Any, label: str) -> Path:
    if not isinstance(raw, str) or not raw or raw.lower() != raw:
        raise LedgerError(f"{label} pathFshex is not canonical lowercase hex")
    try:
        path_raw = bytes.fromhex(raw)
    except ValueError as exc:
        raise LedgerError(f"{label} pathFshex is invalid") from exc
    if not path_raw or b"\0" in path_raw or path_raw.hex() != raw:
        raise LedgerError(f"{label} pathFshex is not exact")
    path = Path(os.fsdecode(path_raw))
    if not path.is_absolute():
        raise LedgerError(f"{label} path is not absolute")
    try:
        resolved = path.resolve(strict=True)
    except OSError as exc:
        raise LedgerError(f"{label} path cannot be resolved") from exc
    if resolved != path:
        raise LedgerError(f"{label} path contains a symlink or alias")
    return path


def exact_absent_path_from_fshex(raw: Any, label: str) -> Path:
    if not isinstance(raw, str) or not raw or raw.lower() != raw:
        raise LedgerError(f"{label} pathFshex is not canonical lowercase hex")
    try:
        path_raw = bytes.fromhex(raw)
    except ValueError as exc:
        raise LedgerError(f"{label} pathFshex is invalid") from exc
    if not path_raw or b"\0" in path_raw or path_raw.hex() != raw:
        raise LedgerError(f"{label} pathFshex is not exact")
    path = Path(os.fsdecode(path_raw))
    if (
        not path.is_absolute()
        or path == Path("/")
        or ".." in path.parts
        or Path(os.path.normpath(os.fsdecode(path_raw))) != path
    ):
        raise LedgerError(f"{label} path is not canonical absolute")
    existing_ancestor = path.parent
    while True:
        try:
            ancestor_info = existing_ancestor.lstat()
        except FileNotFoundError:
            parent = existing_ancestor.parent
            if parent == existing_ancestor:
                raise LedgerError(
                    f"{label} existing ancestor cannot be established"
                )
            existing_ancestor = parent
            continue
        except OSError as exc:
            raise LedgerError(
                f"{label} existing ancestor cannot be established"
            ) from exc
        if not stat.S_ISDIR(ancestor_info.st_mode):
            raise LedgerError(f"{label} existing ancestor is not a directory")
        try:
            resolved_ancestor = existing_ancestor.resolve(strict=True)
        except OSError as exc:
            raise LedgerError(
                f"{label} existing ancestor cannot be resolved"
            ) from exc
        if resolved_ancestor != existing_ancestor:
            raise LedgerError(
                f"{label} existing ancestor contains a symlink or alias"
            )
        break
    try:
        path.lstat()
    except FileNotFoundError:
        return path
    except OSError as exc:
        raise LedgerError(f"{label} absence cannot be established") from exc
    raise LedgerError(f"{label} existed before trace")


def stat_signature(info: os.stat_result) -> tuple[int, ...]:
    return (
        info.st_dev,
        info.st_ino,
        info.st_mode,
        info.st_uid,
        info.st_gid,
        info.st_nlink,
        info.st_size,
        info.st_mtime_ns,
        info.st_ctime_ns,
    )


def hash_open_fd(fd: int, size: int, label: str) -> str:
    try:
        os.lseek(fd, 0, os.SEEK_SET)
    except OSError as exc:
        raise LedgerError(f"{label} is not seekable") from exc
    digest = hashlib.sha256()
    remaining = size
    while remaining:
        chunk = os.read(fd, min(HASH_CHUNK_BYTES, remaining))
        if not chunk:
            raise LedgerError(f"{label} short read")
        digest.update(chunk)
        remaining -= len(chunk)
    if os.read(fd, 1):
        raise LedgerError(f"{label} grew during read")
    return digest.hexdigest()


def read_capability_xattr(path: Path, label: str) -> bytes:
    try:
        return os.getxattr(path, "security.capability")
    except AttributeError as exc:
        raise LedgerError(f"{label} capability API is unavailable") from exc
    except OSError as exc:
        absent = {errno.ENODATA}
        if hasattr(errno, "ENOATTR"):
            absent.add(errno.ENOATTR)
        if exc.errno in absent:
            return b""
        raise LedgerError(f"{label} capability read failed") from exc


def validate_nonprivileged_mode(info: os.stat_result, path: Path, label: str) -> None:
    if info.st_mode & (stat.S_ISUID | stat.S_ISGID):
        raise LedgerError(f"{label} has setuid or setgid mode")
    if read_capability_xattr(path, label):
        raise LedgerError(f"{label} has file capabilities")
    if os.geteuid() == 0:
        raise LedgerError("root execution is forbidden")
    # The mode bits are not authoritative for bind mounts: a read-only
    # mount rejects writes even when the owner-write bit is set.  Ask the
    # kernel with the exact effective identity instead; the traced process
    # runs with empty capabilities, so this is the real write capability.
    if os.access(path, os.W_OK, effective_ids=True):
        raise LedgerError(f"{label} is writable by the tracing identity")


def validate_native_elf_header(raw: bytes, machine: str, label: str) -> None:
    contract = ARCH_CONTRACTS.get(machine)
    if contract is None:
        raise LedgerError(f"unsupported Linux architecture: {machine}")
    if len(raw) < 20 or raw[:4] != b"\x7fELF":
        raise LedgerError(f"{label} is not a native ELF executable")
    if raw[4] != 2 or raw[5] != 1:
        raise LedgerError(f"{label} is not little-endian ELF64")
    elf_machine = int.from_bytes(raw[18:20], "little")
    if elf_machine != contract["elf_machine"]:
        raise LedgerError(f"{label} ELF machine does not match tracer")


def open_stable_file(
    path: Path,
    label: str,
    *,
    max_bytes: int,
    executable: bool,
    hold: bool,
    allow_owner_write: bool = False,
) -> tuple[FileIdentity, int]:
    if not path.is_absolute():
        raise LedgerError(f"{label} path is not absolute")
    try:
        resolved = path.resolve(strict=True)
    except OSError as exc:
        raise LedgerError(f"{label} path cannot be resolved") from exc
    if resolved != path:
        raise LedgerError(f"{label} path contains a symlink or alias")
    try:
        before = os.stat(path, follow_symlinks=False)
    except OSError as exc:
        raise LedgerError(f"{label} stat failed") from exc
    if not stat.S_ISREG(before.st_mode):
        raise LedgerError(f"{label} is not a regular file")
    if before.st_size < 0 or before.st_size > max_bytes:
        raise LedgerError(f"{label} size exceeds contract")
    if executable and not before.st_mode & stat.S_IXUSR:
        raise LedgerError(f"{label} is not owner-executable")
    if allow_owner_write:
        if executable:
            raise LedgerError(f"{label} writable executable is forbidden")
        if before.st_mode & (stat.S_ISUID | stat.S_ISGID):
            raise LedgerError(f"{label} has setuid or setgid mode")
        if read_capability_xattr(path, label):
            raise LedgerError(f"{label} has file capabilities")
        if os.geteuid() == 0:
            raise LedgerError("root execution is forbidden")
    else:
        validate_nonprivileged_mode(before, path, label)
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0)
    if not hasattr(os, "O_NOFOLLOW"):
        raise LedgerError("O_NOFOLLOW is unavailable")
    flags |= os.O_NOFOLLOW
    try:
        fd = os.open(path, flags)
    except OSError as exc:
        raise LedgerError(f"{label} O_NOFOLLOW open failed") from exc
    keep_fd = -1
    try:
        opened = os.fstat(fd)
        if stat_signature(opened) != stat_signature(before):
            raise LedgerError(f"{label} changed before open")
        digest = hash_open_fd(fd, opened.st_size, label)
        after = os.fstat(fd)
        if stat_signature(after) != stat_signature(opened):
            raise LedgerError(f"{label} changed during hash")
        if executable:
            os.lseek(fd, 0, os.SEEK_SET)
            validate_native_elf_header(
                os.read(fd, 64),
                platform.machine(),
                label,
            )
        identity = FileIdentity(
            path=path,
            path_fshex=os.fsencode(path).hex(),
            sha256=digest,
            device=opened.st_dev,
            inode=opened.st_ino,
            size=opened.st_size,
            mode=opened.st_mode,
            uid=opened.st_uid,
            gid=opened.st_gid,
            link_count=opened.st_nlink,
            mtime_ns=opened.st_mtime_ns,
            ctime_ns=opened.st_ctime_ns,
        )
        if hold:
            keep_fd = fd
            fd = -1
        return identity, keep_fd
    finally:
        if fd >= 0:
            os.close(fd)


def require_exact_keys(value: dict[str, Any], keys: tuple[str, ...], label: str) -> None:
    if set(value) != set(keys):
        raise LedgerError(f"{label} keys are not exact")


def receipt_process_key(
    value: Any,
    label: str,
    *,
    generation: bool = False,
) -> tuple[int, int, int | None]:
    if not isinstance(value, dict):
        raise LedgerError(f"{label} process identity is not an object")
    keys = ("pid", "starttimeTicks", "generation") if generation else (
        "pid",
        "starttimeTicks",
    )
    require_exact_keys(value, keys, f"{label} process identity")
    pid = value["pid"]
    starttime = value["starttimeTicks"]
    observed_generation = value.get("generation")
    if (
        not isinstance(pid, int)
        or pid <= 0
        or not isinstance(starttime, int)
        or starttime <= 0
        or (
            generation
            and (
                not isinstance(observed_generation, int)
                or observed_generation <= 0
            )
        )
    ):
        raise LedgerError(f"{label} process identity is invalid")
    return pid, starttime, observed_generation


def validate_closed_event_ledger(
    events: list[dict[str, Any]],
    root: ProcessIdentity,
) -> None:
    if not events or len(events) > MAX_EVENTS:
        raise LedgerError("closed ledger event count is invalid")
    tasks: dict[tuple[int, int], ClosedTaskAudit] = {}
    root_key = (root.pid, root.starttime_ticks)
    for sequence, event in enumerate(events):
        if not isinstance(event, dict):
            raise LedgerError("closed ledger event is not an object")
        if event.get("sequence") != sequence:
            raise LedgerError("closed ledger sequence is not contiguous")
        kind = event.get("kind")
        if kind == "root":
            require_exact_keys(
                event,
                ("sequence", "kind", "process", "parent"),
                "root event",
            )
            if sequence != 0 or tasks:
                raise LedgerError("root event is not unique and first")
            pid, starttime, _generation = receipt_process_key(
                event["process"],
                "root",
            )
            parent_pid, parent_start, _parent_generation = receipt_process_key(
                event["parent"],
                "root parent",
            )
            key = (pid, starttime)
            if key != root_key or key == (parent_pid, parent_start):
                raise LedgerError("root event identity mismatch")
            tasks[key] = ClosedTaskAudit(parent=(parent_pid, parent_start))
            continue
        process_value = event.get("process")
        if kind == "fork":
            require_exact_keys(
                event,
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
            parent_pid, parent_start, _ = receipt_process_key(
                event["parent"],
                "fork parent",
            )
            child_pid, child_start, _ = receipt_process_key(
                event["child"],
                "fork child",
            )
            parent_key = (parent_pid, parent_start)
            child_key = (child_pid, child_start)
            parent_state = tasks.get(parent_key)
            if (
                event["forkKind"] not in FORK_EVENT_NAMES.values()
                or parent_state is None
                or parent_state.closed
                or parent_state.generation != event["parentGeneration"]
                or child_key in tasks
            ):
                raise LedgerError("fork event does not extend the live task graph")
            tasks[child_key] = ClosedTaskAudit(parent=parent_key)
            continue
        if kind == "exec":
            require_exact_keys(
                event,
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
            pid, starttime, generation = receipt_process_key(
                process_value,
                "exec",
                generation=True,
            )
        else:
            pid, starttime, _generation = receipt_process_key(
                process_value,
                str(kind),
            )
            generation = None
        key = (pid, starttime)
        state = tasks.get(key)
        if state is None or state.closed:
            raise LedgerError(f"{kind} event references a non-live task")
        if kind == "exec_attempt":
            require_exact_keys(
                event,
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
            if state.pending is not None or event["nextGeneration"] != (
                state.generation + 1
            ):
                raise LedgerError("exec attempt generation is invalid")
            requested_path = event["requestedPathFshex"]
            executable = event["executable"]
            if not isinstance(requested_path, str) or not requested_path:
                raise LedgerError("exec attempt requested path is invalid")
            if (
                executable is not None
                and (
                    not isinstance(executable, dict)
                    or executable.get("pathFshex") != requested_path
                )
            ):
                raise LedgerError(
                    "exec attempt identity differs from requested path"
                )
            state.pending = event
        elif kind == "exec":
            if state.pending is None or generation != state.generation + 1:
                raise LedgerError("exec event is missing its exact attempt")
            parent_pid, parent_start, _ = receipt_process_key(
                event["lineageParent"],
                "exec lineage parent",
            )
            attempt = state.pending
            if (
                (parent_pid, parent_start) != state.parent
                or attempt["executable"] is None
                or event["executable"] != attempt["executable"]
                or event["argvSha256"] != attempt["argvSha256"]
                or event["argvCount"] != attempt["argvCount"]
                or event["argvBytes"] != attempt["argvBytes"]
                or event["argvFileBindings"] != attempt["argvFileBindings"]
            ):
                raise LedgerError("exec event differs from its pre-exec attempt")
            if not isinstance(event["currentPpid"], int) or event["currentPpid"] <= 0:
                raise LedgerError("exec current ppid is invalid")
            current_parent = event["currentParent"]
            if current_parent is not None:
                current_parent_pid, _current_parent_start, _ = receipt_process_key(
                    current_parent,
                    "exec current parent",
                )
                if current_parent_pid != event["currentPpid"]:
                    raise LedgerError("exec current parent/ppid mismatch")
            state.generation = generation
            state.pending = None
        elif kind == "exec_failed":
            require_exact_keys(
                event,
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
            if (
                state.pending is None
                or event["attemptedGeneration"] != state.generation + 1
                or event["errno"] <= 0
                or event["requestedPathFshex"]
                != state.pending["requestedPathFshex"]
                or event["executable"] != state.pending["executable"]
                or event["argvSha256"] != state.pending["argvSha256"]
                or (
                    state.pending["executable"] is None
                    and event["errno"] != errno.ENOENT
                )
            ):
                raise LedgerError("failed exec does not close its exact attempt")
            state.pending = None
        elif kind == "signal":
            require_exact_keys(
                event,
                ("sequence", "kind", "process", "signal"),
                "signal event",
            )
            if not isinstance(event["signal"], int) or event["signal"] <= 0:
                raise LedgerError("signal event number is invalid")
        elif kind == "exit_prepare":
            require_exact_keys(
                event,
                (
                    "sequence",
                    "kind",
                    "process",
                    "generation",
                    "waitStatus",
                ),
                "exit prepare event",
            )
            if (
                state.pending is not None
                or state.exit_prepared is not None
                or event["generation"] != state.generation
                or not isinstance(event["waitStatus"], int)
            ):
                raise LedgerError("exit prepare event is invalid")
            state.exit_prepared = event["waitStatus"]
        elif kind == "exit":
            require_exact_keys(
                event,
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
            if (
                state.pending is not None
                or state.exit_prepared is None
                or event["generation"] != state.generation
                or not isinstance(event["exitCode"], int)
                or not isinstance(event["signal"], int)
                or (event["exitCode"] >= 0) == (event["signal"] != 0)
            ):
                raise LedgerError("exit event is not a closed terminal state")
            state.closed = True
        else:
            raise LedgerError(f"closed ledger contains unknown event kind: {kind}")
    if root_key not in tasks or any(not task.closed for task in tasks.values()):
        raise LedgerError("closed ledger has live or missing tasks")


def parse_manifest_entry(
    value: Any,
    label: str,
    *,
    executable: bool,
) -> HeldFile:
    if not isinstance(value, dict):
        raise LedgerError(f"{label} is not an object")
    keys = (
        "pathFshex",
        "sha256",
        "device",
        "inode",
        "size",
        "mode",
        "uid",
        "gid",
    )
    require_exact_keys(value, keys, label)
    path = exact_path_from_fshex(value["pathFshex"], label)
    identity, fd = open_stable_file(
        path,
        label,
        max_bytes=MAX_EXECUTABLE_BYTES if executable else MAX_BOUND_FILE_BYTES,
        executable=executable,
        hold=True,
    )
    expected = identity.manifest_entry()
    if value != expected:
        os.close(fd)
        raise LedgerError(f"{label} identity or bytes do not match manifest")
    return HeldFile(identity=identity, fd=fd)


def stable_read_limited(path: Path, label: str, max_bytes: int) -> tuple[bytes, str]:
    identity, fd = open_stable_file(
        path,
        label,
        max_bytes=max_bytes,
        executable=False,
        hold=True,
    )
    try:
        raw = b""
        os.lseek(fd, 0, os.SEEK_SET)
        chunks: list[bytes] = []
        remaining = identity.size
        while remaining:
            chunk = os.read(fd, min(HASH_CHUNK_BYTES, remaining))
            if not chunk:
                raise LedgerError(f"{label} short read")
            chunks.append(chunk)
            remaining -= len(chunk)
        raw = b"".join(chunks)
        return raw, identity.sha256
    finally:
        os.close(fd)


def load_manifest(path: Path) -> Manifest:
    raw, digest = stable_read_limited(path, "exec manifest", MAX_MANIFEST_BYTES)
    if not raw.endswith(b"\n"):
        raise LedgerError("exec manifest is not newline-terminated")
    try:
        value = json.loads(raw.decode("utf-8", "strict"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise LedgerError("exec manifest is not strict UTF-8 JSON") from exc
    if not isinstance(value, dict):
        raise LedgerError("exec manifest root is not an object")
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
    if canonical_json(value) + b"\n" != raw:
        raise LedgerError("exec manifest is not canonical JSON")
    if value["schema"] != MANIFEST_SCHEMA:
        raise LedgerError("exec manifest schema mismatch")
    executables_raw = value["executables"]
    bound_raw = value["boundArgvFiles"]
    dynamic_argv_uid = value["dynamicArgvUid"]
    dynamic_argv_gid = value["dynamicArgvGid"]
    if (
        type(dynamic_argv_uid) is not int
        or type(dynamic_argv_gid) is not int
        or dynamic_argv_uid <= 0
        or dynamic_argv_gid <= 0
        or dynamic_argv_uid != os.geteuid()
        or dynamic_argv_gid != os.getegid()
    ):
        raise LedgerError("exec manifest dynamic argv owner mismatch")
    generated_directory = exact_absent_path_from_fshex(
        value["generatedArgvDirectoryPathFshex"],
        "generated argv directory",
    )
    mutable_raw = value["mutableOutputPathFshexes"]
    if (
        not isinstance(executables_raw, list)
        or not executables_raw
        or len(executables_raw) > MAX_MANIFEST_EXECUTABLES
    ):
        raise LedgerError("exec manifest executable count is invalid")
    if (
        not isinstance(bound_raw, list)
        or len(bound_raw) > MAX_MANIFEST_BOUND_FILES
    ):
        raise LedgerError("exec manifest bound file count is invalid")
    if (
        not isinstance(mutable_raw, list)
        or len(mutable_raw) > MAX_MANIFEST_MUTABLE_OUTPUT_PATHS
        or mutable_raw != sorted(mutable_raw)
        or len(set(mutable_raw)) != len(mutable_raw)
    ):
        raise LedgerError("exec manifest mutable output paths are invalid")
    mutable_paths = frozenset(
        os.fsencode(exact_absent_path_from_fshex(
            raw_path,
            f"mutable output path {index}",
        )).hex()
        for index, raw_path in enumerate(mutable_raw)
    )
    if executables_raw != sorted(
        executables_raw,
        key=lambda item: item.get("pathFshex", "") if isinstance(item, dict) else "",
    ):
        raise LedgerError("exec manifest executables are not sorted")
    if bound_raw != sorted(
        bound_raw,
        key=lambda item: item.get("pathFshex", "") if isinstance(item, dict) else "",
    ):
        raise LedgerError("exec manifest bound files are not sorted")
    executables: dict[str, HeldFile] = {}
    bound_files: dict[str, HeldFile] = {}
    try:
        for index, entry in enumerate(executables_raw):
            held = parse_manifest_entry(
                entry,
                f"manifest executable {index}",
                executable=True,
            )
            key = held.identity.path_fshex
            if key in executables:
                held.close()
                raise LedgerError("duplicate manifest executable path")
            executables[key] = held
        for index, entry in enumerate(bound_raw):
            held = parse_manifest_entry(
                entry,
                f"manifest bound file {index}",
                executable=False,
            )
            key = held.identity.path_fshex
            if key in bound_files or key in executables:
                held.close()
                raise LedgerError("duplicate manifest path")
            bound_files[key] = held
        if (
            mutable_paths.intersection(executables)
            or mutable_paths.intersection(bound_files)
            or os.fsencode(generated_directory).hex() in mutable_paths
            or any(
                exact_absent_path_from_fshex(path_fshex, "mutable output path").parent
                == generated_directory
                for path_fshex in mutable_paths
            )
        ):
            raise LedgerError("exec manifest path authority domains overlap")
    except BaseException:
        for held in (*executables.values(), *bound_files.values()):
            held.close()
        raise
    return Manifest(
        path=path,
        sha256=digest,
        executables=executables,
        bound_files=bound_files,
        dynamic_argv_uid=dynamic_argv_uid,
        dynamic_argv_gid=dynamic_argv_gid,
        generated_argv_directory=generated_directory,
        generated_argv_directory_fd=-1,
        generated_argv_directory_identity=(0, 0, 0, 0, 0),
        generated_files={},
        mutable_output_paths=mutable_paths,
    )


def identity_matches(left: FileIdentity, right: FileIdentity) -> bool:
    return (
        left.path_fshex,
        left.sha256,
        left.device,
        left.inode,
        left.size,
        left.mode,
        left.uid,
        left.gid,
    ) == (
        right.path_fshex,
        right.sha256,
        right.device,
        right.inode,
        right.size,
        right.mode,
        right.uid,
        right.gid,
    )


def generated_physical_identity_matches(
    left: FileIdentity,
    right: FileIdentity,
) -> bool:
    return (
        left.path_fshex,
        left.device,
        left.inode,
        left.mode,
        left.uid,
        left.gid,
        left.link_count,
    ) == (
        right.path_fshex,
        right.device,
        right.inode,
        right.mode,
        right.uid,
        right.gid,
        right.link_count,
    )


def generated_version_identity_matches(
    left: FileIdentity,
    right: FileIdentity,
) -> bool:
    return (
        left.sha256,
        left.size,
        left.mtime_ns,
        left.ctime_ns,
    ) == (
        right.sha256,
        right.size,
        right.mtime_ns,
        right.ctime_ns,
    )


def dynamic_argv_binding_receipt(
    index: int,
    domain: str,
    generation: int,
    identity: FileIdentity,
) -> dict[str, Any]:
    return {
        "index": index,
        "authorityDomain": domain,
        "authorityGeneration": generation,
        "linkCount": identity.link_count,
        "mtimeNs": identity.mtime_ns,
        "ctimeNs": identity.ctime_ns,
        **identity.receipt(),
    }


def prepare_generated_argv_directory(manifest: Manifest) -> None:
    path = manifest.generated_argv_directory
    parent_info = path.parent.stat(follow_symlinks=False)
    if (
        not stat.S_ISDIR(parent_info.st_mode)
        or parent_info.st_uid != os.geteuid()
        or parent_info.st_mode & (stat.S_IWGRP | stat.S_IWOTH)
    ):
        raise LedgerError("generated argv directory parent is not private")
    try:
        os.mkdir(path, 0o700)
    except OSError as exc:
        raise LedgerError("generated argv directory creation failed") from exc
    descriptor = -1
    try:
        descriptor = os.open(
            path,
            os.O_RDONLY
            | getattr(os, "O_CLOEXEC", 0)
            | getattr(os, "O_DIRECTORY", 0)
            | getattr(os, "O_NOFOLLOW", 0),
        )
        info = os.fstat(descriptor)
        current = path.stat(follow_symlinks=False)
        identity = (
            info.st_dev,
            info.st_ino,
            info.st_mode,
            info.st_uid,
            info.st_gid,
        )
        if (
            not stat.S_ISDIR(info.st_mode)
            or stat.S_IMODE(info.st_mode) != 0o700
            or info.st_uid != os.geteuid()
            or info.st_gid != os.getegid()
            or identity != (
                current.st_dev,
                current.st_ino,
                current.st_mode,
                current.st_uid,
                current.st_gid,
            )
            or os.listdir(descriptor)
        ):
            raise LedgerError("generated argv directory identity is not exact")
        manifest.generated_argv_directory_fd = descriptor
        manifest.generated_argv_directory_identity = identity
        descriptor = -1
    finally:
        if descriptor >= 0:
            os.close(descriptor)


def verify_and_remove_generated_argv_directory(manifest: Manifest) -> None:
    descriptor = manifest.generated_argv_directory_fd
    if descriptor < 0:
        raise LedgerError("generated argv directory authority is absent")
    held = os.fstat(descriptor)
    current = manifest.generated_argv_directory.stat(follow_symlinks=False)
    expected = manifest.generated_argv_directory_identity
    if (
        expected != (
            held.st_dev,
            held.st_ino,
            held.st_mode,
            held.st_uid,
            held.st_gid,
        )
        or expected != (
            current.st_dev,
            current.st_ino,
            current.st_mode,
            current.st_uid,
            current.st_gid,
        )
        or os.listdir(descriptor)
    ):
        raise LedgerError("generated argv directory changed or is not empty")
    os.rmdir(manifest.generated_argv_directory)
    if manifest.generated_argv_directory.exists():
        raise LedgerError("generated argv directory removal failed")


def revalidate_manifest(manifest: Manifest) -> None:
    if (
        manifest.dynamic_argv_uid != os.geteuid()
        or manifest.dynamic_argv_gid != os.getegid()
    ):
        raise LedgerError("dynamic argv process owner changed during trace")
    current_raw, current_sha = stable_read_limited(
        manifest.path,
        "exec manifest post-run",
        MAX_MANIFEST_BYTES,
    )
    del current_raw
    if current_sha != manifest.sha256:
        raise LedgerError("exec manifest changed during trace")
    for label, entries, executable in (
        ("executable", manifest.executables, True),
        ("bound file", manifest.bound_files, False),
    ):
        for path_fshex, held in entries.items():
            current, fd = open_stable_file(
                held.identity.path,
                f"manifest {label} post-run",
                max_bytes=(
                    MAX_EXECUTABLE_BYTES if executable else MAX_BOUND_FILE_BYTES
                ),
                executable=executable,
                hold=False,
            )
            if fd != -1 or path_fshex != current.path_fshex:
                raise LedgerError(f"manifest {label} descriptor contract drift")
            if not identity_matches(current, held.identity):
                raise LedgerError(f"manifest {label} changed during trace")
            held_info = os.fstat(held.fd)
            if stat_signature(held_info) != (
                held.identity.device,
                held.identity.inode,
                held.identity.mode,
                held.identity.uid,
                held.identity.gid,
                held.identity.link_count,
                held.identity.size,
                held.identity.mtime_ns,
                held.identity.ctime_ns,
            ):
                raise LedgerError(f"held manifest {label} changed during trace")
            if hash_open_fd(
                held.fd,
                held.identity.size,
                f"held manifest {label}",
            ) != held.identity.sha256:
                raise LedgerError(f"held manifest {label} bytes changed")
    verify_and_remove_generated_argv_directory(manifest)


def ptrace_call(
    request: int,
    pid: int,
    address: int | ctypes.c_void_p = 0,
    data: int | ctypes.c_void_p = 0,
) -> int:
    address_arg = (
        address
        if isinstance(address, ctypes.c_void_p)
        else ctypes.c_void_p(address)
    )
    data_arg = data if isinstance(data, ctypes.c_void_p) else ctypes.c_void_p(data)
    ctypes.set_errno(0)
    if PTRACE_FUNCTION is None:
        raise LedgerError("libc ptrace is unavailable")
    result = PTRACE_FUNCTION(
        ctypes.c_ulong(request),
        ctypes.c_ulong(pid),
        address_arg,
        data_arg,
    )
    observed_errno = ctypes.get_errno()
    if result == -1 and observed_errno:
        raise LedgerError(
            f"ptrace request {request:#x} failed for pid {pid}: "
            f"{os.strerror(observed_errno)}"
        )
    return int(result)


def ptrace_pointer_call(
    request: int,
    pid: int,
    address: int,
    pointer: Any,
) -> int:
    ctypes.set_errno(0)
    if PTRACE_FUNCTION is None:
        raise LedgerError("libc ptrace is unavailable")
    result = PTRACE_FUNCTION(
        ctypes.c_ulong(request),
        ctypes.c_ulong(pid),
        ctypes.c_void_p(address),
        ctypes.cast(pointer, ctypes.c_void_p),
    )
    observed_errno = ctypes.get_errno()
    if result == -1 and observed_errno:
        raise LedgerError(
            f"ptrace request {request:#x} failed for pid {pid}: "
            f"{os.strerror(observed_errno)}"
        )
    return int(result)


def ptrace_event_message(pid: int) -> int:
    value = ctypes.c_ulonglong()
    ptrace_pointer_call(PTRACE_GETEVENTMSG, pid, 0, ctypes.byref(value))
    return int(value.value)


def ptrace_peek_word(pid: int, address: int) -> bytes:
    ctypes.set_errno(0)
    if PTRACE_FUNCTION is None:
        raise LedgerError("libc ptrace is unavailable")
    result = PTRACE_FUNCTION(
        ctypes.c_ulong(PTRACE_PEEKDATA),
        ctypes.c_ulong(pid),
        ctypes.c_void_p(address),
        ctypes.c_void_p(0),
    )
    observed_errno = ctypes.get_errno()
    if result == -1 and observed_errno:
        raise LedgerError(
            f"ptrace PEEKDATA failed for pid {pid}: "
            f"{os.strerror(observed_errno)}"
        )
    mask = (1 << (8 * ctypes.sizeof(ctypes.c_long))) - 1
    return (int(result) & mask).to_bytes(
        ctypes.sizeof(ctypes.c_long),
        sys.byteorder,
    )


def read_tracee_bytes(pid: int, address: int, size: int) -> bytes:
    if address <= 0 or size < 0:
        raise LedgerError("tracee memory range is invalid")
    result = bytearray()
    while len(result) < size:
        result.extend(ptrace_peek_word(pid, address + len(result)))
    return bytes(result[:size])


def read_tracee_cstring(pid: int, address: int, limit: int, label: str) -> bytes:
    if address <= 0:
        raise LedgerError(f"{label} pointer is null")
    result = bytearray()
    while len(result) < limit:
        word = ptrace_peek_word(pid, address + len(result))
        nul = word.find(b"\0")
        if nul >= 0:
            result.extend(word[:nul])
            return bytes(result)
        result.extend(word)
    raise LedgerError(f"{label} exceeds byte bound")


def read_tracee_argv(pid: int, address: int) -> tuple[tuple[bytes, ...], int]:
    if address == 0:
        return (), 0
    pointer_size = ctypes.sizeof(ctypes.c_void_p)
    values: list[bytes] = []
    total = 0
    for index in range(MAX_ARGV_COUNT + 1):
        pointer_raw = read_tracee_bytes(
            pid,
            address + index * pointer_size,
            pointer_size,
        )
        item_address = int.from_bytes(pointer_raw, sys.byteorder)
        if item_address == 0:
            return tuple(values), total
        if index == MAX_ARGV_COUNT:
            raise LedgerError("exec argv count exceeds contract")
        remaining = MAX_ARGV_BYTES - total
        if remaining <= 0:
            raise LedgerError("exec argv bytes exceed contract")
        item = read_tracee_cstring(
            pid,
            item_address,
            remaining,
            f"exec argv[{index}]",
        )
        total += len(item) + 1
        if total > MAX_ARGV_BYTES:
            raise LedgerError("exec argv bytes exceed contract")
        values.append(item)
    raise LedgerError("exec argv is unterminated")


def ptrace_syscall_info(pid: int) -> tuple[int, int, tuple[int, ...]]:
    buffer = ctypes.create_string_buffer(88)
    size = ptrace_pointer_call(
        PTRACE_GET_SYSCALL_INFO,
        pid,
        ctypes.sizeof(buffer),
        ctypes.byref(buffer),
    )
    if size < 32:
        raise LedgerError("PTRACE_GET_SYSCALL_INFO returned a short record")
    raw = buffer.raw
    operation = raw[0]
    arch = struct.unpack_from("=I", raw, 4)[0]
    if operation in (
        PTRACE_SYSCALL_INFO_ENTRY,
        PTRACE_SYSCALL_INFO_SECCOMP,
    ):
        if size < 80:
            raise LedgerError("syscall entry info is truncated")
        syscall_number = struct.unpack_from("=Q", raw, 24)[0]
        arguments = struct.unpack_from("=6Q", raw, 32)
        return operation, arch, (syscall_number, *arguments)
    if operation == PTRACE_SYSCALL_INFO_EXIT:
        if size < 33:
            raise LedgerError("syscall exit info is truncated")
        return_value = struct.unpack_from("=q", raw, 24)[0]
        is_error = raw[32]
        return operation, arch, (return_value, is_error)
    raise LedgerError(f"unexpected syscall info operation: {operation}")


def bpf_statement(code: int, value: int) -> SockFilter:
    return SockFilter(code=code, jt=0, jf=0, k=value)


def bpf_jump(code: int, value: int, true_skip: int, false_skip: int) -> SockFilter:
    return SockFilter(code=code, jt=true_skip, jf=false_skip, k=value)


def seccomp_filter_rows(machine: str) -> tuple[SockFilter, ...]:
    contract = ARCH_CONTRACTS.get(machine)
    if contract is None:
        raise LedgerError(f"unsupported Linux architecture: {machine}")
    rows = [
        bpf_statement(BPF_LD_W_ABS, SECCOMP_DATA_ARCH_OFFSET),
        bpf_jump(BPF_JMP_JEQ_K, contract["audit_arch"], 1, 0),
        bpf_statement(BPF_RET_K, SECCOMP_RET_KILL_PROCESS),
        bpf_statement(BPF_LD_W_ABS, SECCOMP_DATA_NR_OFFSET),
    ]
    if contract["reject_x32"]:
        rows.extend(
            (
                bpf_jump(BPF_JMP_JSET_K, X32_SYSCALL_BIT, 0, 1),
                bpf_statement(BPF_RET_K, SECCOMP_RET_KILL_PROCESS),
            )
        )
    rows.extend(
        (
            bpf_jump(BPF_JMP_JEQ_K, contract["execve"], 0, 1),
            bpf_statement(BPF_RET_K, SECCOMP_RET_TRACE),
            bpf_jump(BPF_JMP_JEQ_K, contract["execveat"], 0, 1),
            bpf_statement(BPF_RET_K, SECCOMP_RET_TRACE),
            bpf_statement(BPF_RET_K, SECCOMP_RET_ALLOW),
        )
    )
    return tuple(rows)


def child_fail(message: str) -> NoReturn:
    raw = f"ptrace_exec_ledger_child_error={message}\n".encode(
        "utf-8",
        "backslashreplace",
    )
    try:
        os.write(2, raw[:4096])
    finally:
        os._exit(127)


def child_install_trace_contract(expected_parent: int) -> None:
    if PRCTL_FUNCTION is None:
        child_fail("libc_prctl_unavailable")
    if PRCTL_FUNCTION(PR_SET_PDEATHSIG, signal.SIGKILL, 0, 0, 0) != 0:
        child_fail(f"prctl_pdeathsig:{ctypes.get_errno()}")
    if os.getppid() != expected_parent:
        child_fail("parent_changed_before_trace")
    if ptrace_call(PTRACE_TRACEME, 0) != 0:
        child_fail("ptrace_traceme")
    if PRCTL_FUNCTION(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0:
        child_fail(f"prctl_no_new_privs:{ctypes.get_errno()}")
    rows = seccomp_filter_rows(platform.machine())
    array_type = SockFilter * len(rows)
    filters = array_type(*rows)
    program = SockFprog(
        length=len(rows),
        filters=ctypes.cast(filters, ctypes.POINTER(SockFilter)),
    )
    if PRCTL_FUNCTION(
        PR_SET_SECCOMP,
        SECCOMP_MODE_FILTER,
        ctypes.byref(program),
        0,
        0,
    ) != 0:
        child_fail(f"prctl_seccomp:{ctypes.get_errno()}")


def read_proc_stat(pid: int) -> tuple[ProcessIdentity, int]:
    path = f"/proc/{pid}/stat"
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | os.O_NOFOLLOW
    try:
        fd = os.open(path, flags)
        try:
            raw = os.read(fd, 8193)
        finally:
            os.close(fd)
    except OSError as exc:
        raise LedgerError(f"cannot read {path}") from exc
    if len(raw) > 8192:
        raise LedgerError(f"{path} exceeds bound")
    closing = raw.rfind(b")")
    if closing < 0:
        raise LedgerError(f"{path} format is invalid")
    fields = raw[closing + 2 :].split()
    if len(fields) < 20:
        raise LedgerError(f"{path} is truncated")
    try:
        observed_pid = int(raw[: raw.find(b" ")])
        ppid = int(fields[1])
        starttime = int(fields[19])
    except ValueError as exc:
        raise LedgerError(f"{path} numeric field is invalid") from exc
    if observed_pid != pid or ppid < 0 or starttime <= 0:
        raise LedgerError(f"{path} identity is invalid")
    return ProcessIdentity(pid=pid, starttime_ticks=starttime), ppid


def read_tracer_pid(pid: int) -> int:
    path = f"/proc/{pid}/status"
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | os.O_NOFOLLOW
    try:
        fd = os.open(path, flags)
        try:
            raw = os.read(fd, 1024 * 1024 + 1)
        finally:
            os.close(fd)
    except OSError as exc:
        raise LedgerError(f"cannot read {path}") from exc
    if len(raw) > 1024 * 1024:
        raise LedgerError(f"{path} exceeds bound")
    matches = [
        line for line in raw.splitlines() if line.startswith(b"TracerPid:")
    ]
    if len(matches) != 1:
        raise LedgerError(f"{path} TracerPid is not unique")
    try:
        return int(matches[0].split(b":", 1)[1].strip())
    except ValueError as exc:
        raise LedgerError(f"{path} TracerPid is invalid") from exc


def read_proc_cwd(pid: int) -> Path:
    try:
        raw = os.readlink(f"/proc/{pid}/cwd")
    except OSError as exc:
        raise LedgerError(f"cannot read pid {pid} cwd") from exc
    path = Path(raw)
    if not path.is_absolute() or path.resolve(strict=True) != path:
        raise LedgerError("tracee cwd is not canonical")
    return path


def resolve_exec_request(
    pid: int,
    syscall_number: int,
    arguments: tuple[int, ...],
) -> tuple[Path, int, bool]:
    contract = ARCH_CONTRACTS[platform.machine()]
    if syscall_number == contract["execve"]:
        pathname_pointer = arguments[0]
        argv_pointer = arguments[1]
    elif syscall_number == contract["execveat"]:
        dirfd = ctypes.c_longlong(arguments[0]).value
        pathname_pointer = arguments[1]
        argv_pointer = arguments[2]
        flags = arguments[4]
        if dirfd != AT_FDCWD or flags != 0:
            raise LedgerError("execveat requires AT_FDCWD and zero flags")
    else:
        raise LedgerError("seccomp stop is not execve or execveat")
    pathname_raw = read_tracee_cstring(
        pid,
        pathname_pointer,
        MAX_PATH_BYTES,
        "exec pathname",
    )
    path = Path(os.fsdecode(pathname_raw))
    if (
        not path.is_absolute()
        or path == Path("/")
        or ".." in path.parts
        or Path(os.path.normpath(os.fsdecode(pathname_raw))) != path
    ):
        raise LedgerError("exec pathname is not canonical absolute")
    try:
        info = path.lstat()
    except FileNotFoundError:
        absent = exact_absent_path_from_fshex(
            pathname_raw.hex(),
            "exec pathname",
        )
        return absent, argv_pointer, False
    except OSError as exc:
        raise LedgerError("exec pathname cannot be inspected") from exc
    try:
        parent = path.parent.resolve(strict=True)
    except OSError as exc:
        raise LedgerError("exec pathname parent cannot be resolved") from exc
    if parent != path.parent:
        raise LedgerError("exec pathname parent contains a symlink or alias")
    if stat.S_ISLNK(info.st_mode) or path.resolve(strict=True) != path:
        raise LedgerError("exec pathname contains a symlink or alias")
    return path, argv_pointer, True


def read_proc_cmdline(pid: int) -> tuple[tuple[bytes, ...], int]:
    path = f"/proc/{pid}/cmdline"
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | os.O_NOFOLLOW
    try:
        fd = os.open(path, flags)
        try:
            raw = os.read(fd, MAX_ARGV_BYTES + 1)
        finally:
            os.close(fd)
    except OSError as exc:
        raise LedgerError(f"cannot read {path}") from exc
    if len(raw) > MAX_ARGV_BYTES:
        raise LedgerError("post-exec cmdline exceeds contract")
    if not raw:
        return (), 0
    if not raw.endswith(b"\0"):
        raise LedgerError("post-exec cmdline is unterminated")
    values = tuple(raw[:-1].split(b"\0"))
    if len(values) > MAX_ARGV_COUNT:
        raise LedgerError("post-exec argv count exceeds contract")
    return values, len(raw)


def executable_from_proc(pid: int, expected: FileIdentity) -> FileIdentity:
    proc_path = Path(f"/proc/{pid}/exe")
    try:
        linked = os.readlink(proc_path)
    except OSError as exc:
        raise LedgerError(f"cannot read pid {pid} executable link") from exc
    if linked.endswith(" (deleted)"):
        raise LedgerError("executed image was unlinked")
    linked_path = Path(linked)
    if not linked_path.is_absolute() or linked_path != expected.path:
        raise LedgerError("executed image path differs from pre-exec path")
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0)
    try:
        fd = os.open(proc_path, flags)
    except OSError as exc:
        raise LedgerError("cannot open exact executed image descriptor") from exc
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_size > MAX_EXECUTABLE_BYTES:
            raise LedgerError("executed image descriptor type or size is invalid")
        digest = hash_open_fd(fd, before.st_size, "executed image descriptor")
        after = os.fstat(fd)
        if stat_signature(after) != stat_signature(before):
            raise LedgerError("executed image changed during hash")
    finally:
        os.close(fd)
    observed = FileIdentity(
        path=linked_path,
        path_fshex=os.fsencode(linked_path).hex(),
        sha256=digest,
        device=before.st_dev,
        inode=before.st_ino,
        size=before.st_size,
        mode=before.st_mode,
        uid=before.st_uid,
        gid=before.st_gid,
        link_count=before.st_nlink,
        mtime_ns=before.st_mtime_ns,
        ctime_ns=before.st_ctime_ns,
    )
    if not identity_matches(observed, expected):
        raise LedgerError("executed image differs from pre-exec identity")
    path_observed, unused_fd = open_stable_file(
        expected.path,
        "post-exec O_NOFOLLOW path",
        max_bytes=MAX_EXECUTABLE_BYTES,
        executable=True,
        hold=False,
    )
    if unused_fd != -1 or not identity_matches(path_observed, expected):
        raise LedgerError("post-exec path no longer names executed image")
    return observed


def argv_existing_path(pid: int, raw: bytes) -> tuple[Path, Path] | None:
    if not raw or raw.startswith(b"-") or b"\0" in raw:
        return None
    raw_path = Path(os.fsdecode(raw))
    if raw_path.is_absolute():
        presented = raw_path
        current = Path("/")
        parts = raw_path.parts[1:]
    else:
        current = read_proc_cwd(pid)
        presented = current / raw_path
        parts = raw_path.parts
    info: os.stat_result | None = None
    for index, part in enumerate(parts):
        if part == ".":
            continue
        if part == "..":
            if current == Path("/"):
                raise LedgerError("argv path escapes the filesystem root")
            current = current.parent
            info = current.lstat()
            continue
        candidate = current / part
        try:
            info = candidate.lstat()
        except FileNotFoundError:
            return None
        except OSError as exc:
            if exc.errno in (errno.ENOENT, errno.ENOTDIR, errno.ENAMETOOLONG):
                return None
            raise LedgerError(
                f"argv path stat failed {candidate} errno={exc.errno}"
            ) from exc
        if stat.S_ISLNK(info.st_mode):
            raise LedgerError(f"argv path symlink is forbidden: {candidate}")
        if index + 1 < len(parts) and not stat.S_ISDIR(info.st_mode):
            return None
        current = candidate
    if info is None:
        info = current.lstat()
    if stat.S_ISDIR(info.st_mode):
        # Directory-valued argv entries (for example --evidence-dir) are
        # not regular file bindings; their contents are independently
        # verified by the stage-tree delta validator, not by argv binding.
        return None
    if not stat.S_ISREG(info.st_mode):
        raise LedgerError("argv names an unbound non-regular path")
    return presented, current


def bind_argv_files(
    pid: int,
    argv: tuple[bytes, ...],
    manifest: Manifest,
) -> tuple[dict[str, Any], ...]:
    result: list[dict[str, Any]] = []
    all_allowed = {**manifest.executables, **manifest.bound_files}
    for index, raw in enumerate(argv[1:], start=1):
        observed = argv_existing_path(pid, raw)
        if observed is None:
            continue
        presented_path, path = observed
        path_fshex = os.fsencode(path).hex()
        held = all_allowed.get(path_fshex)
        current: FileIdentity
        binding: dict[str, Any]
        if held is not None:
            current, unused_fd = open_stable_file(
                path,
                f"argv[{index}] bound file",
                max_bytes=(
                    MAX_EXECUTABLE_BYTES
                    if path_fshex in manifest.executables
                    else MAX_BOUND_FILE_BYTES
                ),
                executable=path_fshex in manifest.executables,
                hold=False,
            )
            if unused_fd != -1 or not identity_matches(current, held.identity):
                raise LedgerError(f"argv[{index}] bound file changed")
            binding = {
                "index": index,
                "authorityDomain": ARGV_AUTHORITY_IMMUTABLE,
                "authorityGeneration": 0,
                **current.receipt(),
            }
        elif presented_path != path:
            raise LedgerError(
                f"argv[{index}] path alias is outside immutable authority: "
                f"{presented_path}"
            )
        elif path_fshex in manifest.mutable_output_paths:
            current, unused_fd = open_stable_file(
                path,
                f"argv[{index}] mutable output",
                max_bytes=MAX_BOUND_FILE_BYTES,
                executable=False,
                hold=False,
                allow_owner_write=True,
            )
            if (
                unused_fd != -1
                or current.uid != manifest.dynamic_argv_uid
                or current.gid != manifest.dynamic_argv_gid
                or current.mode & (stat.S_IXUSR | stat.S_IWGRP | stat.S_IWOTH)
                or current.link_count != 1
            ):
                raise LedgerError(f"argv[{index}] mutable output is not exact")
            binding = dynamic_argv_binding_receipt(
                index,
                ARGV_AUTHORITY_MUTABLE_OUTPUT,
                0,
                current,
            )
        elif path.parent == manifest.generated_argv_directory:
            current, unused_fd = open_stable_file(
                path,
                f"argv[{index}] generated file",
                max_bytes=MAX_BOUND_FILE_BYTES,
                executable=False,
                hold=False,
                allow_owner_write=True,
            )
            prior = manifest.generated_files.get(path_fshex)
            if (
                unused_fd != -1
                or current.uid != manifest.dynamic_argv_uid
                or current.gid != manifest.dynamic_argv_gid
                or current.mode & (
                    stat.S_IXUSR
                    | stat.S_IRWXG
                    | stat.S_IRWXO
                )
                or current.link_count != 1
                or (
                    prior is not None
                    and not generated_physical_identity_matches(
                        current,
                        prior.physical_identity,
                    )
                )
            ):
                raise LedgerError(f"argv[{index}] generated file is not exact")
            if prior is None:
                if len(manifest.generated_files) >= MAX_GENERATED_ARGV_FILES:
                    raise LedgerError("generated argv file count exceeds contract")
                prior = GeneratedFileState(
                    physical_identity=current,
                    latest_identity=current,
                    generation=0,
                )
                manifest.generated_files[path_fshex] = prior
            elif not generated_version_identity_matches(
                current,
                prior.latest_identity,
            ):
                if prior.generation >= MAX_EVENTS:
                    raise LedgerError("generated argv file generation exhausted")
                prior.generation += 1
                prior.latest_identity = current
            binding = dynamic_argv_binding_receipt(
                index,
                ARGV_AUTHORITY_GENERATED,
                prior.generation,
                current,
            )
        else:
            raise LedgerError(
                f"argv[{index}] names a regular file outside the manifest: {path}"
            )
        result.append(binding)
        if len(result) > MAX_ARGV_FILE_BINDINGS:
            raise LedgerError("argv file binding count exceeds contract")
    return tuple(result)


class TraceLedger:
    def __init__(self, manifest: Manifest) -> None:
        self.manifest = manifest
        self.tasks: dict[int, TaskState] = {}
        self.early_children: dict[int, ProcessIdentity] = {}
        self.events: list[dict[str, Any]] = []
        self.event_json_bytes = 0
        self.root_pid = -1
        self.root_identity: ProcessIdentity | None = None
        self.root_exit_code: int | None = None

    def append_event(self, kind: str, fields: dict[str, Any]) -> None:
        if len(self.events) >= MAX_EVENTS:
            raise LedgerError("ptrace event count exceeds contract")
        event = {
            "sequence": len(self.events),
            "kind": kind,
            **fields,
        }
        next_bytes = self.event_json_bytes + len(canonical_json(event)) + 1
        if next_bytes > MAX_EVENT_JSON_BYTES:
            raise LedgerError("ptrace event JSON bytes exceed contract")
        self.events.append(event)
        self.event_json_bytes = next_bytes

    def add_root(self, pid: int, tracer: ProcessIdentity) -> None:
        identity, ppid = read_proc_stat(pid)
        if ppid != tracer.pid:
            raise LedgerError("root tracee parent identity mismatch")
        self.root_pid = pid
        self.root_identity = identity
        self.tasks[pid] = TaskState(
            identity=identity,
            lineage_parent=tracer,
        )
        self.append_event(
            "root",
            {
                "process": identity.receipt(),
                "parent": tracer.receipt(),
            },
        )

    def set_options(self, pid: int) -> None:
        ptrace_call(PTRACE_SETOPTIONS, pid, 0, PTRACE_OPTION_MASK)

    def resume_cont(self, pid: int, delivered_signal: int = 0) -> None:
        ptrace_call(PTRACE_CONT, pid, 0, delivered_signal)

    def resume_syscall(self, pid: int, delivered_signal: int = 0) -> None:
        ptrace_call(PTRACE_SYSCALL, pid, 0, delivered_signal)

    def task(self, pid: int) -> TaskState:
        task = self.tasks.get(pid)
        if task is None:
            raise LedgerError(f"event for unknown task pid {pid}")
        return task

    def handle_early_child(self, pid: int, stop_signal: int) -> None:
        if stop_signal != signal.SIGSTOP:
            raise LedgerError(f"unknown task pid {pid} did not stop with SIGSTOP")
        if read_tracer_pid(pid) != os.getpid():
            raise LedgerError(f"unknown task pid {pid} is not ptrace-owned")
        identity, _ppid = read_proc_stat(pid)
        if pid in self.early_children:
            raise LedgerError(f"duplicate early child stop for pid {pid}")
        if len(self.tasks) + len(self.early_children) >= MAX_TASKS:
            raise LedgerError("ptrace task count exceeds contract")
        self.early_children[pid] = identity

    def handle_fork(self, pid: int, event: int) -> None:
        parent = self.task(pid)
        child_pid = ptrace_event_message(pid)
        if child_pid <= 0 or child_pid in self.tasks:
            raise LedgerError("ptrace child pid is invalid or duplicated")
        if len(self.tasks) + len(self.early_children) >= MAX_TASKS:
            raise LedgerError("ptrace task count exceeds contract")
        child_identity, _ppid = read_proc_stat(child_pid)
        early = self.early_children.pop(child_pid, None)
        if early is not None and early != child_identity:
            raise LedgerError("early child identity changed before fork linkage")
        child = TaskState(
            identity=child_identity,
            lineage_parent=parent.identity,
            awaiting_initial_stop=early is None,
        )
        self.tasks[child_pid] = child
        self.append_event(
            "fork",
            {
                "forkKind": FORK_EVENT_NAMES[event],
                "parent": parent.identity.receipt(),
                "parentGeneration": parent.generation,
                "child": child_identity.receipt(),
            },
        )
        if early is not None:
            self.set_options(child_pid)
            self.resume_cont(child_pid)
        self.resume_cont(pid)

    def handle_initial_stop(self, pid: int, task: TaskState, stop_signal: int) -> None:
        if stop_signal != signal.SIGSTOP or not task.awaiting_initial_stop:
            raise LedgerError("child initial-stop contract mismatch")
        current, _ppid = read_proc_stat(pid)
        if current != task.identity:
            raise LedgerError("child identity changed before initial stop")
        task.awaiting_initial_stop = False
        self.set_options(pid)
        self.resume_cont(pid)

    def handle_seccomp(self, pid: int) -> None:
        task = self.task(pid)
        if task.pending_exec is not None:
            raise LedgerError("nested exec attempt before prior attempt completed")
        operation, arch, info = ptrace_syscall_info(pid)
        contract = ARCH_CONTRACTS[platform.machine()]
        if operation != PTRACE_SYSCALL_INFO_SECCOMP:
            raise LedgerError("seccomp event does not carry seccomp syscall info")
        if arch != contract["audit_arch"]:
            raise LedgerError("seccomp event architecture mismatch")
        syscall_number = info[0]
        arguments = info[1:]
        path, argv_pointer, path_exists = resolve_exec_request(
            pid,
            syscall_number,
            arguments,
        )
        requested: FileIdentity | None = None
        requested_path_fshex = os.fsencode(path).hex()
        if path_exists:
            requested, unused_fd = open_stable_file(
                path,
                f"pre-exec O_NOFOLLOW image {path}",
                max_bytes=MAX_EXECUTABLE_BYTES,
                executable=True,
                hold=False,
            )
            if unused_fd != -1:
                raise LedgerError(
                    "pre-exec executable descriptor contract drift"
                )
            allowed = self.manifest.executables.get(requested.path_fshex)
            if (
                allowed is None
                or not identity_matches(requested, allowed.identity)
            ):
                raise LedgerError(
                    "exec target is outside the immutable manifest"
                )
        argv, argv_bytes = read_tracee_argv(pid, argv_pointer)
        argv_sha = framed_sha256(argv)
        argv_bindings = bind_argv_files(pid, argv, self.manifest)
        task.pending_exec = PendingExec(
            syscall_number=syscall_number,
            requested_path_fshex=requested_path_fshex,
            requested=requested,
            argv_sha256=argv_sha,
            argv_count=len(argv),
            argv_bytes=argv_bytes,
            argv_file_bindings=argv_bindings,
        )
        self.append_event(
            "exec_attempt",
            {
                "process": task.identity.receipt(),
                "nextGeneration": task.generation + 1,
                "requestedPathFshex": requested_path_fshex,
                "executable": (
                    requested.receipt() if requested is not None else None
                ),
                "argvSha256": argv_sha,
                "argvCount": len(argv),
                "argvBytes": argv_bytes,
                "argvFileBindings": list(argv_bindings),
            },
        )
        self.resume_syscall(pid)

    def handle_syscall_exit(self, pid: int) -> None:
        task = self.task(pid)
        pending = task.pending_exec
        if pending is None:
            raise LedgerError("unexpected ptrace syscall-exit stop")
        operation, arch, info = ptrace_syscall_info(pid)
        if operation != PTRACE_SYSCALL_INFO_EXIT:
            raise LedgerError("pending exec did not reach syscall-exit stop")
        if arch != ARCH_CONTRACTS[platform.machine()]["audit_arch"]:
            raise LedgerError("syscall-exit architecture mismatch")
        return_value, is_error = info
        if not is_error or return_value >= 0:
            raise LedgerError("exec returned without PTRACE_EVENT_EXEC")
        error_number = -return_value
        if pending.requested is None and error_number != errno.ENOENT:
            raise LedgerError(
                "absent exec target did not fail with exact ENOENT"
            )
        self.append_event(
            "exec_failed",
            {
                "process": task.identity.receipt(),
                "attemptedGeneration": task.generation + 1,
                "errno": error_number,
                "requestedPathFshex": pending.requested_path_fshex,
                "executable": (
                    pending.requested.receipt()
                    if pending.requested is not None
                    else None
                ),
                "argvSha256": pending.argv_sha256,
            },
        )
        task.pending_exec = None
        self.resume_cont(pid)

    def handle_exec(self, pid: int) -> None:
        task = self.task(pid)
        pending = task.pending_exec
        if pending is None:
            raise LedgerError("exec event has no seccomp pre-exec record")
        if pending.requested is None:
            raise LedgerError("absent exec target unexpectedly executed")
        former_tid = ptrace_event_message(pid)
        if former_tid != pid:
            raise LedgerError("non-leader thread exec is forbidden")
        current, current_ppid = read_proc_stat(pid)
        if current != task.identity:
            raise LedgerError("process identity changed across exec")
        executed = executable_from_proc(pid, pending.requested)
        actual_argv, actual_argv_bytes = read_proc_cmdline(pid)
        actual_argv_sha = framed_sha256(actual_argv)
        if (
            actual_argv_sha != pending.argv_sha256
            or len(actual_argv) != pending.argv_count
            or actual_argv_bytes != pending.argv_bytes
        ):
            raise LedgerError("post-exec argv differs from pre-exec argv")
        task.generation += 1
        current_parent = self.tasks.get(current_ppid)
        self.append_event(
            "exec",
            {
                "process": {
                    **task.identity.receipt(),
                    "generation": task.generation,
                },
                "lineageParent": task.lineage_parent.receipt(),
                "currentPpid": current_ppid,
                "currentParent": (
                    current_parent.identity.receipt()
                    if current_parent is not None
                    else (
                        task.lineage_parent.receipt()
                        if current_ppid == task.lineage_parent.pid
                        else None
                    )
                ),
                "executable": executed.receipt(),
                "argvSha256": actual_argv_sha,
                "argvCount": len(actual_argv),
                "argvBytes": actual_argv_bytes,
                "argvFileBindings": list(pending.argv_file_bindings),
            },
        )
        task.pending_exec = None
        self.resume_cont(pid)

    def handle_exit_prepare(self, pid: int) -> None:
        task = self.task(pid)
        if task.exit_prepared_status is not None:
            raise LedgerError("duplicate PTRACE_EVENT_EXIT")
        if task.pending_exec is not None:
            raise LedgerError("task exited with unresolved exec attempt")
        task.exit_prepared_status = ptrace_event_message(pid)
        self.append_event(
            "exit_prepare",
            {
                "process": task.identity.receipt(),
                "generation": task.generation,
                "waitStatus": task.exit_prepared_status,
            },
        )
        self.resume_cont(pid)

    def handle_final_exit(self, pid: int, status_value: int) -> None:
        task = self.task(pid)
        if task.awaiting_initial_stop:
            raise LedgerError("task exited before child initial stop")
        if task.exit_prepared_status is None:
            raise LedgerError("task exit is missing PTRACE_EVENT_EXIT")
        if task.exit_prepared_status != status_value:
            raise LedgerError("exit prepare/final wait status mismatch")
        if os.WIFEXITED(status_value):
            exit_code = os.WEXITSTATUS(status_value)
            signal_number = 0
        elif os.WIFSIGNALED(status_value):
            exit_code = -1
            signal_number = os.WTERMSIG(status_value)
        else:
            raise LedgerError("final wait status is not terminal")
        self.append_event(
            "exit",
            {
                "process": task.identity.receipt(),
                "generation": task.generation,
                "exitCode": exit_code,
                "signal": signal_number,
            },
        )
        del self.tasks[pid]
        if pid == self.root_pid:
            if signal_number:
                raise LedgerError(f"root tracee terminated by signal {signal_number}")
            self.root_exit_code = exit_code

    def handle_stop(self, pid: int, status_value: int) -> None:
        stop_signal = os.WSTOPSIG(status_value)
        event = status_value >> 16
        task = self.tasks.get(pid)
        if task is None:
            if event:
                raise LedgerError(f"ptrace event {event} for unknown pid {pid}")
            self.handle_early_child(pid, stop_signal)
            return
        if task.awaiting_initial_stop:
            if event:
                raise LedgerError("child produced event before initial stop")
            self.handle_initial_stop(pid, task, stop_signal)
            return
        if event in FORK_EVENT_NAMES:
            self.handle_fork(pid, event)
            return
        if event == PTRACE_EVENT_SECCOMP:
            self.handle_seccomp(pid)
            return
        if event == PTRACE_EVENT_EXEC:
            self.handle_exec(pid)
            return
        if event == PTRACE_EVENT_EXIT:
            self.handle_exit_prepare(pid)
            return
        if event:
            raise LedgerError(f"unknown ptrace event {event} for pid {pid}")
        if stop_signal == SYSCALL_STOP_SIGNAL:
            self.handle_syscall_exit(pid)
            return
        if stop_signal in (signal.SIGSTOP, signal.SIGTRAP, signal.SIGSYS):
            raise LedgerError(
                f"unexpected fail-closed stop signal {stop_signal} for pid {pid}"
            )
        self.append_event(
            "signal",
            {
                "process": task.identity.receipt(),
                "signal": stop_signal,
            },
        )
        if task.pending_exec is not None:
            self.resume_syscall(pid, stop_signal)
        else:
            self.resume_cont(pid, stop_signal)

    def run(self, argv: Sequence[str], timeout_seconds: int) -> TraceResult:
        tracer_identity, _ppid = read_proc_stat(os.getpid())
        expected_parent = os.getpid()
        root_pid = os.fork()
        if root_pid == 0:
            try:
                child_install_trace_contract(expected_parent)
                os.kill(os.getpid(), signal.SIGSTOP)
                os.execve(argv[0], list(argv), os.environ.copy())
            except BaseException as exc:
                child_fail(type(exc).__name__ + ":" + str(exc))
        self.root_pid = root_pid

        def timeout_handler(_signum: int, _frame: Any) -> NoReturn:
            raise LedgerError("ptrace ledger timeout")

        previous_handler = signal.signal(signal.SIGALRM, timeout_handler)
        signal.setitimer(signal.ITIMER_REAL, timeout_seconds)
        try:
            waited_pid, initial_status = os.waitpid(root_pid, WALL)
            if (
                waited_pid != root_pid
                or not os.WIFSTOPPED(initial_status)
                or os.WSTOPSIG(initial_status) != signal.SIGSTOP
                or initial_status >> 16
            ):
                raise LedgerError("root tracee did not enter the initial SIGSTOP")
            self.add_root(root_pid, tracer_identity)
            self.set_options(root_pid)
            self.resume_cont(root_pid)
            while self.tasks:
                try:
                    pid, status_value = os.waitpid(-1, WALL)
                except ChildProcessError as exc:
                    raise LedgerError(
                        "waitpid reported ECHILD before ledger closure"
                    ) from exc
                if pid <= 0:
                    raise LedgerError("waitpid returned no ptrace event")
                if os.WIFSTOPPED(status_value):
                    self.handle_stop(pid, status_value)
                elif os.WIFEXITED(status_value) or os.WIFSIGNALED(status_value):
                    self.handle_final_exit(pid, status_value)
                else:
                    raise LedgerError("waitpid returned an unknown state")
            if self.early_children:
                raise LedgerError("unlinked early ptrace children remain")
            if self.root_identity is None or self.root_exit_code is None:
                raise LedgerError("root tracee did not close")
            validate_closed_event_ledger(self.events, self.root_identity)
            return TraceResult(
                root=self.root_identity,
                root_exit_code=self.root_exit_code,
                events=self.events,
            )
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
            signal.signal(signal.SIGALRM, previous_handler)


def terminate_tracees(ledger: TraceLedger) -> None:
    for pid in sorted({ledger.root_pid, *ledger.tasks, *ledger.early_children}):
        if pid <= 0:
            continue
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        except OSError:
            pass


def validate_root_exit_contract(expected: int, actual: int) -> str:
    for value, label in ((expected, "expected"), (actual, "actual")):
        if type(value) is not int or value < 0 or value > 255:
            raise LedgerError(f"{label} root exit code is outside contract")
    if actual != expected:
        raise LedgerError(
            f"root tracee exit code mismatch: expected {expected}, actual {actual}"
        )
    return "verified"


def exact_output_path(path: Path) -> Path:
    if not path.is_absolute():
        raise LedgerError("output path is not absolute")
    if path.exists() or path.is_symlink():
        raise LedgerError("output path must be absent")
    if path.parent.resolve(strict=True) != path.parent:
        raise LedgerError("output parent is not canonical")
    return path


def write_exclusive(path: Path, raw: bytes) -> None:
    if len(raw) > MAX_OUTPUT_BYTES:
        raise LedgerError("canonical ledger output exceeds byte bound")
    flags = (
        os.O_WRONLY
        | os.O_CREAT
        | os.O_EXCL
        | getattr(os, "O_CLOEXEC", 0)
        | os.O_NOFOLLOW
    )
    fd = os.open(path, flags, 0o400)
    try:
        offset = 0
        while offset < len(raw):
            written = os.write(fd, raw[offset:])
            if written <= 0:
                raise LedgerError("canonical ledger output short write")
            offset += written
        os.fsync(fd)
    finally:
        os.close(fd)


def stable_tool_identity() -> FileIdentity:
    source = Path(__file__).resolve(strict=True)
    identity, unused_fd = open_stable_file(
        source,
        "ptrace ledger producer",
        max_bytes=MAX_MANIFEST_BYTES,
        executable=False,
        hold=False,
    )
    if unused_fd != -1:
        raise LedgerError("producer descriptor contract drift")
    return identity


def build_receipt(
    tool: FileIdentity,
    manifest: Manifest,
    argv: Sequence[str],
    result: TraceResult,
    expected_root_exit_code: int,
) -> tuple[bytes, str]:
    exit_contract_status = validate_root_exit_contract(
        expected_root_exit_code,
        result.root_exit_code,
    )
    event_raw = canonical_json(result.events)
    payload = {
        "schema": SCHEMA,
        "status": PROOF_STATUS,
        "applicability": APPLICABILITY,
        "producer": tool.receipt(),
        "manifest": {
            "pathFshex": os.fsencode(manifest.path).hex(),
            "sha256": manifest.sha256,
            "executableCount": len(manifest.executables),
            "boundArgvFileCount": len(manifest.bound_files),
            "generatedArgvFileCount": len(manifest.generated_files),
            "mutableOutputPathCount": len(manifest.mutable_output_paths),
        },
        "ptraceOptions": list(PTRACE_OPTION_NAMES),
        "ptraceOptionMask": PTRACE_OPTION_MASK,
        "limits": {
            "maxEvents": MAX_EVENTS,
            "maxTasks": MAX_TASKS,
            "maxArgvCount": MAX_ARGV_COUNT,
            "maxArgvBytes": MAX_ARGV_BYTES,
            "maxArgvFileBindings": MAX_ARGV_FILE_BINDINGS,
            "maxEventJsonBytes": MAX_EVENT_JSON_BYTES,
            "maxOutputBytes": MAX_OUTPUT_BYTES,
        },
        "commandArgvSha256": framed_sha256(
            os.fsencode(item) for item in argv
        ),
        "root": result.root.receipt(),
        "expectedRootExitCode": expected_root_exit_code,
        "actualRootExitCode": result.root_exit_code,
        "rootExitCodeContractStatus": exit_contract_status,
        "eventCount": len(result.events),
        "eventsSha256": sha256_bytes(event_raw),
        "events": result.events,
    }
    payload_raw = canonical_json(payload)
    payload_sha = sha256_bytes(payload_raw)
    receipt = {
        "payload": payload,
        "payloadSha256": payload_sha,
    }
    raw = canonical_json(receipt) + b"\n"
    if len(raw) > MAX_OUTPUT_BYTES:
        raise LedgerError("canonical ledger output exceeds byte bound")
    parsed = json.loads(raw.decode("utf-8"))
    if (
        canonical_json(parsed) + b"\n" != raw
        or sha256_bytes(canonical_json(parsed["payload"]))
        != parsed["payloadSha256"]
    ):
        raise LedgerError("canonical receipt self-check failed")
    return raw, payload_sha


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


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Produce a fail-closed Linux descendant exec ledger.",
    )
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--timeout-seconds", type=int, default=3600)
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
        parser.error("command after -- is required")
    return args


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    manifest: Manifest | None = None
    ledger: TraceLedger | None = None
    try:
        if sys.platform != "linux" or platform.system() != "Linux":
            raise LedgerError("native Linux is required")
        if platform.machine() not in ARCH_CONTRACTS:
            raise LedgerError("supported Linux architecture is required")
        if ctypes.sizeof(ctypes.c_void_p) != 8:
            raise LedgerError("64-bit Linux process is required")
        if os.geteuid() == 0:
            raise LedgerError("root execution is forbidden")
        if (
            args.timeout_seconds <= 0
            or args.timeout_seconds > MAX_TIMEOUT_SECONDS
        ):
            raise LedgerError("timeout is outside contract")
        manifest_path = Path(args.manifest)
        if not manifest_path.is_absolute():
            raise LedgerError("manifest path is not absolute")
        output_path = exact_output_path(Path(args.output))
        command = tuple(args.command)
        command_path = Path(command[0])
        if not command_path.is_absolute():
            raise LedgerError("root command path is not absolute")
        tool_before = stable_tool_identity()
        manifest = load_manifest(manifest_path)
        prepare_generated_argv_directory(manifest)
        command_fshex = os.fsencode(command_path).hex()
        if command_fshex not in manifest.executables:
            raise LedgerError("root command is outside exec manifest")
        ledger = TraceLedger(manifest)
        result = ledger.run(command, args.timeout_seconds)
        revalidate_manifest(manifest)
        tool_after = stable_tool_identity()
        if not identity_matches(tool_before, tool_after):
            raise LedgerError("ptrace ledger producer changed during trace")
        receipt_raw, receipt_sha = build_receipt(
            tool_after,
            manifest,
            command,
            result,
            args.expected_exit_code,
        )
        manifest.close()
        manifest = None
        write_exclusive(output_path, receipt_raw)
        print(f"ptrace_exec_ledger_status={PROOF_STATUS}")
        print(f"ptrace_exec_ledger_receipt_sha256={receipt_sha}")
        return 0
    except (LedgerError, OSError) as exc:
        print(f"ptrace_exec_ledger_status={HARD_RED_STATUS}", file=sys.stderr)
        print(
            "ptrace_exec_ledger_error="
            + str(exc).replace("\n", " ")[:4096],
            file=sys.stderr,
        )
        sys.stderr.flush()
        if ledger is not None:
            terminate_tracees(ledger)
        return 1
    finally:
        if manifest is not None:
            try:
                manifest.close()
            except LedgerError as exc:
                print(
                    f"ptrace_exec_ledger_close_error={str(exc)[:4096]}",
                    file=sys.stderr,
                )


if __name__ == "__main__":
    raise SystemExit(main())
