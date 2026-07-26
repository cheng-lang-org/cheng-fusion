#!/usr/bin/env bash
# Builds a fusion-local cold driver binary from a *copy* of the main repo's
# bootstrap/cheng_cold.c plus patches/*.patch (in glob order), and compiles
# that copy.
#
# CSG record kind=9 (call-edge facts) writer/reader support is upstream in
# bootstrap/cheng_cold.c since 2026-07-22 (agent-19 lane2, including the
# edge-target strip=false fix); the former csg-writer-call-edges.patch was
# dropped once the main repo carried it.
#
# Current patches:
#   print-symbols-symbol-list.patch  lowering_symbols/primary_symbols emit the
#                                    exact comma-separated function-name list
#                                    (fusion cheng_symbols contract), not a
#                                    "N functions scanned" summary
#
# Never touches the main repo (cheng-lang) source tree, artifacts, or seeds.
# Safe to re-run any time a patch or the upstream cheng_cold.c changes. Each
# run requires two different-inode links to be raw-byte identical, rejects
# source/tool drift, and writes a hash-bound receipt beside the binary.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FUSION_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_SCRIPT_PATH="$SCRIPT_DIR/build.sh"
CONTRACT_PATH="$FUSION_ROOT/src/cheng_csg_current_contract.ts"
CHENG_ROOT="${CHENG_TOOLCHAIN_ROOT:-${CHENG_ROOT:-/Users/lbcheng/cheng-lang}}"
UPSTREAM_SOURCE="$CHENG_ROOT/bootstrap/cheng_cold.c"
PATCH_FILE="$SCRIPT_DIR/patches/print-symbols-symbol-list.patch"
BUILD_DIR="$SCRIPT_DIR/.build"
OUT_BINARY="$SCRIPT_DIR/cheng_cold_csg9"
OUT_RECEIPT="$SCRIPT_DIR/cheng_cold_csg9.receipt"
OUT_SOURCE_MANIFEST="$SCRIPT_DIR/cheng_cold_csg9.source-manifest"
COMPILER_PATH="/usr/bin/cc"
BUN_PATH="$(command -v bun)"

if [ ! -f "$UPSTREAM_SOURCE" ]; then
  echo "upstream source not found: $UPSTREAM_SOURCE (set CHENG_TOOLCHAIN_ROOT)" >&2
  exit 1
fi
if [ ! -f "$PATCH_FILE" ]; then
  echo "vendored patch not found: $PATCH_FILE" >&2
  exit 1
fi
if [ ! -f "$CONTRACT_PATH" ]; then
  echo "current CSG contract not found: $CONTRACT_PATH" >&2
  exit 1
fi
if [ ! -f "$COMPILER_PATH" ] || [ -L "$COMPILER_PATH" ] || [ ! -x "$COMPILER_PATH" ]; then
  echo "canonical C compiler is not executable: $COMPILER_PATH" >&2
  exit 1
