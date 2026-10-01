#!/usr/bin/env python3
"""Darwin-safe structural contract for the unique kernel release gate."""

from __future__ import annotations

import argparse
import importlib.util
import os
import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace


def load(path: Path) -> ModuleType:
    specification = importlib.util.spec_from_file_location(
        "cheng_kernel_release_gate_contract_subject", path
    )
    if specification is None or specification.loader is None:
        raise RuntimeError("release_gate_import_unavailable")
    module = importlib.util.module_from_spec(specification)
    sys.modules[specification.name] = module
    specification.loader.exec_module(module)
    return module


def main() -> int:
    try:
        repo = Path(__file__).resolve(strict=True).parents[1]
        tool = repo / "tools" / "kernel_release_gate.py"
        module = load(tool)
        source = tool.read_text(encoding="utf-8")
        forbidden = (
            'parser.add_argument("--skip',
            'parser.add_argument("--rss-cap',
            'parser.add_argument("--cache-mode',
        )
        if any(fragment in source for fragment in forbidden):
            raise RuntimeError("caller_controlled_release_bypass_present")
        if module.USER_PATH_RSS_CAP_MIB != 200:
            raise RuntimeError("ordinary_rss_limit_drift")
        if module.SOURCE_SCOPES != ("bootstrap", "src", "tools"):
            raise RuntimeError("release_source_scope_drift")
        if "kernel-only" in module.RELEASE_TARGETS:
            raise RuntimeError("composition_kind_used_as_machine_target")
        if module.PLUGIN_COMPOSITION_ENTRIES != {
            "arm64-apple-darwin": "src/core/tooling/compiler_composition_aarch64_main.cheng",
            "x86_64-unknown-linux-gnu": "src/core/tooling/compiler_composition_x86_64_main.cheng",
            "riscv64-unknown-linux-gnu": "src/core/tooling/compiler_composition_riscv64_main.cheng",
        }:
            raise RuntimeError("composition_entry_unit_mapping_drift")
        if 'parser.add_argument("--compiler-composition-report", required=True)' not in source:
            raise RuntimeError("compiler_composition_report_not_required")
        scratch_raw = os.environ.get("CHENG_TASK_TMPDIR", "")
        if not scratch_raw:
            raise RuntimeError("scratch_scope_missing")
        scratch = Path(scratch_raw).resolve(strict=True)
        work = scratch / "environment"
        work.mkdir(mode=0o700)
        environment = module.release_environment(work)
        exact = {
            "BACKEND_BUILD_DRIVER_QUICK_SHARED_CACHE": "0",
            "BACKEND_BUILD_DRIVER_QUICK_STAMP_CACHE": "0",
            "BACKEND_INCREMENTAL": "0",
            "BACKEND_MULTI_MODULE_CACHE": "0",
            "CHENG_ENTRY_CACHE": "0",
            "CHENG_DISABLE_COLD_OBJECT_CACHE": "1",
            "CHENG_DISABLE_PRIMARY_OBJECT_CACHE": "1",
            "CHENG_DISABLE_PROVIDER_OBJECT_CACHE": "1",
            "CHENG_DISABLE_PURE_EXE_CACHE": "1",
            "CHENG_DISABLE_SYSTEM_LINK_EXEC_CACHE": "1",
            "CHENG_DISABLE_WINDOWS_PRIMARY_OBJECT_CACHE": "1",
            "CHENG_ENABLE_SYSTEM_LINK_EXEC_CACHE": "0",
            "CHENG_COMPILE_SKIP_CACHE_ROOT": "",
            "CHENG_CSGE_IR_CACHE_ROOT": "",
            "CHENG_CSG_PLUGIN_ALLOW_NETWORK": "0",
            "CHENG_CSG_TOOL_CACHE": "",
            "CHENG_NO_CACHE": "1",
            "CHENG_STRICT_NO_CACHE": "1",
            "CHENG_SYSTEM_LINK_EXEC_NO_CACHE": "1",
        }
        if any(environment.get(key) != value for key, value in exact.items()):
            raise RuntimeError("release_cache_off_environment_drift")

        class FakeReceiptModule:
            def __init__(self) -> None:
                self.source_manifest = "2" * 64

            def source_closure_identity(
                self, _root: str, _scopes: tuple[str, ...]
            ) -> tuple[str, str]:
                return "1" * 64, self.source_manifest

            def stable_file(self, _path: str, label: str) -> SimpleNamespace:
                if label == "release_compiler":
                    return SimpleNamespace(sha256="3" * 64, identity=(3,))
                if label == "release_python_interpreter":
                    return SimpleNamespace(sha256="4" * 64, identity=(4,))
                raise RuntimeError("unexpected_fake_stable_file_label:" + label)

        fake_receipt = FakeReceiptModule()
        fake_args = argparse.Namespace(source_root=repo, compiler=tool)
        frozen = module.release_execution_identity(fake_args, fake_receipt)
        module.require_release_execution_identity(
            frozen, fake_args, fake_receipt, "unchanged"
        )
        fake_receipt.source_manifest = "5" * 64
        try:
            module.require_release_execution_identity(
                frozen, fake_args, fake_receipt, "mutated"
            )
        except module.GateError:
            pass
        else:
            raise RuntimeError("release_execution_identity_mutation_accepted")
        if "initial_receipt_fields" not in source:
            raise RuntimeError("release_receipt_full_run_projection_missing")
        commands = module.gate_commands(
            repo / "artifacts" / "bootstrap" / "cheng.stage3"
        )
        labels = tuple(label for label, _command in commands)
        expected = (
            "export_duplicate",
            "closure_contract",
            "kernel_closure",
            "cold_cache_contract",
            "system_link_cache_contract",
            "plugin_cid_contract",
            "plugin_cache_contract",
            "plugin_trade_contract",
            "held_exec_contract",
            "release_receipt_contract",
            "user_path_guard_contract",
            "user_path_final",
        )
        if labels != expected:
            raise RuntimeError("release_gate_order_drift")
        user_command = commands[-1][1]
        required = (
            "--rss-cap-mib",
            "200",
            "--require-final-contract",
        )
        if any(item not in user_command for item in required):
            raise RuntimeError("user_path_release_contract_missing")
        closure_command = commands[2][1]
        if "--require-strict-closure" not in closure_command:
            raise RuntimeError("strict_closure_release_contract_missing")
        publication = scratch / "publication.kv"
        publication.write_bytes(b"first\n")
        identity = module.stable_identity(publication)
        module.remove_failed_publication(publication, identity)
        if publication.exists():
            raise RuntimeError("failed_publication_not_removed")
        publication.write_bytes(b"second\n")
        stale_identity = module.stable_identity(publication)
        replacement = scratch / "replacement.kv"
        replacement.write_bytes(b"second\n")
        os.replace(replacement, publication)
        try:
            module.remove_failed_publication(publication, stale_identity)
        except module.GateError:
            pass
        else:
            raise RuntimeError("replacement_publication_removed")
        if not publication.exists():
            raise RuntimeError("replacement_publication_missing")
        print("kernel_release_gate_contract_test_status=pass")
        return 0
    except (OSError, RuntimeError) as error:
        print("kernel_release_gate_contract_test_error=" + str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    if not os.environ.get("CHENG_TASK_TMPDIR"):
        repo = Path(__file__).resolve(strict=True).parents[1]
        runner = repo / "tools" / "cheng_scratch_scope.sh"
        raise SystemExit(
            os.spawnve(
                os.P_WAIT,
                str(runner),
                (
                    str(runner),
                    "kernel-release-gate-contract",
                    sys.executable,
                    str(Path(__file__).resolve(strict=True)),
                ),
                {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
            )
        )
    raise SystemExit(main())
