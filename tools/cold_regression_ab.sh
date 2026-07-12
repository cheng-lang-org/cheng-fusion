#!/usr/bin/env bash
# cold_regression_ab.sh -- same-tree A/B cold-compiler regression accelerator.
#
# Sedimented from two manual campaigns (cheng-mem-m2 round5 / round6b) that
# each hand-ran: git-stash-toggle bootstrap/cold_parser.c in a single clone,
# `cc -std=c11 -O2` two binaries, run tools/cold_regression_test.sh full
# suite against each, /usr/bin/diff the logs. That took ~15min serial on an
# idle machine, 2.5h when the host had competing load, and got the same five
# footguns wrong at least once each (see comments inline). This script fixes
# all five permanently instead of re-deriving them by hand a third time:
#
#   1. main-repo-as-baseline is a false-positive generator (source tree drifts
#      under a live baseline). Fix: same-tree only -- baseline and fixed are
#      built from the SAME clone, toggled via git apply / git apply -R (or
#      stash, see STATE detection below). We never touch the caller-supplied
#      clone_root's git history/remote, only its working tree.
#   2. two suite runs sharing one WORK_ROOT race on produced artifacts. Fix:
#      tools/cold_regression_test.sh already honors COLD_REGRESSION_WORK_ROOT
#      (read from source: cold_regression_test.sh lines 16-28) and never
#      touches artifacts/bootstrap/compiler_main.direct or any other path
#      outside that WORK_ROOT (grepped the whole 9993-line file -- zero
#      hits). So two distinct WORK_ROOT dirs give full isolation for free;
#      no need to clone the tree a second time.
#   3. PATH `diff` is a DevEco shim that always exits 0 on this machine. Fix:
#      hard-pin /usr/bin/diff, verified executable before use.
#   4. perf_bench_<name>_<N>ms and mem_limit_typed_expr_rss_under_4gb_bytes_<N>
#      embed a jittery number IN THE ASSERT NAME ITSELF (read from source:
#      cold_regression_test.sh lines 5639, 7135) so they show up as diff
#      noise on every run even with zero behavior change. Fix: sed-mask
#      before diffing (see mask_noise()).  cold_regression_duration_s=<N> at
#      EOF is the same kind of noise (masked too).
#   5. the exhaustive/nightly/stress ("heavy") tail multiplies wall time by
#      several x. Fix: --heavy maps to CHENG_COLD_RUN_HEAVY=1 (the suite's
#      own gate, read from source: cold_regression_test.sh lines 100-109);
#      default is the light/fast profile.
#
# Usage:
#   cold_regression_ab.sh <clone_root> <patch_file> [--heavy] [--jobs N] [--out DIR]
#
# Exit codes: 0 = zero new FAIL, 1 = new FAIL found, 2 = tool error.
set -uo pipefail

DIFF=/usr/bin/diff
SELF="$(basename "$0")"

die() { echo "$SELF: error: $*" >&2; exit 2; }

[ -x "$DIFF" ] || die "/usr/bin/diff missing or not executable -- refusing to fall back to PATH diff (known DevEco shim always exits 0)"

usage() {
    cat >&2 <<EOF
usage: $SELF <clone_root> <patch_file> [--heavy] [--jobs N] [--out DIR]

  <clone_root>   git clone containing tools/cold_regression_test.sh and
                 bootstrap/cheng_cold.c. Must be either clean, or dirty with
                 EXACTLY <patch_file> already applied. Left in the SAME state
                 (clean stays clean, applied stays applied) when done.
  <patch_file>   a patch touching bootstrap/ sources (git apply format).
  --heavy        set CHENG_COLD_RUN_HEAVY=1 (exhaustive+nightly+stress tail).
  --jobs N       COLD_REGRESSION_JOBS passthrough (suite's own opt-in
                 per-item parallelism inside its nightly/fuzz/stress loops
                 only -- see PARALLELISM NOTE below). Default: unset (1).
  --out DIR      output directory (default: ./coldreg_ab_out).

PARALLELISM NOTE: read tools/cold_regression_test.sh end to end before
building this. The ~9900-line body is a strictly sequential script: asserts
share one WORK_ROOT and routinely reuse fixed tags (rm -f ...report; run;
grep ...report) across consecutive tests, so two arbitrary tests cannot be
farmed out to different workers without corrupting each other's scratch
files. Only three narrow blocks (nightly loop, ZRG double-run, stress100
loop) give every iteration its own per-index path and opt into
cold_parallel_wait_slot/wait_all when COLD_REGRESSION_JOBS>1 -- that is the
suite's own ceiling on test-level parallelism, not a limitation this tool
adds. This tool's actual parallel axis is running the BASELINE and FIXED
suites as two concurrent processes (real, since they are two independent
binaries against two independent WORK_ROOTs) and passing --jobs through so
each side benefits from whatever internal parallelism the suite offers
itself. This is the honest degrade the task asked for, not full per-test
farming.
EOF
}