fi
if [ -z "$BUN_PATH" ] || [[ "$BUN_PATH" != /* ]] || [ ! -f "$BUN_PATH" ] || [ -L "$BUN_PATH" ] || [ ! -x "$BUN_PATH" ]; then
  echo "bun is required to read the unique current CSG contract" >&2
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
EXPECTED_LOCAL_INCLUDES="$BUILD_DIR/local-includes.expected"
ACTUAL_LOCAL_INCLUDES="$BUILD_DIR/local-includes.actual"
printf '%s\n' "${UPSTREAM_SIBLINGS[@]}" |
  LC_ALL=C sort -u > "$EXPECTED_LOCAL_INCLUDES"
{
  sed -n 's/^[[:space:]]*#include[[:space:]]*"\([^"]*\)".*/\1/p' \
    "$UPSTREAM_SOURCE"
  for name in "${UPSTREAM_SIBLINGS[@]}"; do
    sed -n 's/^[[:space:]]*#include[[:space:]]*"\([^"]*\)".*/\1/p' \
      "$CHENG_ROOT/bootstrap/$name"
  done
} | LC_ALL=C sort -u > "$ACTUAL_LOCAL_INCLUDES"
if ! cmp "$EXPECTED_LOCAL_INCLUDES" "$ACTUAL_LOCAL_INCLUDES"; then
  echo "upstream local include closure differs from the receipt-bound source set" >&2
  exit 1
fi
SOURCE_BEFORE="$BUILD_DIR/source.before.sha256"
SOURCE_AFTER="$BUILD_DIR/source.after.sha256"
TOOL_BEFORE="$BUILD_DIR/tool.before.sha256"
TOOL_AFTER="$BUILD_DIR/tool.after.sha256"
COMPILER_VERSION_BEFORE="$BUILD_DIR/compiler-version.before.sha256"
COMPILER_VERSION_AFTER="$BUILD_DIR/compiler-version.after.sha256"
BUN_VERSION_BEFORE="$BUILD_DIR/bun-version.before.sha256"
BUN_VERSION_AFTER="$BUILD_DIR/bun-version.after.sha256"
{
  shasum -a 256 "$UPSTREAM_SOURCE"
  for name in "${UPSTREAM_SIBLINGS[@]}"; do
    shasum -a 256 "$CHENG_ROOT/bootstrap/$name"
  done
} > "$SOURCE_BEFORE"
shasum -a 256 \
  "$BUILD_SCRIPT_PATH" "$CONTRACT_PATH" "$PATCH_FILE" "$COMPILER_PATH" "$BUN_PATH" \
  > "$TOOL_BEFORE"
"$COMPILER_PATH" --version | shasum -a 256 | awk '{print $1}' \
  > "$COMPILER_VERSION_BEFORE"
"$BUN_PATH" --version | shasum -a 256 | awk '{print $1}' \
  > "$BUN_VERSION_BEFORE"
cp "$UPSTREAM_SOURCE" "$BUILD_DIR/bootstrap/cheng_cold.c"
for name in "${UPSTREAM_SIBLINGS[@]}"; do
  cp "$CHENG_ROOT/bootstrap/$name" "$BUILD_DIR/bootstrap/$name"
done

(cd "$BUILD_DIR" && for p in "$SCRIPT_DIR"/patches/*.patch; do patch -p1 < "$p"; done)

GEN2_BINARY="$OUT_BINARY.gen2.tmp-$$"
GEN3_BINARY="$OUT_BINARY.gen3.tmp-$$"
TMP_RECEIPT="$OUT_RECEIPT.tmp-$$"
TMP_SOURCE_MANIFEST="$OUT_SOURCE_MANIFEST.tmp-$$"
BUILD_BINARY="$BUILD_DIR/cheng_cold_csg9"
cleanup() {
  rm -f "$GEN2_BINARY" "$GEN3_BINARY" "$TMP_RECEIPT" "$TMP_SOURCE_MANIFEST"
}
trap cleanup EXIT
build_one() {
  local fixed_point_copy="$1"
  # ld64 derives LC_UUID from the link output identity. Both independent
  # links therefore use this one stable build pathname; copying afterwards
  # gives distinct inodes without deleting the UUID required by dyld.
  "$COMPILER_PATH" -std=c11 -O2 -o "$BUILD_BINARY" \
    "$BUILD_DIR/bootstrap/cheng_cold.c"
  if [ "$(uname)" = "Darwin" ]; then
    codesign --force -s - -i "openclaude.cheng-cold.csg9" "$BUILD_BINARY"
  fi
  cp "$BUILD_BINARY" "$fixed_point_copy"
}
build_one "$GEN2_BINARY"
build_one "$GEN3_BINARY"
if [ "$(stat -f %i "$GEN2_BINARY" 2>/dev/null || stat -c %i "$GEN2_BINARY")" = \
     "$(stat -f %i "$GEN3_BINARY" 2>/dev/null || stat -c %i "$GEN3_BINARY")" ]; then
  echo "GEN2/GEN3 must be different inodes" >&2
  exit 1
fi
cmp "$GEN2_BINARY" "$GEN3_BINARY"
{
  shasum -a 256 "$UPSTREAM_SOURCE"
  for name in "${UPSTREAM_SIBLINGS[@]}"; do
    shasum -a 256 "$CHENG_ROOT/bootstrap/$name"
  done
} > "$SOURCE_AFTER"
cmp "$SOURCE_BEFORE" "$SOURCE_AFTER"
shasum -a 256 \
  "$BUILD_SCRIPT_PATH" "$CONTRACT_PATH" "$PATCH_FILE" "$COMPILER_PATH" "$BUN_PATH" \
  > "$TOOL_AFTER"
"$COMPILER_PATH" --version | shasum -a 256 | awk '{print $1}' \
  > "$COMPILER_VERSION_AFTER"
"$BUN_PATH" --version | shasum -a 256 | awk '{print $1}' \
  > "$BUN_VERSION_AFTER"
cmp "$TOOL_BEFORE" "$TOOL_AFTER"
cmp "$COMPILER_VERSION_BEFORE" "$COMPILER_VERSION_AFTER"
cmp "$BUN_VERSION_BEFORE" "$BUN_VERSION_AFTER"

SOURCE_CLOSURE_SHA="$(shasum -a 256 "$SOURCE_BEFORE" | awk '{print $1}')"
PATCH_SHA="$(awk -v path="$PATCH_FILE" '$2 == path { print $1 }' "$TOOL_BEFORE")"
BUILD_SCRIPT_SHA="$(awk -v path="$BUILD_SCRIPT_PATH" '$2 == path { print $1 }' "$TOOL_BEFORE")"
CONTRACT_SHA="$(awk -v path="$CONTRACT_PATH" '$2 == path { print $1 }' "$TOOL_BEFORE")"
COMPILER_SHA="$(awk -v path="$COMPILER_PATH" '$2 == path { print $1 }' "$TOOL_BEFORE")"
BUN_SHA="$(awk -v path="$BUN_PATH" '$2 == path { print $1 }' "$TOOL_BEFORE")"
CSG_SCHEMA_DESC_SHA="$(
  cd "$FUSION_ROOT"
  "$BUN_PATH" -e 'import {CHENG_CSG_SCHEMA_DESC_SHA256_HEX} from "./src/cheng_csg_current_contract.ts"; process.stdout.write(CHENG_CSG_SCHEMA_DESC_SHA256_HEX)'
)"
COMPILER_VERSION_SHA="$(<"$COMPILER_VERSION_BEFORE")"
BUN_VERSION_SHA="$(<"$BUN_VERSION_BEFORE")"
GEN2_SHA="$(shasum -a 256 "$GEN2_BINARY" | awk '{print $1}')"
GEN3_SHA="$(shasum -a 256 "$GEN3_BINARY" | awk '{print $1}')"
if [ "$GEN2_SHA" != "$GEN3_SHA" ]; then
  echo "GEN2/GEN3 hash mismatch after raw cmp" >&2
  exit 1
fi
{
  echo "schema=cheng_fusion_cold_driver_build_receipt"
  echo "driver_role=official"
  echo "csg_schema_version=2"
  echo "csg_abi_version=1"
  echo "csg_pointer_width=8"
  echo "csg_endian=1"
  echo "csg_schema_desc_sha256=$CSG_SCHEMA_DESC_SHA"
  echo "source_manifest_path=$OUT_SOURCE_MANIFEST"
  echo "source_closure_sha256=$SOURCE_CLOSURE_SHA"
  echo "patch_path=$PATCH_FILE"
  echo "patch_sha256=$PATCH_SHA"
  echo "build_script_path=$BUILD_SCRIPT_PATH"
  echo "build_script_sha256=$BUILD_SCRIPT_SHA"
  echo "contract_path=$CONTRACT_PATH"
  echo "contract_sha256=$CONTRACT_SHA"
  echo "compiler_path=$COMPILER_PATH"
  echo "compiler_sha256=$COMPILER_SHA"
  echo "compiler_version_sha256=$COMPILER_VERSION_SHA"
  echo "bun_path=$BUN_PATH"
  echo "bun_sha256=$BUN_SHA"
  echo "bun_version_sha256=$BUN_VERSION_SHA"
  echo "gen2_sha256=$GEN2_SHA"
  echo "gen3_sha256=$GEN3_SHA"
  echo "raw_equal=1"
  echo "different_inode=1"
} > "$TMP_RECEIPT"

mv "$GEN3_BINARY" "$OUT_BINARY"
OFFICIAL_SHA="$(shasum -a 256 "$OUT_BINARY" | awk '{print $1}')"
if [ "$OFFICIAL_SHA" != "$GEN2_SHA" ]; then
  echo "installed driver differs from fixed point" >&2
  exit 1
fi
echo "official_sha256=$OFFICIAL_SHA" >> "$TMP_RECEIPT"
cp "$SOURCE_BEFORE" "$TMP_SOURCE_MANIFEST"
mv "$TMP_SOURCE_MANIFEST" "$OUT_SOURCE_MANIFEST"
mv "$TMP_RECEIPT" "$OUT_RECEIPT"
rm -f "$GEN2_BINARY"
trap - EXIT
rm -rf "$BUILD_DIR"
echo "built: $OUT_BINARY (raw GEN2=GEN3, receipt=$OUT_RECEIPT)"
