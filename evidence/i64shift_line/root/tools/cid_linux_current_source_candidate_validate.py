#!/usr/bin/env python3
"""Independent raw-byte validator for the exact Linux current-source candidate."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import stat
import struct
import subprocess
import sys
import tarfile
import tempfile
import unicodedata
import zlib
from pathlib import Path
from typing import Any, Iterable, Sequence


SCHEMA = "cheng.cid_linux_current_source_candidate_validation"
BUILDER_SCHEMA = "cheng.cid_linux_current_source_builder"
BUILD_RECEIPT_SCHEMA = "cheng.cid_linux_current_source_candidate_build"
CLOSURE_SCHEMA = "cheng.cid_linux_current_source_closure"
SOURCE_DOMAIN = b"cheng.cid_linux_current_source.source_closure"
TOOL_DOMAIN = b"cheng.cid_linux_current_source.tool_closure"
BUNDLE_MAGIC = b"CHENG_CID_LINUX_CURRENT_SOURCE_CANDIDATE_BUNDLE"
REPORT_MAGIC = b"CHENG_CID_LINUX_CURRENT_SOURCE_CANDIDATE_REPORT"
WORKLOAD_ARGV0 = "/cheng-current-source/repo/tools/cid_linux_current_source_candidate_workload.sh"
CURRENT_WORKER_ARGV0 = "/cheng-hardcap/current-driver"
WORK_ROOT = "/cheng-hardcap-work/cheng-current-source-candidate"
BOOTSTRAP_COLD_REPORT_PATH = "/cheng-current-source/repo/artifacts/bootstrap/compiler_main.direct.report.txt"
BOOTSTRAP_DIRECT_PATH = "/cheng-current-source/repo/artifacts/bootstrap/compiler_main.direct"
BOOTSTRAP_SEED_PATH = f"{WORK_ROOT}/cheng-bootstrap-seed"
BOOTSTRAP_SEED_MAP_PATH = f"{WORK_ROOT}/bootstrap.seed.map"
CURRENT_STAGING_PATH = "/cheng-current-source/repo/artifacts/bootstrap/compiler_main.direct.next"
SOURCE_REPORT_PATH = f"{WORK_ROOT}/source.report"
TARGET = "x86_64-unknown-linux-gnu"
TARGET_SPECS = {
    "aarch64-unknown-linux-gnu": {
        "machine": "aarch64",
        "oci_architecture": "arm64",
        "elf_machine": 183,
    },
    "x86_64-unknown-linux-gnu": {
        "machine": "x86_64",
        "oci_architecture": "amd64",
        "elf_machine": 62,
    },
}
CURRENT_SOURCE_PACKAGE_ID = "cheng"
CURRENT_ENTRY_SPECS = {
    "src/core/tooling/backend_driver_dispatch_min.cheng":
        "cheng/core/tooling/backend_driver_dispatch_min",
    "src/core/tooling/backend_driver_main.cheng":
        "cheng/core/tooling/backend_driver_main",
}
CANDIDATE_BUILD_ENV = (
    "BACKEND_INCREMENTAL=0",
    "BACKEND_JOBS=1",
    "BACKEND_MULTI_MODULE_CACHE=0",
    "CHENG_BACKEND_DRIVER_HANDOFF=0",
    "CHENG_DISABLE_PRIMARY_OBJECT_CACHE=1",
    "CHENG_NO_BACKEND_DRIVER_HANDOFF=1",
    "CHENG_PROCESS_MAX_RSS_BYTES=805306368",
    "CHENG_PROGRESS=1",
    "CHENG_REQUIRE_PURE_SYSTEM_LINK_EXEC=1",
    "HOME=/nonexistent",
    "LANG=C",
    "LC_ALL=C",
    "PATH=/usr/bin:/bin",
    "TMPDIR=/cheng-hardcap-work/tmp",
    "TZ=UTC",
)
IMAGE_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
SHA_RE = re.compile(r"^[0-9a-f]{64}$")
UINT_RE = re.compile(r"^(0|[1-9][0-9]*)$")
INT_RE = re.compile(r"^(?:0|-?[1-9][0-9]*)$")
REPORT_KEY_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_.-]*$")
LEGACY_VERSION_KEY_RE = re.compile(r"(?:^version$|_version$)")
SOURCE_BUNDLE_BINDING_PHYSICAL_PREFIX = "source_bundle_binding_physical_"
SOURCE_BUNDLE_BINDING_PHYSICAL_DOMAIN = (
    "cheng.system_link.source_bundle_binding.physical"
)
CURRENT_REPOSITORY_ROOT = "/cheng-current-source/repo"
CURRENT_EXTERNAL_PACKAGE_ROOTS = (
    (
        "cheng/codex",
        "cheng/codex",
        f"{CURRENT_REPOSITORY_ROOT}/codex",
        "",
    ),
    (
        "codex",
        "cheng/codex",
        f"{CURRENT_REPOSITORY_ROOT}/codex",
        "",
    ),
    (
        "cheng/rust-csg-core",
        "cheng/rust-csg-core",
        f"{CURRENT_REPOSITORY_ROOT}/rust-csg-core",
        "",
    ),
    (
        "rust-csg-core",
        "cheng/rust-csg-core",
        f"{CURRENT_REPOSITORY_ROOT}/rust-csg-core",
        "",
    ),
)
SOURCE_BUNDLE_BINDING_PHYSICAL_EDGE_FIELDS = (
    "owner_module_path",
    "target_module_path",
    "target_source_path",
    "target_source_path_len",
    "target_source_path_first_code",
    "target_source_path_last_code",
    "target_source_path_dot_count",
    "target_source_path_hash",
    "target_profile_index",
    "import_alias",
    "qualifier",
    "allows_unqualified_call",
    "resolved",
)
CURRENT_RUNTIME_INDEX_METRIC_SUFFIXES = (
    "build_count",
    "query_count",
    "sort_comparison_count",
    "lookup_comparison_count",
    "max_lookup_comparisons",
    "retained_bytes_estimate",
    "live_retained_bytes_estimate",
    "peak_retained_bytes_estimate",
    "retained_bytes_estimate_scope",
    "rss_gate_eligible",
    "composite_key_bytes",
    "instance_count",
    "release_count",
    "sealed",
    "released",
)
CURRENT_RUNTIME_INDEX_METRIC_PREFIXES = (
    "system_link_exec_provider_path_index",
    "system_link_exec_reloc_definition_index",
    "system_link_exec_reloc_root_index",
    "system_link_exec_native_input_index",
    "system_link_exec_index_total",
)
CURRENT_DEFER_RECEIPT_FIELDS = (
    "function_row",
    "statement_row",
    "target",
    "action_cid",
    "fragment_cid",
)
DRY_COMPILE_REPORT_HEAD_KEYS = tuple("""
schema dry_compile dry_compile_command compiler_impl
dry_compile_input_contract_compiler dry_compile_input_contract_model
dry_compile_input_contract_target_triple dry_compile_input_contract_emit_kind
dry_compile_input_contract_entry_source_fshex
dry_compile_input_contract_provider_state
dry_compile_input_contract_link_state dry_compile_input_contract_cache_state
dry_compile_input_contract_provider_cache_state
dry_compile_input_contract_hardware_logical_cpus
dry_compile_input_contract_hardware_memory_bytes
dry_compile_input_contract_memory_limit_bytes
dry_compile_input_contract_backend_jobs
dry_compile_input_contract_effective_jobs dry_compile_model
dry_compile_executes_codegen dry_compile_source_closure_mode
dry_compile_entry_fshex target emit dry_compile_input_source_file_count
dry_compile_input_source_line_count dry_compile_input_source_byte_count
dry_compile_input_source_max_file_bytes dry_compile_import_edge_count
dry_compile_unresolved_import_count dry_compile_source_manifest_count
""".split())
DRY_COMPILE_REPORT_SOURCE_FIELDS = (
    "path_fshex",
    "raw_bytes_cid",
    "byte_count",
    "line_count",
    "import_edge_count",
    "discovery_kind",
    "discoverer_source_index",
    "discoverer_edge_index",
)
DRY_COMPILE_REPORT_EDGE_FIELDS = (
    "owner_module_path_fshex",
    "target_module_path_fshex",
    "target_source_path_fshex",
    "target_source_path_len",
    "target_source_path_first_code",
    "target_source_path_last_code",
    "target_source_path_dot_count",
    "target_source_path_hash",
    "target_profile_index",
    "import_alias_fshex",
    "qualifier_fshex",
    "allows_unqualified_call",
    "resolved",
)
DRY_COMPILE_REPORT_AFTER_DYNAMIC_KEYS = tuple("""
dry_compile_source_bundle_entry_source_index dry_compile_source_bundle_cid
dry_compile_entry_source_cid dry_compile_import_graph_cid
dry_compile_source_bundle_binding_seal
dry_compile_source_bundle_unresolved_import_count
dry_compile_source_manifest_cid dry_compile_hardware_logical_cpus
dry_compile_hardware_memory_bytes dry_compile_hardware_memory_status
compile_parallel_requested_jobs compile_parallel_hardware_jobs
compile_parallel_effective_jobs compile_parallel_theory_scope
compile_parallel_theory_model compile_parallel_serial_phase_ns
compile_parallel_serial_phase_ms compile_parallelizable_phase_ns
compile_parallelizable_phase_ms compile_parallel_theory_lower_bound_ns
compile_parallel_theory_lower_bound_ms compile_parallel_real_scope
compile_parallel_real_executes_codegen compile_parallel_real_ns
compile_parallel_real_ms compile_parallel_real_over_theory_x
compile_parallel_real_over_theory_percent
compile_parallel_theory_efficiency_percent
dry_compile_primary_instruction_word_count
dry_compile_text_size_lower_bound_bytes dry_compile_format_floor_bytes
dry_compile_output_size_theory_lower_bound_bytes
dry_compile_memory_theory_scope dry_compile_memory_theory_model
dry_compile_memory_theory_lower_bound_bytes dry_compile_predicts_full_compile_rss
dry_compile_decision_scope
""".split())
DRY_COMPILE_REPORT_FULL_THEORY_KEYS = tuple("""
dry_compile_full_theory_model
dry_compile_full_theory_requires_real_validation
dry_compile_full_theory_executes_codegen full_compile_theory_framework
full_compile_theory_requires_real_validation
full_compile_theory_calibration_source full_compile_theory_validation_status
full_compile_theory_scope full_compile_theory_bound_status
full_compile_theory_model full_compile_theory_source_closure_files
full_compile_theory_source_closure_lines
full_compile_theory_source_closure_bytes
full_compile_theory_source_closure_import_edges
full_compile_theory_source_closure_decl_estimate
full_compile_theory_source_closure_function_estimate
full_compile_theory_source_closure_export_estimate
full_compile_theory_source_closure_importc_estimate
full_compile_theory_source_closure_call_edge_estimate
full_compile_theory_source_closure_type_ref_estimate
full_compile_theory_phase_csg_nodes full_compile_theory_phase_csg_edges
full_compile_theory_phase_csg_facts full_compile_theory_phase_csg_exprs
full_compile_theory_phase_typed_ir_funcs
full_compile_theory_phase_typed_ir_statements
full_compile_theory_phase_typed_ir_rounds
full_compile_theory_phase_lowering_funcs
full_compile_theory_phase_lowering_body_ir_ops
full_compile_theory_phase_lowering_line_map_bytes
full_compile_theory_phase_primary_instruction_words
full_compile_theory_phase_primary_relocs
full_compile_theory_phase_primary_data_labels
full_compile_theory_phase_primary_object_bytes
full_compile_theory_phase_provider_object_count
full_compile_theory_phase_provider_object_bytes
full_compile_theory_phase_native_object_count
full_compile_theory_phase_native_object_bytes
full_compile_theory_phase_link_input_count
full_compile_theory_phase_link_input_bytes
full_compile_theory_compiler_csg_estimated_nodes
full_compile_theory_compiler_csg_estimated_edges
full_compile_theory_compiler_csg_estimated_facts
full_compile_theory_compiler_csg_estimated_exprs
full_compile_theory_compiler_csg_estimated_typed_ir_functions
full_compile_theory_compiler_csg_estimated_typed_ir_statements
full_compile_theory_compiler_csg_estimated_rounds
full_compile_theory_lowering_estimated_functions
full_compile_theory_lowering_estimated_body_ir_ops
full_compile_theory_lowering_estimated_line_map_bytes
full_compile_theory_primary_estimated_instruction_words
full_compile_theory_primary_estimated_relocs
full_compile_theory_primary_estimated_data_labels
full_compile_theory_primary_estimated_object_bytes_lower_bound
full_compile_theory_primary_estimated_object_bytes_budget_upper_bound
full_compile_theory_rss_model full_compile_theory_rss_model_scope
full_compile_theory_rss_estimate_status
full_compile_theory_rss_component_coverage
full_compile_theory_rss_unmodeled_owner_count
full_compile_theory_rss_unmodeled_components
full_compile_theory_rss_proven_upper_bound_status
full_compile_theory_rss_source_text_bytes
full_compile_theory_rss_csg_graph_bytes
full_compile_theory_rss_expr_layer_bytes
full_compile_theory_rss_typed_fact_physical_column_count
full_compile_theory_rss_typed_fact_physical_int32_column_count
full_compile_theory_rss_typed_fact_physical_u8_column_count
full_compile_theory_rss_typed_fact_int32_scalar_bytes
full_compile_theory_rss_typed_fact_u8_scalar_bytes
full_compile_theory_rss_typed_fact_physical_row_bytes
full_compile_theory_rss_typed_fact_storage_model
full_compile_theory_rss_typed_fact_row_count
full_compile_theory_rss_typed_fact_intern_payload_model
full_compile_theory_rss_typed_fact_allocator_overhead_model
full_compile_theory_rss_typed_facts_bytes
full_compile_theory_rss_typed_ir_bytes
full_compile_theory_rss_lowering_bytes full_compile_theory_rss_primary_bytes
full_compile_theory_rss_provider_bytes full_compile_theory_rss_link_bytes
full_compile_theory_rss_report_bytes
full_compile_theory_rss_phase_csg_structured_bytes
full_compile_theory_rss_phase_lowering_structured_bytes
full_compile_theory_rss_phase_primary_structured_bytes
full_compile_theory_rss_phase_provider_structured_bytes
full_compile_theory_rss_phase_link_structured_bytes
full_compile_theory_rss_phase_report_structured_bytes
full_compile_theory_rss_modeled_retention_model
full_compile_theory_rss_single_phase_peak_name
full_compile_theory_rss_single_phase_max_structured_bytes
full_compile_theory_rss_modeled_structured_peak_bytes
full_compile_theory_rss_legacy_retained_cumulative_estimate_bytes
full_compile_theory_rss_csg_incremental_bytes
full_compile_theory_rss_lowering_incremental_bytes
full_compile_theory_rss_primary_incremental_bytes
full_compile_theory_rss_report_incremental_bytes
full_compile_theory_rss_capacity_bytes full_compile_theory_rss_orc_bytes
full_compile_theory_rss_arena_bytes
full_compile_theory_rss_allocator_heuristic_estimate_bytes
full_compile_theory_rss_allocator_classified_sum_bytes
full_compile_theory_rss_allocator_modeled_bytes
full_compile_theory_rss_allocator_gap_bytes
full_compile_theory_rss_allocator_invariant
full_compile_theory_rss_peak_phase_name
full_compile_theory_rss_modeled_peak_estimate_bytes
full_compile_theory_rss_modeled_budget_estimate_bytes
full_compile_theory_rss_modeled_guard_estimate_bytes
full_compile_theory_rss_modeled_guard_hardware_status
full_compile_theory_rss_modeled_guard_hardware_status_semantics
full_compile_theory_rss_parallel_model
full_compile_theory_rss_parallel_model_scope
full_compile_theory_rss_memory_limit_bytes
full_compile_theory_rss_parallel_guard_scale_numerator
full_compile_theory_rss_parallel_guard_scale_denominator
full_compile_theory_rss_parallel_guard_reserve_bytes
full_compile_theory_rss_phase_source_fixed_bytes
full_compile_theory_rss_phase_source_per_worker_bytes
full_compile_theory_rss_phase_csg_fixed_bytes
full_compile_theory_rss_phase_csg_per_worker_bytes
full_compile_theory_rss_phase_typed_ir_fixed_bytes
full_compile_theory_rss_phase_typed_ir_per_worker_bytes
full_compile_theory_rss_phase_lowering_fixed_bytes
full_compile_theory_rss_phase_lowering_per_worker_bytes
full_compile_theory_rss_phase_primary_fixed_bytes
full_compile_theory_rss_phase_primary_per_worker_bytes
full_compile_theory_rss_phase_provider_fixed_bytes
full_compile_theory_rss_phase_provider_per_worker_bytes
full_compile_theory_rss_phase_link_fixed_bytes
full_compile_theory_rss_phase_link_per_worker_bytes
full_compile_theory_rss_phase_report_fixed_bytes
full_compile_theory_rss_phase_report_per_worker_bytes
full_compile_theory_rss_parallel_serial_floor_bytes
full_compile_theory_rss_lowering_memory_limited_jobs
full_compile_theory_rss_primary_memory_limited_jobs
full_compile_theory_rss_memory_limited_max_jobs
full_compile_theory_rss_memory_limited_effective_jobs
full_compile_theory_rss_parallel_status
full_compile_theory_time_requested_jobs
full_compile_theory_time_hardware_jobs
full_compile_theory_time_effective_jobs full_compile_theory_time_cpu_model
full_compile_theory_time_memory_bandwidth_model
full_compile_theory_time_source_closure_phase_ns
full_compile_theory_time_compiler_csg_phase_ns
full_compile_theory_time_typed_ir_phase_ns
full_compile_theory_time_lowering_phase_ns
full_compile_theory_time_primary_phase_ns
full_compile_theory_time_provider_phase_ns
full_compile_theory_time_link_phase_ns
full_compile_theory_time_report_phase_ns
full_compile_theory_time_phase_source_ns
full_compile_theory_time_phase_source_ms
full_compile_theory_time_phase_csg_ns full_compile_theory_time_phase_csg_ms
full_compile_theory_time_phase_typed_ir_ns
full_compile_theory_time_phase_typed_ir_ms
full_compile_theory_time_phase_lowering_ns
full_compile_theory_time_phase_lowering_ms
full_compile_theory_time_phase_primary_ns
full_compile_theory_time_phase_primary_ms
full_compile_theory_time_phase_provider_ns
full_compile_theory_time_phase_provider_ms
full_compile_theory_time_phase_link_ns
full_compile_theory_time_phase_link_ms
full_compile_theory_time_phase_report_ns
full_compile_theory_time_phase_report_ms
full_compile_theory_time_serial_phase_ns
full_compile_theory_time_serial_phase_ms
full_compile_theory_time_parallelizable_phase_ns
full_compile_theory_time_parallelizable_phase_ms
full_compile_theory_time_lower_bound_ns
full_compile_theory_time_lower_bound_ms
full_compile_theory_time_budget_upper_bound_ns
full_compile_theory_time_budget_upper_bound_ms
full_compile_theory_time_guard_recommended_ms
full_compile_theory_size_object_lower_bound_bytes
full_compile_theory_size_object_budget_upper_bound_bytes
full_compile_theory_size_provider_lower_bound_bytes
full_compile_theory_size_provider_budget_upper_bound_bytes
full_compile_theory_size_final_artifact_lower_bound_bytes
full_compile_theory_size_final_artifact_budget_upper_bound_bytes
""".split())
DRY_COMPILE_REPORT_POST_THEORY_KEYS = tuple("""
exec_phase_system_link_plan_ns exec_phase_system_link_plan_ms
exec_phase_source_closure_ns exec_phase_source_closure_ms
exec_phase_compiler_csg_ms exec_phase_lowering_plan_ms
exec_phase_primary_object_plan_ms exec_phase_direct_object_emit_ms
exec_phase_provider_objects_ms exec_phase_native_link_ms
exec_phase_line_map_ms exec_phase_total_ms
exec_retained_payload_approx_bytes
exec_retained_lowering_payload_approx_bytes
exec_retained_primary_payload_approx_bytes
exec_retained_object_plan_approx_bytes
exec_retained_native_plan_approx_bytes
exec_retained_object_plan_item_count exec_retained_native_plan_item_count
""".split())
DRY_COMPILE_REPORT_PHASE_NAMES = (
    "source_closure",
    "compiler_csg",
    "lowering_plan",
    "primary_object_plan",
    "report_payload_assembly",
)
DRY_COMPILE_REPORT_PHASE_SNAPSHOT_SUFFIXES = (
    "rss_before_bytes",
    "rss_after_bytes",
    "rss_delta_bytes",
    "structured_before_bytes",
    "structured_after_bytes",
    "structured_delta_bytes",
    "unstructured_gap_before_bytes",
    "unstructured_gap_after_bytes",
    "unstructured_gap_delta_bytes",
)
DRY_COMPILE_REPORT_PHASE_LEDGER_TAIL_KEYS = tuple("""
compiler_csg_phase_source_closure_structured_bytes
compiler_csg_phase_source_closure_rss_delta_bytes
compiler_csg_phase_source_closure_gap_delta_bytes
compiler_csg_phase_csg_graph_structured_bytes
compiler_csg_phase_expr_layer_structured_bytes
compiler_csg_phase_typed_facts_structured_bytes
compiler_csg_phase_typed_ir_structured_bytes
compiler_csg_phase_compiler_csg_rss_delta_bytes
compiler_csg_phase_compiler_csg_gap_delta_bytes
compiler_csg_phase_lowering_plan_structured_bytes
compiler_csg_phase_lowering_plan_rss_delta_bytes
compiler_csg_phase_lowering_plan_gap_delta_bytes
compiler_csg_phase_primary_object_plan_structured_bytes
compiler_csg_phase_primary_object_plan_rss_delta_bytes
compiler_csg_phase_primary_object_plan_gap_delta_bytes
compiler_csg_phase_report_payload_assembly_structured_bytes
compiler_csg_phase_report_payload_assembly_rss_delta_bytes
compiler_csg_phase_report_payload_assembly_gap_delta_bytes
phase_memory_ledger_compiler_csg_top_contributor_0_kind
phase_memory_ledger_compiler_csg_top_contributor_0_count
phase_memory_ledger_compiler_csg_top_contributor_0_bytes
phase_memory_ledger_compiler_csg_top_contributor_1_kind
phase_memory_ledger_compiler_csg_top_contributor_1_count
phase_memory_ledger_compiler_csg_top_contributor_1_bytes
phase_memory_ledger_compiler_csg_top_contributor_2_kind
phase_memory_ledger_compiler_csg_top_contributor_2_count
phase_memory_ledger_compiler_csg_top_contributor_2_bytes
phase_memory_ledger_primary_object_plan_top_contributor_0_kind
phase_memory_ledger_primary_object_plan_top_contributor_0_count
phase_memory_ledger_primary_object_plan_top_contributor_0_bytes
phase_memory_ledger_primary_object_plan_top_contributor_1_kind
phase_memory_ledger_primary_object_plan_top_contributor_1_count
phase_memory_ledger_primary_object_plan_top_contributor_1_bytes
phase_memory_ledger_primary_object_plan_top_contributor_2_kind
phase_memory_ledger_primary_object_plan_top_contributor_2_count
phase_memory_ledger_primary_object_plan_top_contributor_2_bytes
""".split())
DRY_COMPILE_REPORT_FINAL_KEYS = (
    "exec_phase_report_payload_assembly_ns",
    "exec_phase_report_payload_assembly_ms",
    "exec_phase_dry_actual_total_ns",
    "exec_phase_dry_actual_total_ms",
)
MAX_IMAGE_ARCHIVE_BYTES = 8 * 1024 * 1024 * 1024
MAX_COMPRESSED_LAYER_BYTES = 8 * 1024 * 1024 * 1024
MAX_UNCOMPRESSED_LAYER_BYTES = 16 * 1024 * 1024 * 1024
MAX_TAR_MEMBERS = 1_000_000
MAX_IMAGE_LAYERS = 1024
MAX_BUNDLE_BYTES = 2 * 1024 * 1024 * 1024
MANIFEST_KEYS = (
    "schema", "target", "machine", "candidate_entry_path",
    "candidate_entry_module_path", "candidate_entry_sha256",
    "toolchain_image_id", "toolchain_config_digest",
    "toolchain_oci_manifest_digest", "source_tool_manifest_sha256",
    "source_closure_sha256", "source_entry_count", "tool_closure_sha256",
    "tool_entry_count", "bootstrap_seed_size", "bootstrap_seed_sha256",
    "bootstrap_seed_device", "bootstrap_seed_inode", "candidate_device",
    "candidate_inode", "current_report_origin", "candidate_size",
    "candidate_sha256", "report_size",
    "report_sha256", "candidate_execution", "candidate_elf_magic",
    "candidate_elf_class", "candidate_elf_data", "candidate_elf_machine",
)
REPORT_PAYLOADS = (
    "cc.stdout", "cc.stderr", "bootstrap.stdout", "bootstrap.stderr",
    "bootstrap.report", "bootstrap.cold.report", "current.stdout",
    "current.stderr", "source.report", "candidate.map", "status.stdout",
    "status.stderr",
)
CURRENT_TOOL_ANCHORS = (
    "tools/cold_link_object_provider_smoke.sh",
    "tools/cid_linux_current_source_candidate_builder.py",
    "tools/cid_linux_current_source_candidate_gate.sh",
    "tools/cid_linux_current_source_candidate_workload.sh",
    "tools/cid_linux_current_source_candidate_validate.py",
    "tools/cid_linux_current_source_candidate_validate.sh",
    "tools/beat_c_linux_cgroup_v2_hard_memory_gate.sh",
    "tools/beat_c_linux_cgroup_v2_hard_memory_gate.py",
    "tools/beat_c_validate_linux_cgroup_v2_hard_memory_receipt.py",
)
BUILD_RECEIPT_KEYS = frozenset((
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
))


class ValidationError(RuntimeError):
    pass


def current_entry_spec(entry_path: str) -> tuple[str, str]:
    module_path = CURRENT_ENTRY_SPECS.get(entry_path)
    if module_path is None:
        raise ValidationError(
            "entry must be one exact official backend driver source"
        )
    return entry_path, module_path


def release_source_content_cid(raw: bytes) -> str:
    path = Path(__file__).resolve(strict=True).with_name(
        "current_source_closure_manifest.py"
    )
    spec = importlib.util.spec_from_file_location(
        "cid_linux_release_source_closure", path,
    )
    if spec is None or spec.loader is None:
        raise ValidationError("release source closure parser cannot be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    try:
        value = module.content_cid_from_manifest(raw)
    except RuntimeError as exc:
        raise ValidationError(
            f"release source closure content CID invalid: {exc}"
        ) from exc
    if not isinstance(value, str) or not SHA_RE.fullmatch(value):
        raise ValidationError("release source closure content CID is invalid")
    return value


def target_spec(target: str) -> dict[str, Any]:
    result = TARGET_SPECS.get(target)
    if result is None:
        raise ValidationError("target must be an exact supported Linux triple")
    return result


def sha256_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def exact_file_sha256(path: Path, *, max_size: int) -> tuple[int, str]:
    flags = os.O_RDONLY
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(path, flags)
    digest = hashlib.sha256()
    try:
        before = os.fstat(fd)
        if (not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or
                before.st_size < 0 or before.st_size > max_size):
            raise ValidationError(f"file identity/size invalid: {path}")
        remaining = before.st_size
        while True:
            if remaining <= 0:
                break
            chunk = os.read(fd, min(1024 * 1024, remaining))
            if not chunk:
                raise ValidationError(f"short read while hashing: {path}")
            digest.update(chunk)
            remaining -= len(chunk)
        if os.read(fd, 1):
            raise ValidationError(f"file grew while hashing: {path}")
        after = os.fstat(fd)
    finally:
        os.close(fd)
    path_after = os.stat(path, follow_symlinks=False)
    identity = (
        "st_dev", "st_ino", "st_mode", "st_nlink", "st_size",
        "st_mtime_ns", "st_ctime_ns",
    )
    if (any(getattr(before, field) != getattr(after, field) for field in identity) or
            any(getattr(before, field) != getattr(path_after, field)
                for field in identity)):
        raise ValidationError(f"file changed while hashing: {path}")
    return before.st_size, digest.hexdigest()


def canonical_json(value: Any) -> bytes:
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")


def framed_sha256(values: Iterable[str]) -> str:
    digest = hashlib.sha256()
    for value in values:
        raw = value.encode("utf-8")
        digest.update(struct.pack(">Q", len(raw)))
        digest.update(raw)
    return digest.hexdigest()


def dry_compile_report_exact_key_order(
    source_count: int,
    edge_count: int,
) -> tuple[tuple[str, ...], int, str]:
    for value, label, allow_zero in (
        (source_count, "dry compile exact source count", False),
        (edge_count, "dry compile exact edge count", True),
    ):
        if (
            not isinstance(value, int)
            or isinstance(value, bool)
            or value < (0 if allow_zero else 1)
            or value > 1_000_000
        ):
            raise ValidationError(f"{label} is outside exact schema bounds")
    if source_count + edge_count > 1_000_000:
        raise ValidationError(
            "dry compile exact indexed key count exceeds schema bound"
        )
    source_keys = tuple(
        f"dry_compile_source_manifest.{index}.{field}"
        for index in range(source_count)
        for field in DRY_COMPILE_REPORT_SOURCE_FIELDS
    )
    edge_keys = tuple(
        f"dry_compile_import_edge.{index}.{field}"
        for index in range(edge_count)
        for field in DRY_COMPILE_REPORT_EDGE_FIELDS
    )
    phase_snapshot_keys = tuple(
        f"phase_memory_ledger_{phase}_{suffix}"
        for phase in DRY_COMPILE_REPORT_PHASE_NAMES
        for suffix in DRY_COMPILE_REPORT_PHASE_SNAPSHOT_SUFFIXES
    )
    keys = (
        DRY_COMPILE_REPORT_HEAD_KEYS
        + source_keys
        + edge_keys
        + DRY_COMPILE_REPORT_AFTER_DYNAMIC_KEYS
        + DRY_COMPILE_REPORT_FULL_THEORY_KEYS
        + DRY_COMPILE_REPORT_POST_THEORY_KEYS
        + ("phase_memory_ledger_schema", "phase_memory_ledger_phase_count")
        + phase_snapshot_keys
        + DRY_COMPILE_REPORT_PHASE_LEDGER_TAIL_KEYS
        + DRY_COMPILE_REPORT_FINAL_KEYS
    )
    if len(keys) != len(set(keys)):
        raise ValidationError(
            "dry compile exact key authority contains duplicate key"
        )
    return keys, len(keys), framed_sha256(keys)


def cheng_framed_text(value: str, label: str) -> bytes:
    if not value or value.strip() != value or any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise ValidationError(f"{label} is not canonical Cheng receipt text")
    raw = value.encode("utf-8")
    if len(raw) > 0xFFFF_FFFF:
        raise ValidationError(f"{label} exceeds Cheng receipt text framing")
    return struct.pack(">I", len(raw)) + raw


def cheng_framed_fixed32(value: str, label: str) -> bytes:
    if not SHA_RE.fullmatch(value) or value == "0" * 64:
        raise ValidationError(f"{label} is not a nonzero SHA-256 identity")
    return struct.pack(">I", 32) + bytes.fromhex(value)


def cheng_framed_u32(value: int, label: str) -> bytes:
    if value < 0 or value > 0xFFFF_FFFF:
        raise ValidationError(f"{label} exceeds Cheng u32 framing")
    return struct.pack(">I", 4) + struct.pack(">I", value)


def cheng_framed_physical_text(
    value: str, label: str, *, allow_empty: bool = False,
) -> bytes:
    if (
        (not value and not allow_empty)
        or (value and value.strip() != value)
        or unicodedata.normalize("NFC", value) != value
        or any(ord(char) < 32 or ord(char) == 127 for char in value)
    ):
        raise ValidationError(f"{label} is not canonical physical text")
    raw = value.encode("utf-8")
    if len(raw) > 0xFFFF_FFFF:
        raise ValidationError(f"{label} exceeds Cheng physical text framing")
    return struct.pack(">I", len(raw)) + raw


def int32_bit_pattern(value: str, label: str) -> int:
    if not INT_RE.fullmatch(value):
        raise ValidationError(f"{label} is not a canonical int32")
    parsed = int(value)
    if parsed < -0x8000_0000 or parsed > 0x7FFF_FFFF:
        raise ValidationError(f"{label} exceeds int32")
    return parsed & 0xFFFF_FFFF


def canonical_absolute_path(value: str, label: str) -> str:
    if (
        not value.startswith("/")
        or value == "/"
        or value.endswith("/")
        or "\\" in value
        or unicodedata.normalize("NFC", value) != value
        or any(ord(char) < 32 or ord(char) == 127 for char in value)
        or any(part in ("", ".", "..") for part in value[1:].split("/"))
    ):
        raise ValidationError(f"{label} is not a canonical absolute path")
    return value


def decode_lower_fshex_text(value: str, label: str) -> str:
    if (
        not value
        or len(value) % 2 != 0
        or re.fullmatch(r"[0-9a-f]+", value) is None
    ):
        raise ValidationError(f"{label} is not canonical lower fshex")
    try:
        raw = bytes.fromhex(value)
        text = raw.decode("utf-8", "strict")
    except (ValueError, UnicodeDecodeError) as exc:
        raise ValidationError(f"{label} is not canonical UTF-8 fshex") from exc
    if text.encode("utf-8").hex() != value:
        raise ValidationError(f"{label} fshex does not round trip")
    return text


def source_bundle_binding_physical_module_path(
    source_path: str,
    package_id: str,
    package_root: str,
    external_roots: Sequence[dict[str, str]],
) -> str:
    candidates = [(package_root, package_id)]
    candidates.extend(
        (root["package_root"], root["canonical_package_id"])
        for root in external_roots
    )
    candidates.sort(key=lambda item: len(item[0]), reverse=True)
    for root, owner_package_id in candidates:
        source_prefix = root + "/src/"
        if not source_path.startswith(source_prefix):
            continue
        relative = source_path[len(source_prefix):]
        if not relative.endswith(".cheng") or len(relative) <= len(".cheng"):
            raise ValidationError(
                "source bundle physical closure member is not Cheng source"
            )
        module_suffix = relative[:-len(".cheng")]
        validate_portable_path(
            module_suffix, "source bundle physical module suffix",
        )
        module_path = f"{owner_package_id}/{module_suffix}"
        validate_portable_path(
            module_path, "source bundle physical module identity",
        )
        return module_path
    return source_path


def parser_text_lookup_content_hash(text: str) -> int:
    value = 0
    for byte in text.encode("utf-8"):
        value = (value * 131 + byte) & 0xFFFF_FFFF
        if value >= 0x8000_0000:
            value -= 0x1_0000_0000
    if value < 0:
        value = (-value) & 0xFFFF_FFFF
        if value >= 0x8000_0000:
            value -= 0x1_0000_0000
    return value


def parser_ident_prefix(text: str) -> str:
    stop = 0
    for index, char in enumerate(text):
        if char.isascii() and (char.isalnum() or char == "_"):
            stop = index + 1
        else:
            break
    return text[:stop]


def source_bundle_binding_import_graph_cid(
    package_id: str, edges: Sequence[dict[str, Any]],
    unresolved_import_count: int,
) -> str:
    ordered = sorted(
        edges,
        key=lambda edge: (
            edge["owner_module_path"].encode("utf-8"),
            edge["target_module_path"].encode("utf-8"),
            edge["import_alias"].encode("utf-8"),
            edge["qualifier"].encode("utf-8"),
            edge["allows_unqualified_call"],
            edge["resolved"],
        ),
    )
    prior_key: tuple[Any, ...] | None = None
    payload = bytearray()
    payload.extend(cheng_framed_physical_text(
        "cheng.compiler.portable_import_graph",
        "portable import graph domain",
    ))
    payload.extend(cheng_framed_physical_text(
        package_id, "portable import graph package id",
    ))
    payload.extend(cheng_framed_u32(
        len(ordered), "portable import graph edge count",
    ))
    for edge in ordered:
        edge_key = (
            edge["owner_module_path"],
            edge["target_module_path"],
            edge["import_alias"],
            edge["qualifier"],
            edge["allows_unqualified_call"],
            edge["resolved"],
        )
        if edge_key == prior_key:
            raise ValidationError(
                "source bundle physical import graph has duplicate edge"
            )
        prior_key = edge_key
        for field in (
            "owner_module_path", "target_module_path",
            "import_alias", "qualifier",
        ):
            payload.extend(cheng_framed_physical_text(
                edge[field],
                f"portable import graph {field}",
                allow_empty=field == "import_alias",
            ))
        payload.extend(cheng_framed_u32(
            edge["allows_unqualified_call"],
            "portable import graph unqualified-call flag",
        ))
        payload.extend(cheng_framed_u32(
            edge["resolved"], "portable import graph resolved flag",
        ))
    payload.extend(cheng_framed_u32(
        unresolved_import_count,
        "portable import graph unresolved count",
    ))
    return sha256_bytes(bytes(payload))


def source_bundle_binding_physical_seal_from_report(
    rows: dict[str, str],
) -> tuple[str, list[str]]:
    prefix = SOURCE_BUNDLE_BINDING_PHYSICAL_PREFIX
    domain_key = f"{prefix}domain"
    workspace_key = f"{prefix}workspace_root_fshex"
    package_root_key = f"{prefix}package_root_fshex"
    external_count_key = f"{prefix}external_root_count"
    identity_count_key = f"{prefix}identity_path_count"
    closure_count_key = f"{prefix}source_closure_path_count"
    owner_count_key = f"{prefix}owner_module_path_count"
    import_count_key = f"{prefix}import_edge_count"
    expected_keys = [
        domain_key, workspace_key, package_root_key, external_count_key,
    ]
    if rows.get(domain_key, "") != SOURCE_BUNDLE_BINDING_PHYSICAL_DOMAIN:
        raise ValidationError("source bundle physical domain mismatch")
    workspace_root = canonical_absolute_path(
        decode_lower_fshex_text(
            rows.get(workspace_key, ""),
            "source bundle physical workspace root",
        ),
        "source bundle physical workspace root",
    )
    package_root = canonical_absolute_path(
        decode_lower_fshex_text(
            rows.get(package_root_key, ""),
            "source bundle physical package root",
        ),
        "source bundle physical package root",
    )
    if (
        workspace_root != CURRENT_REPOSITORY_ROOT
        or package_root != CURRENT_REPOSITORY_ROOT
    ):
        raise ValidationError(
            "source bundle physical roots differ from current repository root"
        )
    source_count = uint(
        rows.get("source_identity_receipt_source_snapshot_count", ""),
        "source bundle physical source count",
    )
    import_count = uint(
        rows.get("source_identity_receipt_import_edge_count", ""),
        "source bundle physical import count",
    )
    unresolved_count = uint(
        rows.get("source_identity_receipt_unresolved_import_count", ""),
        "source bundle physical unresolved count",
    )
    entry_index = uint(
        rows.get("source_bundle_entry_source_index", ""),
        "source bundle physical entry index",
    )
    if (
        source_count <= 0
        or source_count > 0x7FFF_FFFF
        or import_count > 0x7FFF_FFFF
        or unresolved_count != 0
        or entry_index >= source_count
    ):
        raise ValidationError("source bundle physical receipt counts are invalid")

    external_count = uint(
        rows.get(external_count_key, ""),
        "source bundle physical external root count",
    )
    if external_count > len(rows):
        raise ValidationError(
            "source bundle physical external root count exceeds report rows"
        )
    external_roots: list[dict[str, str]] = []
    for index in range(external_count):
        root_prefix = f"{prefix}external_root.{index}"
        root_keys = {
            "package_id": f"{root_prefix}.package_id",
            "canonical_package_id": f"{root_prefix}.canonical_package_id",
            "package_root": f"{root_prefix}.package_root_fshex",
            "channel": f"{root_prefix}.channel",
        }
        expected_keys.extend(root_keys.values())
        root = {
            field: rows.get(key, "") for field, key in root_keys.items()
        }
        cheng_framed_physical_text(
            root["package_id"],
            "source bundle physical external package id",
        )
        cheng_framed_physical_text(
            root["canonical_package_id"],
            "source bundle physical external canonical package id",
        )
        root["package_root"] = canonical_absolute_path(
            decode_lower_fshex_text(
                root["package_root"],
                "source bundle physical external package root",
            ),
            "source bundle physical external package root",
        )
        channel = root["channel"]
        cheng_framed_physical_text(
            channel,
            "source bundle physical external channel",
            allow_empty=True,
        )
        if channel and not SHA_RE.fullmatch(channel):
            raise ValidationError(
                "source bundle physical external channel is not canonical"
            )
        external_roots.append(root)
    external_order = [
        (
            root["canonical_package_id"].encode("utf-8"),
            root["package_root"].encode("utf-8"),
            root["channel"].encode("utf-8"),
            root["package_id"].encode("utf-8"),
        )
        for root in external_roots
    ]
    if (
        external_order != sorted(external_order)
        or len(external_order) != len(set(external_order))
    ):
        raise ValidationError(
            "source bundle physical external roots are not strictly canonical"
        )
    observed_external_roots = tuple(
        (
            root["package_id"],
            root["canonical_package_id"],
            root["package_root"],
            root["channel"],
        )
        for root in external_roots
    )
    if observed_external_roots != CURRENT_EXTERNAL_PACKAGE_ROOTS:
        raise ValidationError(
            "source bundle physical external roots differ from current authority"
        )

    physical_counts = (
        uint(
            rows.get(identity_count_key, ""),
            "source bundle physical identity path count",
        ),
        uint(
            rows.get(closure_count_key, ""),
            "source bundle physical closure path count",
        ),
        uint(
            rows.get(owner_count_key, ""),
            "source bundle physical owner path count",
        ),
    )
    if physical_counts != (source_count, source_count, source_count):
        raise ValidationError(
            "source bundle physical identity/closure/owner counts mismatch"
        )
    if uint(
        rows.get(import_count_key, ""),
        "source bundle physical import edge count",
    ) != import_count:
        raise ValidationError("source bundle physical import count mismatch")

    identity_paths: list[str] = []
    closure_paths: list[str] = []
    owner_paths: list[str] = []
    expected_keys.append(identity_count_key)
    for index in range(source_count):
        identity_key = f"{prefix}identity_path.{index}"
        expected_keys.append(identity_key)
        identity_paths.append(rows.get(identity_key, ""))
    expected_keys.append(closure_count_key)
    for index in range(source_count):
        closure_key = f"{prefix}source_closure_path.{index}_fshex"
        expected_keys.append(closure_key)
        closure_paths.append(canonical_absolute_path(
            decode_lower_fshex_text(
                rows.get(closure_key, ""),
                "source bundle physical closure path",
            ),
            "source bundle physical closure path",
        ))
    expected_keys.append(owner_count_key)
    for index in range(source_count):
        owner_key = f"{prefix}owner_module_path.{index}"
        expected_keys.append(owner_key)
        owner_paths.append(rows.get(owner_key, ""))
    for index in range(source_count):
        identity_path = identity_paths[index]
        closure_path = closure_paths[index]
        owner_path = owner_paths[index]
        if identity_path.startswith("/"):
            canonical_absolute_path(
                identity_path, "source bundle physical identity path",
            )
        else:
            validate_portable_path(
                identity_path, "source bundle physical identity path",
            )
        if owner_path.startswith("/"):
            canonical_absolute_path(
                owner_path, "source bundle physical owner path",
            )
        else:
            validate_portable_path(
                owner_path, "source bundle physical owner path",
            )
        expected_owner = source_bundle_binding_physical_module_path(
            closure_path,
            rows.get("source_identity_receipt_source_package_id", ""),
            package_root,
            external_roots,
        )
        if identity_path != owner_path or owner_path != expected_owner:
            raise ValidationError(
                "source bundle physical identity/closure/owner row mismatch"
            )
    if (
        len(identity_paths) != len(set(identity_paths))
        or len(closure_paths) != len(set(closure_paths))
        or len(owner_paths) != len(set(owner_paths))
    ):
        raise ValidationError(
            "source bundle physical identity/closure/owner row duplicated"
        )
    entry_module_path = rows.get(
        "source_identity_receipt_entry_module_path", "",
    )
    if (
        identity_paths[entry_index] != entry_module_path
        or owner_paths[entry_index] != entry_module_path
    ):
        raise ValidationError("source bundle physical entry owner mismatch")

    edges: list[dict[str, Any]] = []
    expected_keys.append(import_count_key)
    for index in range(import_count):
        edge_prefix = f"{prefix}import_edge.{index}"
        edge_keys = {
            field: f"{edge_prefix}.{field}"
            for field in SOURCE_BUNDLE_BINDING_PHYSICAL_EDGE_FIELDS
        }
        edge_keys["target_source_path"] = (
            f"{edge_prefix}.target_source_path_fshex"
        )
        expected_keys.extend(edge_keys.values())
        text_fields = (
            "owner_module_path", "target_module_path",
            "import_alias", "qualifier",
        )
        edge: dict[str, Any] = {
            field: rows.get(edge_keys[field], "") for field in text_fields
        }
        edge["target_source_path"] = decode_lower_fshex_text(
            rows.get(edge_keys["target_source_path"], ""),
            "source bundle physical import target source path",
        )
        for field in text_fields:
            cheng_framed_physical_text(
                edge[field],
                f"source bundle physical import {field}",
                allow_empty=field == "import_alias",
            )
        canonical_absolute_path(
            edge["target_source_path"],
            "source bundle physical import target source path",
        )
        if edge["owner_module_path"] not in owner_paths:
            raise ValidationError(
                "source bundle physical import owner is outside closure"
            )
        try:
            target_index = closure_paths.index(edge["target_source_path"])
        except ValueError as exc:
            raise ValidationError(
                "source bundle physical import target is outside closure"
            ) from exc
        if edge["target_module_path"] != owner_paths[target_index]:
            raise ValidationError(
                "source bundle physical import target identity mismatch"
            )
        target_raw = edge["target_source_path"].encode("utf-8")
        derived_unsigned = {
            "target_source_path_len": len(target_raw),
            "target_source_path_first_code": target_raw[0],
            "target_source_path_last_code": target_raw[-1],
            "target_source_path_dot_count": target_raw.count(b"."),
        }
        for field, expected_value in derived_unsigned.items():
            actual_value = uint(
                rows.get(edge_keys[field], ""),
                f"source bundle physical import {field}",
            )
            if actual_value > 0x7FFF_FFFF or actual_value != expected_value:
                raise ValidationError(
                    f"source bundle physical import {field} mismatch"
                )
            edge[field] = actual_value
        edge["target_source_path_hash"] = int(
            rows.get(edge_keys["target_source_path_hash"], "")
        ) if INT_RE.fullmatch(
            rows.get(edge_keys["target_source_path_hash"], "")
        ) else None
        if (
            edge["target_source_path_hash"] is None
            or int32_bit_pattern(
                rows[edge_keys["target_source_path_hash"]],
                "source bundle physical import path hash",
            ) != (
                parser_text_lookup_content_hash(
                    edge["target_source_path"],
                ) & 0xFFFF_FFFF
            )
        ):
            raise ValidationError(
                "source bundle physical import path hash mismatch"
            )
        if int32_bit_pattern(
            rows.get(edge_keys["target_profile_index"], ""),
            "source bundle physical import target profile index",
        ) != 0xFFFF_FFFF:
            raise ValidationError(
                "source bundle physical import target profile is not -1"
            )
        edge["target_profile_index"] = -1
        for field in ("allows_unqualified_call", "resolved"):
            value = rows.get(edge_keys[field], "")
            if value not in ("0", "1"):
                raise ValidationError(
                    f"source bundle physical import {field} is not bool"
                )
            edge[field] = int(value)
        if edge["resolved"] != 1:
            raise ValidationError(
                "source bundle physical import contains unresolved edge"
            )
        expected_qualifier = parser_ident_prefix(edge["import_alias"])
        if not expected_qualifier:
            expected_qualifier = (
                edge["target_source_path"].rsplit("/", 1)[-1]
                .rsplit(".", 1)[0]
            )
            if not expected_qualifier:
                expected_qualifier = edge["target_module_path"].rsplit("/", 1)[-1]
        if (
            edge["qualifier"] != expected_qualifier
            or edge["allows_unqualified_call"] != int(
                edge["import_alias"] == ""
            )
        ):
            raise ValidationError(
                "source bundle physical import qualifier/call flag mismatch"
            )
        edges.append(edge)

    observed_physical_keys = {
        key for key in rows if key.startswith(prefix)
    }
    expected_physical_keys = set(expected_keys)
    if observed_physical_keys != expected_physical_keys:
        missing = sorted(expected_physical_keys - observed_physical_keys)
        extra = sorted(observed_physical_keys - expected_physical_keys)
        detail = missing[0] if missing else extra[0]
        raise ValidationError(
            f"source bundle physical columns are not exact: {detail}"
        )
    expected_import_graph_cid = source_bundle_binding_import_graph_cid(
        rows.get("source_identity_receipt_source_package_id", ""),
        edges,
        unresolved_count,
    )
    if (
        rows.get("source_identity_receipt_import_graph_cid", "")
        != expected_import_graph_cid
    ):
        raise ValidationError(
            "source bundle physical import graph CID mismatch"
        )

    payload = bytearray()
    payload.extend(cheng_framed_physical_text(
        rows[domain_key], "source bundle physical domain",
    ))
    payload.extend(cheng_framed_physical_text(
        rows.get("source_identity_receipt_source_package_id", ""),
        "source bundle physical package id",
    ))
    payload.extend(cheng_framed_physical_text(
        workspace_root, "source bundle physical workspace root",
    ))
    payload.extend(cheng_framed_physical_text(
        package_root, "source bundle physical package root",
    ))
    payload.extend(cheng_framed_u32(
        external_count, "source bundle physical external root count",
    ))
    for root in external_roots:
        for field in (
            "package_id", "canonical_package_id", "package_root", "channel",
        ):
            payload.extend(cheng_framed_physical_text(
                root[field],
                f"source bundle physical external {field}",
                allow_empty=field == "channel",
            ))
    payload.extend(cheng_framed_u32(
        entry_index, "source bundle physical entry index",
    ))
    for key, label in (
        ("source_bundle_cid", "source bundle physical source bundle CID"),
        ("entry_source_cid", "source bundle physical entry source CID"),
        (
            "source_identity_receipt_import_graph_cid",
            "source bundle physical import graph CID",
        ),
    ):
        payload.extend(cheng_framed_fixed32(rows.get(key, ""), label))
    for values, label in (
        (identity_paths, "source bundle physical identity path"),
        (closure_paths, "source bundle physical closure path"),
        (owner_paths, "source bundle physical owner path"),
    ):
        payload.extend(cheng_framed_u32(len(values), f"{label} count"))
        for value in values:
            payload.extend(cheng_framed_physical_text(value, label))
    payload.extend(cheng_framed_u32(
        len(edges), "source bundle physical import edge count",
    ))
    for edge_index, edge in enumerate(edges):
        for field in (
            "owner_module_path", "target_module_path", "target_source_path",
        ):
            payload.extend(cheng_framed_physical_text(
                edge[field], f"source bundle physical import {field}",
            ))
        for field in (
            "target_source_path_len", "target_source_path_first_code",
            "target_source_path_last_code",
            "target_source_path_dot_count", "target_source_path_hash",
            "target_profile_index",
        ):
            payload.extend(cheng_framed_u32(
                int32_bit_pattern(
                    rows[
                        f"{prefix}import_edge.{edge_index}.{field}"
                    ],
                    f"source bundle physical import {field}",
                ),
                f"source bundle physical import {field}",
            ))
        payload.extend(cheng_framed_physical_text(
            edge["import_alias"],
            "source bundle physical import alias",
            allow_empty=True,
        ))
        payload.extend(cheng_framed_physical_text(
            edge["qualifier"], "source bundle physical import qualifier",
        ))
        payload.extend(cheng_framed_u32(
            edge["allows_unqualified_call"],
            "source bundle physical import unqualified-call flag",
        ))
        payload.extend(cheng_framed_u32(
            edge["resolved"], "source bundle physical import resolved flag",
        ))
    payload.extend(cheng_framed_u32(
        unresolved_count, "source bundle physical unresolved count",
    ))
    return sha256_bytes(bytes(payload)), expected_keys


def compile_receipt_providers_from_report(rows: dict[str, str]) -> list[str]:
    provider_count = uint(
        rows.get("compile_receipt_runtime_provider_count", ""),
        "compile receipt provider count",
    )
    if provider_count > len(rows):
        raise ValidationError("compile receipt provider count exceeds report rows")
    providers: list[str] = []
    for index in range(provider_count):
        key = f"compile_receipt_runtime_provider.{index}"
        if key not in rows:
            raise ValidationError(f"compile receipt provider missing: {key}")
        providers.append(rows[key])
    unexpected = sorted(
        key for key in rows
        if key.startswith("compile_receipt_runtime_provider.")
        and key not in {f"compile_receipt_runtime_provider.{index}" for index in range(provider_count)}
    )
    if unexpected:
        raise ValidationError(f"compile receipt provider outside declared set: {unexpected[0]}")
    if (providers != sorted(providers, key=lambda value: value.encode("utf-8")) or
            len(providers) != len(set(providers))):
        raise ValidationError("compile receipt provider set is not strictly canonical")
    for provider in providers:
        cheng_framed_text(provider, "compile receipt provider")
    return providers


def semantic_text_cid(domain: str, value: str, label: str) -> str:
    return sha256_bytes(b"".join((
        cheng_framed_text(domain, f"{label} domain"),
        cheng_framed_text(value, label),
    )))


def ordered_provider_set_cid(providers: Sequence[str]) -> str:
    canonical = list(providers)
    if (canonical != sorted(canonical, key=lambda value: value.encode("utf-8")) or
            len(canonical) != len(set(canonical))):
        raise ValidationError("semantic provider set is not strictly canonical")
    payload = b"".join((
        cheng_framed_text(
            "cheng.system_link_exec.ordered_provider_set",
            "ordered provider set domain",
        ),
        cheng_framed_u32(len(canonical), "ordered provider set count"),
        *(cheng_framed_text(provider, "semantic provider") for provider in canonical),
    ))
    return sha256_bytes(payload)


def compile_semantic_receipt_cid_from_report(rows: dict[str, str]) -> str:
    providers = compile_receipt_providers_from_report(rows)
    target_cid = semantic_text_cid(
        "cheng.compiler.target_triple",
        rows.get("compile_receipt_target", ""),
        "semantic target triple",
    )
    stage_cid = semantic_text_cid(
        "cheng.compiler.bootstrap_stage",
        rows.get("compile_receipt_bootstrap_stage", ""),
        "semantic bootstrap stage",
    )
    provider_set_cid = ordered_provider_set_cid(providers)
    payload = b"".join((
        cheng_framed_text(
            "cheng.system_link_exec.compile_semantic_receipt",
            "compile semantic receipt domain",
        ),
        cheng_framed_fixed32(
            rows.get("source_identity_receipt_cid", ""),
            "semantic source identity",
        ),
        cheng_framed_fixed32(
            rows.get("canonical_compiler_csg_cid", ""),
            "semantic canonical CSG",
        ),
        cheng_framed_fixed32(
            rows.get("compile_receipt_canonical_output_digest", ""),
            "semantic canonical output",
        ),
        cheng_framed_fixed32(target_cid, "semantic target identity"),
        cheng_framed_fixed32(stage_cid, "semantic stage identity"),
        cheng_framed_fixed32(provider_set_cid, "semantic provider set identity"),
    ))
    return sha256_bytes(payload)


def portable_source_identity_receipt_cid_from_report(rows: dict[str, str]) -> str:
    source_snapshot_count = uint(
        rows.get("source_identity_receipt_source_snapshot_count", ""),
        "source identity snapshot count",
    )
    import_edge_count = uint(
        rows.get("source_identity_receipt_import_edge_count", ""),
        "source identity import edge count",
    )
    unresolved_import_count = uint(
        rows.get("source_identity_receipt_unresolved_import_count", ""),
        "source identity unresolved import count",
    )
    if (source_snapshot_count <= 0 or import_edge_count > 0x7FFF_FFFF or
            source_snapshot_count > 0x7FFF_FFFF or unresolved_import_count != 0):
        raise ValidationError("source identity receipt counts are invalid")
    payload = b"".join((
        cheng_framed_text(
            "cheng.compiler.portable_source_identity_receipt",
            "source identity receipt domain",
        ),
        cheng_framed_u32(source_snapshot_count, "source identity snapshot count"),
        cheng_framed_u32(import_edge_count, "source identity import edge count"),
        cheng_framed_u32(
            unresolved_import_count,
            "source identity unresolved import count",
        ),
        cheng_framed_fixed32(
            rows.get("source_identity_receipt_source_package_id_cid", ""),
            "source identity package id",
        ),
        cheng_framed_fixed32(
            rows.get("source_identity_receipt_entry_module_path_cid", ""),
            "source identity entry module path",
        ),
        cheng_framed_fixed32(
            rows.get("source_bundle_cid", ""),
            "source identity source bundle",
        ),
        cheng_framed_fixed32(
            rows.get("entry_source_cid", ""),
            "source identity entry source",
        ),
        cheng_framed_fixed32(
            rows.get("source_identity_receipt_import_graph_cid", ""),
            "source identity import graph",
        ),
    ))
    return sha256_bytes(payload)


def source_bundle_entry_identity_seal_from_report(rows: dict[str, str]) -> str:
    payload = b"".join((
        cheng_framed_text(
            "cheng.system_link_exec.source_bundle_entry_identity",
            "source bundle entry identity domain",
        ),
        cheng_framed_text(
            rows.get("source_identity_receipt_source_package_id", ""),
            "source bundle package id",
        ),
        cheng_framed_text(
            rows.get("source_identity_receipt_entry_module_path", ""),
            "source bundle entry module path",
        ),
        cheng_framed_fixed32(
            rows.get("source_bundle_cid", ""), "source bundle CID",
        ),
        cheng_framed_fixed32(
            rows.get("source_bundle_binding_seal", ""),
            "source bundle physical binding",
        ),
    ))
    return sha256_bytes(payload)


def source_bundle_receipt_seal_from_report(rows: dict[str, str]) -> str:
    source_count = uint(
        rows.get("source_identity_receipt_source_snapshot_count", ""),
        "source bundle receipt source count",
    )
    import_count = uint(
        rows.get("source_identity_receipt_import_edge_count", ""),
        "source bundle receipt import count",
    )
    unresolved_count = uint(
        rows.get("source_identity_receipt_unresolved_import_count", ""),
        "source bundle receipt unresolved count",
    )
    entry_index = uint(
        rows.get("source_bundle_entry_source_index", ""),
        "source bundle receipt entry index",
    )
    if source_count <= 0 or entry_index >= source_count:
        raise ValidationError("source bundle receipt entry/count shape mismatch")
    payload = b"".join((
        cheng_framed_text(
            "cheng.system_link_exec.source_bundle_receipt",
            "source bundle receipt domain",
        ),
        cheng_framed_u32(entry_index, "source bundle receipt entry index"),
        cheng_framed_fixed32(
            rows.get("source_identity_receipt_source_package_id_cid", ""),
            "source bundle receipt package CID",
        ),
        cheng_framed_fixed32(
            rows.get("source_identity_receipt_entry_module_path_cid", ""),
            "source bundle receipt module CID",
        ),
        cheng_framed_fixed32(
            rows.get("source_bundle_cid", ""),
            "source bundle receipt source bundle CID",
        ),
        cheng_framed_fixed32(
            rows.get("entry_source_cid", ""),
            "source bundle receipt entry source CID",
        ),
        cheng_framed_fixed32(
            rows.get("source_identity_receipt_import_graph_cid", ""),
            "source bundle receipt import graph CID",
        ),
        cheng_framed_fixed32(
            rows.get("source_identity_receipt_cid", ""),
            "source bundle receipt portable source CID",
        ),
        cheng_framed_fixed32(
            rows.get("source_bundle_binding_seal", ""),
            "source bundle receipt physical binding",
        ),
        cheng_framed_fixed32(
            rows.get("source_bundle_entry_identity_seal", ""),
            "source bundle receipt entry identity",
        ),
        cheng_framed_u32(source_count, "source bundle receipt closure count"),
        cheng_framed_u32(source_count, "source bundle receipt identity count"),
        cheng_framed_u32(source_count, "source bundle receipt owner count"),
        cheng_framed_u32(import_count, "source bundle receipt import count"),
        cheng_framed_u32(
            unresolved_count, "source bundle receipt unresolved count",
        ),
    ))
    return sha256_bytes(payload)


def compile_receipt_cid_from_report(rows: dict[str, str]) -> str:
    providers = compile_receipt_providers_from_report(rows)
    provider_count = len(providers)
    payload = b"".join((
        cheng_framed_text("cheng.compiler.compile_receipt", "compile receipt domain"),
        cheng_framed_fixed32(rows.get("compile_receipt_world_head_cid", ""), "compile receipt world head"),
        cheng_framed_fixed32(rows.get("compile_receipt_source_identity_receipt_cid", ""), "compile receipt source identity"),
        cheng_framed_fixed32(rows.get("compile_receipt_semantic_receipt_cid", ""), "compile receipt semantic identity"),
        cheng_framed_fixed32(rows.get("compile_receipt_output_digest", ""), "compile receipt output"),
        cheng_framed_fixed32(rows.get("compile_receipt_canonical_output_digest", ""), "compile receipt canonical output"),
        cheng_framed_text(rows.get("compile_receipt_target", ""), "compile receipt target"),
        cheng_framed_text(rows.get("compile_receipt_bootstrap_stage", ""), "compile receipt stage"),
        cheng_framed_u32(provider_count, "compile receipt provider count"),
        *(cheng_framed_text(provider, "compile receipt provider") for provider in providers),
    ))
    return sha256_bytes(payload)


def compiler_output_receipt_cid_from_report(rows: dict[str, str]) -> str:
    payload = b"".join((
        cheng_framed_text(
            "cheng.compiler.output_receipt", "compiler output receipt domain",
        ),
        cheng_framed_fixed32(
            rows.get("compile_receipt_cid", ""),
            "compiler output compile receipt",
        ),
        cheng_framed_fixed32(
            rows.get("output_sha256", ""), "compiler output raw bytes",
        ),
        cheng_framed_fixed32(
            rows.get("backend2_version_manifest_sha256", ""),
            "compiler output backend2 manifest",
        ),
        cheng_framed_text(
            rows.get("compile_receipt_target", ""),
            "compiler output target",
        ),
        cheng_framed_text("unelaborated", "compiler output entry mode"),
        cheng_framed_text(
            "full_backend_codegen=1", "compiler output backend claim",
        ),
        cheng_framed_text(
            "cold_system_link_exec=0", "compiler output cold claim",
        ),
        cheng_framed_text(
            "system_link_exec_scope=selfhost_direct",
            "compiler output scope claim",
        ),
    ))
    return sha256_bytes(payload)


def source_to_csg_binding_seal_from_report(rows: dict[str, str]) -> str:
    payload = b"".join((
        cheng_framed_text(
            "cheng.system_link_exec.source_to_csg_binding",
            "source-to-CSG binding domain",
        ),
        cheng_framed_fixed32(
            rows.get("source_identity_receipt_cid", ""),
            "source-to-CSG source identity",
        ),
        cheng_framed_fixed32(
            rows.get("canonical_compiler_csg_cid", ""),
            "source-to-CSG canonical CSG",
        ),
        cheng_framed_fixed32(
            rows.get("semantic_receipt_cid", ""),
            "source-to-CSG semantic receipt",
        ),
    ))
    return sha256_bytes(payload)


def framed_closure(domain: bytes, entries: Sequence[dict[str, Any]]) -> str:
    digest = hashlib.sha256()
    digest.update(struct.pack(">Q", len(domain)))
    digest.update(domain)
    digest.update(struct.pack(">Q", len(entries)))
    for entry in entries:
        path_raw = entry["path"].encode("utf-8")
        digest_raw = bytes.fromhex(entry["sha256"])
        digest.update(struct.pack(">Q", len(path_raw)))
        digest.update(path_raw)
        digest.update(struct.pack(">Q", entry["size"]))
        digest.update(struct.pack(">Q", len(digest_raw)))
        digest.update(digest_raw)
    return digest.hexdigest()


def strict_json(raw: bytes, label: str) -> Any:
    def pairs_hook(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        out: dict[str, Any] = {}
        for key, value in pairs:
            if key in out:
                raise ValidationError(f"{label} duplicate JSON key: {key}")
            out[key] = value
        return out

    try:
        return json.loads(raw, object_pairs_hook=pairs_hook)
    except ValidationError:
        raise
    except Exception as exc:
        raise ValidationError(f"{label} is not JSON: {exc}") from exc


def exact_file(path: Path, *, max_size: int | None = None) -> bytes:
    flags = os.O_RDONLY
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(path, flags)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise ValidationError(f"not a single-link regular file: {path}")
        if max_size is not None and info.st_size > max_size:
            raise ValidationError(f"file exceeds exact byte bound: {path}")
        chunks: list[bytes] = []
        remaining = info.st_size
        while remaining:
            chunk = os.read(fd, min(1024 * 1024, remaining))
            if not chunk:
                raise ValidationError(f"short read: {path}")
            chunks.append(chunk)
            remaining -= len(chunk)
        if os.read(fd, 1):
            raise ValidationError(f"file grew during read: {path}")
        after = os.fstat(fd)
        identity = (
            "st_dev", "st_ino", "st_mode", "st_nlink", "st_size",
            "st_mtime_ns", "st_ctime_ns",
        )
        if any(getattr(info, field) != getattr(after, field) for field in identity):
            raise ValidationError(f"file changed during read: {path}")
        return b"".join(chunks)
    finally:
        os.close(fd)


def validate_portable_path(value: str, label: str) -> None:
    if (not value or value.startswith("/") or value.startswith("./") or
            "\\" in value or unicodedata.normalize("NFC", value) != value or
            any(part in ("", ".", "..") for part in value.split("/")) or
            any(ord(ch) < 32 or ord(ch) == 127 for ch in value)):
        raise ValidationError(f"{label} is not a canonical portable path: {value!r}")


def validate_manifest_shape(manifest: dict[str, Any]) -> None:
    expected = {
        "schema", "sourceEntryCount", "sourceClosureSha256", "sourceEntries",
        "toolEntryCount", "toolClosureSha256", "toolEntries",
    }
    if set(manifest) != expected or manifest.get("schema") != CLOSURE_SCHEMA:
        raise ValidationError("source/tool manifest shape mismatch")
    all_paths: list[str] = []
    for list_key, count_key, cid_key, domain in (
        ("sourceEntries", "sourceEntryCount", "sourceClosureSha256", SOURCE_DOMAIN),
        ("toolEntries", "toolEntryCount", "toolClosureSha256", TOOL_DOMAIN),
    ):
        entries = manifest.get(list_key)
        count = manifest.get(count_key)
        cid = manifest.get(cid_key)
        if (not isinstance(entries, list) or not isinstance(count, int) or
                isinstance(count, bool) or count != len(entries) or
                not isinstance(cid, str) or not SHA_RE.fullmatch(cid)):
            raise ValidationError(f"source/tool manifest column mismatch: {list_key}")
        paths: list[str] = []
        for entry in entries:
            if not isinstance(entry, dict) or set(entry) != {"path", "size", "sha256"}:
                raise ValidationError(f"source/tool manifest entry shape mismatch: {list_key}")
            path = entry.get("path")
            size = entry.get("size")
            digest = entry.get("sha256")
            if not isinstance(path, str):
                raise ValidationError("source/tool manifest path is not text")
            validate_portable_path(path, "source/tool manifest path")
            if (not isinstance(size, int) or isinstance(size, bool) or size < 0 or
                    not isinstance(digest, str) or not SHA_RE.fullmatch(digest)):
                raise ValidationError("source/tool manifest identity invalid")
            paths.append(path)
        if paths != sorted(paths, key=lambda item: item.encode("utf-8")) or len(paths) != len(set(paths)):
            raise ValidationError(f"source/tool manifest order/uniqueness mismatch: {list_key}")
        if framed_closure(domain, entries) != cid:
            raise ValidationError(f"source/tool manifest closure mismatch: {list_key}")
        all_paths.extend(paths)
    if len(all_paths) != len(set(all_paths)):
        raise ValidationError("source and tool closure paths overlap")


def parse_frozen_manifest(raw: bytes) -> dict[str, Any]:
    value = strict_json(raw, "frozen source/tool manifest")
    if not isinstance(value, dict) or raw != canonical_json(value) + b"\n":
        raise ValidationError("frozen source/tool manifest is not canonical JSON")
    validate_manifest_shape(value)
    return value


def closure_receipt_raw(manifest: dict[str, Any], manifest_raw: bytes) -> bytes:
    return (
        f"schema={CLOSURE_SCHEMA}\n"
        f"source_closure_sha256={manifest['sourceClosureSha256']}\n"
        f"source_entry_count={manifest['sourceEntryCount']}\n"
        f"tool_closure_sha256={manifest['toolClosureSha256']}\n"
        f"tool_entry_count={manifest['toolEntryCount']}\n"
        f"source_tool_manifest_sha256={sha256_bytes(manifest_raw)}\n"
    ).encode("ascii")


def uint(value: str, label: str) -> int:
    if not UINT_RE.fullmatch(value):
        raise ValidationError(f"{label} is not canonical uint")
    return int(value)


def parse_kv(raw: bytes, expected_keys: Sequence[str], label: str) -> dict[str, str]:
    if not raw.endswith(b"\n"):
        raise ValidationError(f"{label} lacks terminal newline")
    try:
        lines = raw[:-1].decode("ascii", "strict").split("\n")
    except UnicodeDecodeError as exc:
        raise ValidationError(f"{label} is not ASCII") from exc
    rows: dict[str, str] = {}
    keys: list[str] = []
    for line in lines:
        key, separator, value = line.partition("=")
        if not separator or not key or not value or key in rows:
            raise ValidationError(f"{label} malformed/duplicate row")
        rows[key] = value
        keys.append(key)
    if tuple(keys) != tuple(expected_keys):
        raise ValidationError(f"{label} key order/set mismatch")
    return rows


def split_binary_bundle(raw: bytes) -> tuple[dict[str, str], bytes, bytes, bytes]:
    if len(raw) > MAX_BUNDLE_BYTES:
        raise ValidationError("candidate bundle exceeds byte bound")
    separator = raw.find(b"\n\n")
    if separator < 0:
        raise ValidationError("candidate bundle header terminator missing")
    header = raw[:separator].split(b"\n")
    if not header or header[0] != BUNDLE_MAGIC:
        raise ValidationError("candidate bundle magic mismatch")
    expected = (
        "manifest_size", "manifest_sha256", "report_size", "report_sha256",
        "candidate_size", "candidate_sha256",
    )
    rows: dict[str, str] = {}
    if len(header) != len(expected) + 1:
        raise ValidationError("candidate bundle header field count mismatch")
    for index, key in enumerate(expected, start=1):
        prefix = f"{key}=".encode("ascii")
        if not header[index].startswith(prefix):
            raise ValidationError(f"candidate bundle header field mismatch: {key}")
        rows[key] = header[index][len(prefix):].decode("ascii", "strict")
    manifest_size = uint(rows["manifest_size"], "manifest_size")
    report_size = uint(rows["report_size"], "report_size")
    candidate_size = uint(rows["candidate_size"], "candidate_size")
    payload = raw[separator + 2:]
    if len(payload) != manifest_size + report_size + candidate_size:
        raise ValidationError("candidate bundle payload size mismatch")
    manifest_raw = payload[:manifest_size]
    report_raw = payload[manifest_size:manifest_size + report_size]
    candidate_raw = payload[manifest_size + report_size:]
    for key, item in (("manifest", manifest_raw), ("report", report_raw), ("candidate", candidate_raw)):
        expected_sha = rows[f"{key}_sha256"]
        if not SHA_RE.fullmatch(expected_sha) or sha256_bytes(item) != expected_sha:
            raise ValidationError(f"candidate bundle {key} hash mismatch")
    return rows, manifest_raw, report_raw, candidate_raw


def parse_report(raw: bytes) -> dict[str, bytes]:
    separator = raw.find(b"\n\n")
    if separator < 0:
        raise ValidationError("candidate report header terminator missing")
    lines = raw[:separator].split(b"\n")
    if not lines or lines[0] != REPORT_MAGIC or lines[1] != f"payload_count={len(REPORT_PAYLOADS)}".encode("ascii"):
        raise ValidationError("candidate report header mismatch")
    if len(lines) != 2 + len(REPORT_PAYLOADS) * 2:
        raise ValidationError("candidate report header field count mismatch")
    payload = raw[separator + 2:]
    offset = 0
    result: dict[str, bytes] = {}
    line_index = 2
    for name in REPORT_PAYLOADS:
        key = name.replace(".", "_")
        size_prefix = f"{key}_size=".encode("ascii")
        sha_prefix = f"{key}_sha256=".encode("ascii")
        if not lines[line_index].startswith(size_prefix) or not lines[line_index + 1].startswith(sha_prefix):
            raise ValidationError(f"candidate report field mismatch: {name}")
        size = uint(lines[line_index][len(size_prefix):].decode("ascii", "strict"), f"{name} size")
        expected_sha = lines[line_index + 1][len(sha_prefix):].decode("ascii", "strict")
        if not SHA_RE.fullmatch(expected_sha):
            raise ValidationError(f"candidate report hash malformed: {name}")
        item = payload[offset:offset + size]
        if len(item) != size or sha256_bytes(item) != expected_sha:
            raise ValidationError(f"candidate report payload mismatch: {name}")
        result[name] = item
        offset += size
        line_index += 2
    if offset != len(payload):
        raise ValidationError("candidate report trailing payload bytes")
    return result


def validate_candidate(candidate: bytes, elf_machine: int = 62) -> None:
    if len(candidate) < 64 or candidate[:4] != b"\x7fELF":
        raise ValidationError("candidate is not ELF")
    if (
        candidate[4] != 2
        or candidate[5] != 1
        or int.from_bytes(candidate[18:20], "little") != elf_machine
    ):
        raise ValidationError("candidate is not the exact target little-endian ELF64")


def canonical_tar_name(member: tarfile.TarInfo, label: str) -> str:
    name = member.name
    validate_portable_path(name, label)
    if Path(name).name.startswith(".wh."):
        raise ValidationError(f"{label} contains a whiteout: {name}")
    return name


def checked_tar_members(archive: tarfile.TarFile, label: str) -> tuple[list[tarfile.TarInfo], dict[str, tarfile.TarInfo]]:
    members = archive.getmembers()
    if len(members) > MAX_TAR_MEMBERS:
        raise ValidationError(f"{label} member count exceeds bound")
    by_name: dict[str, tarfile.TarInfo] = {}
    for member in members:
        name = canonical_tar_name(member, f"{label} path")
        if name in by_name:
            raise ValidationError(f"{label} contains duplicate canonical path: {name}")
        by_name[name] = member
    return members, by_name


def read_tar_regular(archive: tarfile.TarFile, member: tarfile.TarInfo, label: str, max_size: int) -> bytes:
    if not member.isfile() or member.issym() or member.islnk() or member.size < 0 or member.size > max_size:
        raise ValidationError(f"{label} is not a bounded regular member")
    handle = archive.extractfile(member)
    if handle is None:
        raise ValidationError(f"{label} is unavailable")
    raw = handle.read(max_size + 1)
    if len(raw) != member.size or len(raw) > max_size or handle.read(1):
        raise ValidationError(f"{label} size mismatch")
    return raw


def decompress_single_gzip(source_path: Path, output_path: Path) -> tuple[str, int]:
    decompressor = zlib.decompressobj(16 + zlib.MAX_WBITS)
    digest = hashlib.sha256()
    total = 0
    with source_path.open("rb") as source, output_path.open("xb") as output:
        while True:
            chunk = source.read(1024 * 1024)
            if not chunk:
                break
            pending = chunk
            while pending:
                produced = decompressor.decompress(pending, 1024 * 1024)
                pending = decompressor.unconsumed_tail
                if produced:
                    total += len(produced)
                    if total > MAX_UNCOMPRESSED_LAYER_BYTES:
                        raise ValidationError("builder image layer exceeds decompression bound")
                    digest.update(produced)
                    output.write(produced)
                if decompressor.eof:
                    if decompressor.unused_data or pending or source.read(1):
                        raise ValidationError("builder image layer has concatenated/trailing gzip bytes")
                    pending = b""
                    break
        tail = decompressor.flush()
        if tail:
            total += len(tail)
            if total > MAX_UNCOMPRESSED_LAYER_BYTES:
                raise ValidationError("builder image layer exceeds decompression bound")
            digest.update(tail)
            output.write(tail)
        if not decompressor.eof:
            raise ValidationError("builder image layer gzip stream is truncated")
        output.flush()
        os.fsync(output.fileno())
    return digest.hexdigest(), total


def validate_tar_end(layer_path: Path, members: Sequence[tarfile.TarInfo]) -> None:
    end = 0
    for member in members:
        payload_end = member.offset_data + ((member.size + 511) // 512) * 512
        end = max(end, payload_end)
    size = os.stat(layer_path, follow_symlinks=False).st_size
    if size < end + 1024 or size % 512 != 0:
        raise ValidationError("builder image layer tar terminator is not exact")
    with layer_path.open("rb") as handle:
        handle.seek(end)
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            if any(chunk):
                raise ValidationError("builder image layer has nonzero trailing tar bytes")


def validate_open_tar_end(
    handle: Any, size: int, members: Sequence[tarfile.TarInfo], label: str,
) -> None:
    end = 0
    for member in members:
        payload_end = member.offset_data + ((member.size + 511) // 512) * 512
        end = max(end, payload_end)
    if size < end + 1024 or size % 512 != 0:
        raise ValidationError(f"{label} terminator is not exact")
    handle.seek(end)
    while True:
        chunk = handle.read(1024 * 1024)
        if not chunk:
            break
        if any(chunk):
            raise ValidationError(f"{label} has nonzero trailing bytes")


def ancestor_directories(paths: Iterable[str]) -> set[str]:
    result: set[str] = set()
    for value in paths:
        parts = value.split("/")[:-1]
        for index in range(1, len(parts) + 1):
            result.add("/".join(parts[:index]))
    return result


def require_context_metadata(member: tarfile.TarInfo, *, mode: int, mtime: int = 1) -> None:
    if member.uid != 0 or member.gid != 0 or (member.mode & 0o7777) != mode or member.mtime != mtime:
        raise ValidationError(f"builder context metadata mismatch: {member.name}")


def validate_layer_context(layer_path: Path, frozen: dict[str, Any], frozen_raw: bytes) -> None:
    with tarfile.open(layer_path, mode="r:") as layer:
        members, by_name = checked_tar_members(layer, "builder image layer")
        validate_tar_end(layer_path, members)
        entry_map = {
            entry["path"]: entry
            for column in ("sourceEntries", "toolEntries")
            for entry in frozen[column]
        }
        metadata_files = {
            "cheng-current-source/source-tool-manifest.json": frozen_raw,
            "cheng-current-source/closure.kv": closure_receipt_raw(frozen, frozen_raw),
        }
        repo_files = {
            f"cheng-current-source/repo/{path}": entry
            for path, entry in entry_map.items()
        }
        artifacts_name = "cheng-current-source/repo/artifacts"
        expected_leafs = set(metadata_files) | set(repo_files) | {artifacts_name}
        expected_dirs = ancestor_directories(expected_leafs)
        expected_names = expected_leafs | expected_dirs
        if set(by_name) != expected_names:
            extra = sorted(set(by_name) - expected_names)
            missing = sorted(expected_names - set(by_name))
            raise ValidationError(f"builder context exact-set mismatch extra={extra[:3]} missing={missing[:3]}")
        for name in expected_dirs:
            member = by_name[name]
            if not member.isdir() or member.size != 0:
                raise ValidationError(f"builder context directory type mismatch: {name}")
            require_context_metadata(member, mode=0o755)
        for name, raw in metadata_files.items():
            member = by_name[name]
            require_context_metadata(member, mode=0o644)
            if read_tar_regular(layer, member, name, len(raw)) != raw:
                raise ValidationError(f"builder context metadata bytes mismatch: {name}")
        for name, entry in repo_files.items():
            member = by_name[name]
            mode = 0o755 if name.endswith("/tools/cid_linux_current_source_candidate_workload.sh") else 0o644
            require_context_metadata(member, mode=mode)
            raw = read_tar_regular(layer, member, name, entry["size"])
            if len(raw) != entry["size"] or sha256_bytes(raw) != entry["sha256"]:
                raise ValidationError(f"builder image closure member identity mismatch: {name}")
        artifacts = by_name[artifacts_name]
        if (not artifacts.issym() or
                artifacts.linkname != "/cheng-hardcap-work/artifacts" or
                artifacts.size != 0):
            raise ValidationError("builder image artifacts link mismatch")
        require_context_metadata(artifacts, mode=0o777)


def _validate_docker_save_oci_archive(
    image_archive: Path,
    *,
    expected_image_id: str | None,
    frozen: dict[str, Any] | None,
    frozen_raw: bytes | None,
    expected_architecture: str = "amd64",
) -> dict[str, Any]:
    flags = os.O_RDONLY
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    archive_fd = os.open(image_archive, flags)
    try:
        archive_handle = os.fdopen(archive_fd, "rb", closefd=False)
    except BaseException:
        os.close(archive_fd)
        raise
    archive_info = os.fstat(archive_fd)
    if (not stat.S_ISREG(archive_info.st_mode) or archive_info.st_nlink != 1 or
            archive_info.st_size <= 0 or archive_info.st_size > MAX_IMAGE_ARCHIVE_BYTES):
        archive_handle.close()
        os.close(archive_fd)
        raise ValidationError("builder image archive identity/size invalid")
    try:
        archive_digest = hashlib.sha256()
        while True:
            chunk = archive_handle.read(1024 * 1024)
            if not chunk:
                break
            archive_digest.update(chunk)
        archive_handle.seek(0)
        temp = tempfile.TemporaryDirectory(prefix="cheng-cid-linux-image-layer-")
    except BaseException:
        archive_handle.close()
        os.close(archive_fd)
        raise
    try:
        with tarfile.open(fileobj=archive_handle, mode="r:") as archive:
            members, by_name = checked_tar_members(archive, "builder image archive")
            validate_open_tar_end(
                archive_handle, archive_info.st_size, members,
                "builder image archive",
            )
            for member in by_name.values():
                if not (member.isfile() or member.isdir()):
                    raise ValidationError(f"builder image archive member type invalid: {member.name}")
            index_member = by_name.get("index.json")
            legacy_member = by_name.get("manifest.json")
            layout_member = by_name.get("oci-layout")
            if index_member is None or legacy_member is None or layout_member is None:
                raise ValidationError("builder image index/legacy/layout metadata missing")
            index_raw = read_tar_regular(archive, index_member, "builder image index", 16 * 1024 * 1024)
            legacy_raw = read_tar_regular(archive, legacy_member, "builder image legacy manifest", 16 * 1024 * 1024)
            layout_raw = read_tar_regular(archive, layout_member, "builder image OCI layout", 1024)
            if layout_raw != b'{"imageLayoutVersion":"1.0.0"}':
                raise ValidationError("builder image OCI layout bytes mismatch")
            index = strict_json(index_raw, "builder image index")
            legacy = strict_json(legacy_raw, "builder image legacy manifest")
            descriptors = index.get("manifests") if isinstance(index, dict) else None
            if (set(index) != {"schemaVersion", "mediaType", "manifests"} or
                    index.get("schemaVersion") != 2 or
                    index.get("mediaType") != "application/vnd.oci.image.index.v1+json" or
                    not isinstance(descriptors, list) or len(descriptors) != 1 or
                    not isinstance(descriptors[0], dict) or
                    not isinstance(legacy, list) or len(legacy) != 1 or
                    not isinstance(legacy[0], dict) or
                    set(legacy[0]) != {"Config", "RepoTags", "Layers"} or
                    legacy[0].get("RepoTags") is not None):
                raise ValidationError("builder image index shape mismatch")
            top_descriptor = descriptors[0]
            top_allowed = {"mediaType", "digest", "size", "annotations"}
            if (not {"mediaType", "digest", "size"}.issubset(top_descriptor) or
                    not set(top_descriptor).issubset(top_allowed)):
                raise ValidationError("builder image top descriptor shape invalid")
            top_media_type = top_descriptor.get("mediaType")
            top_digest = top_descriptor.get("digest")
            top_size = top_descriptor.get("size")
            if (top_media_type not in (
                    "application/vnd.oci.image.index.v1+json",
                    "application/vnd.oci.image.manifest.v1+json",
                ) or not isinstance(top_digest, str) or
                    not IMAGE_RE.fullmatch(top_digest) or
                    not isinstance(top_size, int) or isinstance(top_size, bool) or
                    top_size <= 0 or top_size > 16 * 1024 * 1024):
                raise ValidationError("builder image top descriptor invalid")
            if expected_image_id is not None and top_digest != expected_image_id:
                raise ValidationError("builder image Docker image identity mismatch")

            def descriptor_blob(
                descriptor: dict[str, Any], label: str, max_size: int,
                allowed_keys: set[str], allowed_media_types: set[str] | None = None,
            ) -> tuple[str, bytes]:
                if (not {"mediaType", "digest", "size"}.issubset(descriptor) or
                        not set(descriptor).issubset(allowed_keys)):
                    raise ValidationError(f"{label} descriptor shape invalid")
                media_type = descriptor.get("mediaType")
                digest = descriptor.get("digest")
                size = descriptor.get("size")
                if (not isinstance(media_type, str) or not media_type or
                        (allowed_media_types is not None and
                         media_type not in allowed_media_types) or
                        not isinstance(digest, str) or not IMAGE_RE.fullmatch(digest) or
                        not isinstance(size, int) or isinstance(size, bool) or
                        size < 0 or size > max_size):
                    raise ValidationError(f"{label} descriptor invalid")
                name = f"blobs/sha256/{digest.split(':', 1)[1]}"
                member = by_name.get(name)
                if member is None:
                    raise ValidationError(f"{label} blob missing")
                raw = read_tar_regular(archive, member, label, max_size)
                if len(raw) != size or digest != f"sha256:{sha256_bytes(raw)}":
                    raise ValidationError(f"{label} descriptor/raw mismatch")
                return name, raw

            top_name, top_raw = descriptor_blob(
                top_descriptor,
                "builder image top OCI object",
                16 * 1024 * 1024,
                top_allowed,
                {
                    "application/vnd.oci.image.index.v1+json",
                    "application/vnd.oci.image.manifest.v1+json",
                },
            )
            auxiliary_names: set[str] = set()
            if top_media_type == "application/vnd.oci.image.manifest.v1+json":
                selected_descriptor = top_descriptor
                manifest_raw = top_raw
                manifest_name = top_name
            else:
                top_index = strict_json(top_raw, "builder image saved source index")
                top_manifests = top_index.get("manifests") if isinstance(top_index, dict) else None
                if (not isinstance(top_index, dict) or
                        set(top_index) != {"schemaVersion", "mediaType", "manifests"} or
                        top_index.get("schemaVersion") != 2 or
                        top_index.get("mediaType") !=
                            "application/vnd.oci.image.index.v1+json" or
                        not isinstance(top_manifests, list) or not top_manifests):
                    raise ValidationError("builder image saved source index shape invalid")
                selected: list[dict[str, Any]] = []
                present_auxiliary: list[dict[str, Any]] = []
                for nested in top_manifests:
                    if not isinstance(nested, dict):
                        raise ValidationError("builder image nested descriptor is not an object")
                    nested_digest = nested.get("digest")
                    nested_name = (
                        f"blobs/sha256/{nested_digest.split(':', 1)[1]}"
                        if isinstance(nested_digest, str) and IMAGE_RE.fullmatch(nested_digest)
                        else ""
                    )
                    if not nested_name or nested_name not in by_name:
                        continue
                    platform = nested.get("platform")
                    annotations = nested.get("annotations")
                    if (nested.get("mediaType") ==
                            "application/vnd.oci.image.manifest.v1+json" and
                            isinstance(platform, dict) and
                            platform == {
                                "architecture": expected_architecture,
                                "os": "linux",
                            } and
                            not (isinstance(annotations, dict) and
                                 annotations.get("vnd.docker.reference.type") ==
                                     "attestation-manifest")):
                        selected.append(nested)
                    else:
                        present_auxiliary.append(nested)
                if len(selected) != 1:
                    raise ValidationError(
                        "builder image saved index does not select exactly one "
                        + expected_architecture
                        + "/Linux manifest"
                    )
                selected_descriptor = selected[0]
                manifest_name, manifest_raw = descriptor_blob(
                    selected_descriptor,
                    "builder image selected OCI manifest",
                    16 * 1024 * 1024,
                    {"mediaType", "digest", "size", "platform", "annotations"},
                    {"application/vnd.oci.image.manifest.v1+json"},
                )
                selected_digest = selected_descriptor["digest"]
                for auxiliary in present_auxiliary:
                    annotations = auxiliary.get("annotations")
                    platform = auxiliary.get("platform")
                    if (not isinstance(annotations, dict) or
                            annotations.get("vnd.docker.reference.type") !=
                                "attestation-manifest" or
                            annotations.get("vnd.docker.reference.digest") != selected_digest or
                            platform != {"architecture": "unknown", "os": "unknown"}):
                        raise ValidationError("builder image contains an unexpected present nested manifest")
                    auxiliary_name, auxiliary_raw = descriptor_blob(
                        auxiliary,
                        "builder image selected attestation manifest",
                        64 * 1024 * 1024,
                        {"mediaType", "digest", "size", "platform", "annotations"},
                        {"application/vnd.oci.image.manifest.v1+json"},
                    )
                    auxiliary_names.add(auxiliary_name)
                    auxiliary_manifest = strict_json(
                        auxiliary_raw, "builder image selected attestation manifest"
                    )
                    if (not isinstance(auxiliary_manifest, dict) or
                            set(auxiliary_manifest) !=
                                {"schemaVersion", "mediaType", "config", "layers"} or
                            auxiliary_manifest.get("schemaVersion") != 2 or
                            auxiliary_manifest.get("mediaType") !=
                                "application/vnd.oci.image.manifest.v1+json" or
                            not isinstance(auxiliary_manifest.get("config"), dict) or
                            not isinstance(auxiliary_manifest.get("layers"), list)):
                        raise ValidationError("builder image selected attestation shape invalid")
                    attestation_descriptors = [
                        auxiliary_manifest["config"],
                        *auxiliary_manifest["layers"],
                    ]
                    for auxiliary_index, auxiliary_child in enumerate(attestation_descriptors):
                        if not isinstance(auxiliary_child, dict):
                            raise ValidationError("builder image attestation child descriptor invalid")
                        child_name, _child_raw = descriptor_blob(
                            auxiliary_child,
                            f"builder image attestation child index={auxiliary_index}",
                            MAX_COMPRESSED_LAYER_BYTES,
                            {"mediaType", "digest", "size", "annotations"},
                        )
                        auxiliary_names.add(child_name)

            oci_digest = selected_descriptor.get("digest")
            if not isinstance(oci_digest, str) or not IMAGE_RE.fullmatch(oci_digest):
                raise ValidationError("builder image selected manifest digest invalid")
            manifest = strict_json(manifest_raw, "builder image OCI manifest")
            config_desc = manifest.get("config") if isinstance(manifest, dict) else None
            layers = manifest.get("layers") if isinstance(manifest, dict) else None
            if (not isinstance(manifest, dict) or
                    not {"schemaVersion", "mediaType", "config", "layers"}.issubset(manifest) or
                    not set(manifest).issubset(
                        {"schemaVersion", "mediaType", "config", "layers", "annotations"}) or
                    manifest.get("schemaVersion") != 2 or
                    manifest.get("mediaType") != "application/vnd.oci.image.manifest.v1+json" or
                    not isinstance(config_desc, dict) or not isinstance(layers, list) or
                    len(layers) <= 0 or len(layers) > MAX_IMAGE_LAYERS):
                raise ValidationError("builder image OCI manifest shape mismatch")
            config_digest = config_desc.get("digest")
            if (set(config_desc) != {"mediaType", "digest", "size"} or
                    config_desc.get("mediaType") != "application/vnd.oci.image.config.v1+json" or
                    not isinstance(config_digest, str) or not IMAGE_RE.fullmatch(config_digest) or
                    not isinstance(config_desc.get("size"), int) or
                    isinstance(config_desc.get("size"), bool)):
                raise ValidationError("builder image OCI config descriptor invalid")
            layer_digests: list[str] = []
            layer_sizes: list[int] = []
            layer_names: list[str] = []
            for layer_index, layer_desc in enumerate(layers):
                if not isinstance(layer_desc, dict):
                    raise ValidationError(
                        f"builder image layer descriptor is not an object index={layer_index}"
                    )
                layer_digest = layer_desc.get("digest")
                layer_size = layer_desc.get("size")
                if (set(layer_desc) != {"mediaType", "digest", "size"} or
                        layer_desc.get("mediaType") !=
                            "application/vnd.oci.image.layer.v1.tar+gzip" or
                        not isinstance(layer_digest, str) or
                        not IMAGE_RE.fullmatch(layer_digest) or
                        not isinstance(layer_size, int) or
                        isinstance(layer_size, bool) or layer_size <= 0 or
                        layer_size > MAX_COMPRESSED_LAYER_BYTES):
                    raise ValidationError(
                        f"builder image layer descriptor invalid index={layer_index}"
                    )
                layer_digests.append(layer_digest)
                layer_sizes.append(layer_size)
                layer_names.append(
                    f"blobs/sha256/{layer_digest.split(':', 1)[1]}"
                )
            config_name = f"blobs/sha256/{config_digest.split(':', 1)[1]}"
            expected_outer_names = {
                "blobs", "blobs/sha256", "index.json", "manifest.json",
                "oci-layout", top_name, manifest_name, config_name, *layer_names,
                *auxiliary_names,
            }
            if set(by_name) != expected_outer_names:
                extra = sorted(set(by_name) - expected_outer_names)
                missing = sorted(expected_outer_names - set(by_name))
                raise ValidationError(
                    f"builder image archive exact-set mismatch extra={extra[:3]} missing={missing[:3]}"
                )
            for directory in ("blobs", "blobs/sha256"):
                if not by_name[directory].isdir() or by_name[directory].size != 0:
                    raise ValidationError(
                        f"builder image archive directory mismatch: {directory}"
                    )
            if (legacy[0].get("Config") != config_name or
                    legacy[0].get("Layers") != layer_names):
                raise ValidationError("builder image legacy/OCI projection mismatch")
            config_member = by_name.get(config_name)
            if config_member is None:
                raise ValidationError("builder image config blob missing")
            config_raw = read_tar_regular(archive, config_member, "builder image config", 64 * 1024 * 1024)
            if len(config_raw) != config_desc["size"] or config_digest != f"sha256:{sha256_bytes(config_raw)}":
                raise ValidationError("builder image raw config descriptor mismatch")
            config = strict_json(config_raw, "builder image config")
            if not isinstance(config, dict):
                raise ValidationError("builder image config is not an object")
            rootfs = config.get("rootfs")
            diff_ids = rootfs.get("diff_ids") if isinstance(rootfs, dict) else None
            if (not isinstance(rootfs, dict) or rootfs.get("type") != "layers" or
                    set(rootfs) != {"type", "diff_ids"} or
                    not isinstance(diff_ids, list) or len(diff_ids) != len(layers) or
                    any(not isinstance(value, str) or not IMAGE_RE.fullmatch(value)
                        for value in diff_ids)):
                raise ValidationError("builder image rootfs diff-id shape mismatch")
            if (
                config.get("architecture") != expected_architecture
                or config.get("os") != "linux"
            ):
                raise ValidationError("builder image platform mismatch")
            if frozen is not None:
                run_config = config.get("config")
                if (not isinstance(run_config, dict) or
                        run_config.get("Cmd") != ["/bin/true"] or
                        run_config.get("Entrypoint") not in (None, []) or
                        run_config.get("Env") not in (None, [])):
                    raise ValidationError("builder image runtime config mismatch")
            for layer_index, (layer_desc, layer_name, expected_diff_id) in enumerate(
                zip(layers, layer_names, diff_ids)
            ):
                layer_member = by_name.get(layer_name)
                if layer_member is None or layer_member.size != layer_desc["size"]:
                    raise ValidationError(
                        f"builder image compressed layer member mismatch index={layer_index}"
                    )
                layer_handle = archive.extractfile(layer_member)
                if layer_handle is None:
                    raise ValidationError(
                        f"builder image compressed layer unavailable index={layer_index}"
                    )
                compressed_path = Path(temp.name) / f"layer-{layer_index}.tar.gz"
                layer_path = Path(temp.name) / f"layer-{layer_index}.tar"
                compressed_digest = hashlib.sha256()
                compressed_size = 0
                with compressed_path.open("xb") as output:
                    while True:
                        chunk = layer_handle.read(1024 * 1024)
                        if not chunk:
                            break
                        compressed_size += len(chunk)
                        if compressed_size > MAX_COMPRESSED_LAYER_BYTES:
                            raise ValidationError(
                                f"builder image compressed layer exceeds bound index={layer_index}"
                            )
                        compressed_digest.update(chunk)
                        output.write(chunk)
                if (compressed_size != layer_desc["size"] or
                        layer_digests[layer_index] !=
                            f"sha256:{compressed_digest.hexdigest()}"):
                    raise ValidationError(
                        f"builder image compressed layer digest mismatch index={layer_index}"
                    )
                diff_id, _uncompressed_size = decompress_single_gzip(
                    compressed_path, layer_path,
                )
                if expected_diff_id != f"sha256:{diff_id}":
                    raise ValidationError(
                        f"builder image layer diff-id mismatch index={layer_index}"
                    )
                if frozen is not None and layer_index == len(layers) - 1:
                    if frozen_raw is None:
                        raise ValidationError("builder image frozen manifest bytes missing")
                    validate_layer_context(layer_path, frozen, frozen_raw)
                compressed_path.unlink()
                layer_path.unlink()
        archive_after = os.fstat(archive_fd)
        identity = (
            "st_dev", "st_ino", "st_mode", "st_nlink", "st_size",
            "st_mtime_ns", "st_ctime_ns",
        )
        if any(getattr(archive_info, field) != getattr(archive_after, field) for field in identity):
            raise ValidationError("builder image archive changed during validation")
        return {
            "imageId": top_digest,
            "configDigest": config_digest,
            "ociManifestDigest": oci_digest,
            "layerCount": len(layer_digests),
            "layerDigests": layer_digests,
            "layerSizes": layer_sizes,
            "rootfsDiffIds": diff_ids,
            "archiveSize": archive_info.st_size,
            "archiveSha256": archive_digest.hexdigest(),
        }
    finally:
        archive_handle.close()
        os.close(archive_fd)
        temp.cleanup()


def validate_base_image_archive(
    image_archive: Path,
    *,
    expected_image_id: str | None = None,
    expected_architecture: str = "amd64",
) -> dict[str, Any]:
    return _validate_docker_save_oci_archive(
        image_archive,
        expected_image_id=expected_image_id,
        frozen=None,
        frozen_raw=None,
        expected_architecture=expected_architecture,
    )


def validate_image_archive(
    image_archive: Path, frozen: dict[str, Any], frozen_raw: bytes,
    *, base_image_info: dict[str, Any],
    expected_image_id: str | None = None,
    expected_architecture: str = "amd64",
) -> dict[str, Any]:
    info = _validate_docker_save_oci_archive(
        image_archive,
        expected_image_id=expected_image_id,
        frozen=frozen,
        frozen_raw=frozen_raw,
        expected_architecture=expected_architecture,
    )
    base_layer_count = base_image_info.get("layerCount")
    base_layer_digests = base_image_info.get("layerDigests")
    base_layer_sizes = base_image_info.get("layerSizes")
    base_diff_ids = base_image_info.get("rootfsDiffIds")
    if (not isinstance(base_layer_count, int) or isinstance(base_layer_count, bool) or
            not isinstance(base_layer_digests, list) or
            not isinstance(base_layer_sizes, list) or
            not isinstance(base_diff_ids, list) or
            base_layer_count != len(base_layer_digests) or
            base_layer_count != len(base_layer_sizes) or
            base_layer_count != len(base_diff_ids)):
        raise ValidationError("base image lineage metadata shape mismatch")
    if info["layerCount"] != base_layer_count + 1:
        raise ValidationError("final image must add exactly one closure layer")
    if info["layerDigests"][:-1] != base_layer_digests:
        raise ValidationError("final image compressed layer prefix differs from base")
    if info["layerSizes"][:-1] != base_layer_sizes:
        raise ValidationError("final image compressed layer size prefix differs from base")
    if info["rootfsDiffIds"][:-1] != base_diff_ids:
        raise ValidationError("final image rootfs diff-id prefix differs from base")
    if info["imageId"] == base_image_info.get("imageId"):
        raise ValidationError("final image config identity equals base")
    info["closureLayerDigest"] = info["layerDigests"][-1]
    info["closureRootfsDiffId"] = info["rootfsDiffIds"][-1]
    return info


def validate_builder_report(
    report_path: Path,
    base_image_archive: Path,
    image_archive: Path,
    base_image_info: dict[str, Any],
    image_info: dict[str, Any],
    frozen: dict[str, Any],
    frozen_raw: bytes,
    expected_architecture: str = "amd64",
    expected_entry_path: str | None = None,
) -> dict[str, Any]:
    raw = exact_file(report_path, max_size=16 * 1024 * 1024)
    report = strict_json(raw, "builder report")
    if not isinstance(report, dict) or raw != canonical_json(report) + b"\n":
        raise ValidationError("builder report is not canonical JSON")
    expected_keys = {
        "schema", "status", "target", "architecture", "os",
        "candidateEntryPath", "candidateEntryModulePath",
        "candidateEntrySha256", "baseInputImageId",
        "baseConfigDigest", "baseOciManifestDigest", "baseLayerCount",
        "baseLayerDigests", "baseLayerSizes", "baseRootfsDiffIds",
        "baseImageArchiveSize", "baseImageArchiveSha256", "imageId",
        "imageConfigDigest", "ociManifestDigest", "imageLayerCount",
        "imageLayerDigests", "imageLayerSizes", "imageRootfsDiffIds",
        "closureLayerDigest", "closureRootfsDiffId",
        "imageArchiveSize", "imageArchiveSha256", "sourceToolManifestSha256",
        "sourceClosureSha256", "sourceEntryCount", "toolClosureSha256",
        "toolEntryCount", "builderSha256", "workloadSha256", "validatorSha256",
        "releaseSourceClosureSha256", "releaseSourceClosureCid",
        "candidateBundleSize",
        "candidateBundleSha256", "candidateManifestSize",
        "candidateManifestSha256", "candidateReportSize",
        "candidateReportSha256", "candidateWorkerSize",
        "candidateWorkerSha256", "candidateBuildArgvCount",
        "candidateBuildArgvSha256", "candidateBuildEnvCount",
        "candidateBuildEnvSha256",
    }
    if set(report) != expected_keys:
        raise ValidationError("builder report field set mismatch")
    tool_entries = {entry["path"]: entry for entry in frozen["toolEntries"]}
    entry_path = str(report.get("candidateEntryPath", ""))
    if expected_entry_path is not None and entry_path != expected_entry_path:
        raise ValidationError("builder report selected entry mismatch")
    _entry_path, entry_module_path = current_entry_spec(entry_path)
    source_entries = {
        entry["path"]: entry for entry in frozen["sourceEntries"]
    }
    entry_source = source_entries.get(entry_path)
    if entry_source is None:
        raise ValidationError("builder report entry absent from frozen closure")
    required = {
        "schema": BUILDER_SCHEMA,
        "status": "built",
        "target": {
            "amd64": "x86_64-unknown-linux-gnu",
            "arm64": "aarch64-unknown-linux-gnu",
        }[expected_architecture],
        "architecture": expected_architecture,
        "os": "linux",
        "candidateEntryPath": entry_path,
        "candidateEntryModulePath": entry_module_path,
        "candidateEntrySha256": entry_source["sha256"],
        "baseInputImageId": base_image_info["imageId"],
        "baseConfigDigest": base_image_info["configDigest"],
        "baseOciManifestDigest": base_image_info["ociManifestDigest"],
        "baseLayerCount": base_image_info["layerCount"],
        "baseLayerDigests": base_image_info["layerDigests"],
        "baseLayerSizes": base_image_info["layerSizes"],
        "baseRootfsDiffIds": base_image_info["rootfsDiffIds"],
        "baseImageArchiveSize": base_image_info["archiveSize"],
        "baseImageArchiveSha256": base_image_info["archiveSha256"],
        "imageId": image_info["imageId"],
        "imageConfigDigest": image_info["configDigest"],
        "ociManifestDigest": image_info["ociManifestDigest"],
        "imageLayerCount": image_info["layerCount"],
        "imageLayerDigests": image_info["layerDigests"],
        "imageLayerSizes": image_info["layerSizes"],
        "imageRootfsDiffIds": image_info["rootfsDiffIds"],
        "closureLayerDigest": image_info["closureLayerDigest"],
        "closureRootfsDiffId": image_info["closureRootfsDiffId"],
        "imageArchiveSize": image_info["archiveSize"],
        "imageArchiveSha256": image_info["archiveSha256"],
        "sourceToolManifestSha256": sha256_bytes(frozen_raw),
        "sourceClosureSha256": frozen["sourceClosureSha256"],
        "sourceEntryCount": frozen["sourceEntryCount"],
        "toolClosureSha256": frozen["toolClosureSha256"],
        "toolEntryCount": frozen["toolEntryCount"],
        "builderSha256": tool_entries["tools/cid_linux_current_source_candidate_builder.py"]["sha256"],
        "workloadSha256": tool_entries["tools/cid_linux_current_source_candidate_workload.sh"]["sha256"],
        "validatorSha256": tool_entries["tools/cid_linux_current_source_candidate_validate.py"]["sha256"],
        "candidateBuildEnvCount": len(CANDIDATE_BUILD_ENV),
        "candidateBuildEnvSha256": framed_sha256(CANDIDATE_BUILD_ENV),
    }
    for key, value in required.items():
        if report.get(key) != value:
            raise ValidationError(f"builder report field mismatch: {key}")
    for key in (
        "releaseSourceClosureSha256", "releaseSourceClosureCid",
        "candidateBundleSha256",
        "candidateManifestSha256", "candidateReportSha256",
        "candidateWorkerSha256", "candidateBuildArgvSha256",
    ):
        if not isinstance(report.get(key), str) or not SHA_RE.fullmatch(
            report[key]
        ):
            raise ValidationError(f"builder report SHA-256 invalid: {key}")
    for key in (
        "candidateBundleSize", "candidateManifestSize",
        "candidateReportSize", "candidateWorkerSize",
        "candidateBuildArgvCount",
    ):
        if (
            not isinstance(report.get(key), int)
            or isinstance(report[key], bool)
            or report[key] <= 0
        ):
            raise ValidationError(f"builder report uint invalid: {key}")
    base_size, base_sha = exact_file_sha256(
        base_image_archive, max_size=MAX_IMAGE_ARCHIVE_BYTES,
    )
    if (base_sha != base_image_info["archiveSha256"] or
            base_size != base_image_info["archiveSize"]):
        raise ValidationError("builder report raw base archive changed")
    image_size, image_sha = exact_file_sha256(
        image_archive, max_size=MAX_IMAGE_ARCHIVE_BYTES,
    )
    if (image_sha != image_info["archiveSha256"] or
            image_size != image_info["archiveSize"]):
        raise ValidationError("builder report final image archive changed")
    return report


def validate_current_tool_anchors(frozen: dict[str, Any]) -> None:
    root = Path(__file__).resolve(strict=True).parent.parent
    entries = {entry["path"]: entry for entry in frozen["toolEntries"]}
    for relative in CURRENT_TOOL_ANCHORS:
        entry = entries.get(relative)
        if entry is None:
            raise ValidationError(f"frozen tool anchor absent: {relative}")
        raw = exact_file(root / relative, max_size=64 * 1024 * 1024)
        if len(raw) != entry["size"] or sha256_bytes(raw) != entry["sha256"]:
            raise ValidationError(f"current tool differs from frozen anchor: {relative}")


def preflight(args: argparse.Namespace) -> tuple[dict[str, Any], dict[str, Any], bytes, dict[str, Any]]:
    spec = target_spec(args.target)
    architecture = str(spec["oci_architecture"])
    frozen_path = Path(args.frozen_manifest)
    base_image_archive = Path(args.base_image_archive)
    image_archive = Path(args.image_archive)
    builder_report_path = Path(args.builder_report)
    for path, label in (
        (frozen_path, "frozen manifest"),
        (base_image_archive, "base image archive"),
        (image_archive, "image archive"),
        (builder_report_path, "builder report"),
    ):
        if not path.is_absolute() or path.resolve(strict=True) != path:
            raise ValidationError(f"{label} must be an absolute canonical path")
    frozen_raw = exact_file(frozen_path, max_size=512 * 1024 * 1024)
    frozen = parse_frozen_manifest(frozen_raw)
    validate_current_tool_anchors(frozen)
    base_image_info = validate_base_image_archive(
        base_image_archive,
        expected_architecture=architecture,
    )
    image_info = validate_image_archive(
        image_archive,
        frozen,
        frozen_raw,
        base_image_info=base_image_info,
        expected_architecture=architecture,
    )
    report = validate_builder_report(
        builder_report_path,
        base_image_archive,
        image_archive,
        base_image_info,
        image_info,
        frozen,
        frozen_raw,
        architecture,
        args.entry,
    )
    return image_info, frozen, frozen_raw, report


def parse_receipt(
    raw: bytes, hash_key: str = "receipt_sha256",
) -> dict[str, str]:
    if not raw.endswith(b"\n"):
        raise ValidationError("hard-gate receipt lacks terminal newline")
    lines = raw.splitlines(keepends=True)
    rows: dict[str, str] = {}
    prefix = bytearray()
    for index, line in enumerate(lines):
        if not line.endswith(b"\n") or b"=" not in line:
            raise ValidationError("hard-gate receipt malformed row")
        key_raw, value_raw = line[:-1].split(b"=", 1)
        key = key_raw.decode("ascii", "strict")
        value = value_raw.decode("ascii", "strict")
        if not key or not value or key in rows:
            raise ValidationError("hard-gate receipt duplicate/empty row")
        rows[key] = value
        if key != hash_key:
            prefix.extend(line)
        elif index != len(lines) - 1:
            raise ValidationError("hard-gate receipt hash is not terminal")
    if rows.get(hash_key) != sha256_bytes(bytes(prefix)):
        raise ValidationError("hard-gate receipt hash mismatch")
    return rows


def fshex_path(value: str, label: str) -> Path:
    try:
        raw = bytes.fromhex(value)
        text = os.fsdecode(raw)
    except ValueError as exc:
        raise ValidationError(f"{label} path fshex invalid") from exc
    path = Path(text)
    if (
        raw.hex() != value
        or not path.is_absolute()
        or path.resolve(strict=True) != path
    ):
        raise ValidationError(f"{label} path is not canonical absolute")
    return path


def current_worker_argv(target: str, entry_path: str) -> tuple[str, ...]:
    target_spec(target)
    current_entry_spec(entry_path)
    return (
        CURRENT_WORKER_ARGV0,
        "system-link-exec",
        "--require-pure-system-link-exec",
        "--root:/cheng-current-source/repo",
        f"--in:{entry_path}",
        "--emit:exe",
        "--backend:primary",
        "--link-providers",
        f"--target:{target}",
        "--out:/cheng-hardcap-work/current-driver.next",
        "--report-out:/cheng-hardcap-work/current-driver.report",
    )


def compiler_backend_role_from_argv(argv: Sequence[str]) -> str:
    matches = [
        value[len("--backend:"):]
        for value in argv
        if value.startswith("--backend:")
    ]
    if len(matches) != 1 or matches[0] not in ("primary", "backend2"):
        raise ValidationError(
            "current worker backend command authority is invalid"
        )
    return matches[0]


def validate_build_receipt(
    args: argparse.Namespace,
    image_info: dict[str, Any],
    frozen: dict[str, Any],
    frozen_raw: bytes,
    builder_report: dict[str, Any],
) -> tuple[dict[str, str], bytes, Path, Path, bytes]:
    receipt_path = Path(args.build_receipt)
    if (
        not receipt_path.is_absolute()
        or receipt_path.resolve(strict=True) != receipt_path
    ):
        raise ValidationError("candidate build receipt must be canonical absolute")
    receipt_raw = exact_file(receipt_path, max_size=16 * 1024 * 1024)
    rows = parse_receipt(receipt_raw, "receipt_payload_sha256")
    if set(rows) != BUILD_RECEIPT_KEYS:
        raise ValidationError("candidate build receipt key set mismatch")
    exact = {
        "schema": BUILD_RECEIPT_SCHEMA,
        "status": "BUILT",
        "target": args.target,
        "machine": str(target_spec(args.target)["machine"]),
        "worker_role": "current_source_linux_native_compiler",
        "candidate_entry_path": args.entry,
        "candidate_entry_module_path": current_entry_spec(args.entry)[1],
        "frozen_source_closure_sha256": str(
            frozen["sourceClosureSha256"]
        ),
        "frozen_tool_closure_sha256": str(frozen["toolClosureSha256"]),
        "frozen_manifest_sha256": sha256_bytes(frozen_raw),
        "builder_image_id": str(image_info["imageId"]),
        "builder_image_config_digest": str(image_info["configDigest"]),
        "builder_image_oci_manifest_digest": str(
            image_info["ociManifestDigest"]
        ),
        "builder_image_archive_sha256": str(image_info["archiveSha256"]),
        "builder_report_sha256": sha256_bytes(
            canonical_json(builder_report) + b"\n"
        ),
        "candidate_build_argv_encoding": "be64_length_utf8_sequence",
        "candidate_build_argv_count": "6",
        "candidate_build_argv_sha256": framed_sha256((
            WORKLOAD_ARGV0,
            args.target,
            args.entry,
            image_info["imageId"],
            image_info["configDigest"],
            image_info["ociManifestDigest"],
        )),
        "candidate_build_env_encoding": "be64_length_utf8_sequence",
        "candidate_build_env_count": str(len(CANDIDATE_BUILD_ENV)),
        "candidate_build_env_sha256": framed_sha256(CANDIDATE_BUILD_ENV),
    }
    for key, expected in exact.items():
        if rows.get(key) != expected:
            raise ValidationError(f"candidate build receipt mismatch: {key}")
    source_entries = {
        entry["path"]: entry for entry in frozen["sourceEntries"]
    }
    entry = source_entries.get(args.entry)
    if (
        entry is None
        or rows.get("candidate_entry_sha256") != entry["sha256"]
    ):
        raise ValidationError(
            "candidate build receipt entry source identity mismatch"
        )
    root = Path(__file__).resolve(strict=True).parent.parent
    tool_paths = {
        "builder_sha256":
            root / "tools/cid_linux_current_source_candidate_builder.py",
        "workload_sha256":
            root / "tools/cid_linux_current_source_candidate_workload.sh",
        "validator_sha256":
            root / "tools/cid_linux_current_source_candidate_validate.py",
        "gate_sha256":
            root / "tools/cid_linux_current_source_candidate_gate.sh",
        "cgroup_producer_sha256":
            root / "tools/beat_c_linux_cgroup_v2_hard_memory_gate.py",
        "cgroup_validator_sha256":
            root / "tools/beat_c_validate_linux_cgroup_v2_hard_memory_receipt.py",
        "release_evidence_tool_sha256":
            root / "tools/backend2_current_source_release_evidence",
        "current_source_closure_builder_sha256":
            root / "tools/current_source_closure_manifest.py",
    }
    for key, path in tool_paths.items():
        if rows.get(key) != sha256_bytes(exact_file(path)):
            raise ValidationError(f"candidate build tool binding mismatch: {key}")
    frozen_path = fshex_path(
        rows.get("frozen_manifest_path_fshex", ""), "frozen manifest",
    )
    if (
        frozen_path != Path(args.frozen_manifest).resolve(strict=True)
        or exact_file(frozen_path, max_size=512 * 1024 * 1024) != frozen_raw
    ):
        raise ValidationError("candidate build frozen manifest path mismatch")
    builder_report_path = fshex_path(
        rows.get("builder_report_path_fshex", ""), "builder report",
    )
    builder_report_raw = exact_file(
        builder_report_path, max_size=16 * 1024 * 1024,
    )
    if (
        builder_report_path != Path(args.builder_report).resolve(strict=True)
        or rows.get("builder_report_sha256")
        != sha256_bytes(builder_report_raw)
    ):
        raise ValidationError("candidate build builder report mismatch")
    bundle_path = fshex_path(rows.get("bundle_path_fshex", ""), "bundle")
    bundle_raw = exact_file(bundle_path, max_size=MAX_BUNDLE_BYTES)
    if (
        rows.get("bundle_sha256") != sha256_bytes(bundle_raw)
        or uint(rows.get("bundle_size", ""), "bundle size") != len(bundle_raw)
    ):
        raise ValidationError("candidate build bundle identity mismatch")
    _bundle_rows, manifest_raw, report_raw, _worker_raw = split_binary_bundle(
        bundle_raw
    )
    for prefix, expected_raw in (
        ("candidate_manifest", manifest_raw),
        ("candidate_report", report_raw),
    ):
        artifact_path = fshex_path(
            rows.get(prefix + "_path_fshex", ""), prefix,
        )
        artifact_raw = exact_file(artifact_path, max_size=MAX_BUNDLE_BYTES)
        if (
            artifact_raw != expected_raw
            or rows.get(prefix + "_sha256") != sha256_bytes(artifact_raw)
            or uint(rows.get(prefix + "_size", ""), prefix + " size")
            != len(artifact_raw)
        ):
            raise ValidationError(
                f"candidate build {prefix} identity mismatch"
            )
    worker_path = fshex_path(rows.get("worker_path_fshex", ""), "worker")
    worker_raw = exact_file(worker_path, max_size=MAX_BUNDLE_BYTES)
    worker_info = os.stat(worker_path, follow_symlinks=False)
    worker_exact = {
        "worker_sha256": sha256_bytes(worker_raw),
        "worker_size": str(len(worker_raw)),
        "worker_device": str(worker_info.st_dev),
        "worker_inode": str(worker_info.st_ino),
        "worker_mode": format(worker_info.st_mode, "o"),
        "worker_mtime_ns": str(worker_info.st_mtime_ns),
        "worker_ctime_ns": str(worker_info.st_ctime_ns),
        "worker_elf_machine": str(target_spec(args.target)["elf_machine"]),
    }
    for key, expected in worker_exact.items():
        if rows.get(key) != expected:
            raise ValidationError(f"candidate build worker mismatch: {key}")
    validate_candidate(worker_raw, int(target_spec(args.target)["elf_machine"]))
    source_closure_path = fshex_path(
        rows.get("release_source_closure_path_fshex", ""),
        "release source closure",
    )
    source_closure_raw = exact_file(
        source_closure_path, max_size=MAX_BUNDLE_BYTES,
    )
    if rows.get("source_closure_sha256") != sha256_bytes(source_closure_raw):
        raise ValidationError("candidate build source closure identity mismatch")
    source_closure_cid = release_source_content_cid(source_closure_raw)
    if rows.get("source_closure_cid") != source_closure_cid:
        raise ValidationError(
            "candidate build portable source closure identity mismatch"
        )
    if Path(args.source_closure).resolve(strict=True) != source_closure_path:
        raise ValidationError("candidate build/validator source closure path mismatch")
    if Path(args.driver).resolve(strict=True) != worker_path:
        raise ValidationError("candidate build/validator worker path mismatch")
    if builder_report["candidateBundleSha256"] != rows["bundle_sha256"]:
        raise ValidationError("builder report/build receipt bundle mismatch")
    if builder_report["candidateWorkerSha256"] != rows["worker_sha256"]:
        raise ValidationError("builder report/build receipt worker mismatch")
    entry_bindings = {
        "candidateEntryPath": "candidate_entry_path",
        "candidateEntryModulePath": "candidate_entry_module_path",
        "candidateEntrySha256": "candidate_entry_sha256",
    }
    for report_key, receipt_key in entry_bindings.items():
        if str(builder_report[report_key]) != rows[receipt_key]:
            raise ValidationError(
                f"builder report/build receipt mismatch: {report_key}"
            )
    report_bindings = {
        "releaseSourceClosureSha256": "source_closure_sha256",
        "releaseSourceClosureCid": "source_closure_cid",
        "candidateManifestSha256": "candidate_manifest_sha256",
        "candidateReportSha256": "candidate_report_sha256",
        "candidateBuildArgvSha256": "candidate_build_argv_sha256",
        "candidateBuildEnvSha256": "candidate_build_env_sha256",
    }
    for report_key, receipt_key in report_bindings.items():
        if str(builder_report[report_key]) != rows[receipt_key]:
            raise ValidationError(
                f"builder report/build receipt mismatch: {report_key}"
            )
    return rows, bundle_raw, worker_path, source_closure_path, receipt_raw


def validate_hard_gate(
    args: argparse.Namespace,
) -> tuple[dict[str, str], bytes]:
    evidence_dir = Path(args.evidence_dir)
    repository_validator = Path(__file__).with_name("beat_c_validate_linux_cgroup_v2_hard_memory_receipt.py")
    archived_validator = evidence_dir / "receipt-validator.py"
    if exact_file(repository_validator) != exact_file(archived_validator):
        raise ValidationError("hard-gate archived validator differs from frozen repository validator")
    completed = subprocess.run(
        [
            sys.executable,
            "-B",
            str(archived_validator),
            "--evidence-dir",
            str(evidence_dir),
            "--aggregate-evidence-dir",
            args.aggregate_evidence_dir,
            "--workspace-root",
            args.workspace_root,
            "--source-closure",
            args.source_closure,
            "--driver",
            args.driver,
            "--build-receipt",
            args.build_receipt,
            "--native-descriptor",
            args.native_descriptor,
            "--native-descriptor-sha256",
            args.native_descriptor_sha256,
            "--expected-status",
            "completed",
        ],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
    )
    expected_output = (
        b"hard_gate_cleanup_status=verified_absent_live\n"
        b"production_release_status=eligible_linux_gate_only\n"
        b"darwin_release_status=HARD_RED\n"
        b"hard_gate_validation_status=passed_unique_current\n"
    )
    if (
        completed.returncode != 0
        or completed.stderr
        or completed.stdout != expected_output
    ):
        raise ValidationError(f"hard-gate validator rejected evidence rc={completed.returncode} stderr={completed.stderr!r}")
    rows = parse_receipt(exact_file(evidence_dir / "receipt.kv"))
    required = {
        "status": "completed",
        "hard_memory_limit_proof_status": "proved_linux_kernel_cgroup_v2_aggregate",
        "memory_enforcement_scope": "container_and_all_descendants",
        "memory_limit_bytes": "805306368", "memory_swap_max_bytes": "0",
        "workload_rc": "0", "container_exit_code": "0", "container_oom_killed_final": "0",
    }
    for key, value in required.items():
        if rows.get(key) != value:
            raise ValidationError(f"hard-gate receipt field mismatch: {key}")
    stdout_raw = exact_file(evidence_dir / "stdout.bin", max_size=MAX_BUNDLE_BYTES)
    if uint(rows["stdout_size"], "hard-gate stdout size") != len(stdout_raw) or rows["stdout_sha256"] != sha256_bytes(stdout_raw):
        raise ValidationError("hard-gate stdout identity mismatch")
    if stdout_raw or exact_file(evidence_dir / "stderr.bin"):
        raise ValidationError("direct candidate worker emitted output")
    return rows, stdout_raw


def parse_unique_text_report(raw: bytes, label: str) -> dict[str, str]:
    if not raw.endswith(b"\n"):
        raise ValidationError(f"{label} lacks terminal newline")
    try:
        lines = raw[:-1].decode("utf-8", "strict").split("\n")
    except UnicodeDecodeError as exc:
        raise ValidationError(f"{label} is not UTF-8") from exc
    rows: dict[str, str] = {}
    for line in lines:
        key, separator, value = line.partition("=")
        if not separator or not REPORT_KEY_RE.fullmatch(key) or key in rows or "\r" in value:
            raise ValidationError(f"{label} malformed/duplicate row")
        rows[key] = value
    return rows


def require_report_values(rows: dict[str, str], expected: dict[str, str], label: str) -> None:
    for key, value in expected.items():
        if rows.get(key) != value:
            raise ValidationError(f"{label} field mismatch: {key}")


def reject_negative_report(rows: dict[str, str], label: str) -> None:
    forbidden_pairs = {
        "system_link_exec": "0", "real_backend_codegen": "0",
        "full_backend_codegen": "0", "cold_system_link_exec": "1",
    }
    for key, value in forbidden_pairs.items():
        if rows.get(key) == value:
            raise ValidationError(f"{label} contains negative field: {key}")
    for key in ("gate_blocker_phase", "error", "fatal_error"):
        if rows.get(key, "") not in ("", "-"):
            raise ValidationError(f"{label} contains blocker field: {key}")


def reject_legacy_version_fields(rows: dict[str, str], label: str) -> None:
    legacy = sorted(key for key in rows if LEGACY_VERSION_KEY_RE.search(key))
    if legacy:
        raise ValidationError(f"{label} contains legacy version field: {legacy[0]}")


def current_report_exact_key_order(
    rows: dict[str, str],
) -> tuple[str, ...]:
    provider_count = uint(
        rows.get("compile_receipt_runtime_provider_count", ""),
        "compile receipt provider count",
    )
    _physical_seal, physical_keys = (
        source_bundle_binding_physical_seal_from_report(rows)
    )
    receipt_keys = (
        "system_link_exec", "real_backend_codegen", "target", "emit",
        "output", "output_sha256", "backend2_version_manifest_sha256",
        "compiler_output_receipt_cid",
        "source_bundle_receipt_source_bundle_cid",
        "source_bundle_receipt_seal",
        "source_bundle_entry_identity_seal", "source_bundle_binding_seal",
        "source_bundle_entry_source_index",
        *physical_keys,
        "source_identity_receipt_source_package_id",
        "source_identity_receipt_entry_module_path",
        "source_identity_receipt_source_snapshot_count",
        "source_identity_receipt_import_edge_count",
        "source_identity_receipt_unresolved_import_count",
        "source_identity_receipt_source_package_id_cid",
        "source_identity_receipt_entry_module_path_cid",
        "source_bundle_cid", "entry_source_cid",
        "source_identity_receipt_import_graph_cid",
        "source_identity_receipt_cid", "canonical_compiler_csg_cid",
        "semantic_receipt_cid", "source_to_csg_binding_seal",
        "compile_receipt_world_head_cid",
        "compile_receipt_source_identity_receipt_cid",
        "compile_receipt_semantic_receipt_cid",
        "compile_receipt_output_digest",
        "compile_receipt_canonical_output_digest", "compile_receipt_target",
        "compile_receipt_bootstrap_stage",
        "compile_receipt_runtime_provider_count",
        *(f"compile_receipt_runtime_provider.{index}"
          for index in range(provider_count)),
        "compile_receipt_cid",
        "cold_system_link_exec", "system_link_exec_scope",
        "full_backend_codegen", "pure_provenance_bootstrap_materialize",
        "pure_provenance_gate",
    )
    runtime_head = (
        "system_link_exec_runtime_execute",
        "final_output_sha256",
        "final_source_identity_receipt_cid",
        "final_semantic_receipt_cid",
        "final_source_to_csg_binding_seal",
        "final_world_head_cid",
        "final_canonical_output_digest",
        "final_compile_receipt_cid",
        "compiler_csg_lifetime_receipt_ready",
        "compiler_csg_lifetime_outcome",
        "compiler_csg_lifetime_allocated",
        "compiler_csg_lifetime_released",
        "compiler_csg_lifetime_live",
        "compiler_csg_lifetime_allocated_bytes",
        "compiler_csg_lifetime_released_bytes",
        "compiler_csg_lifetime_live_bytes",
        "compiler_csg_lifetime_physical_buffer_count",
        "compiler_csg_lifetime_physical_free_count",
        "compiler_csg_lifetime_storage_released",
        "compiler_csg_lifetime_ledger_storage_released",
        "compiler_csg_lifetime_ledger_storage_released_buffer_count",
        "compiler_csg_lifetime_ledger_storage_released_bytes",
        "owner_table_lifetime_outcome",
        "owner_table_lifetime_allocated",
        "owner_table_lifetime_released",
        "owner_table_lifetime_live",
        "owner_table_lifetime_allocated_bytes",
        "owner_table_lifetime_released_bytes",
        "owner_table_lifetime_live_bytes",
        "owner_table_lifetime_borrow_count",
        "owner_table_lifetime_borrow_return_count",
        "owner_table_lifetime_owner_transfer_count",
        "owner_table_lifetime_physical_buffer_count",
        "owner_table_lifetime_physical_free_count",
        "owner_table_lifetime_storage_released",
        "owner_table_lifetime_ledger_storage_released",
        "owner_table_lifetime_ledger_storage_released_buffer_count",
        "owner_table_lifetime_ledger_storage_released_bytes",
        "system_link_exec_emit",
        "system_link_exec_runtime_standalone_no_runtime",
        "system_link_exec_runtime_standalone_direct_entry",
        "primary_object_path",
        "primary_object_asm_path",
        "primary_object_compile_log",
        "primary_object_cache_status",
        "primary_object_cache_path",
        "primary_object_cache_enabled",
        "primary_object_direct",
        "direct_object_bytes",
        "direct_object_symbol_count",
        "direct_object_reloc_count",
        "provider_compiler",
        "provider_object_count",
        "provider_object_paths",
        "provider_compile_logs",
        "provider_object_cache_enabled",
        "provider_object_cache_status",
        "provider_object_cache_hit_count",
        "provider_object_cache_miss_count",
        "provider_parallel_status",
        "provider_parallel_job_count",
        "provider_parallel_task_count",
        "provider_parallel_active_workers",
        "provider_parallel_completed_workers",
        "provider_schedule",
        "provider_requested_job_count",
        "provider_task_count",
        "provider_worker_count",
        "provider_completed_worker_count",
        "provider_deterministic_merge",
        "provider_parallel_merge_order",
        "g_line_full_backend_parallel",
        "g_line_full_backend_parallel_blocker",
    )
    linkerless = rows.get("linkerless_image", "")
    system_link = rows.get("system_link", "")
    if linkerless == "1" and system_link == "0":
        link_keys = (
            "linkerless_image", "system_link", "unresolved_symbol_count",
            "first_unresolved_symbol", "provider_link_mode",
        )
    elif linkerless == "0" and system_link == "1":
        link_keys = (
            "linkerless_image", "system_link", "provider_link_mode",
        )
    else:
        raise ValidationError(
            "current runtime report link-mode key shape is invalid"
        )
    runtime_tail = (
        "native_link_log",
        "debug_line_map_path",
        "exec_phase_primary_object_emit_ms",
        "exec_phase_provider_objects_ms",
        "exec_phase_native_link_ms",
        "exec_phase_line_map_ms",
        "rss_execute_begin_bytes",
        "rss_after_provider_bytes",
        "rss_after_primary_bytes",
        "rss_before_native_link_bytes",
        "rss_after_native_link_bytes",
        "rss_after_line_map_bytes",
        *(
            f"{prefix}_{suffix}"
            for prefix in CURRENT_RUNTIME_INDEX_METRIC_PREFIXES
            for suffix in CURRENT_RUNTIME_INDEX_METRIC_SUFFIXES
        ),
        "exec_pipeline_stage",
    )
    defer_count = uint(
        rows.get("defer_receipt_count", ""),
        "current defer receipt count",
    )
    if defer_count > 1_000_000:
        raise ValidationError(
            "current defer receipt count exceeds exact schema bound"
        )
    backend_role = rows.get("defer_receipt_backend_role", "")
    if backend_role not in ("primary", "backend2"):
        raise ValidationError(
            "current defer receipt backend role is invalid"
        )
    report_target = rows.get("target", "")
    target_spec(report_target)
    defer_keys: list[str] = [
        "defer_receipt_count",
        "defer_receipt_backend_role",
    ]
    action_cids: set[str] = set()
    fragment_cids: set[str] = set()
    for index in range(defer_count):
        prefix = f"defer_receipt.{index}"
        row_keys = tuple(
            f"{prefix}.{field}"
            for field in CURRENT_DEFER_RECEIPT_FIELDS
        )
        function_row = uint(
            rows.get(row_keys[0], ""),
            f"current defer receipt {index} function row",
        )
        statement_row = uint(
            rows.get(row_keys[1], ""),
            f"current defer receipt {index} statement row",
        )
        if function_row > 0x7FFF_FFFF or statement_row > 0x7FFF_FFFF:
            raise ValidationError(
                f"current defer receipt {index} row exceeds int32"
            )
        if rows.get(row_keys[2], "") != report_target:
            raise ValidationError(
                f"current defer receipt {index} target mismatch"
            )
        action_cid = rows.get(row_keys[3], "")
        fragment_cid = rows.get(row_keys[4], "")
        if (
            SHA_RE.fullmatch(action_cid) is None
            or action_cid == "0" * 64
            or action_cid in action_cids
        ):
            raise ValidationError(
                f"current defer receipt {index} action CID is invalid"
            )
        if (
            SHA_RE.fullmatch(fragment_cid) is None
            or fragment_cid == "0" * 64
            or fragment_cid in fragment_cids
        ):
            raise ValidationError(
                f"current defer receipt {index} fragment CID is invalid"
            )
        action_cids.add(action_cid)
        fragment_cids.add(fragment_cid)
        defer_keys.extend(row_keys)
    keys = (
        receipt_keys
        + runtime_head
        + link_keys
        + runtime_tail
        + tuple(defer_keys)
    )
    if len(keys) != len(set(keys)):
        raise ValidationError(
            "current report exact key authority contains duplicate key"
        )
    return keys


def current_report_exact_key_order_sha256(
    keys: Sequence[str],
) -> str:
    return framed_sha256(keys)


def validate_current_receipt_report_order(
    raw: bytes, rows: dict[str, str],
) -> tuple[str, ...]:
    try:
        lines = raw.decode("utf-8", "strict").splitlines()
    except UnicodeDecodeError as exc:
        raise ValidationError("current receipt report is not UTF-8") from exc
    observed = tuple(line.split("=", 1)[0] for line in lines)
    expected = current_report_exact_key_order(rows)
    if observed != expected or len(observed) != len(rows):
        raise ValidationError(
            "current receipt report exact key order mismatch"
        )
    if current_report_exact_key_order_sha256(observed) != (
        current_report_exact_key_order_sha256(expected)
    ):
        raise ValidationError(
            "current receipt report key-order identity mismatch"
        )
    return expected


def validate_bound_reports(
    payloads: dict[str, bytes],
    candidate_raw: bytes,
    frozen: dict[str, Any],
    entry_path: str,
    target: str = TARGET,
) -> tuple[dict[str, str], dict[str, str]]:
    target_spec(target)
    _entry_path, expected_entry_module_path = current_entry_spec(entry_path)
    candidate_sha = sha256_bytes(candidate_raw)
    if not payloads["candidate.map"]:
        raise ValidationError("current candidate map is empty")
    bootstrap = parse_unique_text_report(
        payloads["bootstrap.report"], "bootstrap seed report",
    )
    cold = parse_unique_text_report(
        payloads["bootstrap.cold.report"], "bootstrap cold report",
    )
    source = parse_unique_text_report(
        payloads["source.report"], "current source provenance report",
    )
    reject_legacy_version_fields(bootstrap, "bootstrap seed report")
    reject_legacy_version_fields(cold, "bootstrap cold report")
    reject_legacy_version_fields(source, "current source provenance report")
    validate_current_receipt_report_order(payloads["source.report"], source)
    expected_backend_role = compiler_backend_role_from_argv(
        current_worker_argv(target, _entry_path)
    )
    if source.get("defer_receipt_backend_role") != expected_backend_role:
        raise ValidationError(
            "current defer receipt backend role differs from exact worker argv"
        )
    require_report_values(bootstrap, {
        "target": target, "system_link_exec_runtime_execute": "1", "system_link_exec": "1",
        "real_backend_codegen": "1", "cold_system_link_exec": "1",
        "backend_driver_candidate": "cold_runtime_provider_system_link",
        "full_backend_codegen": "0",
        "system_link_exec_scope": "cold_runtime_provider_system_link",
        "installed_status_smoke": "1",
        "installed_dry_compile_smoke": "1",
        "source_provenance_report": BOOTSTRAP_COLD_REPORT_PATH,
        "output": BOOTSTRAP_SEED_PATH, "output_map": BOOTSTRAP_SEED_MAP_PATH,
    }, "bootstrap seed report")
    require_report_values(cold, {
        "target": target, "emit": "exe", "system_link_exec_runtime_execute": "1",
        "system_link_exec": "1", "real_backend_codegen": "1",
        "cold_system_link_exec": "1", "full_backend_codegen": "0",
        "output": BOOTSTRAP_DIRECT_PATH,
    }, "bootstrap cold report")
    if cold.get("system_link_exec_scope") in (None, "", "selfhost_direct"):
        raise ValidationError("bootstrap cold report does not identify a cold scope")
    if payloads["source.report"] == payloads["bootstrap.cold.report"]:
        raise ValidationError("current source provenance reuses the cold-only report")
    require_report_values(source, {
        "target": target, "emit": "exe", "system_link_exec_runtime_execute": "1",
        "system_link_exec": "1", "real_backend_codegen": "1", "cold_system_link_exec": "0",
        "full_backend_codegen": "1", "system_link_exec_scope": "selfhost_direct",
        "pure_provenance_bootstrap_materialize": "pass_b",
        "pure_provenance_gate": "pass_b_self_proof",
        "output": CURRENT_STAGING_PATH, "output_sha256": candidate_sha,
        "compile_receipt_target": target,
    }, "current source provenance report")
    reject_negative_report(source, "current source provenance report")
    identity_keys = (
        "source_bundle_cid", "entry_source_cid", "canonical_compiler_csg_cid",
        "source_identity_receipt_cid", "semantic_receipt_cid",
        "source_to_csg_binding_seal", "compile_receipt_world_head_cid",
        "compile_receipt_source_identity_receipt_cid",
        "compile_receipt_semantic_receipt_cid", "compile_receipt_output_digest",
        "compile_receipt_canonical_output_digest", "compile_receipt_cid",
        "compiler_output_receipt_cid",
        "source_bundle_receipt_source_bundle_cid",
        "source_identity_receipt_source_package_id_cid",
        "source_identity_receipt_entry_module_path_cid",
        "source_identity_receipt_import_graph_cid",
        "source_bundle_receipt_seal", "source_bundle_entry_identity_seal",
        "source_bundle_binding_seal",
    )
    for key in identity_keys:
        if not SHA_RE.fullmatch(source.get(key, "")) or source[key] == "0" * 64:
            raise ValidationError(f"source provenance identity missing: {key}")
    expected_source_identity_receipt_cid = (
        portable_source_identity_receipt_cid_from_report(source)
    )
    source_package_id = source.get(
        "source_identity_receipt_source_package_id", "",
    )
    entry_module_path = source.get(
        "source_identity_receipt_entry_module_path", "",
    )
    if not source_package_id or source_package_id.strip() != source_package_id:
        raise ValidationError("source identity package id is not canonical")
    validate_portable_path(entry_module_path, "source identity entry module path")
    if source_package_id != CURRENT_SOURCE_PACKAGE_ID:
        raise ValidationError("current source package id differs from frozen entry")
    if entry_module_path != expected_entry_module_path:
        raise ValidationError("current source entry module differs from frozen entry")
    expected_package_id_cid = semantic_text_cid(
        "cheng.compiler.source_package_id",
        source_package_id,
        "source package id",
    )
    expected_module_path_cid = semantic_text_cid(
        "cheng.compiler.entry_module_path",
        entry_module_path,
        "source entry module path",
    )
    if source["source_identity_receipt_source_package_id_cid"] != expected_package_id_cid:
        raise ValidationError("source package id CID does not bind its canonical text")
    if source["source_identity_receipt_entry_module_path_cid"] != expected_module_path_cid:
        raise ValidationError("source entry module CID does not bind its canonical path")
    expected_physical_binding_seal, _physical_keys = (
        source_bundle_binding_physical_seal_from_report(source)
    )
    if source["source_bundle_binding_seal"] != expected_physical_binding_seal:
        raise ValidationError(
            "source bundle physical binding seal mismatch"
        )
    if source["source_identity_receipt_cid"] != expected_source_identity_receipt_cid:
        raise ValidationError("source identity receipt CID does not match its bounded predecessors")
    expected_entry_identity_seal = source_bundle_entry_identity_seal_from_report(
        source
    )
    if source["source_bundle_entry_identity_seal"] != expected_entry_identity_seal:
        raise ValidationError("source bundle entry receipt identity seal mismatch")
    expected_source_bundle_receipt_seal = source_bundle_receipt_seal_from_report(
        source
    )
    if source["source_bundle_receipt_seal"] != expected_source_bundle_receipt_seal:
        raise ValidationError("source bundle compact receipt seal mismatch")
    if source["source_bundle_receipt_source_bundle_cid"] != source["source_bundle_cid"]:
        raise ValidationError(
            "source bundle compact receipt does not equal canonical source bundle CID"
        )
    if source["compile_receipt_output_digest"] != candidate_sha:
        raise ValidationError("compile receipt output identity differs from candidate raw bytes")
    if source["compile_receipt_source_identity_receipt_cid"] != source["source_identity_receipt_cid"]:
        raise ValidationError("compile receipt source identity differs from semantic receipt")
    if source["compile_receipt_semantic_receipt_cid"] != source["semantic_receipt_cid"]:
        raise ValidationError("compile receipt semantic identity differs from semantic receipt")
    expected_semantic_receipt_cid = compile_semantic_receipt_cid_from_report(source)
    if source["semantic_receipt_cid"] != expected_semantic_receipt_cid:
        raise ValidationError("semantic receipt CID does not match its bounded predecessors")
    expected_receipt_cid = compile_receipt_cid_from_report(source)
    if source["compile_receipt_cid"] != expected_receipt_cid:
        raise ValidationError("compile receipt CID does not match current receipt fields")
    expected_output_receipt_cid = compiler_output_receipt_cid_from_report(source)
    if source["compiler_output_receipt_cid"] != expected_output_receipt_cid:
        raise ValidationError("compiler output receipt does not bind output/tool raw bytes")
    expected_binding_seal = source_to_csg_binding_seal_from_report(source)
    if source["source_to_csg_binding_seal"] != expected_binding_seal:
        raise ValidationError("source-to-CSG binding seal does not bind current semantic receipt")
    require_report_values(source, {
        "final_output_sha256": source["output_sha256"],
        "final_source_identity_receipt_cid":
            source["source_identity_receipt_cid"],
        "final_semantic_receipt_cid": source["semantic_receipt_cid"],
        "final_source_to_csg_binding_seal":
            source["source_to_csg_binding_seal"],
        "final_world_head_cid": source["compile_receipt_world_head_cid"],
        "final_canonical_output_digest":
            source["compile_receipt_canonical_output_digest"],
        "final_compile_receipt_cid": source["compile_receipt_cid"],
        "system_link_exec_emit": source["emit"],
        "exec_pipeline_stage": "system_link_exec_runtime_execute",
    }, "current runtime receipt")
    if uint(
        source.get("provider_object_count", ""),
        "current runtime provider object count",
    ) != len(compile_receipt_providers_from_report(source)):
        raise ValidationError(
            "current runtime provider object count differs from receipt"
        )
    tool_entries = {entry["path"]: entry for entry in frozen["toolEntries"]}
    backend_entry = tool_entries.get("tools/backend2_version_manifest.rec")
    if backend_entry is None or source.get("backend2_version_manifest_sha256") != backend_entry["sha256"]:
        raise ValidationError("source provenance backend2 manifest identity mismatch")
    return bootstrap, source


def validate_two_stage_manifest(rows: dict[str, str]) -> None:
    seed_size = uint(rows["bootstrap_seed_size"], "bootstrap seed size")
    seed_device = uint(rows["bootstrap_seed_device"], "bootstrap seed device")
    seed_inode = uint(rows["bootstrap_seed_inode"], "bootstrap seed inode")
    candidate_device = uint(rows["candidate_device"], "candidate device")
    candidate_inode = uint(rows["candidate_inode"], "candidate inode")
    if seed_size <= 0:
        raise ValidationError("bootstrap seed is empty")
    if (not SHA_RE.fullmatch(rows["bootstrap_seed_sha256"]) or
            rows["bootstrap_seed_sha256"] == "0" * 64):
        raise ValidationError("bootstrap seed SHA-256 is malformed")
    if min(seed_device, seed_inode, candidate_device, candidate_inode) <= 0:
        raise ValidationError("bootstrap seed/candidate file identity is empty")
    if seed_device != candidate_device or seed_inode == candidate_inode:
        raise ValidationError("bootstrap seed and current candidate are not distinct same-filesystem files")
    if rows["current_report_origin"] != "bootstrap_seed_current_pure_system_link_exec":
        raise ValidationError("current report origin is not the bootstrap seed current pipeline")


def write_receipt(path: Path, value: dict[str, Any]) -> None:
    if not path.is_absolute() or path.exists() or path.is_symlink():
        raise ValidationError("validation output must be an absent absolute path")
    parent = path.parent.resolve(strict=True)
    if parent != path.parent:
        raise ValidationError("validation output parent must be canonical")
    prefix_raw = canonical_json(value)
    output = dict(value)
    output["receiptSha256"] = sha256_bytes(prefix_raw)
    raw = canonical_json(output) + b"\n"
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(path, flags, 0o400)
    try:
        with os.fdopen(fd, "wb", closefd=False) as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
    finally:
        os.close(fd)


def validate(args: argparse.Namespace) -> dict[str, Any]:
    spec = target_spec(args.target)
    image_info, frozen, frozen_raw, builder_report = preflight(args)
    evidence_dir = Path(args.evidence_dir)
    if not evidence_dir.is_absolute() or evidence_dir.resolve(strict=True) != evidence_dir:
        raise ValidationError("evidence directory must be an absolute canonical path")
    (
        build_rows,
        bundle_raw,
        worker_path,
        source_closure_path,
        build_receipt_raw,
    ) = validate_build_receipt(
        args, image_info, frozen, frozen_raw, builder_report,
    )
    gate_rows, _stdout_raw = validate_hard_gate(args)
    bundle_rows, candidate_manifest_raw, report_raw, candidate_raw = split_binary_bundle(bundle_raw)
    candidate_manifest = parse_kv(candidate_manifest_raw, MANIFEST_KEYS, "candidate manifest")
    validate_two_stage_manifest(candidate_manifest)
    report_payloads = parse_report(report_raw)
    validate_candidate(candidate_raw, int(spec["elf_machine"]))
    if (
        build_rows["worker_sha256"] != sha256_bytes(candidate_raw)
        or build_rows["worker_size"] != str(len(candidate_raw))
    ):
        raise ValidationError("candidate bundle/build worker identity mismatch")
    if gate_rows.get("image_id") != image_info["imageId"]:
        raise ValidationError("hard gate/Docker config identity mismatch")
    entry_path, entry_module_path = current_entry_spec(args.entry)
    entry_rows = {
        entry["path"]: entry for entry in frozen["sourceEntries"]
    }
    entry_source = entry_rows.get(entry_path)
    if entry_source is None:
        raise ValidationError("candidate entry is absent from frozen source closure")
    entry_sha256 = str(entry_source["sha256"])
    expected_target_argv = current_worker_argv(args.target, entry_path)
    if (
        gate_rows.get("target_argv_count") != str(len(expected_target_argv))
        or gate_rows.get("target_argv_sha256")
        != framed_sha256(expected_target_argv)
    ):
        raise ValidationError("hard-gate target command is not the exact direct worker compile")
    expected_manifest = {
        "schema": "cheng.cid_linux_current_source_candidate_manifest",
        "target": args.target,
        "machine": str(spec["machine"]),
        "candidate_entry_path": entry_path,
        "candidate_entry_module_path": entry_module_path,
        "candidate_entry_sha256": entry_sha256,
        "toolchain_image_id": image_info["imageId"],
        "toolchain_config_digest": image_info["configDigest"],
        "toolchain_oci_manifest_digest": image_info["ociManifestDigest"],
        "source_tool_manifest_sha256": sha256_bytes(frozen_raw),
        "source_closure_sha256": frozen["sourceClosureSha256"],
        "source_entry_count": str(frozen["sourceEntryCount"]),
        "tool_closure_sha256": frozen["toolClosureSha256"],
        "tool_entry_count": str(frozen["toolEntryCount"]),
        "bootstrap_seed_size": candidate_manifest["bootstrap_seed_size"],
        "bootstrap_seed_sha256": candidate_manifest["bootstrap_seed_sha256"],
        "bootstrap_seed_device": candidate_manifest["bootstrap_seed_device"],
        "bootstrap_seed_inode": candidate_manifest["bootstrap_seed_inode"],
        "candidate_device": candidate_manifest["candidate_device"],
        "candidate_inode": candidate_manifest["candidate_inode"],
        "current_report_origin": "bootstrap_seed_current_pure_system_link_exec",
        "candidate_size": str(len(candidate_raw)), "candidate_sha256": sha256_bytes(candidate_raw),
        "report_size": str(len(report_raw)), "report_sha256": sha256_bytes(report_raw),
        "candidate_execution": "passed", "candidate_elf_magic": "7f454c46",
        "candidate_elf_class": "2",
        "candidate_elf_data": "1",
        "candidate_elf_machine": str(spec["elf_machine"]),
    }
    if candidate_manifest != expected_manifest:
        raise ValidationError("candidate manifest does not match recomputed raw identities")
    if bundle_rows["candidate_sha256"] != candidate_manifest["candidate_sha256"] or bundle_rows["report_sha256"] != candidate_manifest["report_sha256"]:
        raise ValidationError("bundle/candidate manifest identity mismatch")
    if report_payloads["cc.stderr"] or report_payloads["status.stderr"]:
        raise ValidationError("bootstrap compiler or candidate status emitted stderr")
    bootstrap, source = validate_bound_reports(
        report_payloads,
        candidate_raw,
        frozen,
        entry_path,
        args.target,
    )
    current_report_keys = current_report_exact_key_order(source)
    expected_status_stdout = (
        b"cheng\nschema=cheng.compiler_runtime\nexecution=argv_control_plane\n"
        b"bootstrap_mode=selfhost\ncompiler_entry="
        + entry_path.encode("utf-8")
        + b"\n"
        b"ordinary_command=system-link-exec\n"
        b"ordinary_pipeline=canonical_csg_verified_primary_object_codegen_ready\n"
        b"stage3=artifacts/bootstrap/cheng.stage3\n"
    )
    if report_payloads["status.stdout"] != expected_status_stdout:
        raise ValidationError("candidate status stdout is not exact selfhost status")
    tool_entries = {entry["path"]: entry for entry in frozen["toolEntries"]}
    validator_sha = sha256_bytes(exact_file(Path(__file__).resolve(strict=True)))
    workload_sha = tool_entries[
        "tools/cid_linux_current_source_candidate_workload.sh"
    ]["sha256"]
    gate_sha = tool_entries[
        "tools/cid_linux_current_source_candidate_gate.sh"
    ]["sha256"]
    return {
        "schema": SCHEMA, "status": "passed",
        "target": args.target,
        "machine": str(spec["machine"]),
        "candidateEntryPath": entry_path,
        "candidateEntryModulePath": entry_module_path,
        "candidateEntrySha256": entry_sha256,
        "candidateElfMachine": int(spec["elf_machine"]),
        "hardGateReceiptSha256": gate_rows["receipt_sha256"],
        "hardGateArtifactManifestSha256": gate_rows["artifact_manifest_sha256"],
        "memoryMax": 805_306_368, "memorySwapMax": 0,
        "memoryPeakBytes": uint(gate_rows["memory_peak_after_bytes"], "memory peak"),
        "toolchainImageId": image_info["imageId"],
        "toolchainConfigDigest": image_info["configDigest"],
        "toolchainOciManifestDigest": image_info["ociManifestDigest"],
        "imageArchiveSha256": image_info["archiveSha256"],
        "frozenSourceToolManifestSha256": sha256_bytes(frozen_raw),
        "sourceClosureSha256": frozen["sourceClosureSha256"],
        "sourceEntryCount": frozen["sourceEntryCount"],
        "toolClosureSha256": frozen["toolClosureSha256"],
        "toolEntryCount": frozen["toolEntryCount"],
        "candidateSha256": sha256_bytes(candidate_raw), "candidateSize": len(candidate_raw),
        "candidateBuildReceiptPathFshex": os.fsencode(
            str(Path(args.build_receipt).resolve(strict=True))
        ).hex(),
        "candidateBuildReceiptSha256": sha256_bytes(build_receipt_raw),
        "candidateBuildReceiptPayloadSha256":
            build_rows["receipt_payload_sha256"],
        "releaseSourceClosurePathFshex":
            os.fsencode(str(source_closure_path)).hex(),
        "releaseSourceClosureSha256":
            build_rows["source_closure_sha256"],
        "releaseSourceClosureCid": build_rows["source_closure_cid"],
        "candidateWorkerPathFshex": os.fsencode(str(worker_path)).hex(),
        "candidateBuildArgvCount": uint(
            build_rows["candidate_build_argv_count"],
            "candidate build argv count",
        ),
        "candidateBuildArgvSha256":
            build_rows["candidate_build_argv_sha256"],
        "candidateBuildEnvCount": len(CANDIDATE_BUILD_ENV),
        "candidateBuildEnvSha256": framed_sha256(CANDIDATE_BUILD_ENV),
        "hardGateArgvCount": len(expected_target_argv),
        "hardGateArgvSha256": framed_sha256(expected_target_argv),
        "candidateReportSha256": sha256_bytes(report_raw), "candidateReportSize": len(report_raw),
        "bootstrapSeedSize": uint(candidate_manifest["bootstrap_seed_size"], "bootstrap seed size"),
        "bootstrapSeedSha256": candidate_manifest["bootstrap_seed_sha256"],
        "bootstrapSeedDevice": uint(candidate_manifest["bootstrap_seed_device"], "bootstrap seed device"),
        "bootstrapSeedInode": uint(candidate_manifest["bootstrap_seed_inode"], "bootstrap seed inode"),
        "candidateDevice": uint(candidate_manifest["candidate_device"], "candidate device"),
        "candidateInode": uint(candidate_manifest["candidate_inode"], "candidate inode"),
        "bootstrapReportSha256": sha256_bytes(report_payloads["bootstrap.report"]),
        "bootstrapColdReportSha256": sha256_bytes(report_payloads["bootstrap.cold.report"]),
        "currentStdoutSha256": sha256_bytes(report_payloads["current.stdout"]),
        "currentStderrSha256": sha256_bytes(report_payloads["current.stderr"]),
        "sourceProvenanceReportSha256": sha256_bytes(report_payloads["source.report"]),
        "currentReportExactKeyCount": len(current_report_keys),
        "currentReportExactKeyOrderSha256":
            current_report_exact_key_order_sha256(current_report_keys),
        "candidateMapSha256": sha256_bytes(report_payloads["candidate.map"]),
        "statusStdoutSha256": sha256_bytes(report_payloads["status.stdout"]),
        "sourceIdentityReceiptCid": source["source_identity_receipt_cid"],
        "semanticReceiptCid": source["semantic_receipt_cid"],
        "canonicalCompilerCsgCid": source["canonical_compiler_csg_cid"],
        "sourceToCsgBindingSeal": source["source_to_csg_binding_seal"],
        "compileReceiptCid": source["compile_receipt_cid"],
        "builderSha256": builder_report["builderSha256"],
        "workloadSha256": workload_sha,
        "gateSha256": gate_sha,
        "validatorSha256": validator_sha,
    }


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Recompute Linux builder/candidate identities from frozen raw bytes")
    parser.add_argument("--preflight-only", action="store_true")
    parser.add_argument("--target", required=True, choices=tuple(TARGET_SPECS))
    parser.add_argument("--entry", required=True)
    parser.add_argument("--evidence-dir")
    parser.add_argument("--aggregate-evidence-dir")
    parser.add_argument("--workspace-root")
    parser.add_argument("--source-closure")
    parser.add_argument("--driver")
    parser.add_argument("--build-receipt")
    parser.add_argument("--native-descriptor")
    parser.add_argument("--native-descriptor-sha256")
    parser.add_argument("--base-image-archive", required=True)
    parser.add_argument("--image-archive", required=True)
    parser.add_argument("--builder-report", required=True)
    parser.add_argument("--frozen-manifest", required=True)
    parser.add_argument("--output")
    return parser.parse_args(argv)


def main(argv: Sequence[str]) -> int:
    args = parse_args(argv)
    try:
        current_entry_spec(args.entry)
        if args.preflight_only:
            if any((
                args.evidence_dir,
                args.aggregate_evidence_dir,
                args.workspace_root,
                args.source_closure,
                args.driver,
                args.build_receipt,
                args.native_descriptor,
                args.native_descriptor_sha256,
                args.output,
            )):
                raise ValidationError("preflight-only does not accept evidence/output")
            image_info, _frozen, _raw, _report = preflight(args)
            print("cid_linux_current_source_candidate_preflight=passed")
            print(f"toolchain_image_id={image_info['imageId']}")
            print(f"toolchain_config_digest={image_info['configDigest']}")
            print(f"toolchain_oci_manifest_digest={image_info['ociManifestDigest']}")
            return 0
        required = {
            "--evidence-dir": args.evidence_dir,
            "--aggregate-evidence-dir": args.aggregate_evidence_dir,
            "--workspace-root": args.workspace_root,
            "--source-closure": args.source_closure,
            "--driver": args.driver,
            "--build-receipt": args.build_receipt,
            "--native-descriptor": args.native_descriptor,
            "--native-descriptor-sha256": args.native_descriptor_sha256,
            "--output": args.output,
        }
        missing = [key for key, value in required.items() if not value]
        if missing:
            raise ValidationError(
                "full validation inputs absent: " + ",".join(missing)
            )
        receipt = validate(args)
        write_receipt(Path(args.output), receipt)
        print("cid_linux_current_source_candidate_validation=passed")
        print(f"candidate_sha256={receipt['candidateSha256']}")
        print(f"validation_receipt={args.output}")
        return 0
    except (ValidationError, OSError, ValueError, KeyError, TypeError,
            subprocess.SubprocessError, tarfile.TarError, zlib.error) as exc:
        print(f"cid_linux_current_source_candidate_validation_error={exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
