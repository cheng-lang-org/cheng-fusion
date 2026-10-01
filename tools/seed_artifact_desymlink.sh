#!/bin/bash
# seed_artifact_desymlink.sh <dir-entry>
#
# Replace a symlink directory entry with a verified regular copy of its
# resolved target, atomically, without ever following the link for writes
# and without touching the target itself.
#
# Protocol (matches the 2026-07-26 cheng-lang lessons.md entry, executed by
# hand twice before this tool existed):
#   1. entry must currently be a symlink whose target is a regular file in
#      the SAME directory (external targets are refused outright);
#   2. stage an O_EXCL|O_NOFOLLOW regular temp copy in that directory with
#      the target's permission bits;
#   3. sha256-verify the temp against the target;
#   4. re-verify neither the symlink nor the target inode/mtime/size drifted
#      while staging;
#   5. atomic rename(2) the temp over the symlink directory entry;
#   6. fsync the parent directory.
#
# Exit 0 with a one-line receipt on success; exit 1 with an exact reason on
# any refused or drifted state (nothing is modified on failure paths that
# precede the rename; a post-rename failure is reported loudly).
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: seed_artifact_desymlink.sh <dir-entry>" >&2
  exit 2
fi

python3 - "$1" <<'PYEOF'
import hashlib
import os
import sys

entry = sys.argv[1]

def fail(reason):
    print(f"seed_artifact_desymlink: {reason}", file=sys.stderr)
    sys.exit(1)

if entry != os.path.abspath(entry):
    fail(f"path must be canonical absolute: {entry}")
if os.path.realpath(os.path.dirname(entry)) != os.path.dirname(entry):
    fail(f"parent directory must be canonical: {entry}")

directory = os.path.dirname(entry)
if not os.path.islink(entry):
    fail(f"entry is not a symlink (nothing to do, refusing): {entry}")

link_target = os.readlink(entry)
resolved = os.path.realpath(entry)
if os.path.dirname(resolved) != directory:
    fail(f"target escapes the entry's own directory, refusing to copy external bytes: {entry} -> {resolved}")
if not os.path.isfile(resolved) or os.path.islink(resolved):
    fail(f"target is not a regular file: {resolved}")

target_stat = os.stat(resolved)
data = open(resolved, "rb").read()
sha = hashlib.sha256(data).hexdigest()

tmp = os.path.join(directory, f".{os.path.basename(entry)}.desymlink.tmp.{os.getpid()}")
fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
             target_stat.st_mode & 0o777)
try:
    os.write(fd, data)
    os.fsync(fd)
finally:
    os.close(fd)

try:
    if hashlib.sha256(open(tmp, "rb").read()).hexdigest() != sha:
        fail("staged copy sha256 mismatch")

    # drift re-check: symlink and target must be exactly as captured
    if not os.path.islink(entry) or os.readlink(entry) != link_target:
        fail("symlink drifted while staging")
    after = os.stat(resolved)
    if (after.st_ino, after.st_mtime_ns, after.st_size) != (
            target_stat.st_ino, target_stat.st_mtime_ns, target_stat.st_size):
        fail("target drifted while staging")

    os.rename(tmp, entry)
except BaseException:
    try:
        os.unlink(tmp)
    except OSError:
        pass
    raise

dfd = os.open(directory, os.O_RDONLY)
try:
    os.fsync(dfd)
finally:
    os.close(dfd)

final = os.lstat(entry)
if os.path.islink(entry) or not os.path.isfile(entry):
    fail("post-rename verification failed: entry is still not a regular file")

print(f"desymlinked={entry} sha256={sha} bytes={final.st_size} "
      f"mode={oct(final.st_mode & 0o777)}")
PYEOF
