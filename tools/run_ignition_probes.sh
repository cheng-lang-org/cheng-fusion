#!/usr/bin/env bash
# run_ignition_probes.sh -- compile+run the ignition regression battery
# against one driver, PASS/FAIL each against its recorded expectRc.
#
# Sedimented after tripping over the same two footguns twice in one session
# while doing this by hand:
#   1. adv6_int32_boundary.cheng lives under fixtures/ignition/adversarial/,
#      every other default probe lives directly under fixtures/ignition/ --
#      a hand-written loop over `ls fixtures/ignition/*.cheng` silently skips
#      adv6 (wrong glob) or double-counts battery_out/ debris (too-greedy
#      glob). This script hardcodes each probe's path explicitly.
#   2. zsh word-splitting on paths/flags containing `:` (the `--root:X`
#      `--in:X` CLI flag style used by system-link-exec) breaks when built
#      via naive string concatenation in a for-loop body; this script always
#      quotes the whole flag as one token.
#
# Usage:
#   run_ignition_probes.sh <driver> <root> [manifest.json]
#
#   <driver>        compiler binary (backend_driver or any cheng.stageN)
#   <root>          --root: tree passed to system-link-exec (the compiler's
#                   own source tree, providing runtime/backend providers --
#                   e.g. /Users/lbcheng/cheng-lang). NOT the fixtures dir.
#   [manifest.json] optional override: JSON array of
#                   {"name":..., "path":... (relative to FIXTURES_DIR),
#                    "expectRc": N}. If omitted, uses the 11 built-in probes
#                   below plus the 5 T52-family fixtures landed alongside
#                   this tool (16 total).
#
# Env:
#   FIXTURES_DIR   base dir fixture paths are resolved against
#                  (default: /Users/lbcheng/cheng-fusion/fixtures/ignition)
#   PROBE_TARGET   --target: value (default: arm64-apple-darwin)
#   PROBE_OUT_DIR  scratch dir for compiled exes+logs (default: mktemp -d)
#
# Output: one PASS/FAIL line per probe, then a summary line
#   "run_ignition_probes_summary pass=<N> fail=<M> total=<N+M>"
# Exit codes: 0 = all probes passed; 1 = at least one FAIL; 2 = usage/setup error.
set -uo pipefail

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
    echo "usage: run_ignition_probes.sh <driver> <root> [manifest.json]" >&2
    exit 2
fi

DRIVER="$1"
ROOT="$2"
MANIFEST_OVERRIDE="${3:-}"

FIXTURES_DIR="${FIXTURES_DIR:-/Users/lbcheng/cheng-fusion/fixtures/ignition}"
PROBE_TARGET="${PROBE_TARGET:-arm64-apple-darwin}"
PROBE_OUT_DIR="${PROBE_OUT_DIR:-}"

[ -x "$DRIVER" ] || { echo "run_ignition_probes_error=driver_missing path=$DRIVER" >&2; exit 2; }
[ -d "$ROOT" ] || { echo "run_ignition_probes_error=root_missing path=$ROOT" >&2; exit 2; }
[ -d "$FIXTURES_DIR" ] || { echo "run_ignition_probes_error=fixtures_dir_missing path=$FIXTURES_DIR" >&2; exit 2; }

if [ -z "$PROBE_OUT_DIR" ]; then
    PROBE_OUT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/run_ignition_probes.XXXXXX")" || { echo "run_ignition_probes_error=mktemp_failed" >&2; exit 2; }
    CLEANUP_OUT_DIR=1
else
    mkdir -p "$PROBE_OUT_DIR" || { echo "run_ignition_probes_error=out_dir_create_failed path=$PROBE_OUT_DIR" >&2; exit 2; }
    CLEANUP_OUT_DIR=0
fi
cleanup() { [ "$CLEANUP_OUT_DIR" = "1" ] && rm -rf -- "$PROBE_OUT_DIR"; }
trap cleanup EXIT

