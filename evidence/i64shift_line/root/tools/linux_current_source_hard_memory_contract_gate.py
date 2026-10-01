#!/usr/bin/env python3
"""Bind the unique current compiler to the native Linux hard-memory proof."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import platform
import re
import stat
import subprocess
import sys
from pathlib import Path
from typing import Any, Sequence

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve(strict=True).parent.parent
LIMIT_BYTES = 1_073_741_824
SWAP_MAX_BYTES = 0
SCHEMA = "cheng.linux_current_source_hard_memory_contract"
HARD_SCHEMA = "beat_c_linux_cgroup_v2_hard_memory_gate"
APPLICABILITY = "native_linux_delegated_cgroup_v2_only"
MEMORY_SCOPE = "rootless_oci_process_and_all_descendants"
ZERO_SHA256 = "0" * 64
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024
CURRENT_ENTRY_SPECS = {
    "src/core/tooling/backend_driver_dispatch_min.cheng":
        "cheng/core/tooling/backend_driver_dispatch_min",
    "src/core/tooling/backend_driver_main.cheng":
        "cheng/core/tooling/backend_driver_main",
}

HARD_RUNNER = ROOT / "tools/beat_c_linux_cgroup_v2_hard_memory_gate.py"
HARD_WRAPPER = ROOT / "tools/beat_c_linux_cgroup_v2_hard_memory_gate.sh"
HARD_VALIDATOR = (
    ROOT / "tools/beat_c_validate_linux_cgroup_v2_hard_memory_receipt.py"
)
HARD_VALIDATOR_WRAPPER = (
    ROOT / "tools/beat_c_validate_linux_cgroup_v2_hard_memory_receipt.sh"
)
CURRENT_GATE = ROOT / "tools/cid_linux_current_source_candidate_gate.sh"
GATE_SOURCE = Path(__file__).resolve(strict=True)
GATE_WRAPPER = ROOT / "tools/linux_current_source_hard_memory_contract_gate.sh"
STATIC_PATHS = (
    HARD_RUNNER,
    HARD_WRAPPER,
    HARD_VALIDATOR,
    HARD_VALIDATOR_WRAPPER,
    CURRENT_GATE,
    GATE_SOURCE,
    GATE_WRAPPER,
)


class ContractError(RuntimeError):
    pass


def sha256_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def canonical_json(value: Any) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")


def stable_read(path: Path, label: str) -> tuple[os.stat_result, bytes]:
    if not path.is_absolute() or path.is_symlink():
        raise ContractError(f"{label} must be an absolute regular file")
    before = os.stat(path, follow_symlinks=False)
    if not stat.S_ISREG(before.st_mode) or before.st_size > MAX_FILE_BYTES:
        raise ContractError(f"{label} type or size is invalid")
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0)
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(path, flags)
    try:
        opened = os.fstat(fd)
        if (
            opened.st_dev,
            opened.st_ino,
            opened.st_size,
            opened.st_mtime_ns,
            opened.st_ctime_ns,
        ) != (
            before.st_dev,
            before.st_ino,
            before.st_size,
            before.st_mtime_ns,
            before.st_ctime_ns,
        ):
            raise ContractError(f"{label} changed before read")
        chunks: list[bytes] = []
        remaining = before.st_size
        while remaining:
            chunk = os.read(fd, min(1024 * 1024, remaining))
            if not chunk:
                raise ContractError(f"{label} short read")
            chunks.append(chunk)
            remaining -= len(chunk)
        after = os.fstat(fd)
    finally:
        os.close(fd)
    if (
        after.st_dev,
        after.st_ino,
        after.st_size,
        after.st_mtime_ns,
        after.st_ctime_ns,
    ) != (
        before.st_dev,
        before.st_ino,
        before.st_size,
        before.st_mtime_ns,
        before.st_ctime_ns,
    ):
        raise ContractError(f"{label} changed during read")
    return before, b"".join(chunks)


def file_identity(path: Path) -> dict[str, Any]:
    info, raw = stable_read(path, str(path))
    return {
        "pathFshex": os.fsencode(path).hex(),
        "sha256": sha256_bytes(raw),
        "device": info.st_dev,
        "inode": info.st_ino,
        "size": info.st_size,
        "mtimeNs": info.st_mtime_ns,
        "ctimeNs": info.st_ctime_ns,
    }


def source_identity() -> dict[str, dict[str, Any]]:
    return {str(path): file_identity(path) for path in STATIC_PATHS}


def read_sources() -> dict[Path, str]:
    result: dict[Path, str] = {}
    for path in STATIC_PATHS:
        _info, raw = stable_read(path, f"static source {path.name}")
        result[path] = raw.decode("utf-8", "strict")
    return result


def require(source: str, values: Sequence[str], label: str) -> None:
    for value in values:
        if value not in source:
            raise ContractError(f"{label} missing required contract")


def validate_static(sources: dict[Path, str]) -> None:
    runner = sources[HARD_RUNNER]
    validator = sources[HARD_VALIDATOR]
    ingress = sources[CURRENT_GATE]
    unified = sources[GATE_SOURCE]
    require(
        runner,
        (
            "APPLICABILITY = \"native_linux_delegated_cgroup_v2_only\"",
            "MEMORY_SCOPE = \"rootless_oci_process_and_all_descendants\"",
            "LIMIT_BYTES = 1_073_741_824",
            "SWAP_MAX_BYTES = 0",
            "PIDS_MAX = 128",
            "memory.oom.group",
            "cgroup.kill",
            "\"create\"",
            "\"start\"",
            "--delegation-manifest",
            "--cgroup-parent",
            "--crun",
            "--rootfs-manifest",
            "live_validate(",
            '"--aggregate-evidence-dir"',
        ),
        "hard-memory producer",
    )
    require(
        validator,
        (
            "INPUT_SCHEMA = \"cheng.native_linux_delegated_cgroup_v2_inputs\"",
            "ROOTFS_SCHEMA = \"cheng.native_linux_rootfs_manifest\"",
            "DELEGATION_SCHEMA = \"cheng.native_linux_cgroup_v2_delegation\"",
            "LIVE_SCHEMA = \"cheng.native_linux_cgroup_v2_live_audit\"",
            "APPLICABILITY = \"native_linux_delegated_cgroup_v2_only\"",
            "require_root_owner=True",
            "memory.events.local",
            "def validate_pair(",
            "--live-phase",
        ),
        "independent validator",
    )
    require(
        ingress,
        (
            "#!/bin/bash\nset -euo pipefail",
            'exec "$ROOT/tools/beat_c_linux_cgroup_v2_hard_memory_gate.sh" '
            '"$@" --',
            "--require-pure-system-link-exec",
            "--root:/cheng-current-source/repo",
            '"--in:${ENTRY}"',
            '"--target:${TARGET}"',
        ),
        "official current-source ingress",
    )
    require(
        unified,
        (
            'SCHEMA = "cheng.linux_current_source_hard_memory_contract"',
            'APPLICABILITY = "native_linux_delegated_cgroup_v2_only"',
            'MEMORY_SCOPE = "rootless_oci_process_and_all_descendants"',
            "validator.validate_pair(",
            '"driverRole": "production"',
            '"userSpaceSamplingAuthority": 0',
            'parser.add_argument("--delegation-manifest")',
            'parser.add_argument("--cgroup-parent")',
            'parser.add_argument("--crun")',
            'parser.add_argument("--rootfs-manifest")',
        ),
        "unified gate",
    )
    for path in (HARD_WRAPPER, HARD_VALIDATOR_WRAPPER, GATE_WRAPPER):
        wrapper = sources[path]
        if not (
            wrapper.startswith("#!/usr/bin/env bash\nset -euo pipefail\n")
            or wrapper.startswith("#!/bin/bash\nset -euo pipefail\n")
        ):
            raise ContractError(f"{path.name} is not fail-stop")
    combined = "\n".join(sources.values()).lower()
    forbidden = (
        "dock" + "er",
        "coli" + "ma",
        "--image-" + "id",
        "--dock" + "er-host",
        "--coli" + "ma-profile",
        "container_and_all_" + "descendants",
        "snap" + "shotv1",
        "snap" + "shotv2",
    )
    for value in forbidden:
        if value in combined:
            raise ContractError(f"retired authority survived: {value}")
    privileged = "su" + "do"
    remote_shell = "s" + "sh"
    if privileged in combined or remote_shell in combined:
        raise ContractError("privileged or remote execution survived")


def static_mutations(sources: dict[Path, str]) -> int:
    mutations = (
        (
            HARD_RUNNER,
            'APPLICABILITY = "native_linux_delegated_cgroup_v2_only"',
        ),
        (
            HARD_RUNNER,
            'MEMORY_SCOPE = "rootless_oci_process_and_all_descendants"',
        ),
        (
            HARD_VALIDATOR,
            'DELEGATION_SCHEMA = "cheng.native_linux_cgroup_v2_delegation"',
        ),
        (CURRENT_GATE, "--require-pure-system-link-exec"),
    )
    for path, token in mutations:
        source = sources[path]
        if source.count(token) < 1:
            raise ContractError("mutation anchor drift")
        changed = dict(sources)
        index = source.rfind(token)
        changed[path] = (
            source[:index] + token[:-1] + "X" + source[index + len(token):]
        )
        try:
            validate_static(changed)
        except ContractError:
            continue
        raise ContractError("static mutation was accepted")
    return len(mutations)


def exact_existing_file(value: str | None, label: str) -> Path:
    if not value:
        raise ContractError(f"{label} is required")
    path = Path(value)
    stable_read(path, label)
    return path


def exact_existing_dir(value: str | None, label: str) -> Path:
    if not value:
        raise ContractError(f"{label} is required")
    path = Path(value)
    if not path.is_absolute() or path.is_symlink() or not path.is_dir():
        raise ContractError(f"{label} must be an absolute existing directory")
    return path


def exact_absent_path(value: str | None, label: str) -> Path:
    if not value:
        raise ContractError(f"{label} is required")
    path = Path(value)
    if not path.is_absolute() or path.exists() or path.is_symlink():
        raise ContractError(f"{label} must be an absolute absent path")
    if not path.parent.is_dir() or path.parent.is_symlink():
        raise ContractError(f"{label} parent is invalid")
    return path


def parse_candidate_build_entry(
    path: Path,
    expected_entry: str,
) -> tuple[str, str, str]:
    _info, raw = stable_read(path, "current build receipt")
    if not raw.endswith(b"\n"):
        raise ContractError("current build receipt is not canonical")
    rows: dict[str, str] = {}
    for line in raw.decode("utf-8", "strict").splitlines():
        key, separator, value = line.partition("=")
        if not separator or not key or key in rows:
            raise ContractError("current build receipt row is invalid")
        rows[key] = value
    module = CURRENT_ENTRY_SPECS.get(expected_entry)
    payload = rows.get("receipt_payload_sha256", "")
    suffix = f"receipt_payload_sha256={payload}\n".encode("utf-8")
    entry_sha = rows.get("candidate_entry_sha256", "")
    if (
        module is None
        or rows.get("candidate_entry_path") != expected_entry
        or rows.get("candidate_entry_module_path") != module
        or not SHA256_RE.fullmatch(entry_sha)
        or entry_sha == ZERO_SHA256
        or not SHA256_RE.fullmatch(payload)
        or not raw.endswith(suffix)
        or sha256_bytes(raw[:-len(suffix)]) != payload
    ):
        raise ContractError("current build receipt entry binding mismatch")
    return expected_entry, module, entry_sha


def load_validator() -> Any:
    spec = importlib.util.spec_from_file_location(
        "cheng_native_linux_hard_memory_validator",
        HARD_VALIDATOR,
    )
    if spec is None or spec.loader is None:
        raise ContractError("independent validator cannot be loaded")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def run_checked(argv: Sequence[str], timeout: int) -> None:
    completed = subprocess.run(
        list(argv),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        check=False,
    )
    if completed.stdout:
        sys.stdout.buffer.write(completed.stdout)
    if completed.returncode != 0 or completed.stderr:
        if completed.stderr:
            sys.stderr.buffer.write(completed.stderr)
        raise ContractError(f"hard-memory producer failed rc={completed.returncode}")


def write_receipt(path: Path, value: dict[str, Any]) -> None:
    prefix = canonical_json(value)
    output = dict(value)
    output["receiptSha256"] = sha256_bytes(prefix)
    raw = canonical_json(output) + b"\n"
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(path, flags, 0o400)
    try:
        if os.write(fd, raw) != len(raw):
            raise ContractError("unified receipt short write")
        os.fsync(fd)
    finally:
        os.close(fd)


def receipt_raw(evidence_dir: Path) -> bytes:
    _info, raw = stable_read(evidence_dir / "receipt.kv", "hard-memory receipt")
    return raw


def positive_uint(rows: dict[str, str], key: str) -> int:
    value = rows.get(key, "")
    if not value.isdigit() or int(value) <= 0:
        raise ContractError(f"positive receipt field missing: {key}")
    return int(value)


def build_unified_receipt(
    workload: dict[str, str],
    attack: dict[str, str],
    workload_raw: bytes,
    attack_raw: bytes,
    source_hash: str,
) -> dict[str, Any]:
    required = {
        "schema": HARD_SCHEMA,
        "applicability": APPLICABILITY,
        "driver_role": "production",
        "hard_memory_limit_proof_status":
            "proved_linux_kernel_cgroup_v2_aggregate",
        "memory_enforcement_scope": MEMORY_SCOPE,
        "memory_limit_bytes": str(LIMIT_BYTES),
        "memory_swap_max_bytes": str(SWAP_MAX_BYTES),
    }
    for rows in (workload, attack):
        for key, value in required.items():
            if rows.get(key) != value:
                raise ContractError(f"validated receipt field drift: {key}")
    if workload.get("execution_result") != "exited_zero":
        raise ContractError("workload did not exit successfully")
    if attack.get("execution_result") != "kernel_oom_group_killed":
        raise ContractError("aggregate attack was not rejected by the kernel")
    for key in (
        "delegation_manifest_sha256",
        "crun_sha256",
        "rootfs_manifest_sha256",
        "rootfs_tree_cid",
        "native_descriptor_sha256",
        "runner_sha256",
        "validator_sha256",
    ):
        value = workload.get(key, "")
        if not SHA256_RE.fullmatch(value) or value == ZERO_SHA256:
            raise ContractError(f"validated identity is absent: {key}")
        if attack.get(key) != value:
            raise ContractError(f"paired identity drift: {key}")
    return {
        "schema": SCHEMA,
        "status": "passed",
        "applicability": APPLICABILITY,
        "driverRole": "production",
        "hardMemoryProofStatus":
            "proved_linux_kernel_cgroup_v2_aggregate",
        "memoryEnforcementScope": MEMORY_SCOPE,
        "memoryMax": LIMIT_BYTES,
        "memorySwapMax": SWAP_MAX_BYTES,
        "userSpaceSamplingAuthority": 0,
        "delegationManifestSha256":
            workload["delegation_manifest_sha256"],
        "delegationParentPathFshex":
            workload["delegation_parent_path_fshex"],
        "delegationBootId": workload["delegation_boot_id"],
        "cgroupNamespaceInode": int(workload["cgroup_namespace_inode"]),
        "crunSha256": workload["crun_sha256"],
        "rootfsManifestSha256": workload["rootfs_manifest_sha256"],
        "rootfsTreeCid": workload["rootfs_tree_cid"],
        "sourceClosureCid": workload["source_closure_cid"],
        "sourceClosureCaptureSha256":
            workload["source_closure_capture_sha256"],
        "currentDriverSha256": workload["current_driver_sha256"],
        "currentBuildReceiptSha256":
            workload["current_build_receipt_sha256"],
        "candidateEntryPath": workload["current_entry_path"],
        "candidateEntryModulePath": workload["current_entry_module_path"],
        "candidateEntrySha256": workload["current_entry_sha256"],
        "nativeDescriptorSha256":
            workload["native_descriptor_sha256"],
        "nativeDescriptorPayloadSha256":
            workload["native_descriptor_payload_sha256"],
        "nativeDescriptorWorkerSha256":
            workload["native_descriptor_worker_sha256"],
        "target": workload["native_descriptor_target"],
        "workloadReceiptSha256": sha256_bytes(workload_raw),
        "workloadHardGateReceiptSha256": workload["receipt_sha256"],
        "workloadArtifactManifestSha256":
            workload["artifact_manifest_sha256"],
        "workloadMemoryPeakBytes":
            positive_uint(workload, "memory_peak_after_bytes"),
        "aggregateAttackReceiptSha256": sha256_bytes(attack_raw),
        "aggregateAttackHardGateReceiptSha256":
            attack["receipt_sha256"],
        "aggregateAttackArtifactManifestSha256":
            attack["artifact_manifest_sha256"],
        "aggregateAttackMemoryPeakBytes":
            positive_uint(attack, "memory_peak_after_bytes"),
        "aggregateAttackMaxEvents":
            positive_uint(attack, "memory_events_local_after_max"),
        "aggregateAttackOomEvents":
            positive_uint(attack, "memory_events_local_after_oom"),
        "aggregateAttackOomKillEvents":
            positive_uint(attack, "memory_events_local_after_oom_kill"),
        "aggregateAttackOomGroupKillEvents":
            positive_uint(attack, "memory_events_local_after_oom_group_kill"),
        "contractSourceHash": source_hash,
        "gateSha256": file_identity(GATE_SOURCE)["sha256"],
    }


def run_dynamic(
    args: argparse.Namespace,
    source_before: dict[str, dict[str, Any]],
) -> None:
    if platform.system() != "Linux":
        raise ContractError("dynamic proof requires native Linux")
    if os.geteuid() == 0:
        raise ContractError("dynamic proof must run as delegated non-root user")
    evidence_root = exact_absent_path(args.evidence_root, "evidence root")
    output = exact_absent_path(args.output, "unified receipt")
    if output == evidence_root or evidence_root in output.parents:
        raise ContractError("unified receipt must be outside evidence root")
    workspace_root = exact_existing_dir(args.workspace_root, "workspace root")
    source_closure = exact_existing_file(args.source_closure, "source closure")
    driver = exact_existing_file(args.driver, "current driver")
    build_receipt = exact_existing_file(
        args.build_receipt,
        "current build receipt",
    )
    entry_path, _entry_module, _entry_sha = parse_candidate_build_entry(
        build_receipt,
        args.entry,
    )
    native_descriptor = exact_existing_file(
        args.native_descriptor,
        "native descriptor",
    )
    delegation_manifest = exact_existing_file(
        args.delegation_manifest,
        "delegation manifest",
    )
    rootfs_manifest = exact_existing_file(
        args.rootfs_manifest,
        "rootfs manifest",
    )
    cgroup_parent = exact_existing_dir(args.cgroup_parent, "cgroup parent")
    rootfs = exact_existing_dir(args.rootfs, "rootfs")
    crun = exact_existing_file(args.crun, "crun")
    inputs = (
        source_closure,
        driver,
        build_receipt,
        native_descriptor,
        delegation_manifest,
        rootfs_manifest,
        crun,
    )
    input_before = {str(path): file_identity(path) for path in inputs}
    argv = (
        str(CURRENT_GATE),
        "--target",
        args.target,
        "--entry",
        entry_path,
        "--delegation-manifest",
        str(delegation_manifest),
        "--cgroup-parent",
        str(cgroup_parent),
        "--crun",
        str(crun),
        "--rootfs",
        str(rootfs),
        "--rootfs-manifest",
        str(rootfs_manifest),
        "--evidence-root",
        str(evidence_root),
        "--workspace-root",
        str(workspace_root),
        "--source-closure",
        str(source_closure),
        "--driver",
        str(driver),
        "--build-receipt",
        str(build_receipt),
        "--native-descriptor",
        str(native_descriptor),
        "--native-descriptor-sha256",
        args.native_descriptor_sha256,
        "--timeout-seconds",
        str(args.timeout_seconds),
    )
    run_checked(argv, args.timeout_seconds * 3)
    validator = load_validator()
    workload, attack = validator.validate_pair(
        evidence_root / "workload",
        evidence_root / "aggregate-oom",
        workspace_root=workspace_root,
        source_closure=source_closure,
        driver=driver,
        build_receipt=build_receipt,
        native_descriptor_path=native_descriptor,
        native_descriptor_sha256=args.native_descriptor_sha256,
    )
    source_after = source_identity()
    if source_after != source_before:
        raise ContractError("contract sources drifted during proof")
    for raw_path, identity in input_before.items():
        if file_identity(Path(raw_path)) != identity:
            raise ContractError(f"bound input drifted: {raw_path}")
    workload_raw = receipt_raw(evidence_root / "workload")
    attack_raw = receipt_raw(evidence_root / "aggregate-oom")
    unified = build_unified_receipt(
        workload,
        attack,
        workload_raw,
        attack_raw,
        sha256_bytes(canonical_json(source_after)),
    )
    write_receipt(output, unified)
    print("linux_current_source_hard_memory_dynamic_status=pass")
    print(f"linux_current_source_hard_memory_receipt={output}")
    print("linux_current_source_hard_memory_status=pass")


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate the unique current compiler under native Linux",
    )
    parser.add_argument("--entry")
    parser.add_argument(
        "--target",
        choices=(
            "aarch64-unknown-linux-gnu",
            "x86_64-unknown-linux-gnu",
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
    parser.add_argument("--output")
    parser.add_argument("--timeout-seconds", type=int, default=3600)
    return parser.parse_args(argv)


def main(argv: Sequence[str]) -> int:
    try:
        args = parse_args(argv)
        sources = read_sources()
        validate_static(sources)
        mutation_count = static_mutations(sources)
        print("linux_current_source_hard_memory_static_status=pass")
        print(
            "linux_current_source_hard_memory_static_mutation_count="
            f"{mutation_count}"
        )
        print(f"linux_current_source_hard_memory_limit_bytes={LIMIT_BYTES}")
        print(f"linux_current_source_hard_memory_swap_max_bytes={SWAP_MAX_BYTES}")
        print(f"linux_current_source_hard_memory_scope={MEMORY_SCOPE}")
        dynamic_values = (
            args.entry,
            args.target,
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
            args.output,
        )
        if not any(dynamic_values):
            print(
                "linux_current_source_hard_memory_dynamic_status=red",
                file=sys.stderr,
            )
            print(
                "linux_current_source_hard_memory_reason="
                "native_delegated_inputs_missing",
                file=sys.stderr,
            )
            print("production_release_status=HARD_RED", file=sys.stderr)
            print("darwin_release_status=HARD_RED", file=sys.stderr)
            return 1
        if not all(dynamic_values):
            raise ContractError("dynamic inputs must be complete")
        if args.timeout_seconds < 1 or args.timeout_seconds > 3600:
            raise ContractError("timeout must be in 1..3600 seconds")
        run_dynamic(args, source_identity())
        return 0
    except (
        ContractError,
        OSError,
        ValueError,
        TypeError,
        KeyError,
        UnicodeError,
        subprocess.SubprocessError,
    ) as exc:
        print("linux_current_source_hard_memory_status=failed", file=sys.stderr)
        print(
            f"linux_current_source_hard_memory_reason={exc}",
            file=sys.stderr,
        )
        print("production_release_status=HARD_RED", file=sys.stderr)
        print("darwin_release_status=HARD_RED", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
