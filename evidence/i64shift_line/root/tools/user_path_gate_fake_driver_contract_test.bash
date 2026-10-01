#!/usr/bin/env bash
# Contract-test-only synthetic driver for tools/user_path_gate_contract_test.bash.
set -euo pipefail

[ "${1:-}" = system-link-exec ] || {
    printf 'fake_driver_contract_error=command\n' >&2
    exit 90
}
shift

input=''
output=''
root=''
emit=0
target=0
for arg in "$@"; do
    case "$arg" in
        --in:*) input="${arg#--in:}" ;;
        --out:*) output="${arg#--out:}" ;;
        --root:*) root="${arg#--root:}" ;;
        --emit:exe) emit=1 ;;
        --target:arm64-apple-darwin) target=1 ;;
        *)
            printf 'fake_driver_contract_error=unknown_arg:%s\n' "$arg" >&2
            exit 90
            ;;
    esac
done

[ -n "$input" ] && [ -n "$output" ] && [ -n "$root" ] && \
    [ "$emit" -eq 1 ] && [ "$target" -eq 1 ] || {
    printf 'fake_driver_contract_error=arguments\n' >&2
    exit 90
}
[ "${CHENG_ENTRY_CACHE:-}" = 0 ] && \
    [ "${CHENG_DISABLE_COLD_OBJECT_CACHE:-}" = 1 ] && \
    [ "${CHENG_DISABLE_SYSTEM_LINK_EXEC_CACHE:-}" = 1 ] && \
    [ "${CHENG_ENABLE_SYSTEM_LINK_EXEC_CACHE:-}" = 0 ] && \
    [ "${CHENG_NO_CACHE:-}" = 1 ] && \
    [ "${CHENG_STRICT_NO_CACHE:-}" = 1 ] && \
    [ "${CHENG_CSG_PLUGIN_ALLOW_NETWORK:-}" = 0 ] && \
    [ -n "${CHENG_COLD_OBJECT_CACHE_ROOT:-}" ] && \
    [ -d "$CHENG_COLD_OBJECT_CACHE_ROOT" ] || {
    printf 'fake_driver_contract_error=cache_not_disabled\n' >&2
    exit 90
}

mode="${USER_PATH_GATE_FAKE_MODE:-current}"
if [ "$mode" = rss ]; then
    python3 -c 'import time; value = bytearray(64 * 1024 * 1024); value[0] = 1; time.sleep(1)'
fi
if [ "$mode" = escape ]; then
    python3 -c 'import subprocess, sys, time; subprocess.Popen([sys.executable, "-c", "import time; time.sleep(2)"], start_new_session=True); time.sleep(1)'
fi

name="${input##*/}"
case "$name" in
    ug_gate_ordinary.*.cheng|ug_gate_call_fixture.*.cheng)
        source_binary="${BASH_SOURCE[0]%/*}/user_path_gate_fake_executable_contract_test.bash"
        ;;
    ug_gate_cold_nested.*.cheng)
        if [ "$mode" = final ]; then
            source_binary="${BASH_SOURCE[0]%/*}/user_path_gate_fake_executable_contract_test.bash"
        elif [ "$mode" = verdict-drift ]; then
            printf 'ownership verdict drift\n' >&2
            exit 1
        else
            printf 'cleanup_cfg: synthetic contract failure\n' >&2
            exit 1
        fi
        ;;
    ug_gate_v6.*.cheng)
        if [ "$mode" = final ]; then
            source_binary="${BASH_SOURCE[0]%/*}/user_path_gate_fake_executable_contract_test.bash"
        else
            printf 'TypeId missing: synthetic contract failure\n' >&2
            exit 2
        fi
        ;;
    ug_gate_probe_ok.*.cheng|ug_gate_probe_silent.*.cheng|ug_gate_probe_bad_run.*.cheng)
        source_binary="${BASH_SOURCE[0]%/*}/user_path_gate_fake_executable_contract_test.bash"
        ;;
    ug_gate_probe_fail.*.cheng)
        printf 'probe synthetic verdict: compile rejected\n' >&2
        exit 1
        ;;
    *)
        printf 'fake_driver_contract_error=fixture:%s\n' "$name" >&2
        exit 90
        ;;
esac

cp "$source_binary" "$output"
chmod 700 "$output"