# name|relative_path|expectRc  (pipe-delimited, one probe per line)
# Order matches the 11-item enumeration this tool was speced against:
# adv6,enumadd_probe,alias_regress_base,f47_probe_two_globals,
# a2_strimmvalue_offdesync,b3_global_str_regress,
# formB_ok_hoist_struct_misread,g4_bareptr_or_store,f4_str_nested_call_arg,
# triv_station,vardecl5_station -> 7/7/7/7/0/0/46/0/0/7/5 ; plus the 5
# T52-family fixtures landed in the same batch as this tool; their
# oracle-measured rc contracts now live in fixtures/ignition/matrix.json.
BUILTIN_MANIFEST="
adv6_int32_boundary|adversarial/adv6_int32_boundary.cheng|7
enumadd_probe|enumadd_probe.cheng|7
alias_regress_base|alias_regress_base.cheng|7
f47_probe_two_globals|f47_probe_two_globals.cheng|7
a2_strimmvalue_offdesync|a2_strimmvalue_offdesync.cheng|0
b3_global_str_regress|b3_global_str_regress.cheng|0
formB_ok_hoist_struct_misread|formB_ok_hoist_struct_misread.cheng|46
g4_bareptr_or_store|g4_bareptr_or_store.cheng|0
f4_str_nested_call_arg|f4_str_nested_call_arg.cheng|0
triv_station|triv_station.cheng|7
vardecl5_station|vardecl5_station.cheng|5
t52a_return_call_double_exec|t52a_return_call_double_exec.cheng|1
t52b_return_call_noif|t52b_return_call_noif.cheng|1
t52c_return_binop_embedded_call|t52c_return_binop_embedded_call.cheng|1
t52d_return_fieldarg|t52d_return_fieldarg.cheng|7
t52e_return_cstring_mirror|t52e_return_cstring_mirror.cheng|7
"

if [ -n "$MANIFEST_OVERRIDE" ]; then
    [ -f "$MANIFEST_OVERRIDE" ] || { echo "run_ignition_probes_error=manifest_missing path=$MANIFEST_OVERRIDE" >&2; exit 2; }
    MANIFEST_LINES="$(python3 -c '
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
for e in data:
    print(f"{e[\"name\"]}|{e[\"path\"]}|{e[\"expectRc\"]}")
' "$MANIFEST_OVERRIDE")" || { echo "run_ignition_probes_error=manifest_parse_failed path=$MANIFEST_OVERRIDE" >&2; exit 2; }
else
    MANIFEST_LINES="$BUILTIN_MANIFEST"
fi

unset CHENG_NO_BACKEND_DRIVER_HANDOFF
unset CHENG_REQUIRE_PURE_PROVIDERS
export CHENG_PROCESS_MAX_RSS_BYTES="${CHENG_PROCESS_MAX_RSS_BYTES:-12884901888}"

PASS_COUNT=0
FAIL_COUNT=0

while IFS='|' read -r name relpath expect; do
    [ -z "$name" ] && continue
    src="$FIXTURES_DIR/$relpath"
    if [ ! -f "$src" ]; then
        echo "FAIL $name reason=fixture_missing path=$src"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        continue
    fi
    outexe="$PROBE_OUT_DIR/${name}.exe"
    rm -f "$outexe"
    "$DRIVER" system-link-exec --root:"$ROOT" --in:"$src" --emit:exe --link-providers --target:"$PROBE_TARGET" --out:"$outexe" \
        >"$PROBE_OUT_DIR/${name}.compile.log" 2>&1
    comprc=$?
    if [ "$comprc" -ne 0 ]; then
        echo "FAIL $name reason=compile_rc=$comprc expect=$expect log=$PROBE_OUT_DIR/${name}.compile.log"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        continue
    fi
    if [ ! -x "$outexe" ]; then
        echo "FAIL $name reason=exe_not_produced expect=$expect log=$PROBE_OUT_DIR/${name}.compile.log"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        continue
    fi
    "$outexe"
    runrc=$?
    if [ "$runrc" = "$expect" ]; then
        echo "PASS $name rc=$runrc"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "FAIL $name reason=rc_mismatch got=$runrc expect=$expect"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
done <<< "$MANIFEST_LINES"

TOTAL=$((PASS_COUNT + FAIL_COUNT))
echo "run_ignition_probes_summary pass=$PASS_COUNT fail=$FAIL_COUNT total=$TOTAL"
[ "$FAIL_COUNT" -eq 0 ] && exit 0 || exit 1
