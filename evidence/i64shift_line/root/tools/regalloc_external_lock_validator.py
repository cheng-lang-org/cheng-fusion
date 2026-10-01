#!/usr/bin/env python3
"""Read-only validator for regalloc production external locks."""

from __future__ import annotations

import argparse
import hashlib
import os
import pathlib
import stat
import struct
import sys
import time
from collections.abc import Mapping, Sequence


TARGET = "arm64-apple-darwin"
MAX_RSS_LIMIT = 1073741824
EXEC_DIFF_MIN_CASES = 209
CANONICAL_TARGETS = (
    ("arm64-apple-darwin", True, "macho", 0x0100000C),
    ("aarch64-apple-ios", True, "macho", 0x0100000C),
    ("arm64-apple-ios", True, "macho", 0x0100000C),
    ("wasm32-unknown-unknown", True, "wasm", 0),
    ("aarch64-pc-windows-msvc", False, "coff", 0xAA64),
    ("arm64-pc-windows-msvc", False, "coff", 0xAA64),
    ("x86_64-pc-windows-msvc", False, "coff", 0x8664),
    ("aarch64-unknown-linux-gnu", True, "elf", 183),
    ("arm64-unknown-linux-gnu", True, "elf", 183),
    ("aarch64-linux-android", True, "elf", 183),
    ("aarch64-linux-ohos", True, "elf", 183),
    ("aarch64-unknown-linux-ohos", True, "elf", 183),
    ("x86_64-unknown-linux-gnu", True, "elf", 62),
    ("riscv64-unknown-linux-gnu", True, "elf", 243),
    ("riscv64-unknown-none-elf", True, "elf", 243),
    ("x86_64-apple-darwin", False, "macho", 0x01000007),
)
CANONICAL_EMITS = ("obj", "shared", "exe")
CANONICAL_MATRIX_ID = "regalloc_target_emit_canonical.16x3"


class LockValidationError(RuntimeError):
    pass


def fail(reason: str) -> None:
    raise LockValidationError(reason)


def valid_sha(value: str) -> bool:
    return len(value) == 64 and all(ch in "0123456789abcdef" for ch in value)


def require_sha(value: str, label: str) -> str:
    if not valid_sha(value):
        fail(label + "_invalid_sha256")
    return value


def require_uint(rows: Mapping[str, str], key: str, label: str) -> int:
    value = rows.get(key, "")
    if not value.isdigit():
        fail(label + "_nonnumeric:" + key)
    return int(value)


class ReadTracker:
    def __init__(self) -> None:
        self._digests: dict[pathlib.Path, str] = {}

    def file(
        self, value: str | pathlib.Path, label: str, *, executable: bool = False
    ) -> pathlib.Path:
        path = pathlib.Path(value)
        if not path.is_absolute():
            fail(label + "_path_not_absolute")
        try:
            resolved = path.resolve(strict=True)
        except OSError:
            fail(label + "_path_missing")
        if resolved != path or path.is_symlink() or not path.is_file():
            fail(label + "_path_not_canonical_regular_file")
        if executable and not os.access(path, os.X_OK):
            fail(label + "_not_executable")
        return path

    def directory(self, value: str | pathlib.Path, label: str) -> pathlib.Path:
        path = pathlib.Path(value)
        if not path.is_absolute():
            fail(label + "_path_not_absolute")
        try:
            resolved = path.resolve(strict=True)
        except OSError:
            fail(label + "_path_missing")
        if resolved != path or path.is_symlink() or not path.is_dir():
            fail(label + "_path_not_canonical_directory")
        return path

    def read(
        self, value: str | pathlib.Path, label: str, *, executable: bool = False
    ) -> tuple[pathlib.Path, bytes, os.stat_result]:
        path = self.file(value, label, executable=executable)
        flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
        try:
            fd = os.open(path, flags)
        except OSError:
            fail(label + "_open_failed")
        try:
            before = os.fstat(fd)
            if not stat.S_ISREG(before.st_mode):
                fail(label + "_not_regular_file")
            chunks: list[bytes] = []
            while True:
                chunk = os.read(fd, 1024 * 1024)
                if not chunk:
                    break
                chunks.append(chunk)
            after = os.fstat(fd)
        finally:
            os.close(fd)
        final = os.stat(path, follow_symlinks=False)
        identity = lambda row: (
            row.st_dev, row.st_ino, row.st_size, row.st_mtime_ns, row.st_ctime_ns
        )
        if identity(before) != identity(after) or identity(after) != identity(final):
            fail(label + "_changed_during_read")
        data = b"".join(chunks)
        digest = hashlib.sha256(data).hexdigest()
        prior = self._digests.setdefault(path, digest)
        if prior != digest:
            fail(label + "_changed_during_validation")
        return path, data, final

    def digest(
        self, value: str | pathlib.Path, label: str, *, executable: bool = False
    ) -> str:
        return hashlib.sha256(self.read(value, label, executable=executable)[1]).hexdigest()

    def assert_fresh(self) -> None:
        for path, expected in self._digests.items():
            if self.digest(path, "final_snapshot") != expected:
                fail("artifact_changed_before_verdict:" + str(path))


