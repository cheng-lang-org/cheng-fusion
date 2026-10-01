#!/usr/bin/env python3
"""Validate the native-Linux delegated cgroup-v2 hard-memory contract."""

from __future__ import annotations

import argparse
import ctypes
import errno
import fcntl
import hashlib
import importlib.machinery
import importlib.util
import json
import os
import platform
import re
import stat
import struct
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve(strict=True).parent.parent
SCHEMA = "beat_c_linux_cgroup_v2_hard_memory_gate"
INPUT_SCHEMA = "cheng.native_linux_delegated_cgroup_v2_inputs"
ROOTFS_SCHEMA = "cheng.native_linux_rootfs_manifest"
DELEGATION_SCHEMA = "cheng.native_linux_cgroup_v2_delegation"
LIVE_SCHEMA = "cheng.native_linux_cgroup_v2_live_audit"
ARTIFACT_SCHEMA = "cheng.native_linux_cgroup_v2_artifacts"
LEDGER_SCHEMA = "cheng.linux_ptrace_exec_ledger"
LEDGER_MANIFEST_SCHEMA = "cheng.linux_ptrace_exec_manifest"
LEDGER_WRAPPER_SCHEMA = "cheng.linux_cgroup_v2_exec_ledger_validation"
APPLICABILITY = "native_linux_delegated_cgroup_v2_only"
PROOF_STATUS = "proved_linux_kernel_cgroup_v2_aggregate"
MEMORY_SCOPE = "rootless_oci_process_and_all_descendants"
LIMIT_BYTES = 1_073_741_824
SWAP_MAX_BYTES = 0
PIDS_MAX = 128
CRUN_CLONE3_POLICY = (
    "ptrace_exact_newuser_into_cgroup_enosys_then_clone"
)
CRUN_CLONE3_EXACT_FLAGS = 0x10000000 | 0x200000000
CRUN_EXACT_EXEC_TRANSITIONS = 2
FS_IOC_MEASURE_VERITY = 0xC0046686
FS_VERITY_HASH_ALG_SHA256 = 1
FS_VERITY_SHA256_BYTES = 32
WORKLOAD_CURRENT_DRIVER = "current_driver"
WORKLOAD_DRY_COMPILE = "dry_compile"
WORKLOAD_BOOTSTRAP_STAGE23_PHASE = "bootstrap_stage23_phase"
WORKLOAD_KINDS = (
    WORKLOAD_CURRENT_DRIVER,
    WORKLOAD_DRY_COMPILE,
    WORKLOAD_BOOTSTRAP_STAGE23_PHASE,
)
LEDGER_EXPECTED_EXIT_CODE = 0
LEDGER_PYTHON_GUEST_PATH = "/usr/bin/python3"
LEDGER_PRODUCER_GUEST_PATH = "/cheng-hardcap-control/ptrace-ledger-producer.py"
LEDGER_VALIDATOR_GUEST_PATH = "/cheng-hardcap-control/ptrace-ledger-validator.py"
LEDGER_WRAPPER_GUEST_PATH = "/cheng-hardcap-control/exec-ledger-wrapper"
LEDGER_MANIFEST_GUEST_PATH = "/cheng-hardcap-control/exec-ledger-manifest.json"
LEDGER_RECEIPT_GUEST_PATH = "/cheng-hardcap-control/exec-ledger-receipt.json"
LEDGER_VALIDATION_GUEST_PATH = "/cheng-hardcap-control/exec-ledger-validation.out"
LEDGER_WRAPPER_RECEIPT_GUEST_PATH = (
    "/cheng-hardcap-control/exec-ledger-wrapper-receipt.kv"
)
LEDGER_PRODUCER_STDOUT_GUEST_PATH = (
    "/cheng-hardcap-control/exec-ledger-producer.stdout"
)
LEDGER_PRODUCER_STDERR_GUEST_PATH = (
    "/cheng-hardcap-control/exec-ledger-producer.stderr"
)
LEDGER_VALIDATOR_STDOUT_GUEST_PATH = (
    "/cheng-hardcap-control/exec-ledger-validator.stdout"
)
LEDGER_VALIDATOR_STDERR_GUEST_PATH = (
    "/cheng-hardcap-control/exec-ledger-validator.stderr"
)
GENERATED_ARGV_DIRECTORY_GUEST_PATH = (
    "/cheng-hardcap-control/compiler-generated-argv"
)
ROOTFS_IMMUTABLE_ARGV_GUEST_PATHS = (
    "/usr/libexec/gcc/x86_64-linux-gnu/13/liblto_plugin.so",
    "/usr/lib/x86_64-linux-gnu/Scrt1.o",
    "/usr/lib/x86_64-linux-gnu/crti.o",
    "/usr/lib/gcc/x86_64-linux-gnu/13/crtbeginS.o",
    "/usr/lib/gcc/x86_64-linux-gnu/13/crtendS.o",
    "/usr/lib/x86_64-linux-gnu/crtn.o",
    "/lib64/ld-linux-x86-64.so.2",
)
CURRENT_DRIVER_NEXT_GUEST_PATH = "/cheng-hardcap-work/current-driver.next"
CURRENT_DRIVER_REPORT_GUEST_PATH = "/cheng-hardcap-work/current-driver.report"
CURRENT_DRIVER_GUEST_PATH = "/cheng-hardcap/current-driver"
CURRENT_SOURCE_GUEST_PATH = "/cheng-current-source/repo"
CURRENT_DRIVER_NEXT_AUTHORITY_GUEST_PATH = (
    "/cheng-hardcap-control/current-driver.next"
)
CURRENT_DRIVER_REPORT_AUTHORITY_GUEST_PATH = (
    "/cheng-hardcap-control/current-driver.report"
)
DRY_OUTPUT_GUEST_PATH = "/cheng-hardcap-work/dry-output"
DRY_REPORT_GUEST_PATH = "/cheng-hardcap-work/dry-compile.report"
DRY_OUTPUT_AUTHORITY_GUEST_PATH = "/cheng-hardcap-control/dry-output"
DRY_REPORT_AUTHORITY_GUEST_PATH = "/cheng-hardcap-control/dry-compile.report"
STAGE23_AUTHORITY_SCHEMA = (
    "cheng.bootstrap_stage23_linux_phase_authority"
)
STAGE23_EXECUTION_SCHEMA = (
    "cheng.bootstrap_stage23_phase_input_manifest"
)
STAGE23_MANIFEST_PAIR_SCHEMA = (
    "cheng.bootstrap_stage23_linux_phase_manifest_pair_commitment"
)
STAGE23_MANIFEST_PAIR_DOMAIN = (
    b"cheng.bootstrap.stage23.linux.phase_manifest_pair"
)
STAGE23_MANIFEST_PAIR_ROLE = "manifest_pair_commitment"
STAGE23_EXTERNAL_PHASE_PROOF_ROLES = frozenset({
    "phase_ptrace_manifest",
    "phase_ptrace_receipt",
    "phase_ptrace_validation",
    "phase_cgroup_receipt",
})
STAGE23_SOURCE_GUEST_PATH = "/cheng-stage23-source/repo"
STAGE23_EVIDENCE_GUEST_PATH = "/cheng-stage23-evidence"
STAGE23_CONTROL_GUEST_PATH = "/cheng-stage23-control"
STAGE23_EXECUTION_GUEST_PATH = (
    STAGE23_CONTROL_GUEST_PATH + "/stage-input-manifest.json"
)
STAGE23_MANIFEST_PAIR_GUEST_PATH = (
    STAGE23_CONTROL_GUEST_PATH + "/manifest-pair-commitment.json"
)
CONTROL_GUEST_PATH = "/cheng-hardcap-control"
WORK_GUEST_PATH = "/cheng-hardcap-work"
STAGE23_INNER_RELATIVE_PATH = (
    "tools/bootstrap_stage23_current_source_fixed_point_gate.sh"
)
STAGE23_INNER_GUEST_PATH = (
    STAGE23_SOURCE_GUEST_PATH + "/" + STAGE23_INNER_RELATIVE_PATH
)
STAGE23_PHASE_ENGINE_RELATIVE_PATH = (
    "tools/bootstrap_stage23_current_source_fixed_point_phase_engine"
)
STAGE23_PROCESS_GUARD_RELATIVE_PATH = (
    "tools/beat_c_process_group_guard.sh"
)
SUPERVISOR_GUEST_PATH = "/cheng-hardcap-control/supervisor.sh"
LEDGER_PRODUCER_PATH = ROOT / "tools/beat_c_linux_ptrace_exec_ledger.py"
LEDGER_VALIDATOR_PATH = (
    ROOT / "tools/beat_c_descendant_exec_ledger_receipt_validator.py"
)
LEDGER_WRAPPER_PATH = (
    ROOT / "tools/beat_c_linux_cgroup_v2_exec_ledger_wrapper"
)
ATTACK_CHILD_COUNT = 2
ATTACK_CHILD_BYTES = 734_003_200
ATTACK_AGGREGATE_BYTES = ATTACK_CHILD_COUNT * ATTACK_CHILD_BYTES
ZERO_SHA256 = "0" * 64
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
REPORT_KEY_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_.-]*$")
REPORT_FORBIDDEN_FAILURE_KEYS = frozenset((
    "error",
    "fatal_error",
    "gate_blocker_phase",
    "bail",
    "not_ready",
))
RUNTIME_ID_RE = re.compile(r"^cheng-hardcap-[0-9a-f]{32}$")
NONCE_RE = re.compile(r"^[0-9a-f]{64}$")
ENTRY_SPECS = {
    "src/core/tooling/backend_driver_dispatch_min.cheng":
        "cheng/core/tooling/backend_driver_dispatch_min",
    "src/core/tooling/backend_driver_main.cheng":
        "cheng/core/tooling/backend_driver_main",
}
CURRENT_SOURCE_SCOPES = (
    ".gitignore",
    "bootstrap",
    "cheng-package.toml",
    "cheng.lock.toml",
    "docs/cheng-formal-spec.md",
    "src",
    "tools",
)
BUILD_RECEIPT_KEY_ORDER = (
    "schema", "status", "target", "machine", "worker_role",
    "candidate_entry_path", "candidate_entry_module_path",
    "candidate_entry_sha256",
    "source_closure_sha256", "source_closure_cid",
    "frozen_source_closure_sha256",
    "frozen_tool_closure_sha256", "frozen_manifest_sha256",
    "frozen_manifest_path_fshex", "builder_image_id",
    "builder_image_config_digest", "builder_image_oci_manifest_digest",
    "builder_image_archive_sha256", "release_source_closure_path_fshex",
    "builder_report_path_fshex", "builder_report_sha256",
    "bundle_path_fshex", "bundle_sha256", "bundle_size",
    "candidate_manifest_path_fshex", "candidate_manifest_sha256",
    "candidate_manifest_size", "candidate_report_path_fshex",
    "candidate_report_sha256", "candidate_report_size",
    "worker_path_fshex", "worker_sha256", "worker_size",
    "worker_device", "worker_inode", "worker_mode",
    "worker_mtime_ns", "worker_ctime_ns", "worker_elf_machine",
    "candidate_build_argv_encoding", "candidate_build_argv_count",
    "candidate_build_argv_sha256", "candidate_build_env_encoding",
    "candidate_build_env_count", "candidate_build_env_sha256",
    "builder_sha256", "workload_sha256", "validator_sha256",
    "gate_sha256", "cgroup_producer_sha256",
    "cgroup_validator_sha256", "release_evidence_tool_sha256",
    "current_source_closure_builder_sha256", "receipt_payload_sha256",
)
BUILD_RECEIPT_KEYS = frozenset(BUILD_RECEIPT_KEY_ORDER)
TARGET_MACHINES = {
    "aarch64-unknown-linux-gnu": "aarch64",
    "x86_64-unknown-linux-gnu": "x86_64",
}
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
STAGE23_TARGET_ENV = FIXED_TARGET_ENV
FRAMED_SEQUENCE_ENCODING = "be64_length_utf8_sequence"
EXPECTED_SUPERVISOR_SHA256 = (
    "47c69a5e57b869483f8d023f1345abe4a06d15c23a37b6630ac57979d11fc23e"
)
NATIVE_DESCRIPTOR_KEYS = (
    "schema", "status", "workload_kind", "target", "host_os", "machine",
    "execution_environment", "native_execution", "emulation",
    "controller_host_os", "controller_host_machine",
    "controller_host_translated", "native_execution_proof",
    "cgroup_version", "cgroup_mount_type", "memory_enforcement_scope",
    "memory_max_bytes", "memory_swap_max_bytes",
    "memory_and_swap_total_limit_bytes", "backend_count",
    "backend.0.name", "backend.1.name", "contract_sha256",
    "target_argv_encoding", "target_env_encoding",
    "snapshot_manifest_sha256", "source_closure_cid",
    "official_receipt_sha256", "official_driver_sha256",
    "backend_epoch_sha256", "jobs_sha256", "action_ledger_sha256",
    "fragment_snapshot_sha256", "regalloc_receipt_sha256",
    "fixed_point_sha256", "fixed_object_sha256",
    "candidate_report_sha256", "seven_stage_parser_ingress_sha256",
    "seven_stage_parser_map_sha256", "seven_stage_policy_sha256",
    "seven_stage_runner_manifest_sha256", "seven_stage_report_sha256",
    "seven_stage_execution_raw32", "seven_stage_root_raw32",
    "baseline_manifest_sha256", "baseline_driver_sha256",
    "performance_source_sha256", "release_evidence_tool_sha256",
    "release_producer_sha256", "cgroup_producer_sha256",
    "cgroup_validator_sha256", "candidate_build_receipt_path_fshex",
    "candidate_build_receipt_sha256", "source_closure_capture_sha256",
    "candidate_entry_path", "candidate_entry_module_path",
    "candidate_entry_sha256", "image_id",
    "worker_path_in_image_fshex", "worker_sha256",
    "target_argv_count", "target_argv_sha256",
    "target_env_count", "target_env_sha256",
    "descriptor_payload_sha256",
)
NATIVE_DESCRIPTOR_SHA_KEYS = frozenset((
    "contract_sha256", "snapshot_manifest_sha256",
    "source_closure_cid", "official_receipt_sha256",
    "official_driver_sha256", "backend_epoch_sha256", "jobs_sha256",
    "action_ledger_sha256", "fragment_snapshot_sha256",
    "regalloc_receipt_sha256", "fixed_point_sha256",
    "fixed_object_sha256", "candidate_report_sha256",
    "seven_stage_parser_ingress_sha256",
    "seven_stage_parser_map_sha256", "seven_stage_policy_sha256",
    "seven_stage_runner_manifest_sha256", "seven_stage_report_sha256",
    "seven_stage_execution_raw32", "seven_stage_root_raw32",
    "baseline_manifest_sha256", "baseline_driver_sha256",
    "performance_source_sha256", "release_evidence_tool_sha256",
    "release_producer_sha256", "cgroup_producer_sha256",
    "cgroup_validator_sha256", "candidate_build_receipt_sha256",
    "source_closure_capture_sha256", "candidate_entry_sha256",
    "worker_sha256", "target_argv_sha256",
    "target_env_sha256", "descriptor_payload_sha256",
))

DELEGATION_KEYS = (
    "schema",
    "status",
    "boot_id",
    "cgroup_mount_path_fshex",
    "cgroup_mount_device",
    "cgroup_mount_inode",
    "cgroup_namespace_inode",
    "parent_path_fshex",
    "parent_device",
    "parent_inode",
    "controller_path_fshex",
    "controller_device",
    "controller_inode",
    "delegate_uid",
    "delegate_gid",
    "controllers",
    "subtree_controllers",
    "host_machine",
    "kernel_release",
    "receipt_payload_sha256",
)

INPUT_FIELDS = frozenset((
    "schema",
    "mode",
    "workloadKind",
    "delegationManifestSha256",
    "cgroupParentPathFshex",
    "crunSha256",
    "crunClone3Policy",
    "crunClone3ExactFlags",
    "crunExpectedExecTransitions",
    "rootfsManifestSha256",
    "rootfsTreeCid",
    "ociConfigSha256",
    "targetArgvCount",
    "targetArgvSha256",
    "targetEnvCount",
    "targetEnvSha256",
    "stageAuthorityManifestSha256",
    "stageExecutionManifestSha256",
    "stageManifestPairCommitmentSha256",
    "stagePhasePlanSha256",
    "stagePhaseIndex",
    "descendantExecLedgerRequired",
    "descendantExecLedgerProducerSha256",
    "descendantExecLedgerValidatorSha256",
    "descendantExecLedgerWrapperSha256",
    "descendantExecLedgerManifestSha256",
    "memoryMax",
    "memorySwapMax",
    "pidsMax",
))

LIVE_FIELDS = frozenset((
    "schema",
    "phase",
    "mode",
    "sessionNonce",
    "runtimeId",
    "parentPathFshex",
    "parentDevice",
    "parentInode",
    "leafPathFshex",
    "leafExists",
    "leafDevice",
    "leafInode",
    "initHostPid",
    "initHostPidStarttime",
    "cgroupProcs",
    "namespacePidMap",
    "memoryMax",
    "memorySwapMax",
    "memorySwapCurrent",
    "memoryCurrent",
    "memoryPeak",
    "pidsMax",
    "oomGroup",
    "eventsLocal",
    "hostMachine",
    "kernelRelease",
    "targetExeSha256",
    "targetElfMachine",
    "runtimeStateAbsent",
    "pidFileAbsent",
    "receiptSha256",
))

RECEIPT_KEYS = (
    "tool",
    "schema",
    "status",
    "applicability",
    "driver_role",
    "hard_memory_limit_proof_status",
    "memory_enforcement_scope",
    "mode",
    "workload_kind",
    "execution_result",
    "memory_limit_bytes",
    "memory_swap_max_bytes",
    "pids_max",
    "attack_child_count",
    "attack_child_bytes",
    "attack_aggregate_bytes",
    "delegation_manifest_sha256",
    "delegation_manifest_path_fshex",
    "delegation_manifest_device",
    "delegation_manifest_inode",
    "delegation_manifest_mode",
    "delegation_manifest_uid",
    "delegation_manifest_gid",
    "delegation_parent_path_fshex",
    "delegation_parent_device",
    "delegation_parent_inode",
    "delegation_controller_path_fshex",
    "delegation_boot_id",
    "cgroup_namespace_inode",
    "leaf_path_fshex",
    "leaf_device",
    "leaf_inode",
    "cgroup_mount_type",
    "crun_path_fshex",
    "crun_sha256",
    "crun_clone3_policy",
    "crun_clone3_exact_flags",
    "crun_clone3_intercept_count",
    "crun_exec_transition_count",
    "rootfs_manifest_sha256",
    "rootfs_manifest_path_fshex",
    "rootfs_path_fshex",
    "rootfs_tree_cid",
    "oci_config_sha256",
    "runtime_id",
    "init_host_pid",
    "init_host_pid_starttime",
    "workload_wall_start_monotonic_ns",
    "workload_wall_end_monotonic_ns",
    "workload_wall_elapsed_ns",
    "memory_peak_before_bytes",
    "memory_peak_after_bytes",
    "memory_current_before_bytes",
    "memory_current_after_bytes",
    "memory_events_local_before_low",
    "memory_events_local_before_high",
    "memory_events_local_before_max",
    "memory_events_local_before_oom",
    "memory_events_local_before_oom_kill",
    "memory_events_local_before_oom_group_kill",
    "memory_events_local_after_low",
    "memory_events_local_after_high",
    "memory_events_local_after_max",
    "memory_events_local_after_oom",
    "memory_events_local_after_oom_kill",
    "memory_events_local_after_oom_group_kill",
    "target_argv_count",
    "target_argv_sha256",
    "target_env_count",
    "target_env_sha256",
    "descendant_exec_ledger_status",
    "descendant_exec_ledger_schema",
    "descendant_exec_ledger_producer_sha256",
    "descendant_exec_ledger_validator_sha256",
    "descendant_exec_ledger_wrapper_sha256",
    "descendant_exec_ledger_manifest_sha256",
    "descendant_exec_ledger_receipt_sha256",
    "descendant_exec_ledger_payload_sha256",
    "descendant_exec_ledger_wrapper_receipt_sha256",
    "descendant_exec_ledger_command_argv_sha256",
    "descendant_exec_ledger_expected_exit_code",
    "descendant_exec_ledger_actual_exit_code",
    "descendant_exec_ledger_event_count",
    "ledger_standalone_validation_sha256",
    "native_descriptor_path_fshex",
    "native_descriptor_sha256",
    "native_descriptor_payload_sha256",
    "native_descriptor_target",
    "native_descriptor_machine",
    "native_descriptor_candidate_entry_path",
    "native_descriptor_candidate_entry_module_path",
    "native_descriptor_candidate_entry_sha256",
    "native_descriptor_worker_sha256",
    "native_descriptor_snapshot_manifest_sha256",
    "input_manifest_sha256",
    "stdout_sha256",
    "stdout_size",
    "stdout_device",
    "stdout_inode",
    "stderr_sha256",
    "stderr_size",
    "stderr_device",
    "stderr_inode",
    "workload_output_status",
    "workload_output_sha256",
    "workload_output_size",
    "workload_output_mode",
    "workload_report_sha256",
    "workload_report_size",
    "dry_source_file_count",
    "dry_source_line_count",
    "dry_source_byte_count",
    "dry_source_max_file_bytes",
    "dry_exec_phase_actual_total_ms",
    "dry_full_theory_time_guard_recommended_ms",
    "dry_full_theory_rss_modeled_guard_estimate_bytes",
    "current_driver_next_sha256",
    "current_driver_next_size",
    "current_driver_next_mode",
    "current_driver_report_sha256",
    "current_driver_report_size",
    "current_source_binding_status",
    "workspace_root_path_fshex",
    "source_closure_path_fshex",
    "current_driver_path_fshex",
    "current_build_receipt_path_fshex",
    "source_closure_cid",
    "source_closure_capture_sha256",
    "current_driver_sha256",
    "current_build_receipt_sha256",
    "current_entry_path",
    "current_entry_module_path",
    "current_entry_sha256",
    "stage_authority_manifest_path_fshex",
    "stage_authority_manifest_sha256",
    "stage_execution_manifest_path_fshex",
    "stage_execution_manifest_sha256",
    "stage_manifest_pair_commitment_path_fshex",
    "stage_manifest_pair_commitment_sha256",
    "stage_phase_plan_sha256",
    "stage_phase_index",
    "stage_phase_label",
    "stage_source_root_path_fshex",
    "stage_evidence_root_path_fshex",
    "stage_pre_tree_sha256",
    "stage_post_tree_sha256",
    "stage_declared_delta_sha256",
    "stage_output_set_sha256",
    "stage_output_count",
    "stage_terminal_relative_path",
    "stage_terminal_sha256",
    "stage_terminal_receipt_sha256",
    "phase_row_receipt_sha256",
    "live_before_receipt_sha256",
    "live_during_receipt_sha256",
    "live_after_receipt_sha256",
    "live_cleanup_receipt_sha256",
    "runner_sha256",
    "validator_sha256",
    "artifact_manifest_schema",
    "artifact_manifest_sha256",
    "artifact_count",
    "artifact_directory_count",
    "receipt_sha256",
)


class ValidationError(RuntimeError):
    pass


@dataclass(frozen=True)
class StableFile:
    path: Path
    raw: bytes
    sha256: str
    device: int
    inode: int
    size: int
    mode: int
    uid: int
    gid: int
    mtime_ns: int
    ctime_ns: int


@dataclass(frozen=True)
class CurrentBinding:
    workspace_root: Path
    source_closure: StableFile
    driver: StableFile
    build_receipt: StableFile
    source_closure_cid: str
    source_closure_capture_sha256: str
    target: str
    entry_path: str
    entry_module_path: str
    entry_sha256: str
    source_members: tuple[tuple[str, str, int], ...]


@dataclass(frozen=True)
class Stage23PhaseBinding:
    authority_manifest: StableFile
    execution_manifest: StableFile
    manifest_pair_commitment: StableFile
    delegation_manifest: StableFile
    cgroup_parent_identity: tuple[str, int, int, int, int, int]
    crun: StableFile
    rootfs_manifest: StableFile
    rootfs_tree_cid: str
    plan_sha256: str
    phase_index: int
    phase_label: str
    timeout_seconds: int
    source_root: Path
    evidence_root: Path
    source_members: tuple[tuple[str, str, int], ...]
    frozen_roles: tuple[dict[str, Any], ...]
    expected_new_directories: tuple[str, ...]
    expected_new_files: tuple[dict[str, Any], ...]
    terminal_relative_path: str
    action_argv: tuple[str, ...]
    action_env: tuple[str, ...]
    runner_argv_sha256: str
    phase_env_sha256: str
    plan: dict[str, Any]
    phase_terminal_schema: str
    phase_terminal_fields: tuple[str, ...]


@dataclass(frozen=True)
class RootfsManifest:
    file: StableFile
    rootfs: Path
    tree_cid: str
    crun_sha256: str
    entry_count: int
    delegate_uid: int
    delegate_gid: int
    mount_authority: dict[str, Any]


@dataclass(frozen=True)
class DelegationManifest:
    file: StableFile
    rows: dict[str, str]
    mount: Path
    parent: Path
    controller: Path


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
        digest.update(struct.pack(">Q", len(raw)))
        digest.update(raw)
    return digest.hexdigest()


def stage23_guard_text_frame(raw: bytes) -> bytes:
    return len(raw).to_bytes(4, "big") + raw


def stage23_guard_argv_sha256(values: Iterable[str]) -> str:
    rows = tuple(values)
    payload = bytearray(
        stage23_guard_text_frame(b"cheng.guard.command_argv")
    )
    payload.extend(len(rows).to_bytes(4, "big"))
    for value in rows:
        payload.extend(stage23_guard_text_frame(os.fsencode(value)))
    return sha256_bytes(bytes(payload))


def stage23_guard_env_sha256(
    rows: Iterable[dict[str, Any]],
) -> str:
    env: dict[str, str] = {}
    for row in rows:
        if (
            not isinstance(row, dict)
            or set(row) != {"name", "value"}
            or not isinstance(row["name"], str)
            or not isinstance(row["value"], str)
            or row["name"] in env
        ):
            raise ValidationError("stage23 phase environment is not exact")
        env[row["name"]] = row["value"]
    payload = bytearray(
        stage23_guard_text_frame(b"cheng.guard.target_env")
    )
    keys = sorted(env)
    payload.extend(len(keys).to_bytes(4, "big"))
    for key in keys:
        payload.extend(stage23_guard_text_frame(os.fsencode(key)))
        payload.extend(stage23_guard_text_frame(os.fsencode(env[key])))
    return sha256_bytes(bytes(payload))


def require_sha(value: str, label: str, *, nonzero: bool = True) -> str:
    if not SHA256_RE.fullmatch(value) or (nonzero and value == ZERO_SHA256):
        raise ValidationError(f"{label} is not an exact SHA-256")
    return value


def require_uint(value: str, label: str) -> int:
    if not value.isdigit():
        raise ValidationError(f"{label} is not an unsigned integer")
    return int(value)


def require_canonical_uint(value: str, label: str) -> int:
    parsed = require_uint(value, label)
    if value != str(parsed):
        raise ValidationError(f"{label} is not canonical")
    return parsed


def require_canonical_int32(value: str, label: str) -> int:
    if (
        not value
        or value in ("+", "-")
        or (value[0] == "-" and not value[1:].isdigit())
        or (value[0] != "-" and not value.isdigit())
    ):
        raise ValidationError(f"{label} is not a signed integer")
    parsed = int(value)
    if value != str(parsed) or not -(1 << 31) <= parsed < (1 << 31):
        raise ValidationError(f"{label} is not canonical int32")
    return parsed


def require_lower_hex_bytes(
    value: str,
    label: str,
    *,
    allow_empty: bool,
) -> bytes:
    if (
        (not value and not allow_empty)
        or len(value) % 2
        or value != value.lower()
        or any(ch not in "0123456789abcdef" for ch in value)
    ):
        raise ValidationError(f"{label} is not canonical lower hex")
    return bytes.fromhex(value)


def append_u32_be(out: bytearray, value: int) -> None:
    out.extend((value & 0xFFFF_FFFF).to_bytes(4, "big"))


def append_u64_be(out: bytearray, value: int) -> None:
    out.extend((value & 0xFFFF_FFFF_FFFF_FFFF).to_bytes(8, "big"))


def append_framed_bytes(out: bytearray, value: bytes) -> None:
    append_u32_be(out, len(value))
    out.extend(value)


def source_raw_bytes_cid(value: bytes) -> str:
    payload = bytearray()
    append_framed_bytes(payload, b"cheng.compiler.source_raw_bytes")
    append_u32_be(payload, len(value))
    payload.extend(value)
    return sha256_bytes(bytes(payload))


def parser_path_content_hash(value: bytes) -> int:
    result = 0
    for byte in value:
        result = (result * 131 + byte) & 0xFFFF_FFFF
        if result >= 0x8000_0000:
            result -= 0x1_0000_0000
    if result < 0:
        result = (-result) & 0xFFFF_FFFF
        if result >= 0x8000_0000:
            result -= 0x1_0000_0000
    return result


def parser_ident_prefix_bytes(value: bytes) -> bytes:
    stop = 0
    for byte in value:
        if (
            ord("0") <= byte <= ord("9")
            or ord("A") <= byte <= ord("Z")
            or ord("a") <= byte <= ord("z")
            or byte == ord("_")
        ):
            stop += 1
        else:
            break
    return value[:stop]


def stable_read(path: Path, label: str, max_bytes: int) -> StableFile:
    if not path.is_absolute() or path.resolve(strict=True) != path:
        raise ValidationError(f"{label} path is not absolute and canonical")
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0)
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(path, flags)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode):
            raise ValidationError(f"{label} is not a regular file")
        if before.st_size < 0 or before.st_size > max_bytes:
            raise ValidationError(f"{label} size is invalid")
        chunks: list[bytes] = []
        observed = 0
        while True:
            chunk = os.read(fd, min(1024 * 1024, max_bytes - observed + 1))
            if not chunk:
                break
            chunks.append(chunk)
            observed += len(chunk)
            if observed > max_bytes:
                raise ValidationError(f"{label} exceeds its size limit")
        after = os.fstat(fd)
    finally:
        os.close(fd)
    fields = (
        "st_dev",
        "st_ino",
        "st_mode",
        "st_uid",
        "st_gid",
        "st_size",
        "st_mtime_ns",
        "st_ctime_ns",
    )
    if any(getattr(before, name) != getattr(after, name) for name in fields):
        raise ValidationError(f"{label} changed during stable read")
    raw = b"".join(chunks)
    if len(raw) != before.st_size:
        raise ValidationError(f"{label} short read")
    return StableFile(
        path=path,
        raw=raw,
        sha256=sha256_bytes(raw),
        device=before.st_dev,
        inode=before.st_ino,
        size=before.st_size,
        mode=before.st_mode,
        uid=before.st_uid,
        gid=before.st_gid,
        mtime_ns=before.st_mtime_ns,
        ctime_ns=before.st_ctime_ns,
    )


def stable_file_identity(path: Path, label: str = "file") -> StableFile:
    return stable_read(path, label, 2 * 1024 * 1024 * 1024)


XATTR_AUDIT_MAX_BYTES = 1024 * 1024
AUTHORITY_XATTR_NAMES = frozenset(
    (
        b"system.posix_acl_access",
        b"system.posix_acl_default",
        b"security.capability",
        b"com.apple.system.Security",
    ),
)


def _fd_stat_signature(info: os.stat_result) -> tuple[int, ...]:
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


def _libc_xattr_call(
    operation: str,
    fd: int,
    name: bytes | None,
    buffer: ctypes.Array[ctypes.c_char] | None,
    size: int,
) -> int:
    host = platform.system()
    if host not in ("Darwin", "Linux"):
        raise ValidationError(
            f"exact no-follow xattr audit is unsupported on {host}",
        )
    libc = ctypes.CDLL(None, use_errno=True)
    try:
        function = getattr(libc, operation)
    except AttributeError as exc:
        raise ValidationError(
            f"exact no-follow {operation} is unavailable on {host}",
        ) from exc
    pointer = (
        ctypes.cast(buffer, ctypes.c_void_p)
        if buffer is not None
        else None
    )
    if operation == "flistxattr":
        if host == "Darwin":
            function.argtypes = (
                ctypes.c_int,
                ctypes.c_void_p,
                ctypes.c_size_t,
                ctypes.c_int,
            )
            arguments = (fd, pointer, size, 0)
        else:
            function.argtypes = (
                ctypes.c_int,
                ctypes.c_void_p,
                ctypes.c_size_t,
            )
            arguments = (fd, pointer, size)
    elif operation == "fgetxattr":
        if name is None:
            raise ValidationError("fgetxattr name is missing")
        if host == "Darwin":
            function.argtypes = (
                ctypes.c_int,
                ctypes.c_char_p,
                ctypes.c_void_p,
                ctypes.c_size_t,
                ctypes.c_uint32,
                ctypes.c_int,
            )
            arguments = (fd, name, pointer, size, 0, 0)
        else:
            function.argtypes = (
                ctypes.c_int,
                ctypes.c_char_p,
                ctypes.c_void_p,
                ctypes.c_size_t,
            )
            arguments = (fd, name, pointer, size)
    else:
        raise ValidationError(f"unsupported xattr operation: {operation}")
    function.restype = ctypes.c_ssize_t
    ctypes.set_errno(0)
    result = int(function(*arguments))
    if result < 0:
        error_number = ctypes.get_errno()
        raise OSError(
            error_number,
            os.strerror(error_number),
        )
    return result


def _fd_listxattr_snapshot(fd: int, label: str) -> tuple[bytes, ...]:
    try:
        size = _libc_xattr_call("flistxattr", fd, None, None, 0)
        if size > XATTR_AUDIT_MAX_BYTES:
            raise ValidationError(f"{label} xattr list exceeds limit")
        if size == 0:
            raw = b""
        else:
            buffer = ctypes.create_string_buffer(size)
            observed = _libc_xattr_call(
                "flistxattr",
                fd,
                None,
                buffer,
                size,
            )
            if observed > size:
                raise ValidationError(
                    f"{label} xattr list changed during audit",
                )
            raw = bytes(buffer.raw[:observed])
    except OSError as exc:
        raise ValidationError(
            f"{label} extended attributes cannot be audited",
        ) from exc
    if raw and not raw.endswith(b"\0"):
        raise ValidationError(f"{label} xattr list is malformed")
    names = tuple(raw[:-1].split(b"\0")) if raw else ()
    if any(not name for name in names) or len(set(names)) != len(names):
        raise ValidationError(f"{label} xattr list is malformed")
    return tuple(sorted(names))


def fd_xattr_names_exact(fd: int, label: str) -> tuple[bytes, ...]:
    before = os.fstat(fd)
    first = _fd_listxattr_snapshot(fd, label)
    second = _fd_listxattr_snapshot(fd, label)
    after = os.fstat(fd)
    if (
        first != second
        or _fd_stat_signature(before) != _fd_stat_signature(after)
    ):
        raise ValidationError(f"{label} xattrs changed during audit")
    return first


def _fd_getxattr_snapshot(
    fd: int,
    name: bytes,
    label: str,
) -> bytes | None:
    try:
        size = _libc_xattr_call("fgetxattr", fd, name, None, 0)
    except OSError as exc:
        missing = {errno.ENODATA}
        if hasattr(errno, "ENOATTR"):
            missing.add(errno.ENOATTR)
        if exc.errno in missing:
            return None
        raise ValidationError(f"{label} xattr read failed") from exc
    if size > XATTR_AUDIT_MAX_BYTES:
        raise ValidationError(f"{label} xattr value exceeds limit")
    try:
        if size == 0:
            value = b""
        else:
            buffer = ctypes.create_string_buffer(size)
            observed = _libc_xattr_call(
                "fgetxattr",
                fd,
                name,
                buffer,
                size,
            )
            if observed > size:
                raise ValidationError(
                    f"{label} xattr value changed during audit",
                )
            value = bytes(buffer.raw[:observed])
    except OSError as exc:
        raise ValidationError(
            f"{label} xattr value changed during audit",
        ) from exc
    return value