[ $# -ge 2 ] || { usage; exit 2; }
CLONE_ARG="$1"; PATCH_ARG="$2"; shift 2
HEAVY=0
JOBS=""
OUT="$PWD/coldreg_ab_out"
while [ $# -gt 0 ]; do
    case "$1" in
        --heavy) HEAVY=1; shift ;;
        --jobs) JOBS="${2:?--jobs needs a value}"; shift 2 ;;
        --out) OUT="${2:?--out needs a value}"; shift 2 ;;
        -h|--help) usage; exit 0 ;;
        *) die "unknown argument: $1" ;;
    esac
done

CLONE="$(cd "$CLONE_ARG" 2>/dev/null && pwd)" || die "clone_root not found: $CLONE_ARG"
[ -d "$CLONE/.git" ] || die "not a git working tree: $CLONE"
PATCH="$(cd "$(dirname "$PATCH_ARG")" 2>/dev/null && pwd)/$(basename "$PATCH_ARG")" || die "patch not found: $PATCH_ARG"
[ -f "$PATCH" ] || die "patch not found: $PATCH"
SUITE_REL="tools/cold_regression_test.sh"
SUITE_PATH="$CLONE/$SUITE_REL"
[ -f "$SUITE_PATH" ] || die "suite missing in clone: $SUITE_REL"
[ -f "$CLONE/bootstrap/cheng_cold.c" ] || die "bootstrap/cheng_cold.c missing in clone"

mkdir -p "$OUT" || die "cannot create out dir: $OUT"
MODE="light"; [ "$HEAVY" = "1" ] && MODE="heavy"

md5_of() {
    if command -v md5 >/dev/null 2>&1; then md5 -q "$1"
    else md5sum "$1" | awk '{print $1}'
    fi
}

# --- concurrency lock: two invocations on the same clone_root would race the
# git apply/apply -R/stash state machine on the shared working tree (each
# invocation's OUT/WORK_ROOT is isolated, but the clone's tree itself is the
# shared mutable resource). mkdir is atomic; lock lives under .git/ so it can
# never dirty the working tree. Released on any exit via trap. ---
cd "$CLONE" || die "cannot cd into clone"
LOCK_DIR="$CLONE/.git/coldreg_ab.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    die "another $SELF invocation holds the lock on this clone ($LOCK_DIR exists). Two concurrent runs on one clone_root would corrupt each other's apply/revert state -- use separate clones or wait."
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null' EXIT

# --- state detection: clean-and-forward-apply, or already-applied-resume ---
DIRTY_PATHS="$(git status --porcelain | awk '{print $2}')"
PATCH_PATHS="$(git apply --numstat "$PATCH" 2>/dev/null | awk '{print $NF}')"
[ -n "$PATCH_PATHS" ] || die "patch touches no files (git apply --numstat empty/failed): $PATCH"

if [ -z "$DIRTY_PATHS" ]; then
    STATE="clean"
    git apply --check "$PATCH" 2>/dev/null || die "patch does not apply to clean clone tree: $PATCH"
else
    # every dirty path must be one the patch touches, and the reverse-apply
    # must check out cleanly -- i.e. current dirty state IS exactly the
    # patch applied, nothing foreign mixed in. Otherwise abort: this clone
    # has WIP we do not recognize and must not touch (git checkout -- / git
    # stash on unscoped paths is exactly the mistake lessons.md warns about).
    FOREIGN=""
    for p in $DIRTY_PATHS; do
        echo "$PATCH_PATHS" | grep -qxF "$p" || FOREIGN="$FOREIGN $p"
    done
    if [ -n "$FOREIGN" ] || ! git apply --check -R "$PATCH" 2>/dev/null; then
        echo "clone has dirty changes that are not exactly <patch_file> applied -- aborting, will not touch:" >&2
        git status --porcelain >&2
        exit 2
    fi
    STATE="applied"
fi
echo "state=$STATE mode=$MODE clone=$CLONE" >&2

