#!/usr/bin/env bash
# cov_diff.sh -- 发射臂覆盖差分: function-coverage differ for two binaries
# on the same workload.
#
# Sedimented from the T60 campaign (2026-07-15). After gen2_symbolize.sh the
# remaining bisect class was "which never-trodden code did the patch newly
# activate?" (T60: red bailed early on a machoReadObject miscompile; green
# fixed it, crossed the false-positive bail, and first-ever entered
# MachoProviderLinkExe's real path where a deeper latent defect crashed --
# the crashing function was byte-identical in both binaries, so symbol/byte
# diffing could never find it). Coverage diffing finds exactly this:
# newly-covered functions ARE the activated arms. Zero compiler-source
# instrumentation; works on any Cheng binary with a symtab (DRV, GEN2,
# fixture exes). At gen1 this pre-empts bisect BAKES: run baseline DRV and
# patched DRV over the same compile workload (~seconds) instead of baking
# GEN2 pairs (~20min each).
#
# Usage:
#   cov_diff.sh <binA> <binB> <outdir> [--timeout SEC] \
#               [--objA <a.primary.o>] [--objB <b.primary.o>] -- <argv...>
#
# Symbol source: Cheng-linked exes have no symtab; symbols come from the
# sibling <bin>.primary.o by artifact convention (auto-detected), or an
# explicit --objA/--objB. cov_trace.py byte-verifies the obj->exe text
# mapping (reloc-masked) and hard-fails if unproven.
#
#   <binA>/<binB>  the "before"/"after" binaries (same workload semantics)
#   <outdir>       report dir; also usable inside argv via {OUT}
#   argv tokens:   {SIDE} -> A|B, {OUT} -> outdir  (keeps per-side outputs
#                  from clobbering each other, e.g. --out:{OUT}/x_{SIDE}.exe)
#
# Workload cwd = <outdir> (Cheng drivers create artifacts/ relative to cwd).
# Environment is inherited -- set campaign env (CHENG_PROCESS_MAX_RSS_BYTES
# etc.) before calling. /usr/bin/comm used directly (PATH diff-shim lesson).
#
# Output: summary on stdout --
#   newly_covered: <fn>   (B entered it, A never did -- activated arm)
#   lost:          <fn>   (A entered it, B never did)
# plus per-side status/crash lines. Full sets in <outdir>/cov_A.txt, cov_B.txt.
#
# Exit: 0 = both sides traced (regardless of diff content), 2 = usage,
#       3 = a side failed to trace (launch failure etc.; timeout/crash of the
#       WORKLOAD is still a completed trace, not a failure).
set -uo pipefail

if [ "$#" -lt 4 ]; then
    echo "usage: cov_diff.sh <binA> <binB> <outdir> [--timeout SEC] -- <workload argv...>" >&2
    exit 2
fi
HERE="$(cd "$(dirname "$0")" && pwd)"
TRACE="$HERE/cov_trace.py"
[ -f "$TRACE" ] || { echo "cov_diff_error=cov_trace_missing path=$TRACE" >&2; exit 2; }

BIN_A="$1"; BIN_B="$2"; OUTDIR="$3"; shift 3
TIMEOUT=600
OBJ_A=""; OBJ_B=""
while :; do
    case "${1:-}" in
        --timeout) TIMEOUT="$2"; shift 2 ;;
        --objA)    OBJ_A="$2";   shift 2 ;;
        --objB)    OBJ_B="$2";   shift 2 ;;
        --) shift; break ;;
        *) break ;;
    esac
done
# Cheng-linked exes carry no symtab; the campaign artifact convention is a
# sibling <bin>.primary.o -- use it when present and no explicit --obj given.
[ -z "$OBJ_A" ] && [ -f "$BIN_A.primary.o" ] && OBJ_A="$BIN_A.primary.o"
[ -z "$OBJ_B" ] && [ -f "$BIN_B.primary.o" ] && OBJ_B="$BIN_B.primary.o"
[ -x "$BIN_A" ] || { echo "cov_diff_error=bin_a_not_executable path=$BIN_A" >&2; exit 2; }
[ -x "$BIN_B" ] || { echo "cov_diff_error=bin_b_not_executable path=$BIN_B" >&2; exit 2; }
mkdir -p "$OUTDIR" || exit 2
OUTDIR="$(cd "$OUTDIR" && pwd)"
PYLLDB="$(lldb -P)"

run_side() {
    local side="$1" bin="$2"; shift 2
    local args=() tok
    for tok in "$@"; do
        tok="${tok//\{SIDE\}/$side}"
        tok="${tok//\{OUT\}/$OUTDIR}"
        args+=("$tok")
    done
    local objflag=()
    if [ "$side" = A ] && [ -n "$OBJ_A" ]; then objflag=(--obj "$OBJ_A"); fi
    if [ "$side" = B ] && [ -n "$OBJ_B" ]; then objflag=(--obj "$OBJ_B"); fi
    PYTHONPATH="$PYLLDB" /usr/bin/python3 "$TRACE" \
        --bin "$bin" "${objflag[@]}" --out "$OUTDIR/cov_$side.txt" \
        --cwd "$OUTDIR" --timeout "$TIMEOUT" -- "${args[@]}"
}

run_side A "$BIN_A" "$@" || { echo "cov_diff_error=side_A_trace_failed" >&2; exit 3; }
run_side B "$BIN_B" "$@" || { echo "cov_diff_error=side_B_trace_failed" >&2; exit 3; }

grep '^cov_covered=' "$OUTDIR/cov_A.txt" | sed 's/^cov_covered=//' | sort -u > "$OUTDIR/A.set"
grep '^cov_covered=' "$OUTDIR/cov_B.txt" | sed 's/^cov_covered=//' | sort -u > "$OUTDIR/B.set"

NEW_N=$(/usr/bin/comm -13 "$OUTDIR/A.set" "$OUTDIR/B.set" | wc -l | tr -d ' ')
LOST_N=$(/usr/bin/comm -23 "$OUTDIR/A.set" "$OUTDIR/B.set" | wc -l | tr -d ' ')
echo "cov_diff_newly_covered_count=$NEW_N"
echo "cov_diff_lost_count=$LOST_N"
for side in A B; do
    for key in cov_status cov_exit cov_stop cov_crash_frame cov_covered_count; do
        v=$(grep -m1 "^$key=" "$OUTDIR/cov_$side.txt" | sed "s/^$key=//")
        [ -n "$v" ] && echo "${side}_${key#cov_}=$v"
    done
done
echo "=== newly_covered (B only -- activated arms) ==="
/usr/bin/comm -13 "$OUTDIR/A.set" "$OUTDIR/B.set" | sed 's/^/newly_covered: /'
echo "=== lost (A only) ==="
/usr/bin/comm -23 "$OUTDIR/A.set" "$OUTDIR/B.set" | sed 's/^/lost: /'
exit 0
