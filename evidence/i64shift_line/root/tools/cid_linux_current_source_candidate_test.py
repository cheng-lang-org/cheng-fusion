#!/usr/bin/env python3
"""Bounded mutation net for Linux current-source image and candidate formats."""

from __future__ import annotations

import gzip
import importlib.util
import io
import os
import stat
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path
from types import SimpleNamespace
from typing import Any


ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent


def load(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


validator = load(
    "cid_linux_current_source_candidate_validate",
    "cid_linux_current_source_candidate_validate.py",
)
builder = load(
    "cid_linux_current_source_candidate_builder",
    "cid_linux_current_source_candidate_builder.py",
)
case_image = load(
    "cid_linux_identity_chain_case_image",
    "cid_linux_identity_chain_case_image.py",
)
ENTRY_PATH = "src/core/tooling/backend_driver_dispatch_min.cheng"
ENTRY_MODULE_PATH = validator.CURRENT_ENTRY_SPECS[ENTRY_PATH]


def sha(raw: bytes) -> str:
    return validator.sha256_bytes(raw)


def expect_failure(action, label: str) -> None:
    try:
        action()
    except (
        validator.ValidationError, builder.BuildError, case_image.CaseImageError,
        OSError, tarfile.TarError,
    ):
        return
    raise AssertionError(f"mutation survived: {label}")


def validate_bound_reports(
    payloads: dict[str, bytes],
    candidate: bytes,
    frozen: dict[str, Any],
):
    return validator.validate_bound_reports(
        payloads,
        candidate,
        frozen,
        ENTRY_PATH,
    )


def validate_cheng_current_receipt_wiring() -> None:
    dispatch_source = (
        PROJECT_ROOT / "src/core/tooling/backend_driver_dispatch_min.cheng"
    ).read_text(encoding="utf-8")
    authority_source = (
        PROJECT_ROOT / "src/core/backend/system_link_exec.cheng"
    ).read_text(encoding="utf-8")
    plan_source = (
        PROJECT_ROOT / "src/core/backend/system_link_plan.cheng"
    ).read_text(encoding="utf-8")
    runtime_source = (
        PROJECT_ROOT / "src/core/backend/system_link_exec_runtime.cheng"
    ).read_text(encoding="utf-8")
    cold_source = (PROJECT_ROOT / "bootstrap/cheng_cold.c").read_text(
        encoding="utf-8"
    )
    workload = (
        PROJECT_ROOT / "tools/cid_linux_current_source_candidate_workload.sh"
    ).read_text(encoding="utf-8")
    hard_gate = (
        PROJECT_ROOT / "tools/beat_c_linux_cgroup_v2_hard_memory_gate.py"
    ).read_text(encoding="utf-8")
    hard_gate_validator = (
        PROJECT_ROOT / "tools/beat_c_validate_linux_cgroup_v2_hard_memory_receipt.py"
    ).read_text(encoding="utf-8")
    candidate_validator = (
        PROJECT_ROOT / "tools/cid_linux_current_source_candidate_validate.py"
    ).read_text(encoding="utf-8")
    link_object_smoke = (
        PROJECT_ROOT / "tools/cold_link_object_provider_smoke.sh"
    ).read_text(encoding="utf-8")
    canonical_work_root = "/cheng-hardcap-work/cheng-current-source-candidate"
    assert validator.WORK_ROOT == canonical_work_root
    assert workload.splitlines().count(
        f"readonly WORK={canonical_work_root}"
    ) == 1
    assert "/dev/shm/cheng-current-source-candidate" not in workload

    def function(source: str, name: str) -> str:
        start = source.index(f"fn {name}(")
        end = source.find("\nfn ", start + 1)
        return source[start:] if end < 0 else source[start:end]

    request = function(
        authority_source,
        "SystemLinkExecLinuxPassBCurrentReceiptRequest",
    )
    authority_report = function(
        authority_source,
        "SystemLinkExecLinuxPassBCurrentReceiptReportInto",
    )
    physical_report = function(
        plan_source,
        "SystemLinkPlanSourceBundleBindingPhysicalReport",
    )
    runtime_report = function(
        runtime_source,
        "SystemLinkExecRuntimeLinuxPassBCurrentReceiptReportInto",
    )
    formal_execute = function(
        dispatch_source,
        "BackendDriverDispatchMinExecuteFormalRequestInto",
    )
    defer_report = function(
        dispatch_source,
        "BackendDriverDispatchMinAppendRegallocDeferReceiptReport",
    )
    run_system_link_exec = function(
        dispatch_source,
        "BackendDriverDispatchMinRunSystemLinkExecFromCmdline",
    )
    assert (
        "BackendDriverDispatchMinAppendLinuxPassBCurrentReceiptAfterOutput"
        not in dispatch_source
    )
    assert (
        "BackendDriverDispatchMinFreezeLinuxPassBCurrentReceiptBeforeLowering"
        not in dispatch_source
    )
    assert (
        '"x86_64-unknown-linux-gnu"' in request
        and '"src/core/tooling/backend_driver_dispatch_min.cheng"' in request
        and '"artifacts/bootstrap/compiler_main.direct.next"' in request
    )
    assert (
        "SystemLinkExecPlanFinalCidChainStrictValidateInto(" in authority_report
        and "SystemLinkExecPlanSourceBundleReceiptValidInto(" in authority_report
        and "ccsg.CompileOutputReceiptCid(" in authority_report
    )
    assert (
        "plan.compileReceipt.runtimeProviderSet.len" in runtime_report
        and "result.providerParallelTaskCount != providerCount" in runtime_report
        and "result.providerObjectPaths.len != providerCount" in runtime_report
        and "chengpath.FileExistsNonEmpty(" in runtime_report
    )
    assert (
        '"tools/backend2_version_manifest.rec"' in runtime_report
        and "SystemLinkExecRuntimeFileSha256Into(" in runtime_report
        and "SystemLinkExecLinuxPassBCurrentReceiptReportInto(" in runtime_report
        and "SystemLinkExecRuntimeResultReport(result)" in runtime_report
    )
    for key in (
        "source_bundle_binding_physical_workspace_root_fshex",
        "source_bundle_binding_physical_package_root_fshex",
        "source_bundle_binding_physical_external_root_count",
        "source_bundle_binding_physical_identity_path_count",
        "source_bundle_binding_physical_source_closure_path_count",
        "source_bundle_binding_physical_owner_module_path_count",
        "source_bundle_binding_physical_import_edge_count",
        "target_source_path_fshex",
    ):
        assert key in physical_report
    for unsafe_key in (
        '"source_bundle_binding_physical_workspace_root"',
        '"source_bundle_binding_physical_package_root"',
        'Fmt"{edgePrefix}.target_source_path"',
    ):
        assert unsafe_key not in physical_report
    assert (
        'out = Fmt"{out}{sourceBundleBindingPhysicalReport}\\n"'
        in authority_report
        and 'out = Fmt"{out}\\n{sourceBundleBindingPhysicalReport}"'
        not in authority_report
    )
    assert (
        formal_execute.index("BuildSystemLinkExecPlanWithWorldAndChannelInto(")
        < formal_execute.index(
            "BackendDriverDispatchMinAppendRegallocDeferReceiptReport("
        )
        < formal_execute.index(
            "SystemLinkExecRuntimeExecutePlanWithCompilerInto("
        )
        < formal_execute.index(
            "SystemLinkExecRuntimeLinuxPassBCurrentReceiptReportInto("
        )
    )
    assert (
        formal_execute.count(
            "SystemLinkExecRuntimeLinuxPassBCurrentReceiptReportInto("
        ) == 1
        and 'reportKind == "" &&' in formal_execute
        and "SystemLinkExecPlanReport" not in formal_execute
        and "SystemLinkExecRuntimeResultReport" not in formal_execute
    )
    assert (
        "plan.primaryObjectPlan.regallocDeferFunctionRows" in defer_report
        and "plan.primaryObjectPlan.regallocDeferStatementRows"
        in defer_report
        and "plan.primaryObjectPlan.regallocDeferActionCids" in defer_report
        and "plan.primaryObjectPlan.regallocDeferFragmentCids" in defer_report
        and "plan.primaryObjectPlan.actualBackendKind" in defer_report
        and "creq.CompilerBackendKindText(plan.requestBackendKind)"
        in defer_report
        and "defer_receipt_count" in defer_report
        and "defer_receipt_backend_role" in defer_report
        and formal_execute.index(
            "SystemLinkExecRuntimeLinuxPassBCurrentReceiptReportInto("
        )
        < formal_execute.index(
            'Fmt"{preExecutionReport}\\n{deferReceiptReport}"'
        )
    )
    assert (
        "SystemLinkExecPlanReport" not in run_system_link_exec
        and "SystemLinkExecRuntimeResultReport" not in run_system_link_exec
        and "len(preExecutionReport) > 0" in run_system_link_exec
        and "BackendDriverDispatchMinWriteReport(" in run_system_link_exec
    )
    for key in (
        "system_link_exec",
        "real_backend_codegen",
        "output_sha256",
        "backend2_version_manifest_sha256",
        "compiler_output_receipt_cid",
        "source_bundle_receipt_source_bundle_cid",
        "source_bundle_cid",
        "source_identity_receipt_cid",
        "canonical_compiler_csg_cid",
        "semantic_receipt_cid",
        "source_to_csg_binding_seal",
        "compile_receipt_world_head_cid",
        "compile_receipt_source_identity_receipt_cid",
        "compile_receipt_semantic_receipt_cid",
        "compile_receipt_output_digest",
        "compile_receipt_canonical_output_digest",
        "compile_receipt_target",
        "compile_receipt_bootstrap_stage",
        "compile_receipt_runtime_provider_count",
        "compile_receipt_cid",
        "pure_provenance_bootstrap_materialize",
        "pure_provenance_gate",
    ):
        assert authority_report.count(f'"{key}"') == 1, key
    assert (
        authority_report.index('"compiler_output_receipt_cid"')
        < authority_report.index(
            '"source_bundle_receipt_source_bundle_cid"'
        )
        < authority_report.index('"compile_receipt_cid"')
    )
    ordered_keys = (
        "system_link_exec",
        "real_backend_codegen",
        "target",
        "emit",
        "output",
        "output_sha256",
        "backend2_version_manifest_sha256",
        "compiler_output_receipt_cid",
        "source_bundle_receipt_source_bundle_cid",
        "source_bundle_receipt_seal",
        "source_bundle_entry_identity_seal",
        "source_bundle_binding_seal",
        "source_bundle_entry_source_index",
        "source_identity_receipt_source_package_id",
        "source_identity_receipt_entry_module_path",
        "source_identity_receipt_source_snapshot_count",
        "source_identity_receipt_import_edge_count",
        "source_identity_receipt_unresolved_import_count",
        "source_identity_receipt_source_package_id_cid",
        "source_identity_receipt_entry_module_path_cid",
        "entry_source_cid",
        "source_identity_receipt_import_graph_cid",
        "source_identity_receipt_cid",
        "canonical_compiler_csg_cid",
        "semantic_receipt_cid",
        "source_to_csg_binding_seal",
        "compile_receipt_world_head_cid",
        "compile_receipt_source_identity_receipt_cid",
        "compile_receipt_semantic_receipt_cid",
        "compile_receipt_output_digest",
        "compile_receipt_canonical_output_digest",
        "compile_receipt_target",
        "compile_receipt_bootstrap_stage",
        "compile_receipt_runtime_provider_count",
        "compile_receipt_cid",
    )
    ordered_positions = [
        authority_report.index(f'"{key}"') for key in ordered_keys
    ]
    assert ordered_positions == sorted(ordered_positions)
    assert "index_format=backend_driver_full_transition\\n" in cold_source
    assert "index_format=cold_frontend_source_index\\n" in cold_source
    assert "backend_driver_full_transition_v1" not in cold_source
    assert "cold_frontend_source_index_v1" not in cold_source
    assert "index_format=backend_driver_full_transition'" in workload
    assert "bootstrap_seed_index_version_fragment" in workload
    for fragment in (
        "hard_memory_gate.v1", "cgroup_v2_audit.v1",
        "cgroup_v2_artifacts.v1", "cgroup_v2_attach_protocol.v1",
        "cgroup_v2_inputs.v1", "cgroup_v2_output_identity.v1",
        "cheng_hardcap_before_v1", "cheng_hardcap_start_v1",
        "cheng_hardcap_after_v1", "cheng_hardcap_release_v1",
    ):
        assert fragment not in hard_gate
        assert fragment not in hard_gate_validator
    for fragment in (
        '"--aggregate-evidence-dir"',
        '"--workspace-root"',
        '"--source-closure"',
        '"--driver"',
        '"--build-receipt"',
        '"--native-descriptor"',
        '"--native-descriptor-sha256"',
        "hard_gate_validation_status=passed_unique_current",
    ):
        assert fragment in candidate_validator
    assert "hard_gate_validation_status=passed\\n" not in candidate_validator

    current_cid_sources = (
        "src/core/backend/system_link_plan.cheng",
        "src/core/backend/system_link_exec.cheng",
        "src/core/tooling/compiler_csg.cheng",
        "src/core/tooling/compiler_equivalence.cheng",
        "src/core/tooling/compiler_world.cheng",
        "src/core/tooling/compiler_world_bundle.cheng",
        "src/core/tooling/compiler_world_libp2p.cheng",
        "src/core/tooling/compiler_main.cheng",
        "src/core/tooling/compiler_stage_receipt.cheng",
        "src/core/tooling/compiler_parser_receipt.cheng",
    )
    forbidden_current_cid_types = (
        "CompilerSourceIdentityReceiptV2", "CompileSemanticReceiptV1",
        "CompileReceiptV3", "CompilerMigrationEvidenceV3",
        "CompilerMigrationSemanticProofV2",
        "CompilerUniverseManifestEntryV2",
        "CompilerManagedMirrorBundleV2",
        "CompilerWorldBundleEnvelopeV2",
    )
    for relative in current_cid_sources:
        current_source = (PROJECT_ROOT / relative).read_text(encoding="utf-8")
        for fragment in forbidden_current_cid_types:
            assert fragment not in current_source

    managed_mirror_core = (
        PROJECT_ROOT / "src/core/tooling/compiler_world_libp2p.cheng"
    ).read_text(encoding="utf-8")
    managed_mirror_network = (
        PROJECT_ROOT / "src/core/tooling/compiler_world_libp2p_network.cheng"
    ).read_text(encoding="utf-8")
    for forbidden_import in (
        "import cheng/chain/",
        "import cheng/overlay/",
        "import cheng/libp2p/",
    ):
        assert forbidden_import not in managed_mirror_core
    assert (
        "import cheng/core/tooling/compiler_world_libp2p as cwlp"
        in managed_mirror_network
    )
    for required_import in (
        "import cheng/chain/",
        "import cheng/overlay/",
        "import cheng/libp2p/",
    ):
        assert required_import in managed_mirror_network

    cid_evidence_driver_paths = (
        "src/tests/cid_identity_evidence_source_case_driver.cheng",
        "src/tests/cid_identity_evidence_source_core_case_driver.cheng",
        "src/tests/cid_identity_evidence_zero_case_driver.cheng",
        "src/tests/cid_identity_evidence_atomic_case_driver.cheng",
        "src/tests/cid_identity_evidence_migration_case_driver.cheng",
        "src/tests/cid_identity_evidence_mirror_migration_case_driver.cheng",
        "src/tests/cid_identity_evidence_mirror_dependency_case_driver.cheng",
        "src/tests/cid_identity_evidence_mirror_plan_case_driver.cheng",
        "src/tests/cid_identity_evidence_mirror_bundle_case_driver.cheng",
        "src/tests/cid_identity_evidence_mirror_case_driver.cheng",
    )
    cid_evidence_drivers = [
        (PROJECT_ROOT / relative).read_text(encoding="utf-8")
        for relative in cid_evidence_driver_paths
    ]
    cid_evidence_driver = "\n".join(cid_evidence_drivers)
    for diagnostic_api in (
        "CompilerLegacyMigrationClone(",
        "BuildCompilerLegacyMigration(",
        "CompilerCsgClone(",
    ):
        assert diagnostic_api not in cid_evidence_driver
    assert cid_evidence_driver.count("BuildCompilerLegacyMigrationInto(") == 3
    assert cid_evidence_driver.count("BuildCompilerCsgInto(") == 3
    assert cid_evidence_driver.count(
        "BuildCompilerCsgConsumePortableReceiptInto("
    ) == 6
    cid_evidence_runner = (
        PROJECT_ROOT / "tools/cid_linux_identity_chain_evidence_runner.sh"
    ).read_text(encoding="utf-8")
    for relative in cid_evidence_driver_paths:
        assert cid_evidence_runner.count(relative) == 1
    assert cid_evidence_runner.count("compile_driver \"$SOURCE_MIRROR_") == 5
    assert cid_evidence_runner.count("run_stage mirror_plan_") == 3
    assert "run_stage mirror_bundle" in cid_evidence_runner
    assert "run_stage mirror_atomic" in cid_evidence_runner
    assert cid_evidence_runner.count(
        '--compile-report:"$WORK/case-compile.report"'
    ) == 2
    for fragment in (
        'cold_flag_value(argc, argv, "--link-object")',
        'cold_flag_value(argc, argv, "--link-object-source")',
        '"--link-object --link-providers requires --link-object-source"',
        '"    --link-object link an existing primary object;',
        '"    --link-object-source exact source identity required',
    ):
        assert fragment in cold_source
    for fragment in (
        '--link-object:"$OBJECT"',
        '--link-object-source:"$SOURCE"',
        "missing_source_identity_accepted",
        "missing_source_identity_diagnostic",
    ):
        assert fragment in link_object_smoke

    registered_cid_smokes = (
        "compiler_stage_receipt_smoke",
        "compiler_parser_receipt_smoke",
        "typed_expr_sealed_source_line_index_smoke",
        "compiler_csg_portable_identity_receipt_smoke",
        "compiler_csg_portable_atomic_consume_smoke",
        "compiler_csg_verified_snapshot_no_reopen_smoke",
        "compiler_csg_canonical_cid_path_independence_smoke",
        "compiler_world_single_source_cid_smoke",
        "compiler_migration_cid_receipt_smoke",
        "compiler_world_manifest_closure_smoke",
        "compiler_world_source_identity_exact_smoke",
        "system_link_source_bundle_binding_exact_smoke",
        "system_link_managed_dependency_receipt_exact_smoke",
        "system_link_source_bundle_receipt_smoke",
        "system_link_atomic_tree_provider_roots_smoke",
        "compiler_csg_cid_identity_attack_smoke",
        "compiler_csg_strict_wire_smoke",
        "compiler_csg_oracle_smoke",
        "compiler_migration_publish_smoke",
        "compiler_equivalence_contract_smoke",
        "compiler_migration_identity_attack_smoke",
        "compiler_managed_mirror_compile_probe",
        "compiler_managed_mirror_commit_verify_smoke",
        "compiler_managed_mirror_locator_snapshot_smoke",
        "compiler_managed_mirror_atomic_smoke",
        "parser_migration_else_if_smoke",
        "typed_expr_migration_source_syntax_smoke",
    )
    for relative in (
        "src/core/tooling/host_smoke_gate.cheng",
        "src/core/tooling/seed_stage23_libp2p_gate.cheng",
    ):
        gate_source = (PROJECT_ROOT / relative).read_text(encoding="utf-8")
        if relative.endswith("host_smoke_gate.cheng"):
            start = gate_source.index("fn HostSmokeDefaultSmokes(): str[] =")
            end = gate_source.index("\n\nfn HostSmokeResolveCompiler", start)
        else:
            start = gate_source.index("fn SeedStage23DefaultSmokes(): str[] =")
            end = gate_source.index("\n\nfn SeedStage23CompileEnv", start)
        default_smokes = gate_source[start:end]
        for smoke in registered_cid_smokes:
            assert default_smokes.count(f'"{smoke}"') == 1


def entry(path: str, raw: bytes) -> dict[str, Any]:
    return {"path": path, "size": len(raw), "sha256": sha(raw)}


def frozen_manifest(source_raw: bytes = b"package_id = \"pkg://cheng\"\n") -> tuple[dict[str, Any], bytes, dict[str, bytes]]:
    files = {
        "cheng-package.toml": source_raw,
        ENTRY_PATH: (PROJECT_ROOT / ENTRY_PATH).read_bytes(),
        "src/core/tooling/backend_driver_main.cheng": (
            PROJECT_ROOT / "src/core/tooling/backend_driver_main.cheng"
        ).read_bytes(),
        "tools/backend2_version_manifest.rec": b"backend2_version=review\n",
        "tools/cid_linux_current_source_candidate_builder.py": b"builder\n",
        "tools/cid_linux_current_source_candidate_workload.sh": b"#!/bin/sh\nexit 0\n",
        "tools/cid_linux_current_source_candidate_validate.py": b"validator\n",
    }
    source_entries = [
        entry(path, files[path])
        for path in sorted((
            "cheng-package.toml",
            ENTRY_PATH,
            "src/core/tooling/backend_driver_main.cheng",
        ))
    ]
    tool_entries = [
        entry(path, files[path])
        for path in sorted((
            "tools/backend2_version_manifest.rec",
            "tools/cid_linux_current_source_candidate_builder.py",
            "tools/cid_linux_current_source_candidate_workload.sh",
            "tools/cid_linux_current_source_candidate_validate.py",
        ))
    ]
    value = {
        "schema": validator.CLOSURE_SCHEMA,
        "sourceEntryCount": len(source_entries),
        "sourceClosureSha256": validator.framed_closure(validator.SOURCE_DOMAIN, source_entries),
        "sourceEntries": source_entries,
        "toolEntryCount": len(tool_entries),
        "toolClosureSha256": validator.framed_closure(validator.TOOL_DOMAIN, tool_entries),
        "toolEntries": tool_entries,
    }
    raw = validator.canonical_json(value) + b"\n"
    assert validator.parse_frozen_manifest(raw) == value
    return value, raw, files


def tar_info(name: str, *, mode: int, kind: bytes = tarfile.REGTYPE, size: int = 0) -> tarfile.TarInfo:
    info = tarfile.TarInfo(name)
    info.type = kind
    info.size = size
    info.mode = mode
    info.uid = 0
    info.gid = 0
    info.mtime = 1
    return info


def add_file(archive: tarfile.TarFile, name: str, raw: bytes, *, mode: int = 0o644,
             mtime: int = 1, uid: int = 0, kind: bytes = tarfile.REGTYPE) -> None:
    info = tar_info(name, mode=mode, kind=kind, size=len(raw) if kind == tarfile.REGTYPE else 0)
    info.mtime = mtime
    info.uid = uid
    if kind == tarfile.SYMTYPE:
        info.linkname = "/dev/null"
    archive.addfile(info, io.BytesIO(raw) if kind == tarfile.REGTYPE else None)


def add_dir(archive: tarfile.TarFile, name: str) -> None:
    archive.addfile(tar_info(name, mode=0o755, kind=tarfile.DIRTYPE))


def validate_builder_canonical_context_archive(
    frozen: dict[str, Any], frozen_raw: bytes, files: dict[str, bytes],
) -> None:
    with tempfile.TemporaryDirectory(
        prefix="cheng-cid-canonical-context-unit-"
    ) as temp_raw:
        root = Path(temp_raw).resolve()
        image_root = root / "cheng-current-source"
        repo_root = image_root / "repo"
        repo_root.mkdir(parents=True)
        for column in ("sourceEntries", "toolEntries"):
            for entry in frozen[column]:
                destination = repo_root / entry["path"]
                destination.parent.mkdir(parents=True, exist_ok=True)
                builder.write_exclusive(destination, files[entry["path"]], 0o644)
        os.symlink("/cheng-hardcap-work/artifacts", repo_root / "artifacts")
        builder.write_exclusive(
            image_root / "source-tool-manifest.json", frozen_raw, 0o644
        )
        builder.write_exclusive(
            image_root / "closure.kv",
            validator.closure_receipt_raw(frozen, frozen_raw),
            0o644,
        )
        builder.normalize_tree(image_root)
        os.chmod(repo_root / builder.WORKLOAD_PATH, 0o755)
        archive_path = root / "context.tar"
        builder.write_canonical_context_archive(image_root, archive_path)
        validator.validate_layer_context(archive_path, frozen, frozen_raw)
        with tarfile.open(archive_path, mode="r:") as archive:
            members = archive.getmembers()
        assert members
        assert all(member.uid == 0 and member.gid == 0 for member in members)
        assert all(member.mtime == 1 for member in members)


def validate_builder_frozen_snapshot(
    frozen: dict[str, Any], frozen_raw: bytes, files: dict[str, bytes],
) -> None:
    with tempfile.TemporaryDirectory(
        prefix="cheng-cid-frozen-snapshot-unit-"
    ) as temp_raw:
        root = Path(temp_raw).resolve()
        input_root = root / "input"
        fusion_root = root / "fusion"
        staging = root / "staging"
        input_root.mkdir()
        fusion_root.mkdir()
        staging.mkdir()
        for relative, raw in files.items():
            destination = input_root / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(raw)
        repo_root, copied_fusion_root, manifest_path = (
            builder.materialize_frozen_snapshot(
                input_root, fusion_root, staging, frozen, frozen_raw,
            )
        )
        assert manifest_path.read_bytes() == frozen_raw
        assert not any(copied_fusion_root.rglob("*"))
        for relative, raw in files.items():
            assert (repo_root / relative).read_bytes() == raw
        builder.make_snapshot_read_only(staging)
        assert stat.S_IMODE(staging.stat().st_mode) == 0o500
        assert stat.S_IMODE(manifest_path.stat().st_mode) == 0o400
        assert stat.S_IMODE(
            (repo_root / builder.WORKLOAD_PATH).stat().st_mode
        ) == 0o500
        builder.remove_snapshot_staging(staging)
        assert not staging.exists()

        changed_staging = root / "changed-staging"
        changed_staging.mkdir()
        (input_root / "cheng-package.toml").write_bytes(b"changed\n")
        expect_failure(
            lambda: builder.materialize_frozen_snapshot(
                input_root, fusion_root, changed_staging, frozen, frozen_raw,
            ),
            "changed input copied into frozen snapshot",
        )


def write_docker_save_archive(
    path: Path,
    layer_raws: list[bytes],
    *,
    descriptor_size_delta: int = 0,
    bad_diff_id: bool = False,
    gzip_trailing: bool = False,
    gzip_concat: bool = False,
    outer_extra: bool = False,
    nested_source_index: bool = False,
    inherited_env: list[str] | None = None,
) -> tuple[str, str, str]:
    compressed_layers = [
        gzip.compress(raw, compresslevel=6, mtime=0) for raw in layer_raws
    ]
    if gzip_concat:
        compressed_layers[-1] += gzip.compress(b"second", compresslevel=6, mtime=0)
    if gzip_trailing:
        compressed_layers[-1] += b"trailing"
    layer_digests = ["sha256:" + sha(raw) for raw in compressed_layers]
    diff_ids = ["sha256:" + sha(raw) for raw in layer_raws]
    if bad_diff_id:
        diff_ids[-1] = "sha256:" + "9" * 64
    config = {
        "architecture": "amd64", "os": "linux",
        "rootfs": {"type": "layers", "diff_ids": diff_ids},
        "config": {"Cmd": ["/bin/true"]},
    }
    if inherited_env is not None:
        config["config"]["Env"] = inherited_env
    config_raw = validator.canonical_json(config)
    config_digest = "sha256:" + sha(config_raw)
    descriptors = []
    for layer_index, (digest, raw) in enumerate(
        zip(layer_digests, compressed_layers)
    ):
        descriptors.append({
            "mediaType": "application/vnd.oci.image.layer.v1.tar+gzip",
            "digest": digest,
            "size": len(raw) + (
                descriptor_size_delta
                if layer_index == len(compressed_layers) - 1 else 0
            ),
        })
    oci_manifest = {
        "schemaVersion": 2,
        "mediaType": "application/vnd.oci.image.manifest.v1+json",
        "config": {
            "mediaType": "application/vnd.oci.image.config.v1+json",
            "digest": config_digest, "size": len(config_raw),
        },
        "layers": descriptors,
    }
    oci_raw = validator.canonical_json(oci_manifest)
    oci_digest = "sha256:" + sha(oci_raw)
    top_raw = oci_raw
    top_digest = oci_digest
    top_media_type = "application/vnd.oci.image.manifest.v1+json"
    top_annotations: dict[str, str] | None = None
    if nested_source_index:
        top_raw = validator.canonical_json({
            "schemaVersion": 2,
            "mediaType": "application/vnd.oci.image.index.v1+json",
            "manifests": [
                {
                    "mediaType": "application/vnd.oci.image.manifest.v1+json",
                    "digest": oci_digest,
                    "size": len(oci_raw),
                    "platform": {"architecture": "amd64", "os": "linux"},
                },
                {
                    "mediaType": "application/vnd.oci.image.manifest.v1+json",
                    "digest": "sha256:" + "e" * 64,
                    "size": 1,
                    "platform": {"architecture": "arm64", "os": "linux"},
                },
            ],
        })
        top_digest = "sha256:" + sha(top_raw)
        top_media_type = "application/vnd.oci.image.index.v1+json"
        top_annotations = {"containerd.io/distribution.source.example": "frozen/base"}
    top_descriptor: dict[str, Any] = {
        "mediaType": top_media_type,
        "digest": top_digest,
        "size": len(top_raw),
    }
    if top_annotations is not None:
        top_descriptor["annotations"] = top_annotations
    index_raw = validator.canonical_json({
        "schemaVersion": 2,
        "mediaType": "application/vnd.oci.image.index.v1+json",
        "manifests": [top_descriptor],
    })
    layer_names = [
        f"blobs/sha256/{digest.split(':', 1)[1]}" for digest in layer_digests
    ]
    legacy_raw = validator.canonical_json([{
        "Config": f"blobs/sha256/{config_digest.split(':', 1)[1]}",
        "RepoTags": None,
        "Layers": layer_names,
    }])
    with tarfile.open(path, mode="w") as outer:
        add_dir(outer, "blobs")
        add_dir(outer, "blobs/sha256")
        add_file(outer, "index.json", index_raw)
        add_file(outer, "manifest.json", legacy_raw)
        add_file(outer, "oci-layout", b'{"imageLayoutVersion":"1.0.0"}')
        if top_digest != oci_digest:
            add_file(outer, f"blobs/sha256/{top_digest.split(':', 1)[1]}", top_raw)
        add_file(outer, f"blobs/sha256/{oci_digest.split(':', 1)[1]}", oci_raw)
        add_file(outer, f"blobs/sha256/{config_digest.split(':', 1)[1]}", config_raw)
        emitted: set[str] = set()
        for layer_name, compressed in zip(layer_names, compressed_layers):
            if layer_name in emitted:
                continue
            emitted.add(layer_name)
            add_file(outer, layer_name, compressed)
        if outer_extra:
            add_file(outer, "unexpected.bin", b"unexpected")
    return top_digest, config_digest, oci_digest


def opaque_layer(name: str, raw: bytes) -> bytes:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w") as layer:
        add_file(layer, name, raw)
    return buffer.getvalue()


def synthetic_base_archive(
    path: Path, base_layer_raws: list[bytes],
) -> tuple[str, str, str]:
    return write_docker_save_archive(
        path, base_layer_raws, nested_source_index=True,
    )


def synthetic_image_archive(
    path: Path, frozen: dict[str, Any], frozen_raw: bytes, files: dict[str, bytes],
    *, extra_context: str | None = None, alias_context: bool = False,
    duplicate_context: bool = False, whiteout: bool = False,
    bad_mode: bool = False, bad_mtime: bool = False, bad_uid: bool = False,
    bad_type: bool = False, descriptor_size_delta: int = 0,
    bad_diff_id: bool = False, gzip_trailing: bool = False,
    gzip_concat: bool = False, outer_extra: bool = False,
    base_layer_raws: list[bytes] | None = None,
    layer_order: list[int] | None = None,
    extra_layer: bool = False,
    inherited_env: list[str] | None = None,
) -> tuple[str, str, str]:
    manifest_bytes = frozen_raw
    closure_bytes = validator.closure_receipt_raw(frozen, frozen_raw)
    repo_names = [
        f"cheng-current-source/repo/{entry['path']}"
        for column in ("sourceEntries", "toolEntries")
        for entry in frozen[column]
    ]
    leafs = [
        "cheng-current-source/source-tool-manifest.json",
        "cheng-current-source/closure.kv",
        *repo_names,
        "cheng-current-source/repo/artifacts",
    ]
    dirs = sorted(validator.ancestor_directories(leafs), key=lambda value: (value.count("/"), value))
    layer_buffer = io.BytesIO()
    with tarfile.open(fileobj=layer_buffer, mode="w") as layer:
        for directory in dirs:
            add_dir(layer, directory)
        add_file(layer, "cheng-current-source/source-tool-manifest.json", manifest_bytes)
        add_file(layer, "cheng-current-source/closure.kv", closure_bytes)
        for column in ("sourceEntries", "toolEntries"):
            for item in frozen[column]:
                name = f"cheng-current-source/repo/{item['path']}"
                actual_name = f"../{name}" if alias_context and item["path"] == "cheng-package.toml" else name
                mode = 0o755 if item["path"].endswith("candidate_workload.sh") else 0o644
                if bad_mode and item["path"] == "cheng-package.toml":
                    mode = 0o600
                mtime = 2 if bad_mtime and item["path"] == "cheng-package.toml" else 1
                uid = 9 if bad_uid and item["path"] == "cheng-package.toml" else 0
                kind = tarfile.SYMTYPE if bad_type and item["path"] == "cheng-package.toml" else tarfile.REGTYPE
                add_file(layer, actual_name, files[item["path"]], mode=mode, mtime=mtime, uid=uid, kind=kind)
                if duplicate_context and item["path"] == "cheng-package.toml":
                    add_file(layer, name, files[item["path"]], mode=mode)
        artifacts = tar_info("cheng-current-source/repo/artifacts", mode=0o777, kind=tarfile.SYMTYPE)
        artifacts.linkname = "/cheng-hardcap-work/artifacts"
        layer.addfile(artifacts)
        if extra_context:
            add_file(layer, f"cheng-current-source/repo/{extra_context}", b"extra\n")
        if whiteout:
            add_file(layer, "cheng-current-source/repo/.wh.hidden", b"")
    layer_raws = [*(base_layer_raws or []), layer_buffer.getvalue()]
    if extra_layer:
        layer_raws.append(layer_raws[-1])
    if layer_order is not None:
        if sorted(layer_order) != list(range(len(layer_raws))):
            raise AssertionError("synthetic layer order is not a permutation")
        layer_raws = [layer_raws[index] for index in layer_order]
    return write_docker_save_archive(
        path,
        layer_raws,
        descriptor_size_delta=descriptor_size_delta,
        bad_diff_id=bad_diff_id,
        gzip_trailing=gzip_trailing,
        gzip_concat=gzip_concat,
        outer_extra=outer_extra,
        inherited_env=inherited_env,
    )


def candidate_bytes(marker: int = 0) -> bytes:
    raw = bytearray(64)
    raw[:6] = b"\x7fELF\x02\x01"
    raw[18:20] = (62).to_bytes(2, "little")
    raw[-1] = marker
    return bytes(raw)


def text_report(rows: dict[str, str]) -> bytes:
    return "".join(f"{key}={value}\n" for key, value in rows.items()).encode("utf-8")


def source_bundle_physical_fixture_rows(
    source_package_id: str,
    entry_module_path: str,
) -> dict[str, str]:
    prefix = validator.SOURCE_BUNDLE_BINDING_PHYSICAL_PREFIX
    closure_paths = (
        validator.CURRENT_REPOSITORY_ROOT
        + "/src/core/tooling/backend_driver_dispatch_min.cheng",
        validator.CURRENT_REPOSITORY_ROOT
        + "/src/core/backend/system_link_exec.cheng",
    )
    owner_paths = (
        entry_module_path,
        "cheng/core/backend/system_link_exec",
    )
    external_roots = validator.CURRENT_EXTERNAL_PACKAGE_ROOTS
    target_path = closure_paths[1]
    edge = {
        "owner_module_path": owner_paths[0],
        "target_module_path": owner_paths[1],
        "target_source_path": target_path,
        "target_source_path_len": str(len(target_path.encode("utf-8"))),
        "target_source_path_first_code": str(target_path.encode("utf-8")[0]),
        "target_source_path_last_code": str(target_path.encode("utf-8")[-1]),
        "target_source_path_dot_count": str(
            target_path.encode("utf-8").count(b".")
        ),
        "target_source_path_hash": str(
            validator.parser_text_lookup_content_hash(target_path)
        ),
        "target_profile_index": "-1",
        "import_alias": "sexec",
        "qualifier": "sexec",
        "allows_unqualified_call": "0",
        "resolved": "1",
    }
    rows: dict[str, str] = {
        f"{prefix}domain":
            validator.SOURCE_BUNDLE_BINDING_PHYSICAL_DOMAIN,
        f"{prefix}workspace_root_fshex":
            validator.CURRENT_REPOSITORY_ROOT.encode("utf-8").hex(),
        f"{prefix}package_root_fshex":
            validator.CURRENT_REPOSITORY_ROOT.encode("utf-8").hex(),
        f"{prefix}external_root_count": str(len(external_roots)),
    }
    for index, (
        package_id, canonical_package_id, package_root, channel,
    ) in enumerate(external_roots):
        root_prefix = f"{prefix}external_root.{index}"
        rows[f"{root_prefix}.package_id"] = package_id
        rows[f"{root_prefix}.canonical_package_id"] = canonical_package_id
        rows[f"{root_prefix}.package_root_fshex"] = (
            package_root.encode("utf-8").hex()
        )
        rows[f"{root_prefix}.channel"] = channel
    rows[f"{prefix}identity_path_count"] = str(len(owner_paths))
    for index, path in enumerate(owner_paths):
        rows[f"{prefix}identity_path.{index}"] = path
    rows[f"{prefix}source_closure_path_count"] = str(len(closure_paths))
    for index, path in enumerate(closure_paths):
        rows[f"{prefix}source_closure_path.{index}_fshex"] = (
            path.encode("utf-8").hex()
        )
    rows[f"{prefix}owner_module_path_count"] = str(len(owner_paths))
    for index, path in enumerate(owner_paths):
        rows[f"{prefix}owner_module_path.{index}"] = path
    rows[f"{prefix}import_edge_count"] = "1"
    edge_prefix = f"{prefix}import_edge.0"
    for field in validator.SOURCE_BUNDLE_BINDING_PHYSICAL_EDGE_FIELDS:
        key = f"{edge_prefix}.{field}"
        if field == "target_source_path":
            key = f"{edge_prefix}.target_source_path_fshex"
            rows[key] = edge[field].encode("utf-8").hex()
        else:
            rows[key] = edge[field]
    return rows


def current_runtime_fixture_rows(
    *,
    output_sha256: str,
    source_identity_receipt_cid: str,
    semantic_receipt_cid: str,
    source_to_csg_binding_seal: str,
    world_head_cid: str,
    canonical_output_digest: str,
    compile_receipt_cid: str,
) -> dict[str, str]:
    rows = {
        "system_link_exec_runtime_execute": "1",
        "final_output_sha256": output_sha256,
        "final_source_identity_receipt_cid": source_identity_receipt_cid,
        "final_semantic_receipt_cid": semantic_receipt_cid,
        "final_source_to_csg_binding_seal": source_to_csg_binding_seal,
        "final_world_head_cid": world_head_cid,
        "final_canonical_output_digest": canonical_output_digest,
        "final_compile_receipt_cid": compile_receipt_cid,
        "compiler_csg_lifetime_receipt_ready": "1",
        "compiler_csg_lifetime_outcome": "1",
        "compiler_csg_lifetime_allocated": "1",
        "compiler_csg_lifetime_released": "1",
        "compiler_csg_lifetime_live": "0",
        "compiler_csg_lifetime_allocated_bytes": "64",
        "compiler_csg_lifetime_released_bytes": "64",
        "compiler_csg_lifetime_live_bytes": "0",
        "compiler_csg_lifetime_physical_buffer_count": "1",
        "compiler_csg_lifetime_physical_free_count": "1",
        "compiler_csg_lifetime_storage_released": "1",
        "compiler_csg_lifetime_ledger_storage_released": "1",
        "compiler_csg_lifetime_ledger_storage_released_buffer_count": "1",
        "compiler_csg_lifetime_ledger_storage_released_bytes": "64",
        "owner_table_lifetime_outcome": "1",
        "owner_table_lifetime_allocated": "1",
        "owner_table_lifetime_released": "1",
        "owner_table_lifetime_live": "0",
        "owner_table_lifetime_allocated_bytes": "64",
        "owner_table_lifetime_released_bytes": "64",
        "owner_table_lifetime_live_bytes": "0",
        "owner_table_lifetime_borrow_count": "1",
        "owner_table_lifetime_borrow_return_count": "1",
        "owner_table_lifetime_owner_transfer_count": "0",
        "owner_table_lifetime_physical_buffer_count": "1",
        "owner_table_lifetime_physical_free_count": "1",
        "owner_table_lifetime_storage_released": "1",
        "owner_table_lifetime_ledger_storage_released": "1",
        "owner_table_lifetime_ledger_storage_released_buffer_count": "1",
        "owner_table_lifetime_ledger_storage_released_bytes": "64",
        "system_link_exec_emit": "exe",
        "system_link_exec_runtime_standalone_no_runtime": "0",
        "system_link_exec_runtime_standalone_direct_entry": "0",
        "primary_object_path": "artifacts/backend/current.o",
        "primary_object_asm_path": "-",
        "primary_object_compile_log": "artifacts/backend/current.log",
        "primary_object_cache_status": "disabled",
        "primary_object_cache_path": "-",
        "primary_object_cache_enabled": "0",
        "primary_object_direct": "1",
        "direct_object_bytes": "64",
        "direct_object_symbol_count": "1",
        "direct_object_reloc_count": "0",
        "provider_compiler": validator.BOOTSTRAP_DIRECT_PATH,
        "provider_object_count": "2",
        "provider_object_paths": "provider-a.o,provider-b.o",
        "provider_compile_logs": "provider-a.log,provider-b.log",
        "provider_object_cache_enabled": "0",
        "provider_object_cache_status": "disabled",
        "provider_object_cache_hit_count": "0",
        "provider_object_cache_miss_count": "2",
        "provider_parallel_status": "serial",
        "provider_parallel_job_count": "1",
        "provider_parallel_task_count": "2",
        "provider_parallel_active_workers": "1",
        "provider_parallel_completed_workers": "1",
        "provider_schedule": "serial",
        "provider_requested_job_count": "1",
        "provider_task_count": "2",
        "provider_worker_count": "1",
        "provider_completed_worker_count": "1",
        "provider_deterministic_merge": "index",
        "provider_parallel_merge_order": "index",
        "g_line_full_backend_parallel": "ready",
        "g_line_full_backend_parallel_blocker": "",
        "linkerless_image": "1",
        "system_link": "0",
        "unresolved_symbol_count": "0",
        "first_unresolved_symbol": "",
        "provider_link_mode": "internal",
        "native_link_log": "artifacts/backend/native-link.log",
        "debug_line_map_path": "artifacts/backend/current.map",
        "exec_phase_primary_object_emit_ms": "1",
        "exec_phase_provider_objects_ms": "1",
        "exec_phase_native_link_ms": "1",
        "exec_phase_line_map_ms": "1",
        "rss_execute_begin_bytes": "1",
        "rss_after_provider_bytes": "2",
        "rss_after_primary_bytes": "3",
        "rss_before_native_link_bytes": "4",
        "rss_after_native_link_bytes": "5",
        "rss_after_line_map_bytes": "6",
    }
    for prefix in validator.CURRENT_RUNTIME_INDEX_METRIC_PREFIXES:
        for suffix in validator.CURRENT_RUNTIME_INDEX_METRIC_SUFFIXES:
            value = "0"
            if suffix == "retained_bytes_estimate_scope":
                value = "cheng_str_abi_24_capacity_plus_owned_payload"
            elif suffix in ("sealed", "released"):
                value = "1"
            rows[f"{prefix}_{suffix}"] = value
    rows["exec_pipeline_stage"] = "system_link_exec_runtime_execute"
    rows["defer_receipt_count"] = "2"
    rows["defer_receipt_backend_role"] = "primary"
    rows["defer_receipt.0.function_row"] = "17"
    rows["defer_receipt.0.statement_row"] = "23"
    rows["defer_receipt.0.target"] = validator.TARGET
    rows["defer_receipt.0.action_cid"] = "1" * 64
    rows["defer_receipt.0.fragment_cid"] = "2" * 64
    rows["defer_receipt.1.function_row"] = "29"
    rows["defer_receipt.1.statement_row"] = "31"
    rows["defer_receipt.1.target"] = validator.TARGET
    rows["defer_receipt.1.action_cid"] = "3" * 64
    rows["defer_receipt.1.fragment_cid"] = "4" * 64
    return rows


def rehash_current_receipt_chain(rows: dict[str, str]) -> None:
    rows["source_bundle_entry_identity_seal"] = (
        validator.source_bundle_entry_identity_seal_from_report(rows)
    )
    rows["source_bundle_receipt_seal"] = (
        validator.source_bundle_receipt_seal_from_report(rows)
    )
    rows["source_identity_receipt_cid"] = (
        validator.portable_source_identity_receipt_cid_from_report(rows)
    )
    rows["compile_receipt_source_identity_receipt_cid"] = (
        rows["source_identity_receipt_cid"]
    )
    rows["semantic_receipt_cid"] = (
        validator.compile_semantic_receipt_cid_from_report(rows)
    )
    rows["compile_receipt_semantic_receipt_cid"] = (
        rows["semantic_receipt_cid"]
    )
    rows["compile_receipt_cid"] = validator.compile_receipt_cid_from_report(
        rows
    )
    rows["compiler_output_receipt_cid"] = (
        validator.compiler_output_receipt_cid_from_report(rows)
    )
    rows["source_to_csg_binding_seal"] = (
        validator.source_to_csg_binding_seal_from_report(rows)
    )
    rows["final_source_identity_receipt_cid"] = (
        rows["source_identity_receipt_cid"]
    )
    rows["final_semantic_receipt_cid"] = rows["semantic_receipt_cid"]
    rows["final_source_to_csg_binding_seal"] = (
        rows["source_to_csg_binding_seal"]
    )
    rows["final_compile_receipt_cid"] = rows["compile_receipt_cid"]


def mutate_physical_value(key: str, value: str) -> str:
    if key.endswith("_count") or key.endswith((
        "_len", "_code", "_dot_count", "_hash", "_index",
    )):
        if value == "-1":
            return "0"
        return str(int(value) + 1)
    if key.endswith((".allows_unqualified_call", ".resolved")):
        return "0" if value == "1" else "1"
    if key.endswith("_fshex"):
        return value + "78"
    return value + "x"


def production_reports(candidate: bytes, backend_sha: str) -> tuple[bytes, bytes, bytes]:
    bootstrap = text_report({
        "target": validator.TARGET,
        "system_link_exec_runtime_execute": "1", "system_link_exec": "1",
        "real_backend_codegen": "1", "cold_system_link_exec": "1",
        "backend_driver_candidate": "cold_runtime_provider_system_link",
        "full_backend_codegen": "0",
        "system_link_exec_scope": "cold_runtime_provider_system_link",
        "installed_status_smoke": "1",
        "installed_dry_compile_smoke": "1",
        "source_provenance_report": validator.BOOTSTRAP_COLD_REPORT_PATH,
        "output": validator.BOOTSTRAP_SEED_PATH,
        "output_map": validator.BOOTSTRAP_SEED_MAP_PATH,
    })
    cold = text_report({
        "target": validator.TARGET, "emit": "exe",
        "system_link_exec_runtime_execute": "1", "system_link_exec": "1",
        "real_backend_codegen": "1", "cold_system_link_exec": "1",
        "full_backend_codegen": "0",
        "system_link_exec_scope": "cold_subset_direct_elf",
        "output": validator.BOOTSTRAP_DIRECT_PATH,
    })
    source_bundle_cid = "1" * 64
    canonical_csg_cid = "2" * 64
    source_package_id = validator.CURRENT_SOURCE_PACKAGE_ID
    entry_module_path = ENTRY_MODULE_PATH
    physical_rows = source_bundle_physical_fixture_rows(
        source_package_id,
        entry_module_path,
    )
    import_graph_edges = [{
        "owner_module_path": entry_module_path,
        "target_module_path": "cheng/core/backend/system_link_exec",
        "import_alias": "sexec",
        "qualifier": "sexec",
        "allows_unqualified_call": 0,
        "resolved": 1,
    }]
    source_identity_rows = {
        "source_identity_receipt_source_package_id": source_package_id,
        "source_identity_receipt_entry_module_path": entry_module_path,
        "source_identity_receipt_source_snapshot_count": "2",
        "source_identity_receipt_import_edge_count": "1",
        "source_identity_receipt_unresolved_import_count": "0",
        "source_identity_receipt_source_package_id_cid": validator.semantic_text_cid(
            "cheng.compiler.source_package_id", source_package_id, "package id",
        ),
        "source_identity_receipt_entry_module_path_cid": validator.semantic_text_cid(
            "cheng.compiler.entry_module_path", entry_module_path, "module path",
        ),
        "source_bundle_cid": source_bundle_cid,
        "entry_source_cid": "6" * 64,
        "source_identity_receipt_import_graph_cid":
            validator.source_bundle_binding_import_graph_cid(
                source_package_id, import_graph_edges, 0,
            ),
    }
    source_identity_receipt_cid = (
        validator.portable_source_identity_receipt_cid_from_report(
            source_identity_rows
        )
    )
    source_bundle_receipt_rows = {
        **source_identity_rows,
        **physical_rows,
        "source_identity_receipt_cid": source_identity_receipt_cid,
        "source_bundle_entry_source_index": "0",
    }
    source_bundle_receipt_rows["source_bundle_binding_seal"] = (
        validator.source_bundle_binding_physical_seal_from_report(
            source_bundle_receipt_rows
        )[0]
    )
    source_bundle_receipt_rows["source_bundle_entry_identity_seal"] = (
        validator.source_bundle_entry_identity_seal_from_report(
            source_bundle_receipt_rows
        )
    )
    source_bundle_receipt_rows["source_bundle_receipt_seal"] = (
        validator.source_bundle_receipt_seal_from_report(
            source_bundle_receipt_rows
        )
    )
    semantic_rows = {
        "source_identity_receipt_cid": source_identity_receipt_cid,
        "canonical_compiler_csg_cid": canonical_csg_cid,
        "compile_receipt_target": validator.TARGET,
        "compile_receipt_canonical_output_digest": "9" * 64,
        "compile_receipt_bootstrap_stage": "stage3_local",
        "compile_receipt_runtime_provider_count": "2",
        "compile_receipt_runtime_provider.0": "cheng/core/runtime",
        "compile_receipt_runtime_provider.1": "cheng/std/runtime",
    }
    semantic_receipt_cid = validator.compile_semantic_receipt_cid_from_report(
        semantic_rows
    )
    compile_rows = {
        "compile_receipt_world_head_cid": "8" * 64,
        "compile_receipt_source_identity_receipt_cid": source_identity_receipt_cid,
        "compile_receipt_semantic_receipt_cid": semantic_receipt_cid,
        "compile_receipt_output_digest": sha(candidate),
        "compile_receipt_canonical_output_digest": semantic_rows[
            "compile_receipt_canonical_output_digest"
        ],
        "compile_receipt_target": semantic_rows["compile_receipt_target"],
        "compile_receipt_bootstrap_stage": semantic_rows[
            "compile_receipt_bootstrap_stage"
        ],
        "compile_receipt_runtime_provider_count": semantic_rows[
            "compile_receipt_runtime_provider_count"
        ],
        "compile_receipt_runtime_provider.0": semantic_rows[
            "compile_receipt_runtime_provider.0"
        ],
        "compile_receipt_runtime_provider.1": semantic_rows[
            "compile_receipt_runtime_provider.1"
        ],
    }
    compile_rows["compile_receipt_cid"] = validator.compile_receipt_cid_from_report(compile_rows)
    binding_rows = dict(compile_rows)
    binding_rows["canonical_compiler_csg_cid"] = canonical_csg_cid
    binding_rows["source_identity_receipt_cid"] = source_identity_receipt_cid
    binding_rows["semantic_receipt_cid"] = semantic_receipt_cid
    source_to_csg_binding_seal = validator.source_to_csg_binding_seal_from_report(binding_rows)
    output_receipt_rows = {
        **compile_rows,
        "output_sha256": sha(candidate),
        "backend2_version_manifest_sha256": backend_sha,
    }
    compiler_output_receipt_cid = (
        validator.compiler_output_receipt_cid_from_report(output_receipt_rows)
    )
    source_rows = {
        "system_link_exec": "1", "real_backend_codegen": "1",
        "target": validator.TARGET, "emit": "exe",
        "output": validator.CURRENT_STAGING_PATH, "output_sha256": sha(candidate),
        "backend2_version_manifest_sha256": backend_sha,
        "compiler_output_receipt_cid": compiler_output_receipt_cid,
        "source_bundle_receipt_source_bundle_cid": source_identity_rows["source_bundle_cid"],
        "source_bundle_receipt_seal": source_bundle_receipt_rows["source_bundle_receipt_seal"],
        "source_bundle_entry_identity_seal": source_bundle_receipt_rows["source_bundle_entry_identity_seal"],
        "source_bundle_binding_seal": source_bundle_receipt_rows["source_bundle_binding_seal"],
        "source_bundle_entry_source_index": source_bundle_receipt_rows["source_bundle_entry_source_index"],
        **physical_rows,
        **source_identity_rows,
        "source_identity_receipt_cid": source_identity_receipt_cid,
        "canonical_compiler_csg_cid": canonical_csg_cid,
        "semantic_receipt_cid": semantic_receipt_cid,
        "source_to_csg_binding_seal": source_to_csg_binding_seal,
        **compile_rows,
        "cold_system_link_exec": "0",
        "system_link_exec_scope": "selfhost_direct",
        "full_backend_codegen": "1",
        "pure_provenance_bootstrap_materialize": "pass_b",
        "pure_provenance_gate": "pass_b_self_proof",
    }
    source_rows.update(current_runtime_fixture_rows(
        output_sha256=sha(candidate),
        source_identity_receipt_cid=source_identity_receipt_cid,
        semantic_receipt_cid=semantic_receipt_cid,
        source_to_csg_binding_seal=source_to_csg_binding_seal,
        world_head_cid=compile_rows["compile_receipt_world_head_cid"],
        canonical_output_digest=compile_rows[
            "compile_receipt_canonical_output_digest"
        ],
        compile_receipt_cid=compile_rows["compile_receipt_cid"],
    ))
    return bootstrap, cold, text_report(source_rows)


def report_bytes(candidate: bytes, frozen: dict[str, Any], *,
                 source_override: bytes | None = None) -> tuple[bytes, dict[str, bytes]]:
    backend_sha = next(
        item["sha256"] for item in frozen["toolEntries"]
        if item["path"] == "tools/backend2_version_manifest.rec"
    )
    bootstrap, cold, source = production_reports(candidate, backend_sha)
    payloads = {
        "cc.stdout": b"", "cc.stderr": b"", "bootstrap.stdout": b"bootstrap\n",
        "bootstrap.stderr": b"progress\n", "bootstrap.report": bootstrap,
        "bootstrap.cold.report": cold, "current.stdout": b"current\n",
        "current.stderr": b"progress\n",
        "source.report": source if source_override is None else source_override,
        "candidate.map": b"map\n",
        "status.stdout": b"status\n", "status.stderr": b"",
    }
    lines = [validator.REPORT_MAGIC, f"payload_count={len(validator.REPORT_PAYLOADS)}".encode("ascii")]
    body = bytearray()
    for name in validator.REPORT_PAYLOADS:
        key = name.replace(".", "_").encode("ascii")
        raw = payloads[name]
        lines.append(key + b"_size=" + str(len(raw)).encode("ascii"))
        lines.append(key + b"_sha256=" + sha(raw).encode("ascii"))
        body.extend(raw)
    return b"\n".join(lines) + b"\n\n" + bytes(body), payloads


def manifest_bytes(candidate: bytes, report: bytes) -> bytes:
    values = {
        "schema": "cheng.cid_linux_current_source_candidate_manifest",
        "target": validator.TARGET,
        "machine": "x86_64",
        "candidate_entry_path": ENTRY_PATH,
        "candidate_entry_module_path": ENTRY_MODULE_PATH,
        "candidate_entry_sha256": sha(
            (PROJECT_ROOT / ENTRY_PATH).read_bytes()
        ),
        "toolchain_image_id": "sha256:" + "0" * 64,
        "toolchain_config_digest": "sha256:" + "1" * 64,
        "toolchain_oci_manifest_digest": "sha256:" + "2" * 64,
        "source_tool_manifest_sha256": "3" * 64,
        "source_closure_sha256": "4" * 64, "source_entry_count": "1",
        "tool_closure_sha256": "5" * 64, "tool_entry_count": "2",
        "bootstrap_seed_size": "63", "bootstrap_seed_sha256": "7" * 64,
        "bootstrap_seed_device": "100", "bootstrap_seed_inode": "101",
        "candidate_device": "100", "candidate_inode": "102",
        "current_report_origin": "bootstrap_seed_current_pure_system_link_exec",
        "candidate_size": str(len(candidate)), "candidate_sha256": sha(candidate),
        "report_size": str(len(report)), "report_sha256": sha(report),
        "candidate_execution": "passed", "candidate_elf_magic": "7f454c46",
        "candidate_elf_class": "2", "candidate_elf_data": "1", "candidate_elf_machine": "62",
    }
    return "".join(f"{key}={values[key]}\n" for key in validator.MANIFEST_KEYS).encode("ascii")


def bundle_bytes(manifest: bytes, report: bytes, candidate: bytes) -> bytes:
    return (
        validator.BUNDLE_MAGIC + b"\n"
        + f"manifest_size={len(manifest)}\nmanifest_sha256={sha(manifest)}\n".encode("ascii")
        + f"report_size={len(report)}\nreport_sha256={sha(report)}\n".encode("ascii")
        + f"candidate_size={len(candidate)}\ncandidate_sha256={sha(candidate)}\n\n".encode("ascii")
        + manifest + report + candidate
    )


def verify_cheng_framing_vectors() -> None:
    physical_rows = source_bundle_physical_fixture_rows(
        validator.CURRENT_SOURCE_PACKAGE_ID,
        ENTRY_MODULE_PATH,
    )
    import_graph_cid = validator.source_bundle_binding_import_graph_cid(
        validator.CURRENT_SOURCE_PACKAGE_ID,
        [{
            "owner_module_path": ENTRY_MODULE_PATH,
            "target_module_path": "cheng/core/backend/system_link_exec",
            "import_alias": "sexec",
            "qualifier": "sexec",
            "allows_unqualified_call": 0,
            "resolved": 1,
        }],
        0,
    )
    source_rows = {
        "source_identity_receipt_source_package_id":
            validator.CURRENT_SOURCE_PACKAGE_ID,
        "source_identity_receipt_entry_module_path": ENTRY_MODULE_PATH,
        "source_identity_receipt_source_snapshot_count": "2",
        "source_identity_receipt_import_edge_count": "1",
        "source_identity_receipt_unresolved_import_count": "0",
        "source_identity_receipt_source_package_id_cid": "3" * 64,
        "source_identity_receipt_entry_module_path_cid": "4" * 64,
        "source_bundle_cid": "1" * 64,
        "entry_source_cid": "6" * 64,
        "source_identity_receipt_import_graph_cid": import_graph_cid,
        "source_bundle_entry_source_index": "0",
        **physical_rows,
    }
    assert validator.portable_source_identity_receipt_cid_from_report(source_rows) == (
        "5a14a5be692fffbd06913200376983680f0265e52bdbab6561225a1fc75925b7"
    )
    physical_seal, physical_key_order = (
        validator.source_bundle_binding_physical_seal_from_report(source_rows)
    )
    assert physical_seal == (
        "06eb7128ee565e522aaaf776249cd7201c4dd2b1d07274e459c6810f31a86dcc"
    )
    assert len(physical_key_order) == len(physical_rows)
    compact_source_rows = {
        **source_rows,
        "source_identity_receipt_cid": "5" * 64,
        "source_bundle_binding_seal": physical_seal,
    }
    compact_source_rows["source_bundle_entry_identity_seal"] = (
        validator.source_bundle_entry_identity_seal_from_report(
            compact_source_rows
        )
    )
    assert compact_source_rows["source_bundle_entry_identity_seal"] == (
        "30c81ae241372be32304919e7ca51f218b761eaeea9d33b64d1896e4122fb62c"
    )
    assert validator.source_bundle_receipt_seal_from_report(
        compact_source_rows
    ) == "a3a29c49ddc2c9e134794d38d3ce5366c78f2707ccb474f6fa77d2a75126d079"
    compile_rows = {
        "compile_receipt_world_head_cid": "8" * 64,
        "compile_receipt_source_identity_receipt_cid": "3" * 64,
        "compile_receipt_semantic_receipt_cid": "4" * 64,
        "compile_receipt_output_digest": "5" * 64,
        "compile_receipt_canonical_output_digest": "6" * 64,
        "compile_receipt_target": validator.TARGET,
        "compile_receipt_bootstrap_stage": "stage3_local",
        "compile_receipt_runtime_provider_count": "2",
        "compile_receipt_runtime_provider.0": "cheng/core/runtime",
        "compile_receipt_runtime_provider.1": "cheng/std/runtime",
    }
    assert validator.compile_receipt_cid_from_report(compile_rows) == (
        "45786b607a4fcba061fc7efb1d066fffd5552e1ad77d4fc99a4ca4843d81a05a"
    )
    output_rows = {
        **compile_rows,
        "compile_receipt_cid": validator.compile_receipt_cid_from_report(
            compile_rows
        ),
        "output_sha256": "5" * 64,
        "backend2_version_manifest_sha256": "7" * 64,
    }
    assert validator.compiler_output_receipt_cid_from_report(output_rows) == (
        "917f1e49bd69bf62d92e686cd5230a222b6973e3334d097566b906f15ef02dfb"
    )
    semantic_rows = {
        "source_identity_receipt_cid": "3" * 64,
        "canonical_compiler_csg_cid": "2" * 64,
        "compile_receipt_canonical_output_digest": "9" * 64,
        "compile_receipt_target": validator.TARGET,
        "compile_receipt_bootstrap_stage": "stage3_local",
        "compile_receipt_runtime_provider_count": "2",
        "compile_receipt_runtime_provider.0": "cheng/core/runtime",
        "compile_receipt_runtime_provider.1": "cheng/std/runtime",
    }
    assert validator.compile_semantic_receipt_cid_from_report(semantic_rows) == (
        "263127018f969f61aab7e115b850c59462f6c4c88f3eaea438fe2360ed99e699"
    )
    assert validator.ordered_provider_set_cid(
        ["cheng/core/runtime", "cheng/std/runtime"]
    ) == "523e49ad6ceb62e27274d28702a0c4671b35a5ddea3fcbe405b9a8a615d12b24"
    assert validator.source_to_csg_binding_seal_from_report({
        "source_identity_receipt_cid": "3" * 64,
        "canonical_compiler_csg_cid": "2" * 64,
        "semantic_receipt_cid": "4" * 64,
    }) == "3c46558a7c7cde575c5de997513d06a5ae4e97d259b6b34e08ad58130b04e56d"


def verify_dry_compile_report_exact_key_authority() -> None:
    keys, count, digest = validator.dry_compile_report_exact_key_order(2, 1)
    assert isinstance(keys, tuple)
    assert count == len(keys) == 386
    assert digest == (
        "e71cf87ebc277829da0de031980b357a3731ae4d145e5899d0e7cdab96923086"
    )
    assert digest == validator.framed_sha256(keys)
    dynamic_start = len(validator.DRY_COMPILE_REPORT_HEAD_KEYS)
    assert keys[dynamic_start:dynamic_start + 16] == tuple(
        f"dry_compile_source_manifest.{index}.{field}"
        for index in range(2)
        for field in validator.DRY_COMPILE_REPORT_SOURCE_FIELDS
    )
    edge_start = dynamic_start + 16
    assert keys[edge_start:edge_start + 13] == tuple(
        f"dry_compile_import_edge.0.{field}"
        for field in validator.DRY_COMPILE_REPORT_EDGE_FIELDS
    )
    for required in (
        "dry_compile_source_manifest.0.path_fshex",
        "dry_compile_source_manifest.0.discovery_kind",
        "dry_compile_source_manifest.1.discoverer_source_index",
        "dry_compile_source_manifest.1.discoverer_edge_index",
        "dry_compile_import_edge.0.owner_module_path_fshex",
        "dry_compile_import_edge.0.target_source_path_fshex",
        "dry_compile_import_edge.0.import_alias_fshex",
        "dry_compile_import_edge.0.qualifier_fshex",
    ):
        assert required in keys

    def admitted(observed: list[str]) -> bool:
        return (
            tuple(observed) == keys
            and len(observed) == count
            and validator.framed_sha256(observed) == digest
        )

    assert admitted(list(keys))
    missing = list(keys)
    del missing[dynamic_start]
    extra = list(keys)
    extra.insert(
        edge_start,
        "dry_compile_import_edge.1.owner_module_path_fshex",
    )
    swapped = list(keys)
    swapped[dynamic_start], swapped[dynamic_start + 1] = (
        swapped[dynamic_start + 1],
        swapped[dynamic_start],
    )
    duplicate = list(keys)
    duplicate.insert(dynamic_start, duplicate[dynamic_start])
    for mutation in (missing, extra, swapped, duplicate):
        assert not admitted(mutation)
    for source_count, edge_count in (
        (0, 0), (-1, 0), (True, 0), (1, -1), (1, True),
        (1_000_000, 1),
    ):
        expect_failure(
            lambda n=source_count, e=edge_count:
                validator.dry_compile_report_exact_key_order(n, e),
            "dry compile exact key authority invalid count",
        )


def main() -> int:
    case_image.self_test()
    build_receipt = builder.hashed_receipt((
        "schema=" + validator.BUILD_RECEIPT_SCHEMA,
        "status=BUILT",
    ))
    parsed_build_receipt = validator.parse_receipt(
        build_receipt, "receipt_payload_sha256",
    )
    assert parsed_build_receipt["schema"] == validator.BUILD_RECEIPT_SCHEMA
    expect_failure(
        lambda: validator.parse_receipt(
            build_receipt.replace(b"status=BUILT", b"status=FORGED"),
            "receipt_payload_sha256",
        ),
        "candidate build receipt payload mutation",
    )
    worker_argv = validator.current_worker_argv(
        "x86_64-unknown-linux-gnu",
        ENTRY_PATH,
    )
    assert worker_argv[0] == validator.CURRENT_WORKER_ARGV0
    assert worker_argv[1] == "system-link-exec"
    assert "--target:x86_64-unknown-linux-gnu" in worker_argv
    assert worker_argv.count("--backend:primary") == 1
    assert validator.compiler_backend_role_from_argv(worker_argv) == "primary"
    explicit_backend2_argv = tuple(
        "--backend:backend2" if value == "--backend:primary" else value
        for value in worker_argv
    )
    assert validator.compiler_backend_role_from_argv(
        explicit_backend2_argv
    ) == "backend2"
    for backend_argv, label in (
        (
            tuple(
                value for value in worker_argv
                if not value.startswith("--backend:")
            ),
            "missing current backend",
        ),
        (
            tuple(
                "--backend:" if value == "--backend:primary" else value
                for value in worker_argv
            ),
            "empty current backend",
        ),
        (
            tuple(
                "--backend:legacy"
                if value == "--backend:primary" else value
                for value in worker_argv
            ),
            "invalid current backend",
        ),
        (
            worker_argv + ("--backend:backend2",),
            "duplicate current backend",
        ),
    ):
        expect_failure(
            lambda backend_argv=backend_argv:
                validator.compiler_backend_role_from_argv(backend_argv),
            label,
        )
    main_entry_path = "src/core/tooling/backend_driver_main.cheng"
    main_worker_argv = validator.current_worker_argv(
        "x86_64-unknown-linux-gnu",
        main_entry_path,
    )
    assert f"--in:{main_entry_path}" in main_worker_argv
    expect_failure(
        lambda: validator.current_worker_argv(
            "x86_64-unknown-linux-gnu",
            "src/core/tooling/backend_driver_other.cheng",
        ),
        "third candidate entry",
    )
    digest_rows = [
        "sha256:" + digit * 64
        for digit in ("1", "2", "3")
    ]
    for argv, expected_rc in (
        ([str(ROOT / "cid_linux_current_source_candidate_workload.sh")], 2),
        (
            [
                str(ROOT / "cid_linux_current_source_candidate_workload.sh"),
                "linux",
                *digest_rows,
            ],
            2,
        ),
        (
            [
                str(ROOT / "cid_linux_current_source_candidate_workload.sh"),
                "x86_64-unknown-linux-gnu",
                "src/core/tooling/backend_driver_other.cheng",
                *digest_rows,
            ],
            2,
        ),
        ([str(ROOT / "cid_linux_current_source_candidate_gate.sh")], 64),
        (
            [
                str(ROOT / "cid_linux_current_source_candidate_gate.sh"),
                "--target",
                "x86_64-unknown-linux-gnu",
                "--entry",
                "src/core/tooling/backend_driver_other.cheng",
                "current-pair",
            ],
            64,
        ),
    ):
        completed = subprocess.run(
            argv,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        assert completed.returncode == expected_rc
    validate_cheng_current_receipt_wiring()
    verify_cheng_framing_vectors()
    verify_dry_compile_report_exact_key_authority()
    assert "src/cheng_execution_stage_receipt_validator.ts" in (
        builder.FUSION_TOOL_RELATIVE_FILES
    )
    assert "src/cheng_execution_stage_receipt_v2_validator.ts" not in (
        builder.FUSION_TOOL_RELATIVE_FILES
    )
    fusion_root = Path("/Users/lbcheng/cheng-fusion")
    fusion_paths = dict(builder.FUSION_TOOL_FILES)
    pinned_entries = [
        {
            "path": path,
            "sha256": sha((fusion_root / fusion_paths[path]).read_bytes()),
        }
        for path in builder.FUSION_IDENTITY_PINS
    ]
    builder.validate_fusion_identity_pins(pinned_entries)
    pin_mutant = [dict(entry) for entry in pinned_entries]
    evidence_path = "cheng-fusion/src/cheng_cid_identity_chain_evidence.ts"
    evidence_entry = next(
        entry for entry in pin_mutant if entry["path"] == evidence_path
    )
    evidence_entry["sha256"] = (
        "5271b9fb79b1080dd07a0a84a65715854cf8385f671d822f6b6570cd7df244cb"
    )
    assert evidence_entry["sha256"] != builder.FUSION_IDENTITY_PINS[evidence_path]
    expect_failure(
        lambda: builder.validate_fusion_identity_pins(pin_mutant),
        "stale frozen Fusion identity pin",
    )
    expect_failure(
        lambda: builder.build(SimpleNamespace(
            base_input_image_id="mutable-tag",
        )),
        "builder mutable base identity",
    )
    frozen, frozen_raw, files = frozen_manifest()
    validate_builder_canonical_context_archive(frozen, frozen_raw, files)
    validate_builder_frozen_snapshot(frozen, frozen_raw, files)
    candidate = candidate_bytes()
    aarch64_candidate = bytearray(candidate)
    aarch64_candidate[18:20] = (183).to_bytes(2, "little")
    validator.validate_candidate(candidate, 62)
    validator.validate_candidate(bytes(aarch64_candidate), 183)
    expect_failure(
        lambda: validator.validate_candidate(candidate, 183),
        "x86 candidate admitted as aarch64",
    )
    expect_failure(
        lambda: validator.validate_candidate(bytes(aarch64_candidate), 62),
        "aarch64 candidate admitted as x86_64",
    )
    expect_failure(
        lambda: validator.validate_candidate(
            b"\xcf\xfa\xed\xfe" + b"\0" * 60, 183,
        ),
        "Mach-O candidate admitted as Linux worker",
    )
    expect_failure(
        lambda: validator.validate_candidate(b"arbitrary-worker", 62),
        "arbitrary bytes admitted as Linux worker",
    )
    assert validator.target_spec(
        "aarch64-unknown-linux-gnu"
    )["elf_machine"] == 183
    assert validator.target_spec(
        "x86_64-unknown-linux-gnu"
    )["elf_machine"] == 62
    expect_failure(
        lambda: validator.target_spec("linux"),
        "noncanonical Linux target",
    )
    report, payloads = report_bytes(candidate, frozen)
    manifest = manifest_bytes(candidate, report)
    bundle = bundle_bytes(manifest, report, candidate)
    rows, parsed_manifest, parsed_report, parsed_candidate = validator.split_binary_bundle(bundle)
    assert rows["candidate_sha256"] == sha(candidate)
    assert (parsed_manifest, parsed_report, parsed_candidate) == (manifest, report, candidate)
    parsed_payloads = validator.parse_report(report)
    validator.validate_candidate(candidate)
    validate_bound_reports(parsed_payloads, candidate, frozen)
    validator.validate_two_stage_manifest(
        validator.parse_kv(manifest, validator.MANIFEST_KEYS, "manifest")
    )
    equal_bytes_manifest = validator.parse_kv(
        manifest, validator.MANIFEST_KEYS, "manifest",
    )
    equal_bytes_manifest["bootstrap_seed_sha256"] = sha(candidate)
    validator.validate_two_stage_manifest(equal_bytes_manifest)

    output_line = (
        b"output=" + validator.CURRENT_STAGING_PATH.encode("ascii") + b"\n"
    )
    output_sha_line = b"output_sha256=" + sha(candidate).encode("ascii") + b"\n"
    reordered_source = payloads["source.report"].replace(
        output_line + output_sha_line,
        output_sha_line + output_line,
        1,
    )
    expect_failure(
        lambda: validate_bound_reports(
            report_bytes(
                candidate, frozen, source_override=reordered_source,
            )[1],
            candidate,
            frozen,
        ),
        "current receipt field order mutation",
    )

    mutated = bytearray(bundle)
    mutated[-1] ^= 1
    expect_failure(lambda: validator.split_binary_bundle(bytes(mutated)), "bundle candidate byte")
    expect_failure(
        lambda: validator.split_binary_bundle(bundle.replace(b"candidate_size=64\n", b"candidate_size=064\n", 1)),
        "bundle noncanonical size",
    )
    expect_failure(
        lambda: validate_bound_reports(
            report_bytes(
                candidate,
                frozen,
                source_override=payloads["bootstrap.cold.report"],
            )[1],
            candidate,
            frozen,
        ),
        "cold-only report substituted for current source receipt",
    )
    bad_source = payloads["source.report"] + b"compile_receipt_version=3\n"
    expect_failure(
        lambda: validate_bound_reports(
            report_bytes(candidate, frozen, source_override=bad_source)[1], candidate, frozen
        ),
        "legacy compile receipt version",
    )
    missing_world_head = payloads["source.report"].replace(
        b"compile_receipt_world_head_cid=" + b"8" * 64 + b"\n",
        b"",
    )
    expect_failure(
        lambda: validate_bound_reports(
            report_bytes(candidate, frozen, source_override=missing_world_head)[1],
            candidate,
            frozen,
        ),
        "missing current compile receipt field",
    )
    source_rows = validator.parse_unique_text_report(
        payloads["source.report"], "source",
    )
    current_key_order = validator.current_report_exact_key_order(source_rows)
    assert tuple(source_rows) == current_key_order
    assert len(current_key_order) == 264
    assert validator.current_report_exact_key_order_sha256(
        current_key_order
    ) == "88cd3cae53bb68a812d402e3b0ca683353429ed0856922b32bf7dfdb278e0460"
    defer_keys = [
        key for key in current_key_order
        if key == "defer_receipt_count"
        or key == "defer_receipt_backend_role"
        or key.startswith("defer_receipt.")
    ]
    assert len(defer_keys) == 12
    for label, mutate in (
        (
            "current defer missing field",
            lambda rows: rows.pop("defer_receipt.1.fragment_cid"),
        ),
        (
            "current defer extra field",
            lambda rows: rows.__setitem__(
                "defer_receipt.2.function_row", "37",
            ),
        ),
        (
            "current defer count too small",
            lambda rows: rows.__setitem__("defer_receipt_count", "1"),
        ),
        (
            "current defer count too large",
            lambda rows: rows.__setitem__("defer_receipt_count", "3"),
        ),
        (
            "current defer invalid backend role",
            lambda rows: rows.__setitem__(
                "defer_receipt_backend_role", "legacy",
            ),
        ),
        (
            "current defer valid backend role swap",
            lambda rows: rows.__setitem__(
                "defer_receipt_backend_role", "backend2",
            ),
        ),
        (
            "current defer negative function row",
            lambda rows: rows.__setitem__(
                "defer_receipt.0.function_row", "-1",
            ),
        ),
        (
            "current defer oversized statement row",
            lambda rows: rows.__setitem__(
                "defer_receipt.0.statement_row", "2147483648",
            ),
        ),
        (
            "current defer target mismatch",
            lambda rows: rows.__setitem__(
                "defer_receipt.0.target",
                "aarch64-unknown-linux-gnu",
            ),
        ),
        (
            "current defer zero action CID",
            lambda rows: rows.__setitem__(
                "defer_receipt.0.action_cid", "0" * 64,
            ),
        ),
        (
            "current defer malformed fragment CID",
            lambda rows: rows.__setitem__(
                "defer_receipt.0.fragment_cid", "A" * 64,
            ),
        ),
        (
            "current defer duplicate action CID",
            lambda rows: rows.__setitem__(
                "defer_receipt.1.action_cid",
                rows["defer_receipt.0.action_cid"],
            ),
        ),
        (
            "current defer duplicate fragment CID",
            lambda rows: rows.__setitem__(
                "defer_receipt.1.fragment_cid",
                rows["defer_receipt.0.fragment_cid"],
            ),
        ),
    ):
        mutated_rows = dict(source_rows)
        mutate(mutated_rows)
        expect_failure(
            lambda rows=mutated_rows: validate_bound_reports(
                report_bytes(
                    candidate,
                    frozen,
                    source_override=text_report(rows),
                )[1],
                candidate,
                frozen,
            ),
            label,
        )
    first_defer_line = (
        "defer_receipt.0.function_row="
        + source_rows["defer_receipt.0.function_row"]
        + "\n"
    ).encode("ascii")
    second_defer_line = (
        "defer_receipt.0.statement_row="
        + source_rows["defer_receipt.0.statement_row"]
        + "\n"
    ).encode("ascii")
    swapped_defer_order = payloads["source.report"].replace(
        first_defer_line + second_defer_line,
        second_defer_line + first_defer_line,
        1,
    )
    expect_failure(
        lambda: validate_bound_reports(
            report_bytes(
                candidate,
                frozen,
                source_override=swapped_defer_order,
            )[1],
            candidate,
            frozen,
        ),
        "current defer field order mutation",
    )
    duplicate_defer_key = (
        payloads["source.report"]
        + (
            "defer_receipt.0.function_row="
            + source_rows["defer_receipt.0.function_row"]
            + "\n"
        ).encode("ascii")
    )
    expect_failure(
        lambda: validate_bound_reports(
            report_bytes(
                candidate,
                frozen,
                source_override=duplicate_defer_key,
            )[1],
            candidate,
            frozen,
        ),
        "current defer duplicate key",
    )
    physical_keys = [
        key for key in current_key_order
        if key.startswith(
            validator.SOURCE_BUNDLE_BINDING_PHYSICAL_PREFIX
        )
    ]
    assert len(physical_keys) == 43
    for key in physical_keys:
        mutated_rows = dict(source_rows)
        mutated_rows[key] = mutate_physical_value(
            key, mutated_rows[key],
        )
        expect_failure(
            lambda rows=mutated_rows: validate_bound_reports(
                report_bytes(
                    candidate,
                    frozen,
                    source_override=text_report(rows),
                )[1],
                candidate,
                frozen,
            ),
            f"source bundle physical value mutation: {key}",
        )
        missing_rows = dict(source_rows)
        del missing_rows[key]
        expect_failure(
            lambda rows=missing_rows: validate_bound_reports(
                report_bytes(
                    candidate,
                    frozen,
                    source_override=text_report(rows),
                )[1],
                candidate,
                frozen,
            ),
            f"source bundle physical missing column: {key}",
        )

    forged_binding_rows = dict(source_rows)
    forged_binding_rows["source_bundle_binding_seal"] = "b" * 64
    rehash_current_receipt_chain(forged_binding_rows)
    expect_failure(
        lambda: validate_bound_reports(
            report_bytes(
                candidate,
                frozen,
                source_override=text_report(forged_binding_rows),
            )[1],
            candidate,
            frozen,
        ),
        "coordinated self-reported physical seal and downstream rehash",
    )

    physical_domain_line = (
        b"source_bundle_binding_physical_domain="
        + validator.SOURCE_BUNDLE_BINDING_PHYSICAL_DOMAIN.encode("ascii")
        + b"\n"
    )
    entry_index_line = b"source_bundle_entry_source_index=0\n"
    physical_tail_line = (
        b"source_bundle_binding_physical_import_edge.0.resolved=1\n"
    )
    identity_package_line = (
        b"source_identity_receipt_source_package_id=cheng\n"
    )
    physical_boundary_mutations = {
        "physical head glued to prior receipt": payloads[
            "source.report"
        ].replace(
            entry_index_line + physical_domain_line,
            entry_index_line[:-1] + physical_domain_line,
            1,
        ),
        "physical tail glued to next receipt": payloads[
            "source.report"
        ].replace(
            physical_tail_line + identity_package_line,
            physical_tail_line[:-1] + identity_package_line,
            1,
        ),
        "physical head blank line": payloads["source.report"].replace(
            entry_index_line + physical_domain_line,
            entry_index_line + b"\n" + physical_domain_line,
            1,
        ),
        "physical boundary duplicate": payloads["source.report"].replace(
            physical_domain_line,
            physical_domain_line + physical_domain_line,
            1,
        ),
        "current report extra terminal LF":
            payloads["source.report"] + b"\n",
    }
    for label, mutated_report in physical_boundary_mutations.items():
        expect_failure(
            lambda raw=mutated_report: validate_bound_reports(
                report_bytes(
                    candidate,
                    frozen,
                    source_override=raw,
                )[1],
                candidate,
                frozen,
            ),
            label,
        )

    first_physical_line = (
        physical_keys[0]
        + "="
        + source_rows[physical_keys[0]]
        + "\n"
    ).encode("utf-8")
    second_physical_line = (
        physical_keys[1]
        + "="
        + source_rows[physical_keys[1]]
        + "\n"
    ).encode("utf-8")
    swapped_physical_order = payloads["source.report"].replace(
        first_physical_line + second_physical_line,
        second_physical_line + first_physical_line,
        1,
    )
    expect_failure(
        lambda: validate_bound_reports(
            report_bytes(
                candidate,
                frozen,
                source_override=swapped_physical_order,
            )[1],
            candidate,
            frozen,
        ),
        "source bundle physical row order mutation",
    )

    workspace_fshex_key = (
        "source_bundle_binding_physical_workspace_root_fshex"
    )
    for label, value in (
        ("uppercase physical fshex", source_rows[workspace_fshex_key].upper()),
        ("odd physical fshex", source_rows[workspace_fshex_key][:-1]),
        ("nonhex physical fshex", source_rows[workspace_fshex_key][:-1] + "g"),
    ):
        mutated_rows = dict(source_rows)
        mutated_rows[workspace_fshex_key] = value
        expect_failure(
            lambda rows=mutated_rows: validate_bound_reports(
                report_bytes(
                    candidate,
                    frozen,
                    source_override=text_report(rows),
                )[1],
                candidate,
                frozen,
            ),
            label,
        )

    extra_physical_rows = dict(source_rows)
    extra_physical_rows[
        "source_bundle_binding_physical_import_edge.1.owner_module_path"
    ] = ENTRY_MODULE_PATH
    expect_failure(
        lambda: validate_bound_reports(
            report_bytes(
                candidate,
                frozen,
                source_override=text_report(extra_physical_rows),
            )[1],
            candidate,
            frozen,
        ),
        "source bundle physical undeclared index",
    )

    reordered_external_rows = dict(source_rows)
    external_fields = (
        "package_id", "canonical_package_id", "package_root_fshex",
        "channel",
    )
    for field in external_fields:
        left = (
            f"source_bundle_binding_physical_external_root.0.{field}"
        )
        right = (
            f"source_bundle_binding_physical_external_root.1.{field}"
        )
        reordered_external_rows[left], reordered_external_rows[right] = (
            reordered_external_rows[right],
            reordered_external_rows[left],
        )
    expect_failure(
        lambda: validate_bound_reports(
            report_bytes(
                candidate,
                frozen,
                source_override=text_report(reordered_external_rows),
            )[1],
            candidate,
            frozen,
        ),
        "source bundle physical external root order mutation",
    )

    missing_semantic_source = payloads["source.report"].replace(
        b"source_identity_receipt_cid="
        + source_rows["source_identity_receipt_cid"].encode("ascii")
        + b"\n",
        b"",
    )
    expect_failure(
        lambda: validate_bound_reports(
            report_bytes(
                candidate,
                frozen,
                source_override=missing_semantic_source,
            )[1],
            candidate,
            frozen,
        ),
        "missing semantic source identity field",
    )
    wrong_source_predecessor = payloads["source.report"].replace(
        b"source_identity_receipt_import_graph_cid="
        + source_rows["source_identity_receipt_import_graph_cid"].encode(
            "ascii"
        )
        + b"\n",
        b"source_identity_receipt_import_graph_cid=" + b"a" * 64 + b"\n",
    )
    expect_failure(
        lambda: validate_bound_reports(
            report_bytes(
                candidate,
                frozen,
                source_override=wrong_source_predecessor,
            )[1],
            candidate,
            frozen,
        ),
        "source identity import graph substitution",
    )
    wrong_compact_source_receipt = payloads["source.report"].replace(
        b"source_bundle_receipt_seal="
        + source_rows["source_bundle_receipt_seal"].encode("ascii")
        + b"\n",
        b"source_bundle_receipt_seal=" + b"b" * 64 + b"\n",
    )
    expect_failure(
        lambda: validate_bound_reports(
            report_bytes(
                candidate,
                frozen,
                source_override=wrong_compact_source_receipt,
            )[1],
            candidate,
            frozen,
        ),
        "compact source bundle receipt substitution",
    )
    wrong_entry_module = payloads["source.report"].replace(
        b"source_identity_receipt_entry_module_path="
        + ENTRY_MODULE_PATH.encode("ascii")
        + b"\n",
        b"source_identity_receipt_entry_module_path=cheng/core/tooling/compiler_main\n",
    )
    expect_failure(
        lambda: validate_bound_reports(
            report_bytes(
                candidate, frozen, source_override=wrong_entry_module,
            )[1],
            candidate,
            frozen,
        ),
        "current source entry module substitution",
    )
    undeclared_providers = payloads["source.report"].replace(
        b"compile_receipt_runtime_provider_count=2\n",
        b"compile_receipt_runtime_provider_count=0\n",
    )
    expect_failure(
        lambda: validate_bound_reports(
            report_bytes(
                candidate,
                frozen,
                source_override=undeclared_providers,
            )[1],
            candidate,
            frozen,
        ),
        "provider rows outside declared current receipt set",
    )
    wrong_receipt_field = payloads["source.report"].replace(
        b"compile_receipt_semantic_receipt_cid=" + validator.compile_semantic_receipt_cid_from_report(
            validator.parse_unique_text_report(payloads["source.report"], "source")
        ).encode("ascii") + b"\n",
        b"compile_receipt_semantic_receipt_cid=" + b"a" * 64 + b"\n",
    )
    expect_failure(
        lambda: validate_bound_reports(
            report_bytes(candidate, frozen, source_override=wrong_receipt_field)[1], candidate, frozen
        ),
        "compile receipt semantic substitution",
    )
    coordinated_rows = validator.parse_unique_text_report(
        payloads["source.report"], "source"
    )
    coordinated_rows["compile_receipt_semantic_receipt_cid"] = "a" * 64
    coordinated_rows["compile_receipt_cid"] = validator.compile_receipt_cid_from_report(
        coordinated_rows
    )
    expect_failure(
        lambda: validate_bound_reports(
            report_bytes(
                candidate,
                frozen,
                source_override=text_report(coordinated_rows),
            )[1],
            candidate,
            frozen,
        ),
        "coordinated compile receipt rehash detached from semantic receipt",
    )
    for label, key, value in (
        ("canonical output", "compile_receipt_canonical_output_digest", "a" * 64),
        ("target", "compile_receipt_target", "x86_64-semantic-mutation-linux-gnu"),
        ("stage", "compile_receipt_bootstrap_stage", "stage4_local"),
        ("provider", "compile_receipt_runtime_provider.0", "cheng/core/runtime2"),
    ):
        semantic_detached_rows = validator.parse_unique_text_report(
            payloads["source.report"], "source"
        )
        semantic_detached_rows[key] = value
        if validator.compile_semantic_receipt_cid_from_report(
            semantic_detached_rows
        ) == semantic_detached_rows["semantic_receipt_cid"]:
            raise AssertionError(f"semantic mutation did not change oracle CID: {label}")
        semantic_detached_rows["compile_receipt_cid"] = (
            validator.compile_receipt_cid_from_report(semantic_detached_rows)
        )
        semantic_detached_rows["source_to_csg_binding_seal"] = (
            validator.source_to_csg_binding_seal_from_report(semantic_detached_rows)
        )
        expect_failure(
            lambda rows=semantic_detached_rows: validate_bound_reports(
                report_bytes(
                    candidate,
                    frozen,
                    source_override=text_report(rows),
                )[1],
                candidate,
                frozen,
            ),
            f"coordinated {label} rehash detached from semantic receipt",
        )
    wrong_binding = payloads["source.report"].replace(
        b"source_to_csg_binding_seal=" + validator.source_to_csg_binding_seal_from_report(
            validator.parse_unique_text_report(payloads["source.report"], "source")
        ).encode("ascii") + b"\n",
        b"source_to_csg_binding_seal=" + b"b" * 64 + b"\n",
    )
    expect_failure(
        lambda: validate_bound_reports(
            report_bytes(candidate, frozen, source_override=wrong_binding)[1], candidate, frozen
        ),
        "source-to-CSG binding substitution",
    )
    same_inode_manifest = validator.parse_kv(
        manifest, validator.MANIFEST_KEYS, "manifest",
    )
    same_inode_manifest["candidate_inode"] = same_inode_manifest["bootstrap_seed_inode"]
    expect_failure(
        lambda: validator.validate_two_stage_manifest(same_inode_manifest),
        "bootstrap seed/current candidate inode alias",
    )
    expect_failure(
        lambda: validator.split_binary_bundle(
            bundle.replace(validator.BUNDLE_MAGIC, validator.BUNDLE_MAGIC + b"_V2", 1)
        ),
        "legacy bundle magic",
    )
    bad_backend_rows = validator.parse_unique_text_report(
        payloads["source.report"], "source",
    )
    bad_backend_rows["backend2_version_manifest_sha256"] = "8" * 64
    bad_backend_rows["compiler_output_receipt_cid"] = (
        validator.compiler_output_receipt_cid_from_report(bad_backend_rows)
    )
    expect_failure(
        lambda: validate_bound_reports(
            report_bytes(
                candidate,
                frozen,
                source_override=text_report(bad_backend_rows),
            )[1],
            candidate,
            frozen,
        ),
        "backend manifest coordinated rehash",
    )
    duplicate_source = payloads["source.report"] + b"full_backend_codegen=1\n"
    expect_failure(lambda: validator.parse_unique_text_report(duplicate_source, "source"), "report duplicate key")
    detached_source_bundle_rows = validator.parse_unique_text_report(
        payloads["source.report"], "source",
    )
    detached_source_bundle_rows["source_bundle_receipt_source_bundle_cid"] = "9" * 64
    expect_failure(
        lambda: validate_bound_reports(
            report_bytes(
                candidate,
                frozen,
                source_override=text_report(detached_source_bundle_rows),
            )[1],
            candidate,
            frozen,
        ),
        "source bundle compact receipt detached from canonical source bundle CID",
    )

    with tempfile.TemporaryDirectory(prefix="cid-linux-current-source-test-") as raw_dir:
        root = Path(raw_dir)
        base_layer_raws = [
            opaque_layer("base/one", b"base-one\n"),
            opaque_layer("base/two", b"base-two\n"),
        ]
        base_archive = root / "base.tar"
        base_image_id, base_config_digest, base_oci_digest = synthetic_base_archive(
            base_archive, base_layer_raws,
        )
        base_info = validator.validate_base_image_archive(
            base_archive,
            expected_image_id=base_image_id,
        )
        assert base_info["imageId"] == base_image_id
        assert base_info["configDigest"] == base_config_digest
        assert base_info["ociManifestDigest"] == base_oci_digest
        assert base_info["layerCount"] == 2
        archive = root / "valid.tar"
        image_id, config_digest, oci_digest = synthetic_image_archive(
            archive,
            frozen,
            frozen_raw,
            files,
            base_layer_raws=base_layer_raws,
        )
        info = validator.validate_image_archive(
            archive,
            frozen,
            frozen_raw,
            base_image_info=base_info,
            expected_image_id=image_id,
        )
        assert info["imageId"] == image_id
        assert info["configDigest"] == config_digest
        assert info["ociManifestDigest"] == oci_digest
        assert config_digest != image_id
        assert info["layerCount"] == base_info["layerCount"] + 1
        assert info["layerDigests"][:-1] == base_info["layerDigests"]
        assert info["rootfsDiffIds"][:-1] == base_info["rootfsDiffIds"]

        inherited_archive = root / "inherited-env.tar"
        inherited_image_id, _inherited_config, _inherited_oci = (
            synthetic_image_archive(
                inherited_archive,
                frozen,
                frozen_raw,
                files,
                base_layer_raws=base_layer_raws,
                inherited_env=["PATH=/usr/bin:/bin", "UNSAFE=value"],
            )
        )
        expect_failure(
            lambda: validator.validate_image_archive(
                inherited_archive,
                frozen,
                frozen_raw,
                base_image_info=base_info,
                expected_image_id=inherited_image_id,
            ),
            "inherited image environment",
        )
        canonical_archive = root / "canonical-env.tar"
        canonical_identity = builder.canonicalize_saved_image_runtime(
            inherited_archive, canonical_archive,
        )
        canonical_info = validator.validate_image_archive(
            canonical_archive,
            frozen,
            frozen_raw,
            base_image_info=base_info,
            expected_image_id=canonical_identity["imageId"],
        )
        assert canonical_info["configDigest"] == canonical_identity["configDigest"]
        assert canonical_info["ociManifestDigest"] == canonical_identity["ociManifestDigest"]
        assert canonical_identity["imageId"] != inherited_image_id
        frozen_tools = {entry["path"]: entry for entry in frozen["toolEntries"]}
        builder_report_value = {
            "schema": validator.BUILDER_SCHEMA,
            "status": "built",
            "target": "x86_64-unknown-linux-gnu",
            "architecture": "amd64",
            "os": "linux",
            "candidateEntryPath": ENTRY_PATH,
            "candidateEntryModulePath": ENTRY_MODULE_PATH,
            "candidateEntrySha256": sha(
                (PROJECT_ROOT / ENTRY_PATH).read_bytes()
            ),
            "baseInputImageId": base_info["imageId"],
            "baseConfigDigest": base_info["configDigest"],
            "baseOciManifestDigest": base_info["ociManifestDigest"],
            "baseLayerCount": base_info["layerCount"],
            "baseLayerDigests": base_info["layerDigests"],
            "baseLayerSizes": base_info["layerSizes"],
            "baseRootfsDiffIds": base_info["rootfsDiffIds"],
            "baseImageArchiveSize": base_info["archiveSize"],
            "baseImageArchiveSha256": base_info["archiveSha256"],
            "imageId": info["imageId"],
            "imageConfigDigest": info["configDigest"],
            "ociManifestDigest": info["ociManifestDigest"],
            "imageLayerCount": info["layerCount"],
            "imageLayerDigests": info["layerDigests"],
            "imageLayerSizes": info["layerSizes"],
            "imageRootfsDiffIds": info["rootfsDiffIds"],
            "closureLayerDigest": info["closureLayerDigest"],
            "closureRootfsDiffId": info["closureRootfsDiffId"],
            "imageArchiveSize": info["archiveSize"],
            "imageArchiveSha256": info["archiveSha256"],
            "sourceToolManifestSha256": sha(frozen_raw),
            "sourceClosureSha256": frozen["sourceClosureSha256"],
            "sourceEntryCount": frozen["sourceEntryCount"],
            "toolClosureSha256": frozen["toolClosureSha256"],
            "toolEntryCount": frozen["toolEntryCount"],
            "builderSha256": frozen_tools[
                "tools/cid_linux_current_source_candidate_builder.py"
            ]["sha256"],
            "workloadSha256": frozen_tools[
                "tools/cid_linux_current_source_candidate_workload.sh"
            ]["sha256"],
            "validatorSha256": frozen_tools[
                "tools/cid_linux_current_source_candidate_validate.py"
            ]["sha256"],
            "releaseSourceClosureSha256": "1" * 64,
            "releaseSourceClosureCid": "7" * 64,
            "candidateBundleSize": 1,
            "candidateBundleSha256": "2" * 64,
            "candidateManifestSize": 1,
            "candidateManifestSha256": "3" * 64,
            "candidateReportSize": 1,
            "candidateReportSha256": "4" * 64,
            "candidateWorkerSize": 64,
            "candidateWorkerSha256": "5" * 64,
            "candidateBuildArgvCount": 5,
            "candidateBuildArgvSha256": "6" * 64,
            "candidateBuildEnvCount": len(
                validator.CANDIDATE_BUILD_ENV
            ),
            "candidateBuildEnvSha256": validator.framed_sha256(
                validator.CANDIDATE_BUILD_ENV
            ),
        }
        builder_report_path = root / "builder-report.json"
        builder_report_path.write_bytes(
            validator.canonical_json(builder_report_value) + b"\n"
        )
        assert validator.validate_builder_report(
            builder_report_path,
            base_archive,
            archive,
            base_info,
            info,
            frozen,
            frozen_raw,
        ) == builder_report_value
        bad_report_value = dict(builder_report_value)
        bad_report_value["baseLayerDigests"] = list(
            reversed(builder_report_value["baseLayerDigests"])
        )
        bad_report_path = root / "builder-report-base-reorder.json"
        bad_report_path.write_bytes(
            validator.canonical_json(bad_report_value) + b"\n"
        )
        expect_failure(
            lambda: validator.validate_builder_report(
                bad_report_path,
                base_archive,
                archive,
                base_info,
                info,
                frozen,
                frozen_raw,
            ),
            "builder report base lineage reorder",
        )
        mutations = {
            "extra closure member": {"extra_context": "src/hidden.cheng"},
            "tar traversal": {"alias_context": True},
            "canonical duplicate": {"duplicate_context": True},
            "whiteout": {"whiteout": True},
            "mode": {"bad_mode": True},
            "mtime": {"bad_mtime": True},
            "uid": {"bad_uid": True},
            "type": {"bad_type": True},
            "descriptor size": {"descriptor_size_delta": 1},
            "diff id": {"bad_diff_id": True},
            "gzip trailing": {"gzip_trailing": True},
            "gzip concatenation": {"gzip_concat": True},
            "outer extra member": {"outer_extra": True},
        }
        for index, (label, kwargs) in enumerate(mutations.items()):
            target = root / f"mutation-{index}.tar"
            synthetic_image_archive(
                target,
                frozen,
                frozen_raw,
                files,
                base_layer_raws=base_layer_raws,
                **kwargs,
            )
            expect_failure(
                lambda target=target: validator.validate_image_archive(
                    target,
                    frozen,
                    frozen_raw,
                    base_image_info=base_info,
                ),
                label,
            )
        alternate_base_archive = root / "alternate-base.tar"
        alternate_base_raws = [
            opaque_layer("base/one", b"base-SWAPPED\n"),
            base_layer_raws[1],
        ]
        synthetic_base_archive(alternate_base_archive, alternate_base_raws)
        alternate_base_info = validator.validate_base_image_archive(
            alternate_base_archive,
        )
        expect_failure(
            lambda: validator.validate_image_archive(
                archive,
                frozen,
                frozen_raw,
                base_image_info=alternate_base_info,
            ),
            "base archive swap",
        )
        reordered = root / "reordered.tar"
        synthetic_image_archive(
            reordered,
            frozen,
            frozen_raw,
            files,
            base_layer_raws=base_layer_raws,
            layer_order=[1, 0, 2],
        )
        expect_failure(
            lambda: validator.validate_image_archive(
                reordered,
                frozen,
                frozen_raw,
                base_image_info=base_info,
            ),
            "base layer reorder",
        )
        extra_layer = root / "extra-layer.tar"
        synthetic_image_archive(
            extra_layer,
            frozen,
            frozen_raw,
            files,
            base_layer_raws=base_layer_raws,
            extra_layer=True,
        )
        expect_failure(
            lambda: validator.validate_image_archive(
                extra_layer,
                frozen,
                frozen_raw,
                base_image_info=base_info,
            ),
            "extra final layer",
        )
        changed, changed_raw, changed_files = frozen_manifest(b"package_id = \"pkg://other\"\n")
        coordinated = root / "coordinated.tar"
        synthetic_image_archive(
            coordinated,
            changed,
            changed_raw,
            changed_files,
            base_layer_raws=base_layer_raws,
        )
        expect_failure(
            lambda: validator.validate_image_archive(
                coordinated,
                frozen,
                frozen_raw,
                base_image_info=base_info,
            ),
            "fully coordinated source/image rehash against frozen anchor",
        )

        stable_root = root / "stable"
        (stable_root / "real").mkdir(parents=True)
        (stable_root / "real" / "value.txt").write_bytes(b"value")
        os.symlink("real", stable_root / "alias")
        assert builder.stable_read(stable_root, "real/value.txt") == b"value"
        expect_failure(lambda: builder.stable_read(stable_root, "alias/value.txt"), "intermediate symlink")

    print("cid_linux_current_source_candidate_test=passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
