#!/usr/bin/env bash
# tree_guard.sh -- detect silent drift on a shared/multi-session working tree
# between "snapshot before a long chain run" and "verify before trusting
# that chain's verdict."
#
# Lesson: chain28/chain29 (2026-07-14) each ran a ~30-minute cold-bake chain
# against a shared tree that a concurrent session mutated mid-run; both
# chains' final judgements were read against a tree state that no longer
# matched what was actually compiled, wasting both burns. A cheap
# git-porcelain-plus-content-hash snapshot at ignition time, re-checked
# before reading the verdict, would have caught this in seconds instead of
# discovering it after the fact.
#
# Also hardcodes /usr/bin/diff and /usr/bin/cmp (see
# feedback/diff_shim_always_zero_trap): this host's PATH `diff` resolves to
# a DevEco-Studio-bundled shim that silently exits 0 with zero output even
# when its two inputs genuinely differ -- byte comparison here must never
# rely on an unqualified `diff`/`cmp`.
#
# Usage:
#   tree_guard.sh snapshot <tree>
#   tree_guard.sh verify <tree>
#
# What "snapshot" records: `git status --porcelain=v1` (untracked/modified/
# staged file list, not their content) plus a sha256 of every regular file
# under <tree>/src (the actual compiled-from source, the part that changing
# mid-bake would silently invalidate a verdict). Manifest is written to
# <tree>/.tree_guard_manifest by default.
#
# Env:
#   TREE_GUARD_MANIFEST=<path>   write/read the manifest at this path
#                                instead of <tree>/.tree_guard_manifest --
#                                REQUIRED when <tree> must stay zero-write
#                                (e.g. a read-only-hardened reference tree):
#                                point it at a scratch location outside the
#                                tree and this script never writes inside
#                                <tree> at all.
#
# Exit codes:
#   snapshot: 0 = written; 2 = usage/tree error
#   verify:   0 = no drift; 1 = drift detected (file list printed to stdout);
#             2 = usage/tree error; 3 = no snapshot found to verify against
set -uo pipefail

if [ "$#" -ne 2 ]; then
    echo "usage: tree_guard.sh {snapshot|verify} <tree>" >&2
    exit 2
fi

MODE="$1"
TREE="$2"

[ -d "$TREE" ] || { echo "tree_guard_error=tree_missing path=$TREE" >&2; exit 2; }
TREE="$(cd "$TREE" && pwd)"
MANIFEST="${TREE_GUARD_MANIFEST:-$TREE/.tree_guard_manifest}"

compute_git_porcelain() {
    if [ -d "$TREE/.git" ] || git -C "$TREE" rev-parse --git-dir >/dev/null 2>&1; then
        git -C "$TREE" status --porcelain=v1 2>/dev/null | LC_ALL=C sort
    else
        echo "# not_a_git_repo"
    fi
}

compute_src_shas() {
    if [ -d "$TREE/src" ]; then
        find "$TREE/src" -type f -print0 | LC_ALL=C sort -z | xargs -0 shasum -a 256
    else
        echo "# no_src_dir"
    fi
}

case "$MODE" in
    snapshot)
        MANIFEST_DIR="$(dirname "$MANIFEST")"
        mkdir -p "$MANIFEST_DIR" || { echo "tree_guard_error=manifest_dir_create_failed path=$MANIFEST_DIR" >&2; exit 2; }
        TMP="$(mktemp "$MANIFEST_DIR/.tree_guard_manifest.tmp.XXXXXX")" || { echo "tree_guard_error=mktemp_failed" >&2; exit 2; }
        {
            echo "schema=tree_guard_manifest"
            echo "tree=$TREE"
            echo "snapshot_epoch=$(date +%s)"
            echo "--- git_porcelain ---"
            compute_git_porcelain
            echo "--- src_sha256 ---"
            compute_src_shas
        } >"$TMP" || { rm -f "$TMP"; echo "tree_guard_error=snapshot_write_failed" >&2; exit 2; }
        mv -f "$TMP" "$MANIFEST" || { rm -f "$TMP"; echo "tree_guard_error=manifest_publish_failed" >&2; exit 2; }
        echo "tree_guard_snapshot=written manifest=$MANIFEST"
        exit 0
        ;;
    verify)
        [ -f "$MANIFEST" ] || { echo "tree_guard_error=no_snapshot_found manifest=$MANIFEST" >&2; exit 3; }
        CUR="$(mktemp "${TMPDIR:-/tmp}/tree_guard_verify.XXXXXX")" || { echo "tree_guard_error=mktemp_failed" >&2; exit 2; }
        trap 'rm -f "$CUR"' EXIT
        {
            echo "schema=tree_guard_manifest"
            echo "tree=$TREE"
            echo "snapshot_epoch=0"
            echo "--- git_porcelain ---"
            compute_git_porcelain
            echo "--- src_sha256 ---"
            compute_src_shas
        } >"$CUR"

        # Compare everything except the snapshot_epoch line (expected to differ).
        # NOTE: uses plain temp files, not `diff <(...) <(...)` process
        # substitution -- verified on this host's bash that /dev/fd-based
        # process substitution can silently no-op inside this harness's
        # sandbox (diff of two genuinely different here-strings returned
        # rc=0), so this script never relies on it.
        OLD_TMP="$(mktemp "${TMPDIR:-/tmp}/tree_guard_old.XXXXXX")" || { echo "tree_guard_error=mktemp_failed" >&2; exit 2; }
        NEW_TMP="$(mktemp "${TMPDIR:-/tmp}/tree_guard_new.XXXXXX")" || { rm -f "$OLD_TMP"; echo "tree_guard_error=mktemp_failed" >&2; exit 2; }
        trap 'rm -f "$CUR" "$OLD_TMP" "$NEW_TMP"' EXIT
        grep -v '^snapshot_epoch=' "$MANIFEST" >"$OLD_TMP"
        grep -v '^snapshot_epoch=' "$CUR" >"$NEW_TMP"

        if /usr/bin/cmp -s "$OLD_TMP" "$NEW_TMP"; then
            echo "tree_guard_verify=clean tree=$TREE manifest=$MANIFEST"
            exit 0
        fi

        echo "tree_guard_verify=DRIFT tree=$TREE manifest=$MANIFEST"
        echo "--- drifted lines (manifest vs current) ---"
        /usr/bin/diff "$OLD_TMP" "$NEW_TMP" || true
        exit 1
        ;;
    *)
        echo "usage: tree_guard.sh {snapshot|verify} <tree>" >&2
        exit 2
        ;;
esac
