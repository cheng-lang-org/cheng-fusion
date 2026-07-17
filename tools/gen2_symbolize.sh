#!/usr/bin/env bash
# gen2_symbolize.sh -- resolve a crash offset inside a Cheng-built binary to
# its function, WITHOUT debug info and WITHOUT bisect bakes.
#
# Lesson (T60-v2, 2026-07-15): a gen2 self-bake crash was "unsymbolizable"
# (exe has ~79 dynamic symbols; the self-hosted .map has no offset fields),
# so root-causing fell back to a 2-bake bisect (~20 min). In reality the
# sibling primary.o carries a full symtab (3658 text symbols): `nm -n` +
# interval lookup resolves the crash PC in seconds. The T60 crash resolved
# to _MachoProviderLinkExe+0x940 instantly, confirming the ref-deref
# hypothesis without any bake.
#
# Usage:
#   gen2_symbolize.sh <primary.o|cold.map> <text_offset> [more_offsets...]
#     text_offset: PC - __TEXT.__text addr (lldb: `image lookup -a` gives
#     __TEXT.__text+N directly; pass N). Decimal or 0x hex.
#   - *.o        -> nm -n symtab interval lookup (self-hosted backend output)
#   - *.map      -> cheng_line_map_v1 with offset=/size= fields (cold C output)
# Caveat: offsets beyond primary.o __text size live in provider .o regions;
# resolve those against the matching provider object instead.
set -uo pipefail
if (( $# < 2 )); then
  echo "usage: $0 <primary.o|cold.map> <text_offset> [more_offsets...]" >&2
  exit 64
fi

SRC="$1"; shift
OVERALL_STATUS=0
for T in "$@"; do
  TGT="$T"
  case "$SRC" in
    *.map)
      python3 - "$SRC" "$TGT" <<'PY'
import re
import sys

raw_tgt = sys.argv[2]
if not re.fullmatch(r"(?:0[xX][0-9a-fA-F]+|[0-9]+)", raw_tgt):
    print(f"{raw_tgt}: ERROR (offset must be an unsigned decimal or hexadecimal integer)", file=sys.stderr)
    raise SystemExit(64)
tgt = int(raw_tgt[2:], 16) if raw_tgt.lower().startswith("0x") else int(raw_tgt, 10)


def fail(message):
    print(f"{tgt}: ERROR ({message})", file=sys.stderr)
    raise SystemExit(1)


def parse_unsigned(value, field):
    if not re.fullmatch(r"(?:0[xX][0-9a-fA-F]+|[0-9]+)", value):
        fail(f"invalid {field}={value!r}")
    return int(value[2:], 16) if value.lower().startswith("0x") else int(value, 10)


try:
    with open(sys.argv[1], encoding="utf-8", errors="strict") as handle:
        lines = handle.read().splitlines()
except (OSError, UnicodeError) as error:
    fail(f"cannot read map as UTF-8: {error}")

if not lines or lines[0] != "cheng_line_map_v1":
    fail("map must start with the exact cheng_line_map_v1 marker")
if len(lines) < 2 or not re.fullmatch(r"entry_count=[0-9]+", lines[1]):
    fail("map must declare entry_count immediately after the schema marker")
declared_count = int(lines[1].split("=", 1)[1], 10)
entries = []
for line_number, line in enumerate(lines[2:], 3):
    if line == "":
        continue
    fields = line.split("\t")
    if len(fields) < 11 or fields[0] != "entry" or any(field == "" for field in fields[1:7]):
        fail(f"line {line_number} is not a complete entry record")
    if any(not re.fullmatch(r"[0-9]+", field) for field in fields[4:7]):
        fail(f"line {line_number} has invalid decimal source-line columns")
    keyed = {}
    for field in fields[7:]:
        if "=" not in field:
            fail(f"line {line_number} has malformed field {field!r}")
        key, value = field.split("=", 1)
        if not key or key in keyed:
            fail(f"line {line_number} has duplicate/empty field {key!r}")
        keyed[key] = value
    missing = [key for key in ("function_name", "module_path", "offset", "size") if key not in keyed]
    if missing:
        fail(f"line {line_number} is missing {','.join(missing)}")
    if not keyed["function_name"]:
        fail(f"line {line_number} has an empty function_name")
    if not keyed["module_path"]:
        fail(f"line {line_number} has an empty module_path")
    off = parse_unsigned(keyed["offset"], f"line {line_number} offset")
    size = parse_unsigned(keyed["size"], f"line {line_number} size")
    if size <= 0:
        fail(f"line {line_number} size must be positive")
    entries.append((off, size, keyed["function_name"]))
if len(entries) != declared_count:
    fail(f"entry_count={declared_count} but parsed {len(entries)} entries")

matches = [(off, size, fn) for off, size, fn in entries if off <= tgt < off + size]
if not matches:
    print(f"{tgt}: NO_MATCH (no map interval covers offset 0x{tgt:x})")
    raise SystemExit(2)
if len(matches) != 1:
    detail = ",".join(f"{fn or '<missing-name>'}@[0x{off:x},0x{off+size:x})" for off, size, fn in matches)
    print(f"{tgt}: ERROR AMBIGUOUS (map intervals={detail})", file=sys.stderr)
    raise SystemExit(3)
off, size, fn = matches[0]
if not fn:
    print(f"{tgt}: ERROR (matched map interval has no function_name)", file=sys.stderr)
    raise SystemExit(1)
print(f"{tgt}: {fn} +0x{tgt-off:x} (interval=[0x{off:x},0x{off+size:x}))")
PY
      ;;
    *)
      python3 - "$SRC" "$TGT" <<'PY'
