#!/usr/bin/env bash
# zc_census_diff.sh -- bail-signature A/B differ for two backend_driver
# binaries against the same source file.
#
# Sedimented from a repeated manual step in the T52/chain2x campaigns: after
# every patch candidate, the operator ran tools/zc_enumerate.sh once per
# driver, eyeballed two "zc_rows" blocks, and hand-diffed function names to
# answer "did this patch introduce a new not_ready function, or heal one, or
# leave the census unchanged?" Done by hand 3 times this session alone; this
# script does it in one shot.
#
# It is a thin wrapper: all measurement honesty (cache integrity, ABORT ==
# false-green gate, driver pinning, three-way count match) is delegated to
# the canonical tools/zc_enumerate.sh (see feedback_zc_enumerate_canonical
# lesson -- bail/ZC counts measured any other way are not trustworthy). This
# script never re-implements census logic, it only diffs two of that tool's
# zc_rows outputs.
#
# Usage:
#   zc_census_diff.sh <root> <driverA> <driverB> <source.cheng>
#
#   <root>     path to the Cheng repo containing tools/zc_enumerate.sh
#              (e.g. /Users/lbcheng/cheng-lang)
#   <driverA>  path to backend_driver binary #1 (the "before" side)
#   <driverB>  path to backend_driver binary #2 (the "after" side)
#   <source>   source file, relative to <root> or absolute (passed through
#              to zc_enumerate.sh verbatim)
#
# Output: three labeled sections on stdout --
#   introduced: <function>   (present in B's zc_rows, absent from A's -- new
#                              not_ready function, i.e. a regression if B is
#                              "after a patch")
#   healed:     <function>   (present in A's, absent from B's -- fixed)
#   common:     <function>   (present in both -- unchanged bail-blocked)
# Function identity is keyed on the zc_rows function-name field (column 1 of
# the pipe-delimited row) only, not the full row -- a function whose bail
# number changed between A and B still counts as the same function for
# introduced/healed purposes and appears in neither list, only "common"
# (its row line is printed with both bail numbers so the change is visible).
#
# Exit codes: 0 = ran to completion (regardless of diff content),
#             2 = usage error, 3 = zc_enumerate.sh did not reach zc_status=completed
#             for one or both drivers (prints the raw abort output, does not
#             guess a diff from a non-census run).
set -uo pipefail

if [ "$#" -ne 4 ]; then
    echo "usage: zc_census_diff.sh <root> <driverA> <driverB> <source.cheng>" >&2
    exit 2
fi

ROOT="$1"
DRIVER_A="$2"
DRIVER_B="$3"
SOURCE="$4"

ENUM="$ROOT/tools/zc_enumerate.sh"
[ -x "$ENUM" ] || { echo "zc_census_diff_error=zc_enumerate_missing_or_not_executable path=$ENUM" >&2; exit 2; }
[ -x "$DRIVER_A" ] || { echo "zc_census_diff_error=driver_a_missing path=$DRIVER_A" >&2; exit 2; }
[ -x "$DRIVER_B" ] || { echo "zc_census_diff_error=driver_b_missing path=$DRIVER_B" >&2; exit 2; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/zc_census_diff.XXXXXX")" || { echo "zc_census_diff_error=mktemp_failed" >&2; exit 2; }
trap 'rm -rf -- "$WORK"' EXIT

run_one() {
    local driver="$1" out="$2"
    ( cd "$ROOT" && ZC_DRIVER="$driver" ZC_NO_CACHE=1 "$ENUM" "$SOURCE" ) >"$out" 2>&1
}

run_one "$DRIVER_A" "$WORK/a.out"
run_one "$DRIVER_B" "$WORK/b.out"

extract_rows() {
    # Print only the indented rows following the "zc_rows (...)" header line,
    # stripped of leading whitespace. Empty if census reported zero missing.
    awk '
        /^zc_rows \(/ { in_rows=1; next }
        in_rows && /^zc_cache=/ { in_rows=0 }
        in_rows { sub(/^  /, ""); print }
    ' "$1"
}

for side in a b; do
    if ! grep -q '^zc_status=completed$' "$WORK/$side.out"; then
        echo "zc_census_diff_error=zc_enumerate_did_not_complete side=$side" >&2
        echo "--- raw output ($side) ---" >&2
        cat "$WORK/$side.out" >&2
        exit 3
    fi
done

extract_rows "$WORK/a.out" >"$WORK/a.rows"
extract_rows "$WORK/b.out" >"$WORK/b.rows"

# key = function name (field 1); value = full row line.
awk -F'|' '{print $1}' "$WORK/a.rows" | sort -u >"$WORK/a.keys"
awk -F'|' '{print $1}' "$WORK/b.rows" | sort -u >"$WORK/b.keys"

echo "=== introduced (in B, not in A) ==="
comm -13 "$WORK/a.keys" "$WORK/b.keys" | while IFS= read -r fn; do
    [ -z "$fn" ] && continue
    echo "introduced: $fn"
    grep -m1 "^${fn}|" "$WORK/b.rows" | sed 's/^/    B: /'
done

echo "=== healed (in A, not in B) ==="
comm -23 "$WORK/a.keys" "$WORK/b.keys" | while IFS= read -r fn; do
    [ -z "$fn" ] && continue
    echo "healed: $fn"
    grep -m1 "^${fn}|" "$WORK/a.rows" | sed 's/^/    A: /'
done

echo "=== common (in both) ==="
comm -12 "$WORK/a.keys" "$WORK/b.keys" | while IFS= read -r fn; do
    [ -z "$fn" ] && continue
    echo "common: $fn"
    grep -m1 "^${fn}|" "$WORK/a.rows" | sed 's/^/    A: /'
    grep -m1 "^${fn}|" "$WORK/b.rows" | sed 's/^/    B: /'
done

exit 0