def parse_kv(
    tracker: ReadTracker,
    path: str | pathlib.Path,
    label: str,
    payload_key: str | None = None,
) -> dict[str, str]:
    _, data, _ = tracker.read(path, label)
    try:
        lines = data.decode("utf-8", errors="strict").splitlines()
    except UnicodeError:
        fail(label + "_invalid_utf8")
    rows: dict[str, str] = {}
    for raw in lines:
        if "=" not in raw:
            fail(label + "_malformed_line")
        key, value = raw.split("=", 1)
        if not key or key in rows:
            fail(label + "_duplicate_or_empty_key:" + key)
        rows[key] = value
    if payload_key is not None:
        if not lines or not lines[-1].startswith(payload_key + "="):
            fail(label + "_payload_hash_not_last")
        reported = require_sha(rows.get(payload_key, ""), label + "_payload")
        payload = ("\n".join(lines[:-1]) + "\n").encode("utf-8")
        if hashlib.sha256(payload).hexdigest() != reported:
            fail(label + "_payload_hash_mismatch")
    return rows


def exact_fields(rows: Mapping[str, str], expected: set[str], label: str) -> None:
    if set(rows) != expected:
        missing = sorted(expected - set(rows))
        extra = sorted(set(rows) - expected)
        fail(
            "%s_field_set_mismatch:missing=%s:extra=%s"
            % (label, ",".join(missing), ",".join(extra))
        )


def immutable_artifact(
    tracker: ReadTracker,
    path_text: str,
    expected_sha: str,
    label: str,
    *,
    executable: bool = False,
) -> pathlib.Path:
    path = tracker.file(path_text, label, executable=executable)
    if tracker.digest(path, label, executable=executable) != require_sha(expected_sha, label):
        fail(label + "_hash_mismatch")
    return path


IDENTITY_KEYS = (
    "driver_sha256",
    "source_git_tree",
    "source_manifest_sha256",
    "allocator_sha256",
    "target",
)


def require_identity(rows: Mapping[str, str], identity: Mapping[str, str], label: str) -> None:
    for key in IDENTITY_KEYS:
        if rows.get(key) != identity.get(key):
            fail(label + "_identity_mismatch:" + key)


def render_payload(fields: Sequence[tuple[str, object]], payload_key: str) -> bytes:
    lines = ["%s=%s" % (key, value) for key, value in fields]
    payload = ("\n".join(lines) + "\n").encode("utf-8")
    return payload + (payload_key + "=" + hashlib.sha256(payload).hexdigest() + "\n").encode()


def bound_artifact(
    tracker: ReadTracker,
    rows: Mapping[str, str],
    prefix: str,
    label: str,
    *,
    executable: bool = False,
) -> pathlib.Path:
    return immutable_artifact(
        tracker,
        rows.get(prefix + "_path", ""),
        rows.get(prefix + "_sha256", ""),
        label,
        executable=executable,
    )


def require_macho_arm64(
    tracker: ReadTracker, path: pathlib.Path, label: str, filetype: int
) -> str:
    _, data, _ = tracker.read(path, label, executable=filetype == 2)
    if len(data) < 32 or data[:4] != b"\xcf\xfa\xed\xfe":
        fail(label + "_not_macho64")
    cputype, _, actual_type = struct.unpack_from("<iiI", data, 4)
    if cputype != 0x0100000C or actual_type != filetype:
        fail(label + "_macho_identity_mismatch")
    return hashlib.sha256(data).hexdigest()


def binary_shape(
    tracker: ReadTracker,
    path: pathlib.Path,
    target: str,
    emit: str,
    expected_format: str,
    expected_machine: int,
) -> str:
    _, data, _ = tracker.read(path, "target_emit_output")
    if expected_format == "wasm":
        if not data.startswith(b"\x00asm"):
            fail("target_emit_wasm_magic_mismatch")
        return "wasm_module"
    if expected_format == "macho":
        if len(data) < 32 or data[:4] != b"\xcf\xfa\xed\xfe":
            fail("target_emit_macho_magic_mismatch")
        cputype, _, filetype = struct.unpack_from("<iiI", data, 4)
        if cputype != expected_machine or filetype != {"obj": 1, "shared": 6, "exe": 2}[emit]:
            fail("target_emit_macho_type_mismatch")
        ncmds, sizeofcmds = struct.unpack_from("<II", data, 16)
        offset, end = 32, 32 + sizeofcmds
        if end > len(data):
            fail("target_emit_macho_load_commands_truncated")
        platforms: set[int] = set()
        for _ in range(ncmds):
            if offset + 8 > end:
                fail("target_emit_macho_load_command_header_truncated")
            command, size = struct.unpack_from("<II", data, offset)
            if size < 8 or offset + size > end:
                fail("target_emit_macho_load_command_size_invalid")
            if command == 0x32 and size >= 24:
                platforms.add(struct.unpack_from("<I", data, offset + 8)[0])
            elif command == 0x24:
                platforms.add(1)
            elif command == 0x25:
                platforms.add(2)
            offset += size
        expected_platform = 1 if target == TARGET else 2
        if platforms != {expected_platform}:
            fail("target_emit_macho_platform_mismatch")
        return "macho_filetype_%d_platform_%d" % (filetype, expected_platform)
    if expected_format == "elf":
        if len(data) < 64 or data[:4] != b"\x7fELF" or data[4:6] != b"\x02\x01":
            fail("target_emit_elf_header_mismatch")
        e_type, e_machine = struct.unpack_from("<HH", data, 16)
        if e_machine != expected_machine or e_type not in {
            "obj": {1}, "shared": {3}, "exe": {2, 3}
        }[emit]:
            fail("target_emit_elf_type_mismatch")
        return "elf_type_%d" % e_type
    fail("target_emit_unexpected_supported_format:" + expected_format)


