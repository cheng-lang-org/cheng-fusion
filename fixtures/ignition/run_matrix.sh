#!/usr/bin/env bash
# run_matrix.sh — 88+ 契约电池固化 runner。
#
# 用法: run_matrix.sh <DRIVER绝对路径> [TREE_ROOT] [OUT_DIR]
#   DRIVER绝对路径  — 必填, cheng backend driver 可执行文件绝对路径
#   TREE_ROOT       — 选填, 默认取 matrix.json 的 defaultRoot
#   OUT_DIR         — 选填, 默认 ./battery_out (相对当前工作目录)
#
# 逐 entry: 冒号语法编译 --root:<tree> --in:<fixture> --emit:exe --link-providers
# --target:arm64-apple-darwin --out:<exe>, 再按契约字段断言:
#   expectCompileBail — 编译 rc!=0 且编译日志含 "bail=<N>"(数字边界匹配)
#   expectCompileRc   — 编译 rc 精确匹配
#   expectRc          — 编译须 rc=0 且产出 exe, 运行 rc 精确匹配
#     (可选叠加 expectStdout 字符串精确匹配 / golden 文件字节精确匹配, 用 /usr/bin/cmp)
#   planned==true 或无 fixture 字段 — 记 SKIP_PLANNED, 不编不跑
#
# 输出: 每 entry 一行 "<name> <VERDICT>", 末尾汇总计数, 逐条明细落 OUT_DIR/results.json。

set -u
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MATRIX_JSON="$SCRIPT_DIR/matrix.json"

usage() {
    echo "Usage: $0 <DRIVER_ABS_PATH> [TREE_ROOT] [OUT_DIR]" >&2
    exit 2
}

if [ "$#" -lt 1 ]; then
    usage
fi