def fd_xattr_value_exact(
    fd: int,
    name: bytes,
    label: str,
) -> bytes | None:
    before = os.fstat(fd)
    first = _fd_getxattr_snapshot(fd, name, label)
    second = _fd_getxattr_snapshot(fd, name, label)
    after = os.fstat(fd)
    if (
        first != second
        or _fd_stat_signature(before) != _fd_stat_signature(after)
    ):
        raise ValidationError(f"{label} xattr changed during audit")
    return first


def require_unprivileged_executable(file: StableFile, label: str) -> None:
    if not file.mode & stat.S_IXUSR or \
            file.mode & (stat.S_ISUID | stat.S_ISGID):
        raise ValidationError(f"{label} executable mode mismatch")
    flags = os.O_RDONLY | os.O_NOFOLLOW
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    try:
        fd = os.open(file.path, flags)
    except OSError as exc:
        raise ValidationError(f"{label} cannot be opened no-follow") from exc
    try:
        current = os.fstat(fd)
        if (
            current.st_dev != file.device
            or current.st_ino != file.inode
            or current.st_mode != file.mode
            or current.st_uid != file.uid
            or current.st_gid != file.gid
            or current.st_size != file.size
            or current.st_mtime_ns != file.mtime_ns
            or current.st_ctime_ns != file.ctime_ns
        ):
            raise ValidationError(f"{label} identity changed before xattr audit")
        capability = fd_xattr_value_exact(
            fd,
            b"security.capability",
            label,
        )
        final = os.fstat(fd)
        if (
            final.st_dev != file.device
            or final.st_ino != file.inode
            or final.st_mode != file.mode
            or final.st_uid != file.uid
            or final.st_gid != file.gid
            or final.st_size != file.size
            or final.st_mtime_ns != file.mtime_ns
            or final.st_ctime_ns != file.ctime_ns
        ):
            raise ValidationError(f"{label} changed during xattr audit")
    finally:
        os.close(fd)
    if capability is not None:
        raise ValidationError(f"{label} has file capabilities")


def parse_kv(raw: bytes, keys: Sequence[str], label: str) -> dict[str, str]:
    if not raw.endswith(b"\n"):
        raise ValidationError(f"{label} lacks terminal newline")
    try:
        lines = raw.decode("utf-8", "strict").splitlines()
    except UnicodeDecodeError as exc:
        raise ValidationError(f"{label} is not UTF-8") from exc
    rows: dict[str, str] = {}
    for line in lines:
        key, separator, value = line.partition("=")
        if not separator or not key or key in rows:
            raise ValidationError(f"{label} row is invalid")
        rows[key] = value
    if tuple(rows) != tuple(keys):
        raise ValidationError(f"{label} field order is not canonical")
    payload_key = keys[-1]
    payload_line = f"{payload_key}={rows[payload_key]}\n".encode("utf-8")
    if not raw.endswith(payload_line):
        raise ValidationError(f"{label} payload row is not terminal")
    require_sha(rows[payload_key], f"{label} payload")
    if sha256_bytes(raw[:-len(payload_line)]) != rows[payload_key]:
        raise ValidationError(f"{label} payload hash mismatch")
    return rows


def read_receipt(path: Path) -> tuple[dict[str, str], StableFile]:
    file = stable_read(path, "hard-memory receipt", 4 * 1024 * 1024)
    return parse_kv(file.raw, RECEIPT_KEYS, "hard-memory receipt"), file


def read_json_file(
    path: Path,
    label: str,
    max_bytes: int = 64 * 1024 * 1024,
) -> tuple[dict[str, Any], StableFile]:
    file = stable_read(path, label, max_bytes)
    if not file.raw.endswith(b"\n"):
        raise ValidationError(f"{label} lacks terminal newline")
    try:
        value = json.loads(file.raw.decode("utf-8", "strict"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValidationError(f"{label} is not canonical JSON") from exc
    if not isinstance(value, dict) or file.raw != canonical_json(value) + b"\n":
        raise ValidationError(f"{label} is not canonical JSON")
    return value, file


def fsdecode_hex(value: str, label: str) -> Path:
    if not value or len(value) % 2:
        raise ValidationError(f"{label} fshex is invalid")
    try:
        raw = bytes.fromhex(value)
        decoded = os.fsdecode(raw)
    except (ValueError, UnicodeError) as exc:
        raise ValidationError(f"{label} fshex is invalid") from exc
    if "\x00" in decoded or "\n" in decoded or "\r" in decoded:
        raise ValidationError(f"{label} fshex contains a forbidden byte")
    return Path(decoded)


STAGE23_SOURCE_MEMBER_FIELDS = frozenset({
    "path",
    "sha256",
    "device",
    "inode",
    "size",
    "mode",
    "uid",
    "gid",
    "mtimeNs",
    "ctimeNs",
})
STAGE23_FROZEN_ROLE_FIELDS = frozenset({
    "role",
    "kind",
    "pathFshex",
    "guestPath",
    "sha256",
    "device",
    "inode",
    "size",
    "mode",
    "uid",
    "gid",
    "mtimeNs",
    "ctimeNs",
})
STAGE23_NEW_FILE_FIELDS = frozenset({
    "role",
    "relativePath",
    "kind",
    "mode",
})
STAGE23_FILE_BINDING_FIELDS = frozenset({
    "pathFshex",
    "sha256",
    "device",
    "inode",
    "size",
    "mode",
    "uid",
    "gid",
    "mtimeNs",
    "ctimeNs",
})
STAGE23_DIRECTORY_BINDING_FIELDS = frozenset({
    "pathFshex",
    "device",
    "inode",
    "mode",
    "uid",
    "gid",
})
STAGE23_MANIFEST_PAIR_FIELDS = frozenset({
    "schema",
    "authorityCoreSha256",
    "executionCoreSha256",
    "pairSha256",
})
STAGE23_AUTHORITY_FIELDS = frozenset({
    "schema",
    "lane",
    "phaseIndex",
    "phaseLabel",
    "phasePlanSha256",
    "phasePlan",
    "sourceRootPathFshex",
    "stageEvidencePathFshex",
    "sourceMembers",
    "frozenRoles",
    "actionArgv",
    "actionEnv",
    "actionTimeoutSeconds",
    "expectedNewDirectories",
    "expectedNewFiles",
    "terminalRelativePath",
    "delegationManifest",
    "cgroupParent",
    "crun",
    "rootfsManifest",
    "rootfsPathFshex",
    "rootfsTreeCid",
    "phaseExecutionManifest",
    "manifestPairCommitment",
})


def stage23_file_binding(file: StableFile) -> dict[str, Any]:
    return {
        "pathFshex": os.fsencode(str(file.path)).hex(),
        "sha256": file.sha256,
        "device": file.device,
        "inode": file.inode,
        "size": file.size,
        "mode": file.mode,
        "uid": file.uid,
        "gid": file.gid,
        "mtimeNs": file.mtime_ns,
        "ctimeNs": file.ctime_ns,
    }


def require_stage23_file_binding(
    value: Any,
    file: StableFile,
    label: str,
) -> None:
    if (
        not isinstance(value, dict)
        or set(value) != STAGE23_FILE_BINDING_FIELDS
        or value != stage23_file_binding(file)
    ):
        raise ValidationError(f"{label} physical identity mismatch")


def stage23_directory_binding(path: Path) -> dict[str, Any]:
    try:
        resolved = path.resolve(strict=True)
        info = path.lstat()
    except OSError as exc:
        raise ValidationError(
            "stage23 authority directory cannot be read"
        ) from exc
    if (
        not path.is_absolute()
        or resolved != path
        or path.is_symlink()
        or not stat.S_ISDIR(info.st_mode)
    ):
        raise ValidationError(
            "stage23 authority directory is not canonical"
        )
    return {
        "pathFshex": os.fsencode(str(path)).hex(),
        "device": info.st_dev,
        "inode": info.st_ino,
        "mode": info.st_mode,
        "uid": info.st_uid,
        "gid": info.st_gid,
    }


def require_stage23_directory_binding(
    value: Any,
    path: Path,
    label: str,
) -> tuple[str, int, int, int, int, int]:
    expected = stage23_directory_binding(path)
    if (
        not isinstance(value, dict)
        or set(value) != STAGE23_DIRECTORY_BINDING_FIELDS
        or value != expected
    ):
        raise ValidationError(f"{label} physical identity mismatch")
    return (
        expected["pathFshex"],
        expected["device"],
        expected["inode"],
        expected["mode"],
        expected["uid"],
        expected["gid"],
    )


def stage23_manifest_pair_sha256(
    authority_core_sha256: str,
    execution_core_sha256: str,
) -> str:
    require_sha(authority_core_sha256, "stage23 authority core")
    require_sha(execution_core_sha256, "stage23 execution core")
    payload = (
        len(STAGE23_MANIFEST_PAIR_DOMAIN).to_bytes(4, "little")
        + STAGE23_MANIFEST_PAIR_DOMAIN
        + bytes.fromhex(authority_core_sha256)
        + bytes.fromhex(execution_core_sha256)
    )
    return sha256_bytes(payload)


def canonical_stage23_relative_path(raw: Any, label: str) -> str:
    if not isinstance(raw, str) or not raw or "\x00" in raw or \
            "\n" in raw or "\r" in raw:
        raise ValidationError(f"{label} relative path is invalid")
    path = Path(raw)
    components = raw.split("/")
    if path.is_absolute() or path.as_posix() != raw or \
            any(item in ("", ".", "..") for item in components):
        raise ValidationError(f"{label} relative path is not canonical")
    return raw


def stage23_linux_guest_phase_plan(
    plan: dict[str, Any],
    paths: Any,
) -> dict[str, Any]:
    replacements = (
        (str(paths.evidence), STAGE23_EVIDENCE_GUEST_PATH),
        (str(paths.root), STAGE23_SOURCE_GUEST_PATH),
        (str(paths.cc), "/usr/bin/cc"),
    )

    def translate_text(value: str) -> str:
        prefix = ""
        candidate = value
        if value.startswith("--") and ":" in value:
            prefix, candidate = value.split(":", 1)
            prefix += ":"
        for host, guest in replacements:
            if candidate == host or candidate.startswith(host + "/"):
                return prefix + guest + candidate[len(host):]
        return value

    def translate(value: Any, key: str | None = None) -> Any:
        if isinstance(value, dict):
            return {
                item_key: translate(item_value, item_key)
                for item_key, item_value in value.items()
            }
        if isinstance(value, list):
            return [translate(item, key) for item in value]
        if isinstance(value, str):
            if key == "pathFshex":
                try:
                    decoded = os.fsdecode(bytes.fromhex(value))
                except (UnicodeError, ValueError) as exc:
                    raise ValidationError(
                        "stage23 phase plan fshex cannot be translated"
                    ) from exc
                return os.fsencode(translate_text(decoded)).hex()
            return translate_text(value)
        return value

    translated = translate(plan)
    if not isinstance(translated, dict):
        raise ValidationError(
            "stage23 Linux guest phase plan translation failed"
        )
    return translated


def require_stage23_identity_row(
    row: dict[str, Any],
    file: StableFile,
    label: str,
) -> None:
    expected = {
        "sha256": file.sha256,
        "device": file.device,
        "inode": file.inode,
        "size": file.size,
        "mode": file.mode,
        "uid": file.uid,
        "gid": file.gid,
        "mtimeNs": file.mtime_ns,
        "ctimeNs": file.ctime_ns,
    }
    if any(row.get(key) != value for key, value in expected.items()):
        raise ValidationError(f"{label} frozen identity mismatch")


def require_stage23_linux_elf(file: StableFile, label: str) -> None:
    require_unprivileged_executable(file, label)
    raw = file.raw
    if (
        len(raw) < 64
        or raw[:4] != b"\x7fELF"
        or raw[4:6] != b"\x02\x01"
        or int.from_bytes(raw[16:18], "little") not in (2, 3)
        or int.from_bytes(raw[18:20], "little") != 62
    ):
        raise ValidationError(f"{label} is not native x86_64 Linux ELF")


def load_stage23_phase_engine(
    source_root: Path,
    expected_sha256: str,
) -> Any:
    path = source_root / STAGE23_PHASE_ENGINE_RELATIVE_PATH
    before = stable_read(
        path,
        "stage23 phase engine",
        16 * 1024 * 1024,
    )
    if before.sha256 != expected_sha256:
        raise ValidationError("stage23 phase engine identity mismatch")
    loader = importlib.machinery.SourceFileLoader(
        "cheng_stage23_hard_memory_phase_engine_" + expected_sha256[:16],
        str(path),
    )
    spec = importlib.util.spec_from_loader(loader.name, loader)
    if spec is None:
        raise ValidationError("stage23 phase engine cannot be loaded")
    module = importlib.util.module_from_spec(spec)
    sys.modules[loader.name] = module
    loader.exec_module(module)
    after = stable_read(
        path,
        "stage23 phase engine",
        16 * 1024 * 1024,
    )
    if before != after or not callable(getattr(module, "phase_plan", None)):
        raise ValidationError("stage23 phase engine drift/API mismatch")
    return module


def validate_stage23_manifest_pair(
    authority_value: dict[str, Any],
    execution_value: dict[str, Any],
    pair_value: dict[str, Any],
    authority_manifest: StableFile,
    execution_manifest: StableFile,
    pair_file: StableFile,
) -> tuple[str, str]:
    if (
        set(authority_value) != STAGE23_AUTHORITY_FIELDS
        or authority_value.get("schema") != STAGE23_AUTHORITY_SCHEMA
        or authority_value.get("lane") != "linux"
        or execution_value.get("schema") != STAGE23_EXECUTION_SCHEMA
        or execution_value.get("lane") != "linux"
    ):
        raise ValidationError("stage23 manifest pair schema/lane mismatch")
    require_stage23_file_binding(
        authority_value.get("phaseExecutionManifest"),
        execution_manifest,
        "stage23 phase execution manifest",
    )
    require_stage23_file_binding(
        authority_value.get("manifestPairCommitment"),
        pair_file,
        "stage23 manifest pair commitment",
    )
    if (
        set(pair_value) != STAGE23_MANIFEST_PAIR_FIELDS
        or pair_value.get("schema") != STAGE23_MANIFEST_PAIR_SCHEMA
    ):
        raise ValidationError("stage23 manifest pair schema mismatch")
    authority_rows = authority_value.get("frozenRoles")
    execution_rows = execution_value.get("frozenRoles")
    if not isinstance(authority_rows, list) or not isinstance(
        execution_rows, list
    ):
        raise ValidationError("stage23 manifest pair frozen roles are absent")
    authority_pair_rows = [
        row for row in authority_rows
        if isinstance(row, dict)
        and row.get("role") == STAGE23_MANIFEST_PAIR_ROLE
    ]
    execution_pair_rows = [
        row for row in execution_rows
        if isinstance(row, dict)
        and row.get("role") == STAGE23_MANIFEST_PAIR_ROLE
    ]
    if len(authority_pair_rows) != 1 or len(execution_pair_rows) != 1:
        raise ValidationError(
            "stage23 manifest pair commitment role is not unique"
        )
    authority_core = dict(authority_value)
    del authority_core["phaseExecutionManifest"]
    del authority_core["manifestPairCommitment"]
    authority_core["frozenRoles"] = [
        row for row in authority_rows
        if not isinstance(row, dict)
        or row.get("role") != STAGE23_MANIFEST_PAIR_ROLE
    ]
    execution_core = dict(execution_value)
    execution_core["frozenRoles"] = [
        row for row in execution_rows
        if not isinstance(row, dict)
        or row.get("role") != STAGE23_MANIFEST_PAIR_ROLE
    ]
    authority_core_sha = sha256_bytes(canonical_json(authority_core))
    execution_core_sha = sha256_bytes(canonical_json(execution_core))
    if (
        pair_value.get("authorityCoreSha256") != authority_core_sha
        or pair_value.get("executionCoreSha256") != execution_core_sha
        or pair_value.get("pairSha256") != stage23_manifest_pair_sha256(
            authority_core_sha,
            execution_core_sha,
        )
    ):
        raise ValidationError(
            "stage23 manifest pair commitment hash mismatch"
        )
    return authority_core_sha, execution_core_sha


def validate_stage23_phase_binding(
    authority_manifest_path: Path,
    execution_manifest_path: Path,
    manifest_pair_commitment_path: Path,
    expected_plan_sha256: str,
    rootfs: "RootfsManifest",
    delegation: "DelegationManifest",
    crun: StableFile,
) -> Stage23PhaseBinding:
    require_sha(expected_plan_sha256, "stage23 phase plan")
    value, authority_manifest = read_json_file(
        authority_manifest_path,
        "stage23 phase authority manifest",
        256 * 1024 * 1024,
    )
    execution_value, execution_manifest = read_json_file(
        execution_manifest_path,
        "stage23 phase execution manifest",
        256 * 1024 * 1024,
    )
    pair_value, pair_file = read_json_file(
        manifest_pair_commitment_path,
        "stage23 manifest pair commitment",
        64 * 1024,
    )
    validate_stage23_manifest_pair(
        value,
        execution_value,
        pair_value,
        authority_manifest,
        execution_manifest,
        pair_file,
    )
    require_stage23_file_binding(
        value.get("delegationManifest"),
        delegation.file,
        "stage23 delegation manifest",
    )
    cgroup_parent_identity = require_stage23_directory_binding(
        value.get("cgroupParent"),
        delegation.parent,
        "stage23 cgroup parent",
    )
    require_stage23_file_binding(
        value.get("crun"), crun, "stage23 crun"
    )
    require_stage23_file_binding(
        value.get("rootfsManifest"),
        rootfs.file,
        "stage23 rootfs manifest",
    )
    if (
        value.get("rootfsPathFshex")
            != os.fsencode(str(rootfs.rootfs)).hex()
        or value.get("rootfsTreeCid") != rootfs.tree_cid
        or crun.sha256 != rootfs.crun_sha256
    ):
        raise ValidationError("stage23 rootfs/crun authority mismatch")
    phase_index = value["phaseIndex"]
    phase_label = value["phaseLabel"]
    timeout_seconds = value["actionTimeoutSeconds"]
    if (
        not isinstance(phase_index, int)
        or isinstance(phase_index, bool)
        or not 0 <= phase_index < 16
        or not isinstance(phase_label, str)
        or not phase_label
        or not isinstance(timeout_seconds, int)
        or isinstance(timeout_seconds, bool)
        or not 1 <= timeout_seconds <= 86_400
        or value["phasePlanSha256"] != expected_plan_sha256
    ):
        raise ValidationError("stage23 phase scalar contract mismatch")
    source_root = fsdecode_hex(
        value["sourceRootPathFshex"],
        "stage23 source root",
    )
    evidence_root = fsdecode_hex(
        value["stageEvidencePathFshex"],
        "stage23 evidence root",
    )
    for path, label in (
        (source_root, "stage23 source root"),
        (evidence_root, "stage23 evidence root"),
    ):
        if not path.is_absolute() or path.resolve(strict=True) != path or \
                path.is_symlink() or not path.is_dir():
            raise ValidationError(f"{label} is not a canonical directory")
    source_rows = value["sourceMembers"]
    if not isinstance(source_rows, list) or not source_rows:
        raise ValidationError("stage23 source member closure is absent")
    source_members: list[tuple[str, str, int]] = []
    previous_path = b""
    source_by_relative: dict[str, StableFile] = {}
    for index, item in enumerate(source_rows):
        if not isinstance(item, dict) or \
                set(item) != STAGE23_SOURCE_MEMBER_FIELDS:
            raise ValidationError("stage23 source member schema mismatch")
        relative = canonical_stage23_relative_path(
            item["path"],
            f"stage23 source member {index}",
        )
        relative_raw = os.fsencode(relative)
        if relative_raw <= previous_path:
            raise ValidationError("stage23 source members are not sorted")
        previous_path = relative_raw
        file = stable_read(
            source_root / relative,
            "stage23 source member",
            2 * 1024 * 1024 * 1024,
        )
        require_stage23_identity_row(item, file, "stage23 source member")
        source_members.append((relative, file.sha256, file.mode))
        source_by_relative[relative] = file
    frozen_rows = value["frozenRoles"]
    if not isinstance(frozen_rows, list) or not frozen_rows:
        raise ValidationError("stage23 frozen role closure is absent")
    frozen_roles: list[dict[str, Any]] = []
    role_map: dict[str, dict[str, Any]] = {}
    guest_paths: set[str] = set()
    previous_role = ""
    for item in frozen_rows:
        if not isinstance(item, dict) or \
                set(item) != STAGE23_FROZEN_ROLE_FIELDS:
            raise ValidationError("stage23 frozen role schema mismatch")
        role = item["role"]
        kind = item["kind"]
        guest_path = item["guestPath"]
        if (
            not isinstance(role, str)
            or not re.fullmatch(r"[a-z][a-z0-9_]*", role)
            or role <= previous_role
            or kind not in ("executable", "bound_argv_file")
            or not isinstance(guest_path, str)
            or not guest_path.startswith("/")
            or guest_path in guest_paths
        ):
            raise ValidationError("stage23 frozen role identity mismatch")
        previous_role = role
        guest_paths.add(guest_path)
        host_path = fsdecode_hex(
            item["pathFshex"],
            "stage23 frozen role path",
        )
        file = stable_read(
            host_path,
            "stage23 frozen role",
            2 * 1024 * 1024 * 1024,
        )
        require_stage23_identity_row(item, file, "stage23 frozen role")
        try:
            source_relative = host_path.relative_to(source_root).as_posix()
        except ValueError:
            source_relative = ""
        try:
            evidence_relative = host_path.relative_to(
                evidence_root,
            ).as_posix()
        except ValueError:
            evidence_relative = ""
        try:
            rootfs_relative = host_path.relative_to(
                rootfs.rootfs,
            ).as_posix()
        except ValueError:
            rootfs_relative = ""
        expected_guest_paths = set()
        if role == STAGE23_MANIFEST_PAIR_ROLE:
            if (
                kind != "bound_argv_file"
                or host_path != pair_file.path
                or file != pair_file
            ):
                raise ValidationError(
                    "stage23 manifest pair frozen role mismatch"
                )
            expected_guest_paths.add(STAGE23_MANIFEST_PAIR_GUEST_PATH)
        if source_relative:
            expected_guest_paths.add(
                STAGE23_SOURCE_GUEST_PATH + "/" + source_relative,
            )
            source_file = source_by_relative.get(source_relative)
            if source_file is None or source_file != file:
                raise ValidationError(
                    "stage23 frozen source role is outside source closure",
                )
        if evidence_relative:
            expected_guest_paths.add(
                STAGE23_EVIDENCE_GUEST_PATH + "/" + evidence_relative,
            )
        if rootfs_relative:
            expected_guest_paths.add("/" + rootfs_relative)
        if expected_guest_paths != {guest_path}:
            raise ValidationError("stage23 frozen role guest mapping mismatch")
        if kind == "executable":
            require_stage23_linux_elf(file, "stage23 frozen executable")
        role_map[role] = item
        frozen_roles.append(item)
    required_static = {
        "bash": ("executable", "/bin/bash"),
        "python": ("executable", "/usr/bin/python3"),
        "cc": ("executable", "/usr/bin/cc"),
        "stage_gate": ("bound_argv_file", STAGE23_INNER_GUEST_PATH),
        "phase_engine": (
            "bound_argv_file",
            STAGE23_SOURCE_GUEST_PATH + "/"
            + STAGE23_PHASE_ENGINE_RELATIVE_PATH,
        ),
        "process_guard": (
            "bound_argv_file",
            STAGE23_SOURCE_GUEST_PATH + "/"
            + STAGE23_PROCESS_GUARD_RELATIVE_PATH,
        ),
        STAGE23_MANIFEST_PAIR_ROLE: (
            "bound_argv_file",
            STAGE23_MANIFEST_PAIR_GUEST_PATH,
        ),
    }
    for role, (kind, guest_path) in required_static.items():
        item = role_map.get(role)
        if item is None or (item["kind"], item["guestPath"]) != (
            kind,
            guest_path,
        ):
            raise ValidationError("stage23 required frozen role mismatch: " + role)
    phase_engine = load_stage23_phase_engine(
        source_root,
        role_map["phase_engine"]["sha256"],
    )
    try:
        parsed_execution, parsed_execution_raw = (
            phase_engine.strict_stage_input_manifest(
                execution_manifest_path
            )
        )
    except Exception as exc:
        raise ValidationError(
            "stage23 execution manifest failed phase-engine validation"
        ) from exc
    if (
        parsed_execution != execution_value
        or parsed_execution_raw != execution_manifest.raw
        or execution_value.get("phaseIndex") != phase_index
        or execution_value.get("phaseLabel") != phase_label
        or execution_value.get("phasePlan") != value["phasePlan"]
        or execution_value.get("phasePlanSha256")
            != expected_plan_sha256
        or execution_value.get("terminalRelativePath")
            != value["terminalRelativePath"]
        or execution_value.get("declaredDeltaDirectories")
            != value["expectedNewDirectories"]
    ):
        raise ValidationError(
            "stage23 execution/authority manifest cross-binding mismatch"
        )
    execution_rows = execution_value.get("frozenRoles")
    if not isinstance(execution_rows, list):
        raise ValidationError("stage23 execution frozen roles are absent")
    execution_role_map: dict[str, dict[str, Any]] = {}
    for row in execution_rows:
        if (
            not isinstance(row, dict)
            or set(row) != {"role", "hostIdentity", "guestPath"}
            or not isinstance(row.get("role"), str)
            or row["role"] in execution_role_map
            or not isinstance(row.get("hostIdentity"), dict)
        ):
            raise ValidationError(
                "stage23 execution frozen role schema mismatch"
            )
        execution_role_map[row["role"]] = row
    if set(execution_role_map) != set(role_map):
        raise ValidationError(
            "stage23 execution/authority frozen role sets differ"
        )
    for role, authority_row in role_map.items():
        execution_row = execution_role_map[role]
        identity = execution_row["hostIdentity"]
        expected_kind = (
            "bound_argv_file"
            if identity.get("format") == "regular"
            else "executable"
        )
        if (
            execution_row["guestPath"] != authority_row["guestPath"]
            or expected_kind != authority_row["kind"]
            or any(
                identity.get(key) != authority_row[key]
                for key in (
                    "pathFshex", "sha256", "device", "inode",
                    "size", "mode", "uid", "gid",
                )
            )
            or identity.get("nlink") != 1
        ):
            raise ValidationError(
                "stage23 execution/authority frozen role identity differs"
            )
    plan = value["phasePlan"]
    if not isinstance(plan, dict):
        raise ValidationError("stage23 phase plan is not an object")
    cc_host_path = fsdecode_hex(
        role_map["cc"]["pathFshex"], "stage23 host cc"
    )
    paths = phase_engine.PhasePaths(
        source_root, evidence_root, cc_host_path
    )
    expected_plan = stage23_linux_guest_phase_plan(
        phase_engine.phase_plan(phase_index, paths, "linux"),
        paths,
    )
    if plan != expected_plan or \
            sha256_bytes(canonical_json(plan)) != expected_plan_sha256 or \
            plan["phaseLabel"] != phase_label or \
            not plan["timeoutSeconds"] <= timeout_seconds <= \
            plan["timeoutSeconds"] + 300:
        raise ValidationError("stage23 canonical phase plan mismatch")
    required_plan_roles = {
        plan["commandRole"],
        *plan["boundInputRoles"],
    }
    if not required_plan_roles.issubset(role_map):
        raise ValidationError("stage23 plan frozen role is absent")
    available_roles = set(role_map)
    produced_roles: set[str] = set()
    for expected_index, action in enumerate(plan["actions"]):
        owner = action["ownerExecutableRole"]
        external_runner = owner == "linux_phase_runner"
        if (
            action.get("actionIndex") != expected_index
            or (
                external_runner
                and (
                    action.get("kind") != "runner_authority"
                    or action.get("operation")
                        != "seal_ptrace_cgroup_phase_proof"
                )
            )
            or (not external_runner and owner not in available_roles)
            or any(
                role not in available_roles
                for role in action["inputRoles"]
            )
            or any(
                role in available_roles or role in produced_roles
                for role in action["outputRoles"]
            )
        ):
            raise ValidationError("stage23 plan action DAG is invalid")
        produced_roles.update(action["outputRoles"])
        available_roles.update(action["outputRoles"])
    if role_map[plan["commandRole"]]["kind"] != "executable":
        raise ValidationError("stage23 command role is not executable")
    expected_directories_raw = value["expectedNewDirectories"]
    if not isinstance(expected_directories_raw, list):
        raise ValidationError("stage23 expected directory set is invalid")
    expected_directories = tuple(
        canonical_stage23_relative_path(item, "stage23 expected directory")
        for item in expected_directories_raw
    )
    if tuple(sorted(expected_directories, key=os.fsencode)) != \
            expected_directories or \
            len(set(expected_directories)) != len(expected_directories) or \
            list(expected_directories) != plan["declaredDeltaDirectories"]:
        raise ValidationError("stage23 expected directories are not canonical")
    expected_files_raw = value["expectedNewFiles"]
    if not isinstance(expected_files_raw, list):
        raise ValidationError("stage23 expected file set is invalid")
    expected_files: list[dict[str, Any]] = []
    previous_file_role = ""
    expected_file_by_role: dict[str, dict[str, Any]] = {}
    expected_file_paths: set[str] = set()
    for item in expected_files_raw:
        if not isinstance(item, dict) or \
                set(item) != STAGE23_NEW_FILE_FIELDS:
            raise ValidationError("stage23 expected file schema mismatch")
        role = item["role"]
        relative = canonical_stage23_relative_path(
            item["relativePath"],
            "stage23 expected file",
        )
        if (
            not isinstance(role, str)
            or not re.fullmatch(r"[a-z][a-z0-9_]*", role)
            or role <= previous_file_role
            or item["kind"] not in ("regular", "executable")
            or item["mode"] not in (
                (0o500, 0o555)
                if item["kind"] == "executable"
                else (0o400, 0o444)
            )
            or relative in expected_file_paths
        ):
            raise ValidationError("stage23 expected file identity mismatch")
        previous_file_role = role
        expected_file_paths.add(relative)
        expected_file_by_role[role] = item
        expected_files.append(item)
    for output in plan["outputs"]:
        try:
            relative = Path(
                os.fsdecode(bytes.fromhex(output["pathFshex"])),
            ).relative_to(STAGE23_EVIDENCE_GUEST_PATH).as_posix()
        except (ValueError, UnicodeError) as exc:
            raise ValidationError(
                "stage23 plan output path escapes evidence root",
            ) from exc
        expected = expected_file_by_role.get(output["role"])
        if expected != {
            "role": output["role"],
            "relativePath": relative,
            "kind": output["kind"],
            "mode": output["finalMode"],
        }:
            raise ValidationError(
                "stage23 plan output is absent from action delta",
            )
    terminal_relative = canonical_stage23_relative_path(
        value["terminalRelativePath"],
        "stage23 terminal",
    )
    expected_terminal = plan["terminalRelativePath"]
    if terminal_relative != expected_terminal or \
            terminal_relative in expected_file_paths:
        raise ValidationError("stage23 terminal path mismatch")
    canonical_expected_files = sorted(
        (
            {
                "role": item["role"],
                "relativePath": item["relativePath"],
                "kind": item["kind"],
                "mode": item["finalMode"],
            }
            for item in plan["declaredDeltaFiles"]
            if item["relativePath"] != terminal_relative
            and item["role"] not in STAGE23_EXTERNAL_PHASE_PROOF_ROLES
        ),
        key=lambda item: item["role"],
    )
    if expected_files != canonical_expected_files:
        raise ValidationError("stage23 expected file closure is not canonical")
    action_argv_raw = value["actionArgv"]
    action_env_raw = value["actionEnv"]
    expected_action_argv = (
        "/bin/bash",
        STAGE23_INNER_GUEST_PATH,
        "--run-phase-action",
        "--stage-input-manifest",
        STAGE23_EXECUTION_GUEST_PATH,
        "--stage-plan-sha256",
        expected_plan_sha256,
        "--evidence-dir",
        STAGE23_EVIDENCE_GUEST_PATH,
    )
    expected_phase_env = plan["env"]
    if not isinstance(action_argv_raw, list) or \
            tuple(action_argv_raw) != expected_action_argv or \
            not isinstance(action_env_raw, list) or \
            tuple(action_env_raw) != STAGE23_TARGET_ENV or \
            execution_value.get("runnerArgv") != list(expected_action_argv) or \
            execution_value.get("runnerArgvSha256") != \
            stage23_guard_argv_sha256(expected_action_argv) or \
            execution_value.get("phaseEnv") != expected_phase_env or \
            execution_value.get("phaseEnvSha256") != \
            stage23_guard_env_sha256(expected_phase_env):
        raise ValidationError("stage23 phase action argv/env mismatch")
    return Stage23PhaseBinding(
        authority_manifest=authority_manifest,
        execution_manifest=execution_manifest,
        manifest_pair_commitment=pair_file,
        delegation_manifest=delegation.file,
        cgroup_parent_identity=cgroup_parent_identity,
        crun=crun,
        rootfs_manifest=rootfs.file,
        rootfs_tree_cid=rootfs.tree_cid,
        plan_sha256=expected_plan_sha256,
        phase_index=phase_index,
        phase_label=phase_label,
        timeout_seconds=timeout_seconds,
        source_root=source_root,
        evidence_root=evidence_root,
        source_members=tuple(source_members),
        frozen_roles=tuple(frozen_roles),
        expected_new_directories=expected_directories,
        expected_new_files=tuple(expected_files),
        terminal_relative_path=terminal_relative,
        action_argv=expected_action_argv,
        action_env=STAGE23_TARGET_ENV,
        runner_argv_sha256=execution_value["runnerArgvSha256"],
        phase_env_sha256=execution_value["phaseEnvSha256"],
        plan=plan,
        phase_terminal_schema=phase_engine.PHASE_ACTION_TERMINAL_SCHEMA,
        phase_terminal_fields=phase_engine.phase_action_terminal_fields(
            "linux", phase_index
        ),
    )


def stage23_tree_snapshot(
    root: Path,
    *,
    excluded_relative_path: str,
) -> tuple[dict[str, Any], str]:
    excluded = root / excluded_relative_path
    directories: list[dict[str, Any]] = []
    files: list[dict[str, Any]] = []
    inode_keys: set[tuple[int, int]] = set()
    pending = [root]
    while pending:
        directory = pending.pop()
        relative_directory = directory.relative_to(root).as_posix()
        if relative_directory != ".":
            info = os.stat(directory, follow_symlinks=False)
            if not stat.S_ISDIR(info.st_mode):
                raise ValidationError(
                    "stage23 evidence tree directory changed type",
                )
            directories.append({
                "relativePath": relative_directory,
                "device": info.st_dev,
                "inode": info.st_ino,
                "mode": stat.S_IMODE(info.st_mode),
            })
        with os.scandir(directory) as iterator:
            children = sorted(
                list(iterator),
                key=lambda item: os.fsencode(item.name),
                reverse=True,
            )
        for child in children:
            path = directory / child.name
            if path == excluded:
                continue
            info = os.stat(child, follow_symlinks=False)
            if stat.S_ISDIR(info.st_mode):
                pending.append(path)
                continue
            if not stat.S_ISREG(info.st_mode):
                raise ValidationError(
                    "stage23 evidence tree contains non-regular entry",
                )
            file = stable_read(
                path,
                "stage23 evidence file",
                2 * 1024 * 1024 * 1024,
            )
            inode_key = (file.device, file.inode)
            if inode_key in inode_keys:
                raise ValidationError(
                    "stage23 evidence tree contains a hard-link alias",
                )
            inode_keys.add(inode_key)
            files.append({
                "relativePath": path.relative_to(root).as_posix(),
                "sha256": file.sha256,
                "size": file.size,
                "device": file.device,
                "inode": file.inode,
                "mode": stat.S_IMODE(file.mode),
                "mtimeNs": file.mtime_ns,
                "ctimeNs": file.ctime_ns,
            })
    directories.sort(key=lambda item: os.fsencode(item["relativePath"]))
    files.sort(key=lambda item: os.fsencode(item["relativePath"]))
    value = {"directories": directories, "files": files}
    return value, sha256_bytes(canonical_json(value))


def validate_stage23_phase_result(
    binding: Stage23PhaseBinding,
    target_stdout: StableFile,
    target_stderr: StableFile,
    before: dict[str, Any] | None = None,
    before_sha256: str | None = None,
) -> tuple[StableFile, dict[str, str]]:
    terminal_path = binding.evidence_root / binding.terminal_relative_path
    terminal = stable_read(
        terminal_path,
        "stage23 phase terminal",
        2 * 1024 * 1024 * 1024,
    )
    if stat.S_IMODE(terminal.mode) != 0o400:
        raise ValidationError("stage23 phase terminal mode mismatch")
    after, after_sha = stage23_tree_snapshot(
        binding.evidence_root,
        excluded_relative_path=binding.terminal_relative_path,
    )
    if before is None or before_sha256 is None:
        raise ValidationError("stage23 phase pre-tree evidence is absent")
    if sha256_bytes(canonical_json(before)) != before_sha256:
        raise ValidationError("stage23 phase pre-tree digest mismatch")
    before_directories = {
        item["relativePath"]: item for item in before.get("directories", [])
        if isinstance(item, dict) and "relativePath" in item
    }
    after_directories = {
        item["relativePath"]: item for item in after["directories"]
    }
    before_files = {
        item["relativePath"]: item for item in before.get("files", [])
        if isinstance(item, dict) and "relativePath" in item
    }
    after_files = {item["relativePath"]: item for item in after["files"]}
    if (
        len(before_directories) != len(before.get("directories", []))
        or len(before_files) != len(before.get("files", []))
    ):
        raise ValidationError("stage23 phase pre-tree schema is invalid")
    expected_directories = set(binding.expected_new_directories)
    expected_files = {
        item["relativePath"]: item for item in binding.expected_new_files
    }
    if (
        not set(before_directories).isdisjoint(expected_directories)
        or not set(before_files).isdisjoint(expected_files)
        or set(after_directories) - set(before_directories)
        != expected_directories
        or set(after_files) - set(before_files) != set(expected_files)
        or set(before_directories) - set(after_directories)
        or set(before_files) - set(after_files)
    ):
        raise ValidationError("stage23 phase evidence tree delta mismatch")
    if any(
        after_directories[path] != row
        for path, row in before_directories.items()
    ) or any(after_files[path] != row for path, row in before_files.items()):
        raise ValidationError(
            "stage23 phase replaced or modified prior evidence",
        )
    outputs: list[dict[str, Any]] = []
    for expected in binding.expected_new_files:
        observed = after_files[expected["relativePath"]]
        if (
            observed["mode"] != expected["mode"]
            or (
                expected["kind"] == "executable"
                and not observed["mode"] & 0o100
            )
            or (
                expected["kind"] == "regular"
                and observed["mode"] & 0o111
            )
        ):
            raise ValidationError("stage23 phase output kind/mode mismatch")
        outputs.append({
            "role": expected["role"],
            "relativePath": expected["relativePath"],
            "kind": expected["kind"],
            "sha256": observed["sha256"],
            "size": observed["size"],
            "mode": observed["mode"],
            "device": observed["device"],
            "inode": observed["inode"],
        })
    output_set_sha = sha256_bytes(canonical_json(outputs))
    declared_delta_sha = sha256_bytes(canonical_json({
        "directories": list(binding.expected_new_directories),
        "files": list(binding.expected_new_files),
    }))
    value, terminal_again = read_json_file(
        terminal_path,
        "stage23 phase terminal",
        2 * 1024 * 1024 * 1024,
    )
    if terminal_again != terminal:
        raise ValidationError("stage23 phase terminal drifted")
    payload = value.get("payload")
    receipt_sha = value.get("payloadSha256")
    if not isinstance(payload, dict):
        raise ValidationError("stage23 phase terminal payload is absent")
    terminal_outputs = payload.get("produced")
    planned_outputs = binding.plan["outputs"]
    if (
        not isinstance(terminal_outputs, list)
        or len(terminal_outputs) != len(planned_outputs)
    ):
        raise ValidationError("stage23 phase terminal outputs are absent")
    expected_terminal_outputs: list[dict[str, Any]] = []
    expected_file_by_role = {
        item["role"]: item for item in binding.expected_new_files
    }
    for output, planned in zip(
        terminal_outputs,
        planned_outputs,
    ):
        expected = expected_file_by_role.get(planned["role"])
        if (
            expected is None
            or not isinstance(output, dict)
            or set(output) != {"role", "identity"}
            or output.get("role") != expected["role"]
            or not isinstance(output.get("identity"), dict)
        ):
            raise ValidationError(
                "stage23 phase terminal output schema mismatch"
            )
        observed = after_files[expected["relativePath"]]
        identity = output["identity"]
        expected_guest_path = planned["pathFshex"]
        if (
            identity.get("pathFshex") != expected_guest_path
            or identity.get("sha256") != observed["sha256"]
            or identity.get("device") != observed["device"]
            or identity.get("inode") != observed["inode"]
            or identity.get("size") != observed["size"]
            or identity.get("mode") != (observed["mode"] | stat.S_IFREG)
            or identity.get("uid") != 1
            or identity.get("gid") != 1
            or identity.get("nlink") != 1
            or identity.get("format") != (
                "elf64-x86_64-linux"
                if expected["kind"] == "executable"
                else "regular"
            )
        ):
            raise ValidationError(
                "stage23 phase terminal output identity mismatch"
            )
        expected_terminal_outputs.append(output)
    if (
        set(value) != {"payload", "payloadSha256"}
        or set(payload) != set(binding.phase_terminal_fields)
        or payload.get("schema") != binding.phase_terminal_schema
        or payload.get("status") != "PROVED"
        or payload.get("lane") != "linux"
        or payload.get("phaseIndex") != binding.phase_index
        or payload.get("phaseLabel") != binding.phase_label
        or payload.get("stageInputManifestSha256")
            != binding.execution_manifest.sha256
        or payload.get("phasePlanSha256") != binding.plan_sha256
        or payload.get("runnerArgvSha256")
            != binding.runner_argv_sha256
        or payload.get("phaseEnvSha256")
            != binding.phase_env_sha256
        or payload.get("terminalRelativePath")
            != binding.terminal_relative_path
        or payload.get("declaredDeltaDirectories")
            != list(binding.expected_new_directories)
        or payload.get("declaredDeltaFiles")
            != binding.plan["declaredDeltaFiles"]
        or payload.get("declaredOutputSetSha256")
            != binding.plan["declaredOutputSetSha256"]
        or payload.get("produced") != expected_terminal_outputs
        or not isinstance(receipt_sha, str)
        or receipt_sha != sha256_bytes(canonical_json(payload))
        or target_stdout.raw != terminal.raw
        or target_stderr.raw
    ):
        raise ValidationError("stage23 phase terminal receipt mismatch")
    return terminal, {
        "pre_tree_sha256": before_sha256,
        "post_tree_sha256": after_sha,
        "declared_delta_sha256": declared_delta_sha,
        "output_set_sha256": output_set_sha,
        "output_count": str(len(outputs)),
        "terminal_receipt_sha256": str(receipt_sha),
    }


def _stable_read_held_fd(
    fd: int,
    path: Path,
    label: str,
    max_bytes: int,
) -> StableFile:
    before = os.fstat(fd)
    if not stat.S_ISREG(before.st_mode):
        raise ValidationError(f"{label} is not a regular file")
    if before.st_size < 0 or before.st_size > max_bytes:
        raise ValidationError(f"{label} exceeds its size limit")
    try:
        os.lseek(fd, 0, os.SEEK_SET)
    except OSError as exc:
        raise ValidationError(f"{label} cannot be rewound") from exc
    chunks: list[bytes] = []
    observed = 0
    while True:
        chunk = os.read(fd, min(1024 * 1024, max_bytes - observed + 1))
        if not chunk:
            break
        chunks.append(chunk)
        observed += len(chunk)
        if observed > max_bytes:
            raise ValidationError(f"{label} exceeds its size limit")
    after = os.fstat(fd)
    if _fd_stat_signature(before) != _fd_stat_signature(after):
        raise ValidationError(f"{label} changed during stable read")
    raw = b"".join(chunks)
    if len(raw) != before.st_size:
        raise ValidationError(f"{label} short read")
    return StableFile(
        path=path,
        raw=raw,
        sha256=sha256_bytes(raw),
        device=before.st_dev,
        inode=before.st_ino,
        size=before.st_size,
        mode=before.st_mode,
        uid=before.st_uid,
        gid=before.st_gid,
        mtime_ns=before.st_mtime_ns,
        ctime_ns=before.st_ctime_ns,
    )


def validate_root_readonly_manifest_path(
    path: Path,
    label: str,
) -> StableFile:
    if not path.is_absolute():
        raise ValidationError(f"{label} is not absolute")
    parts = path.parts
    if (
        not parts
        or not path.anchor
        or any(part in ("", ".", "..") for part in parts[1:])
    ):
        raise ValidationError(f"{label} path is not canonical")
    flags = os.O_RDONLY | os.O_NOFOLLOW
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    directory_flags = flags | os.O_DIRECTORY
    try:
        root_fd = os.open(path.anchor, directory_flags)
    except OSError as exc:
        raise ValidationError(
            f"{label} root cannot be opened no-follow",
        ) from exc
    open_fds = [root_fd]
    initial_stats: list[os.stat_result] = []
    try:
        component_count = len(parts)
        for index in range(component_count):
            is_terminal = index == component_count - 1
            if index > 0:
                open_flags = flags if is_terminal else directory_flags
                try:
                    next_fd = os.open(
                        parts[index],
                        open_flags,
                        dir_fd=open_fds[-1],
                    )
                except OSError as exc:
                    raise ValidationError(
                        f"{label} component cannot be opened no-follow",
                    ) from exc
                open_fds.append(next_fd)
            current_fd = open_fds[-1]
            info = os.fstat(current_fd)
            initial_stats.append(info)
            if is_terminal:
                if (
                    not stat.S_ISREG(info.st_mode)
                    or info.st_uid != 0
                    or info.st_gid != 0
                    or stat.S_IMODE(info.st_mode) != 0o444
                ):
                    raise ValidationError(
                        f"{label} is not root:root regular 0444",
                    )
            elif not stat.S_ISDIR(info.st_mode):
                raise ValidationError(
                    f"{label} ancestry is not a directory",
                )
            elif (
                info.st_uid != 0
                or info.st_gid != 0
                or stat.S_IMODE(info.st_mode) & 0o022
            ):
                raise ValidationError(
                    f"{label} has writable or non-root ancestry",
                )
            attributes = fd_xattr_names_exact(current_fd, label)
            if any(
                attribute in AUTHORITY_XATTR_NAMES
                for attribute in attributes
            ):
                raise ValidationError(
                    f"{label} path carries ACL/capability authority",
                )
        terminal = _stable_read_held_fd(
            open_fds[-1],
            path,
            label,
            64 * 1024,
        )
        for index, held_fd in enumerate(open_fds):
            current = os.fstat(held_fd)
            if (
                _fd_stat_signature(initial_stats[index])
                != _fd_stat_signature(current)
            ):
                raise ValidationError(
                    f"{label} path changed during authority audit",
                )
            if index > 0:
                try:
                    linked = os.stat(
                        parts[index],
                        dir_fd=open_fds[index - 1],
                        follow_symlinks=False,
                    )
                except OSError as exc:
                    raise ValidationError(
                        f"{label} path changed during authority audit",
                    ) from exc
                if (
                    linked.st_dev != current.st_dev
                    or linked.st_ino != current.st_ino
                    or linked.st_mode != current.st_mode
                ):
                    raise ValidationError(
                        f"{label} path changed during authority audit",
                    )
        return terminal
    finally:
        for held_fd in reversed(open_fds):
            os.close(held_fd)


def parse_delegation_manifest(
    path: Path,
    *,
    require_root_owner: bool,
) -> DelegationManifest:
    if require_root_owner:
        file = validate_root_readonly_manifest_path(
            path,
            "delegation manifest",
        )
    else:
        file = stable_read(path, "delegation manifest", 64 * 1024)
    rows = parse_kv(file.raw, DELEGATION_KEYS, "delegation manifest")
    if rows["schema"] != DELEGATION_SCHEMA or rows["status"] != "ready":
        raise ValidationError("delegation manifest schema/status mismatch")
    if require_root_owner and (
        file.uid != 0
        or file.gid != 0
        or stat.S_IMODE(file.mode) != 0o444
    ):
        raise ValidationError(
            "delegation manifest is not root:root regular 0444",
        )
    mount = fsdecode_hex(rows["cgroup_mount_path_fshex"], "cgroup mount")
    parent = fsdecode_hex(rows["parent_path_fshex"], "delegation parent")
    controller = fsdecode_hex(
        rows["controller_path_fshex"],
        "delegation controller",
    )
    for candidate, label in (
        (mount, "cgroup mount"),
        (parent, "delegation parent"),
        (controller, "delegation controller"),
    ):
        if not candidate.is_absolute():
            raise ValidationError(f"{label} is not absolute")
    if parent == mount or mount not in parent.parents:
        raise ValidationError("delegation parent is outside cgroup mount")
    if parent not in controller.parents:
        raise ValidationError("delegation controller is outside parent")
    if rows["controllers"] != "memory,pids":
        raise ValidationError("delegation controller set mismatch")
    if rows["subtree_controllers"] != "memory,pids":
        raise ValidationError("delegation subtree controller set mismatch")
    require_uint(rows["delegate_uid"], "delegate uid")
    require_uint(rows["delegate_gid"], "delegate gid")
    require_uint(rows["cgroup_mount_device"], "cgroup mount device")
    require_uint(rows["cgroup_mount_inode"], "cgroup mount inode")
    require_uint(rows["cgroup_namespace_inode"], "cgroup namespace inode")
    require_uint(rows["parent_device"], "delegation parent device")
    require_uint(rows["parent_inode"], "delegation parent inode")
    require_uint(rows["controller_device"], "delegation controller device")
    require_uint(rows["controller_inode"], "delegation controller inode")
    if not re.fullmatch(r"[0-9a-f-]{36}", rows["boot_id"]):
        raise ValidationError("delegation boot id is invalid")
    if rows["host_machine"] not in ("aarch64", "x86_64"):
        raise ValidationError("delegation host machine is unsupported")
    if not rows["kernel_release"]:
        raise ValidationError("delegation kernel release is absent")
    return DelegationManifest(
        file=file,
        rows=rows,
        mount=mount,
        parent=parent,
        controller=controller,
    )


def read_text(path: Path, label: str) -> str:
    try:
        return path.read_text(encoding="utf-8").strip()
    except OSError as exc:
        raise ValidationError(f"{label} cannot be read") from exc


def exact_uint_file(path: Path, label: str) -> int:
    return require_uint(read_text(path, label), label)


def parse_proc_cgroup(pid: int) -> str:
    value = read_text(Path(f"/proc/{pid}/cgroup"), "process cgroup")
    if "\n" in value or not value.startswith("0::/"):
        raise ValidationError("process cgroup is not a single v2 row")
    return value[3:]


def current_cgroup_namespace_inode() -> int:
    info = Path("/proc/self/ns/cgroup").stat()
    return info.st_ino


def bounded_proc_read(path: Path, label: str, max_bytes: int) -> bytes:
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0)
    fd = os.open(path, flags)
    try:
        chunks: list[bytes] = []
        observed = 0
        while True:
            chunk = os.read(fd, min(1024 * 1024, max_bytes - observed + 1))
            if not chunk:
                break
            chunks.append(chunk)
            observed += len(chunk)
            if observed > max_bytes:
                raise ValidationError(f"{label} exceeds its size limit")
    finally:
        os.close(fd)
    return b"".join(chunks)


def decode_mountinfo_path(value: str) -> Path:
    decoded = value
    for encoded, raw in (
        ("\\040", " "),
        ("\\011", "\t"),
        ("\\012", "\n"),
        ("\\134", "\\"),
    ):
        decoded = decoded.replace(encoded, raw)
    if "\\" in decoded or "\n" in decoded or "\r" in decoded:
        raise ValidationError("mountinfo path encoding is invalid")
    return Path(decoded)


def require_cgroup2_mount(path: Path) -> None:
    mountinfo = Path(f"/proc/{os.getpid()}/mountinfo")
    raw = bounded_proc_read(mountinfo, "mountinfo", 16 * 1024 * 1024)
    if bounded_proc_read(
        mountinfo,
        "mountinfo",
        16 * 1024 * 1024,
    ) != raw:
        raise ValidationError("mountinfo changed during validation")
    try:
        lines = raw.decode("utf-8", "strict").splitlines()
    except UnicodeDecodeError as exc:
        raise ValidationError("mountinfo is not UTF-8") from exc
    matches: list[str] = []
    for line in lines:
        before, separator, after = line.partition(" - ")
        left = before.split()
        right = after.split()
        if separator and len(left) >= 6 and len(right) >= 3 and \
                decode_mountinfo_path(left[4]) == path:
            matches.append(right[0])
    if matches != ["cgroup2"]:
        raise ValidationError("delegation mount is not the unique cgroup2 mount")


def fsverity_sha256(path: Path) -> str:
    if not path.is_absolute() or path.resolve(strict=True) != path:
        raise ValidationError("fs-verity path is not canonical")
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0)
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(path, flags)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode):
            raise ValidationError("fs-verity authority is not a regular file")
        digest = bytearray(4 + 64)
        struct.pack_into("=HH", digest, 0, 0, 64)
        try:
            fcntl.ioctl(fd, FS_IOC_MEASURE_VERITY, digest, True)
        except OSError as exc:
            raise ValidationError("rootfs image lacks fs-verity") from exc
        algorithm, digest_size = struct.unpack_from("=HH", digest)
        after = os.fstat(fd)
    finally:
        os.close(fd)
    stable_fields = (
        "st_dev",
        "st_ino",
        "st_mode",
        "st_uid",
        "st_gid",
        "st_nlink",
        "st_size",
        "st_mtime_ns",
        "st_ctime_ns",
    )
    if any(
        getattr(before, field) != getattr(after, field)
        for field in stable_fields
    ):
        raise ValidationError("fs-verity authority changed during measurement")
    if (
        algorithm != FS_VERITY_HASH_ALG_SHA256
        or digest_size != FS_VERITY_SHA256_BYTES
    ):
        raise ValidationError("rootfs image fs-verity algorithm drifted")
    return bytes(digest[4:4 + digest_size]).hex()