def validate_guard(
    tracker: ReadTracker,
    report: pathlib.Path,
    expected_rc: int,
    stdout: pathlib.Path,
    stderr: pathlib.Path,
    label: str,
) -> None:
    rows = parse_kv(tracker, report, label)
    required = {
        "tool": "tools/beat_c_process_group_guard.sh",
        "schema": "beat_c_process_memory_guard",
        "status": "completed",
        "rc": str(expected_rc),
        "memory_guard_mode": "process_tree",
        "memory_measurement_status": "available",
        "root_identity_sampled": "1",
        "process_tree_escape_pid": "0",
    }
    for key, value in required.items():
        if rows.get(key) != value:
            fail(label + "_field_mismatch:" + key)
    try:
        if pathlib.Path(rows.get("stdout", "")).resolve(strict=True) != stdout:
            fail(label + "_stdout_path_mismatch")
        if pathlib.Path(rows.get("stderr", "")).resolve(strict=True) != stderr:
            fail(label + "_stderr_path_mismatch")
    except OSError:
        fail(label + "_stdio_path_missing")
    limit = require_uint(rows, "memory_limit_bytes", label)
    peak = require_uint(rows, "process_tree_enforced_peak_bytes", label)
    samples = require_uint(rows, "memory_sample_count", label)
    if limit != MAX_RSS_LIMIT or peak > limit or samples <= 0:
        fail(label + "_memory_proof_invalid")


def validate_regalloc_compile_report(
    tracker: ReadTracker,
    report: pathlib.Path,
    obj: pathlib.Path,
    identity: Mapping[str, str],
    driver_sha: str,
    source_sha: str,
    label: str,
) -> None:
    rows = parse_kv(tracker, report, label)
    expected = {
        "regalloc_receipt_schema": "regalloc_single_pass.production",
        "regalloc_allocator": "regalloc_single_pass",
        "regalloc_wiring_mode": "production_default",
        "regalloc_driver_sha256": driver_sha,
        "regalloc_source_manifest_sha256": identity["source_manifest_sha256"],
        "regalloc_allocator_source_sha256": identity["allocator_sha256"],
        "regalloc_target": TARGET,
        "regalloc_output_object_sha256": tracker.digest(obj, label + "_object"),
        "regalloc_fixture_source_sha256": source_sha,
        "regalloc_unknown_shape_count": "0",
        "regalloc_env_gate_count": "0",
        "regalloc_legacy_overlay_action_count": "0",
        "system_link_exec_emit": "obj",
    }
    for key, value in expected.items():
        if rows.get(key) != value:
            fail(label + "_binding_mismatch:" + key)


def validate_jobs(
    tracker: ReadTracker,
    artifacts: Mapping[str, pathlib.Path],
    identity: Mapping[str, str],
    workspace: pathlib.Path,
) -> str:
    roles = {"jobs1_object", "jobsn_object", "jobs1_report", "jobsn_report"}
    if set(artifacts) != roles:
        fail("jobs_raw_role_set_mismatch")
    source = tracker.file(workspace / "src/core/backend/primary_object_plan.cheng", "jobs_source")
    source_sha = tracker.digest(source, "jobs_source")
    wrappers: dict[str, dict[str, str]] = {}
    wrapper_fields = set(IDENTITY_KEYS) | {
        "source_path", "source_sha256", "compile_parallel_effective_jobs",
        "codegen_worker_count", "compile_rc", "output_object_sha256",
        "dry_report_path", "dry_report_sha256", "compile_report_path",
        "compile_report_sha256", "compile_guard_path", "compile_guard_sha256",
        "compile_stdout_path", "compile_stdout_sha256", "compile_stderr_path",
        "compile_stderr_sha256", "report_payload_sha256",
    }
    for tag, expected_jobs in (("jobs1", 1), ("jobsn", -1)):
        rows = parse_kv(tracker, artifacts[tag + "_report"], tag + "_report", "report_payload_sha256")
        exact_fields(rows, wrapper_fields, tag + "_report")
        require_identity(rows, identity, tag + "_report")
        try:
            if pathlib.Path(rows["source_path"]).resolve(strict=True) != source:
                fail(tag + "_source_path_mismatch")
        except OSError:
            fail(tag + "_source_path_missing")
        if rows.get("source_sha256") != source_sha or rows.get("compile_rc") != "0":
            fail(tag + "_source_or_rc_mismatch")
        effective = require_uint(rows, "compile_parallel_effective_jobs", tag)
        workers = require_uint(rows, "codegen_worker_count", tag)
        if (expected_jobs == 1 and (effective != 1 or workers != 1)) or (
            expected_jobs < 0 and (effective <= 1 or workers <= 1)
        ):
            fail(tag + "_parallelism_not_observed")
        obj = artifacts[tag + "_object"]
        if rows.get("output_object_sha256") != tracker.digest(obj, tag + "_object"):
            fail(tag + "_output_hash_mismatch")
        dry = bound_artifact(tracker, rows, "dry_report", tag + "_dry_report")
        dry_rows = parse_kv(tracker, dry, tag + "_dry_report")
        if require_uint(dry_rows, "compile_parallel_effective_jobs", tag + "_dry") != effective:
            fail(tag + "_dry_parallelism_mismatch")
        report = bound_artifact(tracker, rows, "compile_report", tag + "_compile_report")
        guard = bound_artifact(tracker, rows, "compile_guard", tag + "_compile_guard")
        stdout = bound_artifact(tracker, rows, "compile_stdout", tag + "_compile_stdout")
        stderr = bound_artifact(tracker, rows, "compile_stderr", tag + "_compile_stderr")
        validate_guard(tracker, guard, 0, stdout, stderr, tag + "_compile_guard")
        validate_regalloc_compile_report(
            tracker, report, obj, identity, identity["driver_sha256"], source_sha,
            tag + "_compile_report",
        )
        compile_rows = parse_kv(tracker, report, tag + "_compile_report")
        requested_workers = require_uint(
            compile_rows, "primary_object_word_fill_requested_job_count",
            tag + "_compile_report")
        actual_workers = require_uint(
            compile_rows, "codegen_worker_count", tag + "_compile_report")
        if requested_workers != effective or actual_workers != workers:
            fail(tag + "_compile_report_parallelism_mismatch")
        wrappers[tag] = rows
    if tracker.read(artifacts["jobs1_object"], "jobs1_object")[1] != tracker.read(
        artifacts["jobsn_object"], "jobsn_object"
    )[1]:
        fail("jobs_object_bytes_not_deterministic")
    return "object_equal=true jobs1_effective_jobs=1 jobsn_effective_jobs=%s" % wrappers[
        "jobsn"
    ]["compile_parallel_effective_jobs"]


