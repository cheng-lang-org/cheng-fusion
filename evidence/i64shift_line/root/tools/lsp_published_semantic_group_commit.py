#!/usr/bin/env python3
import ctypes
import hashlib
import os
import stat
import sys


DARWIN_RENAME_EXCL = 0x00000004
LINUX_RENAME_NOREPLACE = 0x00000001
ARTIFACTS = (
    ("published-binding.bin.next", "published-binding.bin"),
    (
        "published-query-projection.bin.next",
        "published-query-projection.bin",
    ),
    (
        "published-open-document-universe.bin.next",
        "published-open-document-universe.bin",
    ),
    ("published-snapshot.bin.next", "published-snapshot.bin"),
)


def fail(message: str) -> None:
    raise RuntimeError(message)


def exact_sha256(value: str) -> str:
    if len(value) != 64 or any(
        character not in "0123456789abcdef" for character in value
    ):
        fail("expected_sha256_invalid")
    return value


def object_identity(value: os.stat_result) -> tuple[int, ...]:
    return (
        int(value.st_dev),
        int(value.st_ino),
        int(value.st_mode),
        int(value.st_nlink),
        int(value.st_uid),
        int(value.st_gid),
        int(value.st_size),
    )


def stable_file_identity(value: os.stat_result) -> tuple[int, ...]:
    return object_identity(value) + (
        int(value.st_mtime_ns),
        int(value.st_ctime_ns),
    )


def parent_identity(value: os.stat_result) -> tuple[int, ...]:
    return (
        int(value.st_dev),
        int(value.st_ino),
        int(value.st_mode),
        int(value.st_uid),
        int(value.st_gid),
    )


def exact_directory(path: str, mode: int) -> os.stat_result:
    if not os.path.isabs(path) or os.path.realpath(path) != path:
        fail("path_not_canonical_absolute")
    value = os.lstat(path)
    if (
        not stat.S_ISDIR(value.st_mode)
        or stat.S_ISLNK(value.st_mode)
        or value.st_uid != os.getuid()
        or value.st_gid != os.getgid()
        or stat.S_IMODE(value.st_mode) != mode
    ):
        fail("directory_identity_or_mode_invalid")
    return value


def directory_flags() -> int:
    flags = os.O_RDONLY | os.O_CLOEXEC | os.O_DIRECTORY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    return flags


def rename_noreplace(
    directory_fd: int, source_name: str, target_name: str
) -> None:
    libc = ctypes.CDLL(None, use_errno=True)
    if sys.platform == "darwin":
        operation = getattr(libc, "renameatx_np", None)
        flag = DARWIN_RENAME_EXCL
    elif sys.platform.startswith("linux"):
        operation = getattr(libc, "renameat2", None)
        flag = LINUX_RENAME_NOREPLACE
    else:
        fail("platform_rename_noreplace_unsupported")
    if operation is None:
        fail("rename_noreplace_symbol_unavailable")
    operation.argtypes = [
        ctypes.c_int,
        ctypes.c_char_p,
        ctypes.c_int,
        ctypes.c_char_p,
        ctypes.c_uint,
    ]
    operation.restype = ctypes.c_int
    if operation(
        directory_fd,
        os.fsencode(source_name),
        directory_fd,
        os.fsencode(target_name),
        flag,
    ) != 0:
        fail("rename_noreplace_failed_errno_%d" % ctypes.get_errno())


def namespace_exact(directory_fd: int, expected: tuple[str, ...]) -> None:
    names = os.listdir(directory_fd)
    if len(names) != len(expected) or set(names) != set(expected):
        fail("artifact_namespace_invalid")


