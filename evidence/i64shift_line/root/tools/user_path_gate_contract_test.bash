#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
if [ -z "${CHENG_TASK_TMPDIR:-}" ]; then
    exec "$ROOT/tools/cheng_scratch_scope.sh" user-path-gate-contract \
        "$ROOT/tools/user_path_gate_contract_test.bash"
fi

GATE="$ROOT/tools/user_path_gate.sh"
DRIVER="$ROOT/tools/user_path_gate_fake_driver_contract_test.bash"
CURRENT="$ROOT/tools/testdata/user_path_gate/current.tsv"
FINAL="$ROOT/tools/testdata/user_path_gate/final.tsv"
PROBE_GREEN="$ROOT/tools/testdata/user_path_gate/probe_green.tsv"
PROBE_STALE="$ROOT/tools/testdata/user_path_gate/probe_stale.tsv"
PROBE_SILENT="$ROOT/tools/testdata/user_path_gate/probe_silent.tsv"
PROBE_DUP="$ROOT/tools/testdata/user_path_gate/probe_dup_marker.tsv"
NO_MARKER="$ROOT/tools/testdata/user_path_gate/no_marker.tsv"
PROBE_BAD_RUN_CONTRACT="$ROOT/tools/testdata/user_path_gate/probe_bad_run_contract.tsv"
WORK="$(mktemp -d "$CHENG_TASK_TMPDIR/user-path-gate-contract.XXXXXX")"
find "$ROOT/src/tests" -maxdepth 1 -type f -name 'ug_gate_*.cheng' -print | \
    sort > "$WORK/staged.before"

run_case() {
    local name="$1" expected="$2" mode="$3"
    shift 3
    local rc=0
    USER_PATH_GATE_FAKE_MODE="$mode" \
        "$GATE" --driver "$DRIVER" \
        --compile-timeout-sec 10 --run-timeout-sec 10 \
        "$@" >"$WORK/$name.stdout" 2>"$WORK/$name.stderr" || rc=$?
    [ "$rc" -eq "$expected" ] || {
        printf 'user_path_gate_contract_test_status=failed\n' >&2
        printf 'user_path_gate_contract_test_reason=%s_rc:%s_expected:%s\n' \
            "$name" "$rc" "$expected" >&2
        sed -n '1,120p' "$WORK/$name.stdout" >&2
        sed -n '1,120p' "$WORK/$name.stderr" >&2
        exit 1
    }
}

bash -n "$GATE"
grep -Fq 'process_tree_escape_pid' "$GATE"
grep -Fq 'rss_limit_exceeded' "$GATE"
grep -Fq 'KNOWN-RED' "$GATE"
grep -Fq 'CHENG_TASK_TMPDIR' "$GATE"
grep -Fq 'PROBE_SECTION_MARKER' "$GATE"
grep -Fq 'probe_summary' "$GATE"
grep -Fq 'PROBE-RED' "$GATE"
grep -Fq 'require-probes-green' "$GATE"
if grep -Eq '(^|[[:space:]])sleep[[:space:]]+[0-9]' "$GATE"; then
    printf 'user_path_gate_contract_test_status=failed\n' >&2
    printf 'user_path_gate_contract_test_reason=polling_sleep_present\n' >&2
    exit 1
fi

run_case current 1 current --baseline "$CURRENT"
grep -Fq 'summary: pass=2 known_red=2 stale=0' "$WORK/current.stdout"

run_case final 0 final --baseline "$FINAL" --require-final-contract
grep -Fq 'summary: pass=4 known_red=0 stale=0' "$WORK/final.stdout"

run_case verdict_drift 1 verdict-drift --baseline "$CURRENT"
grep -Fq 'known_red=1 stale=1' "$WORK/verdict_drift.stdout"
grep -Fq 'BASELINE-STALE' "$WORK/verdict_drift.stdout"

run_case final_contract_red 1 current \
    --baseline "$CURRENT" --require-final-contract
grep -Fq 'FINAL-CONTRACT-RED: cold_nested' "$WORK/final_contract_red.stderr"
grep -Fq 'FINAL-CONTRACT-RED: v6' "$WORK/final_contract_red.stderr"

run_case rss_hard_fail 3 rss \
    --baseline "$FINAL" --require-final-contract --rss-cap-mib 8
grep -Fq 'rss_limit_exceeded' "$WORK/rss_hard_fail.stderr"

run_case process_escape_hard_fail 3 escape \
    --baseline "$FINAL" --require-final-contract
grep -Fq 'process_tree_escape:' "$WORK/process_escape_hard_fail.stderr"

run_case probe_green_default 0 final --baseline "$PROBE_GREEN"
grep -Fq 'summary: pass=4 known_red=0 stale=0' "$WORK/probe_green_default.stdout"
grep -Fq 'PROBE-PASS' "$WORK/probe_green_default.stdout"
grep -Fq 'PROBE-RED' "$WORK/probe_green_default.stdout"
grep -Fq 'probe_summary: probe_pass=1 probe_red=1 probe_stale=0' \
    "$WORK/probe_green_default.stdout"

run_case probe_require_green_red 1 final \
    --baseline "$PROBE_GREEN" --require-probes-green
grep -Fq 'probe_summary: probe_pass=1 probe_red=1 probe_stale=0' \
    "$WORK/probe_require_green_red.stdout"

run_case probe_stale_default 0 final --baseline "$PROBE_STALE"
grep -Fq 'PROBE-STALE' "$WORK/probe_stale_default.stdout"
grep -Fq 'probe_summary: probe_pass=0 probe_red=0 probe_stale=1' \
    "$WORK/probe_stale_default.stdout"

run_case probe_require_green_stale 1 final \
    --baseline "$PROBE_STALE" --require-probes-green

run_case probe_silent_judge_missing 0 final --baseline "$PROBE_SILENT"
grep -Fq 'PROBE-STALE' "$WORK/probe_silent_judge_missing.stdout"
grep -Fq 'probe_summary: probe_pass=0 probe_red=0 probe_stale=1' \
    "$WORK/probe_silent_judge_missing.stdout"

run_case probe_dup_marker 2 final --baseline "$PROBE_DUP"
grep -Fq 'ENV-FAIL: duplicate probe section marker' \
    "$WORK/probe_dup_marker.stderr"

run_case probe_marker_required 2 final --baseline "$NO_MARKER"
grep -Fq 'ENV-FAIL: probe section marker missing' \
    "$WORK/probe_marker_required.stderr"

run_case probe_green_run_contract 2 final --baseline "$PROBE_BAD_RUN_CONTRACT"
grep -Fq 'ENV-FAIL: green probe must require run_rc=0' \
    "$WORK/probe_green_run_contract.stderr"

find "$ROOT/src/tests" -maxdepth 1 -type f -name 'ug_gate_*.cheng' -print | \
    sort > "$WORK/staged.after"
cmp "$WORK/staged.before" "$WORK/staged.after"

printf 'user_path_gate_contract_test_status=pass\n'
printf 'compile_and_run_process_tree_guarded=1\n'
printf 'known_red_is_nonzero=1\n'
printf 'rss_limit_is_hard_failure=1\n'
printf 'process_escape_is_hard_failure=1\n'
printf 'task_scoped_scratch=1\n'
printf 'staged_source_cleanup=1\n'
printf 'probe_section_schema=strict\n'
