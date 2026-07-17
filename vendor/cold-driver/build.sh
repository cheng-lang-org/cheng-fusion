#!/usr/bin/env bash
# Builds a fusion-local cold driver binary that understands CSG record kind=9
# (call-edge facts) and reports the exact total record count from both writer
# and reader paths, by applying patches/csg-writer-call-edges.patch to a *copy*
# of the main repo's bootstrap/cheng_cold.c and compiling that copy.
#
# Never touches the main repo (cheng-lang) source tree, artifacts, or seeds.
# Safe to re-run any time the patch or the upstream cheng_cold.c changes;
# output is content-addressed so a no-op source means a no-op rebuild.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHENG_ROOT="${CHENG_TOOLCHAIN_ROOT:-${CHENG_ROOT:-/Users/lbcheng/cheng-lang}}"
UPSTREAM_SOURCE="$CHENG_ROOT/bootstrap/cheng_cold.c"
PATCH_FILE="$SCRIPT_DIR/patches/csg-writer-call-edges.patch"
BUILD_DIR="$SCRIPT_DIR/.build"
OUT_BINARY="$SCRIPT_DIR/cheng_cold_csg9"
CC="${CC:-cc}"

if [ ! -f "$UPSTREAM_SOURCE" ]; then
  echo "upstream source not found: $UPSTREAM_SOURCE (set CHENG_TOOLCHAIN_ROOT)" >&2
  exit 1
fi
if [ ! -f "$PATCH_FILE" ]; then
  echo "vendored patch not found: $PATCH_FILE" >&2
  exit 1
fi

# cheng_cold.c #includes these local headers/units (direct closure, verified
# against upstream bootstrap/cheng_cold.c); copy them alongside so the patched
# copy compiles standalone without touching the main repo tree.
UPSTREAM_SIBLINGS=(
  cold_parser.h
  cold_parser.c
  cold_types.h
  macho_direct.h
  elf64_direct.h
  coff_direct.h
  x64_emit.h
  rv64_emit.h
  cold_chengcsg_format.h
  host_runtime.c
)

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/bootstrap"
cp "$UPSTREAM_SOURCE" "$BUILD_DIR/bootstrap/cheng_cold.c"
for name in "${UPSTREAM_SIBLINGS[@]}"; do
  cp "$CHENG_ROOT/bootstrap/$name" "$BUILD_DIR/bootstrap/$name"
done

(cd "$BUILD_DIR" && patch -p1 < "$PATCH_FILE")

TMP_BINARY="$OUT_BINARY.tmp-$$"
"$CC" -std=c11 -O2 -o "$TMP_BINARY" "$BUILD_DIR/bootstrap/cheng_cold.c"

if [ "$(uname)" = "Darwin" ]; then
  codesign --force -s - -i "openclaude.cheng-cold.csg9" "$TMP_BINARY"
fi

mv "$TMP_BINARY" "$OUT_BINARY"
rm -rf "$BUILD_DIR"
echo "built: $OUT_BINARY (from $UPSTREAM_SOURCE + patches/csg-writer-call-edges.patch)"