mkdir -p "$OUT"
BASE_BIN="$OUT/cheng_cold_baseline"
FIXED_BIN="$OUT/cheng_cold_fixed"
BASE_WORK="$OUT/work_baseline"
FIXED_WORK="$OUT/work_fixed"
BASE_LOG="$OUT/cold_regression_baseline.log"
FIXED_LOG="$OUT/cold_regression_fixed.log"
# Cache lives OUTSIDE the clone: a cache dir inside the working tree shows up
# as `?? .coldreg_cache/` in git status and trips this script's own foreign-WIP
# guard on the very next invocation (default-path guaranteed failure, caught by
# adversarial review). The key is pure content (baseline-binary md5 + suite md5),
# so a global cache root is not just safe but strictly better: identical
# binary+suite pairs share cached baseline logs across clones.
CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/cheng-coldreg"
mkdir -p "$CACHE_DIR"

build_cold() {
    local out_bin="$1"
    ( cd "$CLONE" && cc -std=c11 -O2 -o "$out_bin" bootstrap/cheng_cold.c ) \
        || die "cc build failed for $out_bin"
    [ -x "$out_bin" ] || die "build did not produce executable: $out_bin"
}

restore_state() {
    # Always leave the clone exactly as we found it (clean->clean,
    # applied->applied), so repeated invocations are idempotent and a
    # mid-run crash resumes cleanly next time (whichever STATE it lands in
    # is itself a valid starting STATE for the next run).
    if [ "$STATE" = "clean" ]; then
        git apply -R "$PATCH" 2>/dev/null && git apply "$PATCH" 2>/dev/null
    fi
}

case "$STATE" in
    clean)
        echo "== building BASELINE (clean tree) ==" >&2
        build_cold "$BASE_BIN"
        echo "== git apply $PATCH ==" >&2
        git apply "$PATCH" || die "git apply failed"
        echo "== building FIXED (patch applied) ==" >&2
        build_cold "$FIXED_BIN"
        echo "== git apply -R (restore clean) ==" >&2
        git apply -R "$PATCH" || die "git apply -R failed -- clone left dirty, fix by hand: cd $CLONE && git apply -R $PATCH"
        ;;
    applied)
        echo "== building FIXED (patch already applied) ==" >&2
        build_cold "$FIXED_BIN"
        echo "== git stash push (scoped to patch paths) -- isolate BASELINE ==" >&2
        git stash push --quiet -m coldreg_ab_autostash -- $PATCH_PATHS || die "git stash push failed"
        echo "== building BASELINE (stashed clean) ==" >&2
        build_cold "$BASE_BIN"
        echo "== git stash pop -- restore patch-applied state ==" >&2
        git stash pop --quiet || die "git stash pop failed -- clone left clean, patch is in stash, recover by hand: cd $CLONE && git stash pop"
        ;;
esac

SUITE_MD5="$(md5_of "$SUITE_PATH")"
BASE_MD5="$(md5_of "$BASE_BIN")"
CACHE_KEY="${BASE_MD5}__${SUITE_MD5}__${MODE}"
CACHE_FILE="$CACHE_DIR/${CACHE_KEY}.log"

run_suite() {
    local bin="$1" work="$2" log="$3"
    rm -rf "$work"; mkdir -p "$work"
    local env_prefix=(env COLD_REGRESSION_WORK_ROOT="$work")
    [ "$HEAVY" = "1" ] && env_prefix+=(CHENG_COLD_RUN_HEAVY=1)
    [ -n "$JOBS" ] && env_prefix+=(COLD_REGRESSION_JOBS="$JOBS")
    ( cd "$CLONE" && nice -n 10 "${env_prefix[@]}" bash "$SUITE_REL" "$bin" ) > "$log" 2>&1
    # suite exits nonzero on any FAIL -- that is an expected signal, not a
    # tool error, so we do not propagate it as our own exit code here.
    return 0
}

BASE_CACHE_HIT=0
if [ -f "$CACHE_FILE" ]; then
    echo "== baseline cache HIT: $CACHE_FILE ==" >&2
    cp "$CACHE_FILE" "$BASE_LOG"
    BASE_CACHE_HIT=1
else
    echo "== baseline cache MISS: running baseline suite ==" >&2
fi

echo "== running fixed suite + (maybe) baseline suite, in parallel ==" >&2
PIDS=""
if [ "$BASE_CACHE_HIT" = "0" ]; then
    run_suite "$BASE_BIN" "$BASE_WORK" "$BASE_LOG" &
    PIDS="$PIDS $!"
fi
run_suite "$FIXED_BIN" "$FIXED_WORK" "$FIXED_LOG" &
PIDS="$PIDS $!"
for pid in $PIDS; do wait "$pid"; done

restore_state

