#!/usr/bin/env python3
"""Run the native-Linux delegated cgroup-v2 hard-memory contract."""

from __future__ import annotations

import argparse
import ctypes
import errno
import hashlib
import importlib.machinery
import importlib.util
import json
import os
import platform
import re
import select
import selectors
import signal
import shutil
import stat
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve(strict=True).parent.parent
VALIDATOR_PATH = (
    ROOT / "tools/beat_c_validate_linux_cgroup_v2_hard_memory_receipt.py"
)
LEDGER_PRODUCER_PATH = ROOT / "tools/beat_c_linux_ptrace_exec_ledger.py"
LEDGER_VALIDATOR_PATH = (
    ROOT / "tools/beat_c_descendant_exec_ledger_receipt_validator.py"
)
LEDGER_WRAPPER_PATH = (
    ROOT / "tools/beat_c_linux_cgroup_v2_exec_ledger_wrapper"
)
WRAPPER_PATH = ROOT / "tools/beat_c_linux_cgroup_v2_hard_memory_gate.sh"
SCHEMA = "beat_c_linux_cgroup_v2_hard_memory_gate"
INPUT_SCHEMA = "cheng.native_linux_delegated_cgroup_v2_inputs"
ARTIFACT_SCHEMA = "cheng.native_linux_cgroup_v2_artifacts"
APPLICABILITY = "native_linux_delegated_cgroup_v2_only"
PROOF_STATUS = "proved_linux_kernel_cgroup_v2_aggregate"
MEMORY_SCOPE = "rootless_oci_process_and_all_descendants"
LIMIT_BYTES = 1_073_741_824
SWAP_MAX_BYTES = 0
PIDS_MAX = 128
CRUN_CLONE3_POLICY = (
    "ptrace_exact_newuser_into_cgroup_enosys_then_clone"
)
CRUN_CLONE3_SYSCALL_X86_64 = 435
CRUN_CLONE3_ARGUMENT_BYTES = 88
CRUN_EXACT_EXEC_TRANSITIONS = 2
CRUN_CLONE_NEWUSER = 0x10000000
CRUN_CLONE_INTO_CGROUP = 0x200000000
CRUN_CLONE3_EXACT_FLAGS = CRUN_CLONE_NEWUSER | CRUN_CLONE_INTO_CGROUP
AUDIT_ARCH_X86_64 = 0xC000003E

PTRACE_TRACEME = 0
PTRACE_PEEKDATA = 2
PTRACE_SYSCALL = 24
PTRACE_GETREGS = 12
PTRACE_SETREGS = 13
PTRACE_SETOPTIONS = 0x4200
PTRACE_GET_SYSCALL_INFO = 0x420E
PTRACE_O_TRACESYSGOOD = 0x00000001
PTRACE_O_TRACEEXEC = 0x00000010
PTRACE_O_EXITKILL = 0x00100000
PTRACE_EVENT_EXEC = 4
PTRACE_SYSCALL_INFO_ENTRY = 1
PTRACE_SYSCALL_INFO_EXIT = 2
PTRACE_SYSCALL_STOP = signal.SIGTRAP | 0x80
WORKLOAD_CURRENT_DRIVER = "current_driver"
WORKLOAD_DRY_COMPILE = "dry_compile"
WORKLOAD_BOOTSTRAP_STAGE23_PHASE = "bootstrap_stage23_phase"
WORKLOAD_KINDS = (
    WORKLOAD_CURRENT_DRIVER,
    WORKLOAD_DRY_COMPILE,
    WORKLOAD_BOOTSTRAP_STAGE23_PHASE,
)
ATTACK_CHILD_COUNT = 2
ATTACK_CHILD_BYTES = 734_003_200
ATTACK_AGGREGATE_BYTES = ATTACK_CHILD_COUNT * ATTACK_CHILD_BYTES
ZERO_SHA256 = "0" * 64
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
RUNTIME_ID_RE = re.compile(r"^cheng-hardcap-[0-9a-f]{32}$")
FIXED_TARGET_ENV = (
    "HOME=/nonexistent",
    "LANG=C",
    "LC_ALL=C",
    "PATH=/usr/bin:/bin",
    "TZ=UTC",
)
DRY_TARGET_ENV = (
    *FIXED_TARGET_ENV,
    "BACKEND_JOBS=1",
    f"CHENG_PROCESS_MAX_RSS_BYTES={LIMIT_BYTES}",
)
CURRENT_DRIVER_GUEST_PATH = "/cheng-hardcap/current-driver"
CURRENT_SOURCE_GUEST_PATH = "/cheng-current-source/repo"
STAGE23_SOURCE_GUEST_PATH = "/cheng-stage23-source/repo"
STAGE23_EVIDENCE_GUEST_PATH = "/cheng-stage23-evidence"
STAGE23_CONTROL_GUEST_PATH = "/cheng-stage23-control"
STAGE23_EXECUTION_GUEST_PATH = (
    STAGE23_CONTROL_GUEST_PATH + "/stage-input-manifest.json"
)
STAGE23_MANIFEST_PAIR_GUEST_PATH = (
    STAGE23_CONTROL_GUEST_PATH + "/manifest-pair-commitment.json"
)
GENERATED_ARGV_DIRECTORY_GUEST_PATH = (
    "/cheng-hardcap-control/compiler-generated-argv"
)
CONTROL_GUEST_PATH = "/cheng-hardcap-control"
WORK_GUEST_PATH = "/cheng-hardcap-work"
CURRENT_DRIVER_NEXT_GUEST_PATH = WORK_GUEST_PATH + "/current-driver.next"
CURRENT_DRIVER_REPORT_GUEST_PATH = WORK_GUEST_PATH + "/current-driver.report"
CURRENT_DRIVER_NEXT_AUTHORITY_GUEST_PATH = (
    CONTROL_GUEST_PATH + "/current-driver.next"
)
CURRENT_DRIVER_REPORT_AUTHORITY_GUEST_PATH = (
    CONTROL_GUEST_PATH + "/current-driver.report"
)
DRY_OUTPUT_GUEST_PATH = WORK_GUEST_PATH + "/dry-output"
DRY_REPORT_GUEST_PATH = WORK_GUEST_PATH + "/dry-compile.report"
DRY_OUTPUT_AUTHORITY_GUEST_PATH = CONTROL_GUEST_PATH + "/dry-output"
DRY_REPORT_AUTHORITY_GUEST_PATH = CONTROL_GUEST_PATH + "/dry-compile.report"
LEDGER_PYTHON_GUEST_PATH = "/usr/bin/python3"
LEDGER_PRODUCER_GUEST_PATH = CONTROL_GUEST_PATH + "/ptrace-ledger-producer.py"
LEDGER_VALIDATOR_GUEST_PATH = CONTROL_GUEST_PATH + "/ptrace-ledger-validator.py"
LEDGER_WRAPPER_GUEST_PATH = CONTROL_GUEST_PATH + "/exec-ledger-wrapper"
LEDGER_MANIFEST_GUEST_PATH = CONTROL_GUEST_PATH + "/exec-ledger-manifest.json"
LEDGER_RECEIPT_GUEST_PATH = CONTROL_GUEST_PATH + "/exec-ledger-receipt.json"
LEDGER_VALIDATION_GUEST_PATH = CONTROL_GUEST_PATH + "/exec-ledger-validation.out"
LEDGER_WRAPPER_RECEIPT_GUEST_PATH = (
    CONTROL_GUEST_PATH + "/exec-ledger-wrapper-receipt.kv"
)
LEDGER_PRODUCER_STDOUT_GUEST_PATH = (
    CONTROL_GUEST_PATH + "/exec-ledger-producer.stdout"
)
LEDGER_PRODUCER_STDERR_GUEST_PATH = (
    CONTROL_GUEST_PATH + "/exec-ledger-producer.stderr"
)
LEDGER_VALIDATOR_STDOUT_GUEST_PATH = (
    CONTROL_GUEST_PATH + "/exec-ledger-validator.stdout"
)
LEDGER_VALIDATOR_STDERR_GUEST_PATH = (
    CONTROL_GUEST_PATH + "/exec-ledger-validator.stderr"
)
SUPERVISOR_GUEST_PATH = CONTROL_GUEST_PATH + "/supervisor.sh"
LEDGER_EXPECTED_EXIT_CODE = 0
MAX_LEDGER_EXECUTABLES = 512

SUPERVISOR_SCRIPT = r'''set -u
mode=$1
nonce=$2
shift 2
events=/cheng-hardcap-control/events
commands=/cheng-hardcap-control/commands
exec 3>/cheng-hardcap-control/stdout.bin
exec 4>/cheng-hardcap-control/stderr.bin
exec 1>&3
exec 2>&4
printf 'before %s %s\n' "$nonce" "$$" >"$events"
IFS= read -r start_line <"$commands"
if [ "$start_line" != "start $nonce" ]; then
  exit 95
fi
if [ "$mode" = workload ]; then
  # Gate the target behind a FIFO so the live during-audit observes
  # the original /bin/bash image before the stage gate can exec python3.
  # This is a scheduling gate, not a signal injection; the ptrace ledger
  # contract forbids unexpected SIGSTOP/SIGTRAP.
  target_gate=/cheng-hardcap-control/target-go
  mkfifo "$target_gate"
  release_target_gate() {
    exec 5>"$target_gate"
    /usr/bin/python3 -I -S -B -c 'import os; os.unlink("/cheng-hardcap-control/target-go")'
    printf 'go\n' >&5
    exec 5>&-
  }
  /bin/bash -c 'IFS= read -r token < /cheng-hardcap-control/target-go; [ "$token" = go ] || exit 91; exec "$@"' bash "$@" >&3 2>&4 &
  target_pid=$!
  printf 'during %s %s\n' "$nonce" "$target_pid" >"$events"
  IFS= read -r continue_line <"$commands"
  if [ "$continue_line" != "continue $nonce" ]; then
    release_target_gate
    exit 92
  fi
  release_target_gate
  wait "$target_pid"
  workload_rc=$?
  printf 'after %s %s\n' "$nonce" "$workload_rc" >"$events"
  IFS= read -r release_line <"$commands"
  if [ "$release_line" != "release $nonce" ]; then
    exit 93
  fi
  exit "$workload_rc"
fi
if [ "$mode" = aggregate_oom_probe ]; then
  ready=/cheng-hardcap-work/ready
  start_a=/cheng-hardcap-work/start-a
  start_b=/cheng-hardcap-work/start-b
  mkfifo "$ready" "$start_a" "$start_b"
  exec 5<>"$ready"
  /bin/sh -c 'printf "a\n" >&5; IFS= read -r token <"$1"; [ "$token" = go ] || exit 91; exec /bin/dd if=/dev/zero of=/cheng-hardcap-work/a bs=1048576 count=700' attack "$start_a" >&3 2>&4 &
  child_a=$!
  /bin/sh -c 'printf "b\n" >&5; IFS= read -r token <"$1"; [ "$token" = go ] || exit 91; exec /bin/dd if=/dev/zero of=/cheng-hardcap-work/b bs=1048576 count=700' attack "$start_b" >&3 2>&4 &
  child_b=$!
  IFS= read -r first <&5
  IFS= read -r second <&5
  if [ "$first" = "$second" ]; then
    exit 90
  fi
  printf 'during %s %s %s\n' "$nonce" "$child_a" "$child_b" >"$events"
  IFS= read -r continue_line <"$commands"
  if [ "$continue_line" != "continue $nonce" ]; then
    exit 92
  fi
  printf 'go\n' >"$start_a"
  printf 'go\n' >"$start_b"
  wait "$child_a"
  wait "$child_b"
  exit 96
fi
exit 94
'''


class GateError(RuntimeError):
    pass


@dataclass(frozen=True)
class ToolIdentity:
    path: Path
    sha256: str
    device: int
    inode: int
    mode: int


class X86UserRegs(ctypes.Structure):
    _fields_ = [
        (name, ctypes.c_ulonglong)
        for name in (
            "r15", "r14", "r13", "r12", "rbp", "rbx", "r11", "r10",
            "r9", "r8", "rax", "rcx", "rdx", "rsi", "rdi", "orig_rax",
            "rip", "cs", "eflags", "rsp", "ss", "fs_base", "gs_base",
            "ds", "es", "fs", "gs",
        )
    ]


@dataclass
class RuntimePaths:
    evidence: Path
    control: Path
    event_fifo: Path
    command_fifo: Path
    stdout: Path
    stderr: Path
    bundle: Path
    config: Path
    state_root: Path
    pid_file: Path
    source_root: Path
    stage_control: Path
    stage_execution_manifest: Path
    stage_manifest_pair_commitment: Path
    supervisor: Path
    ledger_producer: Path
    ledger_validator: Path
    ledger_wrapper: Path
    ledger_manifest: Path
    ledger_receipt: Path
    ledger_validation: Path
    ledger_wrapper_receipt: Path
    ledger_producer_stdout: Path
    ledger_producer_stderr: Path
    ledger_validator_stdout: Path
    ledger_validator_stderr: Path
    current_driver_next: Path
    current_driver_report: Path
    dry_report: Path


@dataclass
class RuntimeLifecycle:
    crun: Path
    state_root: Path
    bundle: Path
    pid_file: Path
    runtime_id: str
    state: str = "configured"

    def create_argv(self) -> list[str]:
        if self.state != "configured":
            raise GateError("runtime create transition is invalid")
        return [
            str(self.crun),
            "--root",
            str(self.state_root),
            "create",
            "--bundle",
            str(self.bundle),
            "--pid-file",
            str(self.pid_file),
            self.runtime_id,
        ]

    def mark_created(self) -> None:
        if self.state != "configured":
            raise GateError("runtime created transition is invalid")
        self.state = "created"

    def start_argv(self) -> list[str]:
        if self.state != "created":
            raise GateError("runtime start before successful create is forbidden")
        return [
            str(self.crun),
            "--root",
            str(self.state_root),
            "start",
            self.runtime_id,
        ]

    def mark_started(self) -> None:
        if self.state != "created":
            raise GateError("runtime started transition is invalid")
        self.state = "started"


def load_validator() -> Any:
    spec = importlib.util.spec_from_file_location(
        "cheng_native_hard_memory_validator",
        VALIDATOR_PATH,
    )
    if spec is None or spec.loader is None:
        raise GateError("validator module cannot be loaded")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def sha256_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def canonical_json(value: Any) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")


def framed_sha256(values: Iterable[str]) -> str:
    digest = hashlib.sha256()
    for value in values:
        raw = value.encode("utf-8")
        digest.update(len(raw).to_bytes(8, "big"))
        digest.update(raw)
    return digest.hexdigest()


def ledger_framed_sha256(values: Iterable[str]) -> str:
    digest = hashlib.sha256()
    count = 0
    for value in values:
        count += 1
        raw = os.fsencode(value)
        digest.update(len(raw).to_bytes(8, "big"))
        digest.update(raw)
    digest.update(count.to_bytes(8, "big"))
    return digest.hexdigest()


def write_exclusive(path: Path, raw: bytes, mode: int = 0o600) -> None:
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_CLOEXEC", 0)
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(path, flags, mode)
    try:
        observed = 0
        while observed < len(raw):
            observed += os.write(fd, raw[observed:])
        os.fsync(fd)
    finally:
        os.close(fd)


def overwrite_owned_file(path: Path, raw: bytes) -> None:
    flags = os.O_WRONLY | os.O_TRUNC | getattr(os, "O_CLOEXEC", 0)
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(path, flags)
    try:
        observed = 0
        while observed < len(raw):
            observed += os.write(fd, raw[observed:])
        os.fsync(fd)
    finally:
        os.close(fd)


def exact_existing_file(path: Path, label: str) -> Path:
    if not path.is_absolute() or path.resolve(strict=True) != path:
        raise GateError(f"{label} is not an absolute canonical file")
    info = os.stat(path, follow_symlinks=False)
    if not stat.S_ISREG(info.st_mode):
        raise GateError(f"{label} is not a regular file")
    return path


def exact_existing_dir(path: Path, label: str) -> Path:
    if not path.is_absolute() or path.resolve(strict=True) != path:
        raise GateError(f"{label} is not an absolute canonical directory")
    info = os.stat(path, follow_symlinks=False)
    if not stat.S_ISDIR(info.st_mode):
        raise GateError(f"{label} is not a directory")
    return path


def exact_absent_path(path: Path, label: str) -> Path:
    if not path.is_absolute() or path.exists() or path.is_symlink():
        raise GateError(f"{label} must be an absent absolute path")
    if path.parent.resolve(strict=True) != path.parent:
        raise GateError(f"{label} parent is not canonical")
    return path


def tool_identity(path: Path, label: str, validator: Any) -> ToolIdentity:
    file = validator.stable_read(path, label, 256 * 1024 * 1024)
    if not file.mode & stat.S_IXUSR:
        raise GateError(f"{label} is not executable")
    if file.mode & (stat.S_ISUID | stat.S_ISGID):
        raise GateError(f"{label} has privileged mode bits")
    try:
        capability = os.getxattr(path, "security.capability")
    except AttributeError as exc:
        raise GateError(f"{label} capability API is unavailable") from exc
    except OSError as exc:
        allowed = {errno.ENODATA}
        if hasattr(errno, "ENOATTR"):
            allowed.add(errno.ENOATTR)
        if exc.errno not in allowed:
            raise GateError(f"{label} capability read failed") from exc
        capability = b""
    if capability:
        raise GateError(f"{label} has file capabilities")
    return ToolIdentity(
        path=path,
        sha256=file.sha256,
        device=file.device,
        inode=file.inode,
        mode=file.mode,
    )


def run_checked(
    argv: Sequence[str],
    *,
    timeout: int,
    stdout_path: Path | None = None,
    stderr_path: Path | None = None,
) -> tuple[bytes, bytes]:
    completed = subprocess.run(
        list(argv),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env={
            "HOME": "/nonexistent",
            "LANG": "C",
            "LC_ALL": "C",
            "PATH": "/usr/bin:/bin",
            "TZ": "UTC",
        },
        timeout=timeout,
        check=False,
    )
    if stdout_path is not None:
        write_exclusive(stdout_path, completed.stdout)
    if stderr_path is not None:
        write_exclusive(stderr_path, completed.stderr)
    if completed.returncode != 0 or completed.stderr:
        message = completed.stderr.decode("utf-8", "replace")[:2000]
        raise GateError(
            f"command failed rc={completed.returncode} stderr={message!r}",
        )
    return completed.stdout, completed.stderr