def corpus_inventory(
    tracker: ReadTracker, corpus: pathlib.Path
) -> tuple[list[pathlib.Path], bytes]:
    corpus = tracker.directory(corpus, "exec_diff_corpus")
    fixtures = sorted(path for path in corpus.glob("*.cheng") if path.is_file() and not path.is_symlink())
    if len(fixtures) < EXEC_DIFF_MIN_CASES:
        fail("exec_diff_corpus_below_canonical_floor")
    fields: list[tuple[str, object]] = [
        ("schema", "regalloc_exec_diff_corpus"), ("case_count", len(fixtures))
    ]
    shared = tracker.file(corpus / "_shared_runtime.c", "exec_diff_shared_runtime")
    fields.extend((("shared_runtime_path", shared), ("shared_runtime_sha256", tracker.digest(shared, "exec_diff_shared_runtime"))))
    for index, source in enumerate(fixtures):
        source = tracker.file(source, "exec_diff_source")
        fields.extend((
            ("case.%d.name" % index, source.stem),
            ("case.%d.source_path" % index, source),
            ("case.%d.source_sha256" % index, tracker.digest(source, "exec_diff_source")),
        ))
        stub = corpus / (source.stem + ".stub.c")
        if stub.exists():
            stub = tracker.file(stub, "exec_diff_stub")
            fields.extend((("case.%d.stub_path" % index, stub), ("case.%d.stub_sha256" % index, tracker.digest(stub, "exec_diff_stub"))))
        else:
            fields.extend((("case.%d.stub_path" % index, ""), ("case.%d.stub_sha256" % index, "")))
    return fixtures, render_payload(fields, "inventory_payload_sha256")