DRIVER="$1"
case "$DRIVER" in
    /*) ;;
    *) echo "ERROR: DRIVER must be an absolute path, got: $DRIVER" >&2; exit 2 ;;
esac
if [ ! -x "$DRIVER" ]; then
    echo "ERROR: driver not found or not executable: $DRIVER" >&2
    exit 2
fi
if [ ! -f "$MATRIX_JSON" ]; then
    echo "ERROR: matrix.json not found: $MATRIX_JSON" >&2
    exit 2
fi

DEFAULT_ROOT="$(python3 -c '
import json, sys
with open(sys.argv[1]) as f:
    d = json.load(f)
print(d["defaultRoot"])
' "$MATRIX_JSON")"

TREE_ROOT="${2:-$DEFAULT_ROOT}"
OUT_DIR="${3:-./battery_out}"

if [ ! -d "$TREE_ROOT" ]; then
    echo "ERROR: TREE_ROOT is not a directory: $TREE_ROOT" >&2
    exit 2
fi

mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"

unset CHENG_NO_BACKEND_DRIVER_HANDOFF CHENG_REQUIRE_PURE_PROVIDERS
export CHENG_PROCESS_MAX_RSS_BYTES=12884901888

RESULTS_JSONL="$OUT_DIR/.results.jsonl"
RESULTS_JSON="$OUT_DIR/results.json"
: > "$RESULTS_JSONL"

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

US=$'\x1f'

json_str() {
    python3 -c 'import json,sys; print(json.dumps(sys.argv[1], ensure_ascii=False))' "$1"
}

record_result() {
    local name="$1" verdict="$2" detail="$3"
    case "$verdict" in
        PASS) PASS_COUNT=$((PASS_COUNT + 1)) ;;
        FAIL) FAIL_COUNT=$((FAIL_COUNT + 1)) ;;
        SKIP_PLANNED) SKIP_COUNT=$((SKIP_COUNT + 1)) ;;
        *) echo "ERROR: unknown verdict '$verdict' for entry '$name'" >&2; exit 3 ;;
    esac
    echo "$name $verdict"
    local name_j detail_j
    name_j="$(json_str "$name")"
    detail_j="$(json_str "$detail")"
    printf '{"name": %s, "verdict": "%s", "detail": %s}\n' "$name_j" "$verdict" "$detail_j" >> "$RESULTS_JSONL"
}

extract_entries() {
    python3 - "$MATRIX_JSON" <<'PYEOF'
import json, sys

US = "\x1f"
with open(sys.argv[1]) as f:
    data = json.load(f)

for e in data["entries"]:
    fields = [
        e.get("name", ""),
        e.get("fixture", ""),
        str(e.get("expectRc", "")) if "expectRc" in e else "",
        str(e.get("expectCompileRc", "")) if "expectCompileRc" in e else "",
        str(e.get("expectCompileBail", "")) if "expectCompileBail" in e else "",
        "1" if e.get("planned") else "0",
        e.get("expectStdout", ""),
        e.get("golden", ""),
    ]
    for i, v in enumerate(fields):
        if "\n" in v or "\x1f" in v:
            sys.exit(f"unsupported char (newline/US) in field {i} of entry {e.get('name')}")
    print(US.join(fields))
PYEOF
}

while IFS="$US" read -r name fixture expectRc expectCompileRc expectCompileBail planned expectStdout golden; do
    [ -z "$name" ] && continue

    if [ "$planned" = "1" ] || [ -z "$fixture" ]; then
        record_result "$name" "SKIP_PLANNED" "planned entry or no fixture attached"
        continue
    fi

    fixture_path="$SCRIPT_DIR/$fixture"
    if [ ! -f "$fixture_path" ]; then
        record_result "$name" "FAIL" "fixture file not found: $fixture_path"
        continue
    fi

    exe_out="$OUT_DIR/$name.exe"
    compile_log="$OUT_DIR/$name.compile.log"
    rm -f "$exe_out" "$compile_log"

    timeout 60 "$DRIVER" system-link-exec \
        "--root:$TREE_ROOT" "--in:$fixture_path" \
        --emit:exe --link-providers --target:arm64-apple-darwin \
        "--out:$exe_out" > "$compile_log" 2>&1
    compile_rc=$?

    if [ -n "$expectCompileBail" ]; then
        if [ "$compile_rc" -ne 0 ] && grep -Eq "bail=${expectCompileBail}([^0-9]|\$)" "$compile_log"; then
            record_result "$name" "PASS" "expectCompileBail=$expectCompileBail gotRc=$compile_rc"
        else
            record_result "$name" "FAIL" "expectCompileBail=$expectCompileBail gotRc=$compile_rc log_tail=$(tail -c 300 "$compile_log" | tr '\n' ' ')"
        fi
        continue
    fi

    if [ -n "$expectCompileRc" ]; then
        if [ "$compile_rc" -eq "$expectCompileRc" ]; then
            record_result "$name" "PASS" "expectCompileRc=$expectCompileRc gotRc=$compile_rc"
        else
            record_result "$name" "FAIL" "expectCompileRc=$expectCompileRc gotRc=$compile_rc log_tail=$(tail -c 300 "$compile_log" | tr '\n' ' ')"
        fi
        continue
    fi

    # 默认路径: 运行时 expectRc 断言 (compile 须 rc=0 且真正产出 exe)
    if [ "$compile_rc" -ne 0 ]; then
        record_result "$name" "FAIL" "unexpected compile failure rc=$compile_rc log_tail=$(tail -c 400 "$compile_log" | tr '\n' ' ')"
        continue
    fi
    if [ ! -f "$exe_out" ]; then
        record_result "$name" "FAIL" "compile rc=0 but no exe produced at $exe_out"
        continue
    fi
    chmod +x "$exe_out"

    stdout_file="$OUT_DIR/$name.stdout"
    stderr_file="$OUT_DIR/$name.stderr"
    timeout 20 "$exe_out" > "$stdout_file" 2> "$stderr_file"
    run_rc=$?

    ok=1
    detail="runRc=$run_rc expectRc=$expectRc"

    if [ -n "$expectRc" ] && [ "$run_rc" -ne "$expectRc" ]; then
        ok=0
    fi

    if [ -n "$expectStdout" ]; then
        got_stdout="$(cat "$stdout_file")"
        if [ "$got_stdout" != "$expectStdout" ]; then
            ok=0
            detail="$detail stdout_got=$(json_str "$got_stdout") stdout_want=$(json_str "$expectStdout")"
        fi
    fi

    if [ -n "$golden" ]; then
        golden_path="$SCRIPT_DIR/$golden"
        if [ ! -f "$golden_path" ]; then
            ok=0
            detail="$detail golden_file_missing=$golden_path"
        elif ! /usr/bin/cmp -s "$stdout_file" "$golden_path"; then
            ok=0
            detail="$detail golden_mismatch=$(/usr/bin/cmp "$stdout_file" "$golden_path" 2>&1 | head -1)"
        fi
    fi

    if [ "$ok" -eq 1 ]; then
        record_result "$name" "PASS" "$detail"
    else
        record_result "$name" "FAIL" "$detail"
    fi
done < <(extract_entries)

python3 -c '
import json, sys
items = []
with open(sys.argv[1]) as f:
    for line in f:
        line = line.strip()
        if line:
            items.append(json.loads(line))
with open(sys.argv[2], "w") as f:
    json.dump(items, f, ensure_ascii=False, indent=2)
' "$RESULTS_JSONL" "$RESULTS_JSON"
rm -f "$RESULTS_JSONL"

TOTAL=$((PASS_COUNT + FAIL_COUNT + SKIP_COUNT))
echo
echo "SUMMARY: total=$TOTAL PASS=$PASS_COUNT FAIL=$FAIL_COUNT SKIP_PLANNED=$SKIP_COUNT"
echo "results.json: $RESULTS_JSON"

if [ "$FAIL_COUNT" -gt 0 ]; then
    exit 1
fi
exit 0