def rootfs_mount_authority(rootfs: Path) -> dict[str, Any]:
    if sys.platform != "linux" or platform.system() != "Linux":
        raise ValidationError("rootfs mount authority requires Linux")
    mountinfo = Path(f"/proc/{os.getpid()}/mountinfo")
    raw = bounded_proc_read(mountinfo, "rootfs mountinfo", 16 * 1024 * 1024)
    if bounded_proc_read(
        mountinfo, "rootfs mountinfo", 16 * 1024 * 1024
    ) != raw:
        raise ValidationError("rootfs mountinfo changed during validation")
    try:
        lines = raw.decode("utf-8", "strict").splitlines()
    except UnicodeDecodeError as exc:
        raise ValidationError("rootfs mountinfo is not UTF-8") from exc
    matches: list[tuple[list[str], list[str]]] = []
    for line in lines:
        before, separator, after = line.partition(" - ")
        left = before.split()
        right = after.split()
        if (
            separator
            and len(left) >= 6
            and len(right) >= 3
            and decode_mountinfo_path(left[4]) == rootfs
        ):
            matches.append((left, right))
    if len(matches) != 1:
        raise ValidationError("rootfs is not a unique mountpoint")
    left, right = matches[0]
    mount_options = left[5].split(",")
    super_options = right[2].split(",")
    if (
        "ro" not in mount_options
        or "rw" in mount_options
        or "nosuid" not in mount_options
        or "nodev" not in mount_options
        or "ro" not in super_options
        or "rw" in super_options
        or right[0] != "ext4"
        or decode_mountinfo_path(left[3]) != Path("/")
    ):
        raise ValidationError("rootfs mount is not the exact read-only ext4 authority")
    source = decode_mountinfo_path(right[1])
    if not source.is_absolute() or source.resolve(strict=True) != source:
        raise ValidationError("rootfs mount source is not canonical")
    source_info = os.stat(source, follow_symlinks=False)
    if (
        not stat.S_ISBLK(source_info.st_mode)
        or source_info.st_uid != 0
        or source_info.st_mode & stat.S_IWOTH
        or (
            os.geteuid() != 0
            and os.access(source, os.W_OK, effective_ids=True)
        )
    ):
        raise ValidationError("rootfs loop source is writable or non-root")
    source_device = f"{os.major(source_info.st_rdev)}:{os.minor(source_info.st_rdev)}"
    if source_device != left[2]:
        raise ValidationError("rootfs loop and mount devices differ")
    loop_readonly = read_text(
        Path(f"/sys/dev/block/{source_device}/ro"),
        "rootfs loop read-only state",
    )
    if loop_readonly != "1":
        raise ValidationError("rootfs loop device is writable")
    loop_directory = Path(f"/sys/dev/block/{source_device}/loop")
    backing_raw = read_text(
        loop_directory / "backing_file",
        "rootfs loop backing file",
    )
    if "\\" in backing_raw or "\x00" in backing_raw:
        raise ValidationError("rootfs loop backing path is escaped")
    backing = Path(backing_raw)
    if not backing.is_absolute() or backing.resolve(strict=True) != backing:
        raise ValidationError("rootfs loop backing path is not canonical")
    backing_info = os.stat(backing, follow_symlinks=False)
    if (
        not stat.S_ISREG(backing_info.st_mode)
        or stat.S_IMODE(backing_info.st_mode) != 0o444
        or backing_info.st_uid != 0
        or backing_info.st_gid != 0
        or backing_info.st_nlink != 1
        or backing_info.st_size <= 0
        or (
            os.geteuid() != 0
            and os.access(backing, os.W_OK, effective_ids=True)
        )
    ):
        raise ValidationError("rootfs loop backing file is mutable")
    backing_ancestor = backing.parent
    while True:
        info = os.stat(backing_ancestor, follow_symlinks=False)
        if (
            info.st_uid != 0
            or info.st_gid != 0
            or info.st_mode & (stat.S_IWGRP | stat.S_IWOTH)
        ):
            raise ValidationError("rootfs backing ancestry is mutable")
        if backing_ancestor == Path("/"):
            break
        backing_ancestor = backing_ancestor.parent
    loop_offset = exact_uint_file(
        loop_directory / "offset",
        "rootfs loop offset",
    )
    loop_size_limit = exact_uint_file(
        loop_directory / "sizelimit",
        "rootfs loop size limit",
    )
    if loop_offset != 0 or loop_size_limit != 0:
        raise ValidationError("rootfs loop does not cover the exact image")
    backing_fsverity_sha256 = fsverity_sha256(backing)
    ancestor = rootfs.parent
    while True:
        info = os.stat(ancestor, follow_symlinks=False)
        if (
            info.st_uid != 0
            or info.st_gid != 0
            or info.st_mode & (stat.S_IWGRP | stat.S_IWOTH)
        ):
            raise ValidationError("rootfs mount ancestry is mutable")
        if ancestor == Path("/"):
            break
        ancestor = ancestor.parent
    rootfs_info = os.stat(rootfs, follow_symlinks=False)
    return {
        "mountId": require_uint(left[0], "rootfs mount id"),
        "parentMountId": require_uint(left[1], "rootfs parent mount id"),
        "mountDevice": left[2],
        "mountRootFshex": os.fsencode(str(decode_mountinfo_path(left[3]))).hex(),
        "mountPointFshex": os.fsencode(str(rootfs)).hex(),
        "mountOptions": mount_options,
        "filesystemType": right[0],
        "mountSourceFshex": os.fsencode(str(source)).hex(),
        "superOptions": super_options,
        "rootfsDevice": rootfs_info.st_dev,
        "rootfsInode": rootfs_info.st_ino,
        "sourceRdev": source_info.st_rdev,
        "sourceMode": stat.S_IMODE(source_info.st_mode),
        "sourceUid": source_info.st_uid,
        "sourceGid": source_info.st_gid,
        "loopReadOnly": True,
        "loopOffset": loop_offset,
        "loopSizeLimit": loop_size_limit,
        "backingFileFshex": os.fsencode(str(backing)).hex(),
        "backingDevice": backing_info.st_dev,
        "backingInode": backing_info.st_ino,
        "backingMode": stat.S_IMODE(backing_info.st_mode),
        "backingUid": backing_info.st_uid,
        "backingGid": backing_info.st_gid,
        "backingNlink": backing_info.st_nlink,
        "backingSize": backing_info.st_size,
        "backingFsveritySha256": backing_fsverity_sha256,
    }


def normalized_machine(value: str) -> str:
    result = {
        "amd64": "x86_64",
        "x86_64": "x86_64",
        "arm64": "aarch64",
        "aarch64": "aarch64",
    }.get(value.lower())
    if result is None:
        raise ValidationError("host machine is unsupported")
    return result


def validate_live_delegation(
    manifest: DelegationManifest,
    parent_argument: Path,
) -> None:
    if platform.system() != "Linux":
        raise ValidationError("native Linux host is required")
    if os.geteuid() == 0:
        raise ValidationError("root execution is forbidden")
    if parent_argument != manifest.parent:
        raise ValidationError("delegation parent argument mismatch")
    if parent_argument.resolve(strict=True) != parent_argument:
        raise ValidationError("delegation parent is not canonical")
    require_cgroup2_mount(manifest.mount)
    mount_info = os.stat(manifest.mount, follow_symlinks=False)
    parent_info = os.stat(manifest.parent, follow_symlinks=False)
    controller_info = os.stat(
        manifest.controller, follow_symlinks=False
    )
    expected = (
        (mount_info, "cgroup_mount", manifest.rows),
        (parent_info, "parent", manifest.rows),
        (controller_info, "controller", manifest.rows),
    )
    for info, prefix, rows in expected:
        if info.st_dev != require_uint(rows[f"{prefix}_device"], prefix + " device"):
            raise ValidationError(f"{prefix} device drift")
        if info.st_ino != require_uint(rows[f"{prefix}_inode"], prefix + " inode"):
            raise ValidationError(f"{prefix} inode drift")
    if parent_info.st_uid != os.geteuid() or (
        parent_info.st_mode & (stat.S_IWGRP | stat.S_IWOTH)
    ):
        raise ValidationError("delegation parent ownership/mode mismatch")
    if (
        require_uint(manifest.rows["delegate_uid"], "delegate uid")
        != os.geteuid()
        or require_uint(manifest.rows["delegate_gid"], "delegate gid")
        != os.getegid()
    ):
        raise ValidationError("delegated user identity mismatch")
    if current_cgroup_namespace_inode() != require_uint(
        manifest.rows["cgroup_namespace_inode"],
        "cgroup namespace inode",
    ):
        raise ValidationError("cgroup namespace identity drift")
    if read_text(Path("/proc/sys/kernel/random/boot_id"), "boot id") != \
            manifest.rows["boot_id"]:
        raise ValidationError("host boot identity drift")
    if os.uname().release != manifest.rows["kernel_release"]:
        raise ValidationError("kernel release drift")
    if normalized_machine(os.uname().machine) != manifest.rows["host_machine"]:
        raise ValidationError("host machine drift")
    if read_text(manifest.parent / "cgroup.type", "parent cgroup type") != "domain":
        raise ValidationError("delegation parent is not a domain cgroup")
    controllers = set(
        read_text(
            manifest.parent / "cgroup.controllers",
            "parent controllers",
        ).split()
    )
    subtree = set(
        read_text(
            manifest.parent / "cgroup.subtree_control",
            "parent subtree controls",
        ).split()
    )
    required = {"memory", "pids"}
    if not required.issubset(controllers) or not required.issubset(subtree):
        raise ValidationError("delegated controllers are incomplete")
    if read_text(manifest.parent / "cgroup.procs", "parent processes") != "":
        raise ValidationError("delegation parent contains internal processes")
    self_path = manifest.mount / parse_proc_cgroup(os.getpid()).lstrip("/")
    if self_path != manifest.controller and manifest.controller not in self_path.parents:
        raise ValidationError("validator process is outside delegated controller branch")
    for relative in (
        "cgroup.procs",
        "cgroup.threads",
        "cgroup.subtree_control",
    ):
        candidate = manifest.parent / relative
        info = os.stat(candidate, follow_symlinks=False)
        if info.st_uid != os.geteuid() or not os.access(candidate, os.W_OK):
            raise ValidationError("delegation control file is not writable")


def validate_rootfs_manifest(
    path: Path,
    rootfs_argument: Path,
    crun_sha256: str,
    *,
    verify_tree: bool,
) -> RootfsManifest:
    value, file = read_json_file(path, "rootfs manifest")
    required = {
        "schema",
        "status",
        "rootfsPathFshex",
        "crunSha256",
        "treeCid",
        "entryCount",
        "entries",
        "delegateUid",
        "delegateGid",
        "mountAuthority",
        "manifestSha256",
    }
    if set(value) != required:
        raise ValidationError("rootfs manifest fields mismatch")
    claimed = value["manifestSha256"]
    if not isinstance(claimed, str):
        raise ValidationError("rootfs manifest hash type mismatch")
    require_sha(claimed, "rootfs manifest payload")
    payload = dict(value)
    del payload["manifestSha256"]
    if sha256_bytes(canonical_json(payload)) != claimed:
        raise ValidationError("rootfs manifest payload hash mismatch")
    if value["schema"] != ROOTFS_SCHEMA or value["status"] != "ready":
        raise ValidationError("rootfs manifest schema/status mismatch")
    rootfs = fsdecode_hex(
        str(value["rootfsPathFshex"]),
        "rootfs path",
    )
    if rootfs != rootfs_argument or rootfs.resolve(strict=True) != rootfs:
        raise ValidationError("rootfs path mismatch")
    if not rootfs.is_dir() or rootfs.is_symlink():
        raise ValidationError("rootfs is not a canonical directory")
    delegate_uid = require_uint(str(value["delegateUid"]), "rootfs delegate uid")
    delegate_gid = require_uint(str(value["delegateGid"]), "rootfs delegate gid")
    if delegate_uid <= 0 or delegate_gid <= 0:
        raise ValidationError("rootfs delegate identity is not unprivileged")
    mount_authority = value["mountAuthority"]
    if not isinstance(mount_authority, dict) or \
            rootfs_mount_authority(rootfs) != mount_authority:
        raise ValidationError("rootfs read-only mount authority drifted")
    manifest_crun = str(value["crunSha256"])
    require_sha(manifest_crun, "rootfs manifest crun")
    if manifest_crun != crun_sha256:
        raise ValidationError("rootfs manifest crun identity mismatch")
    entries = value["entries"]
    if not isinstance(entries, list) or not entries:
        raise ValidationError("rootfs manifest entries are absent")
    if value["entryCount"] != len(entries):
        raise ValidationError("rootfs manifest entry count mismatch")
    tree_cid = str(value["treeCid"])
    require_sha(tree_cid, "rootfs tree CID")
    if not verify_tree:
        required_entries = {
            os.fsencode(required_path).hex()
            for required_path in ("bin/sh", "bin/dd")
        }
        observed_required = {
            entry.get("pathFshex")
            for entry in entries
            if isinstance(entry, dict) and entry.get("kind") == "file"
        }
        if not required_entries.issubset(observed_required):
            raise ValidationError("rootfs required executable is absent")
        return RootfsManifest(
            file=file,
            rootfs=rootfs,
            tree_cid=tree_cid,
            crun_sha256=manifest_crun,
            entry_count=len(entries),
            delegate_uid=delegate_uid,
            delegate_gid=delegate_gid,
            mount_authority=mount_authority,
        )
    canonical_entries: list[dict[str, Any]] = []
    previous = ""
    for entry in entries:
        if not isinstance(entry, dict) or set(entry) != {
            "pathFshex",
            "kind",
            "mode",
            "size",
            "sha256",
            "linkTargetFshex",
            "uid",
            "gid",
        }:
            raise ValidationError("rootfs manifest entry shape mismatch")
        path_hex = entry["pathFshex"]
        if not isinstance(path_hex, str) or path_hex <= previous:
            raise ValidationError("rootfs manifest paths are not strictly sorted")
        previous = path_hex
        relative = fsdecode_hex(path_hex, "rootfs entry")
        if relative.is_absolute() or ".." in relative.parts or "." in relative.parts:
            raise ValidationError("rootfs manifest path escapes root")
        kind = entry["kind"]
        if kind not in ("file", "directory"):
            raise ValidationError("rootfs manifest kind is unsupported")
        if not isinstance(entry["mode"], int) or not isinstance(entry["size"], int):
            raise ValidationError("rootfs manifest numeric field type mismatch")
        if entry["uid"] != delegate_uid or entry["gid"] != delegate_gid:
            raise ValidationError("rootfs entry is outside delegated uid/gid mapping")
        if not isinstance(entry["sha256"], str) or not isinstance(
            entry["linkTargetFshex"],
            str,
        ):
            raise ValidationError("rootfs manifest identity type mismatch")
        candidate = rootfs / relative
        if verify_tree:
            info = candidate.lstat()
            if stat.S_IMODE(info.st_mode) != entry["mode"]:
                raise ValidationError("rootfs entry mode drift")
            if info.st_uid != entry["uid"] or info.st_gid != entry["gid"]:
                raise ValidationError("rootfs entry ownership drift")
            if kind == "file":
                current = stable_read(
                    candidate,
                    "rootfs entry",
                    2 * 1024 * 1024 * 1024,
                )
                if current.size != entry["size"] or current.sha256 != entry["sha256"]:
                    raise ValidationError("rootfs file identity drift")
                if entry["linkTargetFshex"] != "":
                    raise ValidationError("rootfs file carries link target")
            elif kind == "directory":
                if not stat.S_ISDIR(info.st_mode) or entry["size"] != 0 or \
                        entry["sha256"] != ZERO_SHA256 or \
                        entry["linkTargetFshex"] != "":
                    raise ValidationError("rootfs directory identity drift")
        canonical_entries.append(entry)
    if verify_tree:
        observed_paths: set[str] = set()
        pending = [rootfs]
        while pending:
            directory = pending.pop()
            with os.scandir(directory) as iterator:
                children = sorted(iterator, key=lambda item: os.fsencode(item.name))
            for child in children:
                candidate = Path(child.path)
                relative = candidate.relative_to(rootfs)
                relative_hex = os.fsencode(str(relative)).hex()
                if child.is_symlink():
                    raise ValidationError("rootfs symlink is forbidden")
                if relative_hex in observed_paths:
                    raise ValidationError("rootfs path is duplicated")
                observed_paths.add(relative_hex)
                if child.is_dir(follow_symlinks=False):
                    pending.append(candidate)
                elif not child.is_file(follow_symlinks=False):
                    raise ValidationError("rootfs special file is forbidden")
        manifest_paths = {str(entry["pathFshex"]) for entry in canonical_entries}
        if observed_paths != manifest_paths:
            raise ValidationError("rootfs manifest does not enumerate the exact tree")
    if sha256_bytes(canonical_json(canonical_entries)) != tree_cid:
        raise ValidationError("rootfs tree CID mismatch")
    for required_path in ("bin/sh", "bin/dd"):
        required_hex = os.fsencode(required_path).hex()
        if not any(
            entry["pathFshex"] == required_hex and entry["kind"] == "file"
            for entry in entries
        ):
            raise ValidationError(f"rootfs required executable absent: {required_path}")
    return RootfsManifest(
        file=file,
        rootfs=rootfs,
        tree_cid=tree_cid,
        crun_sha256=manifest_crun,
        entry_count=len(entries),
        delegate_uid=delegate_uid,
        delegate_gid=delegate_gid,
        mount_authority=mount_authority,
    )