def validate_exec_diff(
    tracker: ReadTracker,
    artifacts: Mapping[str, pathlib.Path],
    identity: Mapping[str, str],
    workspace: pathlib.Path,
) -> str:
    if set(artifacts) != {"exec_diff_report", "exec_diff_cases"}:
        fail("exec_diff_raw_role_set_mismatch")
    report = parse_kv(tracker, artifacts["exec_diff_report"], "exec_diff_report", "report_payload_sha256")
    report_fields = set(IDENTITY_KEYS) | {
        "driver_kind", "tested_driver_sha256", "reference_driver_path",
        "reference_driver_sha256", "corpus_path", "corpus_inventory_path",
        "corpus_inventory_sha256", "case_count", "exec_diff_rc",
        "driver_miscompile_count", "report_payload_sha256",
    }
    exact_fields(report, report_fields, "exec_diff_report")
    require_identity(report, identity, "exec_diff_report")
    if report.get("driver_kind") != "official" or report.get("tested_driver_sha256") != identity["driver_sha256"]:
        fail("exec_diff_not_current_official")
    reference = immutable_artifact(
        tracker, report.get("reference_driver_path", ""), report.get("reference_driver_sha256", ""),
        "exec_diff_reference_driver", executable=True,
    )
    reference_sha = require_macho_arm64(tracker, reference, "exec_diff_reference_driver", 2)
    if reference_sha == identity["driver_sha256"]:
        fail("exec_diff_reference_equals_official")
    corpus = tracker.directory(workspace / "src/tests/exec_diff_corpus", "exec_diff_corpus")
    fixtures, inventory_data = corpus_inventory(tracker, corpus)
    inventory = immutable_artifact(
        tracker, report.get("corpus_inventory_path", ""), report.get("corpus_inventory_sha256", ""),
        "exec_diff_corpus_inventory",
    )
    if tracker.read(inventory, "exec_diff_corpus_inventory")[1] != inventory_data:
        fail("exec_diff_corpus_inventory_not_current")
    if report.get("corpus_path") != str(corpus):
        fail("exec_diff_report_corpus_path_mismatch")
    cases = parse_kv(tracker, artifacts["exec_diff_cases"], "exec_diff_cases", "cases_payload_sha256")
    base_fields = {
        "schema", "corpus_path", "corpus_inventory_path", "corpus_inventory_sha256",
        "official_driver_sha256", "reference_driver_path", "reference_driver_sha256",
        "case_count", "cases_payload_sha256",
    }
    per_case = {
        "name", "source_path", "source_sha256", "expected_path", "expected_sha256",
        "expected_rc", "actual_path", "actual_sha256", "actual_rc",
    }
    for side in ("actual", "expected"):
        per_case |= {
            side + "_compile_rc", side + "_object_path", side + "_object_sha256",
            side + "_compile_report_path", side + "_compile_report_sha256",
            side + "_compile_guard_path", side + "_compile_guard_sha256",
            side + "_compile_stdout_path", side + "_compile_stdout_sha256",
            side + "_compile_stderr_path", side + "_compile_stderr_sha256",
        }
    count = require_uint(cases, "case_count", "exec_diff_cases")
    expected_fields = set(base_fields)
    for index in range(count):
        expected_fields.update("case.%d.%s" % (index, key) for key in per_case)
    exact_fields(cases, expected_fields, "exec_diff_cases")
    if cases.get("schema") != "regalloc_exec_diff_cases" or count != len(fixtures) or count < EXEC_DIFF_MIN_CASES:
        fail("exec_diff_cases_schema_or_inventory_count_mismatch")
    shared = {
        "corpus_path": str(corpus),
        "corpus_inventory_path": str(inventory),
        "corpus_inventory_sha256": tracker.digest(inventory, "exec_diff_inventory"),
        "official_driver_sha256": identity["driver_sha256"],
        "reference_driver_path": str(reference),
        "reference_driver_sha256": reference_sha,
        "case_count": str(count),
    }
    for key, value in shared.items():
        if cases.get(key) != value:
            fail("exec_diff_cross_report_binding_mismatch:" + key)
    report_shared = {
        "corpus_path": str(corpus),
        "corpus_inventory_path": str(inventory),
        "corpus_inventory_sha256": tracker.digest(inventory, "exec_diff_inventory"),
        "reference_driver_path": str(reference),
        "reference_driver_sha256": reference_sha,
        "case_count": str(count),
        "tested_driver_sha256": identity["driver_sha256"],
    }
    for key, value in report_shared.items():
        if report.get(key) != value:
            fail("exec_diff_report_binding_mismatch:" + key)
    if report.get("exec_diff_rc") != "0" or report.get("driver_miscompile_count") != "0":
        fail("exec_diff_report_not_clean")
    for index, source in enumerate(fixtures):
        prefix = "case.%d." % index
        source_sha = tracker.digest(source, "exec_diff_source_%d" % index)
        if cases.get(prefix + "name") != source.stem or cases.get(prefix + "source_path") != str(source) or cases.get(prefix + "source_sha256") != source_sha:
            fail("exec_diff_case_source_inventory_mismatch:%d" % index)
        expected_out = immutable_artifact(tracker, cases[prefix + "expected_path"], cases[prefix + "expected_sha256"], "exec_expected_%d" % index)
        actual_out = immutable_artifact(tracker, cases[prefix + "actual_path"], cases[prefix + "actual_sha256"], "exec_actual_%d" % index)
        expected_rc = require_uint(cases, prefix + "expected_rc", "exec_diff_cases")
        actual_rc = require_uint(cases, prefix + "actual_rc", "exec_diff_cases")
        if expected_rc != actual_rc or tracker.read(expected_out, "exec_expected")[1] != tracker.read(actual_out, "exec_actual")[1]:
            fail("exec_diff_recomputed_miscompile:%d" % index)
        for side, driver_sha in (("actual", identity["driver_sha256"]), ("expected", reference_sha)):
            compile_rc = require_uint(cases, prefix + side + "_compile_rc", "exec_diff_cases")
            if compile_rc != 0:
                fail("exec_diff_compile_rc_nonzero:%d:%s" % (index, side))
            obj = bound_artifact(tracker, cases, prefix + side + "_object", "exec_%s_object_%d" % (side, index))
            require_macho_arm64(tracker, obj, "exec_%s_object_%d" % (side, index), 1)
            compile_report = bound_artifact(tracker, cases, prefix + side + "_compile_report", "exec_%s_report_%d" % (side, index))
            guard = bound_artifact(tracker, cases, prefix + side + "_compile_guard", "exec_%s_guard_%d" % (side, index))
            stdout = bound_artifact(tracker, cases, prefix + side + "_compile_stdout", "exec_%s_stdout_%d" % (side, index))
            stderr = bound_artifact(tracker, cases, prefix + side + "_compile_stderr", "exec_%s_stderr_%d" % (side, index))
            validate_guard(tracker, guard, 0, stdout, stderr, "exec_%s_guard_%d" % (side, index))
            report_rows = parse_kv(tracker, compile_report, "exec_%s_report_%d" % (side, index))
            if report_rows.get("system_link_exec_emit") != "obj":
                fail("exec_diff_compile_report_emit_mismatch:%d:%s" % (index, side))
            if side == "actual":
                validate_regalloc_compile_report(
                    tracker, compile_report, obj, identity, driver_sha, source_sha,
                    "exec_actual_report_%d" % index,
                )
    return "case_count=%d recomputed_miscompile_count=0 raw_compile_binding=proved" % count


