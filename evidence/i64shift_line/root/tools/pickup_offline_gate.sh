#!/bin/bash
# tools/pickup_offline_gate.sh — R4-PICKUP-GATES 取件门二: 断网无缓存 fail-closed
# 报文含已装清单 (常驻门)。口径: 清验收口径 3 非阻塞项 (战役 R / R4 线)。
# 载具只读复用 src/tests/backend2_plugin_cache_smoke.cheng (经 stage3 现编),
# 主树源码零接触。在线→组合→exec_diff 等价臂依赖 GEN2 守卫穿帽, 本门不覆盖
# (留接口: smoke online-miss-stub 腿与 Acquire allowNetwork=true 路径, S4-C 已
# 接线, GEN2 穿帽后由后续线接入)。
#
# fail-closed 触发点 (file:line):
#   T2 离线缺省     csg_plugin_pickup.cheng:95-96  (仅显式 ALLOW_NETWORK=1 开网)
#   ④ FAIL_CLOSED   csg_plugin_pickup.cheng:375-378 (miss → MissingError, 无 fallback 写)
#   MissingError    csg_plugin_pickup.cheng:337-341 (codegen_plugin_missing=<t> installed=[..])
#   已装清单        csg_plugin_pickup.cheng:306-328 (InstalledUnits 非 panic 合法性判定,
#                   字典序 ⇒ 报文确定)
#   root 未配置     csg_plugin_pickup.cheng:159-160 → 同一 fail-closed 报文 (清缓存根腿)
#
# 腿 (4 腿 = 2 报文腿 ×2 形态 + 断网缺省负证 + 无 fallback 写外证):
#   offline-miss        — 缓存有他 triple (x86_64) 合法件, 断网取 arm64 缺件 →
#                         rc=1 + stdout 报文逐字含 codegen_plugin_missing=arm64-apple-darwin
#                         + installed=[x86_64-unknown-linux-gnu@<cid>]
#   offline-miss-empty  — 空缓存断网 → rc=1 + installed=[]
#   offline-root-unset  — 缓存根未配置 (argv2 空 → CsgPluginPickupRoot()="") →
#                         rc=1 + 同一 installed=[] 报文 (fail-closed 不看根有无)
#   断网缺省负证        — 两 miss 腿输出禁含 csg_pickup_fetch (allowNetwork≠1
#                         不得触网/不得伪装 fetch Err)
#   无 fallback 写外证  — offline-miss 后脚本级查盘: 被查 arm64 条目双文件不存在,
#                         预装 x86_64 条目仍在
# 每腿双跑: rc + stdout 报文逐字 + stderr md5 零漂移才判绿。
#
# 用法: tools/pickup_offline_gate.sh [driver]
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
    exec "$ROOT/tools/cheng_scratch_scope.sh" pickup-offline-gate "$0" "$@"
fi
case "${TMPDIR:-}" in
    "$CHENG_TASK_TMPDIR"/*) ;;
    *) echo "gate=FAIL (TMPDIR must be inside CHENG_TASK_TMPDIR)"; exit 2 ;;
esac
SMOKE_CC="${1:-${PICKUP_OFFLINE_SMOKE_CC:-$ROOT/artifacts/bootstrap/cheng.stage3}}"
[ -x "$SMOKE_CC" ] || { echo "carrier=FAIL (driver not executable: $SMOKE_CC)"; exit 2; }
WORK="$CHENG_TASK_TMPDIR/pickup-offline-gate"
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

# ---- 实测冻结报文 (2026-09-06 stage3 05af823e7db0c8ea 探针; 夹具冻结 ⇒ cid 确定) ----
ARM64_CID="35e02d9880474ffb6fdf835e0c2b6cea3e3b413b7c5f9983b7e9de79a46d309f"
X86_CID="ad9c9e69908b0ec0a16db9f68a1a659b88081d8059df5b3d56d41284495881ea"
EXPECT_MISS_MSG="codegen_plugin_missing=arm64-apple-darwin installed=[x86_64-unknown-linux-gnu@$X86_CID]"
EXPECT_EMPTY_MSG="codegen_plugin_missing=arm64-apple-darwin installed=[]"
EMPTY_MD5="d41d8cd98f00b204e9800998ecf8427e"   # 空 stderr md5 (报文走 stdout)

# check_offline_leg <mode> <label> <want_rc> <want_out> [extra_arg]
# 双跑: rc + stdout 报文逐字 + stderr 空 (md5=EMPTY_MD5) + 禁触网负证。
check_offline_leg() {
    local mode="$1" label="$2" want_rc="$3" want_out="$4" extra="${5:-}"
    local i rc md5 got_out got_err bad=0
    for i in a b; do
        if [ -n "$extra" ]; then
            "$SMOKE_BIN" "$mode" "$extra.$i" >"$WORK/$label.$i.out" 2>"$WORK/$label.$i.err"
        else
            "$SMOKE_BIN" "$mode" >"$WORK/$label.$i.out" 2>"$WORK/$label.$i.err"
        fi
        rc=$?
        md5=$(md5 -q "$WORK/$label.$i.err")
        got_out=$(cat "$WORK/$label.$i.out")
        got_err=$(cat "$WORK/$label.$i.err")
        if [ $rc -ne "$want_rc" ] || [ "$got_out" != "$want_out" ] \
           || [ "$md5" != "$EMPTY_MD5" ] || [ -n "$got_err" ]; then
            echo "  $label.$i=FAIL (rc=$rc want=$want_rc stderr_md5=$md5)"
            [ "$got_out" != "$want_out" ] && { echo "    out_got: $got_out"; echo "    out_want: $want_out"; }
            [ -n "$got_err" ] && echo "    err_got: $got_err"
            bad=1
        fi
        case "$got_out" in
            *csg_pickup_fetch*)
                echo "  $label.$i=FAIL (断网腿输出含 fetch 触痕迹)"; bad=1 ;;
        esac
    done
    if [ $bad -eq 0 ]; then
        echo "  $label=PASS (rc=$want_rc, 报文逐字+stderr 空+无触痕+双跑零漂移)"
    else
        FAIL=1
    fi
}

echo "leg=offline_fail_closed"
check_offline_leg offline-miss offline-miss 1 "$EXPECT_MISS_MSG" "$WORK/r-offline-miss"

# 无 fallback 写外证: 被查 arm64 条目双文件不得落盘, 预装 x86_64 条目仍在
NF_FAIL=0
for i in a b; do
    D="$WORK/r-offline-miss.$i"
    if [ -e "$D/35/$ARM64_CID.csgplugin" ] || [ -e "$D/35/$ARM64_CID.csgplugin.receipt" ]; then
        echo "  no-fallback.$i=FAIL (miss 后被查条目落盘)"; NF_FAIL=1
    fi
    if [ ! -e "$D/ad/$X86_CID.csgplugin" ] || [ ! -e "$D/ad/$X86_CID.csgplugin.receipt" ]; then
        echo "  no-fallback.$i=FAIL (预装 x86_64 条目丢失)"; NF_FAIL=1
    fi
done
if [ $NF_FAIL -eq 0 ]; then
    echo "  no-fallback=PASS (miss 零写: 被查条目双文件不存在, 预装件仍在)"
else
    FAIL=1
fi

check_offline_leg offline-miss-empty offline-miss-empty 1 "$EXPECT_EMPTY_MSG" "$WORK/r-offline-empty"
check_offline_leg offline-miss-empty offline-root-unset 1 "$EXPECT_EMPTY_MSG" ""

if [ $FAIL -eq 0 ]; then echo "gate=PASS"; else echo "gate=FAIL"; exit 1; fi