def parse_self_hashed_json(
    path: Path,
    schema: str,
    fields: frozenset[str],
    label: str,
) -> tuple[dict[str, Any], StableFile]:
    value, file = read_json_file(path, label)
    if set(value) != fields or value.get("schema") != schema:
        raise ValidationError(f"{label} schema/fields mismatch")
    claimed = value.get("receiptSha256")
    if not isinstance(claimed, str):
        raise ValidationError(f"{label} receipt hash type mismatch")
    require_sha(claimed, f"{label} receipt hash")
    payload = dict(value)
    del payload["receiptSha256"]
    if sha256_bytes(canonical_json(payload)) != claimed:
        raise ValidationError(f"{label} receipt hash mismatch")
    return value, file


def parse_memory_events(path: Path) -> dict[str, int]:
    result: dict[str, int] = {}
    for row in read_text(path, "local memory events").splitlines():
        parts = row.split()
        if len(parts) != 2 or parts[0] in result or not parts[1].isdigit():
            raise ValidationError("local memory events row invalid")
        result[parts[0]] = int(parts[1])
    expected = {"low", "high", "max", "oom", "oom_kill", "oom_group_kill"}
    if set(result) != expected:
        raise ValidationError("local memory event keys mismatch")
    return result


def pid_starttime(pid: int) -> int:
    raw = read_text(Path(f"/proc/{pid}/stat"), "process stat")
    close = raw.rfind(")")
    if close < 0:
        raise ValidationError("process stat comm is malformed")
    fields = raw[close + 2:].split()
    if len(fields) < 20 or not fields[19].isdigit():
        raise ValidationError("process starttime is absent")
    return int(fields[19])


def pid_status(pid: int) -> dict[str, str]:
    result: dict[str, str] = {}
    for row in Path(f"/proc/{pid}/status").read_text(
        encoding="utf-8",
    ).splitlines():
        key, separator, value = row.partition(":")
        if separator:
            result[key] = value.strip()
    return result


def elf_identity(path: Path) -> tuple[str, str]:
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0)
    fd = os.open(path, flags)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or \
                before.st_size > 2 * 1024 * 1024 * 1024:
            raise ValidationError("running target executable type/size mismatch")
        chunks: list[bytes] = []
        remaining = before.st_size
        while remaining:
            chunk = os.read(fd, min(1024 * 1024, remaining))
            if not chunk:
                raise ValidationError("running target executable short read")
            chunks.append(chunk)
            remaining -= len(chunk)
        after = os.fstat(fd)
    finally:
        os.close(fd)
    if (
        before.st_dev,
        before.st_ino,
        before.st_size,
        before.st_mtime_ns,
        before.st_ctime_ns,
    ) != (
        after.st_dev,
        after.st_ino,
        after.st_size,
        after.st_mtime_ns,
        after.st_ctime_ns,
    ):
        raise ValidationError("running target executable changed during read")
    raw = b"".join(chunks)
    if len(raw) < 20 or raw[:4] != b"\x7fELF" or raw[4] != 2:
        raise ValidationError("running target is not ELF64")
    if raw[5] not in (1, 2):
        raise ValidationError("running target ELF byte order is invalid")
    byte_order = "little" if raw[5] == 1 else "big"
    machine = {
        62: "x86_64",
        183: "aarch64",
    }.get(int.from_bytes(raw[18:20], byte_order))
    if machine is None:
        raise ValidationError("running target ELF machine is unsupported")
    return sha256_bytes(raw), machine


def cgroup_processes(leaf: Path) -> list[int]:
    values: list[int] = []
    for row in read_text(leaf / "cgroup.procs", "leaf processes").splitlines():
        if not row.isdigit():
            raise ValidationError("leaf process row is invalid")
        values.append(int(row))
    if len(values) != len(set(values)):
        raise ValidationError("leaf process list contains duplicates")
    return sorted(values)


def map_namespace_pids(
    procs: Sequence[int],
    namespace_pids: Sequence[int],
    init_pid: int,
) -> tuple[list[dict[str, int]], dict[int, dict[str, str]]]:
    statuses: dict[int, dict[str, str]] = {}
    by_namespace: dict[int, int] = {}
    mapping: list[dict[str, int]] = []
    for host_pid in procs:
        status = pid_status(host_pid)
        statuses[host_pid] = status
        nspid = status.get("NSpid", "")
        values = [int(value) for value in nspid.split() if value.isdigit()]
        if not values:
            raise ValidationError("process namespace PID identity is absent")
        namespace_pid = values[-1]
        if namespace_pid in by_namespace:
            raise ValidationError("namespace PID mapping is ambiguous")
        by_namespace[namespace_pid] = host_pid
    for namespace_pid in namespace_pids:
        host_pid = by_namespace.get(namespace_pid)
        if host_pid is None:
            raise ValidationError("named namespace PID is outside leaf")
        mapping.append({
            "namespacePid": namespace_pid,
            "hostPid": host_pid,
            "starttime": pid_starttime(host_pid),
        })
    known = set(procs)
    for host_pid, status in statuses.items():
        ppid_text = status.get("PPid", "")
        if not ppid_text.isdigit():
            raise ValidationError("process parent PID is absent")
        ppid = int(ppid_text)
        if host_pid != init_pid and ppid not in known:
            raise ValidationError("leaf descendant has parent outside leaf")
    return mapping, statuses


def live_snapshot(
    *,
    phase: str,
    mode: str,
    session_nonce: str,
    runtime_id: str,
    manifest: DelegationManifest,
    parent: Path,
    leaf: Path,
    init_host_pid: int,
    namespace_pids: Sequence[int],
    expected_driver_sha256: str,
    expected_machine: str,
    runtime_state_root: Path,
    pid_file: Path,
) -> dict[str, Any]:
    if phase not in ("before", "during", "after", "cleanup"):
        raise ValidationError("live phase is invalid")
    if mode not in ("workload", "aggregate_oom_probe"):
        raise ValidationError("live mode is invalid")
    if not NONCE_RE.fullmatch(session_nonce) or not RUNTIME_ID_RE.fullmatch(runtime_id):
        raise ValidationError("live session identity is invalid")
    validate_live_delegation(manifest, parent)
    parent_info = os.stat(parent, follow_symlinks=False)
    leaf_exists = os.path.lexists(leaf)
    if phase == "cleanup":
        if leaf_exists or os.path.lexists(runtime_state_root) or os.path.lexists(pid_file):
            raise ValidationError("live cleanup did not prove absence")
        return {
            "schema": LIVE_SCHEMA,
            "phase": phase,
            "mode": mode,
            "sessionNonce": session_nonce,
            "runtimeId": runtime_id,
            "parentPathFshex": os.fsencode(str(parent)).hex(),
            "parentDevice": parent_info.st_dev,
            "parentInode": parent_info.st_ino,
            "leafPathFshex": os.fsencode(str(leaf)).hex(),
            "leafExists": False,
            "leafDevice": 0,
            "leafInode": 0,
            "initHostPid": init_host_pid,
            "initHostPidStarttime": 0,
            "cgroupProcs": [],
            "namespacePidMap": [],
            "memoryMax": LIMIT_BYTES,
            "memorySwapMax": SWAP_MAX_BYTES,
            "memorySwapCurrent": 0,
            "memoryCurrent": 0,
            "memoryPeak": 0,
            "pidsMax": PIDS_MAX,
            "oomGroup": 1,
            "eventsLocal": {
                "low": 0,
                "high": 0,
                "max": 0,
                "oom": 0,
                "oom_kill": 0,
                "oom_group_kill": 0,
            },
            "hostMachine": normalized_machine(os.uname().machine),
            "kernelRelease": os.uname().release,
            "targetExeSha256": ZERO_SHA256,
            "targetElfMachine": "",
            "runtimeStateAbsent": True,
            "pidFileAbsent": True,
        }
    if not leaf_exists or leaf.resolve(strict=True) != leaf:
        raise ValidationError("live leaf is absent or noncanonical")
    if parent not in leaf.parents or leaf.parent != parent:
        raise ValidationError("live leaf is outside delegated parent")
    leaf_info = os.stat(leaf, follow_symlinks=False)
    if read_text(leaf / "cgroup.type", "leaf cgroup type") != "domain":
        raise ValidationError("live leaf is not a domain cgroup")
    if exact_uint_file(leaf / "memory.max", "leaf memory max") != LIMIT_BYTES:
        raise ValidationError("live leaf memory max mismatch")
    if exact_uint_file(leaf / "memory.swap.max", "leaf swap max") != SWAP_MAX_BYTES:
        raise ValidationError("live leaf swap max mismatch")
    if exact_uint_file(leaf / "pids.max", "leaf pids max") != PIDS_MAX:
        raise ValidationError("live leaf pids max mismatch")
    if exact_uint_file(leaf / "memory.oom.group", "leaf oom group") != 1:
        raise ValidationError("live leaf oom group mismatch")
    procs = cgroup_processes(leaf)
    starttime = 0
    mapping: list[dict[str, int]] = []
    target_sha = ZERO_SHA256
    target_machine = ""
    if phase == "before":
        if procs != [init_host_pid]:
            raise ValidationError("created init is not the sole leaf process")
        starttime = pid_starttime(init_host_pid)
        init_status = pid_status(init_host_pid)
        init_nspid = [
            int(value)
            for value in init_status.get("NSpid", "").split()
            if value.isdigit()
        ]
        if not init_nspid:
            raise ValidationError("created init namespace PID is absent")
        mapping = [{
            "namespacePid": init_nspid[-1],
            "hostPid": init_host_pid,
            "starttime": starttime,
        }]
    elif phase == "during":
        if init_host_pid not in procs:
            raise ValidationError("container init escaped before during audit")
        starttime = pid_starttime(init_host_pid)
        mapping, _statuses = map_namespace_pids(
            procs,
            namespace_pids,
            init_host_pid,
        )
        if mode == "workload":
            if len(mapping) != 1 or len(procs) != 4:
                raise ValidationError("workload target PID count mismatch")
            target_sha, target_machine = elf_identity(
                Path(f"/proc/{mapping[0]['hostPid']}/exe"),
            )
            if target_sha != expected_driver_sha256:
                raise ValidationError("running target identity mismatch")
            if target_machine != expected_machine:
                raise ValidationError("running target machine mismatch")
        elif len(mapping) != ATTACK_CHILD_COUNT or len(procs) != 3:
            raise ValidationError("attack PID count mismatch")
    else:
        if mode == "workload":
            if init_host_pid not in procs or len(procs) != 3:
                raise ValidationError("workload after audit has stray descendants")
            starttime = pid_starttime(init_host_pid)
            init_status = pid_status(init_host_pid)
            init_nspid = [
                int(value)
                for value in init_status.get("NSpid", "").split()
                if value.isdigit()
            ]
            if not init_nspid:
                raise ValidationError("workload init namespace PID is absent")
            mapping, _statuses = map_namespace_pids(
                procs,
                (init_nspid[-1],),
                init_host_pid,
            )
        elif procs:
            raise ValidationError("oom-group attack left live processes")
    events = parse_memory_events(leaf / "memory.events.local")
    if phase in ("before", "during") and any(events.values()):
        raise ValidationError("fresh/during leaf has memory events")
    if phase == "after" and mode == "workload" and any(events.values()):
        raise ValidationError("successful workload has memory events")
    if phase == "after" and mode == "aggregate_oom_probe":
        if events["max"] <= 0 or events["oom"] <= 0 or \
                events["oom_kill"] <= 0 or events["oom_group_kill"] <= 0:
            raise ValidationError("aggregate attack lacks local kernel OOM proof")
    return {
        "schema": LIVE_SCHEMA,
        "phase": phase,
        "mode": mode,
        "sessionNonce": session_nonce,
        "runtimeId": runtime_id,
        "parentPathFshex": os.fsencode(str(parent)).hex(),
        "parentDevice": parent_info.st_dev,
        "parentInode": parent_info.st_ino,
        "leafPathFshex": os.fsencode(str(leaf)).hex(),
        "leafExists": True,
        "leafDevice": leaf_info.st_dev,
        "leafInode": leaf_info.st_ino,
        "initHostPid": init_host_pid,
        "initHostPidStarttime": starttime,
        "cgroupProcs": procs,
        "namespacePidMap": mapping,
        "memoryMax": exact_uint_file(leaf / "memory.max", "leaf memory max"),
        "memorySwapMax": exact_uint_file(
            leaf / "memory.swap.max",
            "leaf swap max",
        ),
        "memorySwapCurrent": exact_uint_file(
            leaf / "memory.swap.current",
            "leaf swap current",
        ),
        "memoryCurrent": exact_uint_file(
            leaf / "memory.current",
            "leaf memory current",
        ),
        "memoryPeak": exact_uint_file(leaf / "memory.peak", "leaf memory peak"),
        "pidsMax": exact_uint_file(leaf / "pids.max", "leaf pids max"),
        "oomGroup": exact_uint_file(
            leaf / "memory.oom.group",
            "leaf oom group",
        ),
        "eventsLocal": events,
        "hostMachine": normalized_machine(os.uname().machine),
        "kernelRelease": os.uname().release,
        "targetExeSha256": target_sha,
        "targetElfMachine": target_machine,
        "runtimeStateAbsent": False,
        "pidFileAbsent": False,
    }


def write_self_hashed_json(path: Path, value: dict[str, Any]) -> None:
    payload = dict(value)
    payload["receiptSha256"] = sha256_bytes(canonical_json(value))
    raw = canonical_json(payload) + b"\n"
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_CLOEXEC", 0)
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(path, flags, 0o400)
    try:
        os.write(fd, raw)
        os.fsync(fd)
    finally:
        os.close(fd)


def parse_build_receipt(path: Path) -> tuple[dict[str, str], StableFile]:
    file = stable_read(path, "current build receipt", 4 * 1024 * 1024)
    if not file.raw.endswith(b"\n"):
        raise ValidationError("current build receipt lacks terminal newline")
    rows: dict[str, str] = {}
    for row in file.raw.decode("utf-8", "strict").splitlines():
        key, separator, value = row.partition("=")
        if not separator or key in rows:
            raise ValidationError("current build receipt row invalid")
        rows[key] = value
    payload = rows.get("receipt_payload_sha256", "")
    require_sha(payload, "current build receipt payload")
    suffix = f"receipt_payload_sha256={payload}\n".encode("utf-8")
    if not file.raw.endswith(suffix) or sha256_bytes(
        file.raw[:-len(suffix)],
    ) != payload:
        raise ValidationError("current build receipt payload mismatch")
    if tuple(rows) != BUILD_RECEIPT_KEY_ORDER:
        raise ValidationError("current build receipt exact field order mismatch")
    return rows, file


def load_closure_builder(
    workspace_root: Path,
    expected_sha256: str,
) -> Any:
    require_sha(expected_sha256, "source closure builder SHA-256")
    path = workspace_root / "tools/current_source_closure_manifest.py"
    before = stable_read(path, "source closure builder", 4 * 1024 * 1024)
    if before.sha256 != expected_sha256:
        raise ValidationError("source closure builder identity mismatch")
    spec = importlib.util.spec_from_file_location(
        "cheng_native_hard_memory_source_closure",
        path,
    )
    if spec is None or spec.loader is None:
        raise ValidationError("source closure builder cannot be loaded")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    after = stable_read(path, "source closure builder", 4 * 1024 * 1024)
    if before != after or not callable(getattr(module, "build_manifest", None)) or \
            not callable(getattr(module, "content_cid_from_manifest", None)):
        raise ValidationError("source closure builder drift/API mismatch")
    return module


def load_candidate_validator(
    workspace_root: Path,
    expected_sha256: str,
) -> Any:
    require_sha(expected_sha256, "candidate validator SHA-256")
    path = workspace_root / "tools/cid_linux_current_source_candidate_validate.py"
    before = stable_read(path, "candidate validator", 16 * 1024 * 1024)
    if before.sha256 != expected_sha256:
        raise ValidationError("candidate validator identity mismatch")
    spec = importlib.util.spec_from_file_location(
        "cheng_native_hard_memory_candidate_validator",
        path,
    )
    if spec is None or spec.loader is None:
        raise ValidationError("candidate validator cannot be loaded")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    after = stable_read(path, "candidate validator", 16 * 1024 * 1024)
    required = (
        "parse_frozen_manifest",
        "split_binary_bundle",
        "parse_report",
        "parse_kv",
        "validate_two_stage_manifest",
        "validate_candidate",
    )
    if before != after or any(
        not callable(getattr(module, name, None)) for name in required
    ):
        raise ValidationError("candidate validator drift/API mismatch")
    return module


def receipt_bound_file(
    rows: dict[str, str],
    path_key: str,
    sha_key: str,
    size_key: str | None,
    label: str,
) -> StableFile:
    path = fsdecode_hex(rows[path_key], label + " path")
    file = stable_read(path, label, 2 * 1024 * 1024 * 1024)
    if file.sha256 != rows[sha_key]:
        raise ValidationError(f"{label} SHA-256 mismatch")
    if size_key is not None and file.size != require_uint(
        rows[size_key],
        label + " size",
    ):
        raise ValidationError(f"{label} size mismatch")
    return file


