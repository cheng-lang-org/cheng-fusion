#!/usr/bin/env python3
"""Materialize and validate the unique current-source closure schema."""

from __future__ import annotations

import ctypes
import errno
import hashlib
import os
import re
import shutil
import stat
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

import current_source_closure_manifest as closure


READ_CHUNK_BYTES = 1024 * 1024
HEAD_RE = re.compile(rb"[0-9a-f]{40}")
SHA256_RE = re.compile(rb"[0-9a-f]{64}")
SNAPSHOT_DIRECTORY_MODE = 0o500
SNAPSHOT_REGULAR_MODE = 0o400
SNAPSHOT_EXECUTABLE_MODE = 0o500


class SnapshotError(RuntimeError):
    pass


@dataclass(frozen=True)
class PresentRow:
    relative: bytes
    state: bytes
    sha256: bytes
    device: int
    inode: int
    mode: int
    size: int
    mtime_ns: int
    ctime_ns: int


@dataclass(frozen=True)
class ParsedManifest:
    raw: bytes
    head: bytes
    scopes: tuple[bytes, ...]
    content_cid: bytes
    present: tuple[PresentRow, ...]
    deleted: tuple[bytes, ...]


def fail(message: str) -> None:
    raise SnapshotError(message)


def exact_uint(raw: bytes, label: str) -> int:
    if not raw or any(byte not in b"0123456789" for byte in raw):
        fail(label + " is not an unsigned decimal")
    if len(raw) > 1 and raw.startswith(b"0"):
        fail(label + " is not canonical")
    return int(raw)


def canonical_relative(relative: bytes) -> None:
    closure.canonical_relative_path(relative)


def stable_identity(
    info: os.stat_result,
) -> tuple[int, int, int, int, int, int, int, int, int]:
    return (
        info.st_dev,
        info.st_ino,
        info.st_mode,
        info.st_nlink,
        info.st_uid,
        info.st_gid,
        info.st_size,
        info.st_mtime_ns,
        info.st_ctime_ns,
    )


def open_bounded_regular(
    path: bytes, maximum: int
) -> tuple[int, os.stat_result]:
    if not hasattr(os, "O_NOFOLLOW"):
        fail("O_NOFOLLOW is required for snapshot identity")
    flags = os.O_RDONLY | os.O_NOFOLLOW
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    descriptor = os.open(path, flags)
    try:
        opened = os.fstat(descriptor)
    except BaseException:
        os.close(descriptor)
        raise
    if not stat.S_ISREG(opened.st_mode) or opened.st_size > maximum:
        os.close(descriptor)
        fail("input is not a bounded regular file")
    return descriptor, opened


def stable_read_absolute(path: bytes, maximum: int) -> tuple[bytes, os.stat_result]:
    descriptor, opened = open_bounded_regular(path, maximum)
    try:
        chunks: list[bytes] = []
        observed = 0
        while True:
            chunk = os.read(descriptor, READ_CHUNK_BYTES)
            if not chunk:
                break
            observed += len(chunk)
            if observed > maximum:
                fail("input exceeds hard byte limit")
            chunks.append(chunk)
        closed = os.fstat(descriptor)
    finally:
        os.close(descriptor)
    after = os.lstat(path)
    if (
        stable_identity(opened) != stable_identity(closed)
        or stable_identity(opened) != stable_identity(after)
        or observed != opened.st_size
    ):
        fail("input changed during read")
    return b"".join(chunks), opened


def stable_digest_absolute(
    path: bytes, maximum: int
) -> tuple[int, bytes, os.stat_result]:
    descriptor, opened = open_bounded_regular(path, maximum)
    try:
        digest = hashlib.sha256()
        observed = 0
        while True:
            chunk = os.read(descriptor, READ_CHUNK_BYTES)
            if not chunk:
                break
            observed += len(chunk)
            if observed > maximum:
                fail("input exceeds hard byte limit")
            digest.update(chunk)
        closed = os.fstat(descriptor)
    finally:
        os.close(descriptor)
    after = os.lstat(path)
    if (
        stable_identity(opened) != stable_identity(closed)
        or stable_identity(opened) != stable_identity(after)
        or observed != opened.st_size
    ):
        fail("input changed during digest")
    return observed, digest.hexdigest().encode("ascii"), opened