def read_detached_command_output(file: Any, label: str) -> bytes:
    before = os.fstat(file.fileno())
    if (
        not stat.S_ISREG(before.st_mode)
        or before.st_uid != os.geteuid()
        or before.st_gid != os.getegid()
        or before.st_size < 0
        or before.st_size > 2 * 1024 * 1024
    ):
        raise GateError(f"{label} detached output identity is invalid")
    raw = os.pread(file.fileno(), before.st_size + 1, 0)
    after = os.fstat(file.fileno())
    if (
        len(raw) != before.st_size
        or (
            after.st_dev,
            after.st_ino,
            after.st_mode,
            after.st_uid,
            after.st_gid,
            after.st_size,
            after.st_mtime_ns,
            after.st_ctime_ns,
        ) != (
            before.st_dev,
            before.st_ino,
            before.st_mode,
            before.st_uid,
            before.st_gid,
            before.st_size,
            before.st_mtime_ns,
            before.st_ctime_ns,
        )
    ):
        raise GateError(f"{label} detached output changed while reading")
    return raw


def run_checked_detached(
    argv: Sequence[str],
    *,
    timeout: int,
    stdout_path: Path,
    stderr_path: Path,
) -> tuple[bytes, bytes]:
    scratch_directory = stdout_path.parent
    if (
        not scratch_directory.is_absolute()
        or not scratch_directory.is_dir()
        or scratch_directory.is_symlink()
        or stderr_path.parent != scratch_directory
        or stdout_path == stderr_path
        or stdout_path.exists()
        or stdout_path.is_symlink()
        or stderr_path.exists()
        or stderr_path.is_symlink()
    ):
        raise GateError("detached command output authority is invalid")
    flags = os.O_RDWR | os.O_CREAT | os.O_EXCL | getattr(os, "O_CLOEXEC", 0)
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    stdout_fd = os.open(stdout_path, flags, 0o600)
    try:
        stderr_fd = os.open(stderr_path, flags, 0o600)
    except BaseException:
        os.close(stdout_fd)
        raise
    with os.fdopen(stdout_fd, "w+b") as stdout_file, os.fdopen(
        stderr_fd,
        "w+b",
    ) as stderr_file:
        completed = subprocess.run(
            list(argv),
            stdin=subprocess.DEVNULL,
            stdout=stdout_file,
            stderr=stderr_file,
            env={
                "HOME": "/nonexistent",
                "LANG": "C",
                "LC_ALL": "C",
                "PATH": "/usr/bin:/bin",
                "TZ": "UTC",
            },
            timeout=timeout,
            check=False,
        )
        stdout = read_detached_command_output(
            stdout_file,
            "detached command stdout",
        )
        stderr = read_detached_command_output(
            stderr_file,
            "detached command stderr",
        )
    if completed.returncode != 0:
        message = stderr.decode("utf-8", "replace")[:2000]
        raise GateError(
            f"detached command failed rc={completed.returncode} "
            f"stderr={message!r}",
        )
    return stdout, stderr


def ptrace_call(
    request: int,
    pid: int,
    address: int | ctypes.c_void_p = 0,
    data: int | ctypes.c_void_p = 0,
) -> int:
    libc = ctypes.CDLL(None, use_errno=True)
    function = getattr(libc, "ptrace", None)
    if function is None:
        raise GateError("libc ptrace is unavailable")
    function.restype = ctypes.c_long
    address_arg = (
        address if isinstance(address, ctypes.c_void_p)
        else ctypes.c_void_p(address)
    )
    data_arg = data if isinstance(data, ctypes.c_void_p) else ctypes.c_void_p(data)
    ctypes.set_errno(0)
    result = function(
        ctypes.c_ulong(request),
        ctypes.c_ulong(pid),
        address_arg,
        data_arg,
    )
    observed_errno = ctypes.get_errno()
    if result == -1 and observed_errno:
        raise GateError(
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
    libc = ctypes.CDLL(None, use_errno=True)
    function = getattr(libc, "ptrace", None)
    if function is None:
        raise GateError("libc ptrace is unavailable")
    function.restype = ctypes.c_long
    ctypes.set_errno(0)
    result = function(
        ctypes.c_ulong(request),
        ctypes.c_ulong(pid),
        ctypes.c_void_p(address),
        ctypes.cast(pointer, ctypes.c_void_p),
    )
    observed_errno = ctypes.get_errno()
    if result == -1 and observed_errno:
        raise GateError(
            f"ptrace request {request:#x} failed for pid {pid}: "
            f"{os.strerror(observed_errno)}"
        )
    return int(result)


def ptrace_peek_word(pid: int, address: int) -> bytes:
    libc = ctypes.CDLL(None, use_errno=True)
    function = getattr(libc, "ptrace", None)
    if function is None:
        raise GateError("libc ptrace is unavailable")
    function.restype = ctypes.c_long
    ctypes.set_errno(0)
    result = function(
        ctypes.c_ulong(PTRACE_PEEKDATA),
        ctypes.c_ulong(pid),
        ctypes.c_void_p(address),
        ctypes.c_void_p(0),
    )
    observed_errno = ctypes.get_errno()
    if result == -1 and observed_errno:
        raise GateError(
            f"ptrace PEEKDATA failed for pid {pid}: "
            f"{os.strerror(observed_errno)}"
        )
    mask = (1 << (8 * ctypes.sizeof(ctypes.c_long))) - 1
    return (int(result) & mask).to_bytes(
        ctypes.sizeof(ctypes.c_long),
        sys.byteorder,
    )


def ptrace_read_bytes(pid: int, address: int, size: int) -> bytes:
    if address <= 0 or size <= 0 or size > CRUN_CLONE3_ARGUMENT_BYTES:
        raise GateError("clone3 tracee memory range is invalid")
    result = bytearray()
    while len(result) < size:
        result.extend(ptrace_peek_word(pid, address + len(result)))
    return bytes(result[:size])


def ptrace_syscall_info(pid: int) -> tuple[int, int, tuple[int, ...]]:
    buffer = ctypes.create_string_buffer(88)
    size = ptrace_pointer_call(
        PTRACE_GET_SYSCALL_INFO,
        pid,
        ctypes.sizeof(buffer),
        ctypes.byref(buffer),
    )
    if size < 32:
        raise GateError("PTRACE_GET_SYSCALL_INFO returned a short record")
    raw = buffer.raw
    operation = raw[0]
    arch = int.from_bytes(raw[4:8], sys.byteorder)
    if operation == PTRACE_SYSCALL_INFO_ENTRY:
        if size < 80:
            raise GateError("clone3 syscall entry record is truncated")
        syscall_number = int.from_bytes(raw[24:32], sys.byteorder)
        arguments = tuple(
            int.from_bytes(raw[offset:offset + 8], sys.byteorder)
            for offset in range(32, 80, 8)
        )
        return operation, arch, (syscall_number, *arguments)
    if operation == PTRACE_SYSCALL_INFO_EXIT:
        if size < 33:
            raise GateError("clone3 syscall exit record is truncated")
        return_value = int.from_bytes(
            raw[24:32], sys.byteorder, signed=True
        )
        return operation, arch, (return_value, raw[32])
    raise GateError(f"unexpected ptrace syscall operation: {operation}")


def exact_crun_clone3_fast_path(raw: bytes, size: int) -> bool:
    if len(raw) < 8:
        raise GateError("clone3 flags are truncated")
    flags = int.from_bytes(raw[:8], sys.byteorder)
    if flags != CRUN_CLONE3_EXACT_FLAGS:
        return False
    if size != CRUN_CLONE3_ARGUMENT_BYTES or len(raw) != size:
        raise GateError("crun clone3 argument size drifted")
    values = tuple(
        int.from_bytes(raw[offset:offset + 8], sys.byteorder)
        for offset in range(0, size, 8)
    )
    if (
        values[0] != CRUN_CLONE3_EXACT_FLAGS
        or values[1:4] != (0, 0, 0)
        or values[4] != signal.SIGCHLD
        or values[5:10] != (0, 0, 0, 0, 0)
        or values[10] <= 2
    ):
        raise GateError("crun clone3 fast-path arguments drifted")
    return True


def ptrace_replace_exact_clone3_with_enosys(pid: int) -> None:
    registers = X86UserRegs()
    ptrace_pointer_call(PTRACE_GETREGS, pid, 0, ctypes.byref(registers))
    if registers.orig_rax != CRUN_CLONE3_SYSCALL_X86_64:
        raise GateError("clone3 register identity drifted")
    registers.orig_rax = (1 << 64) - 1
    ptrace_pointer_call(PTRACE_SETREGS, pid, 0, ctypes.byref(registers))


def tracee_executable_sha256(pid: int) -> str:
    path = Path(f"/proc/{pid}/exe")
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_CLOEXEC", 0))
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or not 0 < before.st_size <= \
                256 * 1024 * 1024:
            raise GateError("crun tracee executable identity is invalid")
        digest = hashlib.sha256()
        observed = 0
        while observed < before.st_size:
            chunk = os.read(fd, min(1024 * 1024, before.st_size - observed))
            if not chunk:
                raise GateError("crun tracee executable read was truncated")
            digest.update(chunk)
            observed += len(chunk)
        after = os.fstat(fd)
        if (
            observed != before.st_size
            or (
                after.st_dev,
                after.st_ino,
                after.st_mode,
                after.st_uid,
                after.st_gid,
                after.st_size,
                after.st_mtime_ns,
                after.st_ctime_ns,
            ) != (
                before.st_dev,
                before.st_ino,
                before.st_mode,
                before.st_uid,
                before.st_gid,
                before.st_size,
                before.st_mtime_ns,
                before.st_ctime_ns,
            )
        ):
            raise GateError("crun tracee executable changed during read")
        return digest.hexdigest()
    finally:
        os.close(fd)


def trace_crun_create_exact_clone3_policy(
    pid: int, timeout: int, expected_crun_sha256: str
) -> tuple[int, int, int]:
    if platform.system() != "Linux" or platform.machine() != "x86_64":
        raise GateError("crun clone3 policy requires native Linux x86_64")
    if not SHA256_RE.fullmatch(expected_crun_sha256):
        raise GateError("crun clone3 policy executable identity is invalid")
    initial_pid, initial_status = os.waitpid(pid, 0)
    if (
        initial_pid != pid
        or not os.WIFSTOPPED(initial_status)
        or os.WSTOPSIG(initial_status) != signal.SIGSTOP
    ):
        raise GateError("crun tracer initial stop is invalid")
    ptrace_call(
        PTRACE_SETOPTIONS,
        pid,
        0,
        PTRACE_O_TRACESYSGOOD | PTRACE_O_TRACEEXEC | PTRACE_O_EXITKILL,
    )
    prior_handler = signal.getsignal(signal.SIGALRM)
    prior_timer = signal.getitimer(signal.ITIMER_REAL)
    if prior_timer != (0.0, 0.0):
        raise GateError("crun tracer inherited an active timer")

    def timeout_handler(_signum: int, _frame: Any) -> None:
        raise TimeoutError("crun create ptrace policy timed out")

    signal.signal(signal.SIGALRM, timeout_handler)
    signal.setitimer(signal.ITIMER_REAL, timeout)
    pending = False
    intercepted = 0
    exec_transition_count = 0
    exit_code: int | None = None
    ptrace_call(PTRACE_SYSCALL, pid, 0, 0)
    try:
        while True:
            waited_pid, status = os.waitpid(pid, 0)
            if waited_pid != pid:
                raise GateError("crun tracer observed a foreign child")
            if os.WIFEXITED(status):
                if pending:
                    raise GateError("crun exited during clone3 interception")
                exit_code = os.WEXITSTATUS(status)
                break
            if os.WIFSIGNALED(status):
                exit_code = -os.WTERMSIG(status)
                break
            if not os.WIFSTOPPED(status):
                raise GateError("crun tracer observed an invalid wait status")
            stop_signal = os.WSTOPSIG(status)
            if stop_signal == PTRACE_SYSCALL_STOP:
                operation, arch, info = ptrace_syscall_info(pid)
                if arch != AUDIT_ARCH_X86_64:
                    raise GateError("crun syscall architecture drifted")
                if operation == PTRACE_SYSCALL_INFO_ENTRY:
                    syscall_number = info[0]
                    if pending:
                        raise GateError("clone3 interception missed syscall exit")
                    if syscall_number == CRUN_CLONE3_SYSCALL_X86_64:
                        address, size = info[1], info[2]
                        prefix = ptrace_read_bytes(pid, address, 8)
                        if int.from_bytes(prefix, sys.byteorder) == \
                                CRUN_CLONE3_EXACT_FLAGS:
                            if size != CRUN_CLONE3_ARGUMENT_BYTES:
                                raise GateError(
                                    "crun clone3 argument size drifted"
                                )
                            raw = ptrace_read_bytes(pid, address, size)
                            if not exact_crun_clone3_fast_path(raw, size):
                                raise GateError("exact clone3 policy did not match")
                            ptrace_replace_exact_clone3_with_enosys(pid)
                            pending = True
                elif operation == PTRACE_SYSCALL_INFO_EXIT and pending:
                    if info != (-errno.ENOSYS, 1):
                        raise GateError("clone3 policy did not return exact ENOSYS")
                    pending = False
                    intercepted += 1
                    if intercepted != 1:
                        raise GateError("crun clone3 fast path repeated")
                ptrace_call(PTRACE_SYSCALL, pid, 0, 0)
            elif stop_signal == signal.SIGTRAP:
                if (
                    status >> 16 != PTRACE_EVENT_EXEC
                    or tracee_executable_sha256(pid) != expected_crun_sha256
                ):
                    raise GateError(
                        "crun tracer observed an unexpected SIGTRAP "
                        f"event={status >> 16}"
                    )
                exec_transition_count += 1
                if exec_transition_count > CRUN_EXACT_EXEC_TRANSITIONS:
                    raise GateError("crun executable transition count drifted")
                ptrace_call(PTRACE_SYSCALL, pid, 0, 0)
            else:
                ptrace_call(PTRACE_SYSCALL, pid, 0, stop_signal)
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, prior_handler)
    if exit_code is None:
        raise GateError("crun tracer lost the root exit status")
    if exec_transition_count != CRUN_EXACT_EXEC_TRANSITIONS:
        raise GateError("crun tracer did not observe exact exec transitions")
    return exit_code, intercepted, exec_transition_count