if [ "$BASE_CACHE_HIT" = "0" ]; then
    [ -s "$BASE_LOG" ] || die "baseline suite produced empty log"
    cp "$BASE_LOG" "$CACHE_FILE"
fi
[ -s "$FIXED_LOG" ] || die "fixed suite produced empty log"

# --- mask known noise, then diff + name-level PASS/FAIL comparison ---
NOISE_SED=(-E
    -e 's/perf_bench_([a-zA-Z0-9_]+)_[0-9]+ms/perf_bench_\1_MASKEDms/'
    -e 's/mem_limit_typed_expr_rss_under_4gb_bytes_[0-9]+/mem_limit_typed_expr_rss_under_4gb_bytes_MASKED/'
    -e 's/^cold_regression_duration_s=[0-9]+$/cold_regression_duration_s=MASKED/'
)
BASE_MASKED="$OUT/cold_regression_baseline.masked.log"
FIXED_MASKED="$OUT/cold_regression_fixed.masked.log"
sed "${NOISE_SED[@]}" "$BASE_LOG" > "$BASE_MASKED"
sed "${NOISE_SED[@]}" "$FIXED_LOG" > "$FIXED_MASKED"

noise_count() {
    grep -cE 'perf_bench_[a-zA-Z0-9_]+_[0-9]+ms|mem_limit_typed_expr_rss_under_4gb_bytes_[0-9]+|^cold_regression_duration_s=[0-9]+$' "$1" 2>/dev/null || true
}
BASE_NOISE=$(noise_count "$BASE_LOG")
FIXED_NOISE=$(noise_count "$FIXED_LOG")

IDENTICAL="yes"
"$DIFF" -q "$BASE_MASKED" "$FIXED_MASKED" > "$OUT/masked.diff.txt" 2>&1 || IDENTICAL="no"

NEWFAIL_LIST="$OUT/new_fail.txt"
awk '
    FNR==NR {
        if ($1=="PASS" || $1=="FAIL") base_status[$2]=$1
        next
    }
    {
        if ($1=="PASS" || $1=="FAIL") {
            if ($1=="FAIL" && base_status[$2]!="FAIL") newfail[$2]=1
        }
    }
    END {
        for (k in newfail) print k
    }
' "$BASE_MASKED" "$FIXED_MASKED" | sort > "$NEWFAIL_LIST"
NEWFAIL_COUNT=$(wc -l < "$NEWFAIL_LIST" | tr -d ' ')

BASE_PASS=$(grep -c '^  PASS ' "$BASE_LOG" 2>/dev/null || echo 0)
BASE_FAIL=$(grep -c '^  FAIL ' "$BASE_LOG" 2>/dev/null || echo 0)
FIXED_PASS=$(grep -c '^  PASS ' "$FIXED_LOG" 2>/dev/null || echo 0)
FIXED_FAIL=$(grep -c '^  FAIL ' "$FIXED_LOG" 2>/dev/null || echo 0)

{
    echo "=== cold_regression_ab report ==="
    echo "clone:            $CLONE"
    echo "mode:              $MODE  jobs=${JOBS:-1(default)}"
    echo "baseline binary:   $BASE_BIN  md5=$BASE_MD5  cache=$([ "$BASE_CACHE_HIT" = 1 ] && echo HIT || echo MISS)"
    echo "fixed binary:      $FIXED_BIN"
    echo "baseline log:      $BASE_LOG  ($BASE_PASS pass / $BASE_FAIL fail)"
    echo "fixed log:         $FIXED_LOG  ($FIXED_PASS pass / $FIXED_FAIL fail)"
    echo
    echo "[1] masked byte-diff identical: $IDENTICAL"
    [ "$IDENTICAL" = "no" ] && echo "    see $OUT/masked.diff.txt"
    echo
    echo "[2] new FAIL (present in fixed, not FAIL in baseline): $NEWFAIL_COUNT"
    if [ "$NEWFAIL_COUNT" -gt 0 ]; then
        sed 's/^/    - /' "$NEWFAIL_LIST"
    fi
    echo
    echo "[3] known-noise lines masked: baseline=$BASE_NOISE fixed=$FIXED_NOISE"
    echo "    (perf_bench_*_Nms / mem_limit_typed_expr_rss_under_4gb_bytes_N / cold_regression_duration_s=N)"
} | tee "$OUT/verdict.txt" >&2

if [ "$NEWFAIL_COUNT" -gt 0 ]; then
    echo "verdict=REGRESSION" >&2
    exit 1
else
    echo "verdict=PASS" >&2
    exit 0
fi