def validate_target_emit(
    tracker: ReadTracker,
    artifacts: Mapping[str, pathlib.Path],
    identity: Mapping[str, str],
    workspace: pathlib.Path,
) -> str:
    if set(artifacts) != {"target_emit_matrix"}:
        fail("target_emit_raw_role_set_mismatch")
    matrix = parse_kv(tracker, artifacts["target_emit_matrix"], "target_emit_matrix", "matrix_payload_sha256")
    base = set(IDENTITY_KEYS) | {
        "schema", "canonical_matrix_id", "obj_exe_source_path", "obj_exe_source_sha256",
        "shared_source_path", "shared_source_sha256", "target_count", "emit_count",
        "case_count", "matrix_payload_sha256",
    }
    case_fields = {
        "target", "emit", "expected", "actual", "fallback_count", "unknown_shape_count",
        "artifact_path", "artifact_sha256", "evidence_path", "evidence_sha256",
        "compile_rc", "output_path", "output_sha256", "output_shape", "report_path",
        "report_sha256",
    }
    expected_cases = [
        (target, emit, supported, fmt, machine)
        for target, supported, fmt, machine in CANONICAL_TARGETS for emit in CANONICAL_EMITS
    ]
    expected_fields = set(base)
    for index in range(len(expected_cases)):
        expected_fields.update("case.%d.%s" % (index, key) for key in case_fields)
    exact_fields(matrix, expected_fields, "target_emit_matrix")
    require_identity(matrix, identity, "target_emit_matrix")
    if matrix.get("schema") != "regalloc_target_emit_matrix" or matrix.get("canonical_matrix_id") != CANONICAL_MATRIX_ID:
        fail("target_emit_matrix_schema_mismatch")
    if matrix.get("target_count") != str(len(CANONICAL_TARGETS)) or matrix.get("emit_count") != str(len(CANONICAL_EMITS)) or matrix.get("case_count") != str(len(expected_cases)):
        fail("target_emit_matrix_not_canonical_size")
    obj_source = tracker.file(workspace / "src/tests/target_matrix_linker_probe.cheng", "target_obj_source")
    shared_source = tracker.file(workspace / "src/tests/shared_emit_fixture.cheng", "target_shared_source")
    for key, path in (("obj_exe_source", obj_source), ("shared_source", shared_source)):
        if matrix.get(key + "_path") != str(path) or matrix.get(key + "_sha256") != tracker.digest(path, key):
            fail("target_emit_source_binding_mismatch:" + key)
    implemented = 0
    unsupported = 0
    evidence_fields = set(IDENTITY_KEYS) | {
        "source_path", "source_sha256", "compile_target", "compile_emit", "expected", "actual",
        "compile_rc", "output_path", "output_sha256", "output_shape", "report_path",
        "report_sha256", "guard_path", "guard_sha256", "stdout_path", "stdout_sha256",
        "stderr_path", "stderr_sha256", "evidence_payload_sha256",
    }
    for index, (target, emit, supported, fmt, machine) in enumerate(expected_cases):
        prefix = "case.%d." % index
        if matrix.get(prefix + "target") != target or matrix.get(prefix + "emit") != emit:
            fail("target_emit_case_inventory_mismatch:%d" % index)
        expected = "implemented_pass" if supported else "unsupported_hard_fail"
        actual = "pass" if supported else "hard_fail"
        if matrix.get(prefix + "expected") != expected or matrix.get(prefix + "actual") != actual or matrix.get(prefix + "fallback_count") != "0" or matrix.get(prefix + "unknown_shape_count") != "0":
            fail("target_emit_case_result_mismatch:%d" % index)
        artifact = immutable_artifact(tracker, matrix[prefix + "artifact_path"], matrix[prefix + "artifact_sha256"], "target_artifact_%d" % index)
        evidence_path = immutable_artifact(tracker, matrix[prefix + "evidence_path"], matrix[prefix + "evidence_sha256"], "target_evidence_%d" % index)
        evidence = parse_kv(tracker, evidence_path, "target_evidence_%d" % index, "evidence_payload_sha256")
        exact_fields(evidence, evidence_fields, "target_evidence_%d" % index)
        require_identity(evidence, identity, "target_evidence_%d" % index)
        source = shared_source if emit == "shared" else obj_source
        cross = {
            "source_path": str(source), "source_sha256": tracker.digest(source, "target_source"),
            "compile_target": target, "compile_emit": emit,
            "expected": expected, "actual": actual,
            "compile_rc": matrix[prefix + "compile_rc"], "output_path": matrix[prefix + "output_path"],
            "output_sha256": matrix[prefix + "output_sha256"], "output_shape": matrix[prefix + "output_shape"],
            "report_path": matrix[prefix + "report_path"], "report_sha256": matrix[prefix + "report_sha256"],
        }
        for key, value in cross.items():
            if evidence.get(key) != value:
                fail("target_emit_evidence_binding_mismatch:%d:%s" % (index, key))
        compile_rc = require_uint(matrix, prefix + "compile_rc", "target_emit_matrix")
        guard = bound_artifact(tracker, evidence, "guard", "target_guard_%d" % index)
        stdout = bound_artifact(tracker, evidence, "stdout", "target_stdout_%d" % index)
        stderr = bound_artifact(tracker, evidence, "stderr", "target_stderr_%d" % index)
        validate_guard(tracker, guard, compile_rc, stdout, stderr, "target_guard_%d" % index)
        if supported:
            output = immutable_artifact(tracker, matrix[prefix + "output_path"], matrix[prefix + "output_sha256"], "target_output_%d" % index)
            shape = binary_shape(tracker, output, target, emit, fmt, machine)
            if compile_rc != 0 or output != artifact or matrix.get(prefix + "output_shape") != shape:
                fail("target_emit_implemented_raw_binding_mismatch:%d" % index)
            report = immutable_artifact(tracker, matrix[prefix + "report_path"], matrix[prefix + "report_sha256"], "target_report_%d" % index)
            report_rows = parse_kv(tracker, report, "target_report_%d" % index)
            if report_rows.get("target", report_rows.get("regalloc_target", "")) != target or report_rows.get("emit", report_rows.get("system_link_exec_emit", "")) != emit:
                fail("target_emit_report_identity_mismatch:%d" % index)
            if any(key.endswith("unknown_shape_count") and value != "0" for key, value in report_rows.items()):
                fail("target_emit_report_unknown_shape:%d" % index)
            if target == TARGET and emit == "obj":
                validate_regalloc_compile_report(
                    tracker, report, output, identity, identity["driver_sha256"],
                    tracker.digest(source, "target_source"), "target_arm64_obj_report",
                )
            implemented += 1
        else:
            transcript = tracker.read(artifact, "target_unsupported_transcript")[1]
            if compile_rc == 0 or b"unsupported" not in transcript.lower() or matrix.get(prefix + "output_path") or matrix.get(prefix + "output_sha256") or matrix.get(prefix + "output_shape") != "none":
                fail("target_emit_unsupported_raw_binding_mismatch:%d" % index)
            if matrix.get(prefix + "report_path"):
                immutable_artifact(tracker, matrix[prefix + "report_path"], matrix[prefix + "report_sha256"], "target_unsupported_report_%d" % index)
            elif matrix.get(prefix + "report_sha256"):
                fail("target_emit_unsupported_report_hash_without_path:%d" % index)
            unsupported += 1
    return "case_count=%d implemented_pass=%d unsupported_hard_fail=%d canonical_matrix_id=%s" % (
        len(expected_cases), implemented, unsupported, CANONICAL_MATRIX_ID,
    )