def run_crun_create_with_exact_clone3_policy(
    argv: Sequence[str],
    *,
    timeout: int,
    stdout_path: Path,
    stderr_path: Path,
    expected_crun_sha256: str,
) -> tuple[bytes, bytes, int, int]:
    if (
        len(argv) != 9
        or argv[1] != "--root"
        or argv[3] != "create"
        or argv[4] != "--bundle"
        or argv[6] != "--pid-file"
    ):
        raise GateError("crun create argv is outside the exact policy")
    scratch_directory = stdout_path.parent
    if (
        not scratch_directory.is_absolute()
        or not scratch_directory.is_dir()
        or scratch_directory.is_symlink()
        or stderr_path.parent != scratch_directory
        or stdout_path == stderr_path
        or stdout_path.exists()
        or stdout_path.is_symlink()
        or stderr_path.exists()
        or stderr_path.is_symlink()
    ):
        raise GateError("crun create output authority is invalid")
    flags = os.O_RDWR | os.O_CREAT | os.O_EXCL | getattr(os, "O_CLOEXEC", 0)
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    stdout_fd = os.open(stdout_path, flags, 0o600)
    try:
        stderr_fd = os.open(stderr_path, flags, 0o600)
    except BaseException:
        os.close(stdout_fd)
        raise
    child_pid = -1
    with os.fdopen(stdout_fd, "w+b") as stdout_file, os.fdopen(
        stderr_fd, "w+b"
    ) as stderr_file:
        child_pid = os.fork()
        if child_pid == 0:
            try:
                stdin_fd = os.open("/dev/null", os.O_RDONLY)
                os.dup2(stdin_fd, 0)
                os.dup2(stdout_file.fileno(), 1)
                os.dup2(stderr_file.fileno(), 2)
                os.closerange(3, int(os.sysconf("SC_OPEN_MAX")))
                ptrace_call(PTRACE_TRACEME, 0, 0, 0)
                os.kill(os.getpid(), signal.SIGSTOP)
                os.execve(argv[0], list(argv), {
                    "HOME": "/nonexistent",
                    "LANG": "C",
                    "LC_ALL": "C",
                    "PATH": "/usr/bin:/bin",
                    "TZ": "UTC",
                })
            except BaseException as exc:
                try:
                    os.write(2, ("crun tracer child failure: " + str(exc)).encode())
                finally:
                    os._exit(127)
        try:
            exit_code, intercepted, exec_transition_count = (
                trace_crun_create_exact_clone3_policy(
                    child_pid, timeout, expected_crun_sha256
                )
            )
        except BaseException:
            try:
                os.kill(child_pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            try:
                os.waitpid(child_pid, 0)
            except ChildProcessError:
                pass
            raise
        stdout = read_detached_command_output(
            stdout_file, "crun create stdout"
        )
        stderr = read_detached_command_output(
            stderr_file, "crun create stderr"
        )
    if exit_code != 0 or stderr:
        raise GateError(
            f"crun create failed under exact clone3 policy rc={exit_code}: "
            + stderr.decode("utf-8", "replace")[:2000]
        )
    if intercepted != 1:
        raise GateError("crun exact clone3 fast path was not intercepted once")
    return stdout, stderr, intercepted, exec_transition_count


def write_control(path: Path, value: str) -> None:
    flags = os.O_WRONLY | getattr(os, "O_CLOEXEC", 0)
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(path, flags)
    try:
        raw = value.encode("ascii")
        if os.write(fd, raw) != len(raw):
            raise GateError("cgroup control short write")
    finally:
        os.close(fd)
    observed = path.read_text(encoding="utf-8").strip()
    if observed != value:
        raise GateError(f"cgroup control readback mismatch: {path.name}")


def write_only_control(path: Path, value: str) -> None:
    flags = os.O_WRONLY | getattr(os, "O_CLOEXEC", 0)
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(path, flags)
    try:
        raw = value.encode("ascii")
        if os.write(fd, raw) != len(raw):
            raise GateError("cgroup control short write")
    finally:
        os.close(fd)


def create_leaf(parent: Path, runtime_id: str) -> Path:
    leaf = parent / runtime_id
    if leaf.exists() or leaf.is_symlink():
        raise GateError("cgroup leaf path already exists")
    os.mkdir(leaf, 0o700)
    info = os.stat(leaf, follow_symlinks=False)
    if info.st_uid != os.geteuid() or not stat.S_ISDIR(info.st_mode):
        raise GateError("cgroup leaf ownership/type mismatch")
    write_control(leaf / "memory.max", str(LIMIT_BYTES))
    write_control(leaf / "memory.swap.max", str(SWAP_MAX_BYTES))
    write_control(leaf / "memory.oom.group", "1")
    write_control(leaf / "pids.max", str(PIDS_MAX))
    if (leaf / "cgroup.procs").read_text(encoding="utf-8").strip():
        raise GateError("fresh cgroup leaf is populated")
    if int((leaf / "memory.current").read_text(encoding="utf-8")) != 0:
        raise GateError("fresh cgroup leaf has charged memory")
    if int((leaf / "memory.swap.current").read_text(encoding="utf-8")) != 0:
        raise GateError("fresh cgroup leaf has charged swap")
    events = (leaf / "memory.events.local").read_text(
        encoding="utf-8",
    ).splitlines()
    if any(int(row.split()[1]) != 0 for row in events):
        raise GateError("fresh cgroup leaf has memory events")
    return leaf


def runtime_paths(evidence: Path) -> RuntimePaths:
    paths = runtime_path_values(evidence)
    evidence.mkdir(mode=0o700)
    paths.control.mkdir(mode=0o700)
    os.mkfifo(paths.event_fifo, 0o600)
    os.mkfifo(paths.command_fifo, 0o600)
    write_exclusive(paths.stdout, b"")
    write_exclusive(paths.stderr, b"")
    paths.bundle.mkdir(mode=0o700)
    paths.state_root.mkdir(mode=0o700)
    paths.source_root.mkdir(mode=0o700)
    paths.stage_control.mkdir(mode=0o700)
    return paths


def runtime_path_values(evidence: Path) -> RuntimePaths:
    control = evidence / "control"
    bundle = evidence / "runtime-bundle"
    return RuntimePaths(
        evidence=evidence,
        control=control,
        event_fifo=control / "events",
        command_fifo=control / "commands",
        stdout=control / "stdout.bin",
        stderr=control / "stderr.bin",
        bundle=bundle,
        config=bundle / "config.json",
        state_root=evidence / "runtime-state",
        pid_file=evidence / "init.pid",
        source_root=evidence / "source-root",
        stage_control=evidence / "stage-control",
        stage_execution_manifest=(
            evidence / "stage-control/stage-input-manifest.json"
        ),
        stage_manifest_pair_commitment=(
            evidence / "stage-control/manifest-pair-commitment.json"
        ),
        supervisor=control / "supervisor.sh",
        ledger_producer=control / "ptrace-ledger-producer.py",
        ledger_validator=control / "ptrace-ledger-validator.py",
        ledger_wrapper=control / "exec-ledger-wrapper",
        ledger_manifest=control / "exec-ledger-manifest.json",
        ledger_receipt=control / "exec-ledger-receipt.json",
        ledger_validation=control / "exec-ledger-validation.out",
        ledger_wrapper_receipt=control / "exec-ledger-wrapper-receipt.kv",
        ledger_producer_stdout=control / "exec-ledger-producer.stdout",
        ledger_producer_stderr=control / "exec-ledger-producer.stderr",
        ledger_validator_stdout=control / "exec-ledger-validator.stdout",
        ledger_validator_stderr=control / "exec-ledger-validator.stderr",
        current_driver_next=control / "current-driver.next",
        current_driver_report=control / "current-driver.report",
        dry_report=control / "dry-compile.report",
    )


def materialize_source_root(binding: Any, destination: Path, validator: Any) -> None:
    for relative, expected_sha, source_mode in binding.source_members:
        source = binding.workspace_root / relative
        current = validator.stable_read(
            source,
            "source closure materialization input",
            2 * 1024 * 1024 * 1024,
        )
        if current.sha256 != expected_sha or current.mode != source_mode:
            raise GateError("source closure changed before materialization")
        output = destination / relative
        output.parent.mkdir(parents=True, exist_ok=True, mode=0o500)
        write_exclusive(
            output,
            current.raw,
            0o500 if source_mode & 0o111 else 0o400,
        )
        copied = validator.stable_read(
            output,
            "materialized source closure member",
            2 * 1024 * 1024 * 1024,
        )
        if copied.sha256 != expected_sha:
            raise GateError("materialized source closure member mismatch")
    for directory in sorted(
        (path for path in destination.rglob("*") if path.is_dir()),
        key=lambda path: len(path.parts),
        reverse=True,
    ):
        directory.chmod(0o500)
    destination.chmod(0o500)


def oci_config(
    *,
    rootfs: Path,
    leaf_path: str,
    paths: RuntimePaths,
    source_root: Path,
    driver: Path | None,
    stage_source_root: Path | None,
    stage_evidence_root: Path | None,
    stage_manifest_pair_commitment: Path | None,
    mode: str,
    workload_kind: str,
    nonce: str,
    target_argv: Sequence[str],
    target_env: Sequence[str],
    workload_identity: dict[str, str] | None = None,
    ledger_identity: dict[str, str] | None = None,
    timeout: int = 300,
) -> dict[str, Any]:
    supervisor_argv = (
        "/bin/sh",
        SUPERVISOR_GUEST_PATH,
        mode,
        nonce,
        *target_argv,
    )
    if workload_kind not in WORKLOAD_KINDS:
        raise GateError("unknown workload contract")
    if mode == "workload":
        if ledger_identity is None or set(ledger_identity) != {
            "producer_sha256",
            "validator_sha256",
            "manifest_sha256",
        }:
            raise GateError("workload descendant ledger identity is absent")
        current_identity_keys = {
            "official_driver_sha256",
            "current_build_receipt_sha256",
            "source_closure_cid",
            "source_closure_capture_sha256",
            "source_manifest_sha256",
            "entry_source_sha256",
            "target",
            "entry_path",
        }
        stage_identity_keys = {
            "stage_authority_manifest_sha256",
            "stage_execution_manifest_sha256",
            "stage_manifest_pair_commitment_sha256",
            "stage_phase_plan_sha256",
        }
        expected_identity_keys = (
            stage_identity_keys
            if workload_kind == WORKLOAD_BOOTSTRAP_STAGE23_PHASE
            else current_identity_keys
        )
        if workload_identity is None or \
                set(workload_identity) != expected_identity_keys:
            raise GateError("workload immutable identity is absent")
        if workload_kind == WORKLOAD_CURRENT_DRIVER:
            target_output_executable = CURRENT_DRIVER_NEXT_GUEST_PATH
            target_output_report = CURRENT_DRIVER_REPORT_GUEST_PATH
            authority_output_executable = (
                CURRENT_DRIVER_NEXT_AUTHORITY_GUEST_PATH
            )
            authority_output_report = (
                CURRENT_DRIVER_REPORT_AUTHORITY_GUEST_PATH
            )
        elif workload_kind == WORKLOAD_DRY_COMPILE:
            target_output_executable = DRY_OUTPUT_GUEST_PATH
            target_output_report = DRY_REPORT_GUEST_PATH
            authority_output_executable = DRY_OUTPUT_AUTHORITY_GUEST_PATH
            authority_output_report = DRY_REPORT_AUTHORITY_GUEST_PATH
        else:
            target_output_executable = WORK_GUEST_PATH + "/stage-unused-output"
            target_output_report = WORK_GUEST_PATH + "/stage-unused-report"
            authority_output_executable = (
                CONTROL_GUEST_PATH + "/stage-unused-output"
            )
            authority_output_report = (
                CONTROL_GUEST_PATH + "/stage-unused-report"
            )
        args = (
            LEDGER_PYTHON_GUEST_PATH,
            "-I",
            "-S",
            "-B",
            LEDGER_WRAPPER_GUEST_PATH,
            "--producer",
            LEDGER_PRODUCER_GUEST_PATH,
            "--validator",
            LEDGER_VALIDATOR_GUEST_PATH,
            "--manifest",
            LEDGER_MANIFEST_GUEST_PATH,
            "--ledger-output",
            LEDGER_RECEIPT_GUEST_PATH,
            "--validation-output",
            LEDGER_VALIDATION_GUEST_PATH,
            "--wrapper-receipt",
            LEDGER_WRAPPER_RECEIPT_GUEST_PATH,
            "--producer-stdout",
            LEDGER_PRODUCER_STDOUT_GUEST_PATH,
            "--producer-stderr",
            LEDGER_PRODUCER_STDERR_GUEST_PATH,
            "--validator-stdout",
            LEDGER_VALIDATOR_STDOUT_GUEST_PATH,
            "--validator-stderr",
            LEDGER_VALIDATOR_STDERR_GUEST_PATH,
            "--target-stdout",
            CONTROL_GUEST_PATH + "/stdout.bin",
            "--target-stderr",
            CONTROL_GUEST_PATH + "/stderr.bin",
            "--workload-kind",
            workload_kind,
            "--target-output-executable",
            target_output_executable,
            "--target-output-report",
            target_output_report,
            "--authority-output-executable",
            authority_output_executable,
            "--authority-output-report",
            authority_output_report,
            "--expected-official-driver-sha256",
            workload_identity.get("official_driver_sha256", ZERO_SHA256),
            "--expected-current-build-receipt-sha256",
            workload_identity.get(
                "current_build_receipt_sha256",
                ZERO_SHA256,
            ),
            "--expected-source-closure-cid",
            workload_identity.get("source_closure_cid", ZERO_SHA256),
            "--expected-source-closure-capture-sha256",
            workload_identity.get(
                "source_closure_capture_sha256",
                ZERO_SHA256,
            ),
            "--expected-source-manifest-sha256",
            workload_identity.get("source_manifest_sha256", ZERO_SHA256),
            "--expected-entry-source-sha256",
            workload_identity.get("entry_source_sha256", ZERO_SHA256),
            "--expected-target",
            workload_identity.get("target", "not_applicable"),
            "--expected-entry-path",
            workload_identity.get("entry_path", "not_applicable"),
            "--expected-session-nonce",
            nonce,
            "--expected-producer-sha256",
            ledger_identity["producer_sha256"],
            "--expected-validator-sha256",
            ledger_identity["validator_sha256"],
            "--expected-manifest-sha256",
            ledger_identity["manifest_sha256"],
            "--expected-exit-code",
            str(LEDGER_EXPECTED_EXIT_CODE),
            "--timeout-seconds",
            str(timeout),
        )
        if workload_kind == WORKLOAD_BOOTSTRAP_STAGE23_PHASE:
            args = (
                *args,
                "--stage-input-manifest",
                STAGE23_EXECUTION_GUEST_PATH,
                "--stage-manifest-pair-commitment",
                STAGE23_MANIFEST_PAIR_GUEST_PATH,
                "--stage-evidence-dir",
                STAGE23_EVIDENCE_GUEST_PATH,
                "--expected-stage-authority-manifest-sha256",
                workload_identity["stage_authority_manifest_sha256"],
                "--expected-stage-input-manifest-sha256",
                workload_identity["stage_execution_manifest_sha256"],
                "--expected-stage-manifest-pair-commitment-sha256",
                workload_identity[
                    "stage_manifest_pair_commitment_sha256"
                ],
                "--expected-stage-plan-sha256",
                workload_identity["stage_phase_plan_sha256"],
            )
        args = (*args, "--", *supervisor_argv)
    else:
        if ledger_identity is not None or workload_identity is not None:
            raise GateError("aggregate attack cannot carry a ledger authority")
        args = supervisor_argv
    mounts: list[dict[str, Any]] = [
        {
            "destination": "/proc",
            "type": "proc",
            "source": "proc",
            "options": ["nosuid", "noexec", "nodev"],
        },
        {
            "destination": "/dev",
            "type": "tmpfs",
            "source": "tmpfs",
            "options": [
                "rw",
                "nosuid",
                "noexec",
                "size=65536",
                "mode=755",
            ],
        },
        {
            "destination": "/tmp",
            "type": "tmpfs",
            "source": "tmpfs",
            "options": [
                "rw",
                "nosuid",
                "nodev",
                "noexec",
                "size=268435456",
                "mode=1777",
            ],
        },
        {
            "destination": WORK_GUEST_PATH,
            "type": "tmpfs",
            "source": "tmpfs",
            "options": [
                "rw",
                "exec",
                "nosuid",
                "nodev",
                "size=2147483648",
                "mode=1777",
            ],
        },
        {
            "destination": CONTROL_GUEST_PATH,
            "type": "bind",
            "source": str(paths.control),
            "options": ["rbind", "rw", "nosuid", "nodev"],
        },
    ]
    if workload_kind == WORKLOAD_BOOTSTRAP_STAGE23_PHASE:
        if (
            stage_source_root is None
            or stage_evidence_root is None
            or stage_manifest_pair_commitment is None
        ):
            raise GateError("stage23 mount authority is absent")
        mounts.extend([
            {
                "destination": STAGE23_SOURCE_GUEST_PATH,
                "type": "bind",
                "source": str(stage_source_root),
                "options": ["rbind", "ro", "nosuid", "nodev"],
            },
            {
                "destination": STAGE23_EVIDENCE_GUEST_PATH,
                "type": "bind",
                "source": str(stage_evidence_root),
                "options": ["rbind", "rw", "nosuid", "nodev"],
            },
            {
                "destination": STAGE23_CONTROL_GUEST_PATH,
                "type": "bind",
                "source": str(paths.stage_control),
                "options": ["rbind", "ro", "nosuid", "nodev"],
            },
            {
                "destination": STAGE23_MANIFEST_PAIR_GUEST_PATH,
                "type": "bind",
                "source": str(stage_manifest_pair_commitment),
                "options": ["bind", "ro", "nosuid", "nodev"],
            },
        ])
    else:
        if (
            stage_source_root is not None
            or stage_evidence_root is not None
            or stage_manifest_pair_commitment is not None
        ):
            raise GateError("current workload carried stage23 mounts")
        mounts.append({
            "destination": CURRENT_SOURCE_GUEST_PATH,
            "type": "bind",
            "source": str(source_root),
            "options": ["rbind", "ro", "nosuid", "nodev"],
        })
    if driver is not None:
        mounts.append({
            "destination": CURRENT_DRIVER_GUEST_PATH,
            "type": "bind",
            "source": str(driver),
            "options": ["bind", "ro", "nosuid", "nodev"],
        })
    return {
        "ociVersion": "1.1.0",
        "process": {
            "terminal": False,
            "user": {
                "uid": 1,
                "gid": 1,
                "additionalGids": [],
            },
            "args": list(args),
            "env": list(target_env),
            "cwd": "/",
            "capabilities": {
                "bounding": [],
                "effective": [],
                "inheritable": [],
                "permitted": [],
                "ambient": [],
            },
            "noNewPrivileges": True,
            "rlimits": [{
                "type": "RLIMIT_CORE",
                "hard": 0,
                "soft": 0,
            }],
        },
        "root": {
            "path": str(rootfs),
            "readonly": True,
        },
        "hostname": "cheng-hardcap",
        "mounts": mounts,
        "linux": {
            "cgroupsPath": leaf_path,
            "uidMappings": [{
                "containerID": 1,
                "hostID": os.geteuid(),
                "size": 1,
            }],
            "gidMappings": [{
                "containerID": 1,
                "hostID": os.getegid(),
                "size": 1,
            }],
            "namespaces": [
                {"type": "mount"},
                {"type": "pid"},
                {"type": "ipc"},
                {"type": "uts"},
                {"type": "user"},
                {"type": "cgroup"},
                {"type": "network"},
            ],
            "maskedPaths": [
                "/proc/acpi",
                "/proc/asound",
                "/proc/kcore",
                "/proc/keys",
                "/proc/latency_stats",
                "/proc/timer_list",
                "/proc/timer_stats",
                "/proc/sched_debug",
                "/sys/firmware",
            ],
            "readonlyPaths": [
                "/proc/bus",
                "/proc/fs",
                "/proc/irq",
                "/proc/sys",
                "/proc/sysrq-trigger",
            ],
        },
    }


def validate_oci_config(
    value: dict[str, Any],
    *,
    leaf_path: str,
    rootfs: Path,
) -> None:
    linux = value.get("linux")
    process = value.get("process")
    root = value.get("root")
    if not isinstance(linux, dict) or not isinstance(process, dict) or \
            not isinstance(root, dict):
        raise GateError("OCI config core object is absent")
    if linux.get("cgroupsPath") != leaf_path or "resources" in linux:
        raise GateError("OCI config cgroup authority mismatch")
    if "hooks" in value or process.get("noNewPrivileges") is not True:
        raise GateError("OCI config privilege contract mismatch")
    capabilities = process.get("capabilities")
    if not isinstance(capabilities, dict) or any(capabilities.values()):
        raise GateError("OCI config capabilities are not empty")
    if root != {"path": str(rootfs), "readonly": True}:
        raise GateError("OCI config rootfs mismatch")
    mounts = value.get("mounts")
    if not isinstance(mounts, list):
        raise GateError("OCI config mount table is absent")
    mount_by_destination: dict[str, dict[str, Any]] = {}
    for mount in mounts:
        if (
            not isinstance(mount, dict)
            or not isinstance(mount.get("destination"), str)
            or mount["destination"] in mount_by_destination
        ):
            raise GateError("OCI config mount row is invalid")
        mount_by_destination[mount["destination"]] = mount
    if mount_by_destination.get("/dev") != {
        "destination": "/dev",
        "type": "tmpfs",
        "source": "tmpfs",
        "options": [
            "rw", "nosuid", "noexec", "size=65536", "mode=755",
        ],
    } or mount_by_destination.get("/tmp") != {
        "destination": "/tmp",
        "type": "tmpfs",
        "source": "tmpfs",
        "options": [
            "rw", "nosuid", "nodev", "noexec",
            "size=268435456", "mode=1777",
        ],
    } or mount_by_destination.get(WORK_GUEST_PATH) != {
        "destination": WORK_GUEST_PATH,
        "type": "tmpfs",
        "source": "tmpfs",
        "options": [
            "rw", "exec", "nosuid", "nodev",
            "size=2147483648", "mode=1777",
        ],
    }:
        raise GateError("OCI ephemeral filesystem authority mismatch")
    namespace_types = [
        item.get("type")
        for item in linux.get("namespaces", [])
        if isinstance(item, dict)
    ]
    if set(namespace_types) != {
        "mount",
        "pid",
        "ipc",
        "uts",
        "user",
        "cgroup",
        "network",
    } or len(namespace_types) != 7:
        raise GateError("OCI namespace contract mismatch")
    if linux.get("uidMappings") != [{
        "containerID": 1,
        "hostID": os.geteuid(),
        "size": 1,
    }] or linux.get("gidMappings") != [{
        "containerID": 1,
        "hostID": os.getegid(),
        "size": 1,
    }]:
        raise GateError("OCI user namespace mapping mismatch")
    if process.get("user") != {
        "uid": 1,
        "gid": 1,
        "additionalGids": [],
    }:
        raise GateError("OCI process must be the delegated non-root identity")


class FifoProtocol:
    def __init__(self, event_fifo: Path, command_fifo: Path):
        self.event_fd = -1
        self.command_fd = -1
        try:
            self.event_fd = os.open(
                event_fifo,
                os.O_RDWR | os.O_NONBLOCK | getattr(os, "O_CLOEXEC", 0),
            )
            self.command_fd = os.open(
                command_fifo,
                os.O_RDWR | getattr(os, "O_CLOEXEC", 0),
            )
        except BaseException:
            self.close()
            raise
        self.buffer = bytearray()

    def close(self) -> None:
        errors: list[str] = []
        for field, label in (
            ("event_fd", "event"),
            ("command_fd", "command"),
        ):
            descriptor = getattr(self, field)
            setattr(self, field, -1)
            if descriptor < 0:
                continue
            try:
                os.close(descriptor)
            except BaseException as exc:
                errors.append(label + "=" + str(exc))
        if errors:
            raise GateError("control protocol close failed: " + "; ".join(errors))

    def send(self, value: str) -> None:
        raw = (value + "\n").encode("ascii")
        if os.write(self.command_fd, raw) != len(raw):
            raise GateError("control protocol short write")

    def read(self, timeout: int, runtime_pid: int) -> str:
        if runtime_pid <= 0 or not hasattr(os, "pidfd_open"):
            raise GateError("control protocol runtime liveness is unavailable")
        try:
            runtime_pid_fd = os.pidfd_open(runtime_pid, 0)
        except OSError as exc:
            raise GateError(
                "control protocol runtime process is not live"
            ) from exc
        selector = selectors.DefaultSelector()
        selector.register(self.event_fd, selectors.EVENT_READ)
        selector.register(runtime_pid_fd, selectors.EVENT_READ)
        deadline = time.monotonic() + timeout
        try:
            while True:
                newline = self.buffer.find(b"\n")
                if newline >= 0:
                    raw = bytes(self.buffer[:newline])
                    del self.buffer[:newline + 1]
                    return raw.decode("ascii", "strict")
                remaining = deadline - time.monotonic()
                ready = selector.select(remaining)
                if remaining <= 0 or not ready:
                    raise GateError("control protocol timed out")
                if not any(
                    key.fd == self.event_fd for key, _mask in ready
                ):
                    raise GateError(
                        "runtime init exited before control protocol event"
                    )
                chunk = os.read(self.event_fd, 4096)
                if not chunk:
                    raise GateError("control protocol stream closed")
                self.buffer.extend(chunk)
                if len(self.buffer) > 16384:
                    raise GateError("control protocol line is oversized")
        finally:
            selector.close()
            os.close(runtime_pid_fd)


def read_pid_file(path: Path, validator: Any) -> tuple[int, int]:
    file = validator.stable_read(path, "runtime PID file", 64)
    try:
        value = file.raw.decode("ascii", "strict").strip()
    except UnicodeDecodeError as exc:
        raise GateError("runtime PID file is not ASCII") from exc
    if not value.isdigit() or int(value) <= 0:
        raise GateError("runtime PID file is invalid")
    pid = int(value)
    return pid, validator.pid_starttime(pid)


def live_validate(
    *,
    validator_path: Path,
    phase: str,
    mode: str,
    session_nonce: str,
    runtime_id: str,
    delegation_manifest: Path,
    parent: Path,
    leaf: Path,
    init_pid: int,
    namespace_pids: Sequence[int],
    expected_driver_sha256: str,
    expected_machine: str,
    paths: RuntimePaths,
    output: Path,
    timeout: int,
) -> dict[str, Any]:
    argv = [
        "/usr/bin/python3",
        "-I",
        "-S",
        "-B",
        str(validator_path),
        "--live-phase",
        phase,
        "--delegation-manifest",
        str(delegation_manifest),
        "--cgroup-parent",
        str(parent),
        "--leaf",
        str(leaf),
        "--runtime-id",
        runtime_id,
        "--mode",
        mode,
        "--session-nonce",
        session_nonce,
        "--init-host-pid",
        str(init_pid),
        "--namespace-pids",
        ",".join(str(value) for value in namespace_pids),
        "--expected-driver-sha256",
        expected_driver_sha256,
        "--expected-machine",
        expected_machine,
        "--runtime-state-root",
        str(paths.state_root),
        "--pid-file",
        str(paths.pid_file),
        "--output",
        str(output),
    ]
    run_checked(argv, timeout=timeout)
    validator = load_validator()
    value, _file = validator.parse_self_hashed_json(
        output,
        validator.LIVE_SCHEMA,
        validator.LIVE_FIELDS,
        f"live {phase} audit",
    )
    return value


def wait_populated_zero(leaf: Path, timeout: int) -> None:
    path = leaf / "cgroup.events"
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_CLOEXEC", 0))
    poller = select.poll()
    poller.register(fd, select.POLLPRI | select.POLLERR)
    deadline = time.monotonic() + timeout
    try:
        while True:
            os.lseek(fd, 0, os.SEEK_SET)
            raw = os.read(fd, 4096).decode("ascii", "strict")
            rows = dict(row.split() for row in raw.splitlines())
            if rows.get("populated") == "0":
                return
            remaining_ms = int(max(0.0, deadline - time.monotonic()) * 1000)
            if remaining_ms <= 0 or not poller.poll(remaining_ms):
                raise GateError("cgroup populated state did not reach zero")
    finally:
        poller.unregister(fd)
        os.close(fd)


def remove_runtime_state(
    crun: ToolIdentity,
    runtime_id: str,
    paths: RuntimePaths,
    timeout: int,
) -> None:
    if any(paths.state_root.iterdir()):
        completed = subprocess.run(
            [
                str(crun.path),
                "--root",
                str(paths.state_root),
                "delete",
                "--force",
                runtime_id,
            ],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env={
                "HOME": "/nonexistent",
                "LANG": "C",
                "LC_ALL": "C",
                "PATH": "/usr/bin:/bin",
                "TZ": "UTC",
            },
            timeout=timeout,
            check=False,
        )
        if completed.returncode != 0 or completed.stderr:
            raise GateError("runtime state delete failed")
    if any(paths.state_root.iterdir()):
        raise GateError("runtime state directory is not empty")
    paths.state_root.rmdir()
    if paths.pid_file.exists() or paths.pid_file.is_symlink():
        paths.pid_file.unlink()


def cleanup_leaf(
    *,
    crun: ToolIdentity,
    runtime_id: str,
    leaf: Path,
    paths: RuntimePaths,
    timeout: int,
) -> None:
    errors: list[str] = []
    if leaf.exists():
        try:
            write_only_control(leaf / "cgroup.kill", "1")
        except BaseException as exc:
            errors.append("cgroup_kill=" + str(exc))
        try:
            wait_populated_zero(leaf, timeout)
        except BaseException as exc:
            errors.append("populated_wait=" + str(exc))
    if paths.state_root.exists():
        try:
            remove_runtime_state(crun, runtime_id, paths, timeout)
        except BaseException as exc:
            errors.append("runtime_delete=" + str(exc))
    if leaf.exists():
        try:
            if (leaf / "cgroup.procs").read_text(encoding="utf-8").strip():
                raise GateError("leaf remains populated during cleanup")
        except BaseException as exc:
            errors.append("leaf_population=" + str(exc))
        try:
            leaf.rmdir()
        except BaseException as exc:
            errors.append("leaf_remove=" + str(exc))
    if leaf.exists() or leaf.is_symlink():
        errors.append("leaf_absence=not_proved")
    if errors:
        raise GateError("; ".join(errors))


def artifact_manifest(evidence: Path, validator: Any) -> tuple[dict[str, Any], str]:
    artifacts: list[dict[str, Any]] = []
    directories: list[str] = []
    excluded = {
        "receipt.kv",
        "artifact-manifest.json",
        "control/events",
        "control/commands",
    }
    pending = [evidence]
    while pending:
        directory = pending.pop()
        with os.scandir(directory) as iterator:
            children = sorted(iterator, key=lambda item: os.fsencode(item.name))
        child_directories: list[Path] = []
        for child in children:
            path = Path(child.path)
            relative = path.relative_to(evidence).as_posix()
            if child.is_symlink():
                raise GateError("evidence symlink is forbidden")
            if child.is_dir(follow_symlinks=False):
                directories.append(relative)
                child_directories.append(path)
                continue
            if not child.is_file(follow_symlinks=False):
                raise GateError("evidence special file is forbidden")
            if relative in excluded:
                continue
            file = validator.stable_read(
                path,
                "evidence artifact",
                2 * 1024 * 1024 * 1024,
            )
            artifacts.append({
                "path": relative,
                "sha256": file.sha256,
                "size": file.size,
            })
        pending.extend(reversed(child_directories))
    artifacts.sort(key=lambda item: item["path"])
    directories.sort()
    value = {
        "schema": ARTIFACT_SCHEMA,
        "artifacts": artifacts,
        "directories": directories,
    }
    raw = canonical_json(value) + b"\n"
    write_exclusive(evidence / "artifact-manifest.json", raw, 0o400)
    return value, sha256_bytes(raw)


def write_receipt(
    path: Path,
    rows: Sequence[tuple[str, str]],
    validator: Any,
) -> None:
    if tuple(key for key, _ in rows) != validator.RECEIPT_KEYS[:-1]:
        raise GateError("receipt producer field order drift")
    prefix = "".join(f"{key}={value}\n" for key, value in rows).encode("utf-8")
    raw = prefix + f"receipt_sha256={sha256_bytes(prefix)}\n".encode("utf-8")
    write_exclusive(path, raw, 0o400)


def copy_input(source: Path, destination: Path, validator: Any) -> None:
    file = validator.stable_read(source, "bound input", 256 * 1024 * 1024)
    write_exclusive(destination, file.raw, 0o400)


def guest_manifest_entry(
    *,
    guest_path: str,
    host_path: Path,
    executable: bool,
    validator: Any,
) -> dict[str, Any]:
    if (
        not guest_path.startswith("/")
        or Path(guest_path).parts in ((), ("/",))
        or ".." in Path(guest_path).parts
    ):
        raise GateError("ledger manifest guest path is invalid")
    file = validator.stable_read(
        host_path,
        "ledger manifest member",
        512 * 1024 * 1024,
    )
    if file.uid != os.geteuid() or file.gid != os.getegid():
        raise GateError(
            "ledger manifest member is outside delegated uid/gid mapping",
        )
    if executable and not file.mode & stat.S_IXUSR:
        raise GateError("ledger manifest executable is not owner-executable")
    if executable and file.mode & (stat.S_ISUID | stat.S_ISGID):
        raise GateError("ledger manifest executable has privileged mode bits")
    return {
        "pathFshex": os.fsencode(guest_path).hex(),
        "sha256": file.sha256,
        "device": file.device,
        "inode": file.inode,
        "size": file.size,
        "mode": file.mode,
        "uid": 1,
        "gid": 1,
    }


def build_ledger_manifest(
    *,
    rootfs_manifest_path: Path,
    rootfs: Path,
    driver: Path | None,
    supervisor: Path,
    stage_binding: Any | None,
    stage_execution_manifest: Path | None,
    mutable_output_guest_paths: Sequence[str],
    validator: Any,
) -> tuple[bytes, str]:
    mutable_paths = tuple(Path(path) for path in mutable_output_guest_paths)
    generated_directory = Path(GENERATED_ARGV_DIRECTORY_GUEST_PATH)
    if (
        len(mutable_paths) > 64
        or len(set(mutable_paths)) != len(mutable_paths)
        or any(
            not path.is_absolute()
            or path == Path("/")
            or any(part in (".", "..") for part in path.parts)
            or path.parent == generated_directory
            for path in mutable_paths
        )
    ):
        raise GateError("ledger mutable output paths are invalid")
    value, _file = validator.read_json_file(
        rootfs_manifest_path,
        "rootfs manifest for ledger",
    )
    entries = value.get("entries")
    if not isinstance(entries, list):
        raise GateError("rootfs manifest entries are absent for ledger")
    executables: list[dict[str, Any]] = []
    python_seen = False
    shell_seen = False
    for entry in entries:
        if not isinstance(entry, dict) or entry.get("kind") != "file":
            continue
        mode = entry.get("mode")
        path_fshex = entry.get("pathFshex")
        if (
            not isinstance(mode, int)
            or not mode & 0o111
            or not isinstance(path_fshex, str)
        ):
            continue
        try:
            relative = Path(os.fsdecode(bytes.fromhex(path_fshex)))
        except (ValueError, UnicodeError) as exc:
            raise GateError("rootfs executable path is invalid") from exc
        if relative.is_absolute() or ".." in relative.parts:
            raise GateError("rootfs executable path escapes root")
        guest_path = "/" + str(relative)
        executables.append(guest_manifest_entry(
            guest_path=guest_path,
            host_path=rootfs / relative,
            executable=True,
            validator=validator,
        ))
        python_seen = python_seen or guest_path == LEDGER_PYTHON_GUEST_PATH
        shell_seen = shell_seen or guest_path == "/bin/sh"
    if not python_seen:
        raise GateError(
            "rootfs immutable manifest lacks regular /usr/bin/python3",
        )
    if not shell_seen:
        raise GateError("rootfs immutable manifest lacks regular /bin/sh")
    if driver is not None:
        executables.append(guest_manifest_entry(
            guest_path=CURRENT_DRIVER_GUEST_PATH,
            host_path=driver,
            executable=True,
            validator=validator,
        ))
    elif stage_binding is None:
        raise GateError("ledger target executable authority is absent")
    bound_files = [guest_manifest_entry(
        guest_path=SUPERVISOR_GUEST_PATH,
        host_path=supervisor,
        executable=False,
        validator=validator,
    )]
    fixed_rootfs_argv_paths = tuple(
        validator.ROOTFS_IMMUTABLE_ARGV_GUEST_PATHS
    )
    if (
        len(fixed_rootfs_argv_paths) == 0
        or len(set(fixed_rootfs_argv_paths))
            != len(fixed_rootfs_argv_paths)
    ):
        raise GateError("rootfs immutable argv closure is invalid")
    for guest_path in fixed_rootfs_argv_paths:
        parsed = Path(guest_path)
        if (
            not parsed.is_absolute()
            or parsed == Path("/")
            or any(part in (".", "..") for part in parsed.parts)
        ):
            raise GateError("rootfs immutable argv path is not canonical")
        bound_files.append(guest_manifest_entry(
            guest_path=guest_path,
            host_path=rootfs / parsed.relative_to("/"),
            executable=False,
            validator=validator,
        ))
    if stage_binding is not None:
        if stage_execution_manifest is None:
            raise GateError("stage23 ledger execution manifest is absent")
        for item in stage_binding.frozen_roles:
            guest_path = item["guestPath"]
            host_path = Path(os.fsdecode(bytes.fromhex(item["pathFshex"])))
            if item["kind"] == "executable":
                executables.append(guest_manifest_entry(
                    guest_path=guest_path,
                    host_path=host_path,
                    executable=True,
                    validator=validator,
                ))
            else:
                bound_files.append(guest_manifest_entry(
                    guest_path=guest_path,
                    host_path=host_path,
                    executable=False,
                    validator=validator,
                ))
        bound_files.append(guest_manifest_entry(
            guest_path=STAGE23_EXECUTION_GUEST_PATH,
            host_path=stage_execution_manifest,
            executable=False,
            validator=validator,
        ))
    elif stage_execution_manifest is not None:
        raise GateError("current ledger carried stage23 execution manifest")
    executable_by_path: dict[str, dict[str, Any]] = {}
    for item in executables:
        previous = executable_by_path.get(item["pathFshex"])
        if previous is not None and previous != item:
            raise GateError("ledger executable guest identity is ambiguous")
        executable_by_path[item["pathFshex"]] = item
    executables = list(executable_by_path.values())
    executables.sort(key=lambda item: item["pathFshex"])
    if (
        not executables
        or len(executables) > MAX_LEDGER_EXECUTABLES
        or len({item["pathFshex"] for item in executables}) != len(executables)
    ):
        raise GateError("ledger executable allowlist is invalid or oversized")
    bound_by_path: dict[str, dict[str, Any]] = {}
    for item in bound_files:
        path_fshex = item["pathFshex"]
        executable = executable_by_path.get(path_fshex)
        if executable is not None:
            if executable != item:
                raise GateError(
                    "ledger executable/bound argv guest identity is ambiguous"
                )
            # Executable authority is also immutable read authority for argv.
            # Keep each canonical path in exactly one manifest domain.
            continue
        previous = bound_by_path.get(path_fshex)
        if previous is not None and previous != item:
            raise GateError("ledger bound argv guest identity is ambiguous")
        bound_by_path[path_fshex] = item
    bound_files = sorted(
        bound_by_path.values(),
        key=lambda item: item["pathFshex"],
    )
    manifest = {
        "schema": "cheng.linux_ptrace_exec_manifest",
        "executables": executables,
        "boundArgvFiles": bound_files,
        "dynamicArgvUid": 1,
        "dynamicArgvGid": 1,
        "generatedArgvDirectoryPathFshex": os.fsencode(
            GENERATED_ARGV_DIRECTORY_GUEST_PATH
        ).hex(),
        "mutableOutputPathFshexes": sorted(
            os.fsencode(path).hex() for path in mutable_paths
        ),
    }
    raw = canonical_json(manifest) + b"\n"
    return raw, sha256_bytes(raw)


def load_ledger_wrapper_receipt_keys() -> tuple[str, ...]:
    loader = importlib.machinery.SourceFileLoader(
        "cheng_hard_memory_ledger_wrapper_schema",
        str(LEDGER_WRAPPER_PATH),
    )
    spec = importlib.util.spec_from_loader(loader.name, loader)
    if spec is None:
        raise GateError("ledger wrapper schema cannot be loaded")
    module = importlib.util.module_from_spec(spec)
    sys.modules[loader.name] = module
    loader.exec_module(module)
    keys = getattr(module, "RECEIPT_KEYS", None)
    if (
        not isinstance(keys, tuple)
        or not keys
        or keys[-1] != "receipt_sha256"
        or len(keys) != len(set(keys))
        or any(not isinstance(key, str) or not key for key in keys)
    ):
        raise GateError("ledger wrapper receipt schema is invalid")
    return keys


LEDGER_WRAPPER_RECEIPT_KEYS = load_ledger_wrapper_receipt_keys()


def parse_ledger_wrapper_receipt(path: Path, validator: Any) -> dict[str, str]:
    file = validator.stable_read(
        path,
        "ledger wrapper receipt",
        4 * 1024 * 1024,
    )
    try:
        lines = file.raw.decode("utf-8", "strict").splitlines()
    except UnicodeDecodeError as exc:
        raise GateError("ledger wrapper receipt is not UTF-8") from exc
    rows: dict[str, str] = {}
    for line in lines:
        key, separator, value = line.partition("=")
        if not separator or not key or key in rows:
            raise GateError("ledger wrapper receipt row is invalid")
        rows[key] = value
    if tuple(rows) != LEDGER_WRAPPER_RECEIPT_KEYS:
        raise GateError("ledger wrapper receipt field order drift")
    suffix = f"receipt_sha256={rows['receipt_sha256']}\n".encode("ascii")
    if (
        not SHA256_RE.fullmatch(rows["receipt_sha256"])
        or not file.raw.endswith(suffix)
        or sha256_bytes(file.raw[:-len(suffix)]) != rows["receipt_sha256"]
    ):
        raise GateError("ledger wrapper receipt hash mismatch")
    return rows


def parse_event(line: str, expected: str, nonce: str, count: int) -> list[str]:
    parts = line.split(" ")
    if len(parts) != count or parts[0] != expected or parts[1] != nonce:
        raise GateError(f"control protocol event mismatch: {expected}")
    return parts


def run_one(
    *,
    mode: str,
    workload_kind: str,
    evidence: Path,
    parent: Path,
    manifest: Any,
    delegation_manifest_path: Path,
    crun: ToolIdentity,
    rootfs_manifest: Any,
    rootfs_manifest_path: Path,
    current_binding: Any | None,
    pair_current_binding: Any | None,
    stage_binding: Any | None,
    native_descriptor: tuple[dict[str, str], Any] | None,
    native_descriptor_path: Path | None,
    target_argv: Sequence[str],
    target_env: Sequence[str],
    timeout: int,
    validator: Any,
) -> dict[str, str]:
    runtime_id = f"cheng-hardcap-{os.urandom(16).hex()}"
    paths = runtime_path_values(evidence)
    leaf = parent / runtime_id
    state: dict[str, Any] = {}
    result: dict[str, str] | None = None
    primary: BaseException | None = None
    cleanup_errors: list[str] = []
    try:
        try:
            result = _run_one_body(
                runtime_id=runtime_id,
                mode=mode,
                workload_kind=workload_kind,
                evidence=evidence,
                parent=parent,
                manifest=manifest,
                delegation_manifest_path=delegation_manifest_path,
                crun=crun,
                rootfs_manifest=rootfs_manifest,
                rootfs_manifest_path=rootfs_manifest_path,
                current_binding=current_binding,
                pair_current_binding=pair_current_binding,
                stage_binding=stage_binding,
                native_descriptor=native_descriptor,
                native_descriptor_path=native_descriptor_path,
                target_argv=target_argv,
                target_env=target_env,
                timeout=timeout,
                validator=validator,
                resource_state=state,
            )
        except BaseException as exc:
            primary = exc
    finally:
        protocol = state.get("protocol")
        if isinstance(protocol, FifoProtocol):
            try:
                protocol.close()
            except BaseException as exc:
                cleanup_errors.append("protocol_close=" + str(exc))
        try:
            cleanup_leaf(
                crun=crun,
                runtime_id=runtime_id,
                leaf=leaf,
                paths=paths,
                timeout=min(timeout, 30),
            )
        except BaseException as exc:
            cleanup_errors.append("runtime_cleanup=" + str(exc))
        for fifo in (paths.event_fifo, paths.command_fifo):
            try:
                if fifo.exists() or fifo.is_symlink():
                    fifo.unlink()
            except BaseException as exc:
                cleanup_errors.append("fifo_cleanup=" + str(exc))
        if primary is not None or cleanup_errors:
            try:
                if paths.config.exists() or paths.config.is_symlink():
                    paths.config.unlink()
            except BaseException as exc:
                cleanup_errors.append("config_cleanup=" + str(exc))
    if primary is not None or cleanup_errors:
        detail = []
        if primary is not None:
            detail.append("primary=" + repr(primary))
        detail.extend(cleanup_errors)
        raise GateError("hard-memory run failed: " + "; ".join(detail))
    if result is None:
        raise GateError("hard-memory run produced no receipt")
    return result


def _run_one_body(
    *,
    runtime_id: str,
    mode: str,
    workload_kind: str,
    evidence: Path,
    parent: Path,
    manifest: Any,
    delegation_manifest_path: Path,
    crun: ToolIdentity,
    rootfs_manifest: Any,
    rootfs_manifest_path: Path,
    current_binding: Any | None,
    pair_current_binding: Any | None,
    stage_binding: Any | None,
    native_descriptor: tuple[dict[str, str], Any] | None,
    native_descriptor_path: Path | None,
    target_argv: Sequence[str],
    target_env: Sequence[str],
    timeout: int,
    validator: Any,
    resource_state: dict[str, Any],
) -> dict[str, str]:
    if not RUNTIME_ID_RE.fullmatch(runtime_id):
        raise GateError("runtime identity generation failed")
    nonce = os.urandom(32).hex()
    leaf = create_leaf(parent, runtime_id)
    leaf_info = os.stat(leaf, follow_symlinks=False)
    paths = runtime_paths(evidence)
    if pair_current_binding is not None:
        materialize_source_root(
            pair_current_binding,
            paths.source_root,
            validator,
        )
    elif stage_binding is None:
        raise GateError("pair workload binding is absent")
    write_exclusive(paths.supervisor, SUPERVISOR_SCRIPT.encode("utf-8"), 0o400)
    if stage_binding is not None and mode == "workload":
        copy_input(
            stage_binding.execution_manifest.path,
            paths.stage_execution_manifest,
            validator,
        )
        paths.stage_execution_manifest.chmod(0o400)
        write_exclusive(
            paths.stage_manifest_pair_commitment,
            b"",
            0o400,
        )
        paths.stage_control.chmod(0o500)
    stage_pre_tree: dict[str, Any] | None = None
    stage_pre_tree_sha = ZERO_SHA256
    if stage_binding is not None and mode == "workload":
        stage_pre_tree, stage_pre_tree_sha = validator.stage23_tree_snapshot(
            stage_binding.evidence_root,
            excluded_relative_path=stage_binding.terminal_relative_path,
        )
        write_exclusive(
            evidence / "stage-pre-tree.json",
            canonical_json(stage_pre_tree) + b"\n",
            0o400,
        )
    ledger_source_identities = {
        "producer_sha256": validator.stable_read(
            LEDGER_PRODUCER_PATH,
            "ptrace ledger producer",
            4 * 1024 * 1024,
        ).sha256,
        "validator_sha256": validator.stable_read(
            LEDGER_VALIDATOR_PATH,
            "ptrace ledger standalone validator",
            4 * 1024 * 1024,
        ).sha256,
        "wrapper_sha256": validator.stable_read(
            LEDGER_WRAPPER_PATH,
            "ptrace ledger OCI wrapper",
            4 * 1024 * 1024,
        ).sha256,
    }
    ledger_identity: dict[str, str] | None = None
    if mode == "workload":
        copy_input(LEDGER_PRODUCER_PATH, paths.ledger_producer, validator)
        copy_input(LEDGER_VALIDATOR_PATH, paths.ledger_validator, validator)
        copy_input(LEDGER_WRAPPER_PATH, paths.ledger_wrapper, validator)
        if stage_binding is not None:
            command_actions = [
                action
                for action in stage_binding.plan["actions"]
                if action.get("kind") == "command"
            ]
            planned_by_role = {
                item["role"]: item
                for item in stage_binding.plan["outputs"]
            }
            if not command_actions and stage_binding.phase_index == 10:
                business_roles = []
            elif len(command_actions) == 1:
                business_roles = command_actions[0].get("businessOutputRoles")
            else:
                raise GateError("stage23 command action is not unique")
            if (
                not isinstance(business_roles, list)
                or len(set(business_roles)) != len(business_roles)
                or any(role not in planned_by_role for role in business_roles)
            ):
                raise GateError("stage23 mutable output roles are invalid")
            mutable_output_guest_paths = tuple(
                os.fsdecode(bytes.fromhex(planned_by_role[role]["pathFshex"]))
                for role in business_roles
            )
        elif workload_kind == WORKLOAD_CURRENT_DRIVER:
            mutable_output_guest_paths = (
                CURRENT_DRIVER_NEXT_GUEST_PATH,
                CURRENT_DRIVER_REPORT_GUEST_PATH,
            )
        elif workload_kind == WORKLOAD_DRY_COMPILE:
            mutable_output_guest_paths = (
                DRY_OUTPUT_GUEST_PATH,
                DRY_REPORT_GUEST_PATH,
            )
        else:
            raise GateError("ledger mutable output workload is unknown")
        ledger_manifest_raw, ledger_manifest_sha = build_ledger_manifest(
            rootfs_manifest_path=rootfs_manifest_path,
            rootfs=rootfs_manifest.rootfs,
            driver=(
                current_binding.driver.path
                if current_binding is not None
                else None
            ),
            supervisor=paths.supervisor,
            stage_binding=stage_binding,
            stage_execution_manifest=(
                paths.stage_execution_manifest
                if stage_binding is not None
                else None
            ),
            mutable_output_guest_paths=mutable_output_guest_paths,
            validator=validator,
        )
        write_exclusive(paths.ledger_manifest, ledger_manifest_raw, 0o400)
        ledger_identity = {
            "producer_sha256": ledger_source_identities["producer_sha256"],
            "validator_sha256": ledger_source_identities["validator_sha256"],
            "manifest_sha256": ledger_manifest_sha,
        }
    protocol = FifoProtocol(paths.event_fifo, paths.command_fifo)
    resource_state["protocol"] = protocol
    init_pid = 0
    init_starttime = 0
    live_before: dict[str, Any] | None = None
    live_during: dict[str, Any] | None = None
    live_after: dict[str, Any] | None = None
    live_cleanup: dict[str, Any] | None = None
    ledger_wrapper_rows: dict[str, str] | None = None
    workload_wall_start_monotonic_ns = 0
    workload_wall_end_monotonic_ns = 0
    driver_path = current_binding.driver.path if current_binding is not None else None
    driver_sha = current_binding.driver.sha256 if current_binding is not None else ZERO_SHA256
    descriptor_rows = native_descriptor[0] if native_descriptor is not None else {}
    descriptor_file = native_descriptor[1] if native_descriptor is not None else None
    expected_machine = (
        descriptor_rows["machine"]
        if native_descriptor is not None
        else "x86_64"
    )
    expected_target_sha = driver_sha
    if stage_binding is not None and mode == "workload":
        bash_roles = [
            item for item in stage_binding.frozen_roles
            if item["role"] == "bash"
        ]
        if len(bash_roles) != 1:
            raise GateError("stage23 bash executable identity is absent")
        expected_target_sha = bash_roles[0]["sha256"]
    leaf_cgroup_path = "/" + str(leaf.relative_to(manifest.mount))
    config = oci_config(
        rootfs=rootfs_manifest.rootfs,
        leaf_path=leaf_cgroup_path,
        paths=paths,
        source_root=paths.source_root,
        driver=driver_path,
        stage_source_root=(
            stage_binding.source_root if stage_binding is not None else None
        ),
        stage_evidence_root=(
            stage_binding.evidence_root if stage_binding is not None else None
        ),
        stage_manifest_pair_commitment=(
            stage_binding.manifest_pair_commitment.path
            if stage_binding is not None else None
        ),
        mode=mode,
        workload_kind=workload_kind,
        nonce=nonce,
        target_argv=target_argv,
        target_env=target_env,
        workload_identity=(
            ({
                "official_driver_sha256": current_binding.driver.sha256,
                "current_build_receipt_sha256":
                    current_binding.build_receipt.sha256,
                "source_closure_cid": current_binding.source_closure_cid,
                "source_closure_capture_sha256":
                    current_binding.source_closure_capture_sha256,
                "source_manifest_sha256":
                    descriptor_rows["snapshot_manifest_sha256"],
                "entry_source_sha256": current_binding.entry_sha256,
                "target": current_binding.target,
                "entry_path": (
                    current_binding.entry_path
                    if workload_kind == WORKLOAD_CURRENT_DRIVER
                    else CURRENT_SOURCE_GUEST_PATH + "/"
                    + current_binding.entry_path
                ),
            }
            if current_binding is not None
            else {
                "stage_authority_manifest_sha256":
                    stage_binding.authority_manifest.sha256,
                "stage_execution_manifest_sha256":
                    stage_binding.execution_manifest.sha256,
                "stage_manifest_pair_commitment_sha256":
                    stage_binding.manifest_pair_commitment.sha256,
                "stage_phase_plan_sha256": stage_binding.plan_sha256,
            }
            if stage_binding is not None and mode == "workload"
            else None)
        ),
        ledger_identity=ledger_identity,
        timeout=timeout,
    )
    validate_oci_config(
        config,
        leaf_path=leaf_cgroup_path,
        rootfs=rootfs_manifest.rootfs,
    )
    config_raw = canonical_json(config) + b"\n"
    write_exclusive(paths.config, config_raw, 0o400)
    config_sha = sha256_bytes(config_raw)
    input_manifest = {
        "schema": INPUT_SCHEMA,
        "mode": mode,
        "workloadKind": workload_kind,
        "delegationManifestSha256": manifest.file.sha256,
        "cgroupParentPathFshex": os.fsencode(str(parent)).hex(),
        "crunSha256": crun.sha256,
        "crunClone3Policy": CRUN_CLONE3_POLICY,
        "crunClone3ExactFlags": CRUN_CLONE3_EXACT_FLAGS,
        "crunExpectedExecTransitions": CRUN_EXACT_EXEC_TRANSITIONS,
        "rootfsManifestSha256": rootfs_manifest.file.sha256,
        "rootfsTreeCid": rootfs_manifest.tree_cid,
        "ociConfigSha256": config_sha,
        "targetArgvCount": len(target_argv),
        "targetArgvSha256": framed_sha256(target_argv),
        "targetEnvCount": len(target_env),
        "targetEnvSha256": framed_sha256(target_env),
        "stageAuthorityManifestSha256": (
            stage_binding.authority_manifest.sha256
            if stage_binding is not None
            else ZERO_SHA256
        ),
        "stageExecutionManifestSha256": (
            stage_binding.execution_manifest.sha256
            if stage_binding is not None
            else ZERO_SHA256
        ),
        "stageManifestPairCommitmentSha256": (
            stage_binding.manifest_pair_commitment.sha256
            if stage_binding is not None
            else ZERO_SHA256
        ),
        "stagePhasePlanSha256": (
            stage_binding.plan_sha256
            if stage_binding is not None
            else ZERO_SHA256
        ),
        "stagePhaseIndex": (
            stage_binding.phase_index if stage_binding is not None else -1
        ),
        "descendantExecLedgerRequired": mode == "workload",
        "descendantExecLedgerProducerSha256":
            ledger_source_identities["producer_sha256"],
        "descendantExecLedgerValidatorSha256":
            ledger_source_identities["validator_sha256"],
        "descendantExecLedgerWrapperSha256":
            ledger_source_identities["wrapper_sha256"],
        "descendantExecLedgerManifestSha256": (
            ledger_identity["manifest_sha256"]
            if ledger_identity is not None
            else ZERO_SHA256
        ),
        "memoryMax": LIMIT_BYTES,
        "memorySwapMax": SWAP_MAX_BYTES,
        "pidsMax": PIDS_MAX,
    }
    input_raw = canonical_json(input_manifest) + b"\n"
    write_exclusive(evidence / "input-manifest.json", input_raw, 0o400)
    copy_input(
        delegation_manifest_path,
        evidence / "delegation-manifest.kv",
        validator,
    )
    copy_input(
        rootfs_manifest_path,
        evidence / "rootfs-manifest.json",
        validator,
    )
    if native_descriptor_path is not None:
        copy_input(
            native_descriptor_path,
            evidence / "native-descriptor.kv",
            validator,
        )
    elif stage_binding is not None:
        copy_input(
            stage_binding.authority_manifest.path,
            evidence / "stage-authority-manifest.json",
            validator,
        )
        copy_input(
            stage_binding.execution_manifest.path,
            evidence / "phase-execution-manifest.json",
            validator,
        )
        copy_input(
            stage_binding.manifest_pair_commitment.path,
            evidence / "manifest-pair-commitment.json",
            validator,
        )
    copy_input(Path(__file__).resolve(strict=True), evidence / "gate-runner.py", validator)
    copy_input(VALIDATOR_PATH, evidence / "receipt-validator.py", validator)
    transcript: dict[str, Any] = {
        "runtimeId": runtime_id,
        "sessionNonceSha256": sha256_bytes(nonce.encode("ascii")),
        "events": [],
        "commands": [],
    }
    lifecycle = RuntimeLifecycle(
        crun=crun.path,
        state_root=paths.state_root,
        bundle=paths.bundle,
        pid_file=paths.pid_file,
        runtime_id=runtime_id,
    )
    crun_clone3_intercept_count = 0
    crun_exec_transition_count = 0
    try:
        (
            _create_stdout,
            _create_stderr,
            crun_clone3_intercept_count,
            crun_exec_transition_count,
        ) = (
            run_crun_create_with_exact_clone3_policy(
                lifecycle.create_argv(),
                timeout=timeout,
                stdout_path=evidence / "runtime-create.stdout.bin",
                stderr_path=evidence / "runtime-create.stderr.bin",
                expected_crun_sha256=crun.sha256,
            )
        )
        lifecycle.mark_created()
        init_pid, init_starttime = read_pid_file(paths.pid_file, validator)
        live_before = live_validate(
            validator_path=VALIDATOR_PATH,
            phase="before",
            mode=mode,
            session_nonce=nonce,
            runtime_id=runtime_id,
            delegation_manifest=delegation_manifest_path,
            parent=parent,
            leaf=leaf,
            init_pid=init_pid,
            namespace_pids=(),
            expected_driver_sha256=expected_target_sha,
            expected_machine=expected_machine,
            paths=paths,
            output=evidence / "live-before.json",
            timeout=timeout,
        )
        start_stdout, start_stderr = run_checked(
            lifecycle.start_argv(),
            timeout=timeout,
        )
        lifecycle.mark_started()
        write_exclusive(evidence / "runtime-start.stdout.bin", start_stdout)
        write_exclusive(evidence / "runtime-start.stderr.bin", start_stderr)
        before_line = protocol.read(timeout, init_pid)
        parse_event(before_line, "before", nonce, 3)
        transcript["events"].append(before_line)
        start_command = f"start {nonce}"
        protocol.send(start_command)
        transcript["commands"].append(start_command)
        during_line = protocol.read(timeout, init_pid)
        parts = parse_event(
            during_line,
            "during",
            nonce,
            3 if mode == "workload" else 4,
        )
        namespace_pids = [int(value) for value in parts[2:]]
        if any(value <= 0 for value in namespace_pids):
            raise GateError("control protocol namespace PID is invalid")
        transcript["events"].append(during_line)
        live_during = live_validate(
            validator_path=VALIDATOR_PATH,
            phase="during",
            mode=mode,
            session_nonce=nonce,
            runtime_id=runtime_id,
            delegation_manifest=delegation_manifest_path,
            parent=parent,
            leaf=leaf,
            init_pid=init_pid,
            namespace_pids=namespace_pids,
            expected_driver_sha256=expected_target_sha,
            expected_machine=expected_machine,
            paths=paths,
            output=evidence / "live-during.json",
            timeout=timeout,
        )
        continue_command = f"continue {nonce}"
        workload_wall_start_monotonic_ns = time.monotonic_ns()
        protocol.send(continue_command)
        transcript["commands"].append(continue_command)
        if mode == "workload":
            after_line = protocol.read(timeout, init_pid)
            parts = parse_event(after_line, "after", nonce, 3)
            workload_wall_end_monotonic_ns = time.monotonic_ns()
            if parts[2] != "0":
                raise GateError("workload returned nonzero")
            transcript["events"].append(after_line)
            live_after = live_validate(
                validator_path=VALIDATOR_PATH,
                phase="after",
                mode=mode,
                session_nonce=nonce,
                runtime_id=runtime_id,
                delegation_manifest=delegation_manifest_path,
                parent=parent,
                leaf=leaf,
                init_pid=init_pid,
                namespace_pids=(),
                expected_driver_sha256=expected_target_sha,
                expected_machine=expected_machine,
                paths=paths,
                output=evidence / "live-after.json",
                timeout=timeout,
            )
            release_command = f"release {nonce}"
            protocol.send(release_command)
            transcript["commands"].append(release_command)
            wait_populated_zero(leaf, timeout)
            validation_output = validator.stable_read(
                paths.ledger_validation,
                "ledger wrapper validation output",
                4 * 1024 * 1024,
            )
            ledger_wrapper_rows = parse_ledger_wrapper_receipt(
                paths.ledger_wrapper_receipt,
                validator,
            )
            validation_expected = (
                "exec_ledger_wrapper_status=PROVED\n"
                "exec_ledger_wrapper_receipt_sha256="
                + validator.stable_read(
                    paths.ledger_wrapper_receipt,
                    "ledger wrapper receipt",
                    4 * 1024 * 1024,
                ).sha256
                + "\n"
            ).encode("ascii")
            if validation_output.raw != validation_expected:
                raise GateError("ledger wrapper validation output mismatch")
        else:
            wait_populated_zero(leaf, timeout)
            workload_wall_end_monotonic_ns = time.monotonic_ns()
            live_after = live_validate(
                validator_path=VALIDATOR_PATH,
                phase="after",
                mode=mode,
                session_nonce=nonce,
                runtime_id=runtime_id,
                delegation_manifest=delegation_manifest_path,
                parent=parent,
                leaf=leaf,
                init_pid=init_pid,
                namespace_pids=(),
                expected_driver_sha256=ZERO_SHA256,
                expected_machine=expected_machine,
                paths=paths,
                output=evidence / "live-after.json",
                timeout=timeout,
            )
        cleanup_leaf(
            crun=crun,
            runtime_id=runtime_id,
            leaf=leaf,
            paths=paths,
            timeout=timeout,
        )
        live_cleanup = live_validate(
            validator_path=VALIDATOR_PATH,
            phase="cleanup",
            mode=mode,
            session_nonce=nonce,
            runtime_id=runtime_id,
            delegation_manifest=delegation_manifest_path,
            parent=parent,
            leaf=leaf,
            init_pid=init_pid,
            namespace_pids=(),
            expected_driver_sha256=expected_target_sha,
            expected_machine=expected_machine,
            paths=paths,
            output=evidence / "live-cleanup.json",
            timeout=timeout,
        )
    except BaseException:
        raise
    protocol.close()
    for fifo in (paths.event_fifo, paths.command_fifo):
        if fifo.exists() or fifo.is_symlink():
            fifo.unlink()
    if live_before is None or live_during is None or \
            live_after is None or live_cleanup is None:
        raise GateError("live validator phase is absent")
    if (
        workload_wall_start_monotonic_ns <= 0
        or workload_wall_end_monotonic_ns < workload_wall_start_monotonic_ns
    ):
        raise GateError("workload monotonic wall clock is invalid")
    workload_wall_elapsed_ns = (
        workload_wall_end_monotonic_ns - workload_wall_start_monotonic_ns
    )
    if mode == "workload" and ledger_wrapper_rows is None:
        raise GateError("workload descendant ledger receipt is absent")
    overwrite_owned_file(
        evidence / "control-transcript.json",
        canonical_json(transcript) + b"\n",
    ) if (evidence / "control-transcript.json").exists() else write_exclusive(
        evidence / "control-transcript.json",
        canonical_json(transcript) + b"\n",
    )
    shutil.copyfile(paths.stdout, evidence / "stdout.bin")
    shutil.copyfile(paths.stderr, evidence / "stderr.bin")
    output_stdout = validator.stable_read(
        evidence / "stdout.bin",
        "captured stdout",
        2 * 1024 * 1024 * 1024,
    )
    output_stderr = validator.stable_read(
        evidence / "stderr.bin",
        "captured stderr",
        2 * 1024 * 1024 * 1024,
    )
    retained_control_files = {
        paths.stdout,
        paths.stderr,
        paths.supervisor,
    }
    if mode == "workload":
        retained_control_files.update({
            paths.ledger_producer,
            paths.ledger_validator,
            paths.ledger_wrapper,
            paths.ledger_manifest,
            paths.ledger_receipt,
            paths.ledger_validation,
            paths.ledger_wrapper_receipt,
            paths.ledger_producer_stdout,
            paths.ledger_producer_stderr,
            paths.ledger_validator_stdout,
            paths.ledger_validator_stderr,
        })
        if workload_kind == WORKLOAD_CURRENT_DRIVER:
            retained_control_files.update({
                paths.current_driver_next,
                paths.current_driver_report,
            })
        elif workload_kind == WORKLOAD_DRY_COMPILE:
            retained_control_files.add(paths.dry_report)
    observed_control_files = set(paths.control.iterdir())
    if observed_control_files != retained_control_files:
        raise GateError("control artifact set mismatch")
    for child in retained_control_files:
        child.chmod(
            0o500 if child == paths.current_driver_next else 0o400,
        )
    paths.control.chmod(0o500)
    rootfs_manifest = validator.validate_rootfs_manifest(
        rootfs_manifest_path,
        rootfs_manifest.rootfs,
        crun.sha256,
        verify_tree=False,
    )
    if (
        rootfs_manifest.delegate_uid != os.geteuid()
        or rootfs_manifest.delegate_gid != os.getegid()
    ):
        raise GateError("rootfs and cgroup delegation identities differ")
    artifact_value, artifact_sha = artifact_manifest(evidence, validator)
    artifact_count = len(artifact_value["artifacts"])
    artifact_directory_count = len(artifact_value["directories"])
    before_events = live_before["eventsLocal"]
    after_events = live_after["eventsLocal"]
    current_fields = {
        "current_source_binding_status": (
            "not_applicable_stage23_phase"
            if stage_binding is not None
            else "not_applicable_attack_probe"
        ),
        "workspace_root_path_fshex":
            (
                os.fsencode(str(pair_current_binding.workspace_root)).hex()
                if pair_current_binding is not None
                else ""
            ),
        "source_closure_path_fshex":
            (
                os.fsencode(
                    str(pair_current_binding.source_closure.path),
                ).hex()
                if pair_current_binding is not None
                else ""
            ),
        "current_driver_path_fshex":
            (
                os.fsencode(str(pair_current_binding.driver.path)).hex()
                if pair_current_binding is not None
                else ""
            ),
        "current_build_receipt_path_fshex":
            (
                os.fsencode(
                    str(pair_current_binding.build_receipt.path),
                ).hex()
                if pair_current_binding is not None
                else ""
            ),
        "source_closure_cid": ZERO_SHA256,
        "source_closure_capture_sha256": ZERO_SHA256,
        "current_driver_sha256": ZERO_SHA256,
        "current_build_receipt_sha256": ZERO_SHA256,
        "current_entry_path": "",
        "current_entry_module_path": "",
        "current_entry_sha256": ZERO_SHA256,
    }
    if current_binding is not None:
        if pair_current_binding is None:
            raise GateError("current pair binding is absent")
        current_fields = {
            "current_source_binding_status": "bound_unique_current",
            "workspace_root_path_fshex":
                os.fsencode(str(pair_current_binding.workspace_root)).hex(),
            "source_closure_path_fshex":
                os.fsencode(str(pair_current_binding.source_closure.path)).hex(),
            "current_driver_path_fshex":
                os.fsencode(str(pair_current_binding.driver.path)).hex(),
            "current_build_receipt_path_fshex":
                os.fsencode(
                    str(pair_current_binding.build_receipt.path),
                ).hex(),
            "source_closure_cid": current_binding.source_closure_cid,
            "source_closure_capture_sha256":
                current_binding.source_closure_capture_sha256,
            "current_driver_sha256": current_binding.driver.sha256,
            "current_build_receipt_sha256":
                current_binding.build_receipt.sha256,
            "current_entry_path": current_binding.entry_path,
            "current_entry_module_path": current_binding.entry_module_path,
            "current_entry_sha256": current_binding.entry_sha256,
        }
    status = "completed" if mode == "workload" else \
        "expected_aggregate_oom_rejected"
    execution_result = "exited_zero" if mode == "workload" else \
        "kernel_oom_group_killed"
    ledger_fields = {
        "descendant_exec_ledger_status":
            "not_applicable_kernel_oom_probe",
        "descendant_exec_ledger_schema":
            "cheng.linux_ptrace_exec_ledger",
        "descendant_exec_ledger_producer_sha256":
            ledger_source_identities["producer_sha256"],
        "descendant_exec_ledger_validator_sha256":
            ledger_source_identities["validator_sha256"],
        "descendant_exec_ledger_wrapper_sha256":
            ledger_source_identities["wrapper_sha256"],
        "descendant_exec_ledger_manifest_sha256": ZERO_SHA256,
        "descendant_exec_ledger_receipt_sha256": ZERO_SHA256,
        "descendant_exec_ledger_payload_sha256": ZERO_SHA256,
        "descendant_exec_ledger_wrapper_receipt_sha256": ZERO_SHA256,
        "descendant_exec_ledger_command_argv_sha256": ZERO_SHA256,
        "descendant_exec_ledger_expected_exit_code": "0",
        "descendant_exec_ledger_actual_exit_code": "0",
        "descendant_exec_ledger_event_count": "0",
        "ledger_standalone_validation_sha256": ZERO_SHA256,
    }
    product_output_fields = {
        "workload_output_status": "not_applicable_attack_probe",
        "workload_output_sha256": ZERO_SHA256,
        "workload_output_size": "0",
        "workload_output_mode": "0",
        "workload_report_sha256": ZERO_SHA256,
        "workload_report_size": "0",
        "dry_source_file_count": "0",
        "dry_source_line_count": "0",
        "dry_source_byte_count": "0",
        "dry_source_max_file_bytes": "0",
        "dry_exec_phase_actual_total_ms": "0",
        "dry_full_theory_time_guard_recommended_ms": "0",
        "dry_full_theory_rss_modeled_guard_estimate_bytes": "0",
        "current_driver_next_sha256": ZERO_SHA256,
        "current_driver_next_size": "0",
        "current_driver_next_mode": "0",
        "current_driver_report_sha256": ZERO_SHA256,
        "current_driver_report_size": "0",
    }
    stage_fields = {
        "stage_authority_manifest_path_fshex": (
            os.fsencode(str(stage_binding.authority_manifest.path)).hex()
            if stage_binding is not None
            else ""
        ),
        "stage_authority_manifest_sha256": (
            stage_binding.authority_manifest.sha256
            if stage_binding is not None
            else ZERO_SHA256
        ),
        "stage_execution_manifest_path_fshex": (
            os.fsencode(str(stage_binding.execution_manifest.path)).hex()
            if stage_binding is not None
            else ""
        ),
        "stage_execution_manifest_sha256": (
            stage_binding.execution_manifest.sha256
            if stage_binding is not None
            else ZERO_SHA256
        ),
        "stage_manifest_pair_commitment_path_fshex": (
            os.fsencode(str(
                stage_binding.manifest_pair_commitment.path
            )).hex()
            if stage_binding is not None
            else ""
        ),
        "stage_manifest_pair_commitment_sha256": (
            stage_binding.manifest_pair_commitment.sha256
            if stage_binding is not None
            else ZERO_SHA256
        ),
        "stage_phase_plan_sha256": (
            stage_binding.plan_sha256
            if stage_binding is not None
            else ZERO_SHA256
        ),
        "stage_phase_index": (
            str(stage_binding.phase_index)
            if stage_binding is not None
            else "-1"
        ),
        "stage_phase_label": (
            stage_binding.phase_label if stage_binding is not None else ""
        ),
        "stage_source_root_path_fshex": (
            os.fsencode(str(stage_binding.source_root)).hex()
            if stage_binding is not None
            else ""
        ),
        "stage_evidence_root_path_fshex": (
            os.fsencode(str(stage_binding.evidence_root)).hex()
            if stage_binding is not None
            else ""
        ),
        "stage_pre_tree_sha256": ZERO_SHA256,
        "stage_post_tree_sha256": ZERO_SHA256,
        "stage_declared_delta_sha256": ZERO_SHA256,
        "stage_output_set_sha256": ZERO_SHA256,
        "stage_output_count": "0",
        "stage_terminal_relative_path": (
            stage_binding.terminal_relative_path
            if stage_binding is not None
            else ""
        ),
        "stage_terminal_sha256": ZERO_SHA256,
        "stage_terminal_receipt_sha256": ZERO_SHA256,
        "phase_row_receipt_sha256": ZERO_SHA256,
    }
    if mode == "workload":
        if ledger_wrapper_rows is None or ledger_identity is None:
            raise GateError("workload ledger state is incomplete")
        ledger_command = (
            "/bin/sh",
            SUPERVISOR_GUEST_PATH,
            mode,
            nonce,
            *target_argv,
        )
        ledger_file = validator.stable_read(
            paths.ledger_receipt,
            "descendant exec ledger receipt",
            32 * 1024 * 1024,
        )
        wrapper_receipt_file = validator.stable_read(
            paths.ledger_wrapper_receipt,
            "descendant exec ledger wrapper receipt",
            4 * 1024 * 1024,
        )
        authority_executable = None
        if workload_kind == WORKLOAD_CURRENT_DRIVER:
            authority_executable = validator.stable_read(
                paths.current_driver_next,
                "current driver next authority output",
                2 * 1024 * 1024 * 1024,
            )
            authority_report = validator.stable_read(
                paths.current_driver_report,
                "current driver report authority output",
                2 * 1024 * 1024 * 1024,
            )
            if authority_executable.size <= 0 or authority_report.size <= 0:
                raise GateError("current driver authority output is empty")
            validator.validate_current_driver_authority(
                authority_executable,
                authority_report,
                current_binding,
                descriptor_rows["snapshot_manifest_sha256"],
            )
            workload_output_status = "materialized_executable"
            workload_output_sha256 = authority_executable.sha256
            workload_output_size = str(authority_executable.size)
            workload_output_mode = format(
                stat.S_IMODE(authority_executable.mode),
                "o",
            )
            dry_rows = None
        elif workload_kind == WORKLOAD_DRY_COMPILE:
            authority_report = validator.stable_read(
                paths.dry_report,
                "dry compile report authority output",
                2 * 1024 * 1024 * 1024,
            )
            if authority_report.size <= 0:
                raise GateError("dry compile authority report is empty")
            dry_rows = validator.validate_dry_compile_authority(
                authority_report,
                output_stdout,
                output_stderr,
                target_argv,
                current_binding,
            )
            workload_output_status = "proved_absent"
            workload_output_sha256 = ZERO_SHA256
            workload_output_size = "0"
            workload_output_mode = "0"
        else:
            if stage_binding is None:
                raise GateError("stage23 workload binding is absent")
            authority_report, stage_result = (
                validator.validate_stage23_phase_result(
                    stage_binding,
                    output_stdout,
                    output_stderr,
                    stage_pre_tree,
                    stage_pre_tree_sha,
                )
            )
            workload_output_status = "materialized_stage_phase_outputs"
            workload_output_sha256 = stage_result["output_set_sha256"]
            workload_output_size = stage_result["output_count"]
            workload_output_mode = "0"
            dry_rows = None
            stage_fields.update({
                "stage_pre_tree_sha256":
                    stage_result["pre_tree_sha256"],
                "stage_post_tree_sha256":
                    stage_result["post_tree_sha256"],
                "stage_declared_delta_sha256":
                    stage_result["declared_delta_sha256"],
                "stage_output_set_sha256":
                    stage_result["output_set_sha256"],
                "stage_output_count": stage_result["output_count"],
                "stage_terminal_sha256": authority_report.sha256,
                "stage_terminal_receipt_sha256":
                    stage_result["terminal_receipt_sha256"],
                "phase_row_receipt_sha256": authority_report.sha256,
            })
        wrapper_expected = {
            "schema": "cheng.linux_cgroup_v2_exec_ledger_validation",
            "status": "PROVED",
            "workload_kind": workload_kind,
            "official_driver_sha256": (
                current_binding.driver.sha256
                if current_binding is not None
                else ZERO_SHA256
            ),
            "current_build_receipt_sha256": (
                current_binding.build_receipt.sha256
                if current_binding is not None
                else ZERO_SHA256
            ),
            "source_closure_cid": (
                current_binding.source_closure_cid
                if current_binding is not None
                else ZERO_SHA256
            ),
            "source_closure_capture_sha256": (
                current_binding.source_closure_capture_sha256
                if current_binding is not None
                else ZERO_SHA256
            ),
            "source_manifest_sha256": (
                descriptor_rows["snapshot_manifest_sha256"]
                if current_binding is not None
                else ZERO_SHA256
            ),
            "entry_source_sha256": (
                current_binding.entry_sha256
                if current_binding is not None
                else ZERO_SHA256
            ),
            "producer_sha256": ledger_identity["producer_sha256"],
            "validator_sha256": ledger_identity["validator_sha256"],
            "manifest_sha256": ledger_identity["manifest_sha256"],
            "ledger_receipt_sha256": ledger_file.sha256,
            "command_argv_sha256": ledger_framed_sha256(ledger_command),
            "expected_exit_code": str(LEDGER_EXPECTED_EXIT_CODE),
            "actual_exit_code": str(LEDGER_EXPECTED_EXIT_CODE),
            "target_stdout_sha256": output_stdout.sha256,
            "target_stdout_size": str(output_stdout.size),
            "target_stderr_sha256": output_stderr.sha256,
            "target_stderr_size": str(output_stderr.size),
            "workload_output_status": workload_output_status,
            "workload_output_sha256": workload_output_sha256,
            "workload_output_size": workload_output_size,
            "workload_output_mode": workload_output_mode,
            "workload_report_sha256": authority_report.sha256,
            "workload_report_size": str(authority_report.size),
            "dry_source_file_count": (
                dry_rows["dry_compile_input_source_file_count"]
                if dry_rows is not None
                else "0"
            ),
            "dry_source_line_count": (
                dry_rows["dry_compile_input_source_line_count"]
                if dry_rows is not None
                else "0"
            ),
            "dry_source_byte_count": (
                dry_rows["dry_compile_input_source_byte_count"]
                if dry_rows is not None
                else "0"
            ),
            "dry_source_max_file_bytes": (
                dry_rows["dry_compile_input_source_max_file_bytes"]
                if dry_rows is not None
                else "0"
            ),
            "dry_exec_phase_actual_total_ms": (
                dry_rows["exec_phase_dry_actual_total_ms"]
                if dry_rows is not None
                else "0"
            ),
            "dry_full_theory_time_guard_recommended_ms": (
                dry_rows["full_compile_theory_time_guard_recommended_ms"]
                if dry_rows is not None
                else "0"
            ),
            "dry_full_theory_rss_modeled_guard_estimate_bytes": (
                dry_rows[
                    "full_compile_theory_rss_modeled_guard_estimate_bytes"
                ]
                if dry_rows is not None
                else "0"
            ),
            "current_driver_next_sha256": (
                authority_executable.sha256
                if authority_executable is not None
                else ZERO_SHA256
            ),
            "current_driver_next_size": (
                str(authority_executable.size)
                if authority_executable is not None
                else "0"
            ),
            "current_driver_next_mode": (
                format(stat.S_IMODE(authority_executable.mode), "o")
                if authority_executable is not None
                else "0"
            ),
            "current_driver_report_sha256": (
                authority_report.sha256
                if workload_kind == WORKLOAD_CURRENT_DRIVER
                else ZERO_SHA256
            ),
            "current_driver_report_size": (
                str(authority_report.size)
                if workload_kind == WORKLOAD_CURRENT_DRIVER
                else "0"
            ),
            "stage_authority_manifest_sha256":
                stage_fields["stage_authority_manifest_sha256"],
            "stage_execution_manifest_sha256":
                stage_fields["stage_execution_manifest_sha256"],
            "stage_manifest_pair_commitment_sha256":
                stage_fields[
                    "stage_manifest_pair_commitment_sha256"
                ],
            "stage_phase_plan_sha256":
                stage_fields["stage_phase_plan_sha256"],
            "stage_phase_index": stage_fields["stage_phase_index"],
            "stage_phase_label": stage_fields["stage_phase_label"],
            "stage_pre_tree_sha256":
                stage_fields["stage_pre_tree_sha256"],
            "stage_post_tree_sha256":
                stage_fields["stage_post_tree_sha256"],
            "stage_declared_delta_sha256":
                stage_fields["stage_declared_delta_sha256"],
            "stage_output_set_sha256":
                stage_fields["stage_output_set_sha256"],
            "stage_output_count": stage_fields["stage_output_count"],
            "stage_terminal_relative_path":
                stage_fields["stage_terminal_relative_path"],
            "stage_terminal_sha256":
                stage_fields["stage_terminal_sha256"],
            "stage_terminal_receipt_sha256":
                stage_fields["stage_terminal_receipt_sha256"],
        }
        for key, expected in wrapper_expected.items():
            if ledger_wrapper_rows.get(key) != expected:
                raise GateError(
                    "descendant ledger wrapper receipt mismatch: " + key,
                )
        for key in (
            "ledger_payload_sha256",
            "producer_stdout_sha256",
            "producer_stderr_sha256",
            "validator_stdout_sha256",
            "validator_stderr_sha256",
        ):
            if not SHA256_RE.fullmatch(ledger_wrapper_rows.get(key, "")):
                raise GateError("descendant ledger hash field is absent: " + key)
        if (
            not ledger_wrapper_rows["event_count"].isdigit()
            or int(ledger_wrapper_rows["event_count"]) <= 0
        ):
            raise GateError("descendant ledger event count is invalid")
        ledger_fields = {
            "descendant_exec_ledger_status": "PROVED",
            "descendant_exec_ledger_schema":
                "cheng.linux_ptrace_exec_ledger",
            "descendant_exec_ledger_producer_sha256":
                ledger_identity["producer_sha256"],
            "descendant_exec_ledger_validator_sha256":
                ledger_identity["validator_sha256"],
            "descendant_exec_ledger_wrapper_sha256":
                ledger_source_identities["wrapper_sha256"],
            "descendant_exec_ledger_manifest_sha256":
                ledger_identity["manifest_sha256"],
            "descendant_exec_ledger_receipt_sha256": ledger_file.sha256,
            "descendant_exec_ledger_payload_sha256":
                ledger_wrapper_rows["ledger_payload_sha256"],
            "descendant_exec_ledger_wrapper_receipt_sha256":
                wrapper_receipt_file.sha256,
            "descendant_exec_ledger_command_argv_sha256":
                ledger_wrapper_rows["command_argv_sha256"],
            "descendant_exec_ledger_expected_exit_code":
                ledger_wrapper_rows["expected_exit_code"],
            "descendant_exec_ledger_actual_exit_code":
                ledger_wrapper_rows["actual_exit_code"],
            "descendant_exec_ledger_event_count":
                ledger_wrapper_rows["event_count"],
            "ledger_standalone_validation_sha256":
                ledger_wrapper_rows["validator_stdout_sha256"],
        }
        product_output_fields = {
            "workload_output_status": workload_output_status,
            "workload_output_sha256": workload_output_sha256,
            "workload_output_size": workload_output_size,
            "workload_output_mode": workload_output_mode,
            "workload_report_sha256": authority_report.sha256,
            "workload_report_size": str(authority_report.size),
            "dry_source_file_count": (
                dry_rows["dry_compile_input_source_file_count"]
                if dry_rows is not None
                else "0"
            ),
            "dry_source_line_count": (
                dry_rows["dry_compile_input_source_line_count"]
                if dry_rows is not None
                else "0"
            ),
            "dry_source_byte_count": (
                dry_rows["dry_compile_input_source_byte_count"]
                if dry_rows is not None
                else "0"
            ),
            "dry_source_max_file_bytes": (
                dry_rows["dry_compile_input_source_max_file_bytes"]
                if dry_rows is not None
                else "0"
            ),
            "dry_exec_phase_actual_total_ms": (
                dry_rows["exec_phase_dry_actual_total_ms"]
                if dry_rows is not None
                else "0"
            ),
            "dry_full_theory_time_guard_recommended_ms": (
                dry_rows["full_compile_theory_time_guard_recommended_ms"]
                if dry_rows is not None
                else "0"
            ),
            "dry_full_theory_rss_modeled_guard_estimate_bytes": (
                dry_rows[
                    "full_compile_theory_rss_modeled_guard_estimate_bytes"
                ]
                if dry_rows is not None
                else "0"
            ),
            "current_driver_next_sha256": (
                authority_executable.sha256
                if authority_executable is not None
                else ZERO_SHA256
            ),
            "current_driver_next_size": (
                str(authority_executable.size)
                if authority_executable is not None
                else "0"
            ),
            "current_driver_next_mode": (
                format(stat.S_IMODE(authority_executable.mode), "o")
                if authority_executable is not None
                else "0"
            ),
            "current_driver_report_sha256": (
                authority_report.sha256
                if workload_kind == WORKLOAD_CURRENT_DRIVER
                else ZERO_SHA256
            ),
            "current_driver_report_size": (
                str(authority_report.size)
                if workload_kind == WORKLOAD_CURRENT_DRIVER
                else "0"
            ),
        }
    rows: list[tuple[str, str]] = [
        ("tool", "tools/beat_c_linux_cgroup_v2_hard_memory_gate.sh"),
        ("schema", SCHEMA),
        ("status", status),
        ("applicability", APPLICABILITY),
        ("driver_role", "production"),
        ("hard_memory_limit_proof_status", PROOF_STATUS),
        ("memory_enforcement_scope", MEMORY_SCOPE),
        ("mode", mode),
        ("workload_kind", workload_kind),
        ("execution_result", execution_result),
        ("memory_limit_bytes", str(LIMIT_BYTES)),
        ("memory_swap_max_bytes", str(SWAP_MAX_BYTES)),
        ("pids_max", str(PIDS_MAX)),
        ("attack_child_count", str(ATTACK_CHILD_COUNT)),
        ("attack_child_bytes", str(ATTACK_CHILD_BYTES)),
        ("attack_aggregate_bytes", str(ATTACK_AGGREGATE_BYTES)),
        ("delegation_manifest_sha256", manifest.file.sha256),
        (
            "delegation_manifest_path_fshex",
            os.fsencode(str(delegation_manifest_path)).hex(),
        ),
        ("delegation_manifest_device", str(manifest.file.device)),
        ("delegation_manifest_inode", str(manifest.file.inode)),
        ("delegation_manifest_mode", format(manifest.file.mode, "o")),
        ("delegation_manifest_uid", str(manifest.file.uid)),
        ("delegation_manifest_gid", str(manifest.file.gid)),
        ("delegation_parent_path_fshex", os.fsencode(str(parent)).hex()),
        ("delegation_parent_device", manifest.rows["parent_device"]),
        ("delegation_parent_inode", manifest.rows["parent_inode"]),
        (
            "delegation_controller_path_fshex",
            manifest.rows["controller_path_fshex"],
        ),
        ("delegation_boot_id", manifest.rows["boot_id"]),
        ("cgroup_namespace_inode", manifest.rows["cgroup_namespace_inode"]),
        ("leaf_path_fshex", os.fsencode(str(leaf)).hex()),
        ("leaf_device", str(leaf_info.st_dev)),
        ("leaf_inode", str(leaf_info.st_ino)),
        ("cgroup_mount_type", "cgroup2"),
        ("crun_path_fshex", os.fsencode(str(crun.path)).hex()),
        ("crun_sha256", crun.sha256),
        ("crun_clone3_policy", CRUN_CLONE3_POLICY),
        ("crun_clone3_exact_flags", str(CRUN_CLONE3_EXACT_FLAGS)),
        (
            "crun_clone3_intercept_count",
            str(crun_clone3_intercept_count),
        ),
        (
            "crun_exec_transition_count",
            str(crun_exec_transition_count),
        ),
        ("rootfs_manifest_sha256", rootfs_manifest.file.sha256),
        (
            "rootfs_manifest_path_fshex",
            os.fsencode(str(rootfs_manifest_path)).hex(),
        ),
        ("rootfs_path_fshex", os.fsencode(str(rootfs_manifest.rootfs)).hex()),
        ("rootfs_tree_cid", rootfs_manifest.tree_cid),
        ("oci_config_sha256", config_sha),
        ("runtime_id", runtime_id),
        ("init_host_pid", str(init_pid)),
        ("init_host_pid_starttime", str(init_starttime)),
        (
            "workload_wall_start_monotonic_ns",
            str(workload_wall_start_monotonic_ns),
        ),
        (
            "workload_wall_end_monotonic_ns",
            str(workload_wall_end_monotonic_ns),
        ),
        ("workload_wall_elapsed_ns", str(workload_wall_elapsed_ns)),
        ("memory_peak_before_bytes", str(live_before["memoryPeak"])),
        ("memory_peak_after_bytes", str(live_after["memoryPeak"])),
        ("memory_current_before_bytes", str(live_before["memoryCurrent"])),
        ("memory_current_after_bytes", str(live_after["memoryCurrent"])),
    ]
    for phase_name, events in (("before", before_events), ("after", after_events)):
        for event in ("low", "high", "max", "oom", "oom_kill", "oom_group_kill"):
            rows.append((
                f"memory_events_local_{phase_name}_{event}",
                str(events[event]),
            ))
    rows.extend([
        ("target_argv_count", str(len(target_argv))),
        ("target_argv_sha256", framed_sha256(target_argv)),
        ("target_env_count", str(len(target_env))),
        ("target_env_sha256", framed_sha256(target_env)),
        *ledger_fields.items(),
        (
            "native_descriptor_path_fshex",
            (
                os.fsencode(str(native_descriptor_path)).hex()
                if native_descriptor_path is not None
                else ""
            ),
        ),
        (
            "native_descriptor_sha256",
            (
                descriptor_file.sha256
                if descriptor_file is not None
                else ZERO_SHA256
            ),
        ),
        (
            "native_descriptor_payload_sha256",
            descriptor_rows.get("descriptor_payload_sha256", ZERO_SHA256),
        ),
        (
            "native_descriptor_target",
            descriptor_rows.get("target", "not_applicable"),
        ),
        (
            "native_descriptor_machine",
            descriptor_rows.get("machine", "x86_64"),
        ),
        (
            "native_descriptor_candidate_entry_path",
            descriptor_rows.get("candidate_entry_path", ""),
        ),
        (
            "native_descriptor_candidate_entry_module_path",
            descriptor_rows.get("candidate_entry_module_path", ""),
        ),
        (
            "native_descriptor_candidate_entry_sha256",
            descriptor_rows.get("candidate_entry_sha256", ZERO_SHA256),
        ),
        (
            "native_descriptor_worker_sha256",
            descriptor_rows.get("worker_sha256", ZERO_SHA256),
        ),
        (
            "native_descriptor_snapshot_manifest_sha256",
            descriptor_rows.get("snapshot_manifest_sha256", ZERO_SHA256),
        ),
        ("input_manifest_sha256", sha256_bytes(input_raw)),
        ("stdout_sha256", output_stdout.sha256),
        ("stdout_size", str(output_stdout.size)),
        ("stdout_device", str(output_stdout.device)),
        ("stdout_inode", str(output_stdout.inode)),
        ("stderr_sha256", output_stderr.sha256),
        ("stderr_size", str(output_stderr.size)),
        ("stderr_device", str(output_stderr.device)),
        ("stderr_inode", str(output_stderr.inode)),
        *product_output_fields.items(),
        *current_fields.items(),
        *stage_fields.items(),
        (
            "live_before_receipt_sha256",
            validator.stable_read(
                evidence / "live-before.json",
                "live before receipt",
                1024 * 1024,
            ).sha256,
        ),
        (
            "live_during_receipt_sha256",
            validator.stable_read(
                evidence / "live-during.json",
                "live during receipt",
                1024 * 1024,
            ).sha256,
        ),
        (
            "live_after_receipt_sha256",
            validator.stable_read(
                evidence / "live-after.json",
                "live after receipt",
                1024 * 1024,
            ).sha256,
        ),
        (
            "live_cleanup_receipt_sha256",
            validator.stable_read(
                evidence / "live-cleanup.json",
                "live cleanup receipt",
                1024 * 1024,
            ).sha256,
        ),
        (
            "runner_sha256",
            validator.stable_read(
                Path(__file__).resolve(strict=True),
                "runner source",
                4 * 1024 * 1024,
            ).sha256,
        ),
        (
            "validator_sha256",
            validator.stable_read(
                VALIDATOR_PATH,
                "validator source",
                4 * 1024 * 1024,
            ).sha256,
        ),
        ("artifact_manifest_schema", ARTIFACT_SCHEMA),
        ("artifact_manifest_sha256", artifact_sha),
        ("artifact_count", str(artifact_count)),
        ("artifact_directory_count", str(artifact_directory_count)),
    ])
    write_receipt(evidence / "receipt.kv", rows, validator)
    parsed, _ = validator.read_receipt(evidence / "receipt.kv")
    return parsed


def make_evidence_root(path: Path) -> Path:
    exact_absent_path(path, "evidence root")
    os.mkdir(path, 0o700)
    return path.resolve(strict=True)


def run_pair(args: argparse.Namespace) -> None:
    if platform.system() != "Linux":
        raise GateError("native Linux host is required")
    if os.geteuid() == 0:
        raise GateError("root execution is forbidden")
    validator = load_validator()
    delegation_manifest_path = exact_existing_file(
        Path(args.delegation_manifest),
        "delegation manifest",
    )
    rootfs_manifest_path = exact_existing_file(
        Path(args.rootfs_manifest),
        "rootfs manifest",
    )
    parent = exact_existing_dir(Path(args.cgroup_parent), "cgroup parent")
    rootfs = exact_existing_dir(Path(args.rootfs), "rootfs")
    crun_path = exact_existing_file(Path(args.crun), "crun")
    crun = tool_identity(crun_path, "crun", validator)
    crun_file = validator.stable_read(
        crun_path, "crun authority", 256 * 1024 * 1024
    )
    validator.require_unprivileged_executable(
        crun_file, "crun authority"
    )
    if crun_file.sha256 != crun.sha256:
        raise GateError("crun tool and file identities differ")
    manifest = validator.parse_delegation_manifest(
        delegation_manifest_path,
        require_root_owner=True,
    )
    validator.validate_live_delegation(manifest, parent)
    rootfs_manifest = validator.validate_rootfs_manifest(
        rootfs_manifest_path,
        rootfs,
        crun.sha256,
        verify_tree=False,
    )
    if (
        rootfs_manifest.delegate_uid != os.geteuid()
        or rootfs_manifest.delegate_gid != os.getegid()
    ):
        raise GateError("rootfs and cgroup delegation identities differ")
    if not args.command:
        raise GateError("workload command is absent")
    current_dynamic = (
        args.workspace_root,
        args.source_closure,
        args.driver,
        args.build_receipt,
        args.native_descriptor,
        args.native_descriptor_sha256,
    )
    stage_dynamic = (
        args.stage_authority_manifest,
        args.phase_execution_manifest,
        args.manifest_pair_commitment,
        args.stage_plan_sha256,
    )
    current_before: Any | None = None
    native_before: tuple[dict[str, str], Any] | None = None
    native_descriptor_path: Path | None = None
    workspace_root: Path | None = None
    source_closure: Path | None = None
    driver: Path | None = None
    build_receipt: Path | None = None
    stage_before: Any | None = None
    if args.workload_kind == WORKLOAD_BOOTSTRAP_STAGE23_PHASE:
        if any(value not in (None, "") for value in current_dynamic) or \
                any(value in (None, "") for value in stage_dynamic):
            raise GateError("stage23/current workload inputs are mixed")
        stage_authority_manifest = exact_existing_file(
            Path(args.stage_authority_manifest),
            "stage23 phase authority manifest",
        )
        phase_execution_manifest = exact_existing_file(
            Path(args.phase_execution_manifest),
            "stage23 phase execution manifest",
        )
        manifest_pair_commitment = exact_existing_file(
            Path(args.manifest_pair_commitment),
            "stage23 manifest pair commitment",
        )
        stage_before = validator.validate_stage23_phase_binding(
            stage_authority_manifest,
            phase_execution_manifest,
            manifest_pair_commitment,
            args.stage_plan_sha256,
            rootfs_manifest,
            manifest,
            crun_file,
        )
        if args.command != list(stage_before.action_argv):
            raise GateError("stage23 phase action argv is not exact")
        if args.timeout_seconds != stage_before.timeout_seconds:
            raise GateError("stage23 phase timeout is not manifest-bound")
        workload_env = stage_before.action_env
        workload_target = stage_before.action_argv
    else:
        if any(value in (None, "") for value in current_dynamic) or \
                any(value not in (None, "") for value in stage_dynamic):
            raise GateError("current/stage23 workload inputs are mixed")
        workspace_root = exact_existing_dir(
            Path(args.workspace_root),
            "workspace root",
        )
        source_closure = exact_existing_file(
            Path(args.source_closure),
            "source closure",
        )
        driver = exact_existing_file(Path(args.driver), "current driver")
        build_receipt = exact_existing_file(
            Path(args.build_receipt),
            "current build receipt",
        )
        native_descriptor_path = exact_existing_file(
            Path(args.native_descriptor),
            "native descriptor",
        )
        current_before = validator.validate_current_binding(
            workspace_root,
            source_closure,
            driver,
            build_receipt,
        )
        native_before = validator.parse_native_descriptor(
            native_descriptor_path,
            args.native_descriptor_sha256,
            args.workload_kind,
        )
    if args.workload_kind == WORKLOAD_CURRENT_DRIVER:
        if current_before is None:
            raise GateError("current driver binding is absent")
        expected_prefix = (
            "system-link-exec",
            "--require-pure-system-link-exec",
        )
        if tuple(args.command[:2]) != expected_prefix:
            raise GateError("current workload is not pure system-link-exec")
        required_outputs = (
            "--out:" + CURRENT_DRIVER_NEXT_GUEST_PATH,
            "--report-out:" + CURRENT_DRIVER_REPORT_GUEST_PATH,
        )
        if (
            [
                value for value in args.command if value.startswith("--out:")
            ] != [required_outputs[0]]
            or [
                value
                for value in args.command
                if value.startswith("--report-out:")
            ] != [required_outputs[1]]
        ):
            raise GateError("current workload output authority mismatch")
        workload_env = FIXED_TARGET_ENV
        workload_target = (CURRENT_DRIVER_GUEST_PATH, *args.command)
    elif args.workload_kind == WORKLOAD_DRY_COMPILE:
        if current_before is None:
            raise GateError("dry compile current binding is absent")
        dry_entry = CURRENT_SOURCE_GUEST_PATH + "/" + current_before.entry_path
        expected_dry_command = [
            "dry-compile",
            "--root:" + CURRENT_SOURCE_GUEST_PATH,
            "--in:" + dry_entry,
            "--target:" + current_before.target,
            "--emit:exe",
            "--backend-jobs:1",
            "--out:" + DRY_OUTPUT_GUEST_PATH,
            "--report-out:" + DRY_REPORT_GUEST_PATH,
        ]
        if args.command != expected_dry_command:
            raise GateError("dry compile workload argv is not exact")
        workload_env = DRY_TARGET_ENV
        workload_target = (CURRENT_DRIVER_GUEST_PATH, *args.command)
    evidence_root = make_evidence_root(Path(args.evidence_root))
    if current_before is not None:
        if native_before is None:
            raise GateError("native descriptor binding is absent")
        descriptor_rows, _ = native_before
        descriptor_exact = {
            "target": current_before.target,
            "worker_sha256": current_before.driver.sha256,
            "source_closure_cid": current_before.source_closure_cid,
            "source_closure_capture_sha256":
                current_before.source_closure_capture_sha256,
            "candidate_build_receipt_sha256":
                current_before.build_receipt.sha256,
            "candidate_entry_path": current_before.entry_path,
            "candidate_entry_module_path": current_before.entry_module_path,
            "candidate_entry_sha256": current_before.entry_sha256,
            "cgroup_producer_sha256":
                validator.stable_read(
                    Path(__file__).resolve(strict=True),
                    "runner source",
                    4 * 1024 * 1024,
                ).sha256,
            "cgroup_validator_sha256":
                validator.stable_read(
                    VALIDATOR_PATH,
                    "validator source",
                    4 * 1024 * 1024,
                ).sha256,
            "target_argv_count": str(len(workload_target)),
            "target_argv_sha256": framed_sha256(workload_target),
            "target_env_count": str(len(workload_env)),
            "target_env_sha256": framed_sha256(workload_env),
        }
        for key, expected in descriptor_exact.items():
            if descriptor_rows.get(key) != expected:
                raise GateError(
                    f"native descriptor/current input mismatch: {key}",
                )
    workload = run_one(
        mode="workload",
        workload_kind=args.workload_kind,
        evidence=evidence_root / "workload",
        parent=parent,
        manifest=manifest,
        delegation_manifest_path=delegation_manifest_path,
        crun=crun,
        rootfs_manifest=rootfs_manifest,
        rootfs_manifest_path=rootfs_manifest_path,
        current_binding=current_before,
        pair_current_binding=current_before,
        stage_binding=stage_before,
        native_descriptor=native_before,
        native_descriptor_path=native_descriptor_path,
        target_argv=workload_target,
        target_env=workload_env,
        timeout=args.timeout_seconds,
        validator=validator,
    )
    attack = run_one(
        mode="aggregate_oom_probe",
        workload_kind=args.workload_kind,
        evidence=evidence_root / "aggregate-oom",
        parent=parent,
        manifest=manifest,
        delegation_manifest_path=delegation_manifest_path,
        crun=crun,
        rootfs_manifest=rootfs_manifest,
        rootfs_manifest_path=rootfs_manifest_path,
        current_binding=None,
        pair_current_binding=current_before,
        stage_binding=stage_before,
        native_descriptor=native_before,
        native_descriptor_path=native_descriptor_path,
        target_argv=(),
        target_env=workload_env,
        timeout=args.timeout_seconds,
        validator=validator,
    )
    validator_command = [
        "/usr/bin/python3",
        "-I",
        "-S",
        "-B",
        str(VALIDATOR_PATH),
        "--evidence-dir",
        str(evidence_root / "workload"),
        "--aggregate-evidence-dir",
        str(evidence_root / "aggregate-oom"),
        "--workload-kind",
        args.workload_kind,
    ]
    if stage_before is not None:
        validator_command.extend([
            "--stage-authority-manifest",
            str(stage_before.authority_manifest.path),
            "--phase-execution-manifest",
            str(stage_before.execution_manifest.path),
            "--manifest-pair-commitment",
            str(stage_before.manifest_pair_commitment.path),
            "--stage-plan-sha256",
            stage_before.plan_sha256,
        ])
    else:
        validator_command.extend([
            "--workspace-root",
            str(workspace_root),
            "--source-closure",
            str(source_closure),
            "--driver",
            str(driver),
            "--build-receipt",
            str(build_receipt),
            "--native-descriptor",
            str(native_descriptor_path),
            "--native-descriptor-sha256",
            args.native_descriptor_sha256,
        ])
    stdout, stderr = run_checked(
        validator_command,
        timeout=args.timeout_seconds,
    )
    validation_status = (
        "passed_stage23_phase"
        if stage_before is not None
        else "passed_unique_current"
    )
    expected_output = (
        "hard_gate_cleanup_status=verified_absent_live",
        "production_release_status=eligible_linux_gate_only",
        "darwin_release_status=HARD_RED",
        "hard_gate_validation_status=" + validation_status,
    )
    if tuple(stdout.decode("utf-8", "strict").splitlines()) != expected_output or stderr:
        raise GateError("independent pair validator output mismatch")
    if stage_before is not None:
        stage_after = validator.validate_stage23_phase_binding(
            stage_before.authority_manifest.path,
            stage_before.execution_manifest.path,
            stage_before.manifest_pair_commitment.path,
            stage_before.plan_sha256,
            rootfs_manifest,
            manifest,
            crun_file,
        )
        if stage_before != stage_after:
            raise GateError("stage23 bound production input drifted during pair")
    else:
        if (
            workspace_root is None
            or source_closure is None
            or driver is None
            or build_receipt is None
            or native_descriptor_path is None
        ):
            raise GateError("current pair input is absent after validation")
        current_after = validator.validate_current_binding(
            workspace_root,
            source_closure,
            driver,
            build_receipt,
        )
        native_after = validator.parse_native_descriptor(
            native_descriptor_path,
            args.native_descriptor_sha256,
            args.workload_kind,
        )
        if current_before != current_after or native_before != native_after:
            raise GateError("bound production input drifted during pair")
    rootfs_after = validator.validate_rootfs_manifest(
        rootfs_manifest_path,
        rootfs,
        crun.sha256,
        verify_tree=False,
    )
    if rootfs_manifest != rootfs_after:
        raise GateError("bound rootfs drifted during pair")
    print("hard_gate_pair_status=" + validation_status)
    print("production_release_status=eligible_linux_gate_only")
    print("darwin_release_status=HARD_RED")
    print(f"workload_receipt={evidence_root / 'workload/receipt.kv'}")
    print(f"aggregate_oom_receipt={evidence_root / 'aggregate-oom/receipt.kv'}")
    print(
        "workload_memory_peak_after_bytes="
        + workload["memory_peak_after_bytes"],
    )
    print(
        "aggregate_oom_memory_peak_after_bytes="
        + attack["memory_peak_after_bytes"],
    )


def self_test_output_history() -> None:
    root = Path(tempfile.mkdtemp(prefix="cheng-native-hardcap-history."))
    try:
        target = root / "output"
        write_exclusive(target, b"")
        before = os.stat(target, follow_symlinks=False)
        overwrite_owned_file(target, b"ok\n")
        after = os.stat(target, follow_symlinks=False)
        if (before.st_dev, before.st_ino) != (after.st_dev, after.st_ino):
            raise GateError("output inode drift")
        held = root / "held"
        replacement = root / "replacement"
        os.replace(target, held)
        write_exclusive(target, b"replacement\n")
        changed = os.stat(target, follow_symlinks=False)
        if (before.st_dev, before.st_ino) == (changed.st_dev, changed.st_ino):
            raise GateError("replacement fixture did not replace inode")
        os.replace(target, replacement)
        os.replace(held, target)
        restored = os.stat(target, follow_symlinks=False)
        if (before.st_dev, before.st_ino) != (restored.st_dev, restored.st_ino):
            raise GateError("restored fixture lost original inode")
        print("output_history_self_test_status=passed")
        print("output_history_pinned_inode_status=verified")
        print("output_history_replacement_status=rejected_by_live_binding")
    finally:
        shutil.rmtree(root)


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Prove one unique-current driver and aggregate OOM pair under "
            "a native Linux delegated cgroup-v2 limit"
        ),
    )
    parser.add_argument("--delegation-manifest")
    parser.add_argument("--cgroup-parent")
    parser.add_argument("--crun")
    parser.add_argument("--rootfs")
    parser.add_argument("--rootfs-manifest")
    parser.add_argument("--evidence-root")
    parser.add_argument("--workspace-root")
    parser.add_argument("--source-closure")
    parser.add_argument("--driver")
    parser.add_argument("--build-receipt")
    parser.add_argument("--native-descriptor")
    parser.add_argument("--native-descriptor-sha256")
    parser.add_argument("--stage-authority-manifest")
    parser.add_argument("--phase-execution-manifest")
    parser.add_argument("--manifest-pair-commitment")
    parser.add_argument("--stage-plan-sha256")
    parser.add_argument(
        "--workload-kind",
        choices=WORKLOAD_KINDS,
        default=WORKLOAD_CURRENT_DRIVER,
    )
    parser.add_argument("--timeout-seconds", type=int, default=300)
    parser.add_argument("--self-test-output-history", action="store_true")
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args(argv)
    if args.command and args.command[0] == "--":
        args.command = args.command[1:]
    return args