import bisect
import re
import subprocess
import sys

src = sys.argv[1]
raw_tgt = sys.argv[2]
if not re.fullmatch(r"(?:0[xX][0-9a-fA-F]+|[0-9]+)", raw_tgt):
    print(f"{raw_tgt}: ERROR (offset must be an unsigned decimal or hexadecimal integer)", file=sys.stderr)
    raise SystemExit(64)
tgt = int(raw_tgt[2:], 16) if raw_tgt.lower().startswith("0x") else int(raw_tgt, 10)


def tool_output(argv):
    result = subprocess.run(argv, capture_output=True, text=True)
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or f"exit={result.returncode}"
        print(f"{tgt}: ERROR ({argv[0]} failed: {detail})", file=sys.stderr)
        raise SystemExit(1)
    return result.stdout


load_commands = tool_output(["otool", "-l", src])
text_sections = re.findall(
    r"^Section[ \t]*$\n"
    r"[ \t]*sectname __text[ \t]*$\n"
    r"[ \t]*segname __TEXT[ \t]*$\n"
    r"[ \t]*addr (0x[0-9a-fA-F]+)[ \t]*$\n"
    r"[ \t]*size (0x[0-9a-fA-F]+)[ \t]*$",
    load_commands,
    re.MULTILINE,
)
if len(text_sections) != 1:
    print(
        f"{tgt}: ERROR (expected exactly one __TEXT,__text section, found {len(text_sections)})",
        file=sys.stderr,
    )
    raise SystemExit(1)

text_addr, text_size = (int(value, 16) for value in text_sections[0])
if text_size <= 0:
    print(f"{tgt}: ERROR (__TEXT,__text has invalid size 0x{text_size:x})", file=sys.stderr)
    raise SystemExit(1)
text_end = text_addr + text_size

symbols_by_start = {}
for line in tool_output(["nm", "-n", src]).splitlines():
    fields = line.split()
    if len(fields) != 3 or fields[1] not in ("t", "T"):
        continue
    try:
        address = int(fields[0], 16)
    except ValueError:
        continue
    if text_addr <= address < text_end:
        symbols_by_start.setdefault(address - text_addr, set()).add((fields[1], fields[2]))

starts = sorted(symbols_by_start)
if not 0 <= tgt < text_size:
    print(f"{tgt}: NO_MATCH (outside __TEXT,__text [0x0,0x{text_size:x}))")
    raise SystemExit(2)

index = bisect.bisect_right(starts, tgt) - 1
if index < 0:
    print(f"{tgt}: NO_MATCH (no symbol interval covers offset 0x{tgt:x})")
    raise SystemExit(2)

start = starts[index]
end = starts[index + 1] if index + 1 < len(starts) else text_size
symbols = sorted(symbols_by_start[start])
global_symbols = sorted(name for kind, name in symbols if kind == "T")
if len(global_symbols) > 1:
    detail = ",".join(f"T:{name}" for name in global_symbols)
    print(
        f"{tgt}: ERROR AMBIGUOUS "
        f"(interval=[0x{start:x},0x{end:x}) symbols={detail})",
        file=sys.stderr,
    )
    raise SystemExit(3)
if not global_symbols:
    detail = ",".join(name for kind, name in symbols if kind == "t")
    print(
        f"{tgt}: NO_MATCH "
        f"(local text symbol cannot own interval=[0x{start:x},0x{end:x}) symbol={detail})"
    )
    raise SystemExit(2)

name = global_symbols[0]

print(
    f"{tgt}: {name} +0x{tgt-start:x} "
    f"(interval=[0x{start:x},0x{end:x}) __text_size=0x{text_size:x})"
)
PY
      ;;
  esac
  STATUS=$?
  if (( STATUS != 0 && OVERALL_STATUS == 0 )); then
    OVERALL_STATUS=$STATUS
  fi
done
exit "$OVERALL_STATUS"
