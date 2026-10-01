#!/bin/bash
# tools/backend2_plugin_trade_gate.sh — S4-C/D 取件交易对象与组合准入契约门。
# spec: 设计卷 step4-fetch-design-20260827 DESIGN.md §2 (交易 record) / §3 (同构
# receipt / 本地构建腿) / §4 (fail-closed 矩阵) / §5 (manifest 引用 + 组合包装)。
# 腿 (全部经 src/tests/backend2_plugin_trade_smoke.cheng, 每腿独立工作根):
#   unit              — closure 单派生器确定性/无序性 / Issue golden+字段敏感 /
#                       往返恒等 (字段+字节) / T6 降格 receipt 与 Make 同构
#                       (同 pickupCid, 仅 origin/signer/proof 三字段异) / 门正路径。
#   issue-err         — Issue 入参守卫族显式 Err (rc=0)。
#   err-*             — 线格式逐域篡改 (截断/尾字节/坏域/坏版本/坏 kind/坏 cid 形/
#                       负字节数/超上限) → 对应结构 Err (rc=0)。
#   tamper legs       — record 自指翻哈希 → VerifySelfCid 硬崩; receipt sha 互证
#                       不等 → BindToReceipt 硬崩。
#   fetch legs        — 链条目双文件 fixture → Acquire online 全通 (fetch→gates→
#                       store→cache) / 缓存命中短路链查 (链根消失仍 Ok) /
#                       not_published 终端 Err + missing 报文 / 坏 record →
#                       trade_record_corrupt 硬崩 (不伪装 fetch Err)。
#   compose legs      — local-compose 同构 receipt 落缓存 / compose-offline 缺省
#                       离线 fail-closed (installed=[]) / compose-online 包装全通 /
#                       tmat 未知 triple / manifest 权威互证不符 / manifest 未配置。
#   zero-drift        — unit 双跑 stdout+stderr sha256 恒等 (R6: 绿必须绑双跑零漂移)。
#
# 用法: tools/backend2_plugin_trade_gate.sh [driver]
#   默认 driver = artifacts/bootstrap/cheng.stage3 (cache gate 同款门禁口径);
#   现役 artifacts/backend_driver/cheng 仅作第二口径如实记录 (编译+unit, 不门禁)。
set -u
ROOT="${BACKEND2_GATE_ROOT:-$(cd "$(dirname "$0")/.." && pwd -P)}"
case "$ROOT" in
    /*) ;;
    *) echo "gate=FAIL (BACKEND2_GATE_ROOT must be absolute)"; exit 1 ;;
esac
[ -d "$ROOT" ] || { echo "gate=FAIL (BACKEND2_GATE_ROOT is not a directory: $ROOT)"; exit 1; }
ROOT="$(cd "$ROOT" && pwd -P)"
if [ -z "${CHENG_TASK_TMPDIR:-}" ]; then
    exec "$ROOT/tools/cheng_scratch_scope.sh" backend2-plugin-trade-gate "$0" "$@"
fi
case "${TMPDIR:-}" in
    "$CHENG_TASK_TMPDIR"/*) ;;
    *) echo "gate=FAIL (TMPDIR must be inside CHENG_TASK_TMPDIR)"; exit 1 ;;
esac
SMOKE_CC="${1:-${PLUGIN_TRADE_SMOKE_CC:-$ROOT/artifacts/bootstrap/cheng.stage3}}"
WORK="$CHENG_TASK_TMPDIR/plugin-trade-gate"
mkdir -p "$WORK"
FAIL=0

echo "driver=$SMOKE_CC ($(shasum -a 256 "$SMOKE_CC" | cut -c1-16))"

SMOKE_BIN="$WORK/plugin_trade_smoke"
MANIFEST_ARM64="$ROOT/bootstrap/plugin_manifest_aarch64.cheng"
MANIFEST_X86="$ROOT/bootstrap/plugin_manifest_x86_64.cheng"
env -i PATH=/usr/bin:/bin CHENG_TASK_TMPDIR="$CHENG_TASK_TMPDIR" TMPDIR="$TMPDIR" \
    "$SMOKE_CC" system-link-exec --root:"$ROOT" \
    --in:"$ROOT/src/tests/backend2_plugin_trade_smoke.cheng" --emit:exe --link-providers \
    --target:arm64-apple-darwin --out:"$SMOKE_BIN" >"$WORK/compile.out" 2>"$WORK/compile.stderr.txt"
if [ $? -ne 0 ] || [ ! -x "$SMOKE_BIN" ]; then
    echo "compile=FAIL"; sed -n '1,15p' "$WORK/compile.stderr.txt"; exit 1
fi
echo "compile=PASS"

pos_leg() { # $1=mode
    "$SMOKE_BIN" "$1" "$WORK/t-$1" "$MANIFEST_ARM64" >"$WORK/$1.out" 2>&1
    local rc=$?
    if [ $rc -eq 0 ]; then
        echo "  $1=PASS"
    else
        echo "  $1=FAIL (rc=$rc)"; head -5 "$WORK/$1.out"; FAIL=1
    fi
}

pos_marker_leg() { # $1=mode $2=marker
    "$SMOKE_BIN" "$1" "$WORK/t-$1" "$MANIFEST_ARM64" >"$WORK/$1.out" 2>&1
    local rc=$?
    if [ $rc -eq 0 ] && rg -q "$2" "$WORK/$1.out"; then
        echo "  $1=PASS"
    else
        echo "  $1=FAIL (rc=$rc)"; head -5 "$WORK/$1.out"; FAIL=1
    fi
}

err_leg() { # $1=mode $2=marker (rc=0 显式 Err)
    "$SMOKE_BIN" "$1" "$WORK/t-$1" "$MANIFEST_ARM64" >"$WORK/$1.out" 2>&1
    local rc=$?
    if [ $rc -eq 0 ] && rg -q "$2" "$WORK/$1.out"; then
        echo "  $1=PASS"
    else
        echo "  $1=FAIL (rc=$rc)"; head -5 "$WORK/$1.out"; FAIL=1
    fi
}

neg_leg() { # $1=mode $2=marker (rc!=0 硬崩/终端 Err)
    "$SMOKE_BIN" "$1" "$WORK/t-$1" "$MANIFEST_ARM64" >"$WORK/$1.out" 2>&1
    local rc=$?
    if [ $rc -ne 0 ] && rg -q "$2" "$WORK/$1.out"; then
        echo "  $1=PASS (rc=$rc, 带 $2)"
    else
        echo "  $1=FAIL (rc=$rc)"; head -5 "$WORK/$1.out"; FAIL=1
    fi
}

echo "leg=unit"
pos_marker_leg unit PLUGIN_TRADE_UNIT_OK
echo "leg=issue_guards"
err_leg issue-err PLUGIN_TRADE_ISSUE_ERR_OK
echo "leg=strict_decode_err"
err_leg err-truncated PLUGIN_TRADE_TRUNCATED_ERR_OK
err_leg err-patches PLUGIN_TRADE_PATCH_ERR_OK
echo "leg=identity_tamper_reject"
neg_leg tamper-selfcid csg_pickup_trade_cid_recompute_mismatch
neg_leg tamper-bind csg_pickup_trade_receipt_bind_mismatch
echo "leg=chain_fetch (S4-C)"
pos_marker_leg fetch-ok PLUGIN_TRADE_FETCH_OK
pos_marker_leg fetch-hit-no-net PLUGIN_TRADE_HIT_NONET_OK
neg_leg fetch-not-published csg_pickup_not_published
if ! rg -q 'codegen_plugin_missing=arm64-apple-darwin' "$WORK/fetch-not-published.out" 2>/dev/null; then
    echo "  fetch-not-published=FAIL (报文缺 fail-closed missing)"; FAIL=1
fi
neg_leg fetch-corrupt csg_pickup_trade_record_corrupt
echo "leg=composition_admission (S4-D)"
pos_marker_leg local-compose PLUGIN_TRADE_LOCAL_OK
neg_leg compose-offline 'codegen_plugin_missing=arm64-apple-darwin'
if ! rg -q 'installed=\[\]' "$WORK/compose-offline.out" 2>/dev/null; then
    echo "  compose-offline=FAIL (报文缺 installed=[] 快照)"; FAIL=1
fi
pos_marker_leg compose-online PLUGIN_TRADE_COMPOSE_ONLINE_OK
neg_leg compose-unheld-compiler csg_pickup_compiler_identity_admission_missing
neg_leg compose-unknown-triple csg_pickup_compose_unknown_target_triple
# manifest 权威互证腿: 请求 arm64 triple 但传 x86_64 manifest → 权威不符
"$SMOKE_BIN" compose-manifest-mismatch "$WORK/t-manifest-mismatch" "$MANIFEST_X86" \
    >"$WORK/compose-manifest-mismatch.out" 2>&1
MMC_RC=$?
if [ $MMC_RC -ne 0 ] && rg -q 'csg_pickup_manifest_triple_mismatch' "$WORK/compose-manifest-mismatch.out"; then
    echo "  compose-manifest-mismatch=PASS (rc=$MMC_RC, 权威互证不符)"
else
    echo "  compose-manifest-mismatch=FAIL (rc=$MMC_RC)"; head -5 "$WORK/compose-manifest-mismatch.out"; FAIL=1
fi
neg_leg compose-manifest-unset csg_pickup_manifest_unconfigured
echo "leg=manifest_authority (Step2/3)"
python3 "$ROOT/tools/kernel_plugin_manifest_gate.py" >"$WORK/manifest.out" 2>&1
if [ $? -eq 0 ] && rg -q 'manifest-gate: PASS' "$WORK/manifest.out"; then
    echo "  manifest-gate=PASS ($(cat "$WORK/manifest.out"))"
else
    echo "  manifest-gate=FAIL"; cat "$WORK/manifest.out"; FAIL=1
fi
if rg -q '^plugin_canonical_triple' "$MANIFEST_ARM64" "$MANIFEST_X86" \
      "$ROOT/bootstrap/plugin_manifest_riscv64.cheng" >/dev/null 2>&1; then
    echo "  manifest-canonical-triple=PASS (三清单已声明)"
else
    echo "  manifest-canonical-triple=FAIL"; FAIL=1
fi
echo "leg=zero_drift (R6 双跑零漂移)"
"$SMOKE_BIN" unit "$WORK/drift-a" "$MANIFEST_ARM64" >"$WORK/drift-a.out" 2>"$WORK/drift-a.err"
"$SMOKE_BIN" unit "$WORK/drift-b" "$MANIFEST_ARM64" >"$WORK/drift-b.out" 2>"$WORK/drift-b.err"
A_SUM="$(cat "$WORK/drift-a.out" "$WORK/drift-a.err" | shasum -a 256 | cut -d' ' -f1)"
B_SUM="$(cat "$WORK/drift-b.out" "$WORK/drift-b.err" | shasum -a 256 | cut -d' ' -f1)"
if [ -n "$A_SUM" ] && [ "$A_SUM" = "$B_SUM" ]; then
    echo "  unit-double-run=PASS (sha256=${A_SUM:0:16})"
else
    echo "  unit-double-run=FAIL (a=$A_SUM b=$B_SUM)"; FAIL=1
fi

if [ $FAIL -eq 0 ]; then echo "gate=PASS"; else echo "gate=FAIL"; exit 1; fi
