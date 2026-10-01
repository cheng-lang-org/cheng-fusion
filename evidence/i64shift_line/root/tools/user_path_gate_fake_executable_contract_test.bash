#!/usr/bin/env bash
# Contract-test-only executable emitted by user_path_gate_fake_driver_contract_test.bash.
case "${0##*/}" in
    ug_call_fixture.exe) exit 1 ;;
    ug_ordinary.exe|ug_cold_nested.exe|ug_v6.exe) exit 0 ;;
    ug_probe_ok.exe)
        printf 'probe_ok=pass\n'
        exit 0
        ;;
    ug_probe_silent.exe) exit 0 ;;
    ug_probe_bad_run.exe) exit 1 ;;
    *) exit 90 ;;
esac
