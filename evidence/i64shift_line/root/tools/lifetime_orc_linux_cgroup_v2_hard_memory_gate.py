#!/usr/bin/env python3
"""Run the current LifetimeLedger and ORC gates under one kernel cgroup-v2 cap."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import select
import stat
import sys
import tempfile
from pathlib import Path
from typing import Any, Sequence


sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[1]
LIMIT_BYTES = 805_306_368
SWAP_MAX_BYTES = 0
SCHEMA = "cheng.lifetime_orc_linux_cgroup_v2_hard_memory"
PROOF_STATUS = "proved_linux_kernel_cgroup_v2_aggregate"
PROCESS_SCOPE = "cgroup_and_all_descendants"
LIFETIME_GATE = ROOT / "tools/lifetime_ledger_production_dynamic_mutation_gate.sh"
ORC_GATE = ROOT / "tools/orc_atomic_release_contract_gate.sh"
LIFETIME_DRIVER = ROOT / "artifacts/bootstrap/cheng.stage3"
ORC_DRIVER = ROOT / "artifacts/backend_driver/cheng"
GATE_SOURCE = Path(__file__).resolve()
GATE_WRAPPER = ROOT / "tools/lifetime_orc_linux_cgroup_v2_hard_memory_gate.sh"
RECEIPT_VALIDATOR = (
    ROOT / "tools/lifetime_orc_linux_cgroup_v2_hard_memory_receipt_validator"
)
RECEIPT_VALIDATOR_WRAPPER = (
    ROOT / "tools/lifetime_orc_linux_cgroup_v2_hard_memory_receipt_validator.sh"
)
STATIC_PATHS = (
    LIFETIME_GATE,
    ORC_GATE,
    GATE_SOURCE,
    GATE_WRAPPER,
    RECEIPT_VALIDATOR,
    RECEIPT_VALIDATOR_WRAPPER,
)
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
MAX_FILE_BYTES = 512 * 1024 * 1024
MAX_OUTPUT_BYTES = 64 * 1024 * 1024
LIMIT_EVENT_KEYS = ("max", "oom", "oom_kill", "oom_group_kill")
LIFETIME_MUTATION_DIAGNOSTICS = {
    "allocate_record": "lifetime_category_live_underflow",
    "borrow_record": "lifetime_borrow_retain_return_mismatch",
    "borrow_return_record": "lifetime_borrow_retain_return_mismatch",
    "move_record": "lifetime_borrow_retain_return_mismatch",
    "release_record": "lifetime_closed_live_objects",
    "allocate_bytes": "lifetime_category_live_underflow",
    "release_bytes": "lifetime_closed_live_bytes",
    "object_state_write": "lifetime_borrow_requires_owned",
    "ledger_storage_free": "lifetime_sequence_storage_release_incomplete",
    "storage_byte_column": "lifetime_dynamic_physical_release_mismatch",
    "worker_physical_free": "backend2_terminal_ledger_mismatch",
    "worker_move": "lifetime_release_owner_mismatch",
    "worker_release": "lifetime_owner_ended_owned",
    "released_physical_bytes": "backend2_terminal_ledger_mismatch",
    "allocated_bytes_receipt": "backend_sanitizer_ledger_mismatch",
    "ledger_storage_release": "backend2_terminal_ledger_mismatch",
}


class GateError(RuntimeError):
    pass


class CurrentArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise GateError("arguments_invalid:" + message)


def sha256_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def canonical_json(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def file_identity(path: Path, label: str, max_bytes: int) -> dict[str, Any]:
    if not path.is_absolute() or path.resolve(strict=True) != path:
        raise GateError(f"{label}_path_not_canonical")
    before = path.stat(follow_symlinks=False)
    if (
        not stat.S_ISREG(before.st_mode)
        or before.st_nlink != 1
        or before.st_size <= 0
        or before.st_size > max_bytes
    ):
        raise GateError(f"{label}_identity_invalid")
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0)
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(path, flags)
    try:
        opened = os.fstat(descriptor)
        if identity_tuple(opened) != identity_tuple(before):
            raise GateError(f"{label}_open_race")
        digest = hashlib.sha256()
        remaining = before.st_size
        while remaining:
            chunk = os.read(descriptor, min(1024 * 1024, remaining))
            if not chunk:
                raise GateError(f"{label}_short_read")
            digest.update(chunk)
            remaining -= len(chunk)
        if os.read(descriptor, 1):
            raise GateError(f"{label}_grew_while_reading")
        closed = os.fstat(descriptor)
    finally:
        os.close(descriptor)
    after = path.stat(follow_symlinks=False)
    if identity_tuple(before) != identity_tuple(closed) or identity_tuple(
        before
    ) != identity_tuple(after):
        raise GateError(f"{label}_read_race")
    return {
        "path": str(path),
        "device": before.st_dev,
        "inode": before.st_ino,
        "mode": before.st_mode,
        "links": before.st_nlink,
        "size": before.st_size,
        "mtimeNs": before.st_mtime_ns,
        "ctimeNs": before.st_ctime_ns,
        "sha256": digest.hexdigest(),
    }


def identity_tuple(info: os.stat_result) -> tuple[int, ...]:
    return (
        info.st_dev,
        info.st_ino,
        info.st_mode,
        info.st_nlink,
        info.st_size,
        info.st_mtime_ns,
        info.st_ctime_ns,
    )


def tree_identity(root: Path) -> str:
    if root.resolve(strict=True) != root:
        raise GateError("source_tree_not_canonical")
    digest = hashlib.sha256()
    for entry in sorted(root.rglob("*"), key=lambda item: os.fsencode(str(item))):
        relative = entry.relative_to(root).as_posix()
        info = entry.stat(follow_symlinks=False)
        if stat.S_ISLNK(info.st_mode):
            raise GateError("source_tree_symlink:" + relative)
        if stat.S_ISDIR(info.st_mode):
            continue
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise GateError("source_tree_entry_invalid:" + relative)
        current = file_identity(entry, "source_tree_entry", MAX_FILE_BYTES)
        relative_raw = relative.encode("utf-8")
        digest.update(len(relative_raw).to_bytes(8, "big"))
        digest.update(relative_raw)
        digest.update(bytes.fromhex(current["sha256"]))
        digest.update(current["size"].to_bytes(8, "big"))
    return digest.hexdigest()


def require_current_file(path: Path, label: str, executable: bool) -> dict[str, Any]:
    try:
        identity = file_identity(path, label, MAX_FILE_BYTES)
    except (FileNotFoundError, OSError) as error:
        raise GateError(f"{label}_missing") from error
    if executable and not os.access(path, os.X_OK):
        raise GateError(f"{label}_not_executable")
    return identity


def require_absent_output(path: Path) -> None:
    if (
        not path.is_absolute()
        or any(character in str(path) for character in ("\n", "\r"))
        or path.exists()
        or path.is_symlink()
        or path.parent.resolve(strict=True) != path.parent
    ):
        raise GateError("receipt_output_must_be_absent_canonical_path")


def read_text_file(path: Path, label: str, max_bytes: int) -> bytes:
    identity = file_identity(path, label, max_bytes)
    raw = path.read_bytes()
    if len(raw) != identity["size"] or sha256_bytes(raw) != identity["sha256"]:
        raise GateError(f"{label}_changed_after_identity")
    return raw


def unique_line(raw: bytes, key: str, label: str) -> str:
    prefix = (key + "=").encode("utf-8")
    rows = [
        line[len(prefix) :].decode("utf-8", "strict")
        for line in raw.splitlines()
        if line.startswith(prefix)
    ]
    if len(rows) != 1 or not rows[0]:
        raise GateError(f"{label}_field_missing_or_duplicate:{key}")
    return rows[0]


def require_sha(value: str, label: str) -> None:
    if not SHA256_RE.fullmatch(value) or value == "0" * 64:
        raise GateError(f"{label}_sha256_invalid")


def positive_uint_line(raw: bytes, key: str, label: str) -> int:
    value = unique_line(raw, key, label)
    if not value.isdigit() or int(value) <= 0:
        raise GateError(f"{label}_positive_uint_invalid:{key}")
    return int(value)


def expected_target() -> str:
    machine = os.uname().machine
    if machine == "x86_64":
        return "x86_64-unknown-linux-gnu"
    if machine in ("aarch64", "arm64"):
        return "aarch64-unknown-linux-gnu"
    raise GateError("linux_machine_unsupported")


def validate_lifetime_output(
    raw: bytes,
    driver_identity: dict[str, Any],
    target: str,
) -> dict[str, Any]:
    expected = {
        "lifetime_ledger_dynamic_mutation_status": "pass",
        "lifetime_ledger_dynamic_mutation_schema": "current",
        "lifetime_ledger_dynamic_mutation_driver_role": "production",
        "lifetime_ledger_dynamic_mutation_driver_path": str(LIFETIME_DRIVER),
        "lifetime_ledger_dynamic_mutation_backend_cycles_per_path": "5000",
        "lifetime_ledger_dynamic_mutation_backend_success_live": "0",
        "lifetime_ledger_dynamic_mutation_backend_failure_live": "0",
        "lifetime_ledger_dynamic_mutation_mutations": "16",
        "lifetime_ledger_dynamic_mutation_compile_contract": "all_mutations_compile",
        "lifetime_ledger_dynamic_mutation_runtime_contract": "all_mutations_hard_red",
        "lifetime_ledger_dynamic_mutation_target": target,
        "lifetime_ledger_dynamic_mutation_compiler_hash": driver_identity["sha256"],
        "lifetime_ledger_dynamic_mutation_release_evidence": "0",
    }
    for key, value in expected.items():
        if unique_line(raw, key, "lifetime") != value:
            raise GateError("lifetime_field_mismatch:" + key)
    mutation_rows = [
        line
        for line in raw.splitlines()
        if line.startswith(b"lifetime_ledger_dynamic_mutation_case=")
    ]
    expected_mutation_rows = {
        (
            "lifetime_ledger_dynamic_mutation_case="
            + mutation
            + ",compile=pass,runtime=red"
        ).encode()
        for mutation in LIFETIME_MUTATION_DIAGNOSTICS
    }
    if (
        len(mutation_rows) != len(expected_mutation_rows)
        or set(mutation_rows) != expected_mutation_rows
    ):
        raise GateError("lifetime_mutation_receipts_invalid")
    diagnostic_rows = [
        line
        for line in raw.splitlines()
        if line.startswith(b"lifetime_ledger_dynamic_mutation_diagnostic=")
    ]
    expected_diagnostic_rows = {
        (
            "lifetime_ledger_dynamic_mutation_diagnostic="
            + mutation
            + ",id="
            + diagnostic
        ).encode()
        for mutation, diagnostic in LIFETIME_MUTATION_DIAGNOSTICS.items()
    }
    if (
        len(diagnostic_rows) != len(expected_diagnostic_rows)
        or set(diagnostic_rows) != expected_diagnostic_rows
    ):
        raise GateError("lifetime_mutation_diagnostics_invalid")
    source_hash = unique_line(
        raw, "lifetime_ledger_dynamic_mutation_source_tree_hash", "lifetime"
    )
    require_sha(source_hash, "lifetime_source_tree")
    success_allocated = positive_uint_line(
        raw,
        "lifetime_ledger_dynamic_mutation_backend_success_allocated",
        "lifetime",
    )
    success_released = positive_uint_line(
        raw,
        "lifetime_ledger_dynamic_mutation_backend_success_released",
        "lifetime",
    )
    failure_allocated = positive_uint_line(
        raw,
        "lifetime_ledger_dynamic_mutation_backend_failure_allocated",
        "lifetime",
    )
    failure_released = positive_uint_line(
        raw,
        "lifetime_ledger_dynamic_mutation_backend_failure_released",
        "lifetime",
    )
    success_physical = positive_uint_line(
        raw,
        "lifetime_ledger_dynamic_mutation_backend_success_physical_released",
        "lifetime",
    )
    failure_physical = positive_uint_line(
        raw,
        "lifetime_ledger_dynamic_mutation_backend_failure_physical_released",
        "lifetime",
    )
    if (
        success_allocated != success_released
        or failure_allocated != failure_released
        or min(
            success_allocated,
            failure_allocated,
            success_physical,
            failure_physical,
        )
        < 5000
    ):
        raise GateError("lifetime_alloc_free_physical_receipt_invalid")
    return {
        "sourceTreeSha256": source_hash,
        "mutationCount": 16,
        "successAllocated": success_allocated,
        "successReleased": success_released,
        "failureAllocated": failure_allocated,
        "failureReleased": failure_released,
        "successPhysicalReleased": success_physical,
        "failurePhysicalReleased": failure_physical,
    }


def validate_orc_output(
    raw: bytes,
    driver_identity: dict[str, Any],
    target: str,
) -> dict[str, Any]:
    expected = {
        "orc_atomic_release_static_contract": "pass",
        "orc_atomic_release_static_mutation_count": "38",
        "orc_atomic_release_static_entry_roots": "2",
        "orc_atomic_release_contract_gate_status": "pass",
        "orc_atomic_release_contract_gate_schema": "current",
        "orc_atomic_release_contract_gate_driver_role": "production",
        "orc_atomic_release_contract_gate_compiler_hash": driver_identity["sha256"],
        "orc_atomic_release_contract_gate_backend_count": "2",
        "orc_atomic_release_contract_gate_success_iterations_per_backend": "5000",
        "orc_atomic_release_contract_gate_failure_cases_per_backend": "8",
        "orc_atomic_release_contract_gate_alloc_free_live": "exact",
        "orc_atomic_release_contract_gate_target": target,
        "orc_atomic_release_contract_gate_release_evidence": "0",
    }
    for key, value in expected.items():
        if unique_line(raw, key, "orc") != value:
            raise GateError("orc_field_mismatch:" + key)
    source_hash = unique_line(
        raw, "orc_atomic_release_contract_gate_source_hash", "orc"
    )
    require_sha(source_hash, "orc_source")
    return {
        "sourceSha256": source_hash,
        "staticMutationCount": 34,
        "successIterationsPerBackend": 5000,
        "failureCasesPerBackend": 8,
    }


def parse_uint_file(path: Path, label: str) -> int:
    value = path.read_text(encoding="ascii").strip()
    if not value.isdigit():
        raise GateError(f"{label}_not_uint")
    return int(value)


def parse_events(path: Path) -> dict[str, int]:
    rows: dict[str, int] = {}
    for line in path.read_text(encoding="ascii").splitlines():
        parts = line.split()
        if len(parts) != 2 or parts[0] in rows or not parts[1].isdigit():
            raise GateError("memory_events_invalid")
        rows[parts[0]] = int(parts[1])
    for key in ("low", "high", "max", "oom", "oom_kill", "oom_group_kill"):
        if key not in rows:
            raise GateError("memory_events_key_missing:" + key)
    return rows


def vm_swap_total_bytes() -> int:
    values = []
    for line in Path("/proc/meminfo").read_text(encoding="ascii").splitlines():
        if line.startswith("SwapTotal:"):
            parts = line.split()
            if len(parts) == 3 and parts[2] == "kB" and parts[1].isdigit():
                values.append(int(parts[1]) * 1024)
    if len(values) != 1:
        raise GateError("vm_swap_total_invalid")
    return values[0]


def cgroup2_mount_for(parent: Path) -> tuple[Path, str]:
    matches: list[tuple[Path, str]] = []
    for line in Path("/proc/self/mountinfo").read_text(encoding="utf-8").splitlines():
        fields = line.split()
        if "-" not in fields:
            continue
        separator = fields.index("-")
        if len(fields) <= separator + 2 or fields[separator + 1] != "cgroup2":
            continue
        mount = Path(
            fields[4]
            .replace("\\040", " ")
            .replace("\\011", "\t")
            .replace("\\012", "\n")
            .replace("\\134", "\\")
        ).resolve(strict=True)
        try:
            parent.relative_to(mount)
        except ValueError:
            continue
        matches.append((mount, fields[3]))
    if len(matches) != 1:
        raise GateError("cgroup2_mount_identity_invalid")
    return matches[0]


def require_cgroup_parent(parent: Path) -> tuple[Path, str]:
    if not parent.is_absolute() or parent.resolve(strict=True) != parent:
        raise GateError("cgroup_parent_not_canonical")
    mount, mount_root = cgroup2_mount_for(parent)
    controllers = (parent / "cgroup.controllers").read_text(encoding="ascii").split()
    subtree = (parent / "cgroup.subtree_control").read_text(encoding="ascii").split()
    if "memory" not in controllers or "memory" not in subtree:
        raise GateError("cgroup_memory_controller_not_delegated")
    if (parent / "cgroup.type").read_text(encoding="ascii").strip() != "domain":
        raise GateError("cgroup_parent_not_domain")
    for control in (
        "cgroup.procs",
        "memory.max",
        "memory.swap.max",
        "memory.oom.group",
        "memory.current",
        "memory.peak",
        "memory.events",
    ):
        if not (parent / control).is_file():
            raise GateError("cgroup_control_missing:" + control)
    if not os.access(parent, os.W_OK | os.X_OK):
        raise GateError("cgroup_parent_permission_missing")
    return mount, mount_root


def write_control(path: Path, value: str, label: str) -> None:
    try:
        descriptor = os.open(path, os.O_WRONLY | getattr(os, "O_CLOEXEC", 0))
        try:
            raw = value.encode("ascii")
            if os.write(descriptor, raw) != len(raw):
                raise GateError(f"{label}_short_write")
        finally:
            os.close(descriptor)
    except PermissionError as error:
        raise GateError(f"{label}_permission_missing") from error


def configure_cgroup(parent: Path) -> tuple[Path, dict[str, Any]]:
    name = f"cheng-lifetime-orc-current-{os.getpid()}-{os.urandom(8).hex()}"
    cgroup = parent / name
    try:
        os.mkdir(cgroup, 0o700)
    except PermissionError as error:
        raise GateError("cgroup_create_permission_missing") from error
    try:
        info = cgroup.stat(follow_symlinks=False)
        if not stat.S_ISDIR(info.st_mode):
            raise GateError("created_cgroup_not_directory")
        write_control(cgroup / "memory.max", str(LIMIT_BYTES), "memory_max")
        write_control(cgroup / "memory.swap.max", str(SWAP_MAX_BYTES), "swap_max")
        write_control(cgroup / "memory.oom.group", "1", "oom_group")
        snapshot = cgroup_snapshot(cgroup)
        validate_cgroup_contract(snapshot)
        return cgroup, {
            "path": str(cgroup),
            "device": info.st_dev,
            "inode": info.st_ino,
        }
    except BaseException:
        try:
            os.rmdir(cgroup)
        except OSError:
            pass
        raise


def cgroup_snapshot(cgroup: Path) -> dict[str, Any]:
    events = parse_events(cgroup / "memory.events")
    return {
        "proofStatus": PROOF_STATUS,
        "scope": PROCESS_SCOPE,
        "cgroupType": (cgroup / "cgroup.type").read_text(
            encoding="ascii"
        ).strip(),
        "memoryMax": parse_uint_file(cgroup / "memory.max", "memory_max"),
        "memorySwapMax": parse_uint_file(cgroup / "memory.swap.max", "memory_swap_max"),
        "memoryOomGroup": parse_uint_file(
            cgroup / "memory.oom.group", "memory_oom_group"
        ),
        "memorySwapCurrent": parse_uint_file(
            cgroup / "memory.swap.current", "memory_swap_current"
        ),
        "vmSwapTotal": vm_swap_total_bytes(),
        "memoryPeak": parse_uint_file(cgroup / "memory.peak", "memory_peak"),
        "events": events,
    }


def validate_cgroup_contract(snapshot: dict[str, Any]) -> None:
    if set(snapshot) != {
        "proofStatus",
        "scope",
        "cgroupType",
        "memoryMax",
        "memorySwapMax",
        "memoryOomGroup",
        "memorySwapCurrent",
        "vmSwapTotal",
        "memoryPeak",
        "events",
    }:
        raise GateError("cgroup_snapshot_keys_invalid")
    if snapshot["proofStatus"] != PROOF_STATUS:
        raise GateError("hard_memory_proof_status_invalid")
    if snapshot["scope"] != PROCESS_SCOPE:
        raise GateError("hard_memory_scope_invalid")
    if snapshot["cgroupType"] != "domain":
        raise GateError("cgroup_type_invalid")
    if type(snapshot["memoryMax"]) is not int or snapshot["memoryMax"] != LIMIT_BYTES:
        raise GateError("memory_max_invalid")
    for key in ("memorySwapMax", "memorySwapCurrent"):
        if type(snapshot[key]) is not int or snapshot[key] != 0:
            raise GateError(key + "_invalid")
    if type(snapshot["vmSwapTotal"]) is not int or snapshot["vmSwapTotal"] < 0:
        raise GateError("vmSwapTotal_invalid")
    if type(snapshot["memoryOomGroup"]) is not int or snapshot["memoryOomGroup"] != 1:
        raise GateError("memory_oom_group_invalid")
    if (
        type(snapshot["memoryPeak"]) is not int
        or snapshot["memoryPeak"] < 0
        or snapshot["memoryPeak"] > LIMIT_BYTES
    ):
        raise GateError("memory_peak_invalid")
    events = snapshot["events"]
    if (
        not isinstance(events, dict)
        or set(events) != {"low", "high", "max", "oom", "oom_kill", "oom_group_kill"}
        or any(type(value) is not int or value < 0 for value in events.values())
    ):
        raise GateError("memory_events_invalid")


def reject_limit_event_delta(
    label: str,
    before: dict[str, Any],
    after: dict[str, Any],
) -> None:
    validate_cgroup_contract(before)
    validate_cgroup_contract(after)
    before_events = before["events"]
    after_events = after["events"]
    for key in LIMIT_EVENT_KEYS:
        delta = after_events[key] - before_events[key]
        if delta < 0:
            raise GateError(f"kernel_limit_event_counter_regressed:{label}:{key}")
        if delta > 0:
            raise GateError(
                f"kernel_memory_limit_event:{label}:{key}:delta={delta}"
            )


def cgroup_relative_membership(
    cgroup: Path,
    mount: Path,
    mount_root: str,
) -> str:
    relative = cgroup.relative_to(mount).as_posix()
    root = mount_root.rstrip("/")
    return (root + "/" + relative).replace("//", "/")


def fixed_environment() -> dict[str, str]:
    return {
        "HOME": "/tmp",
        "LANG": "C",
        "LC_ALL": "C",
        "PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
        "TMPDIR": "/tmp",
    }


def run_gate_in_cgroup(
    gate: Path,
    cgroup: Path,
    mount: Path,
    mount_root: str,
    output_dir: Path,
    timeout_seconds: int,
) -> tuple[int, bytes, bytes, str, dict[str, Any]]:
    stdout_path = output_dir / (gate.stem + ".stdout")
    stderr_path = output_dir / (gate.stem + ".stderr")
    stdout_fd = os.open(stdout_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    stderr_fd = os.open(stderr_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    ready_read, ready_write = os.pipe()
    go_read, go_write = os.pipe()
    child = os.fork()
    if child == 0:
        try:
            os.close(ready_read)
            os.close(go_write)
            os.dup2(stdout_fd, 1)
            os.dup2(stderr_fd, 2)
            os.close(stdout_fd)
            os.close(stderr_fd)
            write_control(cgroup / "cgroup.procs", str(os.getpid()), "attach")
            membership = (
                Path("/proc/self/cgroup").read_text(encoding="ascii").splitlines()
            )
            expected = "0::" + cgroup_relative_membership(cgroup, mount, mount_root)
            if membership != [expected]:
                raise GateError("child_cgroup_membership_invalid")
            os.write(ready_write, b"R")
            os.close(ready_write)
            if os.read(go_read, 1) != b"G":
                raise GateError("child_start_barrier_invalid")
            os.close(go_read)
            os.execve(gate, [str(gate)], fixed_environment())
        except BaseException as error:
            os.write(2, ("hard_gate_child_error=" + str(error) + "\n").encode())
            os._exit(126)
    os.close(ready_write)
    os.close(go_read)
    os.close(stdout_fd)
    os.close(stderr_fd)
    try:
        readable, _, _ = select.select([ready_read], [], [], 10)
        if not readable or os.read(ready_read, 1) != b"R":
            raise GateError("cgroup_attach_barrier_timeout")
        members = {
            int(value)
            for value in (cgroup / "cgroup.procs").read_text(encoding="ascii").split()
            if value.isdigit()
        }
        if child not in members:
            raise GateError("root_gate_process_not_in_cgroup")
        membership_witness = {
            "rootPid": child,
            "membership": "0::" + cgroup_relative_membership(cgroup, mount, mount_root),
            "initialCgroupProcs": sorted(members),
            "attachmentPhase": "before_exec",
            "descendantPlacement": "kernel_inherited_same_leaf",
        }
        configured = cgroup_snapshot(cgroup)
        validate_cgroup_contract(configured)
        os.write(go_write, b"G")
        os.close(go_write)
        go_write = -1
        if not hasattr(os, "pidfd_open"):
            raise GateError("pidfd_wait_unavailable")
        pidfd = os.pidfd_open(child)
        try:
            readable, _, _ = select.select([pidfd], [], [], timeout_seconds)
            if not readable:
                write_control(cgroup / "cgroup.kill", "1", "cgroup_kill")
                raise GateError("gate_timeout")
        finally:
            os.close(pidfd)
        waited, status = os.waitpid(child, 0)
        if waited != child:
            raise GateError("gate_wait_identity_invalid")
        return_code = os.waitstatus_to_exitcode(status)
    except BaseException:
        try:
            write_control(cgroup / "cgroup.kill", "1", "cgroup_kill")
        except (GateError, OSError):
            pass
        try:
            os.waitpid(child, 0)
        except ChildProcessError:
            pass
        raise
    finally:
        os.close(ready_read)
        if go_write >= 0:
            os.close(go_write)
    if (cgroup / "cgroup.procs").read_text(encoding="ascii").split():
        raise GateError("gate_left_processes_in_cgroup")
    stdout = read_text_file(stdout_path, "gate_stdout", MAX_OUTPUT_BYTES)
    stderr = read_text_file(stderr_path, "gate_stderr", MAX_OUTPUT_BYTES)
    return (
        return_code,
        stdout,
        stderr,
        sha256_bytes(canonical_json(fixed_environment())),
        membership_witness,
    )


def write_receipt(path: Path, value: dict[str, Any]) -> None:
    require_absent_output(path)
    payload = dict(value)
    payload["receiptSha256"] = sha256_bytes(canonical_json(value))
    raw = canonical_json(payload) + b"\n"
    descriptor = os.open(
        path,
        os.O_WRONLY
        | os.O_CREAT
        | os.O_EXCL
        | getattr(os, "O_CLOEXEC", 0)
        | getattr(os, "O_NOFOLLOW", 0),
        0o400,
    )
    try:
        view = memoryview(raw)
        while view:
            written = os.write(descriptor, view)
            if written <= 0:
                raise GateError("receipt_short_write")
            view = view[written:]
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    directory = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def failure_receipt(error: BaseException, args: argparse.Namespace) -> dict[str, Any]:
    reason = str(error).replace("\r", " ").replace("\n", " ")
    if not reason:
        reason = type(error).__name__
    return {
        "schema": SCHEMA,
        "status": "hard_red",
        "driverRole": "production",
        "dynamicStatus": "red",
        "hardMemoryProofStatus": "not_proved",
        "memoryEnforcementScope": PROCESS_SCOPE,
        "memoryMax": LIMIT_BYTES,
        "memorySwapMax": SWAP_MAX_BYTES,
        "memoryAndSwapTotalLimit": LIMIT_BYTES,
        "cgroupParent": str(args.cgroup_parent),
        "reason": reason,
        "hostSystem": os.uname().sysname,
        "hostMachine": os.uname().machine,
        "userSpaceSamplingAuthority": 0,
        "releaseScope": "deterministic_memory_lane_only",
    }


def try_write_failure_receipt(
    error: BaseException,
    args: argparse.Namespace | None,
) -> tuple[str, str]:
    if args is None or not getattr(args, "output", None):
        return "", "failure_receipt_output_unavailable"
    output = Path(args.output)
    try:
        write_receipt(output, failure_receipt(error, args))
        return str(output), ""
    except (GateError, OSError, ValueError, TypeError, UnicodeError) as write_error:
        return "", str(write_error).replace("\r", " ").replace("\n", " ")


def run(args: argparse.Namespace) -> None:
    if os.uname().sysname != "Linux":
        raise GateError("linux_cgroup_v2_required")
    target = expected_target()
    parent = Path(args.cgroup_parent)
    mount, mount_root = require_cgroup_parent(parent)
    output = Path(args.output)
    require_absent_output(output)
    static_before = {
        str(path): require_current_file(path, "contract_source", True)
        for path in STATIC_PATHS
    }
    lifetime_driver_before = require_current_file(
        LIFETIME_DRIVER, "lifetime_current_driver", True
    )
    orc_driver_before = require_current_file(ORC_DRIVER, "orc_current_driver", True)
    source_tree_before = tree_identity(ROOT / "src")
    cgroup: Path | None = None
    cgroup_identity: dict[str, Any] | None = None
    cleanup_error = ""
    try:
        cgroup, cgroup_identity = configure_cgroup(parent)
        before = cgroup_snapshot(cgroup)
        with tempfile.TemporaryDirectory(
            prefix="cheng-lifetime-orc-hard-memory."
        ) as temporary:
            output_dir = Path(temporary).resolve(strict=True)
            (
                lifetime_rc,
                lifetime_stdout,
                lifetime_stderr,
                env_sha,
                lifetime_membership,
            ) = run_gate_in_cgroup(
                LIFETIME_GATE,
                cgroup,
                mount,
                mount_root,
                output_dir,
                args.timeout_seconds,
            )
            lifetime_after = cgroup_snapshot(cgroup)
            reject_limit_event_delta("lifetime", before, lifetime_after)
            if lifetime_rc != 0 or lifetime_stderr:
                raise GateError(
                    f"lifetime_gate_failed:{lifetime_rc}:"
                    + lifetime_stderr[:2000].decode("utf-8", "replace")
                )
            lifetime = validate_lifetime_output(
                lifetime_stdout, lifetime_driver_before, target
            )
            (
                orc_rc,
                orc_stdout,
                orc_stderr,
                orc_env_sha,
                orc_membership,
            ) = run_gate_in_cgroup(
                ORC_GATE,
                cgroup,
                mount,
                mount_root,
                output_dir,
                args.timeout_seconds,
            )
            orc_after = cgroup_snapshot(cgroup)
            reject_limit_event_delta("orc", lifetime_after, orc_after)
            if orc_env_sha != env_sha:
                raise GateError("gate_environment_identity_drift")
            if orc_rc != 0 or orc_stderr:
                raise GateError(
                    f"orc_gate_failed:{orc_rc}:"
                    + orc_stderr[:2000].decode("utf-8", "replace")
                )
            orc = validate_orc_output(orc_stdout, orc_driver_before, target)
            after = orc_after
            validate_cgroup_contract(after)
            if after["memoryPeak"] <= 0:
                raise GateError("kernel_memory_peak_witness_missing")
            if (cgroup / "cgroup.procs").read_text(encoding="ascii").split():
                raise GateError("cgroup_not_empty_after_gates")
            lifetime_stdout_sha = sha256_bytes(lifetime_stdout)
            orc_stdout_sha = sha256_bytes(orc_stdout)
    finally:
        if cgroup is not None and cgroup.exists():
            try:
                if (cgroup / "cgroup.procs").read_text(encoding="ascii").split():
                    write_control(cgroup / "cgroup.kill", "1", "cgroup_kill")
                os.rmdir(cgroup)
            except (GateError, OSError) as error:
                cleanup_error = str(error)
    if cleanup_error:
        raise GateError("cgroup_cleanup_failed:" + cleanup_error)
    static_after = {
        str(path): require_current_file(path, "contract_source", True)
        for path in STATIC_PATHS
    }
    lifetime_driver_after = require_current_file(
        LIFETIME_DRIVER, "lifetime_current_driver", True
    )
    orc_driver_after = require_current_file(ORC_DRIVER, "orc_current_driver", True)
    source_tree_after = tree_identity(ROOT / "src")
    if (
        static_after != static_before
        or lifetime_driver_after != lifetime_driver_before
        or orc_driver_after != orc_driver_before
        or source_tree_after != source_tree_before
    ):
        raise GateError("current_identity_drift_during_hard_gate")
    assert cgroup_identity is not None
    receipt = {
        "schema": SCHEMA,
        "status": "passed",
        "driverRole": "production",
        "dynamicStatus": "passed",
        "hardMemoryProofStatus": PROOF_STATUS,
        "memoryEnforcementScope": PROCESS_SCOPE,
        "memoryMax": LIMIT_BYTES,
        "memorySwapMax": SWAP_MAX_BYTES,
        "memoryAndSwapTotalLimit": LIMIT_BYTES,
        "memoryOomGroup": after["memoryOomGroup"],
        "memorySwapCurrent": after["memorySwapCurrent"],
        "vmSwapTotal": after["vmSwapTotal"],
        "memoryPeak": after["memoryPeak"],
        "memoryEventsBefore": before["events"],
        "memoryEventsAfter": after["events"],
        "cgroupPath": cgroup_identity["path"],
        "cgroupMountType": "cgroup2",
        "cgroupType": after["cgroupType"],
        "cgroupMountPath": str(mount),
        "cgroupDevice": cgroup_identity["device"],
        "cgroupInode": cgroup_identity["inode"],
        "cgroupCleanupStatus": "verified_absent",
        "cgroupEmptyAfter": True,
        "limitEventsDeltaStatus": "zero",
        "processTreePlacementStatus":
            "pre_exec_root_attached_descendants_same_leaf",
        "target": target,
        "sourceTreeSha256": source_tree_after,
        "lifetimeDriverSha256": lifetime_driver_after["sha256"],
        "orcDriverSha256": orc_driver_after["sha256"],
        "lifetimeGateStdoutSha256": lifetime_stdout_sha,
        "orcGateStdoutSha256": orc_stdout_sha,
        "lifetimeRootAttachment": lifetime_membership,
        "orcRootAttachment": orc_membership,
        "gateEnvironmentSha256": env_sha,
        "lifetimeContract": lifetime,
        "orcContract": orc,
        "contractSourceSha256": sha256_bytes(canonical_json(static_after)),
        "userSpaceSamplingAuthority": 0,
        "releaseScope": "deterministic_memory_lane_only",
    }
    write_receipt(output, receipt)
    print("lifetime_orc_linux_hard_memory_status=pass")
    print("lifetime_orc_linux_hard_memory_schema=current")
    print("lifetime_orc_linux_hard_memory_proof=" + PROOF_STATUS)
    print("lifetime_orc_linux_hard_memory_scope=" + PROCESS_SCOPE)
    print("lifetime_orc_linux_hard_memory_memory_max=805306368")
    print("lifetime_orc_linux_hard_memory_swap_max=0")
    print("lifetime_orc_linux_hard_memory_user_space_sampling_authority=0")
    print("lifetime_orc_linux_hard_memory_release_scope=memory_lane_only")
    print("lifetime_orc_linux_hard_memory_receipt=" + str(output))


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = CurrentArgumentParser(
        description=(
            "Run the unique-current LifetimeLedger and ORC dynamic gates "
            "inside one exact Linux cgroup-v2 768MiB, swap-disabled leaf"
        )
    )
    parser.add_argument("--cgroup-parent", default="/sys/fs/cgroup")
    parser.add_argument("--output", required=True)
    parser.add_argument("--timeout-seconds", type=int, default=3600)
    args = parser.parse_args(argv)
    if args.timeout_seconds < 1 or args.timeout_seconds > 3600:
        raise GateError("timeout_out_of_range")
    return args


def main(argv: Sequence[str]) -> int:
    args: argparse.Namespace | None = None
    try:
        args = parse_args(argv)
        run(args)
        return 0
    except (
        GateError,
        OSError,
        ValueError,
        TypeError,
        KeyError,
        UnicodeError,
    ) as error:
        failure_path, failure_write_error = try_write_failure_receipt(error, args)
        print("lifetime_orc_linux_hard_memory_status=HARD_RED", file=sys.stderr)
        print(
            "lifetime_orc_linux_hard_memory_reason=" + str(error),
            file=sys.stderr,
        )
        if failure_path:
            print(
                "lifetime_orc_linux_hard_memory_failure_receipt=" + failure_path,
                file=sys.stderr,
            )
        else:
            print(
                "lifetime_orc_linux_hard_memory_failure_receipt_error="
                + failure_write_error,
                file=sys.stderr,
            )
        print("production_release_status=HARD_RED", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
