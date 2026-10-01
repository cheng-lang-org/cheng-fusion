#!/usr/bin/env python3
"""无磁盘夹具的严格内核闭包负例自测。"""

from pathlib import Path

import kernel_plugin_closure_check as gate


def main() -> int:
    root = Path("/fixture")
    entry = root / "src/core/tooling/entry.cheng"
    facade = root / "src/core/backend/facade.cheng"
    arch = root / "src/core/backend/aarch64_encode.cheng"
    unused = root / "src/core/runtime/unused.cheng"

    edges = {
        entry: [facade],
        facade: [arch],
        arch: [],
        unused: [],
    }
    reachable, parents = gate.reachable_core_closure([entry], edges)
    hits = gate.arch_reachable_paths(reachable, parents, {arch: "aarch64"})
    assert len(hits) == 1
    assert hits[0][0] == arch
    assert hits[0][1] == [entry, facade, arch]

    assert gate.architecture_tokens_in_code_line("# aarch64 comment") == ()
    assert gate.architecture_tokens_in_code_line(
        'let target = "arm64-apple-darwin" # x86_64 comment'
    ) == ("arm64",)

    manifest_only, unmanifested = gate.manifest_closure_diff(
        {entry, unused}, reachable
    )
    assert manifest_only == [unused]
    assert unmanifested == sorted([facade, arch])

    print(
        "kernel-plugin-closure-selftest: PASS "
        "(indirect_arch=1 token_negative=1 manifest_drift=1)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
