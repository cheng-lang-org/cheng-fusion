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
SRC="$1"; shift
for T in "$@"; do
  TGT=$((T))
  case "$SRC" in
    *.map)
      python3 - "$SRC" "$TGT" <<'PY'
import sys
best=None
for line in open(sys.argv[1]):
    if not line.startswith('entry\t'): continue
    off=size=None; fn=''
    for p in line.rstrip().split('\t'):
        if p.startswith('offset=0x'): off=int(p[7:],16)
        elif p.startswith('size='): size=int(p[5:])
        elif p.startswith('function_name='): fn=p[14:]
    if off is not None and size and off <= int(sys.argv[2]) < off+size:
        print(f"{sys.argv[2]}: {fn} +0x{int(sys.argv[2])-off:x} (offset=0x{off:x} size={size})"); best=fn
if not best: print(f"{sys.argv[2]}: NO_MATCH (offset domain? provider region?)")
PY
      ;;
    *)
      python3 - "$SRC" "$TGT" <<'PY'
import sys, subprocess
out=subprocess.run(['nm','-n',sys.argv[1]],capture_output=True,text=True).stdout
syms=sorted((int(p[0],16),p[2]) for l in out.splitlines()
            if len(p:=l.split())==3 and p[1] in 'tT')
tgt=int(sys.argv[2]); prev=None
for off,name in syms:
    if off>tgt: break
    prev=(off,name)
if prev: print(f"{tgt}: {prev[1]} +0x{tgt-prev[0]:x} (sym_off=0x{prev[0]:x})")
else: print(f"{tgt}: NO_MATCH")
PY
      ;;
  esac
done