def validate_gen3(
    tracker: ReadTracker,
    artifacts: Mapping[str, pathlib.Path],
    identity: Mapping[str, str],
    workspace: pathlib.Path,
) -> str:
    roles = {"gen2_driver", "gen3_driver", "gen2_fixed_object", "gen3_fixed_object", "gen3_lineage"}
    if set(artifacts) != roles:
        fail("gen3_raw_role_set_mismatch")
    gen2_sha = require_macho_arm64(tracker, artifacts["gen2_driver"], "gen2_driver", 2)
    gen3_sha = require_macho_arm64(tracker, artifacts["gen3_driver"], "gen3_driver", 2)
    if artifacts["gen2_driver"] == artifacts["gen3_driver"] or os.path.samefile(
        artifacts["gen2_driver"], artifacts["gen3_driver"]
    ):
        fail("gen3_snapshot_drivers_not_distinct_files")
    if artifacts["gen2_fixed_object"] == artifacts["gen3_fixed_object"] or os.path.samefile(
        artifacts["gen2_fixed_object"], artifacts["gen3_fixed_object"]
    ):
        fail("gen3_fixed_objects_not_distinct_files")
    if gen2_sha != gen3_sha or gen3_sha != identity["driver_sha256"] or tracker.read(artifacts["gen2_driver"], "gen2_driver")[1] != tracker.read(artifacts["gen3_driver"], "gen3_driver")[1]:
        fail("gen3_driver_bytes_not_fixed_point")
    if tracker.read(artifacts["gen2_fixed_object"], "gen2_fixed_object")[1] != tracker.read(artifacts["gen3_fixed_object"], "gen3_fixed_object")[1]:
        fail("gen3_fixed_object_bytes_mismatch")
    for tag in ("gen2", "gen3"):
        require_macho_arm64(tracker, artifacts[tag + "_fixed_object"], tag + "_fixed_object", 1)
    lineage = parse_kv(tracker, artifacts["gen3_lineage"], "gen3_lineage", "lineage_payload_sha256")
    fields = set(IDENTITY_KEYS) | {"input_files_distinct", "fixed_source_path", "fixed_source_sha256", "lineage_payload_sha256"}
    for tag in ("gen2", "gen3"):
        fields |= {
            tag + "_input_path", tag + "_input_sha256", tag + "_input_dev",
            tag + "_input_inode", tag + "_input_size", tag + "_input_mtime_ns",
            tag + "_input_ctime_ns", tag + "_compile_rc", tag + "_compile_report_path",
            tag + "_compile_report_sha256", tag + "_compile_guard_path",
            tag + "_compile_guard_sha256", tag + "_compile_stdout_path",
            tag + "_compile_stdout_sha256", tag + "_compile_stderr_path",
            tag + "_compile_stderr_sha256",
        }
    exact_fields(lineage, fields, "gen3_lineage")
    require_identity(lineage, identity, "gen3_lineage")
    inputs: list[pathlib.Path] = []
    for tag in ("gen2", "gen3"):
        path = immutable_artifact(tracker, lineage[tag + "_input_path"], lineage[tag + "_input_sha256"], tag + "_input", executable=True)
        require_macho_arm64(tracker, path, tag + "_input", 2)
        stat_row = path.stat()
        expected_stat = {
            tag + "_input_dev": stat_row.st_dev,
            tag + "_input_inode": stat_row.st_ino,
            tag + "_input_size": stat_row.st_size,
            tag + "_input_mtime_ns": stat_row.st_mtime_ns,
            tag + "_input_ctime_ns": stat_row.st_ctime_ns,
        }
        for key, value in expected_stat.items():
            if lineage.get(key) != str(value):
                fail("gen3_input_identity_mismatch:" + key)
        inputs.append(path)
    if lineage.get("input_files_distinct") != "1" or inputs[0] == inputs[1] or os.path.samefile(inputs[0], inputs[1]):
        fail("gen3_input_files_not_distinct")
    source = tracker.file(workspace / "src/tests/regalloc_gate_runtime.cheng", "gen3_fixed_source")
    source_sha = tracker.digest(source, "gen3_fixed_source")
    if lineage.get("fixed_source_path") != str(source) or lineage.get("fixed_source_sha256") != source_sha:
        fail("gen3_fixed_source_binding_mismatch")
    for tag in ("gen2", "gen3"):
        if lineage.get(tag + "_compile_rc") != "0":
            fail(tag + "_compile_rc_nonzero")
        report = bound_artifact(tracker, lineage, tag + "_compile_report", tag + "_compile_report")
        guard = bound_artifact(tracker, lineage, tag + "_compile_guard", tag + "_compile_guard")
        stdout = bound_artifact(tracker, lineage, tag + "_compile_stdout", tag + "_compile_stdout")
        stderr = bound_artifact(tracker, lineage, tag + "_compile_stderr", tag + "_compile_stderr")
        validate_guard(tracker, guard, 0, stdout, stderr, tag + "_compile_guard")
        validate_regalloc_compile_report(
            tracker, report, artifacts[tag + "_fixed_object"], identity, identity["driver_sha256"],
            source_sha, tag + "_compile_report",
        )
    return "driver_sha256=%s fixed_object_sha256=%s raw_compile_binding=proved" % (
        gen3_sha, tracker.digest(artifacts["gen3_fixed_object"], "gen3_fixed_object"),
    )