def open_verified_file(
    directory_fd: int,
    name: str,
    expected_sha256: str,
    expected_device: int,
    initial_mode: int,
    harden: bool,
) -> tuple[int, os.stat_result]:
    flags = os.O_RDONLY | os.O_CLOEXEC
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    file_fd = os.open(name, flags, dir_fd=directory_fd)
    try:
        opened = os.fstat(file_fd)
        named = os.stat(
            name, dir_fd=directory_fd, follow_symlinks=False
        )
        if (
            object_identity(opened) != object_identity(named)
            or not stat.S_ISREG(opened.st_mode)
            or opened.st_dev != expected_device
            or opened.st_nlink != 1
            or opened.st_uid != os.getuid()
            or opened.st_gid != os.getgid()
            or opened.st_size <= 0
            or stat.S_IMODE(opened.st_mode) != initial_mode
        ):
            fail("artifact_identity_or_mode_invalid")
        if harden:
            os.fchmod(file_fd, 0o400)
            os.fsync(file_fd)
            opened = os.fstat(file_fd)
            named = os.stat(
                name, dir_fd=directory_fd, follow_symlinks=False
            )
            if (
                object_identity(opened) != object_identity(named)
                or stat.S_IMODE(opened.st_mode) != 0o400
            ):
                fail("artifact_harden_failed")
        before = os.fstat(file_fd)
        os.lseek(file_fd, 0, os.SEEK_SET)
        digest = hashlib.sha256()
        byte_count = 0
        while True:
            chunk = os.read(file_fd, 1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
            byte_count += len(chunk)
        after = os.fstat(file_fd)
        named_after = os.stat(
            name, dir_fd=directory_fd, follow_symlinks=False
        )
        if (
            byte_count != before.st_size
            or stable_file_identity(before) != stable_file_identity(after)
            or stable_file_identity(after)
            != stable_file_identity(named_after)
            or digest.hexdigest() != expected_sha256
        ):
            fail("artifact_content_or_identity_drift")
        return file_fd, after
    except BaseException:
        os.close(file_fd)
        raise


def open_verified_group(
    parent_fd: int,
    group_name: str,
    expected_device: int,
    expected_sha256: tuple[str, ...],
) -> tuple[int, list[tuple[int, os.stat_result]]]:
    group_fd = os.open(group_name, directory_flags(), dir_fd=parent_fd)
    files: list[tuple[int, os.stat_result]] = []
    try:
        group_open = os.fstat(group_fd)
        group_named = os.stat(
            group_name, dir_fd=parent_fd, follow_symlinks=False
        )
        if (
            object_identity(group_open) != object_identity(group_named)
            or not stat.S_ISDIR(group_open.st_mode)
            or group_open.st_dev != expected_device
            or group_open.st_uid != os.getuid()
            or group_open.st_gid != os.getgid()
            or stat.S_IMODE(group_open.st_mode) != 0o500
        ):
            fail("existing_group_identity_or_mode_invalid")
        final_names = tuple(final for _, final in ARTIFACTS)
        namespace_exact(group_fd, final_names)
        for index, name in enumerate(final_names):
            files.append(
                open_verified_file(
                    group_fd,
                    name,
                    expected_sha256[index],
                    expected_device,
                    0o400,
                    False,
                )
            )
        return group_fd, files
    except BaseException:
        for file_fd, _ in files:
            os.close(file_fd)
        os.close(group_fd)
        raise


def restore_private_staging(
    staging_fd: int, files: list[tuple[int, os.stat_result]]
) -> None:
    for file_fd, _ in files:
        try:
            os.fchmod(file_fd, 0o600)
        except OSError:
            pass
    try:
        os.fchmod(staging_fd, 0o700)
    except OSError:
        pass


def private_staging_removal_identity_exact(
    parent_fd: int,
    parent_value: os.stat_result,
    staging_fd: int,
    staging_name: str,
    files: list[tuple[int, os.stat_result]],
) -> None:
    if parent_identity(os.fstat(parent_fd)) != parent_identity(
        parent_value
    ):
        fail("parent_identity_changed_before_reuse_remove")
    staging_open = os.fstat(staging_fd)
    staging_named = os.stat(
        staging_name, dir_fd=parent_fd, follow_symlinks=False
    )
    if (
        object_identity(staging_open) != object_identity(staging_named)
        or not stat.S_ISDIR(staging_open.st_mode)
        or stat.S_IMODE(staging_open.st_mode) != 0o500
    ):
        fail("staging_name_replaced_before_reuse_remove")
    final_names = tuple(final for _, final in ARTIFACTS)
    namespace_exact(staging_fd, final_names)
    if len(files) != len(final_names):
        fail("staging_held_file_count_invalid_before_reuse_remove")
    for index, final_name in enumerate(final_names):
        held = os.fstat(files[index][0])
        named = os.stat(
            final_name, dir_fd=staging_fd, follow_symlinks=False
        )
        if (
            object_identity(held) != object_identity(named)
            or stat.S_IMODE(held.st_mode) != 0o400
        ):
            fail("staging_file_replaced_before_reuse_remove")


def remove_private_staging(
    parent_fd: int,
    parent_value: os.stat_result,
    staging_fd: int,
    staging_name: str,
    files: list[tuple[int, os.stat_result]],
) -> None:
    private_staging_removal_identity_exact(
        parent_fd,
        parent_value,
        staging_fd,
        staging_name,
        files,
    )
    os.fchmod(staging_fd, 0o700)
    for file_fd, _ in files:
        os.fchmod(file_fd, 0o600)
    for _, final_name in ARTIFACTS:
        os.unlink(final_name, dir_fd=staging_fd)
    os.fsync(staging_fd)
    staging_open = os.fstat(staging_fd)
    staging_named = os.stat(
        staging_name, dir_fd=parent_fd, follow_symlinks=False
    )
    if (
        object_identity(staging_open) != object_identity(staging_named)
        or stat.S_IMODE(staging_open.st_mode) != 0o700
        or os.listdir(staging_fd)
    ):
        os.abort()
    os.rmdir(staging_name, dir_fd=parent_fd)
    try:
        os.stat(
            staging_name, dir_fd=parent_fd, follow_symlinks=False
        )
    except FileNotFoundError:
        pass
    else:
        os.abort()
    if parent_identity(os.fstat(parent_fd)) != parent_identity(
        parent_value
    ):
        os.abort()
    os.fsync(parent_fd)


def write_receipt(
    status: str,
    parent_value: os.stat_result,
    staging_value: os.stat_result,
) -> None:
    receipt = (
        "lsp_published_semantic_group_commit_status=%s"
        " parent_device=%d parent_inode=%d"
        " source_device=%d source_inode=%d\n"
        % (
            status,
            parent_value.st_dev,
            parent_value.st_ino,
            staging_value.st_dev,
            staging_value.st_ino,
        )
    ).encode("ascii")
    if os.write(1, receipt) != len(receipt):
        os.abort()


def commit(
    parent: str,
    staging: str,
    final_name: str,
    expected_device: int,
    expected_inode: int,
    expected_sha256: tuple[str, ...],
) -> None:
    parent_before = exact_directory(parent, 0o700)
    staging_before = exact_directory(staging, 0o700)
    if (
        staging_before.st_dev != expected_device
        or staging_before.st_ino != expected_inode
        or staging_before.st_dev != parent_before.st_dev
    ):
        fail("staging_mktemp_identity_mismatch")
    if os.path.dirname(staging) != parent:
        fail("staging_parent_mismatch")
    staging_name = os.path.basename(staging)
    if not staging_name.startswith(".published-semantic.next."):
        fail("staging_name_invalid")
    if (
        final_name != "published-semantic"
        or "/" in final_name
        or "\0" in final_name
    ):
        fail("final_name_invalid")

    parent_fd = os.open(parent, directory_flags())
    staging_fd = -1
    staging_files: list[tuple[int, os.stat_result]] = []
    existing_group_fd = -1
    existing_files: list[tuple[int, os.stat_result]] = []
    committed = False
    reused = False
    try:
        if parent_identity(os.fstat(parent_fd)) != parent_identity(
            parent_before
        ):
            fail("parent_identity_changed_before_commit")
        staging_fd = os.open(
            staging_name, directory_flags(), dir_fd=parent_fd
        )
        staging_open = os.fstat(staging_fd)
        staging_named = os.stat(
            staging_name, dir_fd=parent_fd, follow_symlinks=False
        )
        if (
            object_identity(staging_open) != object_identity(staging_before)
            or object_identity(staging_named)
            != object_identity(staging_before)
        ):
            fail("staging_identity_changed_before_commit")

        next_names = tuple(source for source, _ in ARTIFACTS)
        namespace_exact(staging_fd, next_names)
        for index, (source_name, _) in enumerate(ARTIFACTS):
            staging_files.append(
                open_verified_file(
                    staging_fd,
                    source_name,
                    expected_sha256[index],
                    parent_before.st_dev,
                    0o600,
                    True,
                )
            )
        for source_name, target_name in ARTIFACTS:
            rename_noreplace(staging_fd, source_name, target_name)
        final_names = tuple(final for _, final in ARTIFACTS)
        namespace_exact(staging_fd, final_names)
        for index, (_, final_name_at_index) in enumerate(ARTIFACTS):
            named = os.stat(
                final_name_at_index,
                dir_fd=staging_fd,
                follow_symlinks=False,
            )
            if object_identity(named) != object_identity(
                os.fstat(staging_files[index][0])
            ):
                fail("artifact_private_rename_identity_drift")
        os.fchmod(staging_fd, 0o500)
        os.fsync(staging_fd)

        try:
            os.stat(
                final_name, dir_fd=parent_fd, follow_symlinks=False
            )
        except FileNotFoundError:
            pass
        else:
            existing_group_fd, existing_files = open_verified_group(
                parent_fd,
                final_name,
                parent_before.st_dev,
                expected_sha256,
            )
            private_staging_removal_identity_exact(
                parent_fd,
                parent_before,
                staging_fd,
                staging_name,
                staging_files,
            )
            reused = True
            remove_private_staging(
                parent_fd,
                parent_before,
                staging_fd,
                staging_name,
                staging_files,
            )
            write_receipt("reused", parent_before, staging_open)
            return

        try:
            rename_noreplace(parent_fd, staging_name, final_name)
        except BaseException:
            restore_private_staging(staging_fd, staging_files)
            raise
        committed = True

        final_named = os.stat(
            final_name, dir_fd=parent_fd, follow_symlinks=False
        )
        if object_identity(final_named) != object_identity(
            os.fstat(staging_fd)
        ):
            os.abort()
        try:
            os.stat(
                staging_name, dir_fd=parent_fd, follow_symlinks=False
            )
        except FileNotFoundError:
            pass
        else:
            os.abort()
        namespace_exact(staging_fd, final_names)
        for index, (_, final_name_at_index) in enumerate(ARTIFACTS):
            held = os.fstat(staging_files[index][0])
            named = os.stat(
                final_name_at_index,
                dir_fd=staging_fd,
                follow_symlinks=False,
            )
            if (
                object_identity(held) != object_identity(named)
                or stat.S_IMODE(held.st_mode) != 0o400
            ):
                os.abort()
        if parent_identity(os.fstat(parent_fd)) != parent_identity(
            parent_before
        ):
            os.abort()
        os.fsync(parent_fd)
        write_receipt("committed", parent_before, staging_open)
    except BaseException:
        if committed or reused:
            os.abort()
        if staging_fd >= 0:
            restore_private_staging(staging_fd, staging_files)
        raise
    finally:
        for file_fd, _ in existing_files:
            try:
                os.close(file_fd)
            except OSError:
                if committed or reused:
                    os.abort()
        if existing_group_fd >= 0:
            try:
                os.close(existing_group_fd)
            except OSError:
                if committed or reused:
                    os.abort()
        for file_fd, _ in staging_files:
            try:
                os.close(file_fd)
            except OSError:
                if committed or reused:
                    os.abort()
        if staging_fd >= 0:
            try:
                os.close(staging_fd)
            except OSError:
                if committed or reused:
                    os.abort()
        try:
            os.close(parent_fd)
        except OSError:
            if committed or reused:
                os.abort()


def main() -> int:
    if len(sys.argv) != 10:
        print(
            "usage: lsp_published_semantic_group_commit.py "
            "PARENT STAGING FINAL_NAME EXPECTED_DEVICE EXPECTED_INODE "
            "BINDING_SHA256 QUERY_PROJECTION_SHA256 "
            "OPEN_DOCUMENT_UNIVERSE_SHA256 SNAPSHOT_SHA256",
            file=sys.stderr,
        )
        return 2
    try:
        commit(
            sys.argv[1],
            sys.argv[2],
            sys.argv[3],
            int(sys.argv[4]),
            int(sys.argv[5]),
            tuple(exact_sha256(value) for value in sys.argv[6:10]),
        )
    except Exception as error:
        print(
            "lsp_published_semantic_group_commit_status=failed "
            "reason=%s" % str(error),
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