def main(argv: Sequence[str]) -> int:
    args = parse_args(argv)
    try:
        if args.self_test_output_history:
            dynamic_values = (
                args.delegation_manifest,
                args.cgroup_parent,
                args.crun,
                args.rootfs,
                args.rootfs_manifest,
                args.evidence_root,
                args.workspace_root,
                args.source_closure,
                args.driver,
                args.build_receipt,
                args.native_descriptor,
                args.native_descriptor_sha256,
                args.stage_authority_manifest,
                args.phase_execution_manifest,
                args.manifest_pair_commitment,
                args.stage_plan_sha256,
                *args.command,
            )
            if any(value not in (None, "") for value in dynamic_values):
                raise GateError("self-test cannot carry dynamic inputs")
            self_test_output_history()
            return 0
        common_required = (
            args.delegation_manifest,
            args.cgroup_parent,
            args.crun,
            args.rootfs,
            args.rootfs_manifest,
            args.evidence_root,
        )
        workload_required = (
            (
                args.stage_authority_manifest,
                args.phase_execution_manifest,
                args.manifest_pair_commitment,
                args.stage_plan_sha256,
            )
            if args.workload_kind == WORKLOAD_BOOTSTRAP_STAGE23_PHASE
            else (
                args.workspace_root,
                args.source_closure,
                args.driver,
                args.build_receipt,
                args.native_descriptor,
                args.native_descriptor_sha256,
            )
        )
        if any(
            value in (None, "")
            for value in (*common_required, *workload_required)
        ):
            print("hard_gate_dynamic_status=RED", file=sys.stderr)
            print(
                "hard_gate_reason=native_delegated_inputs_missing",
                file=sys.stderr,
            )
            print("production_release_status=HARD_RED", file=sys.stderr)
            print("darwin_release_status=HARD_RED", file=sys.stderr)
            return 1
        run_pair(args)
        return 0
    except (
        GateError,
        OSError,
        subprocess.SubprocessError,
        ValueError,
    ) as exc:
        print("hard_gate_pair_status=failed", file=sys.stderr)
        print(f"hard_gate_pair_reason={exc}", file=sys.stderr)
        print("production_release_status=HARD_RED", file=sys.stderr)
        print("darwin_release_status=HARD_RED", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
