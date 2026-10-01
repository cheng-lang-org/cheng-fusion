#!/usr/bin/env python3
import hashlib
import os
import stat
import subprocess
import sys


MAX_PATH_COUNT = 1_000_000
MAX_PATH_BYTES = 64 * 1024 * 1024
MAX_FILE_BYTES = 8 * 1024 * 1024 * 1024
READ_CHUNK_BYTES = 1024 * 1024
CONTENT_CID_DOMAIN = b"cheng.current_source_closure.content.cid"


def fail(message: str) -> None:
    raise RuntimeError(message)


def canonical_relative_path(path: bytes) -> None:
    if not path or path.startswith(b"/") or b"\0" in path:
        fail("source closure path is not canonical")
    components = path.split(b"/")
    if any(component in (b"", b".", b"..") for component in components):
        fail("source closure path component is not canonical")


def git_output(root: str, maximum_bytes: int, *args: str) -> bytes:
    process = subprocess.Popen(
        ["git", "-C", root, *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if process.stdout is None or process.stderr is None:
        process.kill()
        fail("git command pipes are unavailable")
    output = process.stdout.read(maximum_bytes + 1)
    if len(output) > maximum_bytes:
        process.kill()
        process.wait()
        fail("git command output exceeds hard byte limit")
    error = process.stderr.read(1025)
    if len(error) > 1024:
        process.kill()
        process.wait()
        fail("git command error output exceeds hard byte limit")
    return_code = process.wait()
    if return_code != 0:
        fail(
            "git command failed: "
            + error.decode("utf-8", errors="replace")
        )
    return output


def parse_path_stream(raw: bytes) -> list[bytes]:
    if raw and not raw.endswith(b"\0"):
        fail("source closure path stream is not NUL terminated")
    paths = raw[:-1].split(b"\0") if raw else []
    if len(paths) > MAX_PATH_COUNT:
        fail("source closure path count exceeds hard limit")
    if sum(len(path) for path in paths) > MAX_PATH_BYTES:
        fail("source closure path bytes exceed hard limit")
    for path in paths:
        canonical_relative_path(path)
    ordered = sorted(paths)
    for index in range(1, len(ordered)):
        if ordered[index - 1] == ordered[index]:
            fail("source closure path is duplicated")
    return ordered


def enumerate_paths(
    root: str, scopes: list[str]
) -> tuple[bytes, list[bytes], frozenset[bytes]]:
    head = git_output(root, 4096, "rev-parse", "--verify", "HEAD").strip()
    if len(head) != 40 or any(
        byte not in b"0123456789abcdef" for byte in head
    ):
        fail("source closure HEAD identity is invalid")
    tracked = parse_path_stream(
        git_output(
            root,
            MAX_PATH_BYTES + MAX_PATH_COUNT,
            "ls-files",
            "-c",
            "-z",
            "--",
            *scopes,
        )
    )
    untracked = parse_path_stream(
        git_output(
            root,
            MAX_PATH_BYTES + MAX_PATH_COUNT,
            "ls-files",
            "-o",
            "--exclude-per-directory=.gitignore",
            "-z",
            "--",
            *scopes,
        )
    )
    tracked_set = frozenset(tracked)
    if any(path in tracked_set for path in untracked):
        fail("source closure tracked and untracked sets overlap")
    combined = sorted(tracked + untracked)
    if len(combined) > MAX_PATH_COUNT:
        fail("source closure combined path count exceeds hard limit")
    if sum(len(path) for path in combined) > MAX_PATH_BYTES:
        fail("source closure combined path bytes exceed hard limit")
    return head, combined, tracked_set


def identity(st: os.stat_result) -> tuple[int, int, int, int, int, int]:
    return (
        st.st_dev,
        st.st_ino,
        st.st_mode,
        st.st_size,
        st.st_mtime_ns,
        st.st_ctime_ns,
    )


def frame(raw: bytes) -> bytes:
    return len(raw).to_bytes(8, "big") + raw


def content_cid(
    head: bytes,
    scopes: list[bytes],
    member_rows: list[bytes],
) -> str:
    digest = hashlib.sha256()
    digest.update(frame(CONTENT_CID_DOMAIN))
    digest.update(frame(head))
    digest.update(len(scopes).to_bytes(8, "big"))
    for scope in scopes:
        canonical_relative_path(scope)
        digest.update(frame(scope))
    digest.update(len(member_rows).to_bytes(8, "big"))
    prior = b""
    for row in member_rows:
        columns = row.rstrip(b"\n").split(b"\t")
        if len(columns) not in (2, 9):
            fail("source closure member row shape is invalid")
        try:
            relative = bytes.fromhex(columns[0].decode("ascii"))
        except (UnicodeDecodeError, ValueError) as error:
            raise RuntimeError(
                "source closure member path hex is invalid"
            ) from error
        canonical_relative_path(relative)
        if relative <= prior:
            fail("source closure member order is invalid")
        prior = relative
        digest.update(frame(relative))
        if len(columns) == 2:
            if columns[1] != b"tracked_deleted":
                fail("source closure deletion row is invalid")
            digest.update(frame(b"tracked_deleted"))
            continue
        if columns[1] not in (b"tracked", b"untracked"):
            fail("source closure member state is invalid")
        if (
            len(columns[2]) != 64
            or any(byte not in b"0123456789abcdef" for byte in columns[2])
        ):
            fail("source closure member digest is invalid")
        size = columns[6]
        mode = columns[5]
        if (
            not size
            or any(byte not in b"0123456789" for byte in size)
            or (len(size) > 1 and size.startswith(b"0"))
        ):
            fail("source closure member size is invalid")
        if (
            not mode
            or any(byte not in b"0123456789" for byte in mode)
            or (len(mode) > 1 and mode.startswith(b"0"))
        ):
            fail("source closure member mode is invalid")
        digest.update(frame(columns[1]))
        digest.update(bytes.fromhex(columns[2].decode("ascii")))
        digest.update(
            b"\x01" if int(mode) & 0o111 else b"\x00"
        )
        digest.update(int(size).to_bytes(8, "big"))
    return digest.hexdigest()


def content_cid_from_manifest(payload: bytes) -> str:
    if (
        not payload.endswith(b"\n")
        or b"\r" in payload
        or b"\0" in payload
    ):
        fail("source closure manifest encoding is invalid")
    lines = payload.splitlines(keepends=True)
    if (
        len(lines) < 6
        or lines[0] != b"schema=cheng.current_source_closure_manifest\n"
        or not lines[1].startswith(b"head=")
    ):
        fail("source closure manifest header is invalid")
    head = lines[1][len(b"head="):-1]
    if (
        len(head) != 40
        or any(byte not in b"0123456789abcdef" for byte in head)
    ):
        fail("source closure manifest HEAD is invalid")
    if not lines[2].startswith(b"scope_count="):
        fail("source closure manifest scope count is absent")
    scope_count_raw = lines[2][len(b"scope_count="):-1]
    if (
        not scope_count_raw
        or any(byte not in b"0123456789" for byte in scope_count_raw)
    ):
        fail("source closure manifest scope count is invalid")
    scope_count = int(scope_count_raw)
    scope_rows = lines[3:3 + scope_count]
    if len(scope_rows) != scope_count:
        fail("source closure manifest scope rows are truncated")
    scopes: list[bytes] = []
    for row in scope_rows:
        if not row.startswith(b"scope="):
            fail("source closure manifest scope row is invalid")
        try:
            scope = bytes.fromhex(row[len(b"scope="):-1].decode("ascii"))
        except (UnicodeDecodeError, ValueError) as error:
            raise RuntimeError(
                "source closure manifest scope hex is invalid"
            ) from error
        canonical_relative_path(scope)
        scopes.append(scope)
    if scopes != sorted(scopes) or len(scopes) != len(set(scopes)):
        fail("source closure manifest scopes are not canonical")
    count_index = 3 + scope_count
    if (
        count_index + 1 >= len(lines)
        or not lines[count_index].startswith(b"path_count=")
        or not lines[count_index + 1].startswith(b"content_cid=")
    ):
        fail("source closure manifest content identity is absent")
    path_count_raw = lines[count_index][len(b"path_count="):-1]
    if (
        not path_count_raw
        or any(byte not in b"0123456789" for byte in path_count_raw)
    ):
        fail("source closure manifest path count is invalid")
    member_rows = lines[count_index + 2:]
    if len(member_rows) != int(path_count_raw):
        fail("source closure manifest path count mismatch")
    claimed = lines[count_index + 1][len(b"content_cid="):-1]
    expected = content_cid(head, scopes, member_rows).encode("ascii")
    if claimed != expected:
        fail("source closure manifest content CID mismatch")
    return expected.decode("ascii")


def stable_file_row(
    root_bytes: bytes, relative: bytes, is_tracked: bool
) -> tuple[bytes, bool]:
    absolute = os.path.join(root_bytes, relative)
    try:
        path_before = os.lstat(absolute)
    except FileNotFoundError:
        if not is_tracked:
            fail(
                "untracked source closure member disappeared: "
                + os.fsdecode(relative)
            )
        return (
            relative.hex().encode("ascii") + b"\ttracked_deleted\n",
            True,
        )
    if not stat.S_ISREG(path_before.st_mode):
        fail(
            "source closure member is not a regular file: "
            + os.fsdecode(relative)
        )
    if path_before.st_size < 0 or path_before.st_size > MAX_FILE_BYTES:
        fail("source closure member exceeds hard byte limit")
    flags = os.O_RDONLY
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(absolute, flags)
    try:
        descriptor_before = os.fstat(descriptor)
        if identity(path_before) != identity(descriptor_before):
            fail("source closure member changed before read")
        digest = hashlib.sha256()
        observed_size = 0
        while True:
            chunk = os.read(descriptor, READ_CHUNK_BYTES)
            if not chunk:
                break
            observed_size += len(chunk)
            if observed_size > MAX_FILE_BYTES:
                fail("source closure member read exceeds hard byte limit")
            digest.update(chunk)
        descriptor_after = os.fstat(descriptor)
    finally:
        os.close(descriptor)
    path_after = os.lstat(absolute)
    if (
        identity(path_before) != identity(descriptor_after)
        or identity(path_before) != identity(path_after)
        or observed_size != path_before.st_size
    ):
        fail("source closure member changed during read")
    return (
        (
            relative.hex().encode("ascii")
            + b"\t"
            + (b"tracked" if is_tracked else b"untracked")
            + b"\t"
            + digest.hexdigest().encode("ascii")
            + b"\t"
            + str(path_before.st_dev).encode("ascii")
            + b"\t"
            + str(path_before.st_ino).encode("ascii")
            + b"\t"
            + str(path_before.st_mode).encode("ascii")
            + b"\t"
            + str(path_before.st_size).encode("ascii")
            + b"\t"
            + str(path_before.st_mtime_ns).encode("ascii")
            + b"\t"
            + str(path_before.st_ctime_ns).encode("ascii")
            + b"\n"
        ),
        False,
    )


def build_manifest(root: str, scopes: list[str]) -> bytes:
    root = os.path.realpath(root)
    if not os.path.isdir(root):
        fail("source closure root is not a directory")
    canonical_scopes = sorted(set(scopes))
    if not canonical_scopes or len(canonical_scopes) != len(scopes):
        fail("source closure scopes are empty or duplicated")
    for scope in canonical_scopes:
        canonical_relative_path(os.fsencode(scope))
    head_before, paths_before, tracked_before = enumerate_paths(
        root, canonical_scopes
    )
    rows = bytearray()
    rows.extend(b"schema=cheng.current_source_closure_manifest\n")
    rows.extend(b"head=" + head_before + b"\n")
    rows.extend(
        b"scope_count=" + str(len(canonical_scopes)).encode("ascii") + b"\n"
    )
    for scope in canonical_scopes:
        rows.extend(b"scope=" + os.fsencode(scope).hex().encode("ascii") + b"\n")
    rows.extend(b"path_count=" + str(len(paths_before)).encode("ascii") + b"\n")
    root_bytes = os.fsencode(root)
    deleted_paths = []
    member_rows: list[bytes] = []
    for relative in paths_before:
        row, deleted = stable_file_row(
            root_bytes, relative, relative in tracked_before
        )
        member_rows.append(row)
        if deleted:
            deleted_paths.append(relative)
    rows.extend(
        b"content_cid="
        + content_cid(
            head_before,
            [os.fsencode(scope) for scope in canonical_scopes],
            member_rows,
        ).encode("ascii")
        + b"\n"
    )
    for row in member_rows:
        rows.extend(row)
    head_after, paths_after, tracked_after = enumerate_paths(
        root, canonical_scopes
    )
    if (
        head_after != head_before
        or paths_after != paths_before
        or tracked_after != tracked_before
    ):
        fail("source closure enumeration changed during capture")
    for relative in deleted_paths:
        try:
            os.lstat(os.path.join(root_bytes, relative))
        except FileNotFoundError:
            continue
        fail(
            "tracked-deleted source closure member appeared during capture: "
            + os.fsdecode(relative)
        )
    return bytes(rows)


def write_atomic(path: str, payload: bytes) -> None:
    directory = os.path.dirname(os.path.abspath(path))
    os.makedirs(directory, exist_ok=True)
    try:
        os.lstat(path)
    except FileNotFoundError:
        pass
    else:
        fail("source closure manifest output already exists")
    temporary = os.path.join(
        directory, "." + os.path.basename(path) + f".{os.getpid()}.tmp"
    )
    try:
        descriptor = os.open(
            temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600
        )
        try:
            view = memoryview(payload)
            while view:
                written = os.write(descriptor, view)
                if written <= 0:
                    fail("source closure manifest write made no progress")
                view = view[written:]
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        os.link(temporary, path, follow_symlinks=False)
        os.unlink(temporary)
        directory_descriptor = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(directory_descriptor)
        finally:
            os.close(directory_descriptor)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main() -> int:
    if len(sys.argv) < 4:
        print(
            "usage: current_source_closure_manifest.py ROOT OUT SCOPE...",
            file=sys.stderr,
        )
        return 2
    try:
        manifest = build_manifest(sys.argv[1], sys.argv[3:])
        write_atomic(sys.argv[2], manifest)
    except (OSError, RuntimeError) as error:
        print(f"current_source_closure_manifest_error={error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