def parse_manifest(path: str) -> ParsedManifest:
    raw, _info = stable_read_absolute(
        os.fsencode(path), closure.MAX_PATH_BYTES * 4
    )
    if not raw.endswith(b"\n") or b"\r" in raw or b"\0" in raw:
        fail("manifest encoding is invalid")
    lines = raw.splitlines()
    cursor = 0

    def take(prefix: bytes) -> bytes:
        nonlocal cursor
        if cursor >= len(lines) or not lines[cursor].startswith(prefix):
            fail("manifest field is missing: " + prefix.decode("ascii"))
        value = lines[cursor][len(prefix) :]
        cursor += 1
        return value

    if take(b"schema=") != b"cheng.current_source_closure_manifest":
        fail("manifest schema is not the unique latest schema")
    head = take(b"head=")
    if not HEAD_RE.fullmatch(head):
        fail("manifest HEAD identity is invalid")
    scope_count = exact_uint(take(b"scope_count="), "scope_count")
    if scope_count <= 0:
        fail("manifest scope set is empty")
    scopes: list[bytes] = []
    for _index in range(scope_count):
        encoded = take(b"scope=")
        try:
            scope = bytes.fromhex(encoded.decode("ascii"))
        except (UnicodeDecodeError, ValueError) as error:
            raise SnapshotError("manifest scope hex is invalid") from error
        canonical_relative(scope)
        scopes.append(scope)
    if scopes != sorted(scopes) or len(scopes) != len(set(scopes)):
        fail("manifest scopes are not strictly ordered")
    path_count = exact_uint(take(b"path_count="), "path_count")
    if path_count > closure.MAX_PATH_COUNT:
        fail("manifest path count exceeds hard limit")
    content_cid = take(b"content_cid=")
    if not SHA256_RE.fullmatch(content_cid):
        fail("manifest content CID is invalid")
    present: list[PresentRow] = []
    deleted: list[bytes] = []
    ordered_paths: list[bytes] = []
    for _index in range(path_count):
        if cursor >= len(lines):
            fail("manifest path row is missing")
        columns = lines[cursor].split(b"\t")
        cursor += 1
        try:
            relative = bytes.fromhex(columns[0].decode("ascii"))
        except (IndexError, UnicodeDecodeError, ValueError) as error:
            raise SnapshotError("manifest path hex is invalid") from error
        canonical_relative(relative)
        if not any(
            relative == scope or relative.startswith(scope + b"/")
            for scope in scopes
        ):
            fail("manifest path is outside the declared scopes")
        ordered_paths.append(relative)
        if len(columns) == 2 and columns[1] == b"tracked_deleted":
            deleted.append(relative)
            continue
        if len(columns) != 9 or columns[1] not in (b"tracked", b"untracked"):
            fail("manifest path row shape is invalid")
        if not SHA256_RE.fullmatch(columns[2]):
            fail("manifest path digest is invalid")
        row = PresentRow(
            relative=relative,
            state=columns[1],
            sha256=columns[2],
            device=exact_uint(columns[3], "device"),
            inode=exact_uint(columns[4], "inode"),
            mode=exact_uint(columns[5], "mode"),
            size=exact_uint(columns[6], "size"),
            mtime_ns=exact_uint(columns[7], "mtime_ns"),
            ctime_ns=exact_uint(columns[8], "ctime_ns"),
        )
        if not stat.S_ISREG(row.mode) or row.size > closure.MAX_FILE_BYTES:
            fail("manifest path identity is invalid")
        present.append(row)
    if cursor != len(lines):
        fail("manifest has trailing rows")
    if ordered_paths != sorted(ordered_paths) or len(ordered_paths) != len(
        set(ordered_paths)
    ):
        fail("manifest paths are not strictly ordered")
    if closure.content_cid_from_manifest(raw).encode("ascii") != content_cid:
        fail("manifest content CID does not bind the portable closure")
    return ParsedManifest(
        raw=raw,
        head=head,
        scopes=tuple(scopes),
        content_cid=content_cid,
        present=tuple(present),
        deleted=tuple(deleted),
    )


