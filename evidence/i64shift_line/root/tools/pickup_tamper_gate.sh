#!/bin/bash
# tools/pickup_tamper_gate.sh — R4-PICKUP-GATES 取件门一: 缓存件篡改单字节必拒收。
# 口径: 清验收口径 3 非阻塞项 (战役 R / R4 线)。载具只读复用
# src/tests/backend2_plugin_cache_smoke.cheng (经 stage3 现编), 主树源码零接触。
#
# 构造: 本地 capability 交易件 = origin=local receipt (PluginPickupReceiptMake,
# signer="local", proofCid=artifactSha256 自证) + artifact 字节, 经
# CsgPluginPickupStore 先过门再落盘 (csg_plugin_pickup.cheng:234-254)。
#
# 拒收触发点 (file:line, 判词实测于 stage3 05af823e7db0c8ea, 判词原文冻结于
# 下方 EXPECT_* 常量 — 零理想串):
#   字节门 sha256   backend2_plugin_cid.cheng:160-165 → csg_pickup_byte_gate_mismatch
#   字节门 count    backend2_plugin_cid.cheng:157-159 → csg_pickup_byte_gate_count_mismatch
#   键二次校验      csg_plugin_pickup.cheng:176-177   → csg_pickup_cache_key_mismatch
#   BindCheck       backend2_plugin_cid.cheng:143-148 → csg_pickup_cid_rebind_mismatch
#   provenance 门 d backend2_plugin_cid.cheng:170-184 → csg_pickup_provenance_reject
#   LoadCached 全门 csg_plugin_pickup.cheng:182-183 (缓存提供可用性不提供信任)
#
# 腿 (8 腿 = 1 健康 + 2 脚本级外部翻转 + 5 smoke 内建篡改):
#   healthy            — unit 全正路径 (Store→LoadCached 往返逐次过门, 未篡改→接受)
#   ext-artifact-byte  — 脚本级对缓存 artifact 翻单字节 (offset7 XOR 0x01) 后经
#                        offline-miss 腿 Acquire → 字节门硬崩 (外部对手模拟)
#   ext-receipt-cid    — 脚本级对 receipt 自指 cid 首字符 '3'→'f' (合法 hex 过解码)
#                        → 键二次校验硬崩
#   tamper-artifact    — smoke 内建同款字节翻转 → 字节门硬崩
#   tamper-receipt-quad— contractVersion 1→2 → BindCheck 硬崩
#   tamper-proof-local — 伪造 local provenance (proofCid 翻字节) → 门 d 硬崩
#   store-gate-reject  — 带病 artifact 直接 Store → 先过门再落盘字节门硬崩
#   tamper-receipt-cid — smoke 内建 cid 翻转 → 键二次校验硬崩
# 每腿双跑: rc + stdout 判词 + stderr 判词逐字 + stderr md5 四项零漂移才判绿。
#
# 用法: tools/pickup_tamper_gate.sh [driver]
#   默认 driver = artifacts/bootstrap/cheng.stage3 (门禁口径, 与
#   backend2_plugin_cache_gate.sh 同款); 现役认证驱动仅第二口径, 不入门禁判定。
# 退出码合同: 0=全绿; 1=判词/rc/漂移不符 (gate=FAIL); 2=载具/环境失败。
set -u
ROOT="${BACKEND2_GATE_ROOT:-$(cd "$(dirname "$0")/.." && pwd -P)}"
case "$ROOT" in
    /*) ;;
    *) echo "gate=FAIL (BACKEND2_GATE_ROOT must be absolute)"; exit 2 ;;
esac
[ -d "$ROOT" ] || { echo "gate=FAIL (BACKEND2_GATE_ROOT is not a directory: $ROOT)"; exit 2; }
ROOT="$(cd "$ROOT" && pwd -P)"
if [ -z "${CHENG_TASK_TMPDIR:-}" ]; then
    exec "$ROOT/tools/cheng_scratch_scope.sh" pickup-tamper-gate "$0" "$@"
fi
case "${TMPDIR:-}" in
    "$CHENG_TASK_TMPDIR"/*) ;;
    *) echo "gate=FAIL (TMPDIR must be inside CHENG_TASK_TMPDIR)"; exit 2 ;;
esac
SMOKE_CC="${1:-${PICKUP_TAMPER_SMOKE_CC:-$ROOT/artifacts/bootstrap/cheng.stage3}}"
[ -x "$SMOKE_CC" ] || { echo "carrier=FAIL (driver not executable: $SMOKE_CC)"; exit 2; }
WORK="$CHENG_TASK_TMPDIR/pickup-tamper-gate"
mkdir -p "$WORK"
FAIL=0

echo "driver=$SMOKE_CC ($(shasum -a 256 "$SMOKE_CC" | cut -c1-16))"

SMOKE_SRC="$ROOT/src/tests/backend2_plugin_cache_smoke.cheng"
[ -f "$SMOKE_SRC" ] || { echo "carrier=FAIL (smoke source missing: $SMOKE_SRC)"; exit 2; }
SMOKE_BIN="$WORK/plugin_cache_smoke"
env -i PATH=/usr/bin:/bin CHENG_TASK_TMPDIR="$CHENG_TASK_TMPDIR" TMPDIR="$TMPDIR" \
    "$SMOKE_CC" system-link-exec --root:"$ROOT" \
    --in:"$SMOKE_SRC" --emit:exe --link-providers \
    --target:arm64-apple-darwin --out:"$SMOKE_BIN" >"$WORK/compile.out" 2>"$WORK/compile.stderr.txt"
rc=$?
if [ $rc -ne 0 ] || [ ! -x "$SMOKE_BIN" ]; then
    echo "compile=FAIL (rc=$rc)"; sed -n '1,15p' "$WORK/compile.stderr.txt"; exit 2
fi
echo "compile=PASS"

# ---- 实测冻结判词 (2026-09-06 stage3 05af823e7db0c8ea 探针; 夹具冻结 ⇒ 全场确定) ----
# 夹具四元组: patternFixed32(11)/patternFixed32(23)/arm64-apple-darwin/version=1,
# artifact="cheng-plugin-artifact-fixture-v1" ⇒ pickupCid 恒定。
TAMPER_CID="35e02d9880474ffb6fdf835e0c2b6cea3e3b413b7c5f9983b7e9de79a46d309f"
EMPTY_ERR_MD5="d41d8cd98f00b204e9800998ecf8427e"
EXPECT_BYTE_GATE="csg_pickup_byte_gate_mismatch cid=$TAMPER_CID offset=0 expectedByte=251 actualByte=139"
EXPECT_BYTE_GATE_MD5="017a9f7fce4ee6de8067ca69e287c2d8"
EXPECT_KEY_MISMATCH="csg_pickup_cache_key_mismatch cid=$TAMPER_CID receiptCid=f5e02d9880474ffb6fdf835e0c2b6cea3e3b413b7c5f9983b7e9de79a46d309f"
EXPECT_KEY_MISMATCH_MD5="a0e1d57cdee6552614de4d5ed1de2685"
EXPECT_REBIND="csg_pickup_cid_rebind_mismatch cid=$TAMPER_CID recomputed=e0aa2991b6a65c769763b6bad6d3dceb4cab8a156ea61612df5db0f15d8381d6"
EXPECT_REBIND_MD5="31e8316cd5d4af9f882d0f68c1b721b8"
EXPECT_PROVENANCE="csg_pickup_provenance_reject cid=$TAMPER_CID origin=local proof_not_self"
EXPECT_PROVENANCE_MD5="5bdf0651adf52eaee43fd561bf4f21d1"
EXPECT_STORE_GATE="csg_pickup_byte_gate_mismatch cid=$TAMPER_CID offset=0 expectedByte=251 actualByte=167"
EXPECT_STORE_GATE_MD5="7c2c16692e56c4891be53e837b6f60a4"

# check_leg <label> <expect_rc> <expect_stdout> <expect_err> <expect_err_md5>
# 双跑: a/b 两轮 rc + stderr md5 + stdout/stderr 判词逐字比对; 任一漂移即 FAIL。
check_leg() {
    local label="$1" want_rc="$2" want_out="$3" want_err="$4" want_md5="$5"
    local i rc md5 got_out got_err bad=0
    for i in a b; do
        "$SMOKE_BIN" "$label" "$WORK/r-$label-$i" >"$WORK/$label.$i.out" 2>"$WORK/$label.$i.err"
        rc=$?
        md5=$(md5 -q "$WORK/$label.$i.err")
        got_out=$(cat "$WORK/$label.$i.out")
        got_err=$(cat "$WORK/$label.$i.err")
        if [ $rc -ne "$want_rc" ] || [ "$md5" != "$want_md5" ] \
           || [ "$got_err" != "$want_err" ] || [ "$got_out" != "$want_out" ]; then
            echo "  $label.$i=FAIL (rc=$rc want=$want_rc err_md5=$md5 want=$want_md5)"
            [ "$got_err" != "$want_err" ] && { echo "    err_got: $got_err"; echo "    err_want: $want_err"; }
            [ "$got_out" != "$want_out" ] && { echo "    out_got: $got_out"; echo "    out_want: $want_out"; }
            bad=1
        fi
    done
    if [ $bad -eq 0 ]; then
        echo "  $label=PASS (rc=$want_rc, 判词逐字+双跑零漂移 md5=$want_md5)"
    else
        FAIL=1
    fi
}

# ---- 健康例: 未篡改 → 接受 (防假门; 双跑同口径) ----
echo "leg=healthy_unit"
for i in a b; do
    "$SMOKE_BIN" unit "$WORK/r-healthy-$i" >"$WORK/healthy.$i.out" 2>"$WORK/healthy.$i.err"
    rc=$?
    md5=$(md5 -q "$WORK/healthy.$i.err")
    if [ $rc -eq 0 ] && [ "$md5" = "$EMPTY_ERR_MD5" ] \
       && [ "$(cat "$WORK/healthy.$i.out")" = "PLUGIN_CACHE_UNIT_OK" ]; then
        echo "  healthy.$i=PASS (rc=0, 未篡改往返接受, stderr 空)"
    else
        echo "  healthy.$i=FAIL (rc=$rc err_md5=$md5)"; head -3 "$WORK/healthy.$i.err"; FAIL=1
    fi
done
HEALTHY_ROOT="$WORK/r-healthy-a"

# ---- 脚本级外部翻转腿: 复制健康缓存根, 脚本做对手, 翻单字节后经 Acquire 拒 ----
echo "leg=external_tamper (脚本级对手)"
EXT_LOAD_MODE="offline-miss"   # 查询 arm64 同 cid → LoadCached 命中 → VerifyGates 硬崩
FLIP_ARTIFACT() {
    local dst="$1" f
    f=$(ls "$dst"/*/*.csgplugin | head -1)
    [ -n "$f" ] || { echo "  ext_prep=FAIL (no artifact in $dst)"; FAIL=1; return 1; }
    python3 -c "import sys; p=sys.argv[1]; d=bytearray(open(p,'rb').read()); assert len(d)>7; d[7]^=0x01; open(p,'wb').write(bytes(d))" "$f"
}
run_ext_artifact() {
    local tag="ext-artifact-byte" i rc md5 got_err bad=0 dst
    for i in a b; do
        dst="$WORK/r-$tag-$i"
        rm -rf "$dst"; cp -R "$HEALTHY_ROOT" "$dst"
        FLIP_ARTIFACT "$dst" || return 1
        "$SMOKE_BIN" "$EXT_LOAD_MODE" "$dst" >"$WORK/$tag.$i.out" 2>"$WORK/$tag.$i.err"
        rc=$?
        md5=$(md5 -q "$WORK/$tag.$i.err")
        got_err=$(cat "$WORK/$tag.$i.err")
        if [ $rc -ne 1 ] || [ "$md5" != "$EXPECT_BYTE_GATE_MD5" ] || [ "$got_err" != "$EXPECT_BYTE_GATE" ]; then
            echo "  $tag.$i=FAIL (rc=$rc err_md5=$md5)"; echo "    err_got: $got_err"; bad=1
        fi
    done
    if [ $bad -eq 0 ]; then
        echo "  $tag=PASS (rc=1, 外部翻字节必拒, 判词逐字+双跑零漂移 md5=$EXPECT_BYTE_GATE_MD5)"
    else
        FAIL=1
    fi
}
FLIP_RECEIPT_CID() {
    local dst="$1" f
    f=$(ls "$dst"/*/*.csgplugin.receipt | head -1)
    [ -n "$f" ] || { echo "  ext_prep=FAIL (no receipt in $dst)"; FAIL=1; return 1; }
    python3 -c "import sys; p=sys.argv[1]; d=bytearray(open(p,'rb').read()); assert d[45]==ord('3'); d[45]=ord('f'); open(p,'wb').write(bytes(d))" "$f"
}
run_ext_receipt_cid() {
    local tag="ext-receipt-cid" i rc md5 got_err bad=0 dst
    for i in a b; do
        dst="$WORK/r-$tag-$i"
        rm -rf "$dst"; cp -R "$HEALTHY_ROOT" "$dst"
        FLIP_RECEIPT_CID "$dst" || return 1
        "$SMOKE_BIN" "$EXT_LOAD_MODE" "$dst" >"$WORK/$tag.$i.out" 2>"$WORK/$tag.$i.err"
        rc=$?
        md5=$(md5 -q "$WORK/$tag.$i.err")
        got_err=$(cat "$WORK/$tag.$i.err")
        if [ $rc -ne 1 ] || [ "$md5" != "$EXPECT_KEY_MISMATCH_MD5" ] || [ "$got_err" != "$EXPECT_KEY_MISMATCH" ]; then
            echo "  $tag.$i=FAIL (rc=$rc err_md5=$md5)"; echo "    err_got: $got_err"; bad=1
        fi
    done
    if [ $bad -eq 0 ]; then
        echo "  $tag=PASS (rc=1, 外部翻 receipt cid 必拒, 判词逐字+双跑零漂移 md5=$EXPECT_KEY_MISMATCH_MD5)"
    else
        FAIL=1
    fi
}
run_ext_artifact
run_ext_receipt_cid

# ---- smoke 内建篡改腿 (翻转在 cheng 进程内完成, 拒收同门) ----
echo "leg=internal_tamper"
check_leg tamper-artifact    1 "" "$EXPECT_BYTE_GATE"   "$EXPECT_BYTE_GATE_MD5"
check_leg tamper-receipt-cid 1 "" "$EXPECT_KEY_MISMATCH" "$EXPECT_KEY_MISMATCH_MD5"
check_leg tamper-receipt-quad 1 "" "$EXPECT_REBIND"     "$EXPECT_REBIND_MD5"
check_leg tamper-proof-local 1 "" "$EXPECT_PROVENANCE"  "$EXPECT_PROVENANCE_MD5"
check_leg store-gate-reject  1 "" "$EXPECT_STORE_GATE"  "$EXPECT_STORE_GATE_MD5"

if [ $FAIL -eq 0 ]; then echo "gate=PASS"; else echo "gate=FAIL"; exit 1; fi