def validate_build_artifacts(
    rows: dict[str, str],
    workspace_root: Path,
    source: StableFile,
    driver: StableFile,
    elf_machine: int,
) -> None:
    sha_keys = {
        key for key in BUILD_RECEIPT_KEYS
        if key.endswith("_sha256") or key.endswith("_cid")
    }
    for key in sha_keys:
        require_sha(rows[key], "current build " + key)
    uint_keys = {
        "bundle_size", "candidate_manifest_size", "candidate_report_size",
        "worker_size", "worker_device", "worker_inode", "worker_mode",
        "worker_mtime_ns", "worker_ctime_ns", "worker_elf_machine",
        "candidate_build_argv_count", "candidate_build_env_count",
    }
    for key in uint_keys:
        require_uint(rows[key], "current build " + key)
    if rows["candidate_build_argv_encoding"] != FRAMED_SEQUENCE_ENCODING or \
            rows["candidate_build_env_encoding"] != FRAMED_SEQUENCE_ENCODING:
        raise ValidationError("current build sequence encoding mismatch")
    image_values = (
        rows["builder_image_id"],
        rows["builder_image_config_digest"],
        rows["builder_image_oci_manifest_digest"],
    )
    if any(not re.fullmatch(r"sha256:[0-9a-f]{64}", value)
           for value in image_values):
        raise ValidationError("current build image provenance identity mismatch")
    frozen = receipt_bound_file(
        rows,
        "frozen_manifest_path_fshex",
        "frozen_manifest_sha256",
        None,
        "frozen source/tool manifest",
    )
    report = receipt_bound_file(
        rows,
        "builder_report_path_fshex",
        "builder_report_sha256",
        None,
        "builder report",
    )
    bundle = receipt_bound_file(
        rows,
        "bundle_path_fshex",
        "bundle_sha256",
        "bundle_size",
        "candidate bundle",
    )
    candidate_manifest = receipt_bound_file(
        rows,
        "candidate_manifest_path_fshex",
        "candidate_manifest_sha256",
        "candidate_manifest_size",
        "candidate manifest",
    )
    candidate_report = receipt_bound_file(
        rows,
        "candidate_report_path_fshex",
        "candidate_report_sha256",
        "candidate_report_size",
        "candidate report",
    )
    worker_path = fsdecode_hex(rows["worker_path_fshex"], "worker path")
    if worker_path != driver.path:
        raise ValidationError("current build worker path mismatch")
    release_source = fsdecode_hex(
        rows["release_source_closure_path_fshex"],
        "release source closure path",
    )
    if release_source != source.path:
        raise ValidationError("current build source closure path mismatch")
    canonical = load_candidate_validator(
        workspace_root,
        rows["validator_sha256"],
    )
    try:
        frozen_value = canonical.parse_frozen_manifest(frozen.raw)
        bundle_rows, manifest_raw, report_raw, worker_raw = \
            canonical.split_binary_bundle(bundle.raw)
        manifest_rows = canonical.parse_kv(
            manifest_raw,
            canonical.MANIFEST_KEYS,
            "candidate manifest",
        )
        canonical.parse_report(report_raw)
        canonical.validate_two_stage_manifest(manifest_rows)
        canonical.validate_candidate(driver.raw, elf_machine)
    except Exception as exc:
        raise ValidationError("canonical candidate artifacts rejected") from exc
    if manifest_raw != candidate_manifest.raw or \
            report_raw != candidate_report.raw or worker_raw != driver.raw:
        raise ValidationError("candidate bundle projection mismatch")
    bundle_expected = {
        "manifest_size": str(candidate_manifest.size),
        "manifest_sha256": candidate_manifest.sha256,
        "report_size": str(candidate_report.size),
        "report_sha256": candidate_report.sha256,
        "candidate_size": str(driver.size),
        "candidate_sha256": driver.sha256,
    }
    if bundle_rows != bundle_expected:
        raise ValidationError("candidate bundle header mismatch")
    if frozen_value["sourceClosureSha256"] != \
            rows["frozen_source_closure_sha256"] or \
            frozen_value["toolClosureSha256"] != \
            rows["frozen_tool_closure_sha256"]:
        raise ValidationError("frozen closure receipt mismatch")
    try:
        report_value = json.loads(report.raw.decode("utf-8", "strict"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValidationError("builder report is not JSON") from exc
    if not isinstance(report_value, dict) or \
            report.raw != canonical_json(report_value) + b"\n":
        raise ValidationError("builder report is not canonical JSON")
    report_keys = {
        "schema", "status", "target", "architecture", "os",
        "candidateEntryPath", "candidateEntryModulePath",
        "candidateEntrySha256", "baseInputImageId",
        "baseConfigDigest", "baseOciManifestDigest", "baseLayerCount",
        "baseLayerDigests", "baseLayerSizes", "baseRootfsDiffIds",
        "baseImageArchiveSize", "baseImageArchiveSha256", "imageId",
        "imageConfigDigest", "ociManifestDigest", "imageLayerCount",
        "imageLayerDigests", "imageLayerSizes", "imageRootfsDiffIds",
        "closureLayerDigest", "closureRootfsDiffId",
        "imageArchiveSize", "imageArchiveSha256",
        "sourceToolManifestSha256", "sourceClosureSha256",
        "sourceEntryCount", "toolClosureSha256", "toolEntryCount",
        "builderSha256", "workloadSha256", "validatorSha256",
        "releaseSourceClosureSha256", "releaseSourceClosureCid",
        "candidateBundleSize", "candidateBundleSha256",
        "candidateManifestSize", "candidateManifestSha256",
        "candidateReportSize", "candidateReportSha256",
        "candidateWorkerSize", "candidateWorkerSha256",
        "candidateBuildArgvCount", "candidateBuildArgvSha256",
        "candidateBuildEnvCount", "candidateBuildEnvSha256",
    }
    architecture = {"x86_64": "amd64", "aarch64": "arm64"}[rows["machine"]]
    report_exact = {
        "schema": "cheng.cid_linux_current_source_builder",
        "status": "built",
        "target": rows["target"],
        "architecture": architecture,
        "os": "linux",
        "sourceEntryCount": frozen_value["sourceEntryCount"],
        "toolEntryCount": frozen_value["toolEntryCount"],
    }
    if set(report_value) != report_keys or any(
        report_value.get(key) != expected
        for key, expected in report_exact.items()
    ):
        raise ValidationError("builder report exact schema/provenance mismatch")
    for prefix in ("base", "image"):
        count_key = prefix + "LayerCount"
        digest_key = prefix + "LayerDigests"
        size_key = prefix + "LayerSizes"
        diff_key = prefix + "RootfsDiffIds"
        count = report_value[count_key]
        digests = report_value[digest_key]
        sizes = report_value[size_key]
        diff_ids = report_value[diff_key]
        if not isinstance(count, int) or isinstance(count, bool) or count <= 0 or \
                not isinstance(digests, list) or \
                not isinstance(sizes, list) or not isinstance(diff_ids, list) or \
                len(digests) != count or len(sizes) != count or \
                len(diff_ids) != count or any(
                    not isinstance(value, str) or
                    not re.fullmatch(r"sha256:[0-9a-f]{64}", value)
                    for value in [*digests, *diff_ids]
                ) or any(
                    not isinstance(value, int) or isinstance(value, bool) or
                    value <= 0 for value in sizes
                ):
            raise ValidationError("builder image layer provenance mismatch")
    if report_value["imageLayerCount"] != report_value["baseLayerCount"] + 1 or \
            report_value["imageLayerDigests"][:-1] != \
            report_value["baseLayerDigests"] or \
            report_value["imageLayerSizes"][:-1] != \
            report_value["baseLayerSizes"] or \
            report_value["imageRootfsDiffIds"][:-1] != \
            report_value["baseRootfsDiffIds"] or \
            report_value["closureLayerDigest"] != \
            report_value["imageLayerDigests"][-1] or \
            report_value["closureRootfsDiffId"] != \
            report_value["imageRootfsDiffIds"][-1]:
        raise ValidationError("builder image lineage provenance mismatch")
    for key in (
        "baseInputImageId", "baseConfigDigest", "baseOciManifestDigest",
        "imageId", "imageConfigDigest", "ociManifestDigest",
    ):
        if not isinstance(report_value[key], str) or \
                not re.fullmatch(r"sha256:[0-9a-f]{64}", report_value[key]):
            raise ValidationError("builder image digest provenance mismatch")
    for prefix in ("base", "image"):
        size = report_value[prefix + "ImageArchiveSize"]
        digest = report_value[prefix + "ImageArchiveSha256"]
        if not isinstance(size, int) or isinstance(size, bool) or size <= 0 or \
                not isinstance(digest, str) or not SHA256_RE.fullmatch(digest):
            raise ValidationError("builder image archive provenance mismatch")
    candidate_argv = (
        canonical.WORKLOAD_ARGV0,
        rows["target"],
        rows["candidate_entry_path"],
        rows["builder_image_id"],
        rows["builder_image_config_digest"],
        rows["builder_image_oci_manifest_digest"],
    )
    candidate_env = tuple(canonical.CANDIDATE_BUILD_ENV)
    if require_uint(
        rows["candidate_build_argv_count"],
        "current build argv count",
    ) != len(candidate_argv) or rows["candidate_build_argv_sha256"] != \
            framed_sha256(candidate_argv) or require_uint(
                rows["candidate_build_env_count"],
                "current build env count",
            ) != len(candidate_env) or rows["candidate_build_env_sha256"] != \
            framed_sha256(candidate_env):
        raise ValidationError("current build argv/env replay mismatch")
    bindings = {
        "target": "target",
        "candidateEntryPath": "candidate_entry_path",
        "candidateEntryModulePath": "candidate_entry_module_path",
        "candidateEntrySha256": "candidate_entry_sha256",
        "imageId": "builder_image_id",
        "imageConfigDigest": "builder_image_config_digest",
        "ociManifestDigest": "builder_image_oci_manifest_digest",
        "imageArchiveSha256": "builder_image_archive_sha256",
        "sourceToolManifestSha256": "frozen_manifest_sha256",
        "sourceClosureSha256": "frozen_source_closure_sha256",
        "toolClosureSha256": "frozen_tool_closure_sha256",
        "releaseSourceClosureSha256": "source_closure_sha256",
        "releaseSourceClosureCid": "source_closure_cid",
        "candidateBundleSize": "bundle_size",
        "candidateBundleSha256": "bundle_sha256",
        "candidateManifestSize": "candidate_manifest_size",
        "candidateManifestSha256": "candidate_manifest_sha256",
        "candidateReportSize": "candidate_report_size",
        "candidateReportSha256": "candidate_report_sha256",
        "candidateWorkerSize": "worker_size",
        "candidateWorkerSha256": "worker_sha256",
        "candidateBuildArgvCount": "candidate_build_argv_count",
        "candidateBuildArgvSha256": "candidate_build_argv_sha256",
        "candidateBuildEnvCount": "candidate_build_env_count",
        "candidateBuildEnvSha256": "candidate_build_env_sha256",
        "builderSha256": "builder_sha256",
        "workloadSha256": "workload_sha256",
        "validatorSha256": "validator_sha256",
    }
    for report_key, receipt_key in bindings.items():
        if str(report_value.get(report_key)) != rows[receipt_key]:
            raise ValidationError(
                f"builder report provenance mismatch: {report_key}",
            )


def parse_source_members(
    source: StableFile,
    workspace_root: Path,
) -> tuple[tuple[str, str, int], ...]:
    try:
        lines = source.raw.decode("ascii", "strict").splitlines()
    except UnicodeDecodeError as exc:
        raise ValidationError("source closure is not ASCII") from exc
    if len(lines) < 6 or \
            lines[0] != "schema=cheng.current_source_closure_manifest" or \
            not re.fullmatch(r"head=[0-9a-f]{40}", lines[1]) or \
            not lines[2].startswith("scope_count="):
        raise ValidationError("source closure header mismatch")
    scope_count = require_uint(
        lines[2].partition("=")[2],
        "source closure scope count",
    )
    scope_rows = lines[3:3 + scope_count]
    scopes: list[str] = []
    for row in scope_rows:
        prefix, separator, value = row.partition("=")
        if prefix != "scope" or not separator:
            raise ValidationError("source closure scope row mismatch")
        scopes.append(os.fsdecode(bytes.fromhex(value)))
    if tuple(scopes) != CURRENT_SOURCE_SCOPES:
        raise ValidationError("source closure scope order mismatch")
    count_index = 3 + scope_count
    if count_index >= len(lines) or \
            not lines[count_index].startswith("path_count="):
        raise ValidationError("source closure path count mismatch")
    path_count = require_uint(
        lines[count_index].partition("=")[2],
        "source closure path count",
    )
    cid_index = count_index + 1
    if cid_index >= len(lines) or \
            not lines[cid_index].startswith("content_cid="):
        raise ValidationError("source closure content CID row mismatch")
    require_sha(
        lines[cid_index].partition("=")[2],
        "source closure content CID",
    )
    member_rows = lines[cid_index + 1:]
    if len(member_rows) != path_count:
        raise ValidationError("source closure member count mismatch")
    members: list[tuple[str, str, int]] = []
    previous = b""
    observed: set[str] = set()
    for row in member_rows:
        parts = row.split("\t")
        if len(parts) not in (2, 9):
            raise ValidationError("source closure member row mismatch")
        try:
            relative_raw = bytes.fromhex(parts[0])
        except ValueError as exc:
            raise ValidationError("source closure path encoding mismatch") from exc
        components = relative_raw.split(b"/")
        relative = os.fsdecode(relative_raw)
        if not relative_raw or relative_raw <= previous or \
                relative_raw.startswith(b"/") or \
                any(value in (b"", b".", b"..") for value in components) or \
                relative in observed:
            raise ValidationError("source closure path identity mismatch")
        previous = relative_raw
        observed.add(relative)
        path = workspace_root / relative
        if len(parts) == 2:
            if parts[1] != "tracked_deleted" or os.path.lexists(path):
                raise ValidationError("source closure deletion mismatch")
            continue
        if parts[1] not in ("tracked", "untracked"):
            raise ValidationError("source closure member class mismatch")
        digest = require_sha(parts[2], "source closure member SHA-256")
        numeric = [
            require_uint(value, "source closure member identity")
            for value in parts[3:]
        ]
        current = stable_read(
            path,
            "source closure member",
            2 * 1024 * 1024 * 1024,
        )
        expected = (
            current.device,
            current.inode,
            current.mode,
            current.size,
            current.mtime_ns,
            current.ctime_ns,
        )
        if tuple(numeric) != expected or current.sha256 != digest:
            raise ValidationError("source closure member live identity mismatch")
        members.append((relative, digest, current.mode))
    return tuple(members)


def validate_current_binding(
    workspace_root: Path,
    source_closure: Path,
    driver: Path,
    build_receipt: Path,
) -> CurrentBinding:
    if not workspace_root.is_absolute() or \
            workspace_root.resolve(strict=True) != workspace_root or \
            not workspace_root.is_dir():
        raise ValidationError("workspace root is not canonical")
    source = stable_read(
        source_closure,
        "source closure",
        256 * 1024 * 1024,
    )
    driver_file = stable_file_identity(driver)
    require_unprivileged_executable(driver_file, "current driver")
    rows, build_file = parse_build_receipt(build_receipt)
    target = rows.get("target", "")
    expected_machine = TARGET_MACHINES.get(target)
    elf_machine = {"x86_64": 62, "aarch64": 183}.get(expected_machine or "")
    if expected_machine is None or rows.get("machine") != expected_machine or \
            elf_machine is None:
        raise ValidationError("current driver target/machine mismatch")
    raw = driver_file.raw
    if len(raw) < 64 or raw[:4] != b"\x7fELF" or raw[4:6] != b"\x02\x01" or \
            int.from_bytes(raw[16:18], "little") not in (2, 3) or \
            int.from_bytes(raw[18:20], "little") != elf_machine:
        raise ValidationError("current driver ELF identity mismatch")
    entry_path = rows.get("candidate_entry_path", "")
    entry_module = ENTRY_SPECS.get(entry_path)
    if entry_module is None or rows.get("candidate_entry_module_path") != entry_module:
        raise ValidationError("current build entry identity mismatch")
    entry_sha = rows.get("candidate_entry_sha256", "")
    require_sha(entry_sha, "current entry SHA-256")
    entry_file = stable_read(
        workspace_root / entry_path,
        "current entry",
        64 * 1024 * 1024,
    )
    if entry_file.sha256 != entry_sha:
        raise ValidationError("current entry differs from build receipt")
    source_cid = rows.get("source_closure_cid", "")
    source_capture = rows.get("source_closure_sha256", "")
    require_sha(source_cid, "source closure CID")
    require_sha(source_capture, "source closure capture")
    closure_builder = load_closure_builder(
        workspace_root,
        rows.get("current_source_closure_builder_sha256", ""),
    )
    try:
        live_manifest = closure_builder.build_manifest(
            str(workspace_root),
            list(CURRENT_SOURCE_SCOPES),
        )
        computed_cid = closure_builder.content_cid_from_manifest(source.raw)
    except (OSError, RuntimeError) as exc:
        raise ValidationError("current source closure rebuild failed") from exc
    if live_manifest != source.raw or computed_cid != source_cid:
        raise ValidationError("current source closure is not the live exact closure")
    source_members = parse_source_members(source, workspace_root)
    exact = {
        "schema": "cheng.cid_linux_current_source_candidate_build",
        "status": "BUILT",
        "worker_role": "current_source_linux_native_compiler",
        "source_closure_sha256": source.sha256,
        "source_closure_cid": computed_cid,
        "worker_path_fshex": os.fsencode(str(driver_file.path)).hex(),
        "worker_sha256": driver_file.sha256,
        "worker_size": str(driver_file.size),
        "worker_device": str(driver_file.device),
        "worker_inode": str(driver_file.inode),
        "worker_mode": format(driver_file.mode, "o"),
        "worker_mtime_ns": str(driver_file.mtime_ns),
        "worker_ctime_ns": str(driver_file.ctime_ns),
        "worker_elf_machine": str(elf_machine),
        "release_source_closure_path_fshex":
            os.fsencode(str(source.path)).hex(),
    }
    tool_fields = {
        "release_evidence_tool_sha256":
            "tools/backend2_current_source_release_evidence",
        "builder_sha256": "tools/cid_linux_current_source_candidate_builder.py",
        "workload_sha256":
            "tools/cid_linux_current_source_candidate_workload.sh",
        "gate_sha256": "tools/cid_linux_current_source_candidate_gate.sh",
        "validator_sha256":
            "tools/cid_linux_current_source_candidate_validate.py",
        "cgroup_producer_sha256":
            "tools/beat_c_linux_cgroup_v2_hard_memory_gate.py",
        "cgroup_validator_sha256":
            "tools/beat_c_validate_linux_cgroup_v2_hard_memory_receipt.py",
    }
    for field, relative in tool_fields.items():
        exact[field] = stable_read(
            workspace_root / relative,
            "current build tool",
            256 * 1024 * 1024,
        ).sha256
    for key, expected in exact.items():
        if rows.get(key) != expected:
            raise ValidationError(f"current build receipt mismatch: {key}")
    validate_build_artifacts(
        rows,
        workspace_root,
        source,
        driver_file,
        elf_machine,
    )
    return CurrentBinding(
        workspace_root=workspace_root,
        source_closure=source,
        driver=driver_file,
        build_receipt=build_file,
        source_closure_cid=source_cid,
        source_closure_capture_sha256=source.sha256,
        target=target,
        entry_path=entry_path,
        entry_module_path=entry_module,
        entry_sha256=entry_sha,
        source_members=source_members,
    )


def native_descriptor_target_argv(
    workload_kind: str,
    target: str,
    entry_path: str,
) -> tuple[str, ...]:
    if workload_kind == WORKLOAD_CURRENT_DRIVER:
        return (
            CURRENT_DRIVER_GUEST_PATH,
            "system-link-exec",
            "--require-pure-system-link-exec",
            "--root:" + CURRENT_SOURCE_GUEST_PATH,
            "--in:" + entry_path,
            "--emit:exe",
            "--backend:primary",
            "--link-providers",
            "--target:" + target,
            "--out:" + CURRENT_DRIVER_NEXT_GUEST_PATH,
            "--report-out:" + CURRENT_DRIVER_REPORT_GUEST_PATH,
        )
    if workload_kind == WORKLOAD_DRY_COMPILE:
        return (
            CURRENT_DRIVER_GUEST_PATH,
            "dry-compile",
            "--root:" + CURRENT_SOURCE_GUEST_PATH,
            "--in:" + CURRENT_SOURCE_GUEST_PATH + "/" + entry_path,
            "--target:" + target,
            "--emit:exe",
            "--backend-jobs:1",
            "--out:" + DRY_OUTPUT_GUEST_PATH,
            "--report-out:" + DRY_REPORT_GUEST_PATH,
        )
    raise ValidationError("native descriptor workload kind is invalid")


def parse_native_descriptor(
    path: Path,
    expected_sha256: str,
    workload_kind: str,
) -> tuple[dict[str, str], StableFile]:
    require_sha(expected_sha256, "native descriptor SHA-256")
    file = stable_read(path, "native descriptor", 4 * 1024 * 1024)
    if file.sha256 != expected_sha256 or not file.raw.endswith(b"\n"):
        raise ValidationError("native descriptor identity mismatch")
    rows: dict[str, str] = {}
    for row in file.raw.decode("utf-8", "strict").splitlines():
        key, separator, value = row.partition("=")
        if not separator or key in rows:
            raise ValidationError("native descriptor row invalid")
        rows[key] = value
    if tuple(rows) != NATIVE_DESCRIPTOR_KEYS:
        raise ValidationError("native descriptor exact field order mismatch")
    payload = rows.get("descriptor_payload_sha256", "")
    require_sha(payload, "native descriptor payload")
    suffix = f"descriptor_payload_sha256={payload}\n".encode("utf-8")
    if not file.raw.endswith(suffix) or sha256_bytes(
        file.raw[:-len(suffix)],
    ) != payload:
        raise ValidationError("native descriptor payload mismatch")
    target = rows.get("target", "")
    machine = rows.get("machine", "")
    if TARGET_MACHINES.get(target) != machine:
        raise ValidationError("native descriptor target/machine mismatch")
    expected = {
        "schema": "cheng.backend2.current_source_native_executor",
        "status": "CONFIGURED",
        "workload_kind": workload_kind,
        "host_os": "linux",
        "execution_environment": "native_linux_delegated_cgroup_v2",
        "native_execution": "true",
        "emulation": "false",
        "controller_host_os": "linux",
        "controller_host_machine": machine,
        "controller_host_translated": "false",
        "native_execution_proof":
            "native_linux_same_machine_live_elf_and_cgroup2",
        "cgroup_version": "2",
        "cgroup_mount_type": "cgroup2",
        "memory_enforcement_scope": MEMORY_SCOPE,
        "memory_max_bytes": str(LIMIT_BYTES),
        "memory_swap_max_bytes": str(SWAP_MAX_BYTES),
        "memory_and_swap_total_limit_bytes": str(LIMIT_BYTES),
        "backend_count": "2",
        "backend.0.name": "primary",
        "backend.1.name": "backend2",
        "target_argv_encoding": FRAMED_SEQUENCE_ENCODING,
        "target_env_encoding": FRAMED_SEQUENCE_ENCODING,
    }
    for key, value in expected.items():
        if rows.get(key) != value:
            raise ValidationError(f"native descriptor field mismatch: {key}")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", rows.get("image_id", "")):
        raise ValidationError("native descriptor image identity mismatch")
    if fsdecode_hex(
        rows.get("worker_path_in_image_fshex", ""),
        "native descriptor worker path",
    ) != Path("/cheng-hardcap/current-driver"):
        raise ValidationError("native descriptor worker path mismatch")
    for key in NATIVE_DESCRIPTOR_SHA_KEYS:
        require_sha(rows.get(key, ""), "native descriptor " + key)
    entry_path = rows.get("candidate_entry_path", "")
    if ENTRY_SPECS.get(entry_path) != rows.get("candidate_entry_module_path"):
        raise ValidationError("native descriptor entry mismatch")
    expected_argv = native_descriptor_target_argv(
        workload_kind,
        target,
        entry_path,
    )
    expected_env = (
        DRY_TARGET_ENV
        if workload_kind == WORKLOAD_DRY_COMPILE
        else FIXED_TARGET_ENV
    )
    if (
        require_uint(
            rows.get("target_argv_count", ""),
            "target argv count",
        ) != len(expected_argv)
        or rows.get("target_argv_sha256") != framed_sha256(expected_argv)
        or require_uint(
            rows.get("target_env_count", ""),
            "target env count",
        ) != len(expected_env)
        or rows.get("target_env_sha256") != framed_sha256(expected_env)
    ):
        raise ValidationError(
            "native descriptor workload argv/environment mismatch",
        )
    build_path = fsdecode_hex(
        rows["candidate_build_receipt_path_fshex"],
        "native descriptor build receipt path",
    )
    build = stable_read(
        build_path,
        "native descriptor build receipt",
        4 * 1024 * 1024,
    )
    if build.sha256 != rows["candidate_build_receipt_sha256"]:
        raise ValidationError("native descriptor build receipt identity mismatch")
    return rows, file


def scan_evidence_tree(evidence_dir: Path) -> tuple[set[str], set[str]]:
    if (
        evidence_dir.resolve(strict=True) != evidence_dir
        or evidence_dir.is_symlink()
        or not evidence_dir.is_dir()
    ):
        raise ValidationError("evidence root is not a canonical directory")
    files: set[str] = set()
    directories: set[str] = set()
    pending = [evidence_dir]
    while pending:
        directory = pending.pop()
        with os.scandir(directory) as iterator:
            children = sorted(iterator, key=lambda item: os.fsencode(item.name))
        for child in children:
            path = Path(child.path)
            relative = path.relative_to(evidence_dir).as_posix()
            if child.is_symlink():
                raise ValidationError("evidence symlink is forbidden")
            if child.is_dir(follow_symlinks=False):
                if relative in directories:
                    raise ValidationError("evidence directory is duplicated")
                directories.add(relative)
                pending.append(path)
            elif child.is_file(follow_symlinks=False):
                if relative in files:
                    raise ValidationError("evidence file is duplicated")
                files.add(relative)
            else:
                raise ValidationError("evidence special file is forbidden")
    return files, directories


def verify_artifact_manifest(
    evidence_dir: Path,
    rows: dict[str, str],
) -> None:
    before_files, before_directories = scan_evidence_tree(evidence_dir)
    manifest, file = read_json_file(
        evidence_dir / "artifact-manifest.json",
        "artifact manifest",
    )
    if manifest.get("schema") != ARTIFACT_SCHEMA or set(manifest) != {
        "schema",
        "artifacts",
        "directories",
    }:
        raise ValidationError("artifact manifest schema mismatch")
    artifacts = manifest["artifacts"]
    directories = manifest["directories"]
    if (
        not isinstance(artifacts, list)
        or not isinstance(directories, list)
        or len(artifacts) != require_uint(
            rows["artifact_count"],
            "artifact count",
        )
        or len(directories) != require_uint(
            rows["artifact_directory_count"],
            "artifact directory count",
        )
    ):
        raise ValidationError("artifact manifest count mismatch")
    if file.sha256 != rows["artifact_manifest_sha256"]:
        raise ValidationError("artifact manifest identity mismatch")
    previous_directory = ""
    expected_directories: set[str] = set()
    for relative in directories:
        if (
            not isinstance(relative, str)
            or relative <= previous_directory
            or relative in ("", ".")
        ):
            raise ValidationError("artifact directory order mismatch")
        previous_directory = relative
        path = Path(relative)
        if (
            path.is_absolute()
            or ".." in path.parts
            or path.as_posix() != relative
        ):
            raise ValidationError("artifact directory path escapes evidence")
        expected_directories.add(relative)
    previous = ""
    observed: dict[str, str] = {}
    for item in artifacts:
        if not isinstance(item, dict) or set(item) != {
            "path",
            "sha256",
            "size",
        }:
            raise ValidationError("artifact manifest row shape mismatch")
        relative = item["path"]
        if not isinstance(relative, str) or relative <= previous:
            raise ValidationError("artifact manifest order mismatch")
        previous = relative
        path = Path(relative)
        if (
            path.is_absolute()
            or ".." in path.parts
            or path.as_posix() != relative
        ):
            raise ValidationError("artifact manifest path escapes evidence")
        current = stable_read(
            evidence_dir / path,
            "artifact",
            2 * 1024 * 1024 * 1024,
        )
        if current.sha256 != item["sha256"] or current.size != item["size"]:
            raise ValidationError("artifact identity mismatch")
        observed[relative] = current.sha256
    expected_files = set(observed) | {
        "artifact-manifest.json",
        "receipt.kv",
    }
    if (
        before_files != expected_files
        or before_directories != expected_directories
    ):
        raise ValidationError("artifact manifest does not enumerate exact tree")
    if observed.get("gate-runner.py") != rows["runner_sha256"] or \
            observed.get("receipt-validator.py") != rows["validator_sha256"]:
        raise ValidationError("artifact tool identity mismatch")
    after_files, after_directories = scan_evidence_tree(evidence_dir)
    if (
        after_files != before_files
        or after_directories != before_directories
    ):
        raise ValidationError("artifact tree drifted during validation")


def load_ledger_wrapper_receipt_keys() -> tuple[str, ...]:
    loader = importlib.machinery.SourceFileLoader(
        "cheng_hard_memory_receipt_wrapper_schema",
        str(LEDGER_WRAPPER_PATH),
    )
    spec = importlib.util.spec_from_loader(loader.name, loader)
    if spec is None:
        raise ValidationError("ledger wrapper schema cannot be loaded")
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
        raise ValidationError("ledger wrapper receipt schema is invalid")
    return keys


LEDGER_WRAPPER_RECEIPT_KEYS = load_ledger_wrapper_receipt_keys()


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


def parse_unique_current_driver_report(
    raw: bytes,
) -> dict[str, str]:
    if not raw or raw.endswith(b"\n"):
        raise ValidationError(
            "current driver report terminal newline contract mismatch",
        )
    try:
        lines = raw.decode("utf-8", "strict").split("\n")
    except UnicodeDecodeError as exc:
        raise ValidationError("current driver report is not UTF-8") from exc
    rows: dict[str, str] = {}
    for line in lines:
        key, separator, value = line.partition("=")
        if (
            not separator
            or not REPORT_KEY_RE.fullmatch(key)
            or key in rows
            or "\r" in value
        ):
            raise ValidationError(
                "current driver report malformed or duplicate row",
            )
        rows[key] = value
    return rows


def parse_unique_dry_compile_report(raw: bytes) -> dict[str, str]:
    if not raw or raw.endswith(b"\n"):
        raise ValidationError(
            "dry compile report terminal newline contract mismatch",
        )
    try:
        lines = raw.decode("utf-8", "strict").split("\n")
    except UnicodeDecodeError as exc:
        raise ValidationError("dry compile report is not UTF-8") from exc
    rows: dict[str, str] = {}
    for line in lines:
        key, separator, value = line.partition("=")
        if (
            not separator
            or not REPORT_KEY_RE.fullmatch(key)
            or key in rows
            or "\r" in value
        ):
            raise ValidationError(
                "dry compile report malformed or duplicate row",
            )
        rows[key] = value
    return rows


def validate_dry_compile_dynamic_manifest(
    rows: dict[str, str],
    source_count: int,
    edge_count: int,
    expected_entry: str,
    current: CurrentBinding,
) -> None:
    if (
        source_count <= 0
        or source_count > len(rows) // 8
        or edge_count > len(rows) // 13
        or rows.get("dry_compile_source_manifest_count")
        != str(source_count)
    ):
        raise ValidationError("dry compile dynamic manifest count mismatch")
    source_root = Path("/cheng-current-source/repo")
    member_by_path = {
        relative: (digest, mode)
        for relative, digest, mode in current.source_members
    }
    source_paths: list[str] = []
    source_path_raws: list[bytes] = []
    source_raw_cids: list[str] = []
    source_byte_counts: list[int] = []
    source_line_counts: list[int] = []
    source_edge_counts: list[int] = []
    discovery: list[tuple[str, int, int]] = []
    byte_sum = 0
    line_sum = 0
    max_bytes = 0
    for index in range(source_count):
        prefix = f"dry_compile_source_manifest.{index}."
        path_raw = require_lower_hex_bytes(
            rows.get(prefix + "path_fshex", ""),
            f"dry compile source {index} path",
            allow_empty=False,
        )
        path_text = os.fsdecode(path_raw)
        if any(ch in path_text for ch in ("\x00", "\n", "\r")):
            raise ValidationError("dry compile source path contains control")
        path = Path(path_text)
        try:
            relative = str(path.relative_to(source_root))
        except ValueError as exc:
            raise ValidationError(
                "dry compile source path escapes frozen source root",
            ) from exc
        if not relative or path_text in source_paths:
            raise ValidationError("dry compile source path is not unique")
        member = member_by_path.get(relative)
        if member is None:
            raise ValidationError(
                "dry compile source is outside frozen source closure",
            )
        live = stable_read(
            current.workspace_root / relative,
            f"dry compile source {index}",
            256 * 1024 * 1024,
        )
        if live.sha256 != member[0] or live.mode != member[1]:
            raise ValidationError("dry compile source identity drift")
        source_raw_cid = require_sha(
            rows.get(prefix + "raw_bytes_cid", ""),
            f"dry compile source {index} raw bytes CID",
        )
        byte_count = require_canonical_uint(
            rows.get(prefix + "byte_count", ""),
            f"dry compile source {index} byte count",
        )
        line_count = require_canonical_uint(
            rows.get(prefix + "line_count", ""),
            f"dry compile source {index} line count",
        )
        source_edge_count = require_canonical_uint(
            rows.get(prefix + "import_edge_count", ""),
            f"dry compile source {index} edge count",
        )
        if (
            byte_count <= 0
            or line_count <= 0
            or byte_count != live.size
            or line_count != len(live.raw.splitlines())
            or source_raw_cid != source_raw_bytes_cid(live.raw)
        ):
            raise ValidationError("dry compile source physical facts mismatch")
        kind = rows.get(prefix + "discovery_kind", "")
        discoverer_source = require_canonical_int32(
            rows.get(prefix + "discoverer_source_index", ""),
            f"dry compile source {index} discoverer source",
        )
        discoverer_edge = require_canonical_int32(
            rows.get(prefix + "discoverer_edge_index", ""),
            f"dry compile source {index} discoverer edge",
        )
        source_paths.append(path_text)
        source_path_raws.append(path_raw)
        source_raw_cids.append(source_raw_cid)
        source_byte_counts.append(byte_count)
        source_line_counts.append(line_count)
        source_edge_counts.append(source_edge_count)
        discovery.append((kind, discoverer_source, discoverer_edge))
        byte_sum += byte_count
        line_sum += line_count
        max_bytes = max(max_bytes, byte_count)
    if sum(source_edge_counts) != edge_count:
        raise ValidationError("dry compile per-source edge count mismatch")
    edge_targets: list[str] = []
    edges: list[dict[str, bytes | int]] = []
    for index in range(edge_count):
        prefix = f"dry_compile_import_edge.{index}."
        text_values: dict[str, bytes] = {}
        for field, allow_empty in (
            ("owner_module_path_fshex", False),
            ("target_module_path_fshex", False),
            ("target_source_path_fshex", False),
            ("import_alias_fshex", True),
            ("qualifier_fshex", True),
        ):
            text_values[field] = require_lower_hex_bytes(
                rows.get(prefix + field, ""),
                f"dry compile edge {index} {field}",
                allow_empty=allow_empty,
            )
        target_raw = text_values["target_source_path_fshex"]
        target_text = os.fsdecode(target_raw)
        if any(ch in target_text for ch in ("\x00", "\n", "\r")):
            raise ValidationError("dry compile edge target contains control")
        target_len = require_canonical_int32(
            rows.get(prefix + "target_source_path_len", ""),
            f"dry compile edge {index} target length",
        )
        first_code = require_canonical_int32(
            rows.get(prefix + "target_source_path_first_code", ""),
            f"dry compile edge {index} target first code",
        )
        last_code = require_canonical_int32(
            rows.get(prefix + "target_source_path_last_code", ""),
            f"dry compile edge {index} target last code",
        )
        dot_count = require_canonical_int32(
            rows.get(prefix + "target_source_path_dot_count", ""),
            f"dry compile edge {index} target dot count",
        )
        target_hash = require_canonical_int32(
            rows.get(prefix + "target_source_path_hash", ""),
            f"dry compile edge {index} target hash",
        )
        target_profile = require_canonical_int32(
            rows.get(prefix + "target_profile_index", ""),
            f"dry compile edge {index} target profile",
        )
        allows_unqualified = rows.get(prefix + "allows_unqualified_call")
        resolved = rows.get(prefix + "resolved")
        alias_raw = text_values["import_alias_fshex"]
        qualifier_raw = text_values["qualifier_fshex"]
        expected_qualifier = parser_ident_prefix_bytes(alias_raw)
        if not expected_qualifier:
            expected_qualifier = target_raw.rsplit(b"/", 1)[-1].rsplit(
                b".",
                1,
            )[0]
        if not expected_qualifier:
            expected_qualifier = text_values[
                "target_module_path_fshex"
            ].rsplit(b"/", 1)[-1]
        if (
            target_len != len(target_raw)
            or target_len <= 0
            or first_code != target_raw[0]
            or last_code != target_raw[-1]
            or dot_count != target_raw.count(b".")
            or target_hash != parser_path_content_hash(target_raw)
            or target_profile != -1
            or target_text not in source_paths
            or qualifier_raw != expected_qualifier
            or allows_unqualified != ("1" if not alias_raw else "0")
            or resolved != "1"
        ):
            raise ValidationError("dry compile canonical edge facts mismatch")
        edge_targets.append(target_text)
        edges.append({
            "owner": text_values["owner_module_path_fshex"],
            "target_module": text_values["target_module_path_fshex"],
            "target_source": target_raw,
            "target_len": target_len,
            "target_first": first_code,
            "target_last": last_code,
            "target_dots": dot_count,
            "target_hash": target_hash,
            "target_profile": target_profile,
            "alias": alias_raw,
            "qualifier": qualifier_raw,
            "allows": int(allows_unqualified),
            "resolved": int(resolved),
        })
    entry_index = require_canonical_uint(
        rows.get("dry_compile_source_bundle_entry_source_index", ""),
        "dry compile source bundle entry index",
    )
    if (
        entry_index >= source_count
        or source_paths[entry_index] != expected_entry
        or entry_index != 0
    ):
        raise ValidationError("dry compile source bundle entry mismatch")
    edge_offset = [0]
    for count in source_edge_counts:
        edge_offset.append(edge_offset[-1] + count)
    for index, (kind, discoverer_source, discoverer_edge) in enumerate(
        discovery,
    ):
        if index == 0:
            if (kind, discoverer_source, discoverer_edge) != (
                "entry", -1, -1,
            ):
                raise ValidationError(
                    "dry compile entry discovery facts mismatch",
                )
            continue
        if not 0 <= discoverer_source < index:
            raise ValidationError(
                "dry compile discoverer source is not prior",
            )
        if kind == "value_intrinsic":
            if (
                discoverer_edge != -1
                or source_paths[index]
                != "/cheng-current-source/repo/src/std/system.cheng"
            ):
                raise ValidationError(
                    "dry compile Value dependency facts mismatch",
                )
        elif kind == "import_edge":
            if not 0 <= discoverer_edge < source_edge_counts[
                discoverer_source
            ]:
                raise ValidationError(
                    "dry compile discoverer edge is invalid",
                )
            global_edge = edge_offset[discoverer_source] + discoverer_edge
            if edge_targets[global_edge] != source_paths[index]:
                raise ValidationError(
                    "dry compile discovery edge target mismatch",
                )
        else:
            raise ValidationError("dry compile discovery kind is invalid")
    if (
        byte_sum != require_canonical_uint(
            rows.get("dry_compile_input_source_byte_count", ""),
            "dry compile total source bytes",
        )
        or line_sum != require_canonical_uint(
            rows.get("dry_compile_input_source_line_count", ""),
            "dry compile total source lines",
        )
        or max_bytes != require_canonical_uint(
            rows.get("dry_compile_input_source_max_file_bytes", ""),
            "dry compile max source bytes",
        )
        or rows.get("dry_compile_source_bundle_cid")
        != current.source_closure_cid
        or rows.get("dry_compile_entry_source_cid")
        != source_raw_cids[entry_index]
        or rows.get("dry_compile_source_bundle_unresolved_import_count") != "0"
    ):
        raise ValidationError("dry compile canonical source binding mismatch")
    identities: dict[str, str] = {}
    for key in (
        "dry_compile_source_bundle_cid",
        "dry_compile_entry_source_cid",
        "dry_compile_import_graph_cid",
        "dry_compile_source_bundle_binding_seal",
        "dry_compile_source_manifest_cid",
    ):
        identities[key] = require_sha(
            rows.get(key, ""),
            "dry compile report " + key,
        )
    payload = bytearray()
    append_framed_bytes(
        payload,
        b"cheng.backend_driver.dry_compile.source_manifest",
    )
    append_u32_be(payload, source_count)
    for index in range(source_count):
        append_framed_bytes(payload, source_path_raws[index])
        payload.extend(bytes.fromhex(source_raw_cids[index]))
        append_u64_be(payload, source_byte_counts[index])
        append_u64_be(payload, source_line_counts[index])
        append_u32_be(payload, source_edge_counts[index])
        append_framed_bytes(payload, discovery[index][0].encode("ascii"))
        append_u32_be(payload, discovery[index][1])
        append_u32_be(payload, discovery[index][2])
    append_u32_be(payload, edge_count)
    for edge in edges:
        for field in ("owner", "target_module", "target_source"):
            append_framed_bytes(payload, edge[field])
        for field in (
            "target_len",
            "target_first",
            "target_last",
            "target_dots",
            "target_hash",
            "target_profile",
        ):
            append_u32_be(payload, edge[field])
        append_framed_bytes(payload, edge["alias"])
        append_framed_bytes(payload, edge["qualifier"])
        append_u32_be(payload, edge["allows"])
        append_u32_be(payload, edge["resolved"])
    append_u32_be(payload, entry_index)
    for key in (
        "dry_compile_source_bundle_cid",
        "dry_compile_entry_source_cid",
        "dry_compile_import_graph_cid",
        "dry_compile_source_bundle_binding_seal",
    ):
        payload.extend(bytes.fromhex(identities[key]))
    append_u32_be(payload, 0)
    if sha256_bytes(bytes(payload)) != identities[
        "dry_compile_source_manifest_cid"
    ]:
        raise ValidationError("dry compile source manifest CID mismatch")


def validate_current_driver_authority(
    executable: StableFile,
    report: StableFile,
    current: CurrentBinding,
    expected_source_bundle_cid: str,
) -> dict[str, str]:
    if (
        stat.S_IMODE(executable.mode) != 0o500
        or executable.mode & (stat.S_ISUID | stat.S_ISGID)
    ):
        raise ValidationError("current driver next authority mode mismatch")
    rows = parse_unique_current_driver_report(report.raw)
    forbidden = REPORT_FORBIDDEN_FAILURE_KEYS.intersection(rows)
    if forbidden:
        raise ValidationError(
            "current driver report contains failure field: "
            + sorted(forbidden)[0],
        )
    expected = {
        "entry": current.entry_path,
        "target": current.target,
        "emit": "exe",
        "output": CURRENT_DRIVER_NEXT_GUEST_PATH,
        "entry_source_cid": current.entry_sha256,
        "entry_mode": "unelaborated",
        "ready_code": "1",
        "not_ready_code": "0",
        "not_ready_detail_code": "0",
        "not_ready_reason": "",
        "plan_ready_code": "1",
        "plan_not_ready_code": "0",
        "plan_not_ready_reason": "",
        "source_identity_receipt_source_package_id": "cheng",
        "source_identity_receipt_entry_module_path":
            current.entry_module_path,
        "system_link_exec_runtime_execute": "1",
        "system_link_exec": "1",
        "real_backend_codegen": "1",
        "full_backend_codegen": "1",
        "cold_system_link_exec": "0",
        "system_link_exec_scope": "selfhost_direct",
        "pure_provenance_bootstrap_materialize": "pass_b",
        "pure_provenance_gate": "pass_b_self_proof",
        "output_sha256": executable.sha256,
        "compile_receipt_output_digest": executable.sha256,
        "compile_receipt_target": current.target,
    }
    for key, value in expected.items():
        if rows.get(key) != value:
            raise ValidationError(
                "current driver report field mismatch: " + key,
            )
    source_bundle_cid = require_sha(
        rows.get("source_bundle_cid", ""),
        "current driver report source bundle CID",
    )
    if source_bundle_cid != require_sha(
        expected_source_bundle_cid,
        "expected current source bundle CID",
    ):
        raise ValidationError(
            "current driver report differs from frozen current source bundle",
        )
    if (
        rows.get("source_manifest_sha256") != source_bundle_cid
        or rows.get("source_bundle_receipt_source_bundle_cid")
        != source_bundle_cid
    ):
        raise ValidationError(
            "current driver report source closure binding mismatch",
        )
    source_count_raw = rows.get("source_snapshot_count", "")
    identity_source_count_raw = rows.get(
        "source_identity_receipt_source_snapshot_count",
        "",
    )
    source_count = require_uint(
        source_count_raw,
        "current driver report source snapshot count",
    )
    identity_source_count = require_uint(
        identity_source_count_raw,
        "current driver report source identity snapshot count",
    )
    if (
        source_count <= 0
        or source_count_raw != str(source_count)
        or identity_source_count_raw != str(identity_source_count)
        or identity_source_count != source_count
    ):
        raise ValidationError(
            "current driver report source snapshot count mismatch",
        )
    if rows.get("source_identity_receipt_unresolved_import_count") != "0":
        raise ValidationError(
            "current driver report contains unresolved imports",
        )
    identity_keys = (
        "source_bundle_cid",
        "entry_source_cid",
        "canonical_compiler_csg_cid",
        "source_identity_receipt_cid",
        "semantic_receipt_cid",
        "source_to_csg_binding_seal",
        "compile_receipt_world_head_cid",
        "compile_receipt_source_identity_receipt_cid",
        "compile_receipt_semantic_receipt_cid",
        "compile_receipt_output_digest",
        "compile_receipt_canonical_output_digest",
        "compile_receipt_cid",
        "compiler_output_receipt_cid",
        "source_bundle_receipt_source_bundle_cid",
        "source_identity_receipt_source_package_id_cid",
        "source_identity_receipt_entry_module_path_cid",
        "source_identity_receipt_import_graph_cid",
        "source_bundle_receipt_seal",
        "source_bundle_entry_identity_seal",
        "source_bundle_binding_seal",
    )
    for key in identity_keys:
        require_sha(
            rows.get(key, ""),
            "current driver report " + key,
        )
    if (
        rows["compile_receipt_source_identity_receipt_cid"]
        != rows["source_identity_receipt_cid"]
        or rows["compile_receipt_semantic_receipt_cid"]
        != rows["semantic_receipt_cid"]
    ):
        raise ValidationError("current driver report receipt chain mismatch")
    build_rows, _build_file = parse_build_receipt(current.build_receipt.path)
    canonical = load_candidate_validator(
        current.workspace_root,
        build_rows["validator_sha256"],
    )
    try:
        canonical.reject_negative_report(
            rows,
            "current driver report",
        )
        canonical.reject_legacy_version_fields(
            rows,
            "current driver report",
        )
        canonical.validate_current_receipt_report_order(report.raw, rows)
        physical_binding = (
            canonical.source_bundle_binding_physical_seal_from_report(rows)
        )
        if (
            not isinstance(physical_binding, (tuple, list))
            or not physical_binding
            or not isinstance(physical_binding[0], str)
        ):
            raise ValidationError(
                "canonical source bundle physical binding API mismatch",
            )
        recomputed = {
            "source_identity_receipt_cid":
                canonical.portable_source_identity_receipt_cid_from_report(rows),
            "source_bundle_entry_identity_seal":
                canonical.source_bundle_entry_identity_seal_from_report(rows),
            "source_bundle_receipt_seal":
                canonical.source_bundle_receipt_seal_from_report(rows),
            "semantic_receipt_cid":
                canonical.compile_semantic_receipt_cid_from_report(rows),
            "compile_receipt_cid":
                canonical.compile_receipt_cid_from_report(rows),
            "compiler_output_receipt_cid":
                canonical.compiler_output_receipt_cid_from_report(rows),
            "source_to_csg_binding_seal":
                canonical.source_to_csg_binding_seal_from_report(rows),
            "source_bundle_binding_seal": physical_binding[0],
        }
    except Exception as exc:
        raise ValidationError(
            "canonical current driver receipt recomputation failed",
        ) from exc
    for key, expected_value in recomputed.items():
        if rows.get(key) != expected_value:
            raise ValidationError(
                "current driver canonical receipt mismatch: " + key,
            )
    return rows


def validate_dry_compile_authority(
    report: StableFile,
    stdout: StableFile,
    stderr: StableFile,
    target_argv: Sequence[str],
    current: CurrentBinding,
) -> dict[str, str]:
    expected_entry = "/cheng-current-source/repo/" + current.entry_path
    expected_argv = (
        "/cheng-hardcap/current-driver",
        "dry-compile",
        "--root:/cheng-current-source/repo",
        "--in:" + expected_entry,
        "--target:" + current.target,
        "--emit:exe",
        "--backend-jobs:1",
        "--out:" + DRY_OUTPUT_GUEST_PATH,
        "--report-out:" + DRY_REPORT_GUEST_PATH,
    )
    if tuple(target_argv) != expected_argv:
        raise ValidationError("dry compile target argv mismatch")
    rows = parse_unique_dry_compile_report(report.raw)
    forbidden = REPORT_FORBIDDEN_FAILURE_KEYS.intersection(rows)
    if forbidden:
        raise ValidationError(
            "dry compile report contains failure field: "
            + sorted(forbidden)[0],
        )
    expected = {
        "dry_compile": "1",
        "dry_compile_command": "dry-compile",
        "compiler_impl": "pure_cheng_backend_driver",
        "dry_compile_input_contract_compiler": "pure_cheng_backend_driver",
        "dry_compile_input_contract_model":
            "full_compile_theory_deterministic_framework",
        "dry_compile_input_contract_target_triple": current.target,
        "dry_compile_input_contract_emit_kind": "exe",
        "dry_compile_input_contract_entry_source_fshex":
            os.fsencode(expected_entry).hex(),
        "dry_compile_input_contract_provider_state": "disabled",
        "dry_compile_input_contract_link_state": "disabled",
        "dry_compile_input_contract_cache_state": "none",
        "dry_compile_input_contract_provider_cache_state": "none",
        "dry_compile_input_contract_memory_limit_bytes": str(LIMIT_BYTES),
        "dry_compile_input_contract_backend_jobs": "1",
        "dry_compile_input_contract_effective_jobs": "1",
        "dry_compile_model":
            "source_closure_hardware_theory_without_codegen",
        "dry_compile_executes_codegen": "0",
        "dry_compile_source_closure_mode": "parser_dependency_bfs",
        "dry_compile_entry_fshex": os.fsencode(expected_entry).hex(),
        "target": current.target,
        "emit": "exe",
        "dry_compile_unresolved_import_count": "0",
        "compile_parallel_requested_jobs": "1",
        "compile_parallel_effective_jobs": "1",
        "compile_parallel_theory_scope": "dry_compile_precheck",
        "compile_parallel_real_scope": "dry_compile_precheck",
        "compile_parallel_real_executes_codegen": "0",
        "dry_compile_primary_instruction_word_count": "0",
        "dry_compile_memory_theory_scope": "dry_compile_source_scan",
        "dry_compile_memory_theory_model":
            "max_source_file_bytes_without_codegen",
        "dry_compile_predicts_full_compile_rss": "0",
        "dry_compile_decision_scope": "source_closure_triage_only",
        "dry_compile_full_theory_requires_real_validation": "1",
        "dry_compile_full_theory_executes_codegen": "0",
        "full_compile_theory_framework": "canonical",
        "full_compile_theory_requires_real_validation": "1",
        "full_compile_theory_validation_status": "unvalidated",
        "full_compile_theory_scope":
            "non_exhaustive_modeled_compile_estimate_without_codegen_execution",
        "full_compile_theory_bound_status": "not_proven_upper_bound",
        "full_compile_theory_rss_estimate_status":
            "non_exhaustive_modeled_estimate_not_proven_upper_bound",
        "full_compile_theory_rss_proven_upper_bound_status": "not_proven",
        "full_compile_theory_rss_component_coverage": "non_exhaustive",
        "full_compile_theory_rss_memory_limit_bytes": str(LIMIT_BYTES),
        "full_compile_theory_rss_memory_limited_effective_jobs": "1",
        "full_compile_theory_time_effective_jobs": "1",
        "exec_phase_compiler_csg_ms": "0",
        "exec_phase_lowering_plan_ms": "0",
        "exec_phase_primary_object_plan_ms": "0",
        "exec_phase_direct_object_emit_ms": "0",
        "exec_phase_provider_objects_ms": "0",
        "exec_phase_native_link_ms": "0",
        "exec_phase_line_map_ms": "0",
    }
    for key, value in expected.items():
        if rows.get(key) != value:
            raise ValidationError("dry compile report field mismatch: " + key)
    for key in (
        "dry_compile_input_source_file_count",
        "dry_compile_input_source_line_count",
        "dry_compile_input_source_byte_count",
        "dry_compile_input_source_max_file_bytes",
    ):
        if require_canonical_uint(
            rows.get(key, ""),
            "dry compile report " + key,
        ) <= 0:
            raise ValidationError(
                "dry compile report source statistic is not positive: " + key,
            )
    for key in (
        "exec_phase_dry_actual_total_ms",
        "full_compile_theory_time_guard_recommended_ms",
        "full_compile_theory_rss_modeled_guard_estimate_bytes",
    ):
        require_canonical_uint(
            rows.get(key, ""),
            "dry compile report " + key,
        )
    files = require_canonical_uint(
        rows["dry_compile_input_source_file_count"],
        "dry compile source files",
    )
    lines = require_canonical_uint(
        rows["dry_compile_input_source_line_count"],
        "dry compile source lines",
    )
    source_bytes = require_canonical_uint(
        rows["dry_compile_input_source_byte_count"],
        "dry compile source bytes",
    )
    max_file_bytes = require_canonical_uint(
        rows["dry_compile_input_source_max_file_bytes"],
        "dry compile max source bytes",
    )
    import_edges = require_canonical_uint(
        rows.get("dry_compile_import_edge_count", ""),
        "dry compile import edges",
    )
    for key, expected_value in {
        "full_compile_theory_source_closure_files": files,
        "full_compile_theory_source_closure_lines": lines,
        "full_compile_theory_source_closure_bytes": source_bytes,
        "full_compile_theory_source_closure_import_edges": import_edges,
    }.items():
        if require_canonical_uint(
            rows.get(key, ""),
            "dry compile report " + key,
        ) != expected_value:
            raise ValidationError(
                "dry compile source statistic cross-check failed: " + key,
            )
    if max_file_bytes > source_bytes or require_canonical_uint(
        rows.get("dry_compile_memory_theory_lower_bound_bytes", ""),
        "dry compile memory lower bound",
    ) != max_file_bytes:
        raise ValidationError("dry compile source memory relation mismatch")
    source_closure_ns = require_canonical_uint(
        rows.get("exec_phase_source_closure_ns", ""),
        "dry compile source closure ns",
    )
    report_assembly_ns = require_canonical_uint(
        rows.get("exec_phase_report_payload_assembly_ns", ""),
        "dry compile report assembly ns",
    )
    actual_ns = require_canonical_uint(
        rows.get("exec_phase_dry_actual_total_ns", ""),
        "dry compile actual total ns",
    )
    plan_ns = require_canonical_uint(
        rows.get("exec_phase_system_link_plan_ns", ""),
        "dry compile system link plan ns",
    )
    if (
        actual_ns <= 0
        or actual_ns != plan_ns + source_closure_ns + report_assembly_ns
    ):
        raise ValidationError("dry compile actual phase arithmetic mismatch")
    for key, expected_value in {
        "exec_phase_source_closure_ms": source_closure_ns // 1_000_000,
        "exec_phase_report_payload_assembly_ms":
            report_assembly_ns // 1_000_000,
        "exec_phase_system_link_plan_ms": plan_ns // 1_000_000,
        "exec_phase_dry_actual_total_ms": actual_ns // 1_000_000,
    }.items():
        if require_canonical_uint(
            rows.get(key, ""),
            "dry compile report " + key,
        ) != expected_value:
            raise ValidationError(
                "dry compile phase arithmetic mismatch: " + key,
            )
    lower_bound_ns = require_canonical_uint(
        rows.get("full_compile_theory_time_lower_bound_ns", ""),
        "full compile theory lower bound ns",
    )
    budget_ns = require_canonical_uint(
        rows.get("full_compile_theory_time_budget_upper_bound_ns", ""),
        "full compile theory budget ns",
    )
    if lower_bound_ns <= 0 or budget_ns != lower_bound_ns * 3 + 20_000_000:
        raise ValidationError("full compile theory time guard arithmetic mismatch")
    for key in (
        "full_compile_theory_time_budget_upper_bound_ms",
        "full_compile_theory_time_guard_recommended_ms",
    ):
        if require_canonical_uint(
            rows.get(key, ""),
            "dry compile report " + key,
        ) != budget_ns // 1_000_000:
            raise ValidationError(
                "full compile theory time guard ms mismatch: " + key,
            )
    if require_canonical_uint(
        rows.get("full_compile_theory_rss_modeled_guard_estimate_bytes", ""),
        "full compile modeled RSS guard",
    ) <= 0:
        raise ValidationError("full compile modeled RSS guard is not positive")
    validate_dry_compile_dynamic_manifest(
        rows,
        files,
        import_edges,
        expected_entry,
        current,
    )
    validate_dry_compile_streams(report, stdout, stderr)
    build_rows, _build_file = parse_build_receipt(
        current.build_receipt.path,
    )
    canonical = load_candidate_validator(
        current.workspace_root,
        build_rows["validator_sha256"],
    )
    order_api = getattr(
        canonical,
        "dry_compile_report_exact_key_order",
        None,
    )
    if not callable(order_api):
        raise ValidationError(
            "dry compile exact ordered report schema authority is absent",
        )
    try:
        order_result = order_api(files, import_edges)
    except Exception as exc:
        raise ValidationError(
            "dry compile exact ordered report schema authority failed",
        ) from exc
    if (
        not isinstance(order_result, tuple)
        or len(order_result) != 3
        or not isinstance(order_result[0], tuple)
        or not isinstance(order_result[1], int)
        or isinstance(order_result[1], bool)
        or not isinstance(order_result[2], str)
    ):
        raise ValidationError(
            "dry compile exact ordered report schema authority is invalid",
        )
    order_authority, count_authority, digest_authority = order_result
    base_key_count = count_authority - 8 * files - 13 * import_edges
    if (
        not order_authority
        or any(
            not isinstance(key, str) or not REPORT_KEY_RE.fullmatch(key)
            for key in order_authority
        )
        or len(set(order_authority)) != len(order_authority)
        or count_authority != len(order_authority)
        or not 1 <= base_key_count <= 4_096
        or require_sha(
            digest_authority,
            "dry compile exact key order authority",
        ) != framed_sha256(order_authority)
    ):
        raise ValidationError(
            "dry compile exact ordered report schema authority is absent",
        )
    if tuple(rows) != tuple(order_authority):
        raise ValidationError(
            "dry compile exact ordered report schema validation failed",
        )
    return rows


def validate_dry_compile_streams(
    report: StableFile,
    stdout: StableFile,
    stderr: StableFile,
) -> None:
    if stdout.raw != report.raw + b"\n" or stderr.raw:
        raise ValidationError("dry compile stdout/stderr contains stray output")


def validate_workload_report_identity(
    wrapper_rows: dict[str, str],
    receipt_rows: dict[str, str],
    report: StableFile,
) -> None:
    expected = {
        "workload_report_sha256": report.sha256,
        "workload_report_size": str(report.size),
    }
    for rows in (wrapper_rows, receipt_rows):
        if any(rows.get(key) != value for key, value in expected.items()):
            raise ValidationError("workload report receipt identity mismatch")


def load_descendant_ledger_validator() -> Any:
    before = stable_read(
        LEDGER_VALIDATOR_PATH,
        "canonical descendant ledger validator",
        4 * 1024 * 1024,
    )
    spec = importlib.util.spec_from_file_location(
        "cheng_external_descendant_ledger_validator",
        LEDGER_VALIDATOR_PATH,
    )
    if spec is None or spec.loader is None:
        raise ValidationError("descendant ledger validator cannot be loaded")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    after = stable_read(
        LEDGER_VALIDATOR_PATH,
        "canonical descendant ledger validator",
        4 * 1024 * 1024,
    )
    if (
        before != after
        or not callable(getattr(module, "validate_closed_event_graph", None))
    ):
        raise ValidationError("descendant ledger validator drift/API mismatch")
    return module


def ledger_manifest_identity(
    guest_path: str,
    host_path: Path,
    *,
    executable: bool,
) -> dict[str, Any]:
    file = stable_read(
        host_path,
        "descendant ledger manifest member",
        512 * 1024 * 1024,
    )
    if file.uid != os.geteuid() or file.gid != os.getegid():
        raise ValidationError(
            "descendant ledger member is outside delegated uid/gid mapping",
        )
    if executable and (
        not file.mode & stat.S_IXUSR
        or file.mode & (stat.S_ISUID | stat.S_ISGID)
    ):
        raise ValidationError("descendant ledger executable mode mismatch")
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


def parse_exact_output_rows(
    path: Path,
    keys: Sequence[str],
    label: str,
    maximum: int = 4 * 1024 * 1024,
) -> tuple[dict[str, str], StableFile]:
    file = stable_read(path, label, maximum)
    try:
        lines = file.raw.decode("utf-8", "strict").splitlines()
    except UnicodeDecodeError as exc:
        raise ValidationError(f"{label} is not UTF-8") from exc
    rows: dict[str, str] = {}
    for line in lines:
        key, separator, value = line.partition("=")
        if not separator or not key or key in rows:
            raise ValidationError(f"{label} row is invalid")
        rows[key] = value
    if tuple(rows) != tuple(keys):
        raise ValidationError(f"{label} field order mismatch")
    return rows, file


def validate_descendant_exec_ledger(
    evidence_dir: Path,
    rows: dict[str, str],
    binding: CurrentBinding | None,
    stage_binding: Stage23PhaseBinding | None,
    workload_kind: str,
    rootfs: RootfsManifest,
    expected_source_bundle_cid: str,
    expected_session_nonce: str,
) -> int:
    event_hash_key = "events" + "Sha256"
    if rows["descendant_exec_ledger_status"] != "PROVED":
        raise ValidationError("workload descendant exec ledger is not proved")
    control = evidence_dir / "control"
    copied_tools = {
        "producer": (
            control / "ptrace-ledger-producer.py",
            LEDGER_PRODUCER_PATH,
            rows["descendant_exec_ledger_producer_sha256"],
        ),
        "validator": (
            control / "ptrace-ledger-validator.py",
            LEDGER_VALIDATOR_PATH,
            rows["descendant_exec_ledger_validator_sha256"],
        ),
        "wrapper": (
            control / "exec-ledger-wrapper",
            LEDGER_WRAPPER_PATH,
            rows["descendant_exec_ledger_wrapper_sha256"],
        ),
    }
    for label, (copy, source, expected_sha) in copied_tools.items():
        copied = stable_read(copy, "copied ledger " + label, 4 * 1024 * 1024)
        canonical = stable_read(
            source,
            "canonical ledger " + label,
            4 * 1024 * 1024,
        )
        if copied.raw != canonical.raw or copied.sha256 != expected_sha:
            raise ValidationError("copied ledger tool identity mismatch: " + label)

    manifest, manifest_file = read_json_file(
        control / "exec-ledger-manifest.json",
        "descendant exec manifest",
        4 * 1024 * 1024,
    )
    if (
        set(manifest) != {
            "schema",
            "executables",
            "boundArgvFiles",
            "dynamicArgvUid",
            "dynamicArgvGid",
            "generatedArgvDirectoryPathFshex",
            "mutableOutputPathFshexes",
        }
        or manifest["schema"] != LEDGER_MANIFEST_SCHEMA
        or manifest_file.sha256
        != rows["descendant_exec_ledger_manifest_sha256"]
    ):
        raise ValidationError("descendant exec manifest identity mismatch")
    generated_directory = Path(GENERATED_ARGV_DIRECTORY_GUEST_PATH)
    dynamic_argv_uid = manifest["dynamicArgvUid"]
    dynamic_argv_gid = manifest["dynamicArgvGid"]
    if (
        type(dynamic_argv_uid) is not int
        or type(dynamic_argv_gid) is not int
        or dynamic_argv_uid != 1
        or dynamic_argv_gid != 1
    ):
        raise ValidationError("descendant dynamic argv owner mismatch")
    if stage_binding is not None:
        command_actions = [
            action
            for action in stage_binding.plan["actions"]
            if action.get("kind") == "command"
        ]
        planned_by_role = {
            item["role"]: item for item in stage_binding.plan["outputs"]
        }
        if not command_actions and stage_binding.phase_index == 10:
            mutable_roles: Any = []
        elif len(command_actions) == 1:
            mutable_roles = command_actions[0].get("businessOutputRoles")
        else:
            raise ValidationError(
                "stage23 descendant command action is not unique"
            )
        if (
            not isinstance(mutable_roles, list)
            or len(set(mutable_roles)) != len(mutable_roles)
            or any(role not in planned_by_role for role in mutable_roles)
        ):
            raise ValidationError(
                "stage23 descendant mutable output roles are invalid"
            )
        mutable_paths = tuple(
            fsdecode_hex(
                planned_by_role[role]["pathFshex"],
                "stage23 descendant mutable output",
            )
            for role in mutable_roles
        )
    elif workload_kind == WORKLOAD_CURRENT_DRIVER:
        mutable_paths = (
            Path(CURRENT_DRIVER_NEXT_GUEST_PATH),
            Path(CURRENT_DRIVER_REPORT_GUEST_PATH),
        )
    elif workload_kind == WORKLOAD_DRY_COMPILE:
        mutable_paths = (
            Path(DRY_OUTPUT_GUEST_PATH),
            Path(DRY_REPORT_GUEST_PATH),
        )
    else:
        raise ValidationError("descendant mutable output workload is unknown")
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
        raise ValidationError("descendant mutable output paths are invalid")
    mutable_output_path_fshexes = sorted(
        os.fsencode(path).hex() for path in mutable_paths
    )
    mutable_output_set = frozenset(mutable_output_path_fshexes)
    if (
        manifest["generatedArgvDirectoryPathFshex"]
        != os.fsencode(generated_directory).hex()
        or manifest["mutableOutputPathFshexes"]
        != mutable_output_path_fshexes
    ):
        raise ValidationError("descendant dynamic argv domains mismatch")
    rootfs_value, _rootfs_file = read_json_file(
        rootfs.file.path,
        "rootfs manifest for descendant ledger",
    )
    expected_executables: list[dict[str, Any]] = []
    python_seen = False
    shell_seen = False
    for entry in rootfs_value["entries"]:
        if (
            not isinstance(entry, dict)
            or entry.get("kind") != "file"
            or not isinstance(entry.get("mode"), int)
            or not entry["mode"] & 0o111
        ):
            continue
        relative = fsdecode_hex(
            str(entry["pathFshex"]),
            "rootfs descendant executable",
        )
        if relative.is_absolute() or ".." in relative.parts:
            raise ValidationError("rootfs descendant executable path escapes")
        guest_path = "/" + str(relative)
        expected_executables.append(ledger_manifest_identity(
            guest_path,
            rootfs.rootfs / relative,
            executable=True,
        ))
        python_seen = python_seen or guest_path == LEDGER_PYTHON_GUEST_PATH
        shell_seen = shell_seen or guest_path == "/bin/sh"
    if binding is not None:
        expected_executables.append(ledger_manifest_identity(
            "/cheng-hardcap/current-driver",
            binding.driver.path,
            executable=True,
        ))
    elif stage_binding is None:
        raise ValidationError("descendant workload binding is absent")
    if stage_binding is not None:
        for item in stage_binding.frozen_roles:
            if item["kind"] == "executable":
                expected_executables.append(ledger_manifest_identity(
                    item["guestPath"],
                    fsdecode_hex(
                        item["pathFshex"],
                        "stage23 frozen executable",
                    ),
                    executable=True,
                ))
    executable_by_path: dict[str, dict[str, Any]] = {}
    for item in expected_executables:
        previous = executable_by_path.get(item["pathFshex"])
        if previous is not None and previous != item:
            raise ValidationError(
                "descendant executable guest identity is ambiguous",
            )
        executable_by_path[item["pathFshex"]] = item
    expected_executables = list(executable_by_path.values())
    expected_executables.sort(key=lambda item: item["pathFshex"])
    expected_bound = [ledger_manifest_identity(
        SUPERVISOR_GUEST_PATH,
        control / "supervisor.sh",
        executable=False,
    )]
    if (
        len(ROOTFS_IMMUTABLE_ARGV_GUEST_PATHS) == 0
        or len(set(ROOTFS_IMMUTABLE_ARGV_GUEST_PATHS))
            != len(ROOTFS_IMMUTABLE_ARGV_GUEST_PATHS)
    ):
        raise ValidationError("rootfs immutable argv closure is invalid")
    for guest_path in ROOTFS_IMMUTABLE_ARGV_GUEST_PATHS:
        parsed = Path(guest_path)
        if (
            not parsed.is_absolute()
            or parsed == Path("/")
            or any(part in (".", "..") for part in parsed.parts)
        ):
            raise ValidationError(
                "rootfs immutable argv path is not canonical"
            )
        expected_bound.append(ledger_manifest_identity(
            guest_path,
            rootfs.rootfs / parsed.relative_to("/"),
            executable=False,
        ))
    if stage_binding is not None:
        for item in stage_binding.frozen_roles:
            if item["kind"] == "bound_argv_file":
                expected_bound.append(ledger_manifest_identity(
                    item["guestPath"],
                    fsdecode_hex(
                        item["pathFshex"],
                        "stage23 frozen bound argv file",
                    ),
                    executable=False,
                ))
        expected_bound.append(ledger_manifest_identity(
            STAGE23_EXECUTION_GUEST_PATH,
            evidence_dir / "stage-control/stage-input-manifest.json",
            executable=False,
        ))
    expected_bound_by_path: dict[str, dict[str, Any]] = {}
    for item in expected_bound:
        path_fshex = item["pathFshex"]
        executable = executable_by_path.get(path_fshex)
        if executable is not None:
            if executable != item:
                raise ValidationError(
                    "descendant executable/bound argv identity is ambiguous",
                )
            # The producer places an executable/read-capable immutable path in
            # the executable domain only.  Reconstruct that partition here.
            continue
        previous = expected_bound_by_path.get(path_fshex)
        if previous is not None and previous != item:
            raise ValidationError(
                "descendant bound argv guest identity is ambiguous",
            )
        expected_bound_by_path[path_fshex] = item
    expected_bound = sorted(
        expected_bound_by_path.values(),
        key=lambda item: item["pathFshex"],
    )
    if (
        not python_seen
        or not shell_seen
        or manifest["executables"] != expected_executables
        or manifest["boundArgvFiles"] != expected_bound
        or len(expected_executables) > 512
    ):
        raise ValidationError("descendant exec manifest closure mismatch")
    executable_map = {
        item["pathFshex"]: item for item in expected_executables
    }
    bound_map = {item["pathFshex"]: item for item in expected_bound}

    ledger, ledger_file = read_json_file(
        control / "exec-ledger-receipt.json",
        "descendant exec ledger receipt",
        32 * 1024 * 1024,
    )
    if (
        set(ledger) != {"payload", "payloadSha256"}
        or ledger_file.sha256
        != rows["descendant_exec_ledger_receipt_sha256"]
        or not isinstance(ledger["payload"], dict)
    ):
        raise ValidationError("descendant exec ledger receipt shape mismatch")
    payload = ledger["payload"]
    payload_keys = {
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
        event_hash_key,
        "events",
    }
    if set(payload) != payload_keys or \
            payload.get("schema") != LEDGER_SCHEMA or \
            payload.get("status") != "PROVED" or \
            payload.get("applicability") != \
            "native_linux_parent_owned_ptrace_only":
        raise ValidationError("descendant exec ledger payload contract mismatch")
    payload_sha = str(ledger["payloadSha256"])
    require_sha(payload_sha, "descendant exec ledger payload")
    if (
        sha256_bytes(canonical_json(payload)) != payload_sha
        or payload_sha != rows["descendant_exec_ledger_payload_sha256"]
    ):
        raise ValidationError("descendant exec ledger payload hash mismatch")
    producer_identity = ledger_manifest_identity(
        LEDGER_PRODUCER_GUEST_PATH,
        control / "ptrace-ledger-producer.py",
        executable=False,
    )
    if payload["producer"] != producer_identity:
        raise ValidationError("descendant exec producer receipt mismatch")
    manifest_binding = payload.get("manifest")
    if (
        not isinstance(manifest_binding, dict)
        or set(manifest_binding) != {
            "pathFshex",
            "sha256",
            "executableCount",
            "boundArgvFileCount",
            "generatedArgvFileCount",
            "mutableOutputPathCount",
        }
        or manifest_binding["pathFshex"]
        != os.fsencode(LEDGER_MANIFEST_GUEST_PATH).hex()
        or manifest_binding["sha256"] != manifest_file.sha256
        or manifest_binding["executableCount"] != len(expected_executables)
        or manifest_binding["boundArgvFileCount"] != len(expected_bound)
        or manifest_binding["mutableOutputPathCount"] != len(mutable_paths)
    ):
        raise ValidationError("descendant exec manifest receipt mismatch")

    standalone = load_descendant_ledger_validator()
    expected_limits = {
        "maxEvents": standalone.MAX_EVENTS,
        "maxTasks": standalone.MAX_TASKS,
        "maxArgvCount": standalone.MAX_ARGV_COUNT,
        "maxArgvBytes": standalone.MAX_ARGV_BYTES,
        "maxArgvFileBindings": standalone.MAX_ARGV_FILE_BINDINGS,
        "maxEventJsonBytes": standalone.MAX_EVENT_JSON_BYTES,
        "maxOutputBytes": standalone.MAX_OUTPUT_BYTES,
    }
    if (
        payload["ptraceOptions"] != list(standalone.PTRACE_OPTION_NAMES)
        or payload["ptraceOptionMask"] != standalone.PTRACE_OPTION_MASK
        or payload["limits"] != expected_limits
        or payload["expectedRootExitCode"] != LEDGER_EXPECTED_EXIT_CODE
        or payload["actualRootExitCode"] != LEDGER_EXPECTED_EXIT_CODE
        or payload["rootExitCodeContractStatus"] != "verified"
    ):
        raise ValidationError("descendant exec proof authority mismatch")
    config, _config_file = read_json_file(
        evidence_dir / "runtime-bundle/config.json",
        "OCI config for descendant ledger",
    )
    process_args = config["process"]["args"]
    split_indices = [
        index for index, value in enumerate(process_args) if value == "--"
    ]
    if len(split_indices) != 1:
        raise ValidationError("OCI ledger command delimiter mismatch")
    command = tuple(process_args[split_indices[0] + 1:])
    expected_action = (
        ("/cheng-hardcap/current-driver",)
        if binding is not None
        else stage_binding.action_argv
        if stage_binding is not None
        else ()
    )
    expected_command = (
        "/bin/sh",
        SUPERVISOR_GUEST_PATH,
        "workload",
        expected_session_nonce,
        *expected_action,
    )
    if not NONCE_RE.fullmatch(expected_session_nonce) or \
            command != expected_command:
        raise ValidationError("descendant ledger root command mismatch")
    command_sha = ledger_framed_sha256(command)
    if (
        payload["commandArgvSha256"] != command_sha
        or rows["descendant_exec_ledger_command_argv_sha256"] != command_sha
    ):
        raise ValidationError("descendant exec command argv binding mismatch")
    events = payload["events"]
    if not isinstance(events, list):
        raise ValidationError("descendant exec events are not a list")
    event_raw = canonical_json(events)
    if (
        payload["eventCount"] != len(events)
        or rows["descendant_exec_ledger_event_count"] != str(len(events))
        or payload[event_hash_key] != sha256_bytes(event_raw)
        or len(event_raw) > standalone.MAX_EVENT_JSON_BYTES
    ):
        raise ValidationError("descendant exec event ledger hash/count mismatch")
    try:
        root_key, root_exec, generated_file_count = (
            standalone.validate_closed_event_graph(
            events,
            payload["root"],
            LEDGER_EXPECTED_EXIT_CODE,
            executable_map,
            bound_map,
            dynamic_argv_uid,
            dynamic_argv_gid,
            generated_directory,
            mutable_output_set,
        ))
    except (ValueError, RuntimeError, standalone.ValidationError) as exc:
        raise ValidationError(
            "descendant exec closed graph validation failed: " + str(exc),
        ) from exc
    if manifest_binding["generatedArgvFileCount"] != generated_file_count:
        raise ValidationError(
            "descendant generated argv file count mismatch"
        )
    shell_identity = executable_map[os.fsencode("/bin/sh").hex()]
    if (
        root_exec["executable"] != shell_identity
        or root_exec["argvSha256"] != command_sha
        or root_exec["argvCount"] != len(command)
        or root_exec["argvBytes"]
        != sum(len(os.fsencode(value)) + 1 for value in command)
    ):
        raise ValidationError("descendant exec root event mismatch")
    root_bindings = {
        item["index"]: item for item in root_exec["argvFileBindings"]
    }
    supervisor_identity = bound_map[
        os.fsencode(SUPERVISOR_GUEST_PATH).hex()
    ]
    target_guest_path = (
        "/cheng-hardcap/current-driver"
        if binding is not None
        else "/bin/bash"
    )
    if (
        root_bindings.get(1)
        != {
            "index": 1,
            "authorityDomain": standalone.ARGV_AUTHORITY_IMMUTABLE,
            "authorityGeneration": 0,
            **supervisor_identity,
        }
        or root_bindings.get(4) != {
            "index": 4,
            "authorityDomain": standalone.ARGV_AUTHORITY_IMMUTABLE,
            "authorityGeneration": 0,
            **executable_map[os.fsencode(target_guest_path).hex()],
        }
    ):
        raise ValidationError("descendant exec root argv file binding mismatch")

    wrapper_rows, wrapper_file = parse_exact_output_rows(
        control / "exec-ledger-wrapper-receipt.kv",
        LEDGER_WRAPPER_RECEIPT_KEYS,
        "descendant ledger wrapper receipt",
    )
    suffix = (
        "receipt_sha256=" + wrapper_rows["receipt_sha256"] + "\n"
    ).encode("ascii")
    if (
        not wrapper_file.raw.endswith(suffix)
        or sha256_bytes(wrapper_file.raw[:-len(suffix)])
        != wrapper_rows["receipt_sha256"]
        or wrapper_file.sha256
        != rows["descendant_exec_ledger_wrapper_receipt_sha256"]
    ):
        raise ValidationError("descendant ledger wrapper receipt hash mismatch")
    wrapper_exact = {
        "schema": LEDGER_WRAPPER_SCHEMA,
        "status": "PROVED",
        "workload_kind": workload_kind,
        "official_driver_sha256": (
            binding.driver.sha256 if binding is not None else ZERO_SHA256
        ),
        "current_build_receipt_sha256": (
            binding.build_receipt.sha256
            if binding is not None
            else ZERO_SHA256
        ),
        "source_closure_cid": (
            binding.source_closure_cid
            if binding is not None
            else ZERO_SHA256
        ),
        "source_closure_capture_sha256": (
            binding.source_closure_capture_sha256
            if binding is not None
            else ZERO_SHA256
        ),
        "source_manifest_sha256": (
            expected_source_bundle_cid
            if binding is not None
            else ZERO_SHA256
        ),
        "entry_source_sha256": (
            binding.entry_sha256 if binding is not None else ZERO_SHA256
        ),
        "producer_sha256": rows["descendant_exec_ledger_producer_sha256"],
        "validator_sha256": rows["descendant_exec_ledger_validator_sha256"],
        "manifest_sha256": manifest_file.sha256,
        "ledger_receipt_sha256": ledger_file.sha256,
        "ledger_payload_sha256": payload_sha,
        "command_argv_sha256": command_sha,
        "expected_exit_code": str(LEDGER_EXPECTED_EXIT_CODE),
        "actual_exit_code": str(LEDGER_EXPECTED_EXIT_CODE),
        "event_count": str(len(events)),
    }
    for key, expected in wrapper_exact.items():
        if wrapper_rows.get(key) != expected:
            raise ValidationError("descendant wrapper binding mismatch: " + key)
    target_stdout = stable_read(
        control / "stdout.bin",
        "ledger-bound target stdout",
        2 * 1024 * 1024 * 1024,
    )
    target_stderr = stable_read(
        control / "stderr.bin",
        "ledger-bound target stderr",
        2 * 1024 * 1024 * 1024,
    )
    output_exact = {
        "target_stdout_sha256": target_stdout.sha256,
        "target_stdout_size": str(target_stdout.size),
        "target_stderr_sha256": target_stderr.sha256,
        "target_stderr_size": str(target_stderr.size),
    }
    for key, expected in output_exact.items():
        if wrapper_rows[key] != expected:
            raise ValidationError("descendant ledger output binding mismatch")
    stage_result: dict[str, str] | None = None
    if workload_kind == WORKLOAD_CURRENT_DRIVER:
        current_driver_next = stable_read(
            control / "current-driver.next",
            "current driver next authority output",
            2 * 1024 * 1024 * 1024,
        )
        authority_report = stable_read(
            control / "current-driver.report",
            "current driver report authority output",
            2 * 1024 * 1024 * 1024,
        )
        if current_driver_next.size <= 0 or authority_report.size <= 0:
            raise ValidationError("current driver authority output is empty")
        validate_current_driver_authority(
            current_driver_next,
            authority_report,
            binding,
            expected_source_bundle_cid,
        )
        current_output_sha = current_driver_next.sha256
        current_output_size = str(current_driver_next.size)
        current_output_mode = format(
            stat.S_IMODE(current_driver_next.mode),
            "o",
        )
        dry_rows = None
    elif workload_kind == WORKLOAD_DRY_COMPILE:
        if binding is None:
            raise ValidationError("dry compile current binding is absent")
        authority_report = stable_read(
            control / "dry-compile.report",
            "dry compile report authority output",
            2 * 1024 * 1024 * 1024,
        )
        dry_rows = validate_dry_compile_authority(
            authority_report,
            target_stdout,
            target_stderr,
            command[4:],
            binding,
        )
        current_output_sha = ZERO_SHA256
        current_output_size = "0"
        current_output_mode = "0"
        stage_result = None
    else:
        if stage_binding is None:
            raise ValidationError("stage23 phase binding is absent")
        stage_pre, stage_pre_file = read_json_file(
            evidence_dir / "stage-pre-tree.json",
            "stage23 phase pre-tree",
            256 * 1024 * 1024,
        )
        authority_report, stage_result = validate_stage23_phase_result(
            stage_binding,
            target_stdout,
            target_stderr,
            stage_pre,
            sha256_bytes(canonical_json(stage_pre)),
        )
        if stage_pre_file.raw != canonical_json(stage_pre) + b"\n":
            raise ValidationError("stage23 phase pre-tree is not canonical")
        current_output_sha = ZERO_SHA256
        current_output_size = "0"
        current_output_mode = "0"
        dry_rows = None
    product_exact = {
        "workload_output_status": (
            "materialized_executable"
            if workload_kind == WORKLOAD_CURRENT_DRIVER
            else "materialized_stage_phase_outputs"
            if workload_kind == WORKLOAD_BOOTSTRAP_STAGE23_PHASE
            else "proved_absent"
        ),
        "workload_output_sha256": (
            stage_result["output_set_sha256"]
            if stage_result is not None
            else current_output_sha
        ),
        "workload_output_size": (
            stage_result["output_count"]
            if stage_result is not None
            else current_output_size
        ),
        "workload_output_mode": (
            "0" if stage_result is not None else current_output_mode
        ),
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
        "current_driver_next_sha256": current_output_sha,
        "current_driver_next_size": current_output_size,
        "current_driver_next_mode": current_output_mode,
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
        "stage_authority_manifest_sha256": (
            stage_binding.authority_manifest.sha256
            if stage_binding is not None
            else ZERO_SHA256
        ),
        "stage_execution_manifest_sha256": (
            stage_binding.execution_manifest.sha256
            if stage_binding is not None
            else ZERO_SHA256
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
        "stage_pre_tree_sha256": (
            stage_result["pre_tree_sha256"]
            if stage_result is not None
            else ZERO_SHA256
        ),
        "stage_post_tree_sha256": (
            stage_result["post_tree_sha256"]
            if stage_result is not None
            else ZERO_SHA256
        ),
        "stage_declared_delta_sha256": (
            stage_result["declared_delta_sha256"]
            if stage_result is not None
            else ZERO_SHA256
        ),
        "stage_output_set_sha256": (
            stage_result["output_set_sha256"]
            if stage_result is not None
            else ZERO_SHA256
        ),
        "stage_output_count": (
            stage_result["output_count"]
            if stage_result is not None
            else "0"
        ),
        "stage_terminal_relative_path": (
            stage_binding.terminal_relative_path
            if stage_binding is not None
            else ""
        ),
        "stage_terminal_sha256": (
            authority_report.sha256
            if stage_binding is not None
            else ZERO_SHA256
        ),
        "stage_terminal_receipt_sha256": (
            stage_result["terminal_receipt_sha256"]
            if stage_result is not None
            else ZERO_SHA256
        ),
    }
    validate_workload_report_identity(wrapper_rows, rows, authority_report)
    for key, expected in product_exact.items():
        if wrapper_rows[key] != expected or rows[key] != expected:
            raise ValidationError("current driver authority output mismatch: " + key)
    expected_phase_row_sha256 = (
        authority_report.sha256
        if stage_binding is not None
        else ZERO_SHA256
    )
    if rows["phase_row_receipt_sha256"] != expected_phase_row_sha256:
        raise ValidationError("phase row receipt binding mismatch")
    producer_stdout_rows, producer_stdout = parse_exact_output_rows(
        control / "exec-ledger-producer.stdout",
        (
            "ptrace_exec_ledger_status",
            "ptrace_exec_ledger_receipt_sha256",
        ),
        "descendant ledger producer stdout",
    )
    producer_stderr = stable_read(
        control / "exec-ledger-producer.stderr",
        "descendant ledger producer stderr",
        4 * 1024 * 1024,
    )
    validator_stdout_rows, validator_stdout = parse_exact_output_rows(
        control / "exec-ledger-validator.stdout",
        (
            "descendant_exec_ledger_receipt_validation_status",
            "receipt_sha256",
            "payload_sha256",
            "manifest_sha256",
            "producer_sha256",
            "expected_root_exit_code",
            "actual_root_exit_code",
            "event_count",
        ),
        "descendant ledger validator stdout",
    )
    validator_stderr = stable_read(
        control / "exec-ledger-validator.stderr",
        "descendant ledger validator stderr",
        4 * 1024 * 1024,
    )
    if producer_stdout_rows != {
        "ptrace_exec_ledger_status": "PROVED",
        "ptrace_exec_ledger_receipt_sha256": payload_sha,
    } or producer_stderr.raw or validator_stderr.raw:
        raise ValidationError("descendant ledger producer/validator status mismatch")
    validator_expected = {
        "descendant_exec_ledger_receipt_validation_status": "PROVED",
        "receipt_sha256": ledger_file.sha256,
        "payload_sha256": payload_sha,
        "manifest_sha256": manifest_file.sha256,
        "producer_sha256": rows["descendant_exec_ledger_producer_sha256"],
        "expected_root_exit_code": str(LEDGER_EXPECTED_EXIT_CODE),
        "actual_root_exit_code": str(LEDGER_EXPECTED_EXIT_CODE),
        "event_count": str(len(events)),
    }
    if validator_stdout_rows != validator_expected:
        raise ValidationError("standalone descendant validator output mismatch")
    if rows["ledger_standalone_validation_sha256"] != validator_stdout.sha256:
        raise ValidationError(
            "standalone descendant validator receipt binding mismatch"
        )
    log_hashes = {
        "producer_stdout_sha256": producer_stdout.sha256,
        "producer_stderr_sha256": producer_stderr.sha256,
        "validator_stdout_sha256": validator_stdout.sha256,
        "validator_stderr_sha256": validator_stderr.sha256,
    }
    for key, expected in log_hashes.items():
        if wrapper_rows[key] != expected:
            raise ValidationError("descendant ledger log hash mismatch: " + key)
    validation_output = stable_read(
        control / "exec-ledger-validation.out",
        "descendant ledger validation output",
        4 * 1024 * 1024,
    )
    expected_validation = (
        "exec_ledger_wrapper_status=PROVED\n"
        f"exec_ledger_wrapper_receipt_sha256={wrapper_file.sha256}\n"
    ).encode("ascii")
    if validation_output.raw != expected_validation:
        raise ValidationError("descendant ledger validation marker mismatch")
    root_namespace_pid = root_key[0]
    if type(root_namespace_pid) is not int or root_namespace_pid <= 0:
        raise ValidationError("descendant ledger root namespace PID is invalid")
    return root_namespace_pid


def validate_control_transcript(
    transcript: dict[str, Any],
    runtime_id: str,
    nonce: str,
    mode: str,
    init_namespace_pid: int,
    during_namespace_pids: list[int],
    descendant_root_namespace_pid: int | None,
) -> None:
    if set(transcript) != {
        "runtimeId", "sessionNonceSha256", "events", "commands",
    } or transcript["runtimeId"] != runtime_id or \
            transcript["sessionNonceSha256"] != sha256_bytes(
                nonce.encode("ascii"),
            ):
        raise ValidationError("control transcript identity mismatch")
    if mode == "workload":
        if type(descendant_root_namespace_pid) is not int or \
                descendant_root_namespace_pid <= 0:
            raise ValidationError(
                "control transcript descendant root identity is absent",
            )
        before_namespace_pid = descendant_root_namespace_pid
    else:
        if descendant_root_namespace_pid is not None:
            raise ValidationError(
                "attack transcript unexpectedly has a descendant root",
            )
        before_namespace_pid = init_namespace_pid
    expected_events = [
        f"before {nonce} {before_namespace_pid}",
        "during " + nonce + " " + " ".join(
            str(value) for value in during_namespace_pids
        ),
    ]
    expected_commands = [f"start {nonce}", f"continue {nonce}"]
    if mode == "workload":
        expected_events.append(f"after {nonce} 0")
        expected_commands.append(f"release {nonce}")
    if transcript["events"] != expected_events or \
            transcript["commands"] != expected_commands:
        raise ValidationError("control transcript/live history mismatch")


def validate_monotonic_wall_fields(rows: dict[str, str]) -> int:
    start_ns = require_canonical_uint(
        rows["workload_wall_start_monotonic_ns"],
        "workload monotonic wall start",
    )
    end_ns = require_canonical_uint(
        rows["workload_wall_end_monotonic_ns"],
        "workload monotonic wall end",
    )
    elapsed_ns = require_canonical_uint(
        rows["workload_wall_elapsed_ns"],
        "workload monotonic wall elapsed",
    )
    if start_ns <= 0 or end_ns < start_ns or elapsed_ns != end_ns - start_ns:
        raise ValidationError("workload monotonic wall arithmetic mismatch")
    return elapsed_ns


def require_receipt_common(
    rows: dict[str, str],
    mode: str,
    workload_kind: str,
) -> None:
    if workload_kind not in WORKLOAD_KINDS:
        raise ValidationError("receipt workload contract is unknown")
    target_env = (
        DRY_TARGET_ENV
        if workload_kind == WORKLOAD_DRY_COMPILE
        else FIXED_TARGET_ENV
    )
    expected = {
        "tool": "tools/beat_c_linux_cgroup_v2_hard_memory_gate.sh",
        "schema": SCHEMA,
        "applicability": APPLICABILITY,
        "driver_role": "production",
        "hard_memory_limit_proof_status": PROOF_STATUS,
        "memory_enforcement_scope": MEMORY_SCOPE,
        "mode": mode,
        "workload_kind": workload_kind,
        "memory_limit_bytes": str(LIMIT_BYTES),
        "memory_swap_max_bytes": str(SWAP_MAX_BYTES),
        "pids_max": str(PIDS_MAX),
        "attack_child_count": str(ATTACK_CHILD_COUNT),
        "attack_child_bytes": str(ATTACK_CHILD_BYTES),
        "attack_aggregate_bytes": str(ATTACK_AGGREGATE_BYTES),
        "cgroup_mount_type": "cgroup2",
        "crun_clone3_policy": CRUN_CLONE3_POLICY,
        "crun_clone3_exact_flags": str(CRUN_CLONE3_EXACT_FLAGS),
        "crun_clone3_intercept_count": "1",
        "crun_exec_transition_count": str(CRUN_EXACT_EXEC_TRANSITIONS),
        "target_env_count": str(len(target_env)),
        "target_env_sha256": framed_sha256(target_env),
        "descendant_exec_ledger_schema": LEDGER_SCHEMA,
        "descendant_exec_ledger_expected_exit_code":
            str(LEDGER_EXPECTED_EXIT_CODE),
        "descendant_exec_ledger_actual_exit_code":
            str(LEDGER_EXPECTED_EXIT_CODE),
        "artifact_manifest_schema": ARTIFACT_SCHEMA,
    }
    for key, value in expected.items():
        if rows.get(key) != value:
            raise ValidationError(f"receipt common field mismatch: {key}")
    for key in (
        "delegation_manifest_sha256",
        "crun_sha256",
        "rootfs_manifest_sha256",
        "rootfs_tree_cid",
        "oci_config_sha256",
        "input_manifest_sha256",
        "live_before_receipt_sha256",
        "live_during_receipt_sha256",
        "live_after_receipt_sha256",
        "live_cleanup_receipt_sha256",
        "runner_sha256",
        "validator_sha256",
        "artifact_manifest_sha256",
        "descendant_exec_ledger_producer_sha256",
        "descendant_exec_ledger_validator_sha256",
        "descendant_exec_ledger_wrapper_sha256",
    ):
        require_sha(rows.get(key, ""), "receipt " + key)
    for key in (
        "native_descriptor_sha256",
        "native_descriptor_payload_sha256",
        "native_descriptor_candidate_entry_sha256",
        "native_descriptor_worker_sha256",
        "native_descriptor_snapshot_manifest_sha256",
    ):
        require_sha(
            rows.get(key, ""),
            "receipt " + key,
            nonzero=(
                workload_kind != WORKLOAD_BOOTSTRAP_STAGE23_PHASE
            ),
        )
    for key in (
        "descendant_exec_ledger_manifest_sha256",
        "descendant_exec_ledger_receipt_sha256",
        "descendant_exec_ledger_payload_sha256",
        "descendant_exec_ledger_wrapper_receipt_sha256",
        "descendant_exec_ledger_command_argv_sha256",
        "ledger_standalone_validation_sha256",
        "workload_output_sha256",
        "workload_report_sha256",
    ):
        require_sha(
            rows.get(key, ""),
            "receipt " + key,
            nonzero=(
                mode == "workload"
                and (
                    key == "workload_report_sha256"
                    or workload_kind == WORKLOAD_CURRENT_DRIVER
                )
            ),
        )
    for key in (
        "current_driver_next_sha256",
        "current_driver_report_sha256",
    ):
        require_sha(
            rows.get(key, ""),
            "receipt " + key,
            nonzero=(
                mode == "workload"
                and workload_kind == WORKLOAD_CURRENT_DRIVER
            ),
        )
    for key in (
        "stage_authority_manifest_sha256",
        "stage_execution_manifest_sha256",
        "stage_manifest_pair_commitment_sha256",
        "stage_phase_plan_sha256",
        "stage_pre_tree_sha256",
        "stage_post_tree_sha256",
        "stage_declared_delta_sha256",
        "stage_output_set_sha256",
        "stage_terminal_sha256",
        "stage_terminal_receipt_sha256",
        "phase_row_receipt_sha256",
    ):
        require_sha(
            rows.get(key, ""),
            "receipt " + key,
            nonzero=(
                mode == "workload"
                and workload_kind == WORKLOAD_BOOTSTRAP_STAGE23_PHASE
            ) or (
                key in (
                    "stage_authority_manifest_sha256",
                    "stage_execution_manifest_sha256",
                    "stage_manifest_pair_commitment_sha256",
                    "stage_phase_plan_sha256",
                )
                and workload_kind == WORKLOAD_BOOTSTRAP_STAGE23_PHASE
            ),
        )
    expected_ledger_tools = {
        "descendant_exec_ledger_producer_sha256": stable_read(
            LEDGER_PRODUCER_PATH,
            "canonical ptrace ledger producer",
            4 * 1024 * 1024,
        ).sha256,
        "descendant_exec_ledger_validator_sha256": stable_read(
            LEDGER_VALIDATOR_PATH,
            "canonical ptrace ledger validator",
            4 * 1024 * 1024,
        ).sha256,
        "descendant_exec_ledger_wrapper_sha256": stable_read(
            LEDGER_WRAPPER_PATH,
            "canonical ptrace ledger wrapper",
            4 * 1024 * 1024,
        ).sha256,
    }
    for key, expected in expected_ledger_tools.items():
        if rows.get(key) != expected:
            raise ValidationError("receipt ledger tool identity mismatch: " + key)
    if rows["validator_sha256"] != stable_read(
        Path(__file__).resolve(strict=True),
        "validator source",
        4 * 1024 * 1024,
    ).sha256:
        raise ValidationError("receipt validator identity mismatch")
    if rows["runner_sha256"] != stable_read(
        ROOT / "tools/beat_c_linux_cgroup_v2_hard_memory_gate.py",
        "runner source",
        4 * 1024 * 1024,
    ).sha256:
        raise ValidationError("receipt runner identity mismatch")
    require_uint(rows["artifact_count"], "artifact count")
    require_uint(rows["artifact_directory_count"], "artifact directory count")
    require_uint(rows["current_driver_next_size"], "current driver next size")
    require_uint(rows["current_driver_report_size"], "current driver report size")
    require_uint(rows["workload_output_size"], "workload output size")
    require_uint(rows["workload_report_size"], "workload report size")
    validate_monotonic_wall_fields(rows)
    for key in (
        "dry_source_file_count",
        "dry_source_line_count",
        "dry_source_byte_count",
        "dry_source_max_file_bytes",
        "dry_exec_phase_actual_total_ms",
        "dry_full_theory_time_guard_recommended_ms",
        "dry_full_theory_rss_modeled_guard_estimate_bytes",
    ):
        require_canonical_uint(rows[key], "receipt " + key)


def validate_materialized_source_root(
    evidence_dir: Path,
    binding: CurrentBinding,
) -> None:
    source_root = evidence_dir / "source-root"
    if source_root.resolve(strict=True) != source_root or source_root.is_symlink():
        raise ValidationError("materialized source root is not canonical")
    expected = {
        relative: (digest, mode)
        for relative, digest, mode in binding.source_members
    }
    observed: set[str] = set()
    for path in sorted(source_root.rglob("*"), key=lambda item: os.fsencode(str(item))):
        if path.is_symlink():
            raise ValidationError("materialized source symlink is forbidden")
        if path.is_dir():
            continue
        if not path.is_file():
            raise ValidationError("materialized source special file is forbidden")
        relative = str(path.relative_to(source_root))
        if relative in observed or relative not in expected:
            raise ValidationError("materialized source path mismatch")
        observed.add(relative)
        digest, source_mode = expected[relative]
        current = stable_read(
            path,
            "materialized source member",
            2 * 1024 * 1024 * 1024,
        )
        expected_mode = 0o100500 if source_mode & 0o111 else 0o100400
        if current.sha256 != digest or current.mode != expected_mode:
            raise ValidationError("materialized source identity mismatch")
    if observed != set(expected):
        raise ValidationError("materialized source tree is incomplete")


def validate_oci_artifact(
    evidence_dir: Path,
    rows: dict[str, str],
    mode: str,
    workload_kind: str,
    nonce: str,
    delegation: DelegationManifest,
    rootfs: RootfsManifest,
    binding: CurrentBinding | None,
    stage_binding: Stage23PhaseBinding | None,
) -> None:
    config, config_file = read_json_file(
        evidence_dir / "runtime-bundle/config.json",
        "OCI config",
    )
    if config_file.sha256 != rows["oci_config_sha256"]:
        raise ValidationError("OCI config identity mismatch")
    if set(config) != {
        "ociVersion", "process", "root", "hostname", "mounts", "linux",
    } or config["ociVersion"] != "1.1.0":
        raise ValidationError("OCI config top-level shape mismatch")
    process = config["process"]
    linux = config["linux"]
    mounts = config["mounts"]
    if not isinstance(process, dict) or not isinstance(linux, dict) or \
            not isinstance(mounts, list):
        raise ValidationError("OCI config core type mismatch")
    if set(process) != {
        "terminal", "user", "args", "env", "cwd", "capabilities",
        "noNewPrivileges", "rlimits",
    } or process.get("terminal") is not False or process.get("user") != {
        "uid": 1,
        "gid": 1,
        "additionalGids": [],
    } or process.get("cwd") != "/" or process.get("rlimits") != [{
        "type": "RLIMIT_CORE",
        "hard": 0,
        "soft": 0,
    }]:
        raise ValidationError("OCI process shape mismatch")
    args = process.get("args")
    if not isinstance(args, list) or any(
        not isinstance(value, str) for value in args
    ):
        raise ValidationError("OCI process argv shape mismatch")
    if mode == "workload":
        if workload_kind == WORKLOAD_CURRENT_DRIVER:
            if binding is None:
                raise ValidationError("current OCI binding is absent")
            target_output_executable = CURRENT_DRIVER_NEXT_GUEST_PATH
            target_output_report = CURRENT_DRIVER_REPORT_GUEST_PATH
            authority_output_executable = (
                CURRENT_DRIVER_NEXT_AUTHORITY_GUEST_PATH
            )
            authority_output_report = (
                CURRENT_DRIVER_REPORT_AUTHORITY_GUEST_PATH
            )
            expected_entry_path = binding.entry_path
        elif workload_kind == WORKLOAD_DRY_COMPILE:
            if binding is None:
                raise ValidationError("dry OCI binding is absent")
            target_output_executable = DRY_OUTPUT_GUEST_PATH
            target_output_report = DRY_REPORT_GUEST_PATH
            authority_output_executable = DRY_OUTPUT_AUTHORITY_GUEST_PATH
            authority_output_report = DRY_REPORT_AUTHORITY_GUEST_PATH
            expected_entry_path = (
                "/cheng-current-source/repo/" + binding.entry_path
            )
        else:
            if stage_binding is None:
                raise ValidationError("stage23 OCI binding is absent")
            target_output_executable = WORK_GUEST_PATH + "/stage-unused-output"
            target_output_report = WORK_GUEST_PATH + "/stage-unused-report"
            authority_output_executable = (
                CONTROL_GUEST_PATH + "/stage-unused-output"
            )
            authority_output_report = (
                CONTROL_GUEST_PATH + "/stage-unused-report"
            )
            expected_entry_path = "not_applicable"
        fixed_prefix = [
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
            "/cheng-hardcap-control/stdout.bin",
            "--target-stderr",
            "/cheng-hardcap-control/stderr.bin",
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
            binding.driver.sha256 if binding is not None else ZERO_SHA256,
            "--expected-current-build-receipt-sha256",
            (
                binding.build_receipt.sha256
                if binding is not None
                else ZERO_SHA256
            ),
            "--expected-source-closure-cid",
            (
                binding.source_closure_cid
                if binding is not None
                else ZERO_SHA256
            ),
            "--expected-source-closure-capture-sha256",
            (
                binding.source_closure_capture_sha256
                if binding is not None
                else ZERO_SHA256
            ),
            "--expected-source-manifest-sha256",
            (
                rows["native_descriptor_snapshot_manifest_sha256"]
                if binding is not None
                else ZERO_SHA256
            ),
            "--expected-entry-source-sha256",
            binding.entry_sha256 if binding is not None else ZERO_SHA256,
            "--expected-target",
            binding.target if binding is not None else "not_applicable",
            "--expected-entry-path",
            expected_entry_path,
            "--expected-session-nonce",
            nonce,
            "--expected-producer-sha256",
            rows["descendant_exec_ledger_producer_sha256"],
            "--expected-validator-sha256",
            rows["descendant_exec_ledger_validator_sha256"],
            "--expected-manifest-sha256",
            rows["descendant_exec_ledger_manifest_sha256"],
            "--expected-exit-code",
            str(LEDGER_EXPECTED_EXIT_CODE),
            "--timeout-seconds",
        ]
        stage_suffix: list[str] = []
        if stage_binding is not None:
            stage_suffix = [
                "--stage-input-manifest",
                STAGE23_EXECUTION_GUEST_PATH,
                "--stage-manifest-pair-commitment",
                STAGE23_MANIFEST_PAIR_GUEST_PATH,
                "--stage-evidence-dir",
                STAGE23_EVIDENCE_GUEST_PATH,
                "--expected-stage-authority-manifest-sha256",
                stage_binding.authority_manifest.sha256,
                "--expected-stage-input-manifest-sha256",
                stage_binding.execution_manifest.sha256,
                "--expected-stage-manifest-pair-commitment-sha256",
                stage_binding.manifest_pair_commitment.sha256,
                "--expected-stage-plan-sha256",
                stage_binding.plan_sha256,
            ]
        suffix_offset = len(fixed_prefix) + 1 + len(stage_suffix)
        if (
            len(args) < suffix_offset + 5
            or args[:len(fixed_prefix)] != fixed_prefix
            or not args[len(fixed_prefix)].isdigit()
            or not 1 <= int(args[len(fixed_prefix)]) <= 86_400
            or args[len(fixed_prefix) + 1:suffix_offset] != stage_suffix
            or args[suffix_offset:suffix_offset + 5] != [
                "--",
                "/bin/sh",
                SUPERVISOR_GUEST_PATH,
                mode,
                nonce,
            ]
        ):
            raise ValidationError("OCI ledger wrapper argv mismatch")
        target_argv = args[suffix_offset + 5:]
    else:
        if len(args) < 4 or args[:4] != [
            "/bin/sh",
            SUPERVISOR_GUEST_PATH,
            mode,
            nonce,
        ]:
            raise ValidationError("OCI supervisor argv mismatch")
        target_argv = args[4:]
    if any(not isinstance(value, str) for value in target_argv) or \
            len(target_argv) != require_uint(
                rows["target_argv_count"],
                "receipt target argv count",
            ) or framed_sha256(target_argv) != rows["target_argv_sha256"]:
        raise ValidationError("OCI target argv mismatch")
    if mode == "workload" and \
            workload_kind != WORKLOAD_BOOTSTRAP_STAGE23_PHASE:
        required_outputs = (
            "--out:" + target_output_executable,
            "--report-out:" + target_output_report,
        )
        if (
            [
                value for value in target_argv if value.startswith("--out:")
            ] != [required_outputs[0]]
            or [
                value
                for value in target_argv
                if value.startswith("--report-out:")
            ] != [required_outputs[1]]
        ):
            raise ValidationError("OCI target output authority mismatch")
    expected_env = (
        DRY_TARGET_ENV
        if workload_kind == WORKLOAD_DRY_COMPILE
        else FIXED_TARGET_ENV
    )
    if process.get("env") != list(expected_env) or \
            process.get("noNewPrivileges") is not True:
        raise ValidationError("OCI process environment/privilege mismatch")
    capabilities = process.get("capabilities")
    if not isinstance(capabilities, dict) or any(capabilities.values()):
        raise ValidationError("OCI process capability mismatch")
    if config["hostname"] != "cheng-hardcap" or config["root"] != {
        "path": str(rootfs.rootfs),
        "readonly": True,
    } or set(linux) != {
        "cgroupsPath", "uidMappings", "gidMappings", "namespaces",
        "maskedPaths", "readonlyPaths",
    }:
        raise ValidationError("OCI root/cgroup authority mismatch")
    leaf = fsdecode_hex(rows["leaf_path_fshex"], "receipt leaf path")
    expected_cgroups_path = "/" + str(leaf.relative_to(delegation.mount))
    if linux.get("cgroupsPath") != expected_cgroups_path:
        raise ValidationError("OCI cgroup attachment mismatch")
    if linux.get("uidMappings") != [{
        "containerID": 1,
        "hostID": require_uint(delegation.rows["delegate_uid"], "delegate uid"),
        "size": 1,
    }] or linux.get("gidMappings") != [{
        "containerID": 1,
        "hostID": require_uint(delegation.rows["delegate_gid"], "delegate gid"),
        "size": 1,
    }]:
        raise ValidationError("OCI user namespace mapping mismatch")
    if linux.get("namespaces") != [
        {"type": "mount"},
        {"type": "pid"},
        {"type": "ipc"},
        {"type": "uts"},
        {"type": "user"},
        {"type": "cgroup"},
        {"type": "network"},
    ] or linux.get("maskedPaths") != [
        "/proc/acpi",
        "/proc/asound",
        "/proc/kcore",
        "/proc/keys",
        "/proc/latency_stats",
        "/proc/timer_list",
        "/proc/timer_stats",
        "/proc/sched_debug",
        "/sys/firmware",
    ] or linux.get("readonlyPaths") != [
        "/proc/bus",
        "/proc/fs",
        "/proc/irq",
        "/proc/sys",
        "/proc/sysrq-trigger",
    ]:
        raise ValidationError("OCI namespace sequence mismatch")
    mount_by_destination: dict[str, dict[str, Any]] = {}
    for mount in mounts:
        if not isinstance(mount, dict) or \
                not isinstance(mount.get("destination"), str) or \
                mount["destination"] in mount_by_destination:
            raise ValidationError("OCI mount row mismatch")
        mount_by_destination[mount["destination"]] = mount
    expected_destinations = {
        "/proc",
        "/dev",
        "/tmp",
        "/cheng-hardcap-work",
        "/cheng-hardcap-control",
    }
    if workload_kind == WORKLOAD_BOOTSTRAP_STAGE23_PHASE:
        expected_destinations.update({
            STAGE23_SOURCE_GUEST_PATH,
            STAGE23_EVIDENCE_GUEST_PATH,
            STAGE23_CONTROL_GUEST_PATH,
            STAGE23_MANIFEST_PAIR_GUEST_PATH,
        })
    else:
        expected_destinations.add("/cheng-current-source/repo")
    if mode == "workload" and binding is not None:
        expected_destinations.add("/cheng-hardcap/current-driver")
    if set(mount_by_destination) != expected_destinations:
        raise ValidationError("OCI mount set mismatch")
    exact_mounts: dict[str, dict[str, Any]] = {
        "/proc": {
            "destination": "/proc",
            "type": "proc",
            "source": "proc",
            "options": ["nosuid", "noexec", "nodev"],
        },
        "/dev": {
            "destination": "/dev",
            "type": "tmpfs",
            "source": "tmpfs",
            "options": [
                "rw", "nosuid", "noexec", "size=65536", "mode=755",
            ],
        },
        "/tmp": {
            "destination": "/tmp",
            "type": "tmpfs",
            "source": "tmpfs",
            "options": [
                "rw", "nosuid", "nodev", "noexec",
                "size=268435456", "mode=1777",
            ],
        },
        "/cheng-hardcap-work": {
            "destination": "/cheng-hardcap-work",
            "type": "tmpfs",
            "source": "tmpfs",
            "options": [
                "rw", "exec", "nosuid", "nodev",
                "size=2147483648", "mode=1777",
            ],
        },
        "/cheng-hardcap-control": {
            "destination": "/cheng-hardcap-control",
            "type": "bind",
            "source": str(evidence_dir / "control"),
            "options": ["rbind", "rw", "nosuid", "nodev"],
        },
    }
    if stage_binding is not None:
        exact_mounts.update({
            STAGE23_SOURCE_GUEST_PATH: {
                "destination": STAGE23_SOURCE_GUEST_PATH,
                "type": "bind",
                "source": str(stage_binding.source_root),
                "options": ["rbind", "ro", "nosuid", "nodev"],
            },
            STAGE23_EVIDENCE_GUEST_PATH: {
                "destination": STAGE23_EVIDENCE_GUEST_PATH,
                "type": "bind",
                "source": str(stage_binding.evidence_root),
                "options": ["rbind", "rw", "nosuid", "nodev"],
            },
            STAGE23_CONTROL_GUEST_PATH: {
                "destination": STAGE23_CONTROL_GUEST_PATH,
                "type": "bind",
                "source": str(evidence_dir / "stage-control"),
                "options": ["rbind", "ro", "nosuid", "nodev"],
            },
            STAGE23_MANIFEST_PAIR_GUEST_PATH: {
                "destination": STAGE23_MANIFEST_PAIR_GUEST_PATH,
                "type": "bind",
                "source": str(
                    stage_binding.manifest_pair_commitment.path
                ),
                "options": ["bind", "ro", "nosuid", "nodev"],
            },
        })
    else:
        exact_mounts["/cheng-current-source/repo"] = {
            "destination": "/cheng-current-source/repo",
            "type": "bind",
            "source": str(evidence_dir / "source-root"),
            "options": ["rbind", "ro", "nosuid", "nodev"],
        }
    if mode == "workload" and binding is not None:
        exact_mounts["/cheng-hardcap/current-driver"] = {
            "destination": "/cheng-hardcap/current-driver",
            "type": "bind",
            "source": str(binding.driver.path),
            "options": ["bind", "ro", "nosuid", "nodev"],
        }
    if mount_by_destination != exact_mounts:
        raise ValidationError("OCI source closure mount mismatch")
    supervisor = stable_read(
        evidence_dir / "control/supervisor.sh",
        "supervisor program",
        1024 * 1024,
    )
    if supervisor.sha256 != EXPECTED_SUPERVISOR_SHA256:
        raise ValidationError("supervisor program identity mismatch")
    if binding is not None:
        validate_materialized_source_root(evidence_dir, binding)


def validate_live_history(
    evidence_dir: Path,
    rows: dict[str, str],
    mode: str,
    delegation: DelegationManifest,
    rootfs: RootfsManifest,
    binding: CurrentBinding | None,
    workload_kind: str = WORKLOAD_CURRENT_DRIVER,
    stage_binding: Stage23PhaseBinding | None = None,
    descendant_root_namespace_pid: int | None = None,
) -> str:
    audits: dict[str, dict[str, Any]] = {}
    for phase in ("before", "during", "after", "cleanup"):
        audit, file = parse_self_hashed_json(
            evidence_dir / f"live-{phase}.json",
            LIVE_SCHEMA,
            LIVE_FIELDS,
            f"live {phase} audit",
        )
        if file.sha256 != rows[f"live_{phase}_receipt_sha256"]:
            raise ValidationError("live audit file identity mismatch")
        audits[phase] = audit
    nonce = audits["before"]["sessionNonce"]
    require_sha(nonce, "live session nonce")
    runtime_id = rows["runtime_id"]
    if not RUNTIME_ID_RE.fullmatch(runtime_id):
        raise ValidationError("live runtime identity mismatch")
    init_pid = require_uint(rows["init_host_pid"], "receipt init PID")
    init_starttime = require_uint(
        rows["init_host_pid_starttime"],
        "receipt init PID starttime",
    )
    if init_pid <= 0 or init_starttime <= 0:
        raise ValidationError("receipt init process identity is invalid")
    leaf_path = rows["leaf_path_fshex"]
    leaf_device = require_uint(rows["leaf_device"], "receipt leaf device")
    leaf_inode = require_uint(rows["leaf_inode"], "receipt leaf inode")
    parent_path = rows["delegation_parent_path_fshex"]
    parent_device = require_uint(
        rows["delegation_parent_device"],
        "receipt parent device",
    )
    parent_inode = require_uint(
        rows["delegation_parent_inode"],
        "receipt parent inode",
    )
    for phase, audit in audits.items():
        if not isinstance(audit.get("eventsLocal"), dict) or \
                set(audit["eventsLocal"]) != {
                    "low", "high", "max", "oom", "oom_kill",
                    "oom_group_kill",
                } or any(
                    not isinstance(value, int) or value < 0
                    for value in audit["eventsLocal"].values()
                ):
            raise ValidationError(f"live {phase} event vector mismatch")
        if phase in ("before", "during") and \
                any(audit["eventsLocal"].values()):
            raise ValidationError(f"live {phase} event vector is not fresh")
        for key in ("memorySwapCurrent", "memoryCurrent", "memoryPeak"):
            if not isinstance(audit.get(key), int) or audit[key] < 0:
                raise ValidationError(f"live {phase} memory field mismatch")
        common = {
            "schema": LIVE_SCHEMA,
            "phase": phase,
            "mode": mode,
            "sessionNonce": nonce,
            "runtimeId": runtime_id,
            "parentPathFshex": parent_path,
            "parentDevice": parent_device,
            "parentInode": parent_inode,
            "initHostPid": init_pid,
            "memoryMax": LIMIT_BYTES,
            "memorySwapMax": SWAP_MAX_BYTES,
            "pidsMax": PIDS_MAX,
            "oomGroup": 1,
            "hostMachine": delegation.rows["host_machine"],
            "kernelRelease": delegation.rows["kernel_release"],
        }
        for key, expected in common.items():
            if audit.get(key) != expected:
                raise ValidationError(f"live {phase} field mismatch: {key}")
        if phase == "cleanup":
            cleanup_exact = {
                "leafPathFshex": leaf_path,
                "leafExists": False,
                "leafDevice": 0,
                "leafInode": 0,
                "initHostPidStarttime": 0,
                "cgroupProcs": [],
                "namespacePidMap": [],
                "memorySwapCurrent": 0,
                "memoryCurrent": 0,
                "memoryPeak": 0,
                "targetExeSha256": ZERO_SHA256,
                "targetElfMachine": "",
                "runtimeStateAbsent": True,
                "pidFileAbsent": True,
            }
            if any(audit.get(key) != expected
                   for key, expected in cleanup_exact.items()) or \
                    any(audit["eventsLocal"].values()):
                raise ValidationError("live cleanup artifact mismatch")
        else:
            if audit["leafPathFshex"] != leaf_path or \
                    audit["leafExists"] is not True or \
                    audit["leafDevice"] != leaf_device or \
                    audit["leafInode"] != leaf_inode or \
                    audit["runtimeStateAbsent"] is not False or \
                    audit["pidFileAbsent"] is not False:
                raise ValidationError(f"live {phase} leaf identity mismatch")
    before = audits["before"]
    during = audits["during"]
    after = audits["after"]
    before_map = before["namespacePidMap"]
    if before["cgroupProcs"] != [init_pid] or \
            before["initHostPidStarttime"] != init_starttime or \
            not isinstance(before_map, list) or len(before_map) != 1 or \
            before_map[0] != {
                "namespacePid": before_map[0].get("namespacePid"),
                "hostPid": init_pid,
                "starttime": init_starttime,
            } or not isinstance(before_map[0].get("namespacePid"), int) or \
            before_map[0]["namespacePid"] <= 0:
        raise ValidationError("live before process identity mismatch")
    if during["initHostPidStarttime"] != init_starttime:
        raise ValidationError("live during init starttime mismatch")
    during_map = during["namespacePidMap"]
    if not isinstance(during_map, list) or \
            len(during_map) != (1 if mode == "workload" else 2):
        raise ValidationError("live during namespace map mismatch")
    mapped_hosts = [item.get("hostPid") for item in during_map]
    if len(set(mapped_hosts)) != len(mapped_hosts) or \
            init_pid not in during["cgroupProcs"] or \
            any(host not in during["cgroupProcs"] for host in mapped_hosts) or \
            len(during["cgroupProcs"]) != (
                4 if mode == "workload" else 3
            ):
        raise ValidationError("live during cgroup process set mismatch")
    for item in during_map:
        if set(item) != {"namespacePid", "hostPid", "starttime"} or \
                any(not isinstance(item[key], int) or item[key] <= 0
                    for key in item):
            raise ValidationError("live during namespace map row mismatch")
    target_exact = (ZERO_SHA256, "")
    if mode == "workload":
        if binding is not None:
            target_exact = (
                binding.driver.sha256,
                rows["native_descriptor_machine"],
            )
        elif stage_binding is not None:
            bash_roles = [
                item for item in stage_binding.frozen_roles
                if item["role"] == "bash"
            ]
            if len(bash_roles) != 1:
                raise ValidationError("stage23 live bash role is absent")
            target_exact = (bash_roles[0]["sha256"], "x86_64")
        else:
            raise ValidationError("live workload target binding is absent")
    if (during["targetExeSha256"], during["targetElfMachine"]) != target_exact:
        raise ValidationError("live during target identity mismatch")
    if mode == "workload":
        after_map = after["namespacePidMap"]
        if init_pid not in after["cgroupProcs"] or \
                len(after["cgroupProcs"]) != 3 or \
                after["initHostPidStarttime"] != init_starttime or \
                not isinstance(after_map, list) or len(after_map) != 1 or \
                after_map[0].get("hostPid") != init_pid or \
                after_map[0].get("starttime") != init_starttime or \
                not isinstance(after_map[0].get("namespacePid"), int) or \
                after_map[0]["namespacePid"] <= 0:
            raise ValidationError("live workload after process mismatch")
    elif after["cgroupProcs"] or after["namespacePidMap"] or \
            after["initHostPidStarttime"] != 0:
        raise ValidationError("live attack after process mismatch")
    for phase in ("before", "after"):
        if audits[phase]["targetExeSha256"] != ZERO_SHA256 or \
                audits[phase]["targetElfMachine"] != "":
            raise ValidationError(f"live {phase} target identity mismatch")
    transcript, _ = read_json_file(
        evidence_dir / "control-transcript.json",
        "control transcript",
    )
    during_ns = [item["namespacePid"] for item in during_map]
    validate_control_transcript(
        transcript,
        runtime_id,
        nonce,
        mode,
        before_map[0]["namespacePid"],
        during_ns,
        descendant_root_namespace_pid,
    )
    validate_oci_artifact(
        evidence_dir,
        rows,
        mode,
        workload_kind,
        nonce,
        delegation,
        rootfs=rootfs,
        binding=binding,
        stage_binding=stage_binding,
    )
    return nonce


def validate_evidence_dir(
    evidence_dir: Path,
    *,
    mode: str,
    workload_kind: str,
    current_binding: CurrentBinding | None,
    pair_binding: CurrentBinding | None,
    stage_binding: Stage23PhaseBinding | None,
    native_descriptor: tuple[dict[str, str], StableFile] | None,
    delegation_authority: DelegationManifest,
    rootfs_authority: RootfsManifest,
    crun_authority: StableFile,
) -> tuple[dict[str, str], StableFile]:
    if evidence_dir.resolve(strict=True) != evidence_dir:
        raise ValidationError("evidence directory is not canonical")
    rows, receipt_file = read_receipt(evidence_dir / "receipt.kv")
    require_receipt_common(rows, mode, workload_kind)
    descriptor_rows: dict[str, str] = {}
    if native_descriptor is not None:
        descriptor_rows, descriptor_file = native_descriptor
        if rows["native_descriptor_sha256"] != descriptor_file.sha256 or \
                rows["native_descriptor_payload_sha256"] != \
                descriptor_rows["descriptor_payload_sha256"]:
            raise ValidationError("receipt native descriptor identity mismatch")
        for key, expected in (
            ("native_descriptor_target", descriptor_rows["target"]),
            ("native_descriptor_machine", descriptor_rows["machine"]),
            (
                "native_descriptor_candidate_entry_path",
                descriptor_rows["candidate_entry_path"],
            ),
            (
                "native_descriptor_candidate_entry_module_path",
                descriptor_rows["candidate_entry_module_path"],
            ),
            (
                "native_descriptor_candidate_entry_sha256",
                descriptor_rows["candidate_entry_sha256"],
            ),
            (
                "native_descriptor_worker_sha256",
                descriptor_rows["worker_sha256"],
            ),
            (
                "native_descriptor_snapshot_manifest_sha256",
                descriptor_rows["snapshot_manifest_sha256"],
            ),
        ):
            if rows[key] != expected:
                raise ValidationError(
                    f"receipt descriptor field mismatch: {key}",
                )
    else:
        descriptor_absent = {
            "native_descriptor_path_fshex": "",
            "native_descriptor_sha256": ZERO_SHA256,
            "native_descriptor_payload_sha256": ZERO_SHA256,
            "native_descriptor_target": "not_applicable",
            "native_descriptor_machine": "x86_64",
            "native_descriptor_candidate_entry_path": "",
            "native_descriptor_candidate_entry_module_path": "",
            "native_descriptor_candidate_entry_sha256": ZERO_SHA256,
            "native_descriptor_worker_sha256": ZERO_SHA256,
            "native_descriptor_snapshot_manifest_sha256": ZERO_SHA256,
        }
        if any(rows[key] != value for key, value in descriptor_absent.items()):
            raise ValidationError("stage23 native descriptor absence mismatch")
    if mode == "workload" and native_descriptor is not None:
        for descriptor_key, receipt_key in (
            ("target_argv_count", "target_argv_count"),
            ("target_argv_sha256", "target_argv_sha256"),
            ("target_env_count", "target_env_count"),
            ("target_env_sha256", "target_env_sha256"),
        ):
            if descriptor_rows[descriptor_key] != rows[receipt_key]:
                raise ValidationError(
                    "native descriptor/workload sequence mismatch: "
                    + descriptor_key,
                )
    input_manifest, input_file = read_json_file(
        evidence_dir / "input-manifest.json",
        "input manifest",
    )
    if set(input_manifest) != INPUT_FIELDS or \
            input_manifest["schema"] != INPUT_SCHEMA or \
            input_manifest["mode"] != mode or \
            input_manifest["workloadKind"] != workload_kind or \
            input_file.sha256 != rows["input_manifest_sha256"]:
        raise ValidationError("input manifest mismatch")
    for key, row_key in (
        ("delegationManifestSha256", "delegation_manifest_sha256"),
        ("cgroupParentPathFshex", "delegation_parent_path_fshex"),
        ("crunSha256", "crun_sha256"),
        ("rootfsManifestSha256", "rootfs_manifest_sha256"),
        ("rootfsTreeCid", "rootfs_tree_cid"),
        ("ociConfigSha256", "oci_config_sha256"),
    ):
        if str(input_manifest[key]) != rows[row_key]:
            raise ValidationError(f"input manifest binding mismatch: {key}")
    if (
        input_manifest["crunClone3Policy"] != CRUN_CLONE3_POLICY
        or input_manifest["crunClone3ExactFlags"]
            != CRUN_CLONE3_EXACT_FLAGS
        or input_manifest["crunExpectedExecTransitions"]
            != CRUN_EXACT_EXEC_TRANSITIONS
        or rows["crun_clone3_policy"] != CRUN_CLONE3_POLICY
        or rows["crun_clone3_exact_flags"]
            != str(CRUN_CLONE3_EXACT_FLAGS)
        or rows["crun_clone3_intercept_count"] != "1"
        or rows["crun_exec_transition_count"]
            != str(CRUN_EXACT_EXEC_TRANSITIONS)
    ):
        raise ValidationError("crun clone3 policy binding mismatch")
    if input_manifest["memoryMax"] != LIMIT_BYTES or \
            input_manifest["memorySwapMax"] != SWAP_MAX_BYTES or \
            input_manifest["pidsMax"] != PIDS_MAX:
        raise ValidationError("input manifest limits mismatch")
    if input_manifest["targetArgvCount"] != require_uint(
        rows["target_argv_count"],
        "receipt target argv count",
    ) or input_manifest["targetArgvSha256"] != rows["target_argv_sha256"]:
        raise ValidationError("input manifest target argv mismatch")
    if input_manifest["targetEnvCount"] != require_uint(
        rows["target_env_count"],
        "receipt target env count",
    ) or input_manifest["targetEnvSha256"] != rows["target_env_sha256"]:
        raise ValidationError("input manifest target env mismatch")
    stage_input_exact = {
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
    }
    for key, expected in stage_input_exact.items():
        if input_manifest.get(key) != expected:
            raise ValidationError("input manifest stage23 mismatch: " + key)
    ledger_input_exact = {
        "descendantExecLedgerRequired": mode == "workload",
        "descendantExecLedgerProducerSha256":
            rows["descendant_exec_ledger_producer_sha256"],
        "descendantExecLedgerValidatorSha256":
            rows["descendant_exec_ledger_validator_sha256"],
        "descendantExecLedgerWrapperSha256":
            rows["descendant_exec_ledger_wrapper_sha256"],
        "descendantExecLedgerManifestSha256":
            rows["descendant_exec_ledger_manifest_sha256"],
    }
    for key, expected in ledger_input_exact.items():
        if input_manifest.get(key) != expected:
            raise ValidationError("input manifest ledger binding mismatch: " + key)
    copied_delegation = stable_read(
        evidence_dir / "delegation-manifest.kv",
        "copied delegation manifest",
        64 * 1024,
    )
    copied_rootfs = stable_read(
        evidence_dir / "rootfs-manifest.json",
        "copied rootfs manifest",
        64 * 1024 * 1024,
    )
    if copied_delegation.raw != delegation_authority.file.raw or \
            copied_rootfs.raw != rootfs_authority.file.raw:
        raise ValidationError("copied authority input differs from original")
    if rows["delegation_manifest_sha256"] != \
            delegation_authority.file.sha256 or \
            rows["delegation_manifest_path_fshex"] != os.fsencode(
                str(delegation_authority.file.path),
            ).hex() or \
            rows["delegation_parent_path_fshex"] != os.fsencode(
                str(delegation_authority.parent),
            ).hex() or \
            rows["rootfs_manifest_sha256"] != rootfs_authority.file.sha256 or \
            rows["rootfs_manifest_path_fshex"] != os.fsencode(
                str(rootfs_authority.file.path),
            ).hex() or rows["rootfs_tree_cid"] != rootfs_authority.tree_cid or \
            rows["crun_path_fshex"] != os.fsencode(str(crun_authority.path)).hex() or \
            rows["crun_sha256"] != crun_authority.sha256:
        raise ValidationError("receipt original authority identity mismatch")
    common_current_paths = (
        {
            "workspace_root_path_fshex":
                os.fsencode(str(pair_binding.workspace_root)).hex(),
            "source_closure_path_fshex":
                os.fsencode(str(pair_binding.source_closure.path)).hex(),
            "current_driver_path_fshex":
                os.fsencode(str(pair_binding.driver.path)).hex(),
            "current_build_receipt_path_fshex":
                os.fsencode(str(pair_binding.build_receipt.path)).hex(),
        }
        if pair_binding is not None
        else {
            "workspace_root_path_fshex": "",
            "source_closure_path_fshex": "",
            "current_driver_path_fshex": "",
            "current_build_receipt_path_fshex": "",
        }
    )
    if any(rows[key] != value for key, value in common_current_paths.items()):
        raise ValidationError("receipt current input path mismatch")
    before, _ = parse_self_hashed_json(
        evidence_dir / "live-before.json",
        LIVE_SCHEMA,
        LIVE_FIELDS,
        "live before audit",
    )
    after, _ = parse_self_hashed_json(
        evidence_dir / "live-after.json",
        LIVE_SCHEMA,
        LIVE_FIELDS,
        "live after audit",
    )
    if rows["memory_peak_before_bytes"] != str(before["memoryPeak"]) or \
            rows["memory_peak_after_bytes"] != str(after["memoryPeak"]) or \
            rows["memory_current_before_bytes"] != str(before["memoryCurrent"]) or \
            rows["memory_current_after_bytes"] != str(after["memoryCurrent"]):
        raise ValidationError("receipt memory snapshot mismatch")
    for phase_name, audit in (("before", before), ("after", after)):
        for event in ("low", "high", "max", "oom", "oom_kill", "oom_group_kill"):
            key = f"memory_events_local_{phase_name}_{event}"
            if rows[key] != str(audit["eventsLocal"][event]):
                raise ValidationError("receipt local memory event mismatch")
    session_nonce = before["sessionNonce"]
    require_sha(session_nonce, "live session nonce")
    descendant_root_namespace_pid: int | None = None
    if mode == "workload":
        descendant_root_namespace_pid = validate_descendant_exec_ledger(
            evidence_dir,
            rows,
            current_binding,
            stage_binding,
            workload_kind,
            rootfs_authority,
            descriptor_rows.get("snapshot_manifest_sha256", ZERO_SHA256),
            session_nonce,
        )
    session_nonce = validate_live_history(
        evidence_dir,
        rows,
        mode,
        delegation_authority,
        rootfs_authority,
        pair_binding,
        workload_kind=workload_kind,
        stage_binding=stage_binding,
        descendant_root_namespace_pid=descendant_root_namespace_pid,
    )
    stage_base_exact = {
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
        "stage_terminal_relative_path": (
            stage_binding.terminal_relative_path
            if stage_binding is not None
            else ""
        ),
    }
    if any(rows[key] != value for key, value in stage_base_exact.items()):
        raise ValidationError("receipt stage23 base binding mismatch")
    if stage_binding is None:
        stage_absent_exact = {
            "stage_pre_tree_sha256": ZERO_SHA256,
            "stage_post_tree_sha256": ZERO_SHA256,
            "stage_declared_delta_sha256": ZERO_SHA256,
            "stage_output_set_sha256": ZERO_SHA256,
            "stage_output_count": "0",
            "stage_terminal_sha256": ZERO_SHA256,
            "stage_terminal_receipt_sha256": ZERO_SHA256,
            "phase_row_receipt_sha256": ZERO_SHA256,
        }
        if any(
            rows[key] != value for key, value in stage_absent_exact.items()
        ):
            raise ValidationError("receipt stage23 absence mismatch")
    if mode == "workload":
        if rows["status"] != "completed" or \
                rows["execution_result"] != "exited_zero" or \
                any(after["eventsLocal"].values()):
            raise ValidationError("workload result mismatch")
        expected_current = (
            {
                "current_source_binding_status": "bound_unique_current",
                "source_closure_cid": current_binding.source_closure_cid,
                "source_closure_capture_sha256":
                    current_binding.source_closure_capture_sha256,
                "current_driver_sha256": current_binding.driver.sha256,
                "current_build_receipt_sha256":
                    current_binding.build_receipt.sha256,
                "current_entry_path": current_binding.entry_path,
                "current_entry_module_path":
                    current_binding.entry_module_path,
                "current_entry_sha256": current_binding.entry_sha256,
            }
            if current_binding is not None
            else {
                "current_source_binding_status":
                    "not_applicable_stage23_phase",
                "source_closure_cid": ZERO_SHA256,
                "source_closure_capture_sha256": ZERO_SHA256,
                "current_driver_sha256": ZERO_SHA256,
                "current_build_receipt_sha256": ZERO_SHA256,
                "current_entry_path": "",
                "current_entry_module_path": "",
                "current_entry_sha256": ZERO_SHA256,
            }
        )
        if workload_kind == WORKLOAD_DRY_COMPILE:
            dry_exact = {
                "workload_output_status": "proved_absent",
                "workload_output_sha256": ZERO_SHA256,
                "workload_output_size": "0",
                "workload_output_mode": "0",
                "current_driver_next_sha256": ZERO_SHA256,
                "current_driver_next_size": "0",
                "current_driver_next_mode": "0",
                "current_driver_report_sha256": ZERO_SHA256,
                "current_driver_report_size": "0",
            }
            if any(rows[key] != value for key, value in dry_exact.items()):
                raise ValidationError("dry compile product absence mismatch")
            actual_ms = require_canonical_uint(
                rows["dry_exec_phase_actual_total_ms"],
                "dry compile actual total ms",
            )
            wall_ns = require_canonical_uint(
                rows["workload_wall_elapsed_ns"],
                "dry compile wall elapsed ns",
            )
            if actual_ms > wall_ns // 1_000_000:
                raise ValidationError("dry compile actual time exceeds host wall")
            if require_canonical_uint(
                rows["dry_full_theory_rss_modeled_guard_estimate_bytes"],
                "dry compile modeled RSS estimate",
            ) <= 0:
                raise ValidationError("dry compile modeled RSS estimate is empty")
        elif workload_kind == WORKLOAD_CURRENT_DRIVER:
            current_exact = {
                "workload_output_status": "materialized_executable",
                "workload_output_sha256":
                    rows["current_driver_next_sha256"],
                "workload_output_size": rows["current_driver_next_size"],
                "workload_output_mode": rows["current_driver_next_mode"],
                "workload_report_sha256":
                    rows["current_driver_report_sha256"],
                "workload_report_size": rows["current_driver_report_size"],
                "dry_source_file_count": "0",
                "dry_source_line_count": "0",
                "dry_source_byte_count": "0",
                "dry_source_max_file_bytes": "0",
                "dry_exec_phase_actual_total_ms": "0",
                "dry_full_theory_time_guard_recommended_ms": "0",
                "dry_full_theory_rss_modeled_guard_estimate_bytes": "0",
            }
            if any(rows[key] != value for key, value in current_exact.items()):
                raise ValidationError("current driver generic product mismatch")
        else:
            if stage_binding is None:
                raise ValidationError("stage23 workload binding is absent")
            pre_tree, _pre_file = read_json_file(
                evidence_dir / "stage-pre-tree.json",
                "stage23 phase pre-tree",
                256 * 1024 * 1024,
            )
            stdout_for_stage = stable_read(
                evidence_dir / "control/stdout.bin",
                "stage23 target stdout",
                2 * 1024 * 1024 * 1024,
            )
            stderr_for_stage = stable_read(
                evidence_dir / "control/stderr.bin",
                "stage23 target stderr",
                2 * 1024 * 1024 * 1024,
            )
            terminal, stage_result = validate_stage23_phase_result(
                stage_binding,
                stdout_for_stage,
                stderr_for_stage,
                pre_tree,
                sha256_bytes(canonical_json(pre_tree)),
            )
            stage_exact = {
                "workload_output_status":
                    "materialized_stage_phase_outputs",
                "workload_output_sha256":
                    stage_result["output_set_sha256"],
                "workload_output_size": stage_result["output_count"],
                "workload_output_mode": "0",
                "workload_report_sha256": terminal.sha256,
                "workload_report_size": str(terminal.size),
                "stage_pre_tree_sha256":
                    stage_result["pre_tree_sha256"],
                "stage_post_tree_sha256":
                    stage_result["post_tree_sha256"],
                "stage_declared_delta_sha256":
                    stage_result["declared_delta_sha256"],
                "stage_output_set_sha256":
                    stage_result["output_set_sha256"],
                "stage_output_count": stage_result["output_count"],
                "stage_terminal_sha256": terminal.sha256,
                "stage_terminal_receipt_sha256":
                    stage_result["terminal_receipt_sha256"],
                "phase_row_receipt_sha256": terminal.sha256,
                "current_driver_next_sha256": ZERO_SHA256,
                "current_driver_next_size": "0",
                "current_driver_next_mode": "0",
                "current_driver_report_sha256": ZERO_SHA256,
                "current_driver_report_size": "0",
                "dry_source_file_count": "0",
                "dry_source_line_count": "0",
                "dry_source_byte_count": "0",
                "dry_source_max_file_bytes": "0",
                "dry_exec_phase_actual_total_ms": "0",
                "dry_full_theory_time_guard_recommended_ms": "0",
                "dry_full_theory_rss_modeled_guard_estimate_bytes": "0",
            }
            if any(rows[key] != value for key, value in stage_exact.items()):
                raise ValidationError("stage23 phase product mismatch")
    else:
        if rows["status"] != "expected_aggregate_oom_rejected" or \
                rows["execution_result"] != "kernel_oom_group_killed":
            raise ValidationError("aggregate attack result mismatch")
        for event in ("max", "oom", "oom_kill", "oom_group_kill"):
            if after["eventsLocal"][event] <= 0:
                raise ValidationError("aggregate attack local event missing")
        expected_current = {
            "current_source_binding_status": (
                "not_applicable_stage23_phase"
                if stage_binding is not None
                else "not_applicable_attack_probe"
            ),
            "source_closure_cid": ZERO_SHA256,
            "source_closure_capture_sha256": ZERO_SHA256,
            "current_driver_sha256": ZERO_SHA256,
            "current_build_receipt_sha256": ZERO_SHA256,
            "current_entry_path": "",
            "current_entry_module_path": "",
            "current_entry_sha256": ZERO_SHA256,
        }
        ledger_attack_exact = {
            "descendant_exec_ledger_status":
                "not_applicable_kernel_oom_probe",
            "descendant_exec_ledger_manifest_sha256": ZERO_SHA256,
            "descendant_exec_ledger_receipt_sha256": ZERO_SHA256,
            "descendant_exec_ledger_payload_sha256": ZERO_SHA256,
            "descendant_exec_ledger_wrapper_receipt_sha256": ZERO_SHA256,
            "descendant_exec_ledger_command_argv_sha256": ZERO_SHA256,
            "descendant_exec_ledger_event_count": "0",
            "current_driver_next_sha256": ZERO_SHA256,
            "current_driver_next_size": "0",
            "current_driver_next_mode": "0",
            "current_driver_report_sha256": ZERO_SHA256,
            "current_driver_report_size": "0",
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
            "stage_pre_tree_sha256": ZERO_SHA256,
            "stage_post_tree_sha256": ZERO_SHA256,
            "stage_declared_delta_sha256": ZERO_SHA256,
            "stage_output_set_sha256": ZERO_SHA256,
            "stage_output_count": "0",
            "stage_terminal_sha256": ZERO_SHA256,
            "stage_terminal_receipt_sha256": ZERO_SHA256,
        }
        for key, expected in ledger_attack_exact.items():
            if rows[key] != expected:
                raise ValidationError("attack ledger N/A contract mismatch: " + key)
    for key, expected in expected_current.items():
        if rows[key] != expected:
            raise ValidationError(f"receipt current binding mismatch: {key}")
    stdout = stable_read(
        evidence_dir / "stdout.bin",
        "captured stdout",
        2 * 1024 * 1024 * 1024,
    )
    stderr = stable_read(
        evidence_dir / "stderr.bin",
        "captured stderr",
        2 * 1024 * 1024 * 1024,
    )
    for prefix, file in (("stdout", stdout), ("stderr", stderr)):
        if rows[f"{prefix}_sha256"] != file.sha256 or \
                rows[f"{prefix}_size"] != str(file.size) or \
                rows[f"{prefix}_device"] != str(file.device) or \
                rows[f"{prefix}_inode"] != str(file.inode):
            raise ValidationError(f"receipt {prefix} identity mismatch")
    verify_artifact_manifest(evidence_dir, rows)
    return rows, receipt_file


def validate_pair(
    workload_dir: Path,
    attack_dir: Path,
    *,
    workspace_root: Path | None,
    source_closure: Path | None,
    driver: Path | None,
    build_receipt: Path | None,
    native_descriptor_path: Path | None,
    native_descriptor_sha256: str | None,
    workload_kind: str,
    stage_authority_manifest_path: Path | None = None,
    stage_execution_manifest_path: Path | None = None,
    stage_manifest_pair_commitment_path: Path | None = None,
    stage_plan_sha256: str | None = None,
) -> tuple[dict[str, str], dict[str, str]]:
    workload_claim, _ = read_receipt(workload_dir / "receipt.kv")
    attack_claim, _ = read_receipt(attack_dir / "receipt.kv")
    if workload_kind == WORKLOAD_BOOTSTRAP_STAGE23_PHASE:
        if any(value is not None for value in (
            workspace_root,
            source_closure,
            driver,
            build_receipt,
            native_descriptor_path,
            native_descriptor_sha256,
        )) or any(value is None for value in (
            stage_authority_manifest_path,
            stage_execution_manifest_path,
            stage_manifest_pair_commitment_path,
            stage_plan_sha256,
        )):
            raise ValidationError("pair stage23/current inputs are mixed")
        if any(
            workload_claim[key]
            for key in (
                "workspace_root_path_fshex",
                "source_closure_path_fshex",
                "current_driver_path_fshex",
                "current_build_receipt_path_fshex",
                "native_descriptor_path_fshex",
            )
        ):
            raise ValidationError("stage23 receipt carried current paths")
        claimed_stage_paths = {
            "authority": fsdecode_hex(
                workload_claim["stage_authority_manifest_path_fshex"],
                "receipt stage23 authority manifest",
            ),
            "execution": fsdecode_hex(
                workload_claim["stage_execution_manifest_path_fshex"],
                "receipt stage23 execution manifest",
            ),
            "pair": fsdecode_hex(
                workload_claim[
                    "stage_manifest_pair_commitment_path_fshex"
                ],
                "receipt stage23 manifest pair commitment",
            ),
        }
        if claimed_stage_paths != {
            "authority": stage_authority_manifest_path,
            "execution": stage_execution_manifest_path,
            "pair": stage_manifest_pair_commitment_path,
        }:
            raise ValidationError(
                "pair explicit/stage23 path binding mismatch",
            )
    else:
        if any(value is None for value in (
            workspace_root,
            source_closure,
            driver,
            build_receipt,
            native_descriptor_path,
            native_descriptor_sha256,
        )) or any(value is not None for value in (
            stage_authority_manifest_path,
            stage_execution_manifest_path,
            stage_manifest_pair_commitment_path,
            stage_plan_sha256,
        )):
            raise ValidationError("pair current/stage23 inputs are mixed")
        claimed_paths = {
            "workspace_root": fsdecode_hex(
                workload_claim["workspace_root_path_fshex"],
                "receipt workspace root",
            ),
            "source_closure": fsdecode_hex(
                workload_claim["source_closure_path_fshex"],
                "receipt source closure",
            ),
            "driver": fsdecode_hex(
                workload_claim["current_driver_path_fshex"],
                "receipt current driver",
            ),
            "build_receipt": fsdecode_hex(
                workload_claim["current_build_receipt_path_fshex"],
                "receipt build receipt",
            ),
            "native_descriptor": fsdecode_hex(
                workload_claim["native_descriptor_path_fshex"],
                "receipt native descriptor",
            ),
        }
        explicit_paths = {
            "workspace_root": workspace_root,
            "source_closure": source_closure,
            "driver": driver,
            "build_receipt": build_receipt,
            "native_descriptor": native_descriptor_path,
        }
        if claimed_paths != explicit_paths:
            raise ValidationError("pair explicit/current path binding mismatch")
    delegation_path = fsdecode_hex(
        workload_claim["delegation_manifest_path_fshex"],
        "receipt delegation manifest",
    )
    delegation = parse_delegation_manifest(
        delegation_path,
        require_root_owner=True,
    )
    validate_live_delegation(delegation, delegation.parent)
    rootfs_manifest_path = fsdecode_hex(
        workload_claim["rootfs_manifest_path_fshex"],
        "receipt rootfs manifest",
    )
    rootfs_path = fsdecode_hex(
        workload_claim["rootfs_path_fshex"],
        "receipt rootfs",
    )
    crun_path = fsdecode_hex(
        workload_claim["crun_path_fshex"],
        "receipt crun",
    )
    crun = stable_read(crun_path, "receipt crun", 256 * 1024 * 1024)
    require_unprivileged_executable(crun, "receipt crun")
    rootfs = validate_rootfs_manifest(
        rootfs_manifest_path,
        rootfs_path,
        crun.sha256,
        verify_tree=False,
    )
    authority_exact = {
        "delegation_manifest_sha256": delegation.file.sha256,
        "delegation_manifest_path_fshex":
            os.fsencode(str(delegation.file.path)).hex(),
        "delegation_manifest_device": str(delegation.file.device),
        "delegation_manifest_inode": str(delegation.file.inode),
        "delegation_manifest_mode": format(delegation.file.mode, "o"),
        "delegation_manifest_uid": str(delegation.file.uid),
        "delegation_manifest_gid": str(delegation.file.gid),
        "delegation_parent_path_fshex":
            os.fsencode(str(delegation.parent)).hex(),
        "delegation_parent_device": delegation.rows["parent_device"],
        "delegation_parent_inode": delegation.rows["parent_inode"],
        "delegation_controller_path_fshex":
            delegation.rows["controller_path_fshex"],
        "delegation_boot_id": delegation.rows["boot_id"],
        "cgroup_namespace_inode": delegation.rows["cgroup_namespace_inode"],
        "crun_path_fshex": os.fsencode(str(crun.path)).hex(),
        "crun_sha256": crun.sha256,
        "rootfs_manifest_sha256": rootfs.file.sha256,
        "rootfs_manifest_path_fshex": os.fsencode(str(rootfs.file.path)).hex(),
        "rootfs_path_fshex": os.fsencode(str(rootfs.rootfs)).hex(),
        "rootfs_tree_cid": rootfs.tree_cid,
    }
    for claim in (workload_claim, attack_claim):
        if any(claim[key] != value for key, value in authority_exact.items()):
            raise ValidationError("pair root authority receipt mismatch")
    current_before: CurrentBinding | None = None
    native_before: tuple[dict[str, str], StableFile] | None = None
    stage_before: Stage23PhaseBinding | None = None
    if workload_kind == WORKLOAD_BOOTSTRAP_STAGE23_PHASE:
        stage_before = validate_stage23_phase_binding(
            stage_authority_manifest_path,
            stage_execution_manifest_path,
            stage_manifest_pair_commitment_path,
            stage_plan_sha256,
            rootfs,
            delegation,
            crun,
        )
    else:
        current_before = validate_current_binding(
            workspace_root,
            source_closure,
            driver,
            build_receipt,
        )
        native_before = parse_native_descriptor(
            native_descriptor_path,
            native_descriptor_sha256,
            workload_kind,
        )
        descriptor_rows, _descriptor_file = native_before
        descriptor_current_exact = {
            "target": current_before.target,
            "source_closure_cid": current_before.source_closure_cid,
            "source_closure_capture_sha256":
                current_before.source_closure_capture_sha256,
            "candidate_build_receipt_sha256":
                current_before.build_receipt.sha256,
            "candidate_entry_path": current_before.entry_path,
            "candidate_entry_module_path":
                current_before.entry_module_path,
            "candidate_entry_sha256": current_before.entry_sha256,
            "worker_sha256": current_before.driver.sha256,
        }
        for key, expected in descriptor_current_exact.items():
            if descriptor_rows[key] != expected:
                raise ValidationError(
                    "native descriptor/current input mismatch: " + key,
                )
    workload, _ = validate_evidence_dir(
        workload_dir,
        mode="workload",
        workload_kind=workload_kind,
        current_binding=current_before,
        pair_binding=current_before,
        stage_binding=stage_before,
        native_descriptor=native_before,
        delegation_authority=delegation,
        rootfs_authority=rootfs,
        crun_authority=crun,
    )
    attack, _ = validate_evidence_dir(
        attack_dir,
        mode="aggregate_oom_probe",
        workload_kind=workload_kind,
        current_binding=None,
        pair_binding=current_before,
        stage_binding=stage_before,
        native_descriptor=native_before,
        delegation_authority=delegation,
        rootfs_authority=rootfs,
        crun_authority=crun,
    )
    pair_keys = (
        "delegation_manifest_sha256",
        "delegation_manifest_path_fshex",
        "delegation_manifest_device",
        "delegation_manifest_inode",
        "delegation_manifest_mode",
        "delegation_manifest_uid",
        "delegation_manifest_gid",
        "delegation_parent_path_fshex",
        "delegation_parent_device",
        "delegation_parent_inode",
        "delegation_controller_path_fshex",
        "delegation_boot_id",
        "cgroup_namespace_inode",
        "crun_path_fshex",
        "crun_sha256",
        "rootfs_manifest_sha256",
        "rootfs_manifest_path_fshex",
        "rootfs_path_fshex",
        "rootfs_tree_cid",
        "native_descriptor_sha256",
        "native_descriptor_payload_sha256",
        "native_descriptor_target",
        "native_descriptor_machine",
        "native_descriptor_candidate_entry_path",
        "native_descriptor_candidate_entry_module_path",
        "native_descriptor_candidate_entry_sha256",
        "native_descriptor_worker_sha256",
        "native_descriptor_snapshot_manifest_sha256",
        "workspace_root_path_fshex",
        "source_closure_path_fshex",
        "current_driver_path_fshex",
        "current_build_receipt_path_fshex",
        "stage_authority_manifest_path_fshex",
        "stage_authority_manifest_sha256",
        "stage_execution_manifest_path_fshex",
        "stage_execution_manifest_sha256",
        "stage_manifest_pair_commitment_path_fshex",
        "stage_manifest_pair_commitment_sha256",
        "stage_phase_plan_sha256",
        "stage_phase_index",
        "stage_phase_label",
        "stage_source_root_path_fshex",
        "stage_evidence_root_path_fshex",
        "stage_terminal_relative_path",
        "runner_sha256",
        "validator_sha256",
        "descendant_exec_ledger_producer_sha256",
        "descendant_exec_ledger_validator_sha256",
        "descendant_exec_ledger_wrapper_sha256",
    )
    for key in pair_keys:
        if workload[key] != attack[key]:
            raise ValidationError(f"paired evidence identity drift: {key}")
    current_after: CurrentBinding | None = None
    native_after: tuple[dict[str, str], StableFile] | None = None
    stage_after: Stage23PhaseBinding | None = None
    if stage_before is not None:
        stage_after = validate_stage23_phase_binding(
            stage_authority_manifest_path,
            stage_execution_manifest_path,
            stage_manifest_pair_commitment_path,
            stage_plan_sha256,
            rootfs,
            delegation,
            crun,
        )
    else:
        current_after = validate_current_binding(
            workspace_root,
            source_closure,
            driver,
            build_receipt,
        )
        native_after = parse_native_descriptor(
            native_descriptor_path,
            native_descriptor_sha256,
            workload_kind,
        )
    delegation_after = parse_delegation_manifest(
        delegation_path,
        require_root_owner=True,
    )
    rootfs_after = validate_rootfs_manifest(
        rootfs_manifest_path,
        rootfs_path,
        crun.sha256,
        verify_tree=False,
    )
    crun_after = stable_read(crun_path, "receipt crun", 256 * 1024 * 1024)
    if current_before != current_after or native_before != native_after or \
            stage_before != stage_after or delegation != delegation_after or \
            rootfs != rootfs_after or crun != crun_after:
        raise ValidationError("bound inputs drifted during pair validation")
    return workload, attack


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate native Linux delegated cgroup-v2 evidence",
    )
    parser.add_argument("--evidence-dir")
    parser.add_argument("--aggregate-evidence-dir")
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
    parser.add_argument("--workload-kind", choices=WORKLOAD_KINDS)
    parser.add_argument(
        "--live-phase",
        choices=("before", "during", "after", "cleanup"),
    )
    parser.add_argument("--delegation-manifest")
    parser.add_argument("--cgroup-parent")
    parser.add_argument("--leaf")
    parser.add_argument("--runtime-id")
    parser.add_argument("--mode", choices=("workload", "aggregate_oom_probe"))
    parser.add_argument("--session-nonce")
    parser.add_argument("--init-host-pid", type=int)
    parser.add_argument("--namespace-pids", default="")
    parser.add_argument("--expected-driver-sha256", default=ZERO_SHA256)
    parser.add_argument("--expected-machine")
    parser.add_argument("--runtime-state-root")
    parser.add_argument("--pid-file")
    parser.add_argument("--output")
    return parser.parse_args(argv)


def main(argv: Sequence[str]) -> int:
    args = parse_args(argv)
    try:
        if args.live_phase:
            required = (
                args.delegation_manifest,
                args.cgroup_parent,
                args.leaf,
                args.runtime_id,
                args.mode,
                args.session_nonce,
                args.expected_machine,
                args.runtime_state_root,
                args.pid_file,
                args.output,
            )
            if any(value in (None, "") for value in required) or \
                    args.init_host_pid is None:
                raise ValidationError("live validation arguments are incomplete")
            namespace_pids: list[int] = []
            if args.namespace_pids:
                for value in args.namespace_pids.split(","):
                    if not value.isdigit() or int(value) <= 0:
                        raise ValidationError("namespace PID list is invalid")
                    namespace_pids.append(int(value))
            manifest = parse_delegation_manifest(
                Path(args.delegation_manifest),
                require_root_owner=True,
            )
            snapshot = live_snapshot(
                phase=args.live_phase,
                mode=args.mode,
                session_nonce=args.session_nonce,
                runtime_id=args.runtime_id,
                manifest=manifest,
                parent=Path(args.cgroup_parent),
                leaf=Path(args.leaf),
                init_host_pid=args.init_host_pid,
                namespace_pids=namespace_pids,
                expected_driver_sha256=args.expected_driver_sha256,
                expected_machine=args.expected_machine,
                runtime_state_root=Path(args.runtime_state_root),
                pid_file=Path(args.pid_file),
            )
            write_self_hashed_json(Path(args.output), snapshot)
            print(f"live_validation_phase={args.live_phase}")
            print("live_validation_status=passed")
            return 0
        if not args.evidence_dir or not args.aggregate_evidence_dir:
            raise ValidationError("pair validation arguments are incomplete")
        workload_dir = Path(args.evidence_dir)
        workload_claim, _ = read_receipt(workload_dir / "receipt.kv")
        claimed_workload_kind = workload_claim["workload_kind"]
        if claimed_workload_kind not in WORKLOAD_KINDS or (
            args.workload_kind is not None
            and args.workload_kind != claimed_workload_kind
        ):
            raise ValidationError("explicit workload contract mismatch")
        current_argument_names = (
            "workspace_root",
            "source_closure",
            "driver",
            "build_receipt",
            "native_descriptor",
            "native_descriptor_sha256",
        )
        if claimed_workload_kind == WORKLOAD_BOOTSTRAP_STAGE23_PHASE:
            if any(
                getattr(args, key) not in (None, "")
                for key in current_argument_names
            ):
                raise ValidationError(
                    "stage23 validation carried current inputs",
                )
            inferred_stage = {
                "stage_authority_manifest": str(fsdecode_hex(
                    workload_claim["stage_authority_manifest_path_fshex"],
                    "receipt stage23 authority manifest",
                )),
                "phase_execution_manifest": str(fsdecode_hex(
                    workload_claim["stage_execution_manifest_path_fshex"],
                    "receipt stage23 execution manifest",
                )),
                "manifest_pair_commitment": str(fsdecode_hex(
                    workload_claim[
                        "stage_manifest_pair_commitment_path_fshex"
                    ],
                    "receipt stage23 manifest pair commitment",
                )),
                "stage_plan_sha256":
                    workload_claim["stage_phase_plan_sha256"],
            }
            explicit_stage = {
                key: getattr(args, key) for key in inferred_stage
            }
            if any(
                value not in (None, "")
                for value in explicit_stage.values()
            ):
                if any(
                    value in (None, "")
                    for value in explicit_stage.values()
                ) or explicit_stage != inferred_stage:
                    raise ValidationError(
                        "explicit stage23 binding is incomplete/drifted",
                    )
            else:
                explicit_stage = inferred_stage
            explicit: dict[str, str] = {}
        else:
            if any(value not in (None, "") for value in (
                args.stage_authority_manifest,
                args.phase_execution_manifest,
                args.manifest_pair_commitment,
                args.stage_plan_sha256,
            )):
                raise ValidationError(
                    "current validation carried stage23 inputs",
                )
            inferred = {
                "workspace_root": str(fsdecode_hex(
                    workload_claim["workspace_root_path_fshex"],
                    "receipt workspace root",
                )),
                "source_closure": str(fsdecode_hex(
                    workload_claim["source_closure_path_fshex"],
                    "receipt source closure",
                )),
                "driver": str(fsdecode_hex(
                    workload_claim["current_driver_path_fshex"],
                    "receipt current driver",
                )),
                "build_receipt": str(fsdecode_hex(
                    workload_claim["current_build_receipt_path_fshex"],
                    "receipt build receipt",
                )),
                "native_descriptor": str(fsdecode_hex(
                    workload_claim["native_descriptor_path_fshex"],
                    "receipt native descriptor",
                )),
                "native_descriptor_sha256":
                    workload_claim["native_descriptor_sha256"],
            }
            explicit = {
                key: getattr(args, key)
                for key in inferred
            }
            if any(value not in (None, "") for value in explicit.values()):
                if any(value in (None, "") for value in explicit.values()) or \
                        explicit != inferred:
                    raise ValidationError(
                        "explicit pair binding is incomplete/drifted",
                    )
            else:
                explicit = inferred
            explicit_stage = {}
        validate_pair(
            workload_dir,
            Path(args.aggregate_evidence_dir),
            workspace_root=(
                Path(str(explicit["workspace_root"])) if explicit else None
            ),
            source_closure=(
                Path(str(explicit["source_closure"])) if explicit else None
            ),
            driver=Path(str(explicit["driver"])) if explicit else None,
            build_receipt=(
                Path(str(explicit["build_receipt"])) if explicit else None
            ),
            native_descriptor_path=(
                Path(str(explicit["native_descriptor"]))
                if explicit
                else None
            ),
            native_descriptor_sha256=(
                str(explicit["native_descriptor_sha256"])
                if explicit
                else None
            ),
            stage_authority_manifest_path=(
                Path(str(explicit_stage["stage_authority_manifest"]))
                if explicit_stage
                else None
            ),
            stage_execution_manifest_path=(
                Path(str(explicit_stage["phase_execution_manifest"]))
                if explicit_stage
                else None
            ),
            stage_manifest_pair_commitment_path=(
                Path(str(explicit_stage["manifest_pair_commitment"]))
                if explicit_stage
                else None
            ),
            stage_plan_sha256=(
                str(explicit_stage["stage_plan_sha256"])
                if explicit_stage
                else None
            ),
            workload_kind=claimed_workload_kind,
        )
        print("hard_gate_cleanup_status=verified_absent_live")
        print("production_release_status=eligible_linux_gate_only")
        print("darwin_release_status=HARD_RED")
        print(
            "hard_gate_validation_status="
            + (
                "passed_stage23_phase"
                if claimed_workload_kind
                == WORKLOAD_BOOTSTRAP_STAGE23_PHASE
                else "passed_unique_current"
            ),
        )
        return 0
    except (OSError, ValueError, ValidationError) as exc:
        print("hard_gate_validation_status=failed", file=sys.stderr)
        print(f"hard_gate_validation_reason={exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