def row_identity(row: PresentRow) -> tuple[int, int, int, int, int, int]:
    return (
        row.device,
        row.inode,
        row.mode,
        row.size,
        row.mtime_ns,
        row.ctime_ns,
    )


def copy_exact_file(root: bytes, staging: bytes, row: PresentRow) -> None:
    source = os.path.join(root, row.relative)
    source_fd, opened = open_bounded_regular(source, closure.MAX_FILE_BYTES)
    digest = hashlib.sha256()
    observed = 0
    try:
        if closure.identity(opened) != row_identity(row):
            fail(
                "source identity differs from manifest: "
                + os.fsdecode(row.relative)
            )
        destination = os.path.join(staging, row.relative)
        os.makedirs(os.path.dirname(destination), mode=0o700, exist_ok=True)
        destination_fd = os.open(
            destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600
        )
        try:
            while True:
                chunk = os.read(source_fd, READ_CHUNK_BYTES)
                if not chunk:
                    break
                observed += len(chunk)
                if observed > row.size:
                    fail(
                        "source grew during copy: "
                        + os.fsdecode(row.relative)
                    )
                digest.update(chunk)
                view = memoryview(chunk)
                while view:
                    written = os.write(destination_fd, view)
                    if written <= 0:
                        fail("snapshot write made no progress")
                    view = view[written:]
            os.fchmod(
                destination_fd,
                0o700
                if row.mode & (stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
                else 0o600,
            )
            os.fsync(destination_fd)
        finally:
            os.close(destination_fd)
        closed = os.fstat(source_fd)
    finally:
        os.close(source_fd)
    after = os.lstat(source)
    if (
        stable_identity(opened) != stable_identity(closed)
        or stable_identity(opened) != stable_identity(after)
        or closure.identity(closed) != row_identity(row)
        or closure.identity(after) != row_identity(row)
        or observed != row.size
        or digest.hexdigest().encode("ascii") != row.sha256
    ):
        fail("source changed during copy: " + os.fsdecode(row.relative))


def validate_snapshot(root: str, manifest: ParsedManifest) -> None:
    root_bytes = os.fsencode(root)
    root_info = os.lstat(root_bytes)
    if (
        not stat.S_ISDIR(root_info.st_mode)
        or stat.S_ISLNK(root_info.st_mode)
        or stat.S_IMODE(root_info.st_mode) != SNAPSHOT_DIRECTORY_MODE
    ):
        fail("snapshot root is invalid")
    root_owner = (root_info.st_uid, root_info.st_gid)
    expected = {row.relative: row for row in manifest.present}
    actual: list[bytes] = []
    directory_identities: dict[bytes, tuple[int, ...]] = {}
    file_identities: dict[bytes, tuple[int, ...]] = {}
    for directory, dirnames, filenames in os.walk(
        root_bytes, topdown=True, followlinks=False
    ):
        directory_info = os.lstat(directory)
        if (
            not stat.S_ISDIR(directory_info.st_mode)
            or stat.S_ISLNK(directory_info.st_mode)
            or stat.S_IMODE(directory_info.st_mode) != SNAPSHOT_DIRECTORY_MODE
            or (directory_info.st_uid, directory_info.st_gid) != root_owner
        ):
            fail("snapshot directory is invalid")
        directory_identities[directory] = stable_identity(directory_info)
        for name in dirnames:
            child = os.path.join(directory, name)
            child_info = os.lstat(child)
            if (
                not stat.S_ISDIR(child_info.st_mode)
                or stat.S_ISLNK(child_info.st_mode)
                or stat.S_IMODE(child_info.st_mode) != SNAPSHOT_DIRECTORY_MODE
                or (child_info.st_uid, child_info.st_gid) != root_owner
            ):
                fail("snapshot child directory is invalid")
        for name in filenames:
            path = os.path.join(directory, name)
            relative = os.path.relpath(path, root_bytes)
            canonical_relative(relative)
            row = expected.get(relative)
            if row is None:
                fail("snapshot contains an unmanifested file: " + os.fsdecode(relative))
            size, digest, info = stable_digest_absolute(
                path, closure.MAX_FILE_BYTES
            )
            expected_mode = (
                SNAPSHOT_EXECUTABLE_MODE
                if row.mode & (stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
                else SNAPSHOT_REGULAR_MODE
            )
            if (
                size != row.size
                or digest != row.sha256
                or stat.S_ISLNK(info.st_mode)
                or stat.S_IMODE(info.st_mode) != expected_mode
                or info.st_nlink != 1
                or (info.st_uid, info.st_gid) != root_owner
            ):
                fail("snapshot file differs: " + os.fsdecode(relative))
            actual.append(relative)
            file_identities[relative] = stable_identity(info)
    if sorted(actual) != sorted(expected):
        fail("snapshot path set differs from manifest")
    for directory, identity in directory_identities.items():
        if stable_identity(os.lstat(directory)) != identity:
            fail("snapshot directory changed during validation")
    for relative in sorted(expected):
        row = expected[relative]
        path = os.path.join(root_bytes, relative)
        size, digest, info = stable_digest_absolute(
            path, closure.MAX_FILE_BYTES
        )
        if (
            size != row.size
            or digest != row.sha256
            or stable_identity(info) != file_identities[relative]
        ):
            fail(
                "snapshot file changed during validation: "
                + os.fsdecode(relative)
            )
    for directory, directory_identity in directory_identities.items():
        if stable_identity(os.lstat(directory)) != directory_identity:
            fail("snapshot directory changed during terminal validation")


def make_read_only(root: Path) -> None:
    root_info = os.stat(root, follow_symlinks=False)
    if not stat.S_ISDIR(root_info.st_mode):
        fail("snapshot staging root is invalid")
    items = [*root.rglob("*"), root]
    items.sort(key=lambda item: len(item.parts), reverse=True)
    for item in items:
        info = os.stat(item, follow_symlinks=False)
        if stat.S_ISDIR(info.st_mode):
            os.chmod(item, 0o500)
        elif stat.S_ISREG(info.st_mode):
            executable = bool(
                info.st_mode & (stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
            )
            os.chmod(item, 0o500 if executable else 0o400)
        else:
            fail("snapshot contains an unsupported entry")


def rename_noreplace(source: Path, destination: Path) -> None:
    libc = ctypes.CDLL(None, use_errno=True)
    source_raw = os.fsencode(source)
    destination_raw = os.fsencode(destination)
    if sys.platform == "darwin":
        function = libc.renamex_np
        function.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint]
        function.restype = ctypes.c_int
        result = function(source_raw, destination_raw, 0x00000004)
    elif sys.platform.startswith("linux") and hasattr(libc, "renameat2"):
        function = libc.renameat2
        function.argtypes = [
            ctypes.c_int,
            ctypes.c_char_p,
            ctypes.c_int,
            ctypes.c_char_p,
            ctypes.c_uint,
        ]
        function.restype = ctypes.c_int
        result = function(-100, source_raw, -100, destination_raw, 1)
    else:
        fail("atomic no-replace directory commit is unsupported")
    if result != 0:
        error = ctypes.get_errno()
        if error in (errno.EEXIST, errno.ENOTEMPTY):
            fail("snapshot output appeared before atomic commit")
        raise OSError(error, os.strerror(error))
    directory_fd = os.open(destination.parent, os.O_RDONLY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


def writable_remove(path: Path) -> None:
    try:
        root_info = os.stat(path, follow_symlinks=False)
    except FileNotFoundError:
        return
    if not stat.S_ISDIR(root_info.st_mode):
        fail("snapshot cleanup root is invalid")
    for item in [path, *path.rglob("*")]:
        info = os.stat(item, follow_symlinks=False)
        if stat.S_ISDIR(info.st_mode):
            os.chmod(item, 0o700)
        elif stat.S_ISREG(info.st_mode):
            os.chmod(item, 0o600)
    shutil.rmtree(path)


def create(root_raw: str, manifest_path: str, output_raw: str) -> None:
    root = os.path.realpath(root_raw)
    if root != root_raw or not os.path.isdir(root):
        fail("source root must be an absolute canonical directory")
    output = Path(output_raw)
    if (
        not output.is_absolute()
        or output.exists()
        or output.is_symlink()
        or output.parent.resolve(strict=True) != output.parent
    ):
        fail("snapshot output must be absent with a canonical parent")
    manifest = parse_manifest(manifest_path)
    scopes = [os.fsdecode(scope) for scope in manifest.scopes]
    if closure.build_manifest(root, scopes) != manifest.raw:
        fail("live closure differs from the frozen manifest before snapshot")
    staging = Path(
        tempfile.mkdtemp(prefix=f".{output.name}.staging.", dir=output.parent)
    )
    os.chown(staging, os.geteuid(), os.getegid())
    staging_info = os.stat(staging, follow_symlinks=False)
    if (
        staging_info.st_uid != os.geteuid()
        or staging_info.st_gid != os.getegid()
    ):
        fail("snapshot staging ownership is invalid")
    committed = False
    try:
        root_bytes = os.fsencode(root)
        staging_bytes = os.fsencode(staging)
        for row in manifest.present:
            copy_exact_file(root_bytes, staging_bytes, row)
        if closure.build_manifest(root, scopes) != manifest.raw:
            fail("live closure differs from the frozen manifest after snapshot")
        make_read_only(staging)
        validate_snapshot(str(staging), manifest)
        rename_noreplace(staging, output)
        committed = True
    finally:
        if not committed:
            writable_remove(staging)
    print("schema=cheng.current_source_snapshot")
    print("status=created")
    print("manifest_sha256=" + hashlib.sha256(manifest.raw).hexdigest())
    print("head=" + manifest.head.decode("ascii"))
    print("path_count=" + str(len(manifest.present) + len(manifest.deleted)))
    print("present_path_count=" + str(len(manifest.present)))
    print("deleted_path_count=" + str(len(manifest.deleted)))


def validate(root: str, manifest_path: str) -> None:
    manifest = parse_manifest(manifest_path)
    validate_snapshot(root, manifest)
    print("schema=cheng.current_source_snapshot")
    print("status=valid")
    print("manifest_sha256=" + hashlib.sha256(manifest.raw).hexdigest())
    print("head=" + manifest.head.decode("ascii"))
    print("present_path_count=" + str(len(manifest.present)))


def main(argv: list[str]) -> int:
    try:
        if len(argv) == 4 and argv[0] == "create":
            create(argv[1], argv[2], argv[3])
        elif len(argv) == 3 and argv[0] == "validate":
            validate(argv[1], argv[2])
        else:
            fail(
                "usage: current_source_snapshot.py "
                "create ROOT MANIFEST ABSENT_OUTPUT | "
                "validate SNAPSHOT MANIFEST"
            )
        return 0
    except (OSError, SnapshotError, RuntimeError, ValueError) as error:
        print(f"current_source_snapshot_error={error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
