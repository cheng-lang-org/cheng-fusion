#!/usr/bin/env python3
"""Offline mutations for the current Lifetime/ORC Linux cgroup-v2 gate."""

from __future__ import annotations

import ast
import importlib.util
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve(strict=True).parents[1]
TOOL = ROOT / "tools/lifetime_orc_linux_cgroup_v2_hard_memory_gate.py"
WRAPPER = ROOT / "tools/lifetime_orc_linux_cgroup_v2_hard_memory_gate.sh"


def load() -> Any:
    spec = importlib.util.spec_from_file_location(
        "lifetime_orc_linux_hard_memory_contract", TOOL
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("gate module cannot be loaded")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


gate = load()
source = TOOL.read_text(encoding="utf-8")
ast.parse(source)
for token in (
    "LIMIT_BYTES = 1_073_741_824",
    "SWAP_MAX_BYTES = 0",
    'PROOF_STATUS = "proved_linux_kernel_cgroup_v2_aggregate"',
    'PROCESS_SCOPE = "cgroup_and_all_descendants"',
    "memory.max",
    "memory.swap.max",
    "memory.swap.current",
    "memory.peak",
    "memory.events",
    "cgroup.procs",
    "cgroup.kill",
    "os.pidfd_open",
    "LIFETIME_GATE",
    "ORC_GATE",
    '"userSpaceSamplingAuthority": 0',
):
    if token not in source:
        raise RuntimeError(f"required hard-memory token missing: {token}")
for forbidden in (
    "getrusage",
    "resource.RUSAGE",
    "/proc/self/status",
    "psutil",
    "time.sleep(",
    "fallback",
    "schema_version",
):
    if forbidden.lower() in source.lower():
        raise RuntimeError(f"forbidden sampling/compat token present: {forbidden}")

lifetime_source = gate.LIFETIME_GATE.read_text(encoding="utf-8")
orc_source = gate.ORC_GATE.read_text(encoding="utf-8")
for target in (
    "x86_64-unknown-linux-gnu",
    "aarch64-unknown-linux-gnu",
):
    if target not in lifetime_source or target not in orc_source:
        raise RuntimeError(f"Linux dynamic target absent: {target}")


def expect_rejected(action: Any, label: str) -> None:
    try:
        action()
    except (gate.GateError, OSError, ValueError):
        return
    raise RuntimeError(f"mutation accepted: {label}")


events = {
    "low": 0,
    "high": 0,
    "max": 0,
    "oom": 0,
    "oom_kill": 0,
    "oom_group_kill": 0,
}
snapshot = {
    "proofStatus": gate.PROOF_STATUS,
    "scope": gate.PROCESS_SCOPE,
    "memoryMax": gate.LIMIT_BYTES,
    "memorySwapMax": 0,
    "memoryOomGroup": 1,
    "memorySwapCurrent": 0,
    "vmSwapTotal": 0,
    "memoryPeak": 1,
    "events": events,
}
gate.validate_cgroup_contract(snapshot)
cgroup_mutations = (
    ("memory_max", "memoryMax", gate.LIMIT_BYTES + 1),
    ("memory_max_bool", "memoryMax", True),
    ("swap_max", "memorySwapMax", 1),
    ("oom_group", "memoryOomGroup", 0),
    ("swap_current", "memorySwapCurrent", 1),
    ("vm_swap", "vmSwapTotal", 1),
    ("memory_peak", "memoryPeak", gate.LIMIT_BYTES + 1),
    ("proof", "proofStatus", "userspace_sample"),
    ("scope", "scope", "single_process"),
    (
        "event_keys",
        "events",
        {key: value for key, value in events.items() if key != "oom"},
    ),
)
for label, key, value in cgroup_mutations:
    candidate = dict(snapshot)
    candidate[key] = value
    expect_rejected(
        lambda candidate=candidate: gate.validate_cgroup_contract(candidate),
        label,
    )

driver_sha = "1" * 64
lifetime_driver = {"sha256": driver_sha}
lifetime_lines = [
    "lifetime_ledger_dynamic_mutation_status=pass",
    "lifetime_ledger_dynamic_mutation_schema=current",
    "lifetime_ledger_dynamic_mutation_driver_role=production",
    "lifetime_ledger_dynamic_mutation_driver_path=" + str(gate.LIFETIME_DRIVER),
    "lifetime_ledger_dynamic_mutation_backend_cycles_per_path=5000",
    "lifetime_ledger_dynamic_mutation_backend_success_live=0",
    "lifetime_ledger_dynamic_mutation_backend_failure_live=0",
    "lifetime_ledger_dynamic_mutation_mutations=16",
    "lifetime_ledger_dynamic_mutation_compile_contract=all_mutations_compile",
    "lifetime_ledger_dynamic_mutation_runtime_contract=all_mutations_hard_red",
    "lifetime_ledger_dynamic_mutation_target=x86_64-unknown-linux-gnu",
    "lifetime_ledger_dynamic_mutation_compiler_hash=" + driver_sha,
    "lifetime_ledger_dynamic_mutation_source_tree_hash=" + "2" * 64,
    "lifetime_ledger_dynamic_mutation_backend_success_allocated=5000",
    "lifetime_ledger_dynamic_mutation_backend_success_released=5000",
    "lifetime_ledger_dynamic_mutation_backend_failure_allocated=5000",
    "lifetime_ledger_dynamic_mutation_backend_failure_released=5000",
    "lifetime_ledger_dynamic_mutation_backend_success_physical_released=5000",
    "lifetime_ledger_dynamic_mutation_backend_failure_physical_released=5000",
    "lifetime_ledger_dynamic_mutation_release_evidence=0",
]
lifetime_lines.extend(
    (
        "lifetime_ledger_dynamic_mutation_case="
        f"{mutation},compile=pass,runtime=red"
    )
    for mutation in gate.LIFETIME_MUTATION_DIAGNOSTICS
)
lifetime_lines.extend(
    (
        "lifetime_ledger_dynamic_mutation_diagnostic="
        f"{mutation},id={diagnostic}"
    )
    for mutation, diagnostic in gate.LIFETIME_MUTATION_DIAGNOSTICS.items()
)
lifetime_raw = ("\n".join(lifetime_lines) + "\n").encode()
gate.validate_lifetime_output(
    lifetime_raw,
    lifetime_driver,
    "x86_64-unknown-linux-gnu",
)
lifetime_mutations = (
    ("lifetime_status", "status=pass", "status=HARD_RED"),
    ("lifetime_live", "backend_success_live=0", "backend_success_live=1"),
    ("lifetime_cycles", "cycles_per_path=5000", "cycles_per_path=4999"),
    ("lifetime_alloc_free", "success_released=5000", "success_released=4999"),
    ("lifetime_driver", driver_sha, "3" * 64),
    ("lifetime_release", "release_evidence=0", "release_evidence=1"),
    (
        "lifetime_diagnostic",
        "released_physical_bytes,id=backend2_terminal_ledger_mismatch",
        "released_physical_bytes,id=backend_sanitizer_physical_release_mismatch",
    ),
)
for label, old, new in lifetime_mutations:
    candidate = lifetime_raw.replace(old.encode(), new.encode(), 1)
    expect_rejected(
        lambda candidate=candidate: gate.validate_lifetime_output(
            candidate,
            lifetime_driver,
            "x86_64-unknown-linux-gnu",
        ),
        label,
    )
duplicate_diagnostic = (
    lifetime_raw
    + (
        "lifetime_ledger_dynamic_mutation_diagnostic="
        "released_physical_bytes,id=backend2_terminal_ledger_mismatch\n"
    ).encode()
)
expect_rejected(
    lambda: gate.validate_lifetime_output(
        duplicate_diagnostic,
        lifetime_driver,
        "x86_64-unknown-linux-gnu",
    ),
    "lifetime_duplicate_diagnostic",
)

orc_driver = {"sha256": driver_sha}
orc_lines = [
    "orc_atomic_release_static_contract=pass",
    "orc_atomic_release_static_mutation_count=38",
    "orc_atomic_release_static_entry_roots=2",
    "orc_atomic_release_contract_gate_status=pass",
    "orc_atomic_release_contract_gate_schema=current",
    "orc_atomic_release_contract_gate_driver_role=production",
    "orc_atomic_release_contract_gate_compiler_hash=" + driver_sha,
    "orc_atomic_release_contract_gate_backend_count=2",
    "orc_atomic_release_contract_gate_success_iterations_per_backend=5000",
    "orc_atomic_release_contract_gate_failure_cases_per_backend=8",
    "orc_atomic_release_contract_gate_alloc_free_live=exact",
    "orc_atomic_release_contract_gate_target=x86_64-unknown-linux-gnu",
    "orc_atomic_release_contract_gate_source_hash=" + "4" * 64,
    "orc_atomic_release_contract_gate_release_evidence=0",
]
orc_raw = ("\n".join(orc_lines) + "\n").encode()
gate.validate_orc_output(orc_raw, orc_driver, "x86_64-unknown-linux-gnu")
orc_mutations = (
    ("orc_status", "gate_status=pass", "gate_status=HARD_RED"),
    ("orc_iterations", "backend=5000", "backend=4999"),
    ("orc_failures", "backend=8", "backend=7"),
    ("orc_driver", driver_sha, "5" * 64),
    ("orc_release", "release_evidence=0", "release_evidence=1"),
)
for label, old, new in orc_mutations:
    candidate = orc_raw.replace(old.encode(), new.encode(), 1)
    expect_rejected(
        lambda candidate=candidate: gate.validate_orc_output(
            candidate,
            orc_driver,
            "x86_64-unknown-linux-gnu",
        ),
        label,
    )

with tempfile.TemporaryDirectory(prefix="lifetime-orc-hard-memory-contract.") as raw:
    temporary = Path(raw).resolve(strict=True)
    expect_rejected(
        lambda: gate.require_current_file(
            temporary / "missing-driver",
            "current_driver",
            True,
        ),
        "missing driver",
    )
    expect_rejected(
        lambda: gate.require_cgroup_parent(temporary),
        "missing cgroup delegation",
    )

completed = subprocess.run(
    [str(WRAPPER)],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    check=False,
)
if completed.returncode == 0:
    raise RuntimeError("missing required arguments were accepted")
stderr = completed.stderr.decode("utf-8", "strict").splitlines()
if "lifetime_orc_linux_hard_memory_status=HARD_RED" not in stderr:
    raise RuntimeError("argument fail-stop did not emit HARD_RED")
if "production_release_status=HARD_RED" not in stderr:
    raise RuntimeError("argument fail-stop did not block release")
if any("status=pass" in line for line in stderr):
    raise RuntimeError("argument fail-stop emitted fake pass")

print("lifetime_orc_linux_hard_memory_contract_test=PASS")
print(
    "lifetime_orc_linux_hard_memory_contract_mutations="
    f"{len(cgroup_mutations) + len(lifetime_mutations) + len(orc_mutations)}"
)
print("lifetime_orc_linux_hard_memory_dynamic_run=not_run")