def validate_external_lock(
    lock_path_value: str | pathlib.Path,
    expected_sha: str,
    identity: Mapping[str, str],
    kind: str,
    workspace_root: str | pathlib.Path,
    max_validity_seconds: int,
) -> str:
    tracker = ReadTracker()
    workspace = tracker.directory(workspace_root, "workspace_root")
    if identity.get("target") != TARGET:
        fail("identity_target_mismatch")
    expected_sha = require_sha(expected_sha, "lock_expected")
    lock_path = immutable_artifact(tracker, str(lock_path_value), expected_sha, "lock")
    rows = parse_kv(tracker, lock_path, "lock", "lock_payload_sha256")
    lock_fields = set(IDENTITY_KEYS) | {
        "schema", "lock_kind", "generated_at_epoch_seconds", "expires_at_epoch_seconds",
        "raw_manifest_path", "raw_manifest_sha256", "lock_payload_sha256",
    }
    exact_fields(rows, lock_fields, "lock")
    if rows.get("schema") != "regalloc_external_lock" or rows.get("lock_kind") != kind:
        fail("lock_schema_or_kind_mismatch")
    require_identity(rows, identity, "lock")
    generated = require_uint(rows, "generated_at_epoch_seconds", "lock")
    expires = require_uint(rows, "expires_at_epoch_seconds", "lock")
    now = int(time.time())
    if generated > now or expires < now or expires <= generated or expires - generated > max_validity_seconds:
        fail("lock_validity_window_invalid")
    raw_path = immutable_artifact(tracker, rows["raw_manifest_path"], rows["raw_manifest_sha256"], "raw_manifest")
    raw = parse_kv(tracker, raw_path, "raw_manifest", "manifest_payload_sha256")
    if raw.get("schema") != "regalloc_external_raw_manifest" or raw.get("lock_kind") != kind:
        fail("raw_manifest_schema_or_kind_mismatch")
    count = require_uint(raw, "artifact_count", "raw_manifest")
    if count <= 0:
        fail("raw_manifest_empty")
    artifacts: dict[str, pathlib.Path] = {}
    raw_fields = {"schema", "lock_kind", "artifact_count", "manifest_payload_sha256"}
    for index in range(count):
        role_key = "artifact.%d.role" % index
        path_key = "artifact.%d.path" % index
        sha_key = "artifact.%d.sha256" % index
        raw_fields.update((role_key, path_key, sha_key))
        role = raw.get(role_key, "")
        if not role or role in artifacts:
            fail("raw_manifest_duplicate_or_empty_role:%d" % index)
        artifacts[role] = immutable_artifact(tracker, raw.get(path_key, ""), raw.get(sha_key, ""), "raw_" + role)
    exact_fields(raw, raw_fields, "raw_manifest")
    if kind == "jobs_determinism":
        computed = validate_jobs(tracker, artifacts, identity, workspace)
    elif kind == "exec_diff":
        computed = validate_exec_diff(tracker, artifacts, identity, workspace)
    elif kind == "target_emit_hard_fail":
        computed = validate_target_emit(tracker, artifacts, identity, workspace)
    elif kind == "gen3_fixed_point":
        computed = validate_gen3(tracker, artifacts, identity, workspace)
    else:
        fail("unknown_lock_kind")
    tracker.assert_fresh()
    return (
        "status=recomputed kind=%s lock_sha256=%s raw_manifest_sha256=%s %s "
        "expires_at_epoch_seconds=%d"
        % (kind, expected_sha, rows["raw_manifest_sha256"], computed, expires)
    )


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--kind", required=True)
    parser.add_argument("--lock", required=True)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--identity", required=True)
    parser.add_argument("--workspace-root", required=True)
    parser.add_argument("--max-validity-seconds", required=True, type=int)
    args = parser.parse_args(argv)
    tracker = ReadTracker()
    identity = parse_kv(tracker, args.identity, "identity")
    verdict = validate_external_lock(
        args.lock, args.expected_sha256, identity, args.kind,
        args.workspace_root, args.max_validity_seconds,
    )
    print(verdict)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except LockValidationError as error:
        print("reason=" + str(error), file=sys.stderr)
        raise SystemExit(1)
