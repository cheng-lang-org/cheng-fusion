import os
import sys

MONITOR_PSUTIL_SITE_PACKAGES = \
    "/opt/miniconda3/lib/python3.13/site-packages"
MONITOR_PYTHON_AUTHORITY_SCHEMA = \
    "cheng.guard.monitor_python_authority"
MONITOR_PREFIX_FIELDS = (
    "prefix",
    "base_prefix",
    "exec_prefix",
    "base_exec_prefix",
)
MONITOR_PYTHON_AUTHORITIES = {
    (
        "/Applications/Xcode.app/Contents/Developer/Library/"
        "Frameworks/Python3.framework/Versions/3.9/bin/python3.9"
    ): (
        "cpython",
        "3.9.6",
        (
            "/Applications/Xcode.app/Contents/Developer/Library/"
            "Frameworks/Python3.framework/Versions/3.9"
        ),
        (
            "/Applications/Xcode.app/Contents/Developer/Library/"
            "Frameworks/Python3.framework/Versions/3.9/lib/python39.zip",
            "/Applications/Xcode.app/Contents/Developer/Library/"
            "Frameworks/Python3.framework/Versions/3.9/lib/python3.9",
            "/Applications/Xcode.app/Contents/Developer/Library/"
            "Frameworks/Python3.framework/Versions/3.9/lib/python3.9/"
            "lib-dynload",
        ),
        "not_exposed",
        "271143990bc83af0fb2404a255038f5faafb96df1584ed7f085e5018c0f33ffb",
    ),
    "/opt/miniconda3/bin/python3.13": (
        "cpython",
        "3.13.5",
        "/opt/miniconda3",
        (
            "/opt/miniconda3/lib/python313.zip",
            "/opt/miniconda3/lib/python3.13",
            "/opt/miniconda3/lib/python3.13/lib-dynload",
        ),
        "1",
        "0adec2c09b0da4c62bfe4445db5ef210c0a216ec22c5115e073951195c90bfd3",
    ),
}
MONITOR_PYTHON_REAL_PATH = os.path.realpath(sys.executable)
MONITOR_PYTHON_IMPLEMENTATION = sys.implementation.name
MONITOR_PYTHON_VERSION = ".".join(
    str(value) for value in sys.version_info[:3])
if sys.platform == "darwin":
    try:
        (
            MONITOR_PYTHON_EXPECTED_IMPLEMENTATION,
            MONITOR_PYTHON_EXPECTED_VERSION,
            MONITOR_BASE_PREFIX,
            MONITOR_BASE_SYS_PATH,
            MONITOR_SAFE_PATH_OBSERVED,
            MONITOR_PYTHON_EXPECTED_SHA256,
        ) = MONITOR_PYTHON_AUTHORITIES[MONITOR_PYTHON_REAL_PATH]
    except KeyError:
        raise SystemExit(
            "guard_error=monitor_python_identity_not_authorized")
else:
    MONITOR_PYTHON_EXPECTED_IMPLEMENTATION = \
        MONITOR_PYTHON_IMPLEMENTATION
    MONITOR_PYTHON_EXPECTED_VERSION = MONITOR_PYTHON_VERSION
    MONITOR_BASE_PREFIX = sys.base_prefix
    MONITOR_VERSION_TAG = "python%d.%d" % (
        sys.version_info.major,
        sys.version_info.minor,
    )
    MONITOR_ZIP_TAG = "python%d%d.zip" % (
        sys.version_info.major,
        sys.version_info.minor,
    )
    MONITOR_BASE_SYS_PATH = (
        os.path.join(MONITOR_BASE_PREFIX, "lib", MONITOR_ZIP_TAG),
        os.path.join(MONITOR_BASE_PREFIX, "lib", MONITOR_VERSION_TAG),
        os.path.join(
            MONITOR_BASE_PREFIX,
            "lib",
            MONITOR_VERSION_TAG,
            "lib-dynload",
        ),
    )
    MONITOR_SAFE_PATH_OBSERVED = (
        "1"
        if "safe_path" in dir(sys.flags) and sys.flags.safe_path is True
        else "not_exposed"
    )
    MONITOR_PYTHON_EXPECTED_SHA256 = ""
if (
    not os.path.isabs(MONITOR_BASE_PREFIX)
    or os.path.realpath(MONITOR_BASE_PREFIX) != MONITOR_BASE_PREFIX
    or any(
        getattr(sys, field_name) != MONITOR_BASE_PREFIX
        for field_name in MONITOR_PREFIX_FIELDS)
):
    raise SystemExit(
        "guard_error=monitor_python_base_prefix_unverified")
if (
    MONITOR_PYTHON_IMPLEMENTATION
        != MONITOR_PYTHON_EXPECTED_IMPLEMENTATION
    or MONITOR_PYTHON_VERSION != MONITOR_PYTHON_EXPECTED_VERSION
):
    raise SystemExit(
        "guard_error=monitor_python_runtime_identity_unverified")
MONITOR_ABSENT_SYS_PATH = MONITOR_BASE_SYS_PATH[0]
MONITOR_ABSENT_SYS_PATH_PARENT = os.path.dirname(
    MONITOR_ABSENT_SYS_PATH)
MONITOR_ABSENT_PARENT_IDENTITY_FIELDS = (
    "st_dev",
    "st_ino",
    "st_mode",
    "st_nlink",
    "st_uid",
    "st_gid",
    "st_size",
    "st_mtime_ns",
    "st_ctime_ns",
)
MONITOR_REQUIRED_FLAG_VALUES = {
    "isolated": 1,
    "ignore_environment": 1,
    "no_site": 1,
    "no_user_site": 1,
    "dont_write_bytecode": 1,
}
MONITOR_SAFE_PATH_CONSISTENCY_STATUS = "verified"

if sys.platform == "darwin":
    for flag_name, required_value in MONITOR_REQUIRED_FLAG_VALUES.items():
        if getattr(sys.flags, flag_name) != required_value:
            raise SystemExit(
                "guard_error=monitor_python_startup_flag_unverified "
                "flag=%s" % flag_name)
    if (
        (
            MONITOR_SAFE_PATH_OBSERVED == "not_exposed"
            and "safe_path" in dir(sys.flags)
        )
        or (
            MONITOR_SAFE_PATH_OBSERVED == "1"
            and (
                "safe_path" not in dir(sys.flags)
                or sys.flags.safe_path is not True
            )
        )
    ):
        raise SystemExit(
            "guard_error=monitor_python_safe_path_inconsistent")
    if tuple(sys.path) != MONITOR_BASE_SYS_PATH:
        raise SystemExit(
            "guard_error=monitor_python_base_sys_path_unverified")
    try:
        os.lstat(MONITOR_ABSENT_SYS_PATH)
    except FileNotFoundError:
        pass
    else:
        raise SystemExit(
            "guard_error=monitor_python_absent_sys_path_present")
    early_absent_parent_fd = os.open(
        MONITOR_ABSENT_SYS_PATH_PARENT,
        os.O_RDONLY | os.O_CLOEXEC | os.O_DIRECTORY)
    early_absent_parent_stat = os.fstat(early_absent_parent_fd)
    early_absent_parent_identity = tuple(
        int(getattr(early_absent_parent_stat, field))
        for field in MONITOR_ABSENT_PARENT_IDENTITY_FIELDS)
else:
    early_absent_parent_fd = -1
    early_absent_parent_identity = None

# Importing select is the first non-frozen import needed to arm the Darwin
# parent-directory vnode watch. The absence and parent identity are sampled
# immediately before it and rechecked immediately after the watch is armed.
import select

if sys.platform == "darwin":
    early_absent_path_queue = select.kqueue()
    early_absent_path_queue.control([
        select.kevent(
            early_absent_parent_fd,
            filter=select.KQ_FILTER_VNODE,
            flags=(
                select.KQ_EV_ADD |
                select.KQ_EV_ENABLE |
                select.KQ_EV_CLEAR),
            fflags=(
                select.KQ_NOTE_WRITE |
                select.KQ_NOTE_DELETE |
                select.KQ_NOTE_EXTEND |
                select.KQ_NOTE_ATTRIB |
                select.KQ_NOTE_LINK |
                select.KQ_NOTE_RENAME |
                select.KQ_NOTE_REVOKE),
        )
    ], 0, 0)
    early_absent_parent_after = os.fstat(early_absent_parent_fd)
    early_absent_parent_path = os.stat(
        MONITOR_ABSENT_SYS_PATH_PARENT, follow_symlinks=False)
    if (
        tuple(
            int(getattr(early_absent_parent_after, field))
            for field in MONITOR_ABSENT_PARENT_IDENTITY_FIELDS)
            != early_absent_parent_identity
        or tuple(
            int(getattr(early_absent_parent_path, field))
            for field in MONITOR_ABSENT_PARENT_IDENTITY_FIELDS)
            != early_absent_parent_identity
    ):
        raise SystemExit(
            "guard_error=monitor_python_absent_parent_changed_during_arm")
    try:
        os.lstat(MONITOR_ABSENT_SYS_PATH)
    except FileNotFoundError:
        pass
    else:
        raise SystemExit(
            "guard_error=monitor_python_absent_sys_path_present_during_arm")
else:
    early_absent_path_queue = None

if sys.platform == "darwin":
    sys.path.append(MONITOR_PSUTIL_SITE_PACKAGES)
MONITOR_EFFECTIVE_SYS_PATH = tuple(sys.path)

import ctypes
import errno
import fcntl
import hashlib
import json
import signal
import shutil
import socket
import stat
import struct
import tempfile
import time

try:
    import psutil
except Exception as exc:
    psutil = None
    psutil_import_error = exc
else:
    psutil_import_error = None

target_env_mode = sys.argv[1]
target_env_pair_count = int(sys.argv[2])
target_env_pair_args = sys.argv[3:3 + target_env_pair_count]
tracked_output_count_index = 3 + target_env_pair_count
tracked_output_count = int(sys.argv[tracked_output_count_index])
tracked_output_spec_args = sys.argv[
    tracked_output_count_index + 1:
    tracked_output_count_index + 1 + tracked_output_count
]
tracked_output_fd_count_index = (
    tracked_output_count_index + 1 + tracked_output_count
)
tracked_output_fd_count = int(sys.argv[tracked_output_fd_count_index])
tracked_output_fd_binding_args = sys.argv[
    tracked_output_fd_count_index + 1:
    tracked_output_fd_count_index + 1 + tracked_output_fd_count
]
separator_index = (
    tracked_output_fd_count_index + 1 + tracked_output_fd_count
)
if sys.argv[separator_index] != "--":
    raise SystemExit("guard internal argv separator missing")
cmd = sys.argv[separator_index + 1:]
command_execution_mode = os.environ["BEAT_C_GUARD_COMMAND_EXECUTION_MODE_REQUESTED"]
monitor_python_explicit = (
    os.environ.get("BEAT_C_GUARD_MONITOR_PYTHON_EXPLICIT") == "1")
combined_output_limit_bytes = int(
    os.environ["BEAT_C_GUARD_COMBINED_OUTPUT_LIMIT_BYTES"])
expected_command_path = os.environ.get("BEAT_C_GUARD_EXPECTED_COMMAND_PATH", "")
expected_command_sha256 = os.environ.get("BEAT_C_GUARD_EXPECTED_COMMAND_SHA256", "")
frozen_tree_root_requested = os.environ.get(
    "BEAT_C_GUARD_FROZEN_TREE_ROOT", "")
expected_frozen_tree_sha256 = os.environ.get(
    "BEAT_C_GUARD_EXPECTED_FROZEN_TREE_SHA256", "")
publication_argv_manifest_requested = os.environ.get(
    "BEAT_C_GUARD_PUBLICATION_ARGV_MANIFEST", "")
publication_env_manifest_requested = os.environ.get(
    "BEAT_C_GUARD_PUBLICATION_ENV_MANIFEST", "")
require_command_identity = (
    os.environ.get("BEAT_C_GUARD_REQUIRE_COMMAND_IDENTITY") == "1")
require_precreated_output_authority = (
    os.environ.get(
        "BEAT_C_GUARD_REQUIRE_PRECREATED_OUTPUT_AUTHORITY") == "1")
expected_exit_code = int(os.environ["BEAT_C_GUARD_EXPECTED_EXIT_CODE"])
report_path = os.environ["BEAT_C_GUARD_REPORT"]
stdout_path = os.environ["BEAT_C_GUARD_STDOUT"]
stderr_path = os.environ["BEAT_C_GUARD_STDERR"]
resource_trace_path = os.environ.get("BEAT_C_GUARD_RESOURCE_TRACE", "")
phase_trace_path = os.environ.get("BEAT_C_GUARD_PHASE_TRACE", "")
rss_limit_bytes = int(os.environ["BEAT_C_GUARD_RSS_LIMIT_BYTES"])
timeout_seconds = int(os.environ["BEAT_C_GUARD_TIMEOUT_SECONDS"])
poll_seconds = float(os.environ["BEAT_C_GUARD_POLL_SECONDS"])
startup_timeout_seconds = int(os.environ["BEAT_C_GUARD_STARTUP_TIMEOUT_SECONDS"])
cleanup_timeout_seconds = int(os.environ["BEAT_C_GUARD_CLEANUP_TIMEOUT_SECONDS"])
inherited_authority_mode = (
    os.environ.get("BEAT_C_GUARD_INHERITED_AUTHORITY_MODE") == "1")
guard_authority_fd = int(
    os.environ.get("BEAT_C_GUARD_GUARD_AUTHORITY_FD", "0"))
command_authority_fd = int(
    os.environ.get("BEAT_C_GUARD_COMMAND_AUTHORITY_FD", "0"))
monitor_python_authority_fd = int(
    os.environ.get("BEAT_C_GUARD_MONITOR_PYTHON_AUTHORITY_FD", "0"))
guard_authority_path_requested = os.environ.get(
    "BEAT_C_GUARD_GUARD_AUTHORITY_PATH", "")
guard_authority_expected_sha256 = os.environ.get(
    "BEAT_C_GUARD_GUARD_AUTHORITY_SHA256", "")
command_authority_expected_sha256 = os.environ.get(
    "BEAT_C_GUARD_COMMAND_AUTHORITY_SHA256", "")
monitor_python_authority_expected_sha256 = os.environ.get(
    "BEAT_C_GUARD_MONITOR_PYTHON_AUTHORITY_SHA256", "")

platform_is_darwin = sys.platform == "darwin"


class LinuxProcfsError(Exception):
    pass


class LinuxProcfsNoSuchProcess(LinuxProcfsError):
    pass


class LinuxProcfsZombieProcess(LinuxProcfsError):
    pass


class LinuxProcfsAccessDenied(LinuxProcfsError):
    pass


_linux_procfs_clock_ticks = 0
_linux_procfs_page_size = 0
_linux_procfs_boot_time = 0


def linux_procfs_constants():
    global _linux_procfs_clock_ticks, _linux_procfs_page_size
    global _linux_procfs_boot_time
    if (
        _linux_procfs_clock_ticks > 0
        and _linux_procfs_page_size > 0
        and _linux_procfs_boot_time > 0
    ):
        return (
            _linux_procfs_clock_ticks,
            _linux_procfs_page_size,
            _linux_procfs_boot_time,
        )
    try:
        clock_ticks = int(os.sysconf("SC_CLK_TCK"))
        page_size = int(os.sysconf("SC_PAGE_SIZE"))
        with open("/proc/stat", "r", encoding="ascii") as handle:
            boot_rows = [
                line.split()
                for line in handle
                if line.startswith("btime ")
            ]
    except (OSError, ValueError) as exc:
        raise LinuxProcfsAccessDenied(str(exc)) from exc
    if (
        clock_ticks <= 0
        or page_size <= 0
        or len(boot_rows) != 1
        or len(boot_rows[0]) != 2
    ):
        raise LinuxProcfsError("Linux procfs constants are not canonical")
    try:
        boot_time = int(boot_rows[0][1])
    except ValueError as exc:
        raise LinuxProcfsError(
            "Linux procfs boot time is not canonical"
        ) from exc
    if boot_time <= 0:
        raise LinuxProcfsError("Linux procfs boot time is not positive")
    _linux_procfs_clock_ticks = clock_ticks
    _linux_procfs_page_size = page_size
    _linux_procfs_boot_time = boot_time
    return clock_ticks, page_size, boot_time


def linux_procfs_stat(pid):
    if not isinstance(pid, int) or isinstance(pid, bool) or pid <= 0:
        raise LinuxProcfsNoSuchProcess(pid)
    path = "/proc/%d/stat" % pid
    try:
        with open(path, "r", encoding="ascii") as handle:
            raw = handle.read(65537)
    except FileNotFoundError as exc:
        raise LinuxProcfsNoSuchProcess(pid) from exc
    except ProcessLookupError as exc:
        raise LinuxProcfsNoSuchProcess(pid) from exc
    except PermissionError as exc:
        raise LinuxProcfsAccessDenied(pid) from exc
    if not raw or len(raw) > 65536 or not raw.endswith("\n"):
        raise LinuxProcfsError("Linux procfs stat framing is invalid")
    close = raw.rfind(")")
    open_index = raw.find("(")
    if open_index <= 0 or close <= open_index or close + 2 >= len(raw):
        raise LinuxProcfsError("Linux procfs stat command framing is invalid")
    try:
        observed_pid = int(raw[:open_index].strip())
        fields = raw[close + 2:].split()
        state = fields[0]
        ppid = int(fields[1])
        pgrp = int(fields[2])
        session = int(fields[3])
        start_ticks = int(fields[19])
        resident_pages = int(fields[21])
    except (IndexError, ValueError) as exc:
        raise LinuxProcfsError("Linux procfs stat fields are invalid") from exc
    if (
        observed_pid != pid
        or len(state) != 1
        or ppid < 0
        or pgrp < 0
        or session < 0
        or start_ticks <= 0
        or resident_pages < 0
    ):
        raise LinuxProcfsError("Linux procfs stat identity is invalid")
    return {
        "pid": pid,
        "state": state,
        "ppid": ppid,
        "pgrp": pgrp,
        "session": session,
        "startTicks": start_ticks,
        "residentPages": resident_pages,
    }


def linux_procfs_pids():
    try:
        names = os.listdir("/proc")
    except OSError as exc:
        raise LinuxProcfsAccessDenied(str(exc)) from exc
    pids = sorted(
        int(name) for name in names
        if name.isascii() and name.isdigit() and int(name) > 0
    )
    if len(pids) > 1048576:
        raise LinuxProcfsError("Linux procfs process table is unbounded")
    return pids


class LinuxProcfsMemoryInfo:
    def __init__(self, rss):
        self.rss = rss


class LinuxProcfsProcess:
    def __init__(self, pid):
        if not isinstance(pid, int) or isinstance(pid, bool) or pid <= 0:
            raise LinuxProcfsNoSuchProcess(pid)
        self.pid = pid
        self.info = {"pid": pid}

    def create_time(self):
        row = linux_procfs_stat(self.pid)
        clock_ticks, _page_size, boot_time = linux_procfs_constants()
        return boot_time + row["startTicks"] / float(clock_ticks)

    def ppid(self):
        return linux_procfs_stat(self.pid)["ppid"]

    def status(self):
        state = linux_procfs_stat(self.pid)["state"]
        if state == "Z":
            return "zombie"
        if state in ("X", "x"):
            return "dead"
        return "running"

    def memory_info(self):
        row = linux_procfs_stat(self.pid)
        _clock_ticks, page_size, _boot_time = linux_procfs_constants()
        return LinuxProcfsMemoryInfo(row["residentPages"] * page_size)

    def parents(self):
        result = []
        seen = {self.pid}
        current = self.ppid()
        while current > 0:
            if current in seen or len(seen) > 4096:
                raise LinuxProcfsError("Linux procfs ancestry is cyclic")
            seen.add(current)
            parent = LinuxProcfsProcess(current)
            result.append(parent)
            current = parent.ppid()
        return result

    def children(self, recursive=False):
        children_by_parent = {}
        for candidate in linux_procfs_pids():
            try:
                parent = linux_procfs_stat(candidate)["ppid"]
            except (LinuxProcfsNoSuchProcess, LinuxProcfsZombieProcess):
                continue
            children_by_parent.setdefault(parent, []).append(candidate)
        direct = sorted(children_by_parent.get(self.pid, ()))
        if not recursive:
            return [LinuxProcfsProcess(pid) for pid in direct]
        result = []
        seen = {self.pid}
        queue = list(direct)
        cursor = 0
        while cursor < len(queue):
            pid = queue[cursor]
            cursor += 1
            if pid in seen:
                continue
            if len(seen) > 1048576:
                raise LinuxProcfsError(
                    "Linux procfs descendant tree is unbounded"
                )
            seen.add(pid)
            result.append(LinuxProcfsProcess(pid))
            queue.extend(sorted(children_by_parent.get(pid, ())))
        return result


class LinuxProcfsProvider:
    Error = LinuxProcfsError
    NoSuchProcess = LinuxProcfsNoSuchProcess
    ZombieProcess = LinuxProcfsZombieProcess
    AccessDenied = LinuxProcfsAccessDenied
    STATUS_ZOMBIE = "zombie"
    STATUS_DEAD = "dead"
    Process = LinuxProcfsProcess
    __file__ = None

    @staticmethod
    def process_iter(attrs):
        if tuple(attrs) != ("pid",):
            raise LinuxProcfsError(
                "Linux procfs iterator fields are not canonical"
            )
        return [LinuxProcfsProcess(pid) for pid in linux_procfs_pids()]


if not platform_is_darwin and psutil is None and sys.platform.startswith("linux"):
    psutil = LinuxProcfsProvider()


def linux_procfs_provider_preflight():
    if not sys.platform.startswith("linux"):
        return
    before_constants = linux_procfs_constants()
    row = linux_procfs_stat(os.getpid())
    iterated = linux_procfs_pids()
    if (
        row["pid"] != os.getpid()
        or row["ppid"] != os.getppid()
        or row["state"] in ("Z", "X", "x")
        or row["pgrp"] <= 0
        or row["session"] <= 0
        or row["startTicks"] <= 0
        or row["residentPages"] <= 0
        or os.getpid() not in iterated
        or iterated != sorted(set(iterated))
        or linux_procfs_constants() != before_constants
    ):
        raise LinuxProcfsError("Linux procfs exact reader is invalid")
    if not isinstance(psutil, LinuxProcfsProvider):
        return
    process = psutil.Process(os.getpid())
    if (
        process.pid != os.getpid()
        or process.ppid() != os.getppid()
        or process.create_time() <= 0
        or process.status() in (psutil.STATUS_ZOMBIE, psutil.STATUS_DEAD)
        or process.memory_info().rss <= 0
    ):
        raise LinuxProcfsError("Linux procfs self identity is invalid")
    process.parents()
    process.children(recursive=True)
    provider_iterated = [
        item.info["pid"] for item in psutil.process_iter(["pid"])
    ]
    if (
        os.getpid() not in provider_iterated
        or provider_iterated != sorted(set(provider_iterated))
        or linux_procfs_constants() != before_constants
    ):
        raise LinuxProcfsError("Linux procfs process inventory is invalid")

max_resident_bytes = 0
max_phys_footprint_bytes = 0
max_enforced_bytes = 0
max_process_count = 0
sample_count = 0
abort_reason = ""
measurement_status = "available"
measurement_error = ""
process_iter_trap_status = "not_requested"
process_iter_trap_probe_status = "not_run"
process_iter_trap_call_count = 0
root_identity_sampled = 0
identity_history_peak_count = 0
escape_pid = 0
rc = 3
actual_exit_code = -1
exit_code_contract_status = "unverified"
target_exec_released = 0
start = time.monotonic()
phase_offset = 0
child_pid = -1
root_pgid = -1
root_sid = -1
root_wait_status = None
received_signal = 0
history = {}
command_identity_status = "unavailable"
command_identity_error = ""
command_path = ""
command_sha256 = ""
command_device = 0
command_inode = 0
command_mode = 0
command_nlink = 0
command_uid = 0
command_gid = 0
command_size = 0
command_mtime_ns = 0
command_ctime_ns = 0
command_authority_status = "not_requested"
command_full_identity_tuple = None
command_argv_count = len(cmd)
command_argv_sha256 = ""
command_identity_tuple = None
command_snapshot_path = ""
command_snapshot_sha256 = ""
command_snapshot_device = 0
command_snapshot_inode = 0
command_snapshot_mode = 0
command_snapshot_nlink = 0
command_snapshot_uid = 0
command_snapshot_gid = 0
command_snapshot_size = 0
command_snapshot_mtime_ns = 0
command_snapshot_ctime_ns = 0
command_snapshot_full_identity_tuple = None
command_snapshot_identity_tuple = None
command_self_image_fd_requested_text = os.environ.get(
    "BEAT_C_GUARD_COMMAND_SELF_IMAGE_FD", "")
command_self_image_fd = 0
command_self_image_source_fd = -1
command_self_image_source_path = ""
command_self_image_source_sha256 = ""
command_self_image_source_identity = None
command_self_image_argv_count = 0
command_self_image_argv_sha256 = ""
command_self_image_authority_status = "not_requested"
command_self_image_inheritance_status = "not_requested"
command_self_image_identity_status = "not_requested"
command_self_image_source_fd_close_status = "not_requested"
sealed_system_volume_status = "not_applicable"
sealed_system_volume_root_path = ""
sealed_system_volume_root_device = 0
sealed_system_volume_format_capabilities = 0
sealed_system_volume_format_capabilities_valid = 0
sealed_system_volume_sealed = 0
sealed_system_volume_read_only = 0
sealed_system_volume_platform_path = ""
sealed_system_volume_platform_sha256 = ""
sealed_system_volume_platform_device = 0
sealed_system_volume_platform_inode = 0
sealed_system_volume_platform_mode = 0
sealed_system_volume_platform_nlink = 0
sealed_system_volume_platform_uid = 0
sealed_system_volume_platform_gid = 0
sealed_system_volume_platform_size = 0
sealed_system_volume_platform_mtime_ns = 0
sealed_system_volume_platform_ctime_ns = 0
sealed_system_volume_platform_identity_tuple = None
darwin_seatbelt_exact_exec_status = "not_applicable"
darwin_seatbelt_launcher_path = ""
darwin_seatbelt_launcher_sha256 = ""
darwin_seatbelt_launcher_device = 0
darwin_seatbelt_launcher_inode = 0
darwin_seatbelt_launcher_mode = 0
darwin_seatbelt_launcher_nlink = 0
darwin_seatbelt_launcher_uid = 0
darwin_seatbelt_launcher_gid = 0
darwin_seatbelt_launcher_size = 0
darwin_seatbelt_launcher_mtime_ns = 0
darwin_seatbelt_launcher_ctime_ns = 0
darwin_seatbelt_launcher_identity_tuple = None
darwin_seatbelt_profile = ""
darwin_seatbelt_profile_sha256 = ""
darwin_seatbelt_allowed_exec_path = ""
darwin_seatbelt_parameters = ()
darwin_seatbelt_parameter_count = 0
darwin_seatbelt_parameter_sha256 = ""
darwin_seatbelt_allowed_output_count = 0
private_frozen_tree_status = "not_applicable"
private_frozen_tree_root = ""
private_frozen_tree_expected_sha256 = ""
private_frozen_tree_sha256 = ""
private_frozen_tree_entry_count = 0
private_frozen_tree_directory_count = 0
private_frozen_tree_file_count = 0
private_frozen_tree_entries = None
private_frozen_tree_monitor = None
private_frozen_tree_watch_status = "not_applicable"
private_frozen_tree_watch_count = 0
private_frozen_tree_precheck_status = "not_applicable"
private_frozen_tree_postcheck_status = "not_applicable"
private_frozen_tree_attrib_event_status = "not_applicable"
private_frozen_tree_attrib_event_count = 0
private_frozen_tree_ssv_launcher_status = "not_applicable"
private_frozen_tree_ssv_root_device = 0
private_frozen_tree_ssv_root_sealed = 0
private_frozen_tree_ssv_root_read_only = 0
monitor_python_path = ""
monitor_python_sha256 = ""
monitor_python_device = 0
monitor_python_inode = 0
monitor_python_mode = 0
monitor_python_nlink = 0
monitor_python_uid = 0
monitor_python_gid = 0
monitor_python_size = 0
monitor_python_mtime_ns = 0
monitor_python_ctime_ns = 0
monitor_python_identity_tuple = None
monitor_python_full_identity_tuple = None
monitor_python_authority_status = "not_requested"
guard_authority_path = ""
guard_authority_sha256 = ""
guard_authority_device = 0
guard_authority_inode = 0
guard_authority_mode = 0
guard_authority_nlink = 0
guard_authority_uid = 0
guard_authority_gid = 0
guard_authority_size = 0
guard_authority_mtime_ns = 0
guard_authority_ctime_ns = 0
guard_authority_identity_tuple = None
guard_authority_status = "not_requested"
monitor_runtime_script_path = ""
monitor_runtime_script_sha256 = ""
monitor_runtime_script_device = 0
monitor_runtime_script_inode = 0
monitor_runtime_script_mode = 0
monitor_runtime_script_nlink = 0
monitor_runtime_script_uid = 0
monitor_runtime_script_gid = 0
monitor_runtime_script_size = 0
monitor_runtime_script_mtime_ns = 0
monitor_runtime_script_ctime_ns = 0
monitor_runtime_script_identity_tuple = None
monitor_runtime_script_fd = -1
monitor_runtime_script_invocation_status = "unverified"
monitor_runtime_script_stage_expected_sha256 = ""
monitor_runtime_script_builtin_sha256 = ""
monitor_runtime_script_expected_sha_match = 0
monitor_psutil_path = ""
monitor_psutil_sha256 = ""
monitor_psutil_device = 0
monitor_psutil_inode = 0
monitor_psutil_size = 0
monitor_psutil_mtime_ns = 0
monitor_psutil_ctime_ns = 0
monitor_psutil_identity_tuple = None
monitor_psutil_closure_root = ""
monitor_psutil_closure_count = 0
monitor_psutil_closure_sha256 = ""
monitor_psutil_closure_entries = None
monitor_runtime_physical_count = 0
monitor_runtime_physical_sha256 = ""
monitor_runtime_physical_entries = None
monitor_runtime_dyld_image_count = 0
monitor_runtime_dyld_image_sha256 = ""
monitor_runtime_dyld_image_entries = None
monitor_runtime_shared_cache_image_count = 0
monitor_runtime_shared_cache_image_sha256 = ""
monitor_runtime_shared_cache_uuid = ""
monitor_python_startup_flags_status = "unverified"
monitor_python_preappend_sys_path_count = 0
monitor_python_preappend_sys_path_sha256 = ""
monitor_python_absent_path = ""
monitor_python_absent_path_status = "not_applicable"
monitor_python_absent_path_parent = ""
monitor_python_absent_parent_watch_status = "not_applicable"
monitor_python_absent_parent_identity_sha256 = ""
target_env = {}
target_env_count = 0
target_env_sha256 = ""
target_env_requested = {}
target_env_requested_count = 0
target_env_requested_sha256 = ""
publication_channel_status = "not_requested"
publication_channel_error = ""
publication_work_root_fshex = ""
publication_publish_root_fshex = ""
publication_argv_manifest = None
publication_env_manifest = None
publication_manifest_records = {}
target_env_injected_parent_capability = ""
target_env_injected_parent_capability_sha256 = ""
target_env_injected_parent_monitor_pid = 0
target_env_injected_parent_limit_bytes = 0
target_env_injected_parent_proof_fd = 3
target_env_injected_parent_proof_record_sha256 = ""
target_env_injected_parent_root_pid = 0
target_env_injected_parent_root_start_tvsec = 0
target_env_injected_parent_root_start_tvusec = 0
target_env_injected_parent_root_ppid = 0
target_env_injected_parent_root_sid = 0
target_env_injected_parent_root_pgid = 0
parent_guard_proof_fd = 0
parent_guard_proof_peer_pid = 0
parent_guard_proof_record_sha256 = ""
parent_guard_root_pid = 0
parent_guard_root_start_tvsec = 0
parent_guard_root_start_tvusec = 0
parent_guard_root_ppid = 0
parent_guard_root_sid = 0
parent_guard_root_pgid = 0
target_proof_monitor_socket = None
target_proof_unused_socket = None
tracked_outputs = {}
tracked_output_fd_bindings = {}
tracked_output_fd_inheritance_status = "not_requested"
tracked_output_fd_argv_sha256 = ""
tracked_output_evidence = {}
tracked_output_failure_label = ""
tracked_output_failure_error = ""
combined_output_observed_bytes = 0
combined_output_captured_bytes = 0
combined_output_limit_status = "within_limit"
combined_output_overflow_stream = ""
stream_read_fds = {}
stream_eof = {"stdout": False, "stderr": False}
output_fds = {}
output_paths = {}
output_initial_identities = {}
target_fd_ready_read = -1
output_path_history_monitor = None
output_path_history_schema = "cheng.guard.output_path_history"
output_path_history_monitor_kind = ""
output_path_history_status = "unavailable"
output_path_history_watch_count = 0
output_path_history_forbidden_events = (
    "delete,link,rename,revoke,unmount"
    if platform_is_darwin else
    "delete,rename,unmount;hardlink_history=unsupported"
)

IDENTITY_FIELDS = (
    "st_dev",
    "st_ino",
    "st_mode",
    "st_size",
    "st_mtime_ns",
    "st_ctime_ns",
)
FULL_IDENTITY_FIELDS = (
    "st_dev",
    "st_ino",
    "st_mode",
    "st_nlink",
    "st_uid",
    "st_gid",
    "st_size",
    "st_mtime_ns",
    "st_ctime_ns",
)
SEALED_PLATFORM_IDENTITY_FIELDS = FULL_IDENTITY_FIELDS


def command_text_frame(raw):
    return struct.pack(">I", len(raw)) + raw


def receipt_text_frame(raw):
    return struct.pack(">Q", len(raw)) + raw


def receipt_key_tuple_sha256(keys):
    payload = bytearray(
        receipt_text_frame(b"cheng.guard.receipt_key_tuple"))
    payload.extend(struct.pack(">Q", len(keys)))
    for key in keys:
        payload.extend(receipt_text_frame(key.encode("ascii")))
    return hashlib.sha256(payload).hexdigest()


class CanonicalReceiptWriter:
    FOOTER_KEYS = (
        "receipt_key_count",
        "receipt_key_tuple_sha256",
    )

    def __init__(self, raw):
        self.raw = raw
        self.keys = []
        self.key_set = set()
        self.finalized = False

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.raw.close()
        return False

    def fileno(self):
        return self.raw.fileno()

    def flush(self):
        self.raw.flush()

    def write(self, text):
        if self.finalized:
            raise OSError(errno.EPERM, "receipt is already finalized")
        if (
            not isinstance(text, str)
            or not text.endswith("\n")
            or text.count("\n") != 1
        ):
            raise OSError(errno.EINVAL, "receipt write is not one exact LF row")
        row = text[:-1]
        separator = row.find("=")
        key = row[:separator]
        if (
            separator <= 0
            or not key[0].islower()
            or any(
                not (
                    character.islower()
                    or character.isdigit()
                    or character == "_"
                )
                for character in key
            )
            or key in self.key_set
            or key in self.FOOTER_KEYS
        ):
            raise OSError(errno.EINVAL, "receipt key is invalid or duplicated")
        self.keys.append(key)
        self.key_set.add(key)
        return self.raw.write(text)

    def finalize(self):
        if self.finalized:
            raise OSError(errno.EPERM, "receipt was finalized twice")
        keys = tuple(self.keys) + self.FOOTER_KEYS
        digest = receipt_key_tuple_sha256(keys)
        self.raw.write("receipt_key_count=%d\n" % len(keys))
        self.raw.write("receipt_key_tuple_sha256=%s\n" % digest)
        self.finalized = True


def command_argv_digest(argv):
    payload = bytearray()
    payload.extend(command_text_frame(b"cheng.guard.command_argv"))
    payload.extend(struct.pack(">I", len(argv)))
    for value in argv:
        payload.extend(command_text_frame(os.fsencode(value)))
    return hashlib.sha256(payload).hexdigest()


def target_env_digest(values):
    payload = bytearray()
    payload.extend(command_text_frame(b"cheng.guard.target_env"))
    keys = sorted(values)
    payload.extend(struct.pack(">I", len(keys)))
    for key in keys:
        payload.extend(command_text_frame(os.fsencode(key)))
        payload.extend(command_text_frame(os.fsencode(values[key])))
    return len(keys), hashlib.sha256(payload).hexdigest()


PUBLICATION_MANIFEST_KEYS = {
    "schema",
    "physicalValues",
    "physicalDigest",
    "logicalValues",
    "logicalDigest",
    "workRootFshex",
    "publishRootFshex",
    "pathRoles",
    "pathRoleDigest",
    "supportPaths",
    "supportPathRoleDigest",
}
PUBLICATION_PATH_ROW_KEYS = {
    "ordinal",
    "role",
    "selector",
    "prefixUtf8Hex",
    "physicalPathFshex",
    "logicalPathFshex",
}
PUBLICATION_IDENTITY_FIELDS = (
    "st_dev",
    "st_ino",
    "st_mode",
    "st_nlink",
    "st_uid",
    "st_gid",
    "st_size",
    "st_mtime_ns",
    "st_ctime_ns",
)


def publication_canonical_json_bytes(value):
    return (
        json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")
        + b"\n"
    )


def publication_role_valid(value):
    return (
        isinstance(value, str)
        and bool(value)
        and "a" <= value[0] <= "z"
        and all(
            "a" <= character <= "z"
            or "0" <= character <= "9"
            or character == "_"
            for character in value
        )
    )


def publication_path_from_fshex(value, label):
    if not isinstance(value, str):
        raise OSError(errno.EINVAL, "%s fshex is not text" % label)
    try:
        raw = bytes.fromhex(value)
    except ValueError as exc:
        raise OSError(errno.EINVAL, "%s fshex is invalid: %s" % (
            label, exc))
    if not raw or b"\0" in raw:
        raise OSError(errno.EINVAL, "%s fshex is empty or contains NUL" % label)
    path = os.fsdecode(raw)
    if not os.path.isabs(path) or os.path.normpath(path) != path:
        raise OSError(errno.EINVAL, "%s path is not canonical" % label)
    return path


def publication_projection_relative(path, work_root, label):
    try:
        if os.path.commonpath((path, work_root)) != work_root:
            raise ValueError
    except ValueError:
        raise OSError(
            errno.EPERM, "%s path is outside publication work root" % label)
    relative = os.path.relpath(path, work_root)
    if relative == ".." or relative.startswith("../"):
        raise OSError(
            errno.EPERM, "%s path escapes publication work root" % label)
    return relative


def publication_roots(value, label):
    work_root = publication_path_from_fshex(
        value.get("workRootFshex"), label + " work root")
    publish_root = publication_path_from_fshex(
        value.get("publishRootFshex"), label + " publish root")
    if work_root == publish_root or os.path.basename(work_root) != "work":
        raise OSError(errno.EINVAL, "%s roots are not distinct" % label)
    publish_name_raw = os.fsencode(os.path.basename(publish_root))
    try:
        publish_name_raw.decode("utf-8", "strict")
    except UnicodeDecodeError as exc:
        raise OSError(
            errno.EINVAL, "%s publish basename is not UTF-8: %s" % (
                label, exc))
    anchor_name = (
        ".cheng-current-publisher-"
        + publish_name_raw.hex()
        + "-control"
    )
    try:
        name_max = os.pathconf(os.path.dirname(publish_root), "PC_NAME_MAX")
    except (OSError, ValueError) as exc:
        raise OSError(
            errno.EINVAL, "%s anchor NAME_MAX unavailable: %s" % (
                label, exc))
    if len(os.fsencode(anchor_name)) > name_max:
        raise OSError(errno.ENAMETOOLONG, "%s anchor name is too long" % label)
    expected_work = os.path.join(
        os.path.dirname(publish_root),
        anchor_name,
        "work",
    )
    if work_root != expected_work:
        raise OSError(
            errno.EINVAL, "%s work root is not deterministic" % label)
    return work_root, publish_root


def open_publication_manifest(path, label):
    if (
        not os.path.isabs(path)
        or os.path.realpath(path) != path
        or os.path.normpath(path) != path
    ):
        raise OSError(errno.EINVAL, "%s path is not exact" % label)
    flags = os.O_RDONLY
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(path, flags)
    try:
        before = os.fstat(fd)
        identity = tuple(
            int(getattr(before, field))
            for field in PUBLICATION_IDENTITY_FIELDS
        )
        if (
            not stat.S_ISREG(before.st_mode)
            or before.st_nlink != 1
            or before.st_uid != os.geteuid()
            or before.st_gid != os.getegid()
            or stat.S_IMODE(before.st_mode) != 0o400
            or before.st_size <= 0
            or before.st_size > 16 * 1024 * 1024
        ):
            raise OSError(
                errno.EPERM, "%s is not a private sealed manifest" % label)
        chunks = []
        offset = 0
        while offset < before.st_size:
            chunk = os.pread(
                fd,
                min(1024 * 1024, before.st_size - offset),
                offset,
            )
            if not chunk:
                raise OSError(errno.EIO, "%s short read" % label)
            chunks.append(chunk)
            offset += len(chunk)
        raw = b"".join(chunks)
        after = os.fstat(fd)
        named = os.stat(path, follow_symlinks=False)
        if (
            identity
            != tuple(
                int(getattr(after, field))
                for field in PUBLICATION_IDENTITY_FIELDS
            )
            or identity
            != tuple(
                int(getattr(named, field))
                for field in PUBLICATION_IDENTITY_FIELDS
            )
        ):
            raise OSError(errno.EIO, "%s identity changed" % label)
        try:
            value = json.loads(raw)
        except (UnicodeError, json.JSONDecodeError) as exc:
            raise OSError(errno.EINVAL, "%s JSON is invalid: %s" % (
                label, exc))
        if publication_canonical_json_bytes(value) != raw:
            raise OSError(errno.EINVAL, "%s JSON is not canonical" % label)
        return {
            "fd": fd,
            "path": path,
            "raw": raw,
            "raw32": hashlib.sha256(raw).hexdigest(),
            "identity": identity,
            "value": value,
        }
    except BaseException:
        os.close(fd)
        raise


def validate_publication_manifest(value, kind):
    if not isinstance(value, dict) or set(value) != PUBLICATION_MANIFEST_KEYS:
        raise OSError(
            errno.EINVAL, "publication %s manifest shape is invalid" % kind)
    if value.get("schema") != "cheng.darwin_current_release_runtime_" + kind:
        raise OSError(
            errno.EINVAL, "publication %s manifest schema is invalid" % kind)
    work_root, publish_root = publication_roots(value, kind)
    roles = value.get("pathRoles")
    support_rows = value.get("supportPaths")
    if (
        not isinstance(roles, list)
        or not isinstance(support_rows, list)
        or value.get("pathRoleDigest")
        != hashlib.sha256(publication_canonical_json_bytes(roles)).hexdigest()
        or value.get("supportPathRoleDigest")
        != hashlib.sha256(
            publication_canonical_json_bytes(support_rows)).hexdigest()
    ):
        raise OSError(
            errno.EINVAL, "publication %s mapping digest is invalid" % kind)
    support = {}
    previous_role = ""
    seen_physical = set()
    seen_logical = set()
    for ordinal, row in enumerate(support_rows):
        if not isinstance(row, dict) or set(row) != PUBLICATION_PATH_ROW_KEYS:
            raise OSError(
                errno.EINVAL,
                "publication %s support row shape is invalid" % kind)
        role = row.get("role")
        physical = publication_path_from_fshex(
            row.get("physicalPathFshex"), kind + " support physical")
        logical = publication_path_from_fshex(
            row.get("logicalPathFshex"), kind + " support logical")
        relative = publication_projection_relative(
            physical, work_root, kind + " support")
        if (
            row.get("ordinal") != ordinal
            or not publication_role_valid(role)
            or role <= previous_role
            or row.get("selector") != role
            or row.get("prefixUtf8Hex") != ""
            or logical != os.path.join(publish_root, relative)
            or physical in seen_physical
            or logical in seen_logical
        ):
            raise OSError(
                errno.EINVAL,
                "publication %s support projection is invalid" % kind)
        support[role] = (physical, logical)
        previous_role = role
        seen_physical.add(physical)
        seen_logical.add(logical)
    if kind == "argv":
        physical_values = value.get("physicalValues")
        logical_values = value.get("logicalValues")
        if (
            not isinstance(physical_values, list)
            or not isinstance(logical_values, list)
            or len(physical_values) != len(logical_values)
            or not all(isinstance(item, str) for item in physical_values)
            or not all(isinstance(item, str) for item in logical_values)
        ):
            raise OSError(
                errno.EINVAL, "publication argv values are invalid")
        rebuilt = list(physical_values)
        previous_selector = -1
        seen_selectors = set()
        seen_roles = set()
        role_map = {}
        for ordinal, row in enumerate(roles):
            if not isinstance(row, dict) or set(row) != PUBLICATION_PATH_ROW_KEYS:
                raise OSError(
                    errno.EINVAL, "publication argv role shape is invalid")
            selector_raw = row.get("selector")
            try:
                selector = int(selector_raw)
                prefix = bytes.fromhex(
                    row.get("prefixUtf8Hex")).decode("utf-8", "strict")
            except (TypeError, ValueError, UnicodeError) as exc:
                raise OSError(
                    errno.EINVAL,
                    "publication argv role encoding is invalid: %s" % exc)
            role = row.get("role")
            if (
                str(selector) != selector_raw
                or selector < 0
                or selector >= len(rebuilt)
                or selector <= previous_selector
                or selector in seen_selectors
                or not publication_role_valid(role)
                or role in seen_roles
                or row.get("ordinal") != ordinal
            ):
                raise OSError(
                    errno.EINVAL, "publication argv role order is invalid")
            physical = publication_path_from_fshex(
                row.get("physicalPathFshex"), "argv role physical")
            logical = publication_path_from_fshex(
                row.get("logicalPathFshex"), "argv role logical")
            relative = publication_projection_relative(
                physical, work_root, "argv role")
            if (
                physical_values[selector] != prefix + physical
                or logical != os.path.join(publish_root, relative)
            ):
                raise OSError(
                    errno.EINVAL,
                    "publication argv role projection is invalid")
            rebuilt[selector] = prefix + logical
            role_map[role] = (selector, prefix, physical, logical)
            previous_selector = selector
            seen_selectors.add(selector)
            seen_roles.add(role)
        work_text = work_root
        if (
            any(
                work_text in item
                for index, item in enumerate(physical_values)
                if index not in seen_selectors
            )
            or any(work_text in item for item in logical_values)
            or rebuilt != logical_values
            or value.get("physicalDigest")
            != command_argv_digest(physical_values)
            or value.get("logicalDigest")
            != command_argv_digest(logical_values)
        ):
            raise OSError(
                errno.EINVAL, "publication argv channel is invalid")
    elif kind == "env":
        physical_values = value.get("physicalValues")
        logical_values = value.get("logicalValues")
        if (
            not isinstance(physical_values, dict)
            or not isinstance(logical_values, dict)
            or set(physical_values) != set(logical_values)
            or not all(
                isinstance(key, str) and isinstance(item, str)
                for key, item in physical_values.items()
            )
            or not all(isinstance(item, str) for item in logical_values.values())
        ):
            raise OSError(errno.EINVAL, "publication env values are invalid")
        rebuilt = dict(physical_values)
        previous_selector = ""
        seen_selectors = set()
        seen_roles = set()
        role_map = {}
        for ordinal, row in enumerate(roles):
            if not isinstance(row, dict) or set(row) != PUBLICATION_PATH_ROW_KEYS:
                raise OSError(
                    errno.EINVAL, "publication env role shape is invalid")
            selector = row.get("selector")
            role = row.get("role")
            if (
                not isinstance(selector, str)
                or not selector
                or not (
                    "A" <= selector[0] <= "Z"
                    and all(
                        "A" <= character <= "Z"
                        or "0" <= character <= "9"
                        or character == "_"
                        for character in selector
                    )
                )
                or selector <= previous_selector
                or selector not in rebuilt
                or selector in seen_selectors
                or not publication_role_valid(role)
                or role in seen_roles
                or row.get("ordinal") != ordinal
                or row.get("prefixUtf8Hex") != ""
            ):
                raise OSError(
                    errno.EINVAL, "publication env role order is invalid")
            physical = publication_path_from_fshex(
                row.get("physicalPathFshex"), "env role physical")
            logical = publication_path_from_fshex(
                row.get("logicalPathFshex"), "env role logical")
            relative = publication_projection_relative(
                physical, work_root, "env role")
            if (
                physical_values[selector] != physical
                or logical != os.path.join(publish_root, relative)
            ):
                raise OSError(
                    errno.EINVAL, "publication env projection is invalid")
            rebuilt[selector] = logical
            role_map[role] = (selector, "", physical, logical)
            previous_selector = selector
            seen_selectors.add(selector)
            seen_roles.add(role)
        work_text = work_root
        if (
            any(
                work_text in item
                for key, item in physical_values.items()
                if key not in seen_selectors
            )
            or any(work_text in item for item in logical_values.values())
            or rebuilt != logical_values
            or value.get("physicalDigest")
            != target_env_digest(physical_values)[1]
            or value.get("logicalDigest")
            != target_env_digest(logical_values)[1]
        ):
            raise OSError(errno.EINVAL, "publication env channel is invalid")
    else:
        raise OSError(errno.EINVAL, "publication manifest kind is invalid")
    return {
        "work_root": work_root,
        "publish_root": publish_root,
        "physical_values": physical_values,
        "logical_values": logical_values,
        "physical_digest": value["physicalDigest"],
        "logical_digest": value["logicalDigest"],
        "path_role_digest": value["pathRoleDigest"],
        "support_path_role_digest": value["supportPathRoleDigest"],
        "roles": role_map,
        "support": support,
    }


def prepare_publication_channel_authority():
    global publication_channel_status, publication_channel_error
    global publication_work_root_fshex, publication_publish_root_fshex
    global publication_argv_manifest, publication_env_manifest
    if (
        not publication_argv_manifest_requested
        and not publication_env_manifest_requested
    ):
        return
    if (
        not publication_argv_manifest_requested
        or not publication_env_manifest_requested
    ):
        raise OSError(
            errno.EINVAL, "publication manifest pair is incomplete")
    argv_record = open_publication_manifest(
        publication_argv_manifest_requested,
        "publication argv manifest",
    )
    try:
        env_record = open_publication_manifest(
            publication_env_manifest_requested,
            "publication env manifest",
        )
    except BaseException:
        os.close(argv_record["fd"])
        raise
    publication_manifest_records["argv"] = argv_record
    publication_manifest_records["env"] = env_record
    argv_manifest = validate_publication_manifest(
        argv_record["value"], "argv")
    env_manifest = validate_publication_manifest(
        env_record["value"], "env")
    if (
        argv_manifest["work_root"] != env_manifest["work_root"]
        or argv_manifest["publish_root"] != env_manifest["publish_root"]
        or argv_manifest["physical_values"] != cmd
        or env_manifest["physical_values"] != target_env_requested
        or env_manifest["support"]
    ):
        raise OSError(
            errno.EINVAL, "publication manifest physical authority mismatch")
    command_role = argv_manifest["roles"].get("command")
    if (
        command_role is None
        or command_role[0] != 0
        or command_role[1] != ""
        or command_role[2] != command_path
        or argv_manifest["logical_values"][0] != command_role[3]
    ):
        raise OSError(
            errno.EINVAL, "publication command role is not exact")
    expected_support = {
        "argv_manifest": publication_argv_manifest_requested,
        "env_manifest": publication_env_manifest_requested,
        "frozen_tree": frozen_tree_root_requested,
        "guard_report": report_path,
        "stderr": stderr_path,
        "stdout": stdout_path,
    }
    if resource_trace_path:
        expected_support["resource_trace"] = resource_trace_path
    if phase_trace_path:
        expected_support["phase_trace"] = phase_trace_path
    for label, current in tracked_outputs.items():
        expected_support["tracked_" + label] = current["path"]
    if set(argv_manifest["support"]) != set(expected_support):
        raise OSError(
            errno.EINVAL, "publication support role set is not exact")
    for role, physical in expected_support.items():
        if argv_manifest["support"][role][0] != physical:
            raise OSError(
                errno.EINVAL,
                "publication support physical path mismatch: %s" % role)
    publication_work_root_fshex = os.fsencode(
        argv_manifest["work_root"]).hex()
    publication_publish_root_fshex = os.fsencode(
        argv_manifest["publish_root"]).hex()
    publication_argv_manifest = argv_manifest
    publication_env_manifest = env_manifest
    publication_channel_status = "verified"
    publication_channel_error = ""


def verify_publication_channel_authority():
    if publication_channel_status == "not_requested":
        return
    for kind, record in publication_manifest_records.items():
        before = record["identity"]
        current = os.fstat(record["fd"])
        named = os.stat(record["path"], follow_symlinks=False)
        current_identity = tuple(
            int(getattr(current, field))
            for field in PUBLICATION_IDENTITY_FIELDS
        )
        named_identity = tuple(
            int(getattr(named, field))
            for field in PUBLICATION_IDENTITY_FIELDS
        )
        if before != current_identity or before != named_identity:
            raise OSError(
                errno.EIO, "publication %s manifest identity drifted" % kind)
        raw = bytearray()
        offset = 0
        while offset < current.st_size:
            chunk = os.pread(
                record["fd"],
                min(1024 * 1024, current.st_size - offset),
                offset,
            )
            if not chunk:
                raise OSError(
                    errno.EIO, "publication %s manifest short read" % kind)
            raw.extend(chunk)
            offset += len(chunk)
        if (
            bytes(raw) != record["raw"]
            or hashlib.sha256(raw).hexdigest() != record["raw32"]
        ):
            raise OSError(
                errno.EIO, "publication %s manifest bytes drifted" % kind)


def parse_tracked_output_specs():
    result = {}
    for raw in tracked_output_spec_args:
        if "=" not in raw:
            raise OSError(errno.EINVAL, "tracked output lacks label separator")
        label, remainder = raw.split("=", 1)
        if (not label or not label[0].isalpha() or
                any(not (char.isalnum() or char == "_") for char in label)):
            raise OSError(errno.EINVAL, "tracked output label is not canonical")
        if label in result:
            raise OSError(errno.EINVAL, "duplicate tracked output label")
        parts = remainder.split(":", 2)
        if len(parts) != 3:
            raise OSError(errno.EINVAL, "tracked output spec lacks cap/mode/path")
        cap_text, required_mode, path = parts
        if (not cap_text.isdigit() or int(cap_text) <= 0 or
                int(cap_text) > 1073741824):
            raise OSError(errno.EINVAL, "tracked output cap is invalid")
        if required_mode not in ("regular", "executable"):
            raise OSError(errno.EINVAL, "tracked output mode is invalid")
        if not path:
            raise OSError(errno.EINVAL, "tracked output path is empty")
        result[label] = {
            "path": path,
            "max_bytes": int(cap_text),
            "required_mode": required_mode,
            "status": "prepared",
        }
    return result


def parse_tracked_output_fd_bindings():
    result = {}
    used_fds = set()
    used_roles = set()
    compiler_selectors = []
    compiler_prefixes = (
        ("object", "--out-fd:"),
        ("report", "--report-fd:"),
    )
    for argument in cmd[1:]:
        matched_prefix = False
        for role, prefix in compiler_prefixes:
            if argument.startswith(prefix):
                matched_prefix = True
                fd_text = argument[len(prefix):]
                if (
                    not fd_text.isdigit()
                    or str(int(fd_text)) != fd_text
                ):
                    raise OSError(
                        errno.EINVAL,
                        "compiler held output fd selector is not canonical",
                    )
                compiler_selectors.append(
                    (role, int(fd_text), argument))
                break
        if matched_prefix:
            continue
        if argument.startswith("--out-fd") or argument.startswith(
                "--report-fd"):
            raise OSError(
                errno.EINVAL,
                "compiler held output fd selector shape is invalid",
            )
    if compiler_selectors:
        if any(argument.startswith("/dev/fd/") for argument in cmd[1:]):
            raise OSError(
                errno.EINVAL,
                "tracked output fd authority modes cannot be mixed",
            )
        for argument in cmd[1:]:
            if (
                argument == "--out"
                or argument.startswith("--out:")
                or argument.startswith("--out=")
                or argument == "--report-out"
                or argument.startswith("--report-out:")
                or argument.startswith("--report-out=")
            ):
                raise OSError(
                    errno.EPERM,
                    "compiler held output fd conflicts with path output",
                )
        selector_roles = [role for role, _fd, _arg in compiler_selectors]
        selector_fds = [fd for _role, fd, _arg in compiler_selectors]
        if (
            len(set(selector_roles)) != len(selector_roles)
            or len(set(selector_fds)) != len(selector_fds)
        ):
            raise OSError(
                errno.EINVAL,
                "compiler held output fd role or descriptor is reused",
            )
        if set(selector_roles) != {"object", "report"}:
            raise OSError(
                errno.EINVAL,
                "compiler held output fd selectors must contain both roles",
            )
    argv_digest = command_argv_digest(cmd)
    matched_compiler_selectors = set()
    legacy_binding_count = 0
    for raw in tracked_output_fd_binding_args:
        label, separator, fd_text = raw.partition("=")
        if (
            not separator
            or label not in tracked_outputs
            or label in result
            or not fd_text.isdigit()
            or str(int(fd_text)) != fd_text
        ):
            raise OSError(
                errno.EINVAL,
                "tracked output fd binding label or fd is invalid",
            )
        target_fd = int(fd_text)
        if (
            target_fd < 10
            or target_fd > 63
            or target_fd in used_fds
        ):
            raise OSError(
                errno.EINVAL,
                "tracked output fd binding is outside the exact range "
                "or reused",
            )
        target_path = "/dev/fd/%d" % target_fd
        output_path = tracked_outputs[label]["path"]
        legacy_count = cmd.count(target_path)
        compiler_matches = [
            (role, argument)
            for role, fd, argument in compiler_selectors
            if fd == target_fd
        ]
        if legacy_count + len(compiler_matches) != 1 or output_path in cmd:
            raise OSError(
                errno.EPERM,
                "tracked output fd binding is not exact in target argv",
            )
        authority_mode = "dev_fd_path"
        authority_selector = target_path
        authority_role = "legacy"
        if compiler_matches:
            authority_role, authority_selector = compiler_matches[0]
            authority_mode = "compiler_numeric_fd_flag"
            if authority_role in used_roles:
                raise OSError(
                    errno.EINVAL,
                    "compiler held output fd role is duplicated",
                )
            used_roles.add(authority_role)
            matched_compiler_selectors.add(authority_selector)
        else:
            legacy_binding_count += 1
        result[label] = {
            "label": label,
            "fd": target_fd,
            "path": target_path,
            "authority_mode": authority_mode,
            "authority_selector": authority_selector,
            "authority_role": authority_role,
            "argv_sha256": argv_digest,
        }
        used_fds.add(target_fd)
    if compiler_selectors and legacy_binding_count:
        raise OSError(
            errno.EINVAL,
            "tracked output fd authority modes cannot be mixed",
        )
    if len(matched_compiler_selectors) != len(compiler_selectors):
        raise OSError(
            errno.EPERM,
            "compiler held output fd selector is not guard-tracked",
        )
    if len(result) != tracked_output_fd_count:
        raise OSError(
            errno.EINVAL,
            "tracked output fd binding count drifted",
        )
    return result


def stable_regular_file_snapshot(path, label, with_data=False):
    flags = os.O_RDONLY
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(path, flags)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode):
            raise OSError(errno.EINVAL, "%s is not regular" % label)
        digest = hashlib.sha256()
        # Streaming 16 KiB digest keeps the transient bytes objects in the
        # malloc small-zone deep-reuse band.  Accumulating 1 MiB chunks and
        # joining them doubles a large command image (the ~170 MB
        # kernel_driver) into ~340 MiB of simultaneous monitor RSS; every
        # default caller discards the bytes and only consumes the digest
        # and stat identity, so with_data=False preserves all observable
        # contracts except that transient image residency (V6-MEM ledger).
        data = None
        chunks = [] if with_data else None
        offset = 0
        while offset < before.st_size:
            chunk = os.read(fd, 16 * 1024)
            if not chunk:
                break
            digest.update(chunk)
            offset += len(chunk)
            if chunks is not None:
                chunks.append(chunk)
        after = os.fstat(fd)
    finally:
        os.close(fd)
    if any(getattr(before, field) != getattr(after, field) for field in IDENTITY_FIELDS):
        raise OSError(errno.EIO, "%s changed during snapshot" % label)
    path_stat = os.stat(path, follow_symlinks=False)
    if any(getattr(before, field) != getattr(path_stat, field) for field in IDENTITY_FIELDS):
        raise OSError(errno.EIO, "%s path does not name snapshotted bytes" % label)
    if with_data:
        data = b"".join(chunks)
        if len(data) != before.st_size:
            raise OSError(errno.EIO, "%s size mismatch" % label)
    elif offset != before.st_size:
        raise OSError(errno.EIO, "%s size mismatch" % label)
    identity = tuple(getattr(before, field) for field in IDENTITY_FIELDS)
    return data, digest.hexdigest(), identity


def stable_held_file_snapshot(
        fd,
        path,
        label,
        require_read_only=False,
        require_single_link=True):
    before = os.fstat(fd)
    if (
        not stat.S_ISREG(before.st_mode)
        or (require_single_link and before.st_nlink != 1)
        or (require_read_only and before.st_mode & 0o222)
    ):
        raise OSError(
            errno.EPERM,
            "%s is not an authorized single-link regular file" % label)
    digest = hashlib.sha256()
    offset = 0
    # 16 KiB chunks keep every transient bytes object inside the malloc
    # small zone's deep-reuse band.  A 1 MiB chunk on a large command
    # image (the ~170 MB kernel_driver) churned the large-segment pool
    # and left a ~350 MiB freed-but-dirty high-water mark in the guard
    # monitor process (V6-MEM ledger: observer inflation); sha256 over
    # an ordered chunk stream is chunk-size invariant.
    while offset < before.st_size:
        chunk = os.pread(
            fd, min(16 * 1024, before.st_size - offset), offset)
        if not chunk:
            raise OSError(
                errno.EIO,
                "%s has a short held-fd read" % label)
        digest.update(chunk)
        offset += len(chunk)
    after = os.fstat(fd)
    named = os.stat(path, follow_symlinks=False)
    full_before = tuple(
        int(getattr(before, field))
        for field in SEALED_PLATFORM_IDENTITY_FIELDS)
    full_after = tuple(
        int(getattr(after, field))
        for field in SEALED_PLATFORM_IDENTITY_FIELDS)
    full_named = tuple(
        int(getattr(named, field))
        for field in SEALED_PLATFORM_IDENTITY_FIELDS)
    if full_before != full_after or full_before != full_named:
        raise OSError(
            errno.EIO,
            "%s identity drifted during held-fd snapshot" % label)
    return digest.hexdigest(), full_before


def stable_held_runtime_script_snapshot(fd, path):
    return stable_held_file_snapshot(
        fd,
        path,
        "monitor runtime script",
        require_read_only=True,
    )


def held_file_bytes(fd, expected_identity, label):
    before = tuple(
        int(getattr(os.fstat(fd), field))
        for field in FULL_IDENTITY_FIELDS)
    if before != expected_identity:
        raise OSError(errno.EIO, "%s held identity changed before read" % label)
    chunks = []
    offset = 0
    size = int(before[6])
    while offset < size:
        chunk = os.pread(fd, min(1024 * 1024, size - offset), offset)
        if not chunk:
            raise OSError(errno.EIO, "%s held fd has a short read" % label)
        chunks.append(chunk)
        offset += len(chunk)
    after = tuple(
        int(getattr(os.fstat(fd), field))
        for field in FULL_IDENTITY_FIELDS)
    if after != expected_identity:
        raise OSError(errno.EIO, "%s held identity changed during read" % label)
    return b"".join(chunks)


def legacy_identity_from_full(identity):
    return (
        identity[0],
        identity[1],
        identity[2],
        identity[6],
        identity[7],
        identity[8],
    )


def stable_full_file_snapshot(path, label, require_single_link=True):
    flags = os.O_RDONLY
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(path, flags)
    try:
        return stable_held_file_snapshot(
            fd,
            path,
            label,
            require_single_link=require_single_link,
        )
    finally:
        os.close(fd)


def canonical_output_path(path, label):
    if not path or "\n" in path or "\r" in path or "=" in path:
        raise OSError(errno.EINVAL, "%s path is empty or non-canonical" % label)
    absolute = os.path.abspath(path)
    parent = os.path.realpath(os.path.dirname(absolute))
    if not os.path.isdir(parent):
        raise OSError(errno.ENOTDIR, "%s parent is not a directory" % label)
    name = os.path.basename(absolute)
    if not name or name in (".", ".."):
        raise OSError(errno.EINVAL, "%s basename is invalid" % label)
    return os.path.join(parent, name)


def held_output_identity(label):
    path = output_paths[label]
    fd = output_fds[label]
    held = os.fstat(fd)
    path_stat = os.stat(path, follow_symlinks=False)
    if (not stat.S_ISREG(held.st_mode) or not stat.S_ISREG(path_stat.st_mode) or
            held.st_nlink != 1 or path_stat.st_nlink != 1 or
            held.st_dev != path_stat.st_dev or held.st_ino != path_stat.st_ino):
        raise OSError(errno.EIO, "%s path no longer names held single-link output" % label)
    return held


def held_output_digest(label):
    fd = output_fds[label]
    before = held_output_identity(label)
    digest = hashlib.sha256()
    offset = 0
    while offset < before.st_size:
        chunk = os.pread(fd, min(1024 * 1024, before.st_size - offset), offset)
        if not chunk:
            raise OSError(errno.EIO, "%s held output short read" % label)
        digest.update(chunk)
        offset += len(chunk)
    after = held_output_identity(label)
    if any(getattr(before, field) != getattr(after, field) for field in IDENTITY_FIELDS):
        raise OSError(errno.EIO, "%s changed during held output digest" % label)
    return digest.hexdigest(), after


def seal_held_output(label, permissions):
    fd = output_fds[label]
    before = held_output_identity(label)
    os.fsync(fd)
    os.fchmod(fd, permissions)
    os.fsync(fd)
    after = held_output_identity(label)
    if (
        before.st_dev != after.st_dev
        or before.st_ino != after.st_ino
        or before.st_size != after.st_size
        or stat.S_IMODE(after.st_mode) != permissions
    ):
        raise OSError(
            errno.EIO,
            "%s output did not seal on its original inode" % label)
    return after


def collect_tracked_output_evidence(require_complete):
    global tracked_output_evidence
    evidence = {}
    first_violation = None
    for label in sorted(tracked_outputs):
        spec = tracked_outputs[label]
        key = spec["fd_key"]
        initial_device, initial_inode = output_initial_identities[key]
        final_permissions = (
            0o500
            if spec["required_mode"] == "executable"
            else 0o400
        )
        final_mode = stat.S_IFREG | final_permissions
        identity = os.fstat(output_fds[key])
        size = int(identity.st_size)
        preseal_mode = int(identity.st_mode)
        seal_status = "not_attempted"
        status = "available_unvalidated"
        digest = ""
        try:
            identity = held_output_identity(key)
            size = int(identity.st_size)
            preseal_mode = int(identity.st_mode)
            if size > int(spec["max_bytes"]):
                status = "size_limit_exceeded"
                first_violation = first_violation or TrackedOutputViolation(
                    label, "tracked output exceeds size cap")
            else:
                if require_complete and size <= 0:
                    status = "required_nonempty_missing"
                    first_violation = first_violation or \
                        TrackedOutputViolation(
                            label, "tracked output is empty")
                elif (
                        require_complete and
                        spec["required_mode"] == "executable" and
                        int(identity.st_mode) & 0o111 == 0 and
                        "target_fd" not in spec):
                    status = "required_executable_mode_missing"
                    first_violation = first_violation or \
                        TrackedOutputViolation(
                            label, "tracked output is not executable")
                elif require_complete:
                    identity = seal_held_output(
                        key, final_permissions)
                    seal_status = "verified"
                    digest, identity = held_output_digest(key)
                    status = "verified"
                else:
                    digest, identity = held_output_digest(key)
        except OSError as exc:
            identity = os.fstat(output_fds[key])
            size = int(identity.st_size)
            preseal_mode = int(identity.st_mode)
            status = "identity_unavailable"
            seal_status = (
                "failed" if require_complete else "not_attempted"
            )
            first_violation = first_violation or TrackedOutputViolation(
                label, str(exc)
            )
        spec["status"] = status
        target_fd = int(spec.get("target_fd", 0))
        evidence[label] = {
            "path": spec["path"],
            "sha256": digest,
            "preopen_path_status": "absent_proved_by_o_excl",
            "open_device": int(initial_device),
            "open_inode": int(initial_inode),
            "device": int(identity.st_dev),
            "inode": int(identity.st_ino),
            "nlink": int(identity.st_nlink),
            "uid": int(identity.st_uid),
            "gid": int(identity.st_gid),
            "identity_stable": int(
                status != "identity_unavailable" and
                int(initial_device) == int(identity.st_dev) and
                int(initial_inode) == int(identity.st_ino)),
            "size": size,
            "mode": int(identity.st_mode),
            "mtime_ns": int(identity.st_mtime_ns),
            "ctime_ns": int(identity.st_ctime_ns),
            "open_mode": int(spec["open_mode"]),
            "preseal_mode": preseal_mode,
            "final_mode": final_mode,
            "seal_status": seal_status,
            "max_bytes": int(spec["max_bytes"]),
            "required_mode": spec["required_mode"],
            "status": status,
            "target_fd": target_fd,
            "target_fd_path": spec.get("target_fd_path", ""),
            "target_fd_authority_mode":
                spec.get("target_fd_authority_mode", "not_requested"),
            "target_fd_authority_selector":
                spec.get("target_fd_authority_selector", ""),
            "target_fd_authority_role":
                spec.get("target_fd_authority_role", ""),
            "target_fd_argv_count": 1 if target_fd else 0,
            "target_fd_argv_sha256":
                spec.get("target_fd_argv_sha256", ""),
            "target_fd_inheritance_status": (
                tracked_output_fd_inheritance_status
                if target_fd else "not_requested"
            ),
            "target_fd_identity_status": (
                "verified_held_single_link_output"
                if (
                    target_fd
                    and status == "verified"
                    and int(initial_device) == int(identity.st_dev)
                    and int(initial_inode) == int(identity.st_ino)
                )
                else (
                    "not_requested"
                    if not target_fd else "unverified"
                )
            ),
        }
    tracked_output_evidence = evidence
    if first_violation is not None:
        raise first_violation


class DarwinOutputPathHistoryMonitor:
    def __init__(self, label_fds):
        self.queue = select.kqueue()
        self.labels = {fd: label for label, fd in label_fds.items()}
        self.error = ""
        forbidden = (
            select.KQ_NOTE_DELETE |
            select.KQ_NOTE_RENAME |
            select.KQ_NOTE_LINK |
            select.KQ_NOTE_REVOKE
        )
        changes = [
            select.kevent(
                fd,
                filter=select.KQ_FILTER_VNODE,
                flags=select.KQ_EV_ADD | select.KQ_EV_ENABLE | select.KQ_EV_CLEAR,
                fflags=forbidden,
            )
            for fd in self.labels
        ]
        self.queue.control(changes, 0, 0)

    def verify(self):
        if self.error:
            raise OSError(errno.EIO, self.error)
        events = self.queue.control(None, max(1, len(self.labels)), 0)
        if events:
            event = events[0]
            label = self.labels.get(int(event.ident), "unknown")
            self.error = "output path history drifted label=%s fflags=0x%x" % (
                label, int(event.fflags))
            raise OSError(errno.EIO, self.error)

    def close(self):
        self.queue.close()


class LinuxOutputPathHistoryMonitor:
    IN_DELETE_SELF = 0x00000400
    IN_MOVE_SELF = 0x00000800
    IN_UNMOUNT = 0x00002000
    IN_Q_OVERFLOW = 0x00004000
    IN_IGNORED = 0x00008000

    def __init__(self, label_paths):
        self.libc = ctypes.CDLL(None, use_errno=True)
        self.libc.inotify_init1.argtypes = [ctypes.c_int]
        self.libc.inotify_init1.restype = ctypes.c_int
        self.libc.inotify_add_watch.argtypes = [
            ctypes.c_int, ctypes.c_char_p, ctypes.c_uint32]
        self.libc.inotify_add_watch.restype = ctypes.c_int
        self.fd = self.libc.inotify_init1(os.O_CLOEXEC | os.O_NONBLOCK)
        if self.fd < 0:
            value = ctypes.get_errno()
            raise OSError(value, os.strerror(value))
        self.labels = {}
        self.error = ""
        mask = (
            self.IN_DELETE_SELF |
            self.IN_MOVE_SELF |
            self.IN_UNMOUNT
        )
        try:
            for label, path in label_paths.items():
                wd = self.libc.inotify_add_watch(
                    self.fd, os.fsencode(path), ctypes.c_uint32(mask))
                if wd < 0:
                    value = ctypes.get_errno()
                    raise OSError(value, "%s: %s" % (label, os.strerror(value)))
                self.labels[wd] = label
        except BaseException:
            os.close(self.fd)
            self.fd = -1
            raise

    def verify(self):
        if self.error:
            raise OSError(errno.EIO, self.error)
        while True:
            try:
                payload = os.read(self.fd, 65536)
            except BlockingIOError:
                return
            if not payload:
                return
            offset = 0
            while offset + 16 <= len(payload):
                wd, mask, _cookie, name_len = struct.unpack_from("iIII", payload, offset)
                offset += 16 + name_len
                if mask & self.IN_Q_OVERFLOW:
                    self.error = "output path history event queue overflow"
                elif mask & (
                    self.IN_DELETE_SELF |
                    self.IN_MOVE_SELF |
                    self.IN_UNMOUNT |
                    self.IN_IGNORED
                ):
                    self.error = (
                        "output path history drifted label=%s mask=0x%x" %
                        (self.labels.get(wd, "unknown"), mask)
                    )
                if self.error:
                    raise OSError(errno.EIO, self.error)

    def close(self):
        if self.fd >= 0:
            os.close(self.fd)
            self.fd = -1


def create_output_path_history_monitor():
    if platform_is_darwin:
        return DarwinOutputPathHistoryMonitor(output_fds), "darwin_kqueue_vnode"
    if sys.platform.startswith("linux"):
        return (
            LinuxOutputPathHistoryMonitor(output_paths),
            "linux_inotify_hardlink_history_unsupported",
        )
    raise OSError(errno.ENOTSUP, "kernel output path history monitor unavailable")


def guard_output_cleanup_authority(info):
    return (
        int(info.st_dev),
        int(info.st_ino),
        int(info.st_mode),
        int(info.st_nlink),
        int(info.st_uid),
        int(info.st_gid),
    )


def guard_unlink_created_output(
    parent_fd,
    name,
    fd,
    created_authority,
    label,
):
    held = os.fstat(fd)
    try:
        named = os.stat(
            name,
            dir_fd=parent_fd,
            follow_symlinks=False,
        )
    except FileNotFoundError:
        raise OSError(
            errno.EIO,
            "%s cleanup output is missing" % label,
        )
    if (
        guard_output_cleanup_authority(held) != created_authority
        or guard_output_cleanup_authority(named) != created_authority
        or not stat.S_ISREG(named.st_mode)
    ):
        raise OSError(
            errno.EIO,
            "%s cleanup output identity drifted" % label,
        )
    os.unlink(name, dir_fd=parent_fd)


def prepare_output_artifacts():
    global report_path, stdout_path, stderr_path, resource_trace_path, phase_trace_path
    global output_path_history_monitor, output_path_history_monitor_kind
    global output_path_history_status, output_path_history_watch_count
    requested = [
        ("report", report_path),
        ("stdout", stdout_path),
        ("stderr", stderr_path),
    ]
    if resource_trace_path:
        requested.append(("resource_trace", resource_trace_path))
    if phase_trace_path:
        requested.append(("phase_trace", phase_trace_path))
    for label in sorted(tracked_outputs):
        requested.append(("tracked:%s" % label, tracked_outputs[label]["path"]))
    canonical = [(label, canonical_output_path(path, label)) for label, path in requested]
    if require_command_identity or require_precreated_output_authority:
        for (label, requested_path), (_, canonical_path) in zip(
                requested, canonical):
            if requested_path != canonical_path:
                raise OSError(
                    errno.EPERM,
                    "%s sealed output path is not exact" % label)
    canonical_paths = [path for _, path in canonical]
    if len(set(canonical_paths)) != len(canonical_paths):
        raise OSError(errno.EINVAL, "guard output paths are not distinct")
    created = []
    parent_fds = {}
    try:
        for label, path in canonical:
            parent = os.path.dirname(path)
            parent_fd = parent_fds.get(parent)
            if parent_fd is None:
                parent_flags = os.O_RDONLY
                if hasattr(os, "O_CLOEXEC"):
                    parent_flags |= os.O_CLOEXEC
                if hasattr(os, "O_DIRECTORY"):
                    parent_flags |= os.O_DIRECTORY
                if hasattr(os, "O_NOFOLLOW"):
                    parent_flags |= os.O_NOFOLLOW
                parent_fd = os.open(parent, parent_flags)
                parent_info = os.fstat(parent_fd)
                named_parent_info = os.stat(
                    parent,
                    follow_symlinks=False,
                )
                if (
                    not stat.S_ISDIR(parent_info.st_mode)
                    or guard_output_cleanup_authority(parent_info)
                    != guard_output_cleanup_authority(named_parent_info)
                ):
                    os.close(parent_fd)
                    raise OSError(
                        errno.EIO,
                        "%s output parent identity drifted" % label,
                    )
                parent_fds[parent] = parent_fd
            flags = os.O_RDWR | os.O_CREAT | os.O_EXCL
            if hasattr(os, "O_CLOEXEC"):
                flags |= os.O_CLOEXEC
            if hasattr(os, "O_NOFOLLOW"):
                flags |= os.O_NOFOLLOW
            fd = os.open(
                os.path.basename(path),
                flags,
                0o600,
                dir_fd=parent_fd,
            )
            held = os.fstat(fd)
            created_entry = [
                label,
                os.path.basename(path),
                fd,
                parent_fd,
                guard_output_cleanup_authority(held),
            ]
            created.append(created_entry)
            os.fchown(fd, os.geteuid(), os.getegid())
            created_entry[4] = guard_output_cleanup_authority(os.fstat(fd))
            os.fchmod(fd, 0o600)
            held = os.fstat(fd)
            created_entry[4] = guard_output_cleanup_authority(held)
            if (
                not stat.S_ISREG(held.st_mode)
                or held.st_nlink != 1
                or held.st_uid != os.geteuid()
                or held.st_gid != os.getegid()
                or stat.S_IMODE(held.st_mode) != 0o600
            ):
                raise OSError(
                    errno.EIO,
                    (
                        "%s output identity invalid: mode=%o nlink=%d "
                        "uid=%d expected_uid=%d gid=%d expected_gid=%d"
                    )
                    % (
                        label,
                        stat.S_IMODE(held.st_mode),
                        held.st_nlink,
                        held.st_uid,
                        os.geteuid(),
                        held.st_gid,
                        os.getegid(),
                    ),
                )
            output_fds[label] = fd
            output_paths[label] = path
            output_initial_identities[label] = (held.st_dev, held.st_ino)
        if (
            os.environ.get("BEAT_C_GUARD_SELF_TEST_MODE") == "1"
            and os.environ.get(
                "BEAT_C_GUARD_SELF_TEST_OUTPUT_CLEANUP_IDENTITY_DRIFT"
            )
            == "1"
        ):
            (
                _,
                report_name,
                _,
                report_parent_fd,
                _,
            ) = next(
                item for item in created if item[0] == "report"
            )
            retained_name = report_name + ".created-retained"
            os.rename(
                report_name,
                retained_name,
                src_dir_fd=report_parent_fd,
                dst_dir_fd=report_parent_fd,
            )
            foreign_fd = os.open(
                report_name,
                os.O_WRONLY
                | os.O_CREAT
                | os.O_EXCL
                | getattr(os, "O_CLOEXEC", 0)
                | getattr(os, "O_NOFOLLOW", 0),
                0o600,
                dir_fd=report_parent_fd,
            )
            try:
                if os.write(foreign_fd, b"foreign-path-owner\n") != 19:
                    raise OSError(
                        errno.EIO,
                        "self-test foreign output short write",
                    )
                os.fsync(foreign_fd)
                os.fchmod(foreign_fd, 0o600)
            finally:
                os.close(foreign_fd)
            raise OSError(
                errno.EIO,
                "self-test output cleanup identity drift",
            )
        identities = list(output_initial_identities.values())
        if len(set(identities)) != len(identities):
            raise OSError(errno.EIO, "guard output inodes are not distinct")
        report_path = output_paths["report"]
        stdout_path = output_paths["stdout"]
        stderr_path = output_paths["stderr"]
        resource_trace_path = output_paths.get("resource_trace", "")
        phase_trace_path = output_paths.get("phase_trace", "")
        for label in sorted(tracked_outputs):
            key = "tracked:%s" % label
            tracked_outputs[label]["path"] = output_paths[key]
            tracked_outputs[label]["fd_key"] = key
            tracked_outputs[label]["open_mode"] = \
                int(os.fstat(output_fds[key]).st_mode)
        (output_path_history_monitor,
         output_path_history_monitor_kind) = create_output_path_history_monitor()
        output_path_history_monitor.verify()
        output_path_history_status = (
            "unsupported_hardlink_history"
            if sys.platform.startswith("linux") else "armed")
        output_path_history_watch_count = len(output_fds)
        for parent_fd in parent_fds.values():
            os.close(parent_fd)
        parent_fds.clear()
    except BaseException:
        if output_path_history_monitor is not None:
            try:
                output_path_history_monitor.close()
            except OSError:
                pass
            output_path_history_monitor = None
        cleanup_error = None
        for label, name, fd, parent_fd, created_authority in reversed(created):
            try:
                guard_unlink_created_output(
                    parent_fd,
                    name,
                    fd,
                    created_authority,
                    label,
                )
            except OSError as exc:
                if cleanup_error is None:
                    cleanup_error = exc
            finally:
                try:
                    os.close(fd)
                except OSError:
                    pass
        for parent_fd in parent_fds.values():
            try:
                os.close(parent_fd)
            except OSError:
                pass
        output_fds.clear()
        output_paths.clear()
        output_initial_identities.clear()
        if cleanup_error is not None:
            raise cleanup_error
        raise


def prepare_tracked_output_fd_bindings():
    global tracked_output_fd_bindings
    global tracked_output_fd_argv_sha256
    global tracked_output_fd_inheritance_status
    bindings = parse_tracked_output_fd_bindings()
    for label, binding in bindings.items():
        key = tracked_outputs[label]["fd_key"]
        info = os.fstat(output_fds[key])
        binding["fd_key"] = key
        binding["source_identity"] = tuple(
            int(getattr(info, field))
            for field in SEALED_PLATFORM_IDENTITY_FIELDS
        )
        tracked_outputs[label]["target_fd"] = binding["fd"]
        tracked_outputs[label]["target_fd_path"] = binding["path"]
        tracked_outputs[label]["target_fd_authority_mode"] = (
            binding["authority_mode"]
        )
        tracked_outputs[label]["target_fd_authority_selector"] = (
            binding["authority_selector"]
        )
        tracked_outputs[label]["target_fd_authority_role"] = (
            binding["authority_role"]
        )
        tracked_outputs[label]["target_fd_argv_sha256"] = (
            binding["argv_sha256"]
        )
    tracked_output_fd_bindings = bindings
    tracked_output_fd_argv_sha256 = (
        command_argv_digest(cmd) if bindings else ""
    )
    tracked_output_fd_inheritance_status = (
        "pending_preexec" if bindings else "not_requested"
    )


def verify_all_output_identities():
    if output_path_history_monitor is None:
        raise OSError(errno.EIO, "output path history monitor is not armed")
    output_path_history_monitor.verify()
    for label in sorted(output_fds):
        held_output_identity(label)


def verify_support_output_identities():
    for label in sorted(output_fds):
        if not label.startswith("tracked:"):
            held_output_identity(label)


def stable_command_snapshot(path):
    _, digest, identity = stable_regular_file_snapshot(path, "command executable")
    return digest, identity


def command_self_image_full_identity(info):
    return tuple(
        int(getattr(info, field))
        for field in SEALED_PLATFORM_IDENTITY_FIELDS
    )


def command_self_image_fd_digest(fd, size):
    digest = hashlib.sha256()
    offset = 0
    while offset < size:
        chunk = os.pread(fd, min(1024 * 1024, size - offset), offset)
        if not chunk:
            raise OSError(
                errno.EIO, "command self-image fd has a short read")
        digest.update(chunk)
        offset += len(chunk)
    return digest.hexdigest()


def prepare_command_self_image_authority():
    global command_self_image_fd
    global command_self_image_source_fd
    global command_self_image_source_path
    global command_self_image_source_sha256
    global command_self_image_source_identity
    global command_self_image_argv_count
    global command_self_image_argv_sha256
    global command_self_image_authority_status
    global command_self_image_inheritance_status
    global command_self_image_identity_status
    global command_self_image_source_fd_close_status
    prefix = "--bootstrap-self-image-fd:"
    matching = [
        argument for argument in cmd
        if argument.startswith(prefix)
    ]
    if not command_self_image_fd_requested_text:
        if matching:
            raise OSError(
                errno.EPERM,
                "bootstrap self-image argv lacks guard authority")
        return
    private_snapshot_authority = (
        require_command_identity
        and command_execution_mode == "private_single_link_snapshot"
    )
    linux_direct_held_authority = (
        sys.platform.startswith("linux")
        and command_execution_mode == "direct"
        and require_precreated_output_authority
    )
    if (
        command_self_image_fd_requested_text != "198"
        or not (
            private_snapshot_authority
            or linux_direct_held_authority
        )
        or matching not in (
            [],
            [prefix + command_self_image_fd_requested_text],
        )
        or not cmd
        or (
            matching
            and cmd[-1] != prefix + command_self_image_fd_requested_text
        )
    ):
        raise OSError(
            errno.EPERM,
            "command self-image fd authority is not exact")
    requested_fd = int(command_self_image_fd_requested_text)
    flags = os.O_RDONLY
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    opened_source_fd = os.open(command_snapshot_path, flags)
    try:
        source_fd = fcntl.fcntl(
            opened_source_fd,
            fcntl.F_DUPFD_CLOEXEC,
            256,
        )
    finally:
        os.close(opened_source_fd)
    try:
        before = os.fstat(source_fd)
        named = os.stat(
            command_snapshot_path, follow_symlinks=False)
        before_identity = command_self_image_full_identity(before)
        named_identity = command_self_image_full_identity(named)
        if (
            before_identity != named_identity
            or not stat.S_ISREG(before.st_mode)
            or before.st_nlink != 1
            or before.st_uid != os.geteuid()
            or before.st_mode & 0o222
            or before.st_mode & 0o111 == 0
            or before.st_mode & (stat.S_ISUID | stat.S_ISGID)
            or int(before.st_dev) != command_snapshot_device
            or int(before.st_ino) != command_snapshot_inode
            or int(before.st_size) != command_snapshot_size
        ):
            raise OSError(
                errno.EPERM,
                "command self-image source identity is not the snapshot")
        digest = command_self_image_fd_digest(
            source_fd, int(before.st_size))
        after = os.fstat(source_fd)
        if (
            command_self_image_full_identity(after) != before_identity
            or digest != command_snapshot_sha256
        ):
            raise OSError(
                errno.EIO,
                "command self-image source changed during binding")
    except BaseException:
        os.close(source_fd)
        raise
    command_self_image_fd = requested_fd
    command_self_image_source_fd = source_fd
    command_self_image_source_path = command_snapshot_path
    command_self_image_source_sha256 = digest
    command_self_image_source_identity = before_identity
    command_self_image_argv_count = len(matching)
    command_self_image_argv_sha256 = command_argv_digest(cmd)
    command_self_image_authority_status = "verified_snapshot_fd_held"
    command_self_image_inheritance_status = "pending_preexec"
    command_self_image_identity_status = "verified_held_snapshot"
    command_self_image_source_fd_close_status = "pending_postwait"


def verify_command_self_image_authority():
    global command_self_image_source_fd
    global command_self_image_authority_status
    global command_self_image_identity_status
    global command_self_image_source_fd_close_status
    if not command_self_image_fd:
        return
    if (
        command_self_image_source_fd < 0
        or command_self_image_source_identity is None
        or command_self_image_inheritance_status
            != "verified_preexec_exact"
    ):
        raise OSError(
            errno.EIO, "command self-image authority is incomplete")
    held = os.fstat(command_self_image_source_fd)
    named = os.stat(
        command_self_image_source_path, follow_symlinks=False)
    held_identity = command_self_image_full_identity(held)
    if (
        held_identity != command_self_image_source_identity
        or command_self_image_full_identity(named) != held_identity
        or command_self_image_fd_digest(
            command_self_image_source_fd, int(held.st_size))
            != command_self_image_source_sha256
        or command_self_image_source_sha256
            != command_snapshot_sha256
    ):
        raise OSError(
            errno.EIO, "command self-image authority drifted")
    command_self_image_authority_status = (
        "verified_snapshot_fd_held_through_terminal"
    )
    command_self_image_identity_status = (
        "verified_snapshot_child_preexec_and_terminal"
    )
    command_self_image_source_fd_close_status = (
        "deferred_to_monitor_process_exit"
    )


def write_all(fd, data):
    offset = 0
    while offset < len(data):
        written = os.write(fd, data[offset:])
        if written <= 0:
            raise OSError(errno.EIO, "command snapshot write failed")
        offset += written


def materialize_command_snapshot(
        source_path,
        expected_digest,
        expected_identity,
        source_fd=-1,
        expected_full_identity=None):
    if source_fd >= 0:
        source_digest, source_full_identity = stable_held_file_snapshot(
            source_fd,
            source_path,
            "command executable",
        )
        if source_full_identity != expected_full_identity:
            raise OSError(
                errno.EIO,
                "command executable held authority identity differs",
            )
        source_identity = legacy_identity_from_full(source_full_identity)
        source_data = held_file_bytes(
            source_fd,
            source_full_identity,
            "command executable",
        )
    else:
        source_data, source_digest, source_identity = \
            stable_regular_file_snapshot(
                source_path, "command executable", with_data=True)
    if source_digest != expected_digest or source_identity != expected_identity:
        raise OSError(errno.EIO, "command executable changed before private snapshot")
    output_parent = os.path.dirname(os.path.abspath(report_path))
    snapshot_directory = tempfile.mkdtemp(prefix=".beat-c-command.", dir=output_parent)
    os.chown(snapshot_directory, os.geteuid(), os.getegid())
    os.chmod(snapshot_directory, 0o700)
    snapshot_path = os.path.join(snapshot_directory, "command.snapshot")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(snapshot_path, flags, 0o500)
    try:
        os.fchown(fd, os.geteuid(), os.getegid())
        os.fchmod(fd, 0o500)
        write_all(fd, source_data)
        os.fsync(fd)
        os.fchmod(fd, 0o500)
        snapshot_stat = os.fstat(fd)
        if (
            not stat.S_ISREG(snapshot_stat.st_mode)
            or stat.S_IMODE(snapshot_stat.st_mode) != 0o500
            or snapshot_stat.st_nlink != 1
            or snapshot_stat.st_uid != os.geteuid()
            or snapshot_stat.st_gid != os.getegid()
        ):
            raise OSError(
                errno.EIO,
                "command private snapshot identity is invalid",
            )
    finally:
        os.close(fd)
    snapshot_data, snapshot_digest, snapshot_identity = stable_regular_file_snapshot(
        snapshot_path, "command private snapshot", with_data=True)
    if snapshot_data != source_data or snapshot_digest != expected_digest:
        raise OSError(errno.EIO, "command private snapshot bytes mismatch")
    if snapshot_identity[3] != expected_identity[3]:
        raise OSError(errno.EIO, "command private snapshot size mismatch")
    return snapshot_path, snapshot_digest, snapshot_identity


class DarwinAttrList(ctypes.Structure):
    _fields_ = [
        ("bitmapcount", ctypes.c_uint16),
        ("reserved", ctypes.c_uint16),
        ("commonattr", ctypes.c_uint32),
        ("volattr", ctypes.c_uint32),
        ("dirattr", ctypes.c_uint32),
        ("fileattr", ctypes.c_uint32),
        ("forkattr", ctypes.c_uint32),
    ]


DARWIN_ATTR_BIT_MAP_COUNT = 5
DARWIN_ATTR_VOL_CAPABILITIES = 0x00020000
DARWIN_VOL_CAP_FMT_SEALED = 0x02000000
DARWIN_VOL_CAPABILITIES_BUFFER_SIZE = 36
def canonical_string_vector_digest(domain, values):
    payload = bytearray(command_text_frame(domain))
    payload.extend(struct.pack(">I", len(values)))
    for value in values:
        payload.extend(command_text_frame(os.fsencode(value)))
    return hashlib.sha256(payload).hexdigest()


def monitor_absent_parent_identity_digest():
    payload = bytearray(command_text_frame(
        b"cheng.guard.monitor_python_absent_parent"))
    payload.extend(command_text_frame(
        os.fsencode(MONITOR_ABSENT_SYS_PATH_PARENT)))
    for value in early_absent_parent_identity:
        payload.extend(struct.pack(">Q", value))
    return hashlib.sha256(payload).hexdigest()


def verify_monitor_absent_path_watch(final=False):
    global monitor_python_absent_path_status
    global monitor_python_absent_parent_watch_status
    if not platform_is_darwin:
        return
    if early_absent_path_queue is None or early_absent_parent_fd < 0:
        raise OSError(
            errno.EIO,
            "monitor Python absent-path parent watch is not armed")
    if (
        os.environ.get("BEAT_C_GUARD_SELF_TEST_MODE") == "1"
        and os.environ.get(
            "BEAT_C_GUARD_SELF_TEST_FORCE_MONITOR_ABSENT_PATH_EVENT") == "1"
    ):
        raise OSError(
            errno.EIO,
            "monitor Python absent-path parent watch observed a mutation")
    events = early_absent_path_queue.control(None, 8, 0)
    if events:
        raise OSError(
            errno.EIO,
            "monitor Python absent-path parent watch observed fflags=0x%x" %
            int(events[0].fflags))
    try:
        os.lstat(MONITOR_ABSENT_SYS_PATH)
    except FileNotFoundError:
        pass
    else:
        raise OSError(
            errno.EEXIST,
            "monitor Python negative sys.path artifact appeared")
    held = os.fstat(early_absent_parent_fd)
    named = os.stat(
        MONITOR_ABSENT_SYS_PATH_PARENT, follow_symlinks=False)
    held_identity = tuple(
        int(getattr(held, field))
        for field in MONITOR_ABSENT_PARENT_IDENTITY_FIELDS)
    named_identity = tuple(
        int(getattr(named, field))
        for field in MONITOR_ABSENT_PARENT_IDENTITY_FIELDS)
    if (
        held_identity != early_absent_parent_identity
        or named_identity != early_absent_parent_identity
    ):
        raise OSError(
            errno.EIO,
            "monitor Python absent-path parent identity drifted")
    monitor_python_absent_path_status = "verified_absent"
    monitor_python_absent_parent_watch_status = (
        "verified_clean" if final else "armed_clean")


def darwin_root_volume_attestation():
    if not platform_is_darwin:
        raise OSError(
            errno.ENOTSUP,
            "sealed system-volume direct execution requires Darwin")
    attributes = DarwinAttrList()
    attributes.bitmapcount = DARWIN_ATTR_BIT_MAP_COUNT
    attributes.volattr = DARWIN_ATTR_VOL_CAPABILITIES
    buffer = ctypes.create_string_buffer(
        DARWIN_VOL_CAPABILITIES_BUFFER_SIZE)
    libc = ctypes.CDLL(None, use_errno=True)
    getattrlist = getattr(libc, "getattrlist", None)
    if getattrlist is None:
        raise OSError(errno.ENOSYS, "Darwin getattrlist is unavailable")
    getattrlist.argtypes = [
        ctypes.c_char_p,
        ctypes.POINTER(DarwinAttrList),
        ctypes.c_void_p,
        ctypes.c_size_t,
        ctypes.c_ulong,
    ]
    getattrlist.restype = ctypes.c_int
    if getattrlist(
        b"/",
        ctypes.byref(attributes),
        ctypes.byref(buffer),
        ctypes.sizeof(buffer),
        0,
    ) != 0:
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error), "/")
    values = struct.unpack("=I8I", buffer.raw)
    if values[0] != DARWIN_VOL_CAPABILITIES_BUFFER_SIZE:
        raise OSError(
            errno.EIO,
            "Darwin root volume capability length is not exact")
    format_capabilities = int(values[1])
    format_capabilities_valid = int(values[5])
    if (
        os.environ.get("BEAT_C_GUARD_SELF_TEST_MODE") == "1"
        and os.environ.get(
            "BEAT_C_GUARD_SELF_TEST_FORCE_SSV_UNSEALED") == "1"
    ):
        format_capabilities &= ~DARWIN_VOL_CAP_FMT_SEALED
    if (
        format_capabilities_valid & DARWIN_VOL_CAP_FMT_SEALED == 0
        or format_capabilities & DARWIN_VOL_CAP_FMT_SEALED == 0
    ):
        raise OSError(
            errno.EPERM,
            "Darwin root volume lacks a valid sealed capability")
    root_stat = os.stat("/", follow_symlinks=False)
    read_only = bool(os.statvfs("/").f_flag & os.ST_RDONLY)
    if (
        os.environ.get("BEAT_C_GUARD_SELF_TEST_MODE") == "1"
        and os.environ.get(
            "BEAT_C_GUARD_SELF_TEST_FORCE_SSV_WRITABLE") == "1"
    ):
        read_only = False
    if not read_only:
        raise OSError(errno.EROFS, "Darwin sealed root volume is not read-only")
    return {
        "root_device": int(root_stat.st_dev),
        "format_capabilities": format_capabilities,
        "format_capabilities_valid": format_capabilities_valid,
        "sealed": 1,
        "read_only": 1,
    }


def command_qualifies_sealed_platform_direct(path):
    if not platform_is_darwin:
        return False
    if (
        not path.startswith("/usr/bin/")
        and not path.startswith("/bin/")
    ):
        return False
    if os.path.realpath(path) != path:
        return False
    try:
        info = os.stat(path, follow_symlinks=False)
        if (
            not stat.S_ISREG(info.st_mode)
            or info.st_nlink < 1
            or info.st_mode & 0o111 == 0
        ):
            return False
        volume = darwin_root_volume_attestation()
    except OSError:
        return False
    return int(info.st_dev) == volume["root_device"]


def command_single_link_required(path):
    if command_execution_mode == "sealed_system_volume_direct":
        return False
    return not command_qualifies_sealed_platform_direct(path)


def prepare_sealed_system_volume_direct(
        path, digest, identity):
    global sealed_system_volume_status
    global sealed_system_volume_root_path
    global sealed_system_volume_root_device
    global sealed_system_volume_format_capabilities
    global sealed_system_volume_format_capabilities_valid
    global sealed_system_volume_sealed
    global sealed_system_volume_read_only
    global sealed_system_volume_platform_path
    global sealed_system_volume_platform_sha256
    global sealed_system_volume_platform_device
    global sealed_system_volume_platform_inode
    global sealed_system_volume_platform_mode
    global sealed_system_volume_platform_nlink
    global sealed_system_volume_platform_uid
    global sealed_system_volume_platform_gid
    global sealed_system_volume_platform_size
    global sealed_system_volume_platform_mtime_ns
    global sealed_system_volume_platform_ctime_ns
    global sealed_system_volume_platform_identity_tuple
    if not monitor_python_explicit:
        raise OSError(
            errno.EPERM,
            "Darwin formal execution requires explicit monitor Python")
    if (
        not path.startswith("/usr/bin/")
        and not path.startswith("/bin/")
    ):
        raise OSError(
            errno.EPERM,
            "sealed system-volume command is outside /usr/bin or /bin")
    if os.path.realpath(path) != path:
        raise OSError(
            errno.ELOOP,
            "sealed system-volume command path is not its real path")
    info = os.stat(path, follow_symlinks=False)
    full_identity = tuple(
        getattr(info, field) for field in SEALED_PLATFORM_IDENTITY_FIELDS)
    base_identity = (
        info.st_dev,
        info.st_ino,
        info.st_mode,
        info.st_size,
        info.st_mtime_ns,
        info.st_ctime_ns,
    )
    if base_identity != identity:
        raise OSError(
            errno.EIO,
            "sealed system-volume command identity changed before attestation")
    observed_mode = info.st_mode
    if (
        os.environ.get("BEAT_C_GUARD_SELF_TEST_MODE") == "1"
        and os.environ.get(
            "BEAT_C_GUARD_SELF_TEST_FORCE_SSV_NONEXECUTABLE") == "1"
    ):
        observed_mode &= ~0o111
    if (
        not stat.S_ISREG(observed_mode)
        or info.st_nlink < 1
        or observed_mode & 0o111 == 0
    ):
        raise OSError(
            errno.EPERM,
            "sealed system-volume command is not a regular executable")
    volume = darwin_root_volume_attestation()
    platform_device = int(info.st_dev)
    if (
        os.environ.get("BEAT_C_GUARD_SELF_TEST_MODE") == "1"
        and os.environ.get(
            "BEAT_C_GUARD_SELF_TEST_FORCE_SSV_DEVICE_MISMATCH") == "1"
    ):
        platform_device += 1
    if platform_device != volume["root_device"]:
        raise OSError(
            errno.EXDEV,
            "sealed system-volume command is not on the root volume")
    sealed_system_volume_status = "verified"
    sealed_system_volume_root_path = "/"
    sealed_system_volume_root_device = volume["root_device"]
    sealed_system_volume_format_capabilities = volume[
        "format_capabilities"]
    sealed_system_volume_format_capabilities_valid = volume[
        "format_capabilities_valid"]
    sealed_system_volume_sealed = volume["sealed"]
    sealed_system_volume_read_only = volume["read_only"]
    sealed_system_volume_platform_path = path
    sealed_system_volume_platform_sha256 = digest
    sealed_system_volume_platform_device = int(info.st_dev)
    sealed_system_volume_platform_inode = int(info.st_ino)
    sealed_system_volume_platform_mode = int(info.st_mode)
    sealed_system_volume_platform_nlink = int(info.st_nlink)
    sealed_system_volume_platform_uid = int(info.st_uid)
    sealed_system_volume_platform_gid = int(info.st_gid)
    sealed_system_volume_platform_size = int(info.st_size)
    sealed_system_volume_platform_mtime_ns = int(info.st_mtime_ns)
    sealed_system_volume_platform_ctime_ns = int(info.st_ctime_ns)
    sealed_system_volume_platform_identity_tuple = full_identity
    prepare_darwin_seatbelt_exact_exec(path, volume["root_device"])


def darwin_seatbelt_parameters_digest(parameters):
    payload = bytearray(command_text_frame(
        b"cheng.guard.darwin_seatbelt_parameters"))
    payload.extend(struct.pack(">I", len(parameters)))
    for name, value in parameters:
        payload.extend(command_text_frame(name.encode("ascii")))
        payload.extend(command_text_frame(os.fsencode(value)))
    return hashlib.sha256(payload).hexdigest()


def prepare_darwin_seatbelt_exact_exec(allowed_exec_path, root_device):
    global darwin_seatbelt_exact_exec_status
    global darwin_seatbelt_launcher_path
    global darwin_seatbelt_launcher_sha256
    global darwin_seatbelt_launcher_device
    global darwin_seatbelt_launcher_inode
    global darwin_seatbelt_launcher_mode
    global darwin_seatbelt_launcher_nlink
    global darwin_seatbelt_launcher_uid
    global darwin_seatbelt_launcher_gid
    global darwin_seatbelt_launcher_size
    global darwin_seatbelt_launcher_mtime_ns
    global darwin_seatbelt_launcher_ctime_ns
    global darwin_seatbelt_launcher_identity_tuple
    global darwin_seatbelt_profile
    global darwin_seatbelt_profile_sha256
    global darwin_seatbelt_allowed_exec_path
    global darwin_seatbelt_parameters
    global darwin_seatbelt_parameter_count
    global darwin_seatbelt_parameter_sha256
    global darwin_seatbelt_allowed_output_count
    if (
        os.environ.get("BEAT_C_GUARD_SELF_TEST_MODE") == "1"
        and os.environ.get(
            "BEAT_C_GUARD_SELF_TEST_FORCE_SEATBELT_DISABLED") == "1"
    ):
        raise OSError(
            errno.EPERM,
            "Darwin Seatbelt exact-exec capability is disabled")
    launcher = "/usr/bin/sandbox-exec"
    if os.path.realpath(launcher) != launcher:
        raise OSError(
            errno.ELOOP,
            "Darwin Seatbelt launcher path is not its real path")
    _, digest, identity = stable_regular_file_snapshot(
        launcher, "Darwin Seatbelt launcher")
    info = os.stat(launcher, follow_symlinks=False)
    full_identity = tuple(
        int(getattr(info, field))
        for field in SEALED_PLATFORM_IDENTITY_FIELDS)
    base_identity = (
        info.st_dev,
        info.st_ino,
        info.st_mode,
        info.st_size,
        info.st_mtime_ns,
        info.st_ctime_ns,
    )
    if (
        base_identity != identity
        or not stat.S_ISREG(info.st_mode)
        or info.st_nlink != 1
        or info.st_mode & 0o111 == 0
        or int(info.st_dev) != root_device
    ):
        raise OSError(
            errno.EPERM,
            "Darwin Seatbelt launcher lacks sealed platform identity")
    parameters = [("CHENG_GUARD_EXECUTABLE", allowed_exec_path)]
    for index, label in enumerate(sorted(tracked_outputs)):
        parameters.append((
            "CHENG_GUARD_OUTPUT_%d" % index,
            tracked_outputs[label].get(
                "target_fd_path",
                tracked_outputs[label]["path"],
            ),
        ))
    if (
        os.environ.get("BEAT_C_GUARD_SELF_TEST_MODE") == "1"
        and os.environ.get(
            "BEAT_C_GUARD_SELF_TEST_FORCE_SEATBELT_DUPLICATE_PARAMETER") == "1"
    ):
        parameters.append(("CHENG_GUARD_EXECUTABLE", allowed_exec_path))
    parameter_names = [name for name, _value in parameters]
    if len(set(parameter_names)) != len(parameter_names):
        raise OSError(
            errno.EINVAL,
            "Darwin Seatbelt parameter name is duplicated")
    for name, value in parameters:
        if (
            not name
            or any(
                not (character.isupper() or character.isdigit()
                     or character == "_")
                for character in name)
            or not value
            or "\0" in value
        ):
            raise OSError(
                errno.EINVAL,
                "Darwin Seatbelt parameter is not canonical")
    profile_lines = [
        "(version 1)",
        (
            "(define CHENG_GUARD_EXECUTABLE_VALUE "
            "(param \"CHENG_GUARD_EXECUTABLE\"))"
        ),
    ]
    for index in range(len(tracked_outputs)):
        profile_lines.append(
            "(define CHENG_GUARD_OUTPUT_%d_VALUE "
            "(param \"CHENG_GUARD_OUTPUT_%d\"))" % (index, index))
    profile_lines.extend([
        "(allow default)",
        "(deny process-exec)",
        "(deny process-fork)",
        "(deny file-write*)",
        (
            "(allow process-exec "
            "(literal CHENG_GUARD_EXECUTABLE_VALUE))"
        ),
    ])
    for index in range(len(tracked_outputs)):
        profile_lines.append(
            "(allow file-write* "
            "(literal CHENG_GUARD_OUTPUT_%d_VALUE))" % index)
    profile = "\n".join(profile_lines) + "\n"
    darwin_seatbelt_exact_exec_status = "verified"
    darwin_seatbelt_launcher_path = launcher
    darwin_seatbelt_launcher_sha256 = digest
    darwin_seatbelt_launcher_device = int(info.st_dev)
    darwin_seatbelt_launcher_inode = int(info.st_ino)
    darwin_seatbelt_launcher_mode = int(info.st_mode)
    darwin_seatbelt_launcher_nlink = int(info.st_nlink)
    darwin_seatbelt_launcher_uid = int(info.st_uid)
    darwin_seatbelt_launcher_gid = int(info.st_gid)
    darwin_seatbelt_launcher_size = int(info.st_size)
    darwin_seatbelt_launcher_mtime_ns = int(info.st_mtime_ns)
    darwin_seatbelt_launcher_ctime_ns = int(info.st_ctime_ns)
    darwin_seatbelt_launcher_identity_tuple = full_identity
    darwin_seatbelt_profile = profile
    darwin_seatbelt_profile_sha256 = hashlib.sha256(
        profile.encode("utf-8")).hexdigest()
    darwin_seatbelt_allowed_exec_path = allowed_exec_path
    darwin_seatbelt_parameters = tuple(parameters)
    darwin_seatbelt_parameter_count = len(parameters)
    darwin_seatbelt_parameter_sha256 = \
        darwin_seatbelt_parameters_digest(parameters)
    darwin_seatbelt_allowed_output_count = len(tracked_outputs)


def verify_darwin_seatbelt_exact_exec(expected_exec_path):
    _, launcher_digest, launcher_identity = stable_regular_file_snapshot(
        darwin_seatbelt_launcher_path,
        "Darwin Seatbelt launcher")
    launcher_info = os.stat(
        darwin_seatbelt_launcher_path, follow_symlinks=False)
    launcher_full_identity = tuple(
        int(getattr(launcher_info, field))
        for field in SEALED_PLATFORM_IDENTITY_FIELDS)
    if (
        darwin_seatbelt_exact_exec_status != "verified"
        or darwin_seatbelt_allowed_exec_path != expected_exec_path
        or hashlib.sha256(
            darwin_seatbelt_profile.encode("utf-8")).hexdigest()
            != darwin_seatbelt_profile_sha256
        or len(darwin_seatbelt_parameters)
            != darwin_seatbelt_parameter_count
        or len({name for name, _value in darwin_seatbelt_parameters})
            != darwin_seatbelt_parameter_count
        or darwin_seatbelt_parameters_digest(
            darwin_seatbelt_parameters)
            != darwin_seatbelt_parameter_sha256
        or launcher_digest != darwin_seatbelt_launcher_sha256
        or launcher_identity != (
            darwin_seatbelt_launcher_device,
            darwin_seatbelt_launcher_inode,
            darwin_seatbelt_launcher_mode,
            darwin_seatbelt_launcher_size,
            darwin_seatbelt_launcher_mtime_ns,
            darwin_seatbelt_launcher_ctime_ns,
        )
        or launcher_full_identity
            != darwin_seatbelt_launcher_identity_tuple
    ):
        raise OSError(
            errno.EIO,
            "Darwin Seatbelt exact-exec identity drifted")


def verify_sealed_system_volume_direct():
    if command_execution_mode != "sealed_system_volume_direct":
        return
    volume = darwin_root_volume_attestation()
    if (
        volume["root_device"] != sealed_system_volume_root_device
        or volume["format_capabilities"]
            != sealed_system_volume_format_capabilities
        or volume["format_capabilities_valid"]
            != sealed_system_volume_format_capabilities_valid
        or volume["sealed"] != sealed_system_volume_sealed
        or volume["read_only"] != sealed_system_volume_read_only
    ):
        raise OSError(
            errno.EIO,
            "Darwin sealed root volume attestation drifted")
    _, digest, identity = stable_regular_file_snapshot(
        sealed_system_volume_platform_path,
        "sealed system-volume platform command")
    info = os.stat(
        sealed_system_volume_platform_path, follow_symlinks=False)
    full_identity = tuple(
        getattr(info, field) for field in SEALED_PLATFORM_IDENTITY_FIELDS)
    if (
        os.environ.get("BEAT_C_GUARD_SELF_TEST_MODE") == "1"
        and os.environ.get(
            "BEAT_C_GUARD_SELF_TEST_FORCE_SSV_IDENTITY_DRIFT") == "1"
    ):
        full_identity = (*full_identity[:-1], full_identity[-1] + 1)
    if (
        digest != sealed_system_volume_platform_sha256
        or identity != command_identity_tuple
        or full_identity != sealed_system_volume_platform_identity_tuple
    ):
        raise OSError(
            errno.EIO,
            "sealed system-volume platform command identity drifted")
    verify_darwin_seatbelt_exact_exec(
        sealed_system_volume_platform_path)


def stable_tree_closure(root, label):
    entries = []
    for directory, directory_names, file_names in os.walk(root, topdown=True, followlinks=False):
        directory_names.sort()
        file_names.sort()
        for name in directory_names:
            path = os.path.join(directory, name)
            if os.path.islink(path):
                raise OSError(errno.ELOOP, "%s contains a directory symlink" % label)
        for name in file_names:
            path = os.path.join(directory, name)
            if os.path.islink(path):
                raise OSError(errno.ELOOP, "%s contains a file symlink" % label)
            relative = os.path.relpath(path, root).replace(os.sep, "/")
            _, digest, identity = stable_regular_file_snapshot(path, "%s file" % label)
            entries.append((relative, digest, identity))
    entries.sort(key=lambda entry: os.fsencode(entry[0]))
    payload = bytearray()
    payload.extend(command_text_frame(b"cheng.guard.file_closure"))
    payload.extend(struct.pack(">I", len(entries)))
    for relative, digest, identity in entries:
        payload.extend(command_text_frame(os.fsencode(relative)))
        payload.extend(bytes.fromhex(digest))
        payload.extend(struct.pack(">Q", int(identity[3])))
    return entries, hashlib.sha256(payload).hexdigest()


def verify_canonical_directory_ancestry(root):
    if (
        not os.path.isabs(root)
        or os.path.normpath(root) != root
        or os.path.realpath(root) != root
    ):
        raise OSError(
            errno.ELOOP,
            "private frozen-tree root is not an absolute canonical path")
    current = root
    while True:
        info = os.lstat(current)
        if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
            raise OSError(
                errno.ELOOP,
                "private frozen-tree root ancestry is not canonical")
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent


def private_frozen_tree_closure(root):
    verify_canonical_directory_ancestry(root)
    entries = []

    def walk_error(exc):
        raise exc

    for directory, directory_names, file_names in os.walk(
            root, topdown=True, onerror=walk_error, followlinks=False):
        directory_names.sort(key=os.fsencode)
        file_names.sort(key=os.fsencode)
        directory_info = os.lstat(directory)
        if (
            stat.S_ISLNK(directory_info.st_mode)
            or not stat.S_ISDIR(directory_info.st_mode)
        ):
            raise OSError(
                errno.EINVAL,
                "private frozen tree contains a non-directory walk node")
        relative_directory = os.path.relpath(
            directory, root).replace(os.sep, "/")
        directory_identity = tuple(
            int(getattr(directory_info, field))
            for field in SEALED_PLATFORM_IDENTITY_FIELDS)
        entries.append((
            relative_directory,
            "directory",
            "",
            directory_identity,
        ))
        for name in directory_names:
            path = os.path.join(directory, name)
            info = os.lstat(path)
            if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
                raise OSError(
                    errno.ELOOP,
                    "private frozen tree contains a directory symlink "
                    "or special node")
        for name in file_names:
            path = os.path.join(directory, name)
            info = os.lstat(path)
            if stat.S_ISLNK(info.st_mode):
                raise OSError(
                    errno.ELOOP,
                    "private frozen tree contains a file symlink")
            if not stat.S_ISREG(info.st_mode):
                raise OSError(
                    errno.EINVAL,
                    "private frozen tree contains a special node")
            if info.st_nlink != 1:
                raise OSError(
                    errno.EMLINK,
                    "private frozen tree contains a hard-linked file")
            _data, digest, base_identity = stable_regular_file_snapshot(
                path, "private frozen-tree file")
            named = os.lstat(path)
            named_base_identity = tuple(
                int(getattr(named, field)) for field in IDENTITY_FIELDS)
            if base_identity != named_base_identity:
                raise OSError(
                    errno.EIO,
                    "private frozen-tree file identity changed")
            full_identity = tuple(
                int(getattr(named, field))
                for field in SEALED_PLATFORM_IDENTITY_FIELDS)
            relative = os.path.relpath(
                path, root).replace(os.sep, "/")
            entries.append((
                relative,
                "regular",
                digest,
                full_identity,
            ))
    entries.sort(key=lambda entry: (
        os.fsencode(entry[0]),
        0 if entry[1] == "directory" else 1,
    ))
    payload = bytearray(command_text_frame(
        b"cheng.guard.private_frozen_tree_closure"))
    payload.extend(struct.pack(">I", len(entries)))
    for relative, kind, digest, identity in entries:
        payload.extend(command_text_frame(os.fsencode(relative)))
        payload.extend(command_text_frame(kind.encode("ascii")))
        payload.extend(struct.pack(
            ">QQQQQ",
            int(identity[2]),
            int(identity[3]),
            int(identity[4]),
            int(identity[5]),
            int(identity[6]),
        ))
        payload.extend(
            bytes.fromhex(digest) if digest else b"\0" * 32)
    return tuple(entries), hashlib.sha256(payload).hexdigest()


class DarwinPrivateFrozenTreeMonitor:
    FORBIDDEN_FFLAGS = (
        (
            select.KQ_NOTE_WRITE |
            select.KQ_NOTE_DELETE |
            select.KQ_NOTE_EXTEND |
            select.KQ_NOTE_ATTRIB |
            select.KQ_NOTE_LINK |
            select.KQ_NOTE_RENAME |
            select.KQ_NOTE_REVOKE
        )
        if platform_is_darwin else 0
    )

    def __init__(self, root, entries):
        if not platform_is_darwin:
            raise OSError(
                errno.ENOTSUP,
                "private frozen-tree direct execution requires Darwin")
        self.root = root
        self.queue = select.kqueue()
        self.nodes = []
        self.regular_attrib_event_count = 0
        try:
            for relative, kind, _digest, identity in entries:
                path = (
                    root if relative == "."
                    else os.path.join(root, *relative.split("/"))
                )
                flags = os.O_RDONLY | os.O_CLOEXEC
                if kind == "directory":
                    flags |= os.O_DIRECTORY
                if hasattr(os, "O_NOFOLLOW"):
                    flags |= os.O_NOFOLLOW
                descriptor = os.open(path, flags)
                held = os.fstat(descriptor)
                held_identity = tuple(
                    int(getattr(held, field))
                    for field in SEALED_PLATFORM_IDENTITY_FIELDS)
                if held_identity != identity:
                    os.close(descriptor)
                    raise OSError(
                        errno.EIO,
                        "private frozen-tree vnode changed during watch arm")
                self.nodes.append(
                    (path, kind, descriptor, identity))
            if not self.nodes:
                raise OSError(
                    errno.EIO,
                    "private frozen-tree vnode set is empty")
            changes = [
                select.kevent(
                    descriptor,
                    filter=select.KQ_FILTER_VNODE,
                    flags=(
                        select.KQ_EV_ADD |
                        select.KQ_EV_ENABLE |
                        select.KQ_EV_CLEAR),
                    fflags=self.FORBIDDEN_FFLAGS,
                )
                for _path, _kind, descriptor, _identity in self.nodes
            ]
            self.queue.control(changes, 0, 0)
        except BaseException:
            self.close()
            raise

    def verify(self):
        if (
            os.environ.get("BEAT_C_GUARD_SELF_TEST_MODE") == "1"
            and os.environ.get(
                "BEAT_C_GUARD_SELF_TEST_FORCE_FROZEN_TREE_EVENT") == "1"
        ):
            raise OSError(
                errno.EIO,
                "private frozen-tree directory watch observed a mutation")
        events = self.queue.control(
            None, max(1, len(self.nodes)), 0)
        for event in events:
            event_path = "<unknown>"
            event_kind = "unknown"
            for path, kind, descriptor, _identity in self.nodes:
                if descriptor == int(event.ident):
                    event_path = path
                    event_kind = kind
                    break
            if (
                event_kind == "regular"
                and int(event.fflags) == select.KQ_NOTE_ATTRIB
            ):
                self.regular_attrib_event_count += 1
                continue
            raise OSError(
                errno.EIO,
                "private frozen-tree vnode watch observed "
                "kind=%s path=%s fflags=0x%x" % (
                    event_kind,
                    event_path,
                    int(event.fflags),
                ))
        for path, kind, descriptor, identity in self.nodes:
            held = os.fstat(descriptor)
            named = os.stat(path, follow_symlinks=False)
            held_identity = tuple(
                int(getattr(held, field))
                for field in SEALED_PLATFORM_IDENTITY_FIELDS)
            named_identity = tuple(
                int(getattr(named, field))
                for field in SEALED_PLATFORM_IDENTITY_FIELDS)
            if held_identity != identity or named_identity != identity:
                raise OSError(
                    errno.EIO,
                    "private frozen-tree %s identity drifted" % kind)
        return self.regular_attrib_event_count

    def close(self):
        for _path, _kind, descriptor, _identity in getattr(
                self, "nodes", ()):
            try:
                os.close(descriptor)
            except OSError:
                pass
        self.nodes = []
        queue = getattr(self, "queue", None)
        if queue is not None:
            try:
                queue.close()
            except OSError:
                pass
            self.queue = None


def prepare_private_frozen_tree_direct(path, digest, identity):
    global private_frozen_tree_status
    global private_frozen_tree_root
    global private_frozen_tree_expected_sha256
    global private_frozen_tree_sha256
    global private_frozen_tree_entry_count
    global private_frozen_tree_directory_count
    global private_frozen_tree_file_count
    global private_frozen_tree_entries
    global private_frozen_tree_monitor
    global private_frozen_tree_watch_status
    global private_frozen_tree_watch_count
    global private_frozen_tree_precheck_status
    global private_frozen_tree_ssv_launcher_status
    global private_frozen_tree_ssv_root_device
    global private_frozen_tree_ssv_root_sealed
    global private_frozen_tree_ssv_root_read_only
    if not platform_is_darwin:
        raise OSError(
            errno.ENOTSUP,
            "private frozen-tree direct execution requires Darwin")
    if not monitor_python_explicit:
        raise OSError(
            errno.EPERM,
            "Darwin formal execution requires explicit monitor Python")
    verify_canonical_directory_ancestry(frozen_tree_root_requested)
    if (
        not os.path.isabs(path)
        or os.path.realpath(path) != path
        or os.path.commonpath((frozen_tree_root_requested, path))
            != frozen_tree_root_requested
        or path == frozen_tree_root_requested
    ):
        raise OSError(
            errno.EPERM,
            "private frozen-tree command is outside the exact tree root")
    entries, closure_digest = private_frozen_tree_closure(
        frozen_tree_root_requested)
    if closure_digest != expected_frozen_tree_sha256:
        raise OSError(
            errno.EPERM,
            "private frozen-tree closure digest differs from required digest")
    relative_command = os.path.relpath(
        path, frozen_tree_root_requested).replace(os.sep, "/")
    command_entries = [
        entry for entry in entries
        if entry[0] == relative_command and entry[1] == "regular"
    ]
    command_info = os.stat(path, follow_symlinks=False)
    command_full_identity = tuple(
        int(getattr(command_info, field))
        for field in SEALED_PLATFORM_IDENTITY_FIELDS)
    if (
        len(command_entries) != 1
        or command_entries[0][2] != digest
        or command_entries[0][3] != command_full_identity
        or command_info.st_nlink != 1
        or command_info.st_mode & 0o111 == 0
        or identity != (
            command_info.st_dev,
            command_info.st_ino,
            command_info.st_mode,
            command_info.st_size,
            command_info.st_mtime_ns,
            command_info.st_ctime_ns,
        )
    ):
        raise OSError(
            errno.EPERM,
            "private frozen-tree command is not its single-link "
            "executable closure member")
    monitor = DarwinPrivateFrozenTreeMonitor(
        frozen_tree_root_requested, entries)
    try:
        monitor.verify()
        armed_entries, armed_digest = private_frozen_tree_closure(
            frozen_tree_root_requested)
        monitor.verify()
        if armed_entries != entries or armed_digest != closure_digest:
            raise OSError(
                errno.EIO,
                "private frozen-tree closure changed during watch arm")
        volume = darwin_root_volume_attestation()
        prepare_darwin_seatbelt_exact_exec(
            path, volume["root_device"])
    except BaseException:
        monitor.close()
        raise
    private_frozen_tree_status = "verified"
    private_frozen_tree_root = frozen_tree_root_requested
    private_frozen_tree_expected_sha256 = expected_frozen_tree_sha256
    private_frozen_tree_sha256 = closure_digest
    private_frozen_tree_entry_count = len(entries)
    private_frozen_tree_directory_count = sum(
        1 for entry in entries if entry[1] == "directory")
    private_frozen_tree_file_count = sum(
        1 for entry in entries if entry[1] == "regular")
    private_frozen_tree_entries = entries
    private_frozen_tree_monitor = monitor
    private_frozen_tree_watch_status = "armed_clean"
    private_frozen_tree_watch_count = len(monitor.nodes)
    private_frozen_tree_precheck_status = "verified"
    private_frozen_tree_ssv_launcher_status = "verified"
    private_frozen_tree_ssv_root_device = volume["root_device"]
    private_frozen_tree_ssv_root_sealed = volume["sealed"]
    private_frozen_tree_ssv_root_read_only = volume["read_only"]
    ready_path = os.environ.get(
        "BEAT_C_GUARD_SELF_TEST_FROZEN_TREE_READY_FILE", "")
    if (
        os.environ.get("BEAT_C_GUARD_SELF_TEST_MODE") == "1"
        and ready_path
    ):
        ready_fd = os.open(
            ready_path,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC,
            0o600,
        )
        try:
            write_all(ready_fd, b"armed\n")
            os.fsync(ready_fd)
        finally:
            os.close(ready_fd)


def verify_private_frozen_tree_direct(final=True):
    global private_frozen_tree_precheck_status
    global private_frozen_tree_watch_status
    global private_frozen_tree_postcheck_status
    global private_frozen_tree_attrib_event_status
    global private_frozen_tree_attrib_event_count
    if command_execution_mode != "private_frozen_tree_direct":
        return
    if private_frozen_tree_monitor is None:
        raise OSError(
            errno.EIO,
            "private frozen-tree directory watch is not armed")
    verify_canonical_directory_ancestry(private_frozen_tree_root)
    private_frozen_tree_monitor.verify()
    entries, closure_digest = private_frozen_tree_closure(
        private_frozen_tree_root)
    private_frozen_tree_attrib_event_count = \
        private_frozen_tree_monitor.verify()
    volume = darwin_root_volume_attestation()
    if (
        private_frozen_tree_status != "verified"
        or private_frozen_tree_precheck_status != "verified"
        or entries != private_frozen_tree_entries
        or len(entries) != private_frozen_tree_entry_count
        or closure_digest != private_frozen_tree_sha256
        or closure_digest != private_frozen_tree_expected_sha256
        or len(private_frozen_tree_monitor.nodes)
            != private_frozen_tree_entry_count
        or volume["root_device"] != private_frozen_tree_ssv_root_device
        or volume["sealed"] != private_frozen_tree_ssv_root_sealed
        or volume["read_only"] != private_frozen_tree_ssv_root_read_only
    ):
        raise OSError(
            errno.EIO,
            "private frozen-tree closure or SSV launcher authority drifted")
    verify_darwin_seatbelt_exact_exec(command_path)
    private_frozen_tree_watch_status = (
        "verified_clean" if final else "armed_clean")
    if final:
        private_frozen_tree_postcheck_status = "verified"
        private_frozen_tree_attrib_event_status = (
            "verified_regular_only_sealed_identity_unchanged"
            if private_frozen_tree_attrib_event_count > 0
            else "verified_not_observed")
    else:
        private_frozen_tree_precheck_status = "verified"
        private_frozen_tree_attrib_event_status = (
            "armed_regular_only_sealed_identity_unchanged"
            if private_frozen_tree_attrib_event_count > 0
            else "armed_not_observed")


def loaded_dyld_inventory():
    if not platform_is_darwin:
        empty_payload = bytearray(command_text_frame(
            b"cheng.guard.darwin_dyld_images"))
        empty_payload.extend(struct.pack(">I", 0))
        empty_shared = bytearray(command_text_frame(
            b"cheng.guard.darwin_shared_cache_images"))
        empty_shared.extend(struct.pack(">I", 0))
        return (
            (),
            hashlib.sha256(empty_payload).hexdigest(),
            (),
            hashlib.sha256(empty_shared).hexdigest(),
            "",
        )
    libc = ctypes.CDLL(None)
    image_count = getattr(libc, "_dyld_image_count", None)
    image_name = getattr(libc, "_dyld_get_image_name", None)
    shared_contains = getattr(
        libc, "_dyld_shared_cache_contains_path", None)
    shared_uuid = getattr(libc, "_dyld_get_shared_cache_uuid", None)
    if (
        image_count is None
        or image_name is None
        or shared_contains is None
        or shared_uuid is None
    ):
        raise OSError(errno.ENOSYS, "Darwin dyld image inventory is unavailable")
    image_count.argtypes = []
    image_count.restype = ctypes.c_uint32
    image_name.argtypes = [ctypes.c_uint32]
    image_name.restype = ctypes.c_char_p
    shared_contains.argtypes = [ctypes.c_char_p]
    shared_contains.restype = ctypes.c_bool
    shared_uuid.argtypes = [ctypes.c_void_p]
    shared_uuid.restype = ctypes.c_bool
    uuid_buffer = (ctypes.c_ubyte * 16)()
    if not shared_uuid(uuid_buffer):
        raise OSError(errno.EIO, "Darwin shared-cache UUID is unavailable")
    uuid = bytes(uuid_buffer).hex()
    rows = []
    for index in range(int(image_count())):
        raw = image_name(index)
        if not raw:
            raise OSError(errno.EIO, "Darwin dyld image name is empty")
        path = os.fsdecode(raw)
        if not os.path.isabs(path):
            raise OSError(
                errno.EINVAL, "Darwin dyld image path is not absolute")
        if shared_contains(raw):
            rows.append((path, "sealed_shared_cache", uuid, "", "", 0, ()))
            continue
        resolved = os.path.realpath(path)
        if not os.path.isfile(resolved):
            raise OSError(
                errno.ENOENT,
                "non-shared-cache dyld image lacks an artifact: %s" % path)
        _, digest, identity = stable_regular_file_snapshot(
            resolved, "monitor dyld image")
        info = os.stat(resolved, follow_symlinks=False)
        full_identity = tuple(
            int(getattr(info, field))
            for field in SEALED_PLATFORM_IDENTITY_FIELDS)
        base_identity = (
            info.st_dev,
            info.st_ino,
            info.st_mode,
            info.st_size,
            info.st_mtime_ns,
            info.st_ctime_ns,
        )
        if base_identity != identity:
            raise OSError(
                errno.EIO,
                "monitor dyld image identity changed during inventory")
        rows.append((
            path,
            "regular",
            "",
            resolved,
            digest,
            int(info.st_size),
            full_identity,
        ))
    rows.sort(key=lambda item: (os.fsencode(item[0]), item[1]))
    payload = bytearray(command_text_frame(
        b"cheng.guard.darwin_dyld_images"))
    payload.extend(struct.pack(">I", len(rows)))
    shared_payload = bytearray(command_text_frame(
        b"cheng.guard.darwin_shared_cache_images"))
    shared_rows = [
        item for item in rows if item[1] == "sealed_shared_cache"]
    shared_payload.extend(struct.pack(">I", len(shared_rows)))
    for row in rows:
        path, kind, row_uuid, resolved, digest, size, full_identity = row
        payload.extend(command_text_frame(os.fsencode(path)))
        payload.extend(command_text_frame(kind.encode("ascii")))
        if kind == "sealed_shared_cache":
            payload.extend(bytes.fromhex(row_uuid))
        else:
            payload.extend(command_text_frame(os.fsencode(resolved)))
            payload.extend(bytes.fromhex(digest))
            payload.extend(struct.pack(">Q", size))
            for value in full_identity:
                payload.extend(struct.pack(">Q", value))
    for path, _kind, row_uuid, _resolved, _digest, _size, _identity in \
            shared_rows:
        shared_payload.extend(command_text_frame(os.fsencode(path)))
        shared_payload.extend(command_text_frame(
            b"sealed_shared_cache"))
        shared_payload.extend(bytes.fromhex(row_uuid))
    return (
        tuple(rows),
        hashlib.sha256(payload).hexdigest(),
        tuple(shared_rows),
        hashlib.sha256(shared_payload).hexdigest(),
        uuid,
    )


def monitor_runtime_closure():
    physical_paths = {
        os.path.realpath(sys.executable),
        monitor_runtime_script_path,
    }
    for module in tuple(sys.modules.values()):
        if module is None:
            continue
        module_spec = getattr(module, "__spec__", None)
        if getattr(module_spec, "origin", None) == "frozen":
            continue
        for attribute in ("__file__", "__cached__"):
            raw = getattr(module, attribute, None)
            if not raw:
                continue
            if os.fsdecode(raw) == sys.argv[0]:
                physical_paths.add(monitor_runtime_script_path)
                continue
            path = os.path.realpath(os.fsdecode(raw))
            if os.path.isfile(path):
                physical_paths.add(path)
    (
        dyld_rows,
        dyld_digest,
        shared_rows,
        shared_digest,
        shared_uuid,
    ) = loaded_dyld_inventory()
    for row in dyld_rows:
        if row[1] == "regular":
            physical_paths.add(row[3])
    entries = []
    for path in sorted(physical_paths, key=os.fsencode):
        _, digest, identity = stable_regular_file_snapshot(
            path, "monitor runtime artifact")
        info = os.stat(path, follow_symlinks=False)
        full_identity = tuple(
            int(getattr(info, field))
            for field in SEALED_PLATFORM_IDENTITY_FIELDS)
        base_identity = (
            info.st_dev,
            info.st_ino,
            info.st_mode,
            info.st_size,
            info.st_mtime_ns,
            info.st_ctime_ns,
        )
        if base_identity != identity:
            raise OSError(
                errno.EIO,
                "monitor runtime artifact identity changed during inventory")
        entries.append((path, digest, full_identity))
    payload = bytearray()
    payload.extend(command_text_frame(b"cheng.guard.monitor_runtime_physical"))
    payload.extend(struct.pack(">I", len(entries)))
    for path, digest, full_identity in entries:
        payload.extend(command_text_frame(os.fsencode(path)))
        payload.extend(bytes.fromhex(digest))
        for value in full_identity:
            payload.extend(struct.pack(">Q", value))
    return (
        tuple(entries),
        hashlib.sha256(payload).hexdigest(),
        dyld_rows,
        dyld_digest,
        shared_rows,
        shared_digest,
        shared_uuid,
    )


def prepare_inherited_guard_authorities():
    global guard_authority_path
    global guard_authority_sha256
    global guard_authority_device
    global guard_authority_inode
    global guard_authority_mode
    global guard_authority_nlink
    global guard_authority_uid
    global guard_authority_gid
    global guard_authority_size
    global guard_authority_mtime_ns
    global guard_authority_ctime_ns
    global guard_authority_identity_tuple
    global guard_authority_status
    global monitor_python_authority_status
    if not inherited_authority_mode:
        if any((
            guard_authority_fd,
            command_authority_fd,
            monitor_python_authority_fd,
            guard_authority_path_requested,
            guard_authority_expected_sha256,
            command_authority_expected_sha256,
            monitor_python_authority_expected_sha256,
        )):
            raise OSError(
                errno.EPERM,
                "inherited authority fields require the exact authority mode",
            )
        return
    if (
        guard_authority_fd != 8
        or command_authority_fd != 6
        or monitor_python_authority_fd != 7
        or MONITOR_RUNTIME_HELD_FD != 9
        or not os.path.isabs(guard_authority_path_requested)
        or os.path.realpath(guard_authority_path_requested)
            != guard_authority_path_requested
        or any(
            len(value) != 64
            or any(character not in "0123456789abcdef" for character in value)
            for value in (
                guard_authority_expected_sha256,
                command_authority_expected_sha256,
                monitor_python_authority_expected_sha256,
            )
        )
    ):
        raise OSError(errno.EPERM, "inherited authority tuple is not exact")
    guard_digest, guard_identity = stable_held_file_snapshot(
        guard_authority_fd,
        guard_authority_path_requested,
        "process-tree guard",
    )
    if guard_digest != guard_authority_expected_sha256:
        raise OSError(errno.EPERM, "process-tree guard authority digest differs")
    guard_authority_path = guard_authority_path_requested
    guard_authority_sha256 = guard_digest
    (
        guard_authority_device,
        guard_authority_inode,
        guard_authority_mode,
        guard_authority_nlink,
        guard_authority_uid,
        guard_authority_gid,
        guard_authority_size,
        guard_authority_mtime_ns,
        guard_authority_ctime_ns,
    ) = guard_identity
    guard_authority_identity_tuple = guard_identity
    guard_authority_status = "verified_held_fd8"

    actual_python = os.path.realpath(sys.executable)
    python_digest, _python_identity = stable_held_file_snapshot(
        monitor_python_authority_fd,
        actual_python,
        "monitor Python",
    )
    if python_digest != monitor_python_authority_expected_sha256:
        raise OSError(errno.EPERM, "monitor Python authority digest differs")
    monitor_python_authority_status = "verified_held_fd7"


def prepare_monitor_identity():
    global monitor_python_path, monitor_python_sha256, monitor_python_device
    global monitor_python_inode, monitor_python_size, monitor_python_mtime_ns
    global monitor_python_ctime_ns, monitor_python_identity_tuple
    global monitor_python_mode, monitor_python_nlink
    global monitor_python_uid, monitor_python_gid
    global monitor_python_full_identity_tuple
    global monitor_psutil_path, monitor_psutil_sha256, monitor_psutil_device
    global monitor_psutil_inode, monitor_psutil_size, monitor_psutil_mtime_ns
    global monitor_psutil_ctime_ns, monitor_psutil_identity_tuple
    global monitor_psutil_closure_root, monitor_psutil_closure_count
    global monitor_psutil_closure_sha256, monitor_psutil_closure_entries
    global monitor_runtime_physical_count
    global monitor_runtime_physical_sha256
    global monitor_runtime_physical_entries
    global monitor_runtime_dyld_image_count
    global monitor_runtime_dyld_image_sha256
    global monitor_runtime_dyld_image_entries
    global monitor_runtime_shared_cache_image_count
    global monitor_runtime_shared_cache_image_sha256
    global monitor_runtime_shared_cache_uuid
    global monitor_python_startup_flags_status
    global monitor_python_preappend_sys_path_count
    global monitor_python_preappend_sys_path_sha256
    global monitor_python_absent_path
    global monitor_python_absent_path_status
    global monitor_python_absent_path_parent
    global monitor_python_absent_parent_watch_status
    global monitor_python_absent_parent_identity_sha256
    global monitor_runtime_script_path
    global monitor_runtime_script_sha256
    global monitor_runtime_script_device
    global monitor_runtime_script_inode
    global monitor_runtime_script_mode
    global monitor_runtime_script_nlink
    global monitor_runtime_script_uid
    global monitor_runtime_script_gid
    global monitor_runtime_script_size
    global monitor_runtime_script_mtime_ns
    global monitor_runtime_script_ctime_ns
    global monitor_runtime_script_identity_tuple
    global monitor_runtime_script_fd
    global monitor_runtime_script_invocation_status
    global monitor_runtime_script_stage_expected_sha256
    global monitor_runtime_script_builtin_sha256
    global monitor_runtime_script_expected_sha_match
    prepare_inherited_guard_authorities()
    for flag_name, required_value in MONITOR_REQUIRED_FLAG_VALUES.items():
        if getattr(sys.flags, flag_name) != required_value:
            raise OSError(
                errno.EPERM,
                "monitor Python startup flag is not isolated: %s" %
                flag_name)
    if (
        (
            MONITOR_SAFE_PATH_OBSERVED == "not_exposed"
            and "safe_path" in dir(sys.flags)
        )
        or (
            MONITOR_SAFE_PATH_OBSERVED == "1"
            and (
                "safe_path" not in dir(sys.flags)
                or sys.flags.safe_path is not True
            )
        )
    ):
        raise OSError(
            errno.EPERM,
            "monitor Python safe_path flag is inconsistent")
    monitor_python_startup_flags_status = "verified"
    if (
        platform_is_darwin
        and MONITOR_EFFECTIVE_SYS_PATH
            != MONITOR_BASE_SYS_PATH + (MONITOR_PSUTIL_SITE_PACKAGES,)
    ):
        raise OSError(
            errno.EPERM,
            "Darwin monitor Python sys.path is not the exact fixed vector")
    monitor_python_preappend_sys_path_count = len(MONITOR_BASE_SYS_PATH)
    monitor_python_preappend_sys_path_sha256 = \
        canonical_string_vector_digest(
            b"cheng.guard.monitor_python_preappend_sys_path",
            MONITOR_BASE_SYS_PATH)
    runtime_script_requested = os.environ[
        "BEAT_C_GUARD_MONITOR_RUNTIME_SCRIPT"]
    runtime_script_stage_expected = os.environ[
        "BEAT_C_GUARD_EXPECTED_MONITOR_RUNTIME_SHA256"]
    runtime_script_builtin = os.environ[
        "BEAT_C_GUARD_MONITOR_RUNTIME_BUILTIN_SHA256"]
    requested_runtime_script_fd = MONITOR_RUNTIME_HELD_FD
    if (
        requested_runtime_script_fd != 9
        or os.path.realpath(runtime_script_requested)
            != runtime_script_requested
        or sys.argv[0] != runtime_script_requested
        or runtime_script_stage_expected not in (
            "", runtime_script_builtin)
    ):
        raise OSError(
            errno.EPERM,
            "monitor runtime script invocation is not exact")
    monitor_runtime_script_fd = requested_runtime_script_fd
    runtime_script_digest, runtime_script_identity = \
        stable_held_runtime_script_snapshot(
            monitor_runtime_script_fd, runtime_script_requested)
    if (
        runtime_script_digest != MONITOR_RUNTIME_BYTES_SHA256
        or runtime_script_identity != MONITOR_RUNTIME_PREIDENTITY
        or runtime_script_digest
            != (runtime_script_stage_expected or runtime_script_builtin)
    ):
        raise OSError(
            errno.EIO,
            "monitor runtime script loader binding drifted")
    monitor_runtime_script_path = runtime_script_requested
    monitor_runtime_script_sha256 = runtime_script_digest
    monitor_runtime_script_device = runtime_script_identity[0]
    monitor_runtime_script_inode = runtime_script_identity[1]
    monitor_runtime_script_mode = runtime_script_identity[2]
    monitor_runtime_script_nlink = runtime_script_identity[3]
    monitor_runtime_script_uid = runtime_script_identity[4]
    monitor_runtime_script_gid = runtime_script_identity[5]
    monitor_runtime_script_size = runtime_script_identity[6]
    monitor_runtime_script_mtime_ns = runtime_script_identity[7]
    monitor_runtime_script_ctime_ns = runtime_script_identity[8]
    monitor_runtime_script_identity_tuple = runtime_script_identity
    monitor_runtime_script_invocation_status = \
        "verified_o_nofollow_loader_fd9"
    monitor_runtime_script_stage_expected_sha256 = \
        runtime_script_stage_expected
    monitor_runtime_script_builtin_sha256 = runtime_script_builtin
    monitor_runtime_script_expected_sha_match = int(
        runtime_script_digest == runtime_script_builtin
        and runtime_script_stage_expected in (
            "", runtime_script_builtin))
    if platform_is_darwin:
        monitor_python_absent_path = MONITOR_ABSENT_SYS_PATH
        monitor_python_absent_path_parent = MONITOR_ABSENT_SYS_PATH_PARENT
        monitor_python_absent_parent_identity_sha256 = \
            monitor_absent_parent_identity_digest()
        monitor_python_absent_path_status = "verifying"
        monitor_python_absent_parent_watch_status = "arming"
        verify_monitor_absent_path_watch()
    if platform_is_darwin and require_command_identity \
            and not monitor_python_explicit:
        raise OSError(
            errno.EPERM,
            "Darwin formal execution requires explicit monitor Python")
    requested_raw = os.environ["BEAT_C_GUARD_MONITOR_PYTHON_REQUESTED"]
    requested = os.path.realpath(requested_raw)
    if (
        platform_is_darwin
        and require_command_identity
        and requested != requested_raw
    ):
        raise OSError(
            errno.ELOOP,
            "Darwin formal monitor Python path is not its real path")
    actual = os.path.realpath(sys.executable)
    if requested != actual:
        raise OSError(errno.EIO, "monitor Python requested/actual path mismatch")
    if inherited_authority_mode:
        python_digest, python_full_identity = stable_held_file_snapshot(
            monitor_python_authority_fd,
            actual,
            "monitor Python",
        )
        python_identity = legacy_identity_from_full(python_full_identity)
    else:
        python_digest, python_identity = stable_command_snapshot(actual)
        python_full_identity = (
            python_identity[0],
            python_identity[1],
            python_identity[2],
            int(os.stat(actual, follow_symlinks=False).st_nlink),
            int(os.stat(actual, follow_symlinks=False).st_uid),
            int(os.stat(actual, follow_symlinks=False).st_gid),
            python_identity[3],
            python_identity[4],
            python_identity[5],
        )
    if (
        platform_is_darwin
        and python_digest != MONITOR_PYTHON_EXPECTED_SHA256
    ):
        raise OSError(
            errno.EPERM,
            "monitor Python executable digest is not authorized")
    monitor_python_path = actual
    monitor_python_sha256 = python_digest
    monitor_python_device = int(python_identity[0])
    monitor_python_inode = int(python_identity[1])
    monitor_python_mode = int(python_full_identity[2])
    monitor_python_nlink = int(python_full_identity[3])
    monitor_python_uid = int(python_full_identity[4])
    monitor_python_gid = int(python_full_identity[5])
    monitor_python_size = int(python_identity[3])
    monitor_python_mtime_ns = int(python_identity[4])
    monitor_python_ctime_ns = int(python_identity[5])
    monitor_python_identity_tuple = python_identity
    monitor_python_full_identity_tuple = python_full_identity
    if psutil is not None and getattr(psutil, "__file__", None):
        psutil_path = os.path.realpath(psutil.__file__)
        if (
            platform_is_darwin
            and not psutil_path.startswith(
                MONITOR_PSUTIL_SITE_PACKAGES + os.sep)
        ):
            raise OSError(
                errno.EPERM,
                "Darwin monitor psutil is outside the fixed site-packages root")
        _, psutil_digest, psutil_identity = stable_regular_file_snapshot(
            psutil_path, "psutil module")
        monitor_psutil_path = psutil_path
        monitor_psutil_sha256 = psutil_digest
        monitor_psutil_device = int(psutil_identity[0])
        monitor_psutil_inode = int(psutil_identity[1])
        monitor_psutil_size = int(psutil_identity[3])
        monitor_psutil_mtime_ns = int(psutil_identity[4])
        monitor_psutil_ctime_ns = int(psutil_identity[5])
        monitor_psutil_identity_tuple = psutil_identity
        closure_root = os.path.dirname(psutil_path)
        closure_entries, closure_digest = stable_tree_closure(
            closure_root, "psutil closure")
        if not closure_entries:
            raise OSError(errno.EIO, "psutil closure is empty")
        monitor_psutil_closure_root = closure_root
        monitor_psutil_closure_count = len(closure_entries)
        monitor_psutil_closure_sha256 = closure_digest
        monitor_psutil_closure_entries = closure_entries
    linux_procfs_provider_preflight()
    (
        runtime_entries,
        runtime_digest,
        dyld_rows,
        dyld_digest,
        shared_rows,
        shared_cache_digest,
        shared_cache_uuid,
    ) = monitor_runtime_closure()
    monitor_runtime_physical_count = len(runtime_entries)
    monitor_runtime_physical_sha256 = runtime_digest
    monitor_runtime_physical_entries = runtime_entries
    monitor_runtime_dyld_image_count = len(dyld_rows)
    monitor_runtime_dyld_image_sha256 = dyld_digest
    monitor_runtime_dyld_image_entries = dyld_rows
    monitor_runtime_shared_cache_image_count = len(shared_rows)
    monitor_runtime_shared_cache_image_sha256 = shared_cache_digest
    monitor_runtime_shared_cache_uuid = shared_cache_uuid


def prepare_command_identity():
    global command_identity_status, command_identity_error, command_path, command_sha256
    global command_device, command_inode, command_size, command_mtime_ns, command_ctime_ns
    global command_mode, command_nlink, command_uid, command_gid
    global command_authority_status, command_full_identity_tuple
    global command_argv_count, command_argv_sha256, command_identity_tuple
    global command_snapshot_path, command_snapshot_sha256, command_snapshot_device
    global command_snapshot_inode, command_snapshot_size, command_snapshot_mtime_ns
    global command_snapshot_ctime_ns, command_snapshot_identity_tuple
    global command_snapshot_mode, command_snapshot_nlink
    global command_snapshot_uid, command_snapshot_gid
    global command_snapshot_full_identity_tuple
    global target_env, target_env_count, target_env_sha256
    global target_env_requested, target_env_requested_count
    global target_env_requested_sha256
    if not cmd or not cmd[0]:
        raise OSError(errno.EINVAL, "command argv is empty")
    if require_command_identity and (
            not expected_command_path or not expected_command_sha256):
        raise OSError(
            errno.EINVAL, "formal command identity binding is incomplete")
    if bool(expected_command_path) != bool(expected_command_sha256):
        raise OSError(errno.EINVAL, "expected command binding is incomplete")
    if expected_command_path:
        if command_execution_mode not in (
            "private_single_link_snapshot",
            "sealed_system_volume_direct",
            "private_frozen_tree_direct",
        ):
            raise OSError(
                errno.EPERM,
                "expected command binding lacks a formal execution capability")
        if os.path.realpath(expected_command_path) == "/usr/bin/env":
            raise OSError(errno.EPERM, "environment command wrapper is forbidden")
    requested_command_path = cmd[0]
    if command_execution_mode in (
        "sealed_system_volume_direct",
        "private_frozen_tree_direct",
    ):
        if (
            not os.path.isabs(requested_command_path)
            or requested_command_path != expected_command_path
            or os.path.realpath(requested_command_path)
                != requested_command_path
        ):
            raise OSError(
                errno.EPERM,
                "formal direct command path is not exact")
    resolved = requested_command_path
    if "/" not in resolved:
        resolved = shutil.which(resolved, path=os.environ.get("PATH")) or ""
    if not resolved:
        raise OSError(errno.ENOENT, "command executable not found")
    resolved = os.path.realpath(resolved)
    if not os.path.isabs(resolved):
        raise OSError(errno.EINVAL, "command executable path is not absolute")
    if expected_command_path:
        expected_resolved = os.path.realpath(expected_command_path)
        if resolved != expected_resolved:
            raise OSError(
                errno.EPERM,
                "command executable path differs from required path")
    if inherited_authority_mode:
        if command_authority_fd != 6:
            raise OSError(errno.EPERM, "command authority fd is not exact")
        digest, full_identity = stable_held_file_snapshot(
            command_authority_fd,
            resolved,
            "command executable",
            require_single_link=command_single_link_required(resolved),
        )
        if digest != command_authority_expected_sha256:
            raise OSError(
                errno.EPERM,
                "command held authority digest differs from caller binding",
            )
        identity = legacy_identity_from_full(full_identity)
        command_authority_status = "verified_held_fd6"
    else:
        digest, identity = stable_command_snapshot(resolved)
        full_digest, full_identity = stable_full_file_snapshot(
            resolved,
            "command executable",
            require_single_link=command_single_link_required(resolved),
        )
        if full_digest != digest:
            raise OSError(errno.EIO, "command full identity digest differs")
    if expected_command_sha256 and digest != expected_command_sha256:
        raise OSError(
            errno.EPERM,
            "command executable digest differs from required digest")
    cmd[0] = resolved
    command_path = resolved
    command_sha256 = digest
    command_device = int(identity[0])
    command_inode = int(identity[1])
    command_mode = int(full_identity[2])
    command_nlink = int(full_identity[3])
    command_uid = int(full_identity[4])
    command_gid = int(full_identity[5])
    command_size = int(identity[3])
    command_mtime_ns = int(identity[4])
    command_ctime_ns = int(identity[5])
    command_argv_count = len(cmd)
    command_argv_sha256 = command_argv_digest(cmd)
    target_env_requested = scrubbed_target_env()
    target_env_requested_count, target_env_requested_sha256 = target_env_digest(
        target_env_requested)
    target_env = dict(target_env_requested)
    target_env["BEAT_C_GUARD_PARENT_CAPABILITY"] = (
        target_env_injected_parent_capability)
    target_env["BEAT_C_GUARD_PARENT_MONITOR_PID"] = str(
        target_env_injected_parent_monitor_pid)
    target_env["BEAT_C_GUARD_PARENT_LIMIT_BYTES"] = str(
        target_env_injected_parent_limit_bytes)
    target_env["BEAT_C_GUARD_PARENT_PROOF_FD"] = str(
        target_env_injected_parent_proof_fd)
    target_env_count, target_env_sha256 = target_env_digest(target_env)
    command_identity_tuple = identity
    command_full_identity_tuple = full_identity
    if command_execution_mode == "private_single_link_snapshot":
        snapshot_path, snapshot_digest, snapshot_identity = materialize_command_snapshot(
            command_path,
            command_sha256,
            command_identity_tuple,
            source_fd=command_authority_fd if inherited_authority_mode else -1,
            expected_full_identity=command_full_identity_tuple,
        )
    elif command_execution_mode == "sealed_system_volume_direct":
        prepare_sealed_system_volume_direct(
            command_path, command_sha256, command_identity_tuple)
        snapshot_path, snapshot_digest, snapshot_identity = (
            command_path, command_sha256, command_identity_tuple)
    elif command_execution_mode == "private_frozen_tree_direct":
        prepare_private_frozen_tree_direct(
            command_path, command_sha256, command_identity_tuple)
        snapshot_path, snapshot_digest, snapshot_identity = (
            command_path, command_sha256, command_identity_tuple)
    elif command_execution_mode == "direct":
        snapshot_path, snapshot_digest, snapshot_identity = (
            command_path, command_sha256, command_identity_tuple)
    else:
        raise OSError(errno.EINVAL, "unknown command execution mode")
    command_snapshot_path = snapshot_path
    command_snapshot_sha256 = snapshot_digest
    snapshot_full_digest, snapshot_full_identity = stable_full_file_snapshot(
        command_snapshot_path,
        "command execution snapshot",
        require_single_link=command_single_link_required(
            command_snapshot_path),
    )
    if (
        snapshot_full_digest != command_snapshot_sha256
        or legacy_identity_from_full(snapshot_full_identity)
            != snapshot_identity
    ):
        raise OSError(
            errno.EIO,
            "command execution snapshot full identity differs",
        )
    command_snapshot_device = int(snapshot_identity[0])
    command_snapshot_inode = int(snapshot_identity[1])
    command_snapshot_mode = int(snapshot_full_identity[2])
    command_snapshot_nlink = int(snapshot_full_identity[3])
    command_snapshot_uid = int(snapshot_full_identity[4])
    command_snapshot_gid = int(snapshot_full_identity[5])
    command_snapshot_size = int(snapshot_identity[3])
    command_snapshot_mtime_ns = int(snapshot_identity[4])
    command_snapshot_ctime_ns = int(snapshot_identity[5])
    command_snapshot_identity_tuple = snapshot_identity
    command_snapshot_full_identity_tuple = snapshot_full_identity
    if (os.environ.get("BEAT_C_GUARD_SELF_TEST_MODE") == "1" and
            os.environ.get("BEAT_C_GUARD_SELF_TEST_PAUSE_AFTER_COMMAND_SNAPSHOT") == "1"):
        time.sleep(2.0)
    command_identity_status = "available"
    command_identity_error = ""


def verify_command_identity():
    verify_monitor_absent_path_watch(final=True)
    if (
        os.environ.get("BEAT_C_GUARD_SELF_TEST_MODE") == "1"
        and os.environ.get(
            "BEAT_C_GUARD_SELF_TEST_FORCE_RUNTIME_SCRIPT_FD_CLOSE") == "1"
    ):
        os.close(monitor_runtime_script_fd)
    runtime_script_digest, runtime_script_identity = \
        stable_held_runtime_script_snapshot(
            monitor_runtime_script_fd, monitor_runtime_script_path)
    if (
        os.environ.get("BEAT_C_GUARD_SELF_TEST_MODE") == "1"
        and os.environ.get(
            "BEAT_C_GUARD_SELF_TEST_FORCE_RUNTIME_SCRIPT_IDENTITY_DRIFT")
            == "1"
    ):
        runtime_script_identity = (
            *runtime_script_identity[:-1],
            runtime_script_identity[-1] + 1,
        )
    if (
        runtime_script_digest != monitor_runtime_script_sha256
        or runtime_script_identity != monitor_runtime_script_identity_tuple
    ):
        raise OSError(
            errno.EIO,
            "monitor runtime script identity drifted")
    if inherited_authority_mode:
        guard_digest, guard_identity = stable_held_file_snapshot(
            guard_authority_fd,
            guard_authority_path,
            "process-tree guard",
        )
        if (
            guard_digest != guard_authority_sha256
            or guard_identity != guard_authority_identity_tuple
        ):
            raise OSError(errno.EIO, "process-tree guard authority drifted")
        python_digest, python_full_identity = stable_held_file_snapshot(
            monitor_python_authority_fd,
            monitor_python_path,
            "monitor Python",
        )
        if (
            python_digest != monitor_python_sha256
            or python_full_identity != monitor_python_full_identity_tuple
        ):
            raise OSError(errno.EIO, "monitor Python authority drifted")
        digest, full_identity = stable_held_file_snapshot(
            command_authority_fd,
            command_path,
            "command executable",
            require_single_link=command_single_link_required(command_path),
        )
        identity = legacy_identity_from_full(full_identity)
    else:
        digest, identity = stable_command_snapshot(command_path)
        full_identity = command_full_identity_tuple
    if (
        digest != command_sha256
        or identity != command_identity_tuple
        or full_identity != command_full_identity_tuple
    ):
        raise OSError(errno.EIO, "command executable identity drifted")
    if command_self_image_source_fd >= 0:
        snapshot_digest, snapshot_full_identity = stable_held_file_snapshot(
            command_self_image_source_fd,
            command_snapshot_path,
            "command execution snapshot",
        )
        snapshot_identity = legacy_identity_from_full(snapshot_full_identity)
    else:
        snapshot_digest, snapshot_identity = stable_command_snapshot(
            command_snapshot_path)
        snapshot_full_identity = command_snapshot_full_identity_tuple
    if (
        snapshot_digest != command_snapshot_sha256
        or snapshot_identity != command_snapshot_identity_tuple
        or snapshot_full_identity != command_snapshot_full_identity_tuple
    ):
        raise OSError(errno.EIO, "command execution snapshot identity drifted")
    verify_sealed_system_volume_direct()
    verify_private_frozen_tree_direct()
    if not inherited_authority_mode:
        python_digest, python_identity = stable_command_snapshot(
            monitor_python_path)
        if (
            python_digest != monitor_python_sha256
            or python_identity != monitor_python_identity_tuple
        ):
            raise OSError(errno.EIO, "monitor Python identity drifted")
    if monitor_psutil_path:
        _, psutil_digest, psutil_identity = stable_regular_file_snapshot(monitor_psutil_path, "psutil module")
        if psutil_digest != monitor_psutil_sha256 or psutil_identity != monitor_psutil_identity_tuple:
            raise OSError(errno.EIO, "psutil module identity drifted")
        closure_entries, closure_digest = stable_tree_closure(
            monitor_psutil_closure_root, "psutil closure")
        if (closure_digest != monitor_psutil_closure_sha256 or
                closure_entries != monitor_psutil_closure_entries):
            raise OSError(errno.EIO, "psutil closure identity drifted")
    if (
        os.environ.get("BEAT_C_GUARD_SELF_TEST_MODE") == "1"
        and os.environ.get(
            "BEAT_C_GUARD_SELF_TEST_FORCE_RUNTIME_CLOSURE_ADDITION") == "1"
    ):
        __import__("fractions")
    (
        runtime_entries,
        runtime_digest,
        dyld_rows,
        dyld_digest,
        shared_rows,
        shared_cache_digest,
        shared_cache_uuid,
    ) = monitor_runtime_closure()
    if (
        len(runtime_entries) != monitor_runtime_physical_count
        or runtime_digest != monitor_runtime_physical_sha256
        or runtime_entries != monitor_runtime_physical_entries
        or len(dyld_rows) != monitor_runtime_dyld_image_count
        or dyld_digest != monitor_runtime_dyld_image_sha256
        or dyld_rows != monitor_runtime_dyld_image_entries
        or len(shared_rows)
            != monitor_runtime_shared_cache_image_count
        or shared_cache_digest
            != monitor_runtime_shared_cache_image_sha256
        or shared_cache_uuid != monitor_runtime_shared_cache_uuid
    ):
        raise OSError(errno.EIO, "monitor runtime closure drifted")
startup_status = "not_started"
cleanup_status = "not_required"
cleanup_error = ""

PARENT_PROOF_SCHEMA = "cheng.guard.parent_proof"
PARENT_PROOF_KEYS = [
    "schema",
    "capability",
    "monitorPid",
    "monitorStartTvsec",
    "monitorStartTvusec",
    "limitBytes",
    "rootPid",
    "rootStartTvsec",
    "rootStartTvusec",
    "rootPpid",
    "rootSid",
    "rootPgid",
]
PARENT_PROOF_FD = 3
PARENT_PROOF_MAX_RECORD_BYTES = 4096


class ProcBsdInfo(ctypes.Structure):
    _fields_ = [
        ("pbi_flags", ctypes.c_uint32),
        ("pbi_status", ctypes.c_uint32),
        ("pbi_xstatus", ctypes.c_uint32),
        ("pbi_pid", ctypes.c_uint32),
        ("pbi_ppid", ctypes.c_uint32),
        ("pbi_uid", ctypes.c_uint32),
        ("pbi_gid", ctypes.c_uint32),
        ("pbi_ruid", ctypes.c_uint32),
        ("pbi_rgid", ctypes.c_uint32),
        ("pbi_svuid", ctypes.c_uint32),
        ("pbi_svgid", ctypes.c_uint32),
        ("rfu_1", ctypes.c_uint32),
        ("pbi_comm", ctypes.c_char * 16),
        ("pbi_name", ctypes.c_char * 32),
        ("pbi_nfiles", ctypes.c_uint32),
        ("pbi_pgid", ctypes.c_uint32),
        ("pbi_pjobc", ctypes.c_uint32),
        ("e_tdev", ctypes.c_uint32),
        ("e_tpgid", ctypes.c_uint32),
        ("pbi_nice", ctypes.c_int32),
        ("pbi_start_tvsec", ctypes.c_uint64),
        ("pbi_start_tvusec", ctypes.c_uint64),
    ]


_proof_libproc = None
_proof_getsockopt = None


def process_proof_identity_once(pid):
    if platform_is_darwin:
        global _proof_libproc
        if ctypes.sizeof(ProcBsdInfo) != 136:
            raise OSError(errno.EIO, "unexpected proc_bsdinfo ABI size")
        if _proof_libproc is None:
            library = ctypes.CDLL("/usr/lib/libproc.dylib", use_errno=True)
            function = library.proc_pidinfo
            function.argtypes = [
                ctypes.c_int, ctypes.c_int, ctypes.c_uint64,
                ctypes.c_void_p, ctypes.c_int,
            ]
            function.restype = ctypes.c_int
            _proof_libproc = (library, function)
        info = ProcBsdInfo()
        ctypes.set_errno(0)
        count = _proof_libproc[1](
            pid, 3, 0, ctypes.byref(info), ctypes.sizeof(info))
        if count == 0 and ctypes.get_errno() == errno.ESRCH:
            return None
        if count != ctypes.sizeof(info):
            raise OSError(
                ctypes.get_errno() or errno.EIO,
                "proc_pidinfo returned non-canonical proc_bsdinfo size")
        if int(info.pbi_pid) != pid:
            raise OSError(errno.EIO, "proc_pidinfo pid identity mismatch")
        return {
            "pid": int(info.pbi_pid),
            "ppid": int(info.pbi_ppid),
            "pgid": int(info.pbi_pgid),
            "startTvsec": int(info.pbi_start_tvsec),
            "startTvusec": int(info.pbi_start_tvusec),
        }
    try:
        created = psutil.Process(pid).create_time()
    except (psutil.NoSuchProcess, psutil.ZombieProcess):
        return None
    seconds = int(created)
    microseconds = int(round((created - seconds) * 1000000))
    return {
        "pid": pid,
        "ppid": os.getppid() if pid == os.getpid() else psutil.Process(pid).ppid(),
        "pgid": os.getpgid(pid),
        "startTvsec": seconds,
        "startTvusec": microseconds,
    }


def stable_process_proof_identity(pid):
    before = process_proof_identity_once(pid)
    if before is None:
        return None
    try:
        sid = os.getsid(pid)
        pgid = os.getpgid(pid)
    except ProcessLookupError:
        return None
    after = process_proof_identity_once(pid)
    if before != after or after is None or after["pgid"] != pgid:
        raise OSError(errno.EIO, "process proof identity changed during read")
    return dict(after, sid=sid)


def local_peer_pid(fd):
    global _proof_getsockopt
    if not platform_is_darwin:
        raise OSError(errno.ENOTSUP, "parent proof LOCAL_PEERPID requires Darwin")
    if _proof_getsockopt is None:
        libc = ctypes.CDLL("/usr/lib/libSystem.B.dylib", use_errno=True)
        function = libc.getsockopt
        function.argtypes = [
            ctypes.c_int, ctypes.c_int, ctypes.c_int,
            ctypes.c_void_p, ctypes.POINTER(ctypes.c_uint32),
        ]
        function.restype = ctypes.c_int
        _proof_getsockopt = (libc, function)
    peer = ctypes.c_int(0)
    length = ctypes.c_uint32(ctypes.sizeof(peer))
    ctypes.set_errno(0)
    if _proof_getsockopt[1](
            fd, 0, 0x002, ctypes.byref(peer), ctypes.byref(length)) != 0:
        error = ctypes.get_errno() or errno.EIO
        raise OSError(error, os.strerror(error))
    if length.value != ctypes.sizeof(peer) or peer.value <= 1:
        raise OSError(errno.EIO, "parent proof LOCAL_PEERPID is invalid")
    return int(peer.value)


def peek_parent_proof_frame(sock):
    deadline = time.monotonic() + startup_timeout_seconds
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise OSError(errno.ETIMEDOUT, "parent proof record timed out")
        if sock.fileno() not in poll_readable((sock,), remaining):
            raise OSError(errno.ETIMEDOUT, "parent proof record timed out")
        try:
            frame = sock.recv(
                PARENT_PROOF_MAX_RECORD_BYTES + 5,
                socket.MSG_PEEK | socket.MSG_DONTWAIT)
        except BlockingIOError:
            continue
        if not frame:
            raise OSError(errno.EPIPE, "parent proof peer closed before full record")
        if len(frame) < 4:
            continue
        size = struct.unpack(">I", frame[:4])[0]
        if size <= 0 or size > PARENT_PROOF_MAX_RECORD_BYTES:
            raise OSError(errno.E2BIG, "parent proof record size is invalid")
        expected = 4 + size
        if len(frame) < expected:
            continue
        if len(frame) != expected:
            raise OSError(errno.EPROTO, "parent proof socket contains extra bytes")
        return frame[4:]


def parse_parent_proof_record(fd):
    if fd != PARENT_PROOF_FD:
        raise OSError(errno.EPERM, "parent proof fd must be the unique descriptor 3")
    before = os.fstat(fd)
    if not stat.S_ISSOCK(before.st_mode):
        raise OSError(errno.ENOTSOCK, "parent proof fd is not a Unix socket")
    peer_pid = local_peer_pid(fd)
    duplicate = socket.fromfd(fd, socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        raw = peek_parent_proof_frame(duplicate)
        if local_peer_pid(fd) != peer_pid:
            raise OSError(errno.EIO, "parent proof peer changed after record")
    finally:
        duplicate.close()
    after = os.fstat(fd)
    if (
        before.st_dev != after.st_dev
        or before.st_ino != after.st_ino
        or before.st_mode != after.st_mode
    ):
        raise OSError(errno.EIO, "parent proof fd changed during read")
    try:
        text = raw.decode("utf-8", errors="strict")
        record = json.loads(text)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise OSError(errno.EPROTO, "parent proof record is invalid JSON") from exc
    if (
        not isinstance(record, dict)
        or list(record) != PARENT_PROOF_KEYS
        or not text.endswith("\n")
        or "\r" in text
        or json.dumps(record, separators=(",", ":")) + "\n" != text
    ):
        raise OSError(errno.EPROTO, "parent proof record is not canonical")
    if (
        record["schema"] != PARENT_PROOF_SCHEMA
        or not isinstance(record["capability"], str)
        or len(record["capability"]) != 64
        or any(char not in "0123456789abcdef"
               for char in record["capability"])
    ):
        raise OSError(errno.EPROTO, "parent proof record schema is invalid")
    for key in PARENT_PROOF_KEYS[2:]:
        if type(record[key]) is not int or record[key] <= 0:
            raise OSError(
                errno.EPROTO, "parent proof numeric field is invalid: %s" % key)
    return record, raw, peer_pid


inherited_parent_capability = os.environ.get("BEAT_C_GUARD_PARENT_CAPABILITY", "")
inherited_parent_monitor_pid = os.environ.get("BEAT_C_GUARD_PARENT_MONITOR_PID", "")
inherited_parent_limit_bytes = os.environ.get("BEAT_C_GUARD_PARENT_LIMIT_BYTES", "")
inherited_parent_proof_fd = os.environ.get("BEAT_C_GUARD_PARENT_PROOF_FD", "")
parent_guard_mode = bool(
    inherited_parent_capability or inherited_parent_monitor_pid
    or inherited_parent_limit_bytes or inherited_parent_proof_fd)
parent_guard_input_error = ""
if parent_guard_mode:
    if (len(inherited_parent_capability) != 64 or
            any(char not in "0123456789abcdef" for char in inherited_parent_capability) or
            not inherited_parent_monitor_pid.isdigit() or
            not inherited_parent_limit_bytes.isdigit() or
            inherited_parent_proof_fd != str(PARENT_PROOF_FD)):
        parent_guard_input_error = "invalid inherited parent-guard capability"
    parent_guard_monitor_pid = (
        int(inherited_parent_monitor_pid)
        if inherited_parent_monitor_pid.isdigit() else 0)
    parent_guard_limit_bytes = (
        int(inherited_parent_limit_bytes)
        if inherited_parent_limit_bytes.isdigit() else 0)
    parent_guard_proof_fd = (
        int(inherited_parent_proof_fd)
        if inherited_parent_proof_fd.isdigit() else 0)
else:
    parent_guard_monitor_pid = 0
    parent_guard_limit_bytes = 0
child_guard_capability = os.urandom(32).hex()
parent_guard_capability_sha256 = (
    hashlib.sha256(inherited_parent_capability.encode("ascii")).hexdigest()
    if parent_guard_mode else ""
)
parent_guard_binding_status = "unverified" if parent_guard_mode else "not_applicable"
target_env_injected_parent_capability = child_guard_capability
target_env_injected_parent_capability_sha256 = hashlib.sha256(
    child_guard_capability.encode("ascii")).hexdigest()
target_env_injected_parent_monitor_pid = os.getpid()
target_env_injected_parent_limit_bytes = rss_limit_bytes


class MeasurementUnavailable(RuntimeError):
    pass


class ProcessEscape(RuntimeError):
    def __init__(self, pid, detail):
        super().__init__(detail)
        self.pid = pid


class GuardInterrupted(RuntimeError):
    def __init__(self, signum):
        super().__init__("signal_%d" % signum)
        self.signum = signum


class StartupTimeout(RuntimeError):
    pass


class StartupFailure(RuntimeError):
    pass


class TrackedOutputViolation(RuntimeError):
    def __init__(self, label, detail):
        super().__init__(detail)
        self.label = label


def validate_parent_guard_context():
    global parent_guard_binding_status, parent_guard_proof_peer_pid
    global parent_guard_proof_record_sha256, parent_guard_root_pid
    global parent_guard_root_start_tvsec, parent_guard_root_start_tvusec
    global parent_guard_root_ppid, parent_guard_root_sid
    global parent_guard_root_pgid
    if not parent_guard_mode:
        return
    if parent_guard_input_error:
        raise OSError(errno.EPERM, parent_guard_input_error)
    if psutil is None:
        raise OSError(errno.ENOSYS, "parent guard binding requires psutil")
    if (parent_guard_monitor_pid <= 1 or parent_guard_limit_bytes <= 0 or
            (rss_limit_bytes > 0 and rss_limit_bytes > parent_guard_limit_bytes)):
        raise OSError(errno.EPERM, "parent guard limit binding is invalid")
    record, raw, peer_pid = parse_parent_proof_record(parent_guard_proof_fd)
    if (
        record["capability"] != inherited_parent_capability
        or record["monitorPid"] != parent_guard_monitor_pid
        or record["limitBytes"] != parent_guard_limit_bytes
        or peer_pid != parent_guard_monitor_pid
    ):
        raise OSError(
            errno.EPERM,
            "parent proof record does not match inherited guard declaration")
    self_identity = stable_process_proof_identity(os.getpid())
    root_identity = stable_process_proof_identity(record["rootPid"])
    monitor_identity = stable_process_proof_identity(parent_guard_monitor_pid)
    if (
        self_identity is None
        or root_identity is None
        or monitor_identity is None
    ):
        raise OSError(errno.EPERM, "parent proof process identity vanished")
    if (
        record["rootPid"] != root_identity["pid"]
        or record["rootStartTvsec"] != root_identity["startTvsec"]
        or record["rootStartTvusec"] != root_identity["startTvusec"]
        or record["rootPpid"] != root_identity["ppid"]
        or record["rootSid"] != root_identity["sid"]
        or record["rootPgid"] != root_identity["pgid"]
        or record["rootPpid"] != parent_guard_monitor_pid
        or record["monitorStartTvsec"] != monitor_identity["startTvsec"]
        or record["monitorStartTvusec"] != monitor_identity["startTvusec"]
    ):
        raise OSError(
            errno.EPERM,
            "parent proof record does not match stable monitor/root identity")
    try:
        ancestors = psutil.Process(os.getpid()).parents()
    except (psutil.NoSuchProcess, psutil.ZombieProcess, psutil.AccessDenied) as exc:
        raise OSError(errno.EPERM, "parent guard ancestry unavailable: %s" % exc)
    ancestor_pids = [process.pid for process in ancestors]
    if parent_guard_monitor_pid not in ancestor_pids:
        raise OSError(errno.EPERM, "parent guard monitor is not an ancestor")
    monitor_index = ancestor_pids.index(parent_guard_monitor_pid)
    if record["rootPid"] != os.getpid():
        if record["rootPid"] not in ancestor_pids:
            raise OSError(errno.EPERM, "parent guard root is not an ancestor")
        if ancestor_pids.index(record["rootPid"]) >= monitor_index:
            raise OSError(
                errno.EPERM,
                "parent guard root is not below parent guard monitor")
    inherited_sid = self_identity["sid"]
    inherited_pgid = self_identity["pgid"]
    if (
        inherited_sid != record["rootSid"]
        or inherited_pgid != record["rootPgid"]
    ):
        raise OSError(
            errno.EPERM,
            "current process escaped parent guard session or process group")
    # The session leader may be the current root, an intermediary shell below
    # the parent monitor, or an already-proved ancestor above a nested monitor.
    # Exact SID/PGID continuity above prevents accepting a re-parented escape.
    if (
        inherited_sid != os.getpid()
        and inherited_sid not in ancestor_pids
    ):
        raise OSError(errno.EPERM, "parent guard session leader is not an ancestor")
    try:
        if os.getsid(inherited_sid) != inherited_sid or os.getpgid(inherited_sid) != inherited_sid:
            raise OSError(errno.EPERM, "parent guard session leader identity is invalid")
    except ProcessLookupError as exc:
        raise OSError(errno.EPERM, "parent guard session leader vanished") from exc
    parent_guard_proof_peer_pid = peer_pid
    parent_guard_proof_record_sha256 = hashlib.sha256(raw).hexdigest()
    parent_guard_root_pid = record["rootPid"]
    parent_guard_root_start_tvsec = record["rootStartTvsec"]
    parent_guard_root_start_tvusec = record["rootStartTvusec"]
    parent_guard_root_ppid = record["rootPpid"]
    parent_guard_root_sid = record["rootSid"]
    parent_guard_root_pgid = record["rootPgid"]
    parent_guard_binding_status = "proved"


class DarwinRusageV0(ctypes.Structure):
    _fields_ = [
        ("ri_uuid", ctypes.c_ubyte * 16),
        ("ri_user_time", ctypes.c_uint64),
        ("ri_system_time", ctypes.c_uint64),
        ("ri_pkg_idle_wkups", ctypes.c_uint64),
        ("ri_interrupt_wkups", ctypes.c_uint64),
        ("ri_pageins", ctypes.c_uint64),
        ("ri_wired_size", ctypes.c_uint64),
        ("ri_resident_size", ctypes.c_uint64),
        ("ri_phys_footprint", ctypes.c_uint64),
        ("ri_proc_start_abstime", ctypes.c_uint64),
        ("ri_proc_exit_abstime", ctypes.c_uint64),
    ]


# struct proc_bsdinfo (sys/proc_info.h, PROC_PIDTBSDINFO=3): exact field order
# and widths from the macOS SDK header.  Live-ABI probe on arm64 macOS 26:
# sizeof==136, pid@12 pgid@100 status@4 start_tvsec@120 start_tvusec@128;
# proc_pidinfo returns 0 for a dead pid, and pbi_pgid matches os.getpgid.
class DarwinProcBsdInfo(ctypes.Structure):
    _fields_ = [
        ("pbi_flags", ctypes.c_uint32),
        ("pbi_status", ctypes.c_uint32),
        ("pbi_xstatus", ctypes.c_uint32),
        ("pbi_pid", ctypes.c_uint32),
        ("pbi_ppid", ctypes.c_uint32),
        ("pbi_uid", ctypes.c_uint32),
        ("pbi_gid", ctypes.c_uint32),
        ("pbi_ruid", ctypes.c_uint32),
        ("pbi_rgid", ctypes.c_uint32),
        ("pbi_svuid", ctypes.c_uint32),
        ("pbi_svgid", ctypes.c_uint32),
        ("rfu_1", ctypes.c_uint32),
        ("pbi_comm", ctypes.c_char * 16),
        ("pbi_name", ctypes.c_char * 32),
        ("pbi_nfiles", ctypes.c_uint32),
        ("pbi_pgid", ctypes.c_uint32),
        ("pbi_pjobc", ctypes.c_uint32),
        ("e_tdev", ctypes.c_uint32),
        ("e_tpgid", ctypes.c_uint32),
        ("pbi_nice", ctypes.c_int32),
        ("pbi_start_tvsec", ctypes.c_uint64),
        ("pbi_start_tvusec", ctypes.c_uint64),
    ]


DARWIN_PROC_STATUS_SZOMB = 5


class DarwinMetricNotReadyError(OSError):
    """proc_pid_rusage succeeded for a live identity whose resident/
    footprint metrics are not published yet (freshly spawned child).
    OSError subclass so existing ``except OSError`` handlers keep
    working; the snapshot path treats it as "no sample this tick" when
    the TBSDINFO identity is stable, matching the legacy psutil front
    path that reported such processes as absent."""


class DarwinFootprintReader:
    def __init__(self):
        try:
            self.libproc = ctypes.CDLL("/usr/lib/libproc.dylib", use_errno=True)
            self.rusage = self.libproc.proc_pid_rusage
            self.list_group = self.libproc.proc_listpgrppids
            self.list_children = self.libproc.proc_listchildpids
            self.list_all = self.libproc.proc_listallpids
        except (OSError, AttributeError) as exc:
            raise MeasurementUnavailable("darwin_libproc_unavailable: %s" % exc)
        self.rusage.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_void_p]
        self.rusage.restype = ctypes.c_int
        for function in (self.list_group, self.list_children):
            function.argtypes = [ctypes.c_int, ctypes.c_void_p, ctypes.c_int]
            function.restype = ctypes.c_int
        self.list_all.argtypes = [ctypes.c_void_p, ctypes.c_int]
        self.list_all.restype = ctypes.c_int
        self.pidinfo = self.libproc.proc_pidinfo
        self.pidinfo.argtypes = [
            ctypes.c_int, ctypes.c_int, ctypes.c_uint64,
            ctypes.c_void_p, ctypes.c_int32]
        self.pidinfo.restype = ctypes.c_int32

    def read_identity(self, pid):
        """One-syscall process identity read via PROC_PIDTBSDINFO.

        Returns None for a dead or zombie pid (proc_pidinfo==0, or
        pbi_status==SZOMB), else (start_usec, pgid).  start_usec is
        pbi_start_tvsec*1000000+pbi_start_tvusec — the same kernel
        starttime psutil's create_time() derives from, so identity
        comparisons keep the same pid-reuse detection semantics without
        constructing psutil.Process objects (whose exception chains
        churn the monitor malloc zone once a compiler target spawns
        many short-lived children; see spawn_probe in V6-MEM ledger).
        """
        info = DarwinProcBsdInfo()
        ctypes.set_errno(0)
        produced = self.pidinfo(
            pid, 3, 0, ctypes.byref(info), ctypes.sizeof(info))
        if produced == 0:
            return None
        if produced != ctypes.sizeof(info):
            error = ctypes.get_errno() or errno.EIO
            if error == errno.EPERM:
                raise MeasurementUnavailable(
                    "process_identity_access_denied pid=%d" % pid)
            raise OSError(error, os.strerror(error))
        if info.pbi_status == DARWIN_PROC_STATUS_SZOMB:
            return None
        if info.pbi_pid != pid:
            return None
        start_usec = (
            int(info.pbi_start_tvsec) * 1000000 +
            int(info.pbi_start_tvusec))
        if start_usec <= 0:
            raise OSError(errno.EIO, "non-positive Darwin start time")
        return start_usec, int(info.pbi_pgid)

    def read(self, pid):
        usage = DarwinRusageV0()
        ctypes.set_errno(0)
        if self.rusage(pid, 0, ctypes.byref(usage)) != 0:
            error = ctypes.get_errno() or errno.EIO
            raise OSError(error, os.strerror(error))
        resident = int(usage.ri_resident_size)
        footprint = int(usage.ri_phys_footprint)
        start_identity = int(usage.ri_proc_start_abstime)
        exit_identity = int(usage.ri_proc_exit_abstime)
        if exit_identity > 0:
            return None
        if resident <= 0 or footprint <= 0 or start_identity <= 0:
            # Live identity whose metrics are not published yet (freshly
            # spawned child, pre-exec window).  The legacy psutil front
            # path never reached this point for such processes (psutil's
            # kinfo lookup reports them as absent -> snapshot None), so
            # the observable-equivalent outcome is "no sample this tick".
            # Sentinel subclass keeps genuine kernel errors on the strict
            # MeasurementUnavailable escalation path below.
            raise DarwinMetricNotReadyError(
                "non-positive Darwin process metric")
        return resident, footprint, start_identity

    def _pid_list(self, function, identifier, vanished_is_empty):
        capacity = 64
        while True:
            buffer = (ctypes.c_int * capacity)()
            ctypes.set_errno(0)
            count = function(identifier, buffer, ctypes.sizeof(buffer))
            if count < 0:
                error = ctypes.get_errno() or errno.EIO
                if vanished_is_empty and error == errno.ESRCH:
                    return []
                raise OSError(error, os.strerror(error))
            if count < capacity:
                return [pid for pid in buffer[:count] if pid > 0]
            capacity *= 2
            if capacity > 1048576:
                raise MeasurementUnavailable("darwin_target_pid_list_unbounded")

    def _all_pids(self):
        capacity = 1024
        while True:
            buffer = (ctypes.c_int * capacity)()
            ctypes.set_errno(0)
            count = self.list_all(buffer, ctypes.sizeof(buffer))
            if count < 0:
                error = ctypes.get_errno() or errno.EIO
                raise OSError(error, os.strerror(error))
            if count < capacity:
                return [pid for pid in buffer[:count] if pid > 0]
            capacity *= 2
            if capacity > 1048576:
                raise MeasurementUnavailable("darwin_all_pid_list_unbounded")

    def discover(self, root_pid, pgid, sid, historical_pids):
        pids = {root_pid}
        pids.update(pid for pid in historical_pids if pid > 0)
        if pgid > 0:
            pids.update(self._pid_list(self.list_group, pgid, True))
        if sid > 0:
            for pid in self._all_pids():
                try:
                    if os.getsid(pid) == sid:
                        pids.add(pid)
                except (ProcessLookupError, PermissionError):
                    continue
        queue = list(sorted(pids))
        cursor = 0
        while cursor < len(queue):
            parent = queue[cursor]
            cursor += 1
            for child in self._pid_list(self.list_children, parent, True):
                if child in pids:
                    continue
                if len(pids) >= 1048576:
                    raise MeasurementUnavailable("darwin_target_process_tree_unbounded")
                pids.add(child)
                queue.append(child)
        return pids


def sanitize(value):
    return str(value).replace("\n", " ").replace("\r", " ")


def trace_time_seconds():
    return int(time.time())


def trace_kibibytes(byte_count):
    return 0 if byte_count <= 0 else (byte_count + 1023) // 1024


def drain_phase_trace(phase_trace, current_enforced_bytes, force=False):
    global phase_offset
    if phase_trace is None:
        return
    stderr_size = held_output_identity("stderr").st_size
    if stderr_size < phase_offset:
        raise OSError(errno.EIO, "stderr held output shrank during phase trace")
    data = os.pread(output_fds["stderr"], stderr_size - phase_offset, phase_offset)
    if not data:
        return
    if force:
        complete = data
        phase_offset += len(data)
    else:
        newline = data.rfind(b"\n")
        if newline < 0:
            return
        complete = data[:newline + 1]
        phase_offset += newline + 1
    for line in complete.decode("utf-8", errors="replace").splitlines():
        if line:
            phase_trace.write(
                "%d\t%d\t%s\n" %
                (trace_time_seconds(), trace_kibibytes(current_enforced_bytes),
                 sanitize(line).replace("\t", " "))
            )
    phase_trace.flush()


def process_status_is_terminal(status):
    return status in (
        psutil.STATUS_ZOMBIE,
        getattr(psutil, "STATUS_DEAD", "dead"),
    )


def process_snapshot(pid, footprint_reader):
    # Linux /proc/<pid>/stat publishes state, process identity and RSS in one
    # record.  Always consume that exact row even when the optional psutil
    # package is installed; separate status() and memory_info() reads can
    # straddle process exit and misclassify a vanished child as an
    # unmeasurable live process.
    if sys.platform.startswith("linux"):
        try:
            row = linux_procfs_stat(pid)
        except (LinuxProcfsNoSuchProcess, LinuxProcfsZombieProcess):
            return None
        except LinuxProcfsAccessDenied as exc:
            raise MeasurementUnavailable(
                "process_snapshot_access_denied pid=%d: %s" % (pid, exc)
            )
        if row["state"] in ("Z", "X", "x"):
            return None
        _clock_ticks, page_size, _boot_time = linux_procfs_constants()
        if row["pgrp"] <= 0 or row["session"] <= 0:
            raise MeasurementUnavailable(
                "linux_procfs_process_identity_invalid pid=%d" % pid
            )
        return {
            "pid": pid,
            "start": str(row["startTicks"]),
            "pgid": row["pgrp"],
            "sid": row["session"],
            "resident": row["residentPages"] * page_size,
            "footprint": 0,
        }
    if footprint_reader is not None:
        # Darwin fast identity path: one proc_pidinfo(PROC_PIDTBSDINFO)
        # syscall replaces psutil.Process()+create_time()+status().  Same
        # kernel fields (p_start, p_stat, p_pgid), same terminal/no-such
        # process outcomes; see DarwinFootprintReader.read_identity for
        # the equivalence argument.  os.getpgid/os.getsid stay (cheap
        # built-in ProcessLookupError, no psutil exception chain).
        try:
            identity = footprint_reader.read_identity(pid)
            if identity is None:
                return None
            start_usec, pgid = identity
            if pgid <= 0:
                return None
            sid = os.getsid(pid)
            if sid <= 0:
                return None
        except ProcessLookupError:
            return None
        except PermissionError:
            raise MeasurementUnavailable(
                "process_snapshot_access_denied pid=%d" % pid)
        start_time_marker = start_usec
    else:
        try:
            process = psutil.Process(pid)
            create_time = process.create_time()
            status = process.status()
            if process_status_is_terminal(status):
                return None
            pgid = os.getpgid(pid)
            sid = os.getsid(pid)
        except (ProcessLookupError, psutil.NoSuchProcess, psutil.ZombieProcess):
            return None
        except (PermissionError, psutil.AccessDenied) as exc:
            raise MeasurementUnavailable("process_snapshot_access_denied pid=%d: %s" % (pid, exc))
        start_time_marker = create_time
    if footprint_reader is None:
        try:
            resident = int(process.memory_info().rss)
        except (psutil.NoSuchProcess, psutil.ZombieProcess):
            return None
        except psutil.AccessDenied as exc:
            raise MeasurementUnavailable(
                "process_snapshot_access_denied pid=%d: %s" % (pid, exc))
        if resident <= 0:
            raise MeasurementUnavailable("non_positive_resident pid=%d" % pid)
        footprint = 0
        start_identity = repr(create_time)
    else:
        try:
            metrics = footprint_reader.read(pid)
            if metrics is None:
                return None
            resident, footprint, darwin_start = metrics
        except OSError as exc:
            # rusage failed on a pid whose TBSDINFO identity was sampled
            # moments earlier: re-read the same kernel identity source.
            # A vanished/reused pid (read_identity None, or start_usec
            # drift) returns None exactly like the psutil create_time
            # comparison it replaces; a stable live identity still
            # escalates to MeasurementUnavailable below.
            try:
                current = footprint_reader.read_identity(pid)
                if current is None or current[0] != start_usec:
                    return None
            except MeasurementUnavailable:
                raise
            except OSError as recheck_exc:
                if isinstance(exc, DarwinMetricNotReadyError):
                    return None
                raise MeasurementUnavailable(
                    "process_snapshot_recheck_access_denied pid=%d: %s" %
                    (pid, recheck_exc)
                )
            if isinstance(exc, DarwinMetricNotReadyError):
                return None
            raise MeasurementUnavailable(
                "darwin_process_metrics_unavailable_for_stable_live_identity "
                "pid=%d errno=%s: %s" %
                (pid, getattr(exc, "errno", 0), exc)
            )
        start_identity = str(darwin_start)
    return {
        "pid": pid,
        "start": start_identity,
        "pgid": pgid,
        "sid": sid,
        "resident": resident,
        "footprint": footprint,
    }


def discover_candidates(root_pid, pgid, sid, footprint_reader):
    historical_pids = list(history)
    if platform_is_darwin:
        try:
            return footprint_reader.discover(
                root_pid, pgid, 0 if parent_guard_mode else sid,
                historical_pids)
        except (MeasurementUnavailable, OSError) as exc:
            raise MeasurementUnavailable("darwin_target_membership_unavailable: %s" % exc)
    pids = {root_pid}
    pids.update(historical_pids)
    for seed in list(pids):
        try:
            pids.update(child.pid for child in psutil.Process(seed).children(recursive=True))
        except (psutil.NoSuchProcess, psutil.ZombieProcess):
            pass
        except psutil.AccessDenied as exc:
            raise MeasurementUnavailable("process_tree_access_denied pid=%d: %s" % (seed, exc))
    try:
        for process in psutil.process_iter(["pid"]):
            try:
                candidate = process.info["pid"]
                if (
                    os.getpgid(candidate) == pgid
                    or (
                        not parent_guard_mode and sid > 0
                        and os.getsid(candidate) == sid
                    )
                ):
                    pids.add(candidate)
            except (ProcessLookupError, psutil.NoSuchProcess, psutil.ZombieProcess):
                pass
            except (PermissionError, psutil.AccessDenied):
                continue
    except (OSError, psutil.Error) as exc:
        raise MeasurementUnavailable("process_group_enumeration_unavailable: %s" % exc)
    return pids


def sample_process_tree(root_pid, pgid, sid, footprint_reader):
    global identity_history_peak_count, root_identity_sampled
    candidates = discover_candidates(
        root_pid, 0 if parent_guard_mode else pgid, sid, footprint_reader)
    snapshots = {}
    for pid in sorted(candidates):
        snapshot = process_snapshot(pid, footprint_reader)
        if snapshot is None:
            continue
        snapshots[pid] = snapshot
        previous = history.get(pid)
        if previous is not None and previous["start"] != snapshot["start"]:
            raise ProcessEscape(pid, "pid_reuse_for_historical_member")
        if previous is None:
            # Compiler subprocesses deliberately create a child process group
            # so they can be cancelled as one unit. They remain descendants in
            # the original session and are still measured by this identity
            # history. A new session is the actual escape boundary.
            history[pid] = {
                "start": snapshot["start"],
                "pgid": snapshot["pgid"],
                "sid": snapshot["sid"],
            }
            if snapshot["sid"] != sid:
                raise ProcessEscape(pid, "new_member_outside_original_session")
    identity_history_peak_count = max(identity_history_peak_count, len(history))

    resident_total = 0
    footprint_total = 0
    measured_count = 0
    for pid, identity in sorted(history.items()):
        snapshot = snapshots.get(pid)
        if snapshot is None:
            snapshot = process_snapshot(pid, footprint_reader)
        if snapshot is None or snapshot["start"] != identity["start"]:
            continue
        if snapshot["sid"] != identity["sid"]:
            raise ProcessEscape(pid, "historical_member_changed_session")
        # setpgid may race the first sample. Preserve the stable process
        # identity and update its observed group; cleanup also kills each
        # recorded identity directly.
        identity["pgid"] = snapshot["pgid"]
        if (
            os.environ.get("BEAT_C_GUARD_SELF_TEST_MODE") == "1"
            and os.environ.get("BEAT_C_GUARD_SELF_TEST_FORCE_CONFIRMED_MEMBER_UNMEASURABLE") == "1"
            and pid == root_pid
        ):
            raise MeasurementUnavailable("confirmed_member_unmeasurable pid=%d" % pid)
        resident_total += snapshot["resident"]
        footprint_total += snapshot["footprint"]
        measured_count += 1
        if pid == root_pid:
            root_identity_sampled = 1
    enforced = max(resident_total, footprint_total) if footprint_reader is not None else resident_total
    return resident_total, footprint_total, enforced, measured_count


def identity_is_live(pid, identity):
    try:
        snapshot = process_snapshot(pid, footprint_reader)
    except MeasurementUnavailable:
        return True
    return snapshot is not None and snapshot["start"] == identity["start"]


def kill_observed(sig):
    live_members = []
    for pid, identity in list(history.items()):
        if identity_is_live(pid, identity):
            live_members.append((pid, identity))
    if not parent_guard_mode:
        live_groups = sorted({
            int(identity["pgid"])
            for _, identity in live_members
            if int(identity["pgid"]) > 0
        })
    else:
        live_groups = []
    for pgid in live_groups:
        try:
            os.killpg(pgid, sig)
        except ProcessLookupError:
            pass
        except (PermissionError, OSError):
            pass
    for pid, _identity in live_members:
        try:
            os.kill(pid, sig)
        except (ProcessLookupError, PermissionError, OSError):
            pass
    if child_pid > 0 and child_pid not in history:
        try:
            os.kill(child_pid, sig)
        except (ProcessLookupError, PermissionError, OSError):
            pass


def refresh_observed_union_for_cleanup():
    global sample_count, max_resident_bytes, max_phys_footprint_bytes
    global max_enforced_bytes, max_process_count, last_enforced_bytes
    global escape_pid, cleanup_error
    if child_pid <= 0 or root_pgid <= 0 or root_sid <= 0:
        return
    try:
        resident, footprint, enforced, process_count = sample_process_tree(
            child_pid, root_pgid, root_sid, footprint_reader)
        sample_count += 1
        max_resident_bytes = max(max_resident_bytes, resident)
        max_phys_footprint_bytes = max(max_phys_footprint_bytes, footprint)
        max_enforced_bytes = max(max_enforced_bytes, enforced)
        max_process_count = max(max_process_count, process_count)
        last_enforced_bytes = enforced
    except ProcessEscape as exc:
        escape_pid = exc.pid
        detail = "cleanup membership refresh detected escape pid=%d" % exc.pid
        cleanup_error = "%s; %s" % (cleanup_error, detail) if cleanup_error else detail
    except (MeasurementUnavailable, OSError, psutil.Error) as exc:
        detail = "cleanup membership refresh failed: %s" % exc
        cleanup_error = "%s; %s" % (cleanup_error, detail) if cleanup_error else detail


def reap_root():
    global root_wait_status
    if child_pid <= 0 or root_wait_status is not None:
        return root_wait_status is not None
    while True:
        try:
            done, status = os.waitpid(child_pid, os.WNOHANG)
            if done == child_pid:
                root_wait_status = status
                return True
            return False
        except InterruptedError:
            if received_signal:
                raise GuardInterrupted(received_signal)
        except ChildProcessError:
            root_wait_status = 0
            return True


def cleanup_quiescent():
    root_reaped = reap_root()
    live_history = [
        pid for pid, identity in list(history.items())
        if identity_is_live(pid, identity)
    ]
    return root_reaped and not live_history


def cleanup_all():
    global cleanup_status, cleanup_error
    cleanup_status = "running"
    cleanup_started = time.monotonic()
    cleanup_deadline = cleanup_started + cleanup_timeout_seconds
    refresh_observed_union_for_cleanup()
    kill_observed(signal.SIGTERM)
    term_deadline = min(cleanup_deadline, cleanup_started + 0.2)
    while time.monotonic() < term_deadline:
        refresh_observed_union_for_cleanup()
        kill_observed(signal.SIGTERM)
        if cleanup_quiescent():
            cleanup_status = "completed"
            return
        time.sleep(0.01)
    refresh_observed_union_for_cleanup()
    kill_observed(signal.SIGKILL)
    while time.monotonic() < cleanup_deadline:
        refresh_observed_union_for_cleanup()
        kill_observed(signal.SIGKILL)
        if cleanup_quiescent():
            cleanup_status = "completed"
            return
        time.sleep(0.01)
    reap_root()
    reap_deadline = time.monotonic() + 0.01
    while time.monotonic() < reap_deadline:
        try:
            done, _ = os.waitpid(-1, os.WNOHANG)
            if done <= 0:
                break
        except (ChildProcessError, OSError):
            break
    cleanup_status = "timeout"
    cleanup_error = "observed process identities remained after SIGKILL deadline"


def decode_wait_status(status):
    if status is None:
        return 3
    if os.WIFEXITED(status):
        return os.WEXITSTATUS(status)
    if os.WIFSIGNALED(status):
        return 128 + os.WTERMSIG(status)
    return 3


def scrubbed_target_env():
    if target_env_mode == "exact":
        result = {}
        for pair in target_env_pair_args:
            if "=" not in pair:
                raise OSError(errno.EINVAL, "target environment entry lacks '='")
            key, value = pair.split("=", 1)
            if (not key or not (key[0].isalpha() or key[0] == "_") or
                    any(not (char.isalnum() or char == "_") for char in key)):
                raise OSError(errno.EINVAL, "target environment key is not canonical")
            if key.startswith("BEAT_C_GUARD_"):
                raise OSError(errno.EINVAL, "target environment key uses reserved prefix")
            if key in result:
                raise OSError(errno.EINVAL, "duplicate target environment key")
            result[key] = value
        return result
    if target_env_mode != "inherit_scrubbed" or target_env_pair_args:
        raise OSError(errno.EINVAL, "target environment mode/entries mismatch")
    result = dict(os.environ)
    for key in list(result):
        if key.startswith("BEAT_C_GUARD_") or key in ("OLDPWD", "PWD", "SHLVL", "_"):
            result.pop(key, None)
    return result


def read_exact(fd, size):
    data = b""
    while len(data) < size:
        try:
            chunk = os.read(fd, size - len(data))
        except InterruptedError:
            if received_signal:
                raise GuardInterrupted(received_signal)
            continue
        if not chunk:
            raise OSError(errno.EPIPE, "startup barrier closed")
        data += chunk
    return data


def poll_readable(values, timeout_seconds):
    poller = select.poll()
    file_descriptors = []
    events = (
        select.POLLIN |
        select.POLLHUP |
        select.POLLERR |
        select.POLLNVAL
    )
    for value in values:
        file_descriptor = (
            value if isinstance(value, int) else value.fileno())
        if file_descriptor < 0:
            raise OSError(errno.EBADF, "readiness poll file descriptor is invalid")
        poller.register(file_descriptor, events)
        file_descriptors.append(file_descriptor)
    timeout_milliseconds = max(
        1, int(float(timeout_seconds) * 1000.0 + 0.999))
    return {
        file_descriptor
        for file_descriptor, _events in poller.poll(timeout_milliseconds)
        if file_descriptor in file_descriptors
    }


def read_exact_until(fd, size, deadline):
    data = b""
    while len(data) < size:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise StartupTimeout("startup readiness deadline exceeded")
        try:
            readable = poll_readable((fd,), remaining)
        except InterruptedError:
            if received_signal:
                raise GuardInterrupted(received_signal)
            continue
        if not readable:
            raise StartupTimeout("startup readiness deadline exceeded")
        try:
            chunk = os.read(fd, size - len(data))
        except InterruptedError:
            if received_signal:
                raise GuardInterrupted(received_signal)
            continue
        if not chunk:
            raise StartupFailure("startup barrier closed before readiness")
        data += chunk
    return data


def write_exact(fd, data):
    offset = 0
    while offset < len(data):
        try:
            written = os.write(fd, data[offset:])
        except InterruptedError:
            if received_signal:
                raise GuardInterrupted(received_signal)
            continue
        if written <= 0:
            raise OSError(errno.EPIPE, "startup barrier write failed")
        offset += written


def drain_output_streams():
    global combined_output_observed_bytes, combined_output_captured_bytes
    global combined_output_limit_status, combined_output_overflow_stream
    for label in ("stdout", "stderr"):
        if stream_eof[label]:
            continue
        read_fd = stream_read_fds.get(label, -1)
        if read_fd < 0:
            continue
        while True:
            try:
                chunk = os.read(read_fd, 65536)
            except BlockingIOError:
                break
            except InterruptedError:
                if received_signal:
                    raise GuardInterrupted(received_signal)
                continue
            if not chunk:
                os.close(read_fd)
                stream_read_fds[label] = -1
                stream_eof[label] = True
                break
            combined_output_observed_bytes += len(chunk)
            remaining = (
                combined_output_limit_bytes - combined_output_captured_bytes)
            if remaining > 0:
                captured = chunk[:remaining]
                write_all(output_fds[label], captured)
                combined_output_captured_bytes += len(captured)
            if len(chunk) > remaining:
                combined_output_limit_status = "exceeded"
                combined_output_overflow_stream = label
                return False
    return True


def output_streams_eof():
    return stream_eof["stdout"] and stream_eof["stderr"]


def drain_output_streams_bounded():
    deadline = time.monotonic() + cleanup_timeout_seconds
    while True:
        if not drain_output_streams():
            return "limit_exceeded"
        if output_streams_eof():
            return "eof"
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return "timeout"
        readable_fds = [
            fd for fd in stream_read_fds.values() if fd >= 0]
        if not readable_fds:
            return "eof"
        try:
            poll_readable(readable_fds, min(0.01, remaining))
        except InterruptedError:
            continue


def close_output_streams():
    for label in ("stdout", "stderr"):
        read_fd = stream_read_fds.get(label, -1)
        if read_fd >= 0:
            try:
                os.close(read_fd)
            except OSError:
                pass
            stream_read_fds[label] = -1
        stream_eof[label] = True


def send_parent_proof_record(root_pid):
    global target_env_injected_parent_proof_record_sha256
    global target_env_injected_parent_root_pid
    global target_env_injected_parent_root_start_tvsec
    global target_env_injected_parent_root_start_tvusec
    global target_env_injected_parent_root_ppid
    global target_env_injected_parent_root_sid
    global target_env_injected_parent_root_pgid
    monitor_identity = stable_process_proof_identity(os.getpid())
    root_identity = stable_process_proof_identity(root_pid)
    if monitor_identity is None or root_identity is None:
        raise StartupFailure("parent proof monitor/root identity vanished")
    record = {
        "schema": PARENT_PROOF_SCHEMA,
        "capability": target_env_injected_parent_capability,
        "monitorPid": target_env_injected_parent_monitor_pid,
        "monitorStartTvsec": monitor_identity["startTvsec"],
        "monitorStartTvusec": monitor_identity["startTvusec"],
        "limitBytes": target_env_injected_parent_limit_bytes,
        "rootPid": root_identity["pid"],
        "rootStartTvsec": root_identity["startTvsec"],
        "rootStartTvusec": root_identity["startTvusec"],
        "rootPpid": root_identity["ppid"],
        "rootSid": root_identity["sid"],
        "rootPgid": root_identity["pgid"],
    }
    if (
        os.environ.get("BEAT_C_GUARD_SELF_TEST_MODE") == "1"
        and os.environ.get(
            "BEAT_C_GUARD_SELF_TEST_TAMPER_PARENT_PROOF_CAPABILITY") == "1"
    ):
        record["capability"] = "0" * 64
    if list(record) != PARENT_PROOF_KEYS:
        raise StartupFailure("parent proof producer key order drifted")
    raw = (json.dumps(record, separators=(",", ":")) + "\n").encode("utf-8")
    if len(raw) > PARENT_PROOF_MAX_RECORD_BYTES:
        raise StartupFailure("parent proof record exceeds fixed byte limit")
    target_proof_monitor_socket.sendall(struct.pack(">I", len(raw)) + raw)
    target_env_injected_parent_proof_record_sha256 = (
        hashlib.sha256(raw).hexdigest())
    target_env_injected_parent_root_pid = record["rootPid"]
    target_env_injected_parent_root_start_tvsec = record["rootStartTvsec"]
    target_env_injected_parent_root_start_tvusec = record["rootStartTvusec"]
    target_env_injected_parent_root_ppid = record["rootPpid"]
    target_env_injected_parent_root_sid = record["rootSid"]
    target_env_injected_parent_root_pgid = record["rootPgid"]


def child_prepare_tracked_output_fds():
    if (
        tracked_output_fd_bindings
        and os.environ.get(
            "BEAT_C_GUARD_SELF_TEST_SKIP_TRACKED_OUTPUT_FD_DUP"
        ) == "1"
    ):
        raise StartupFailure(
            "tracked output fd inheritance was deliberately omitted"
        )
    temporary_fds = []
    try:
        for label in sorted(tracked_output_fd_bindings):
            binding = tracked_output_fd_bindings[label]
            temporary = fcntl.fcntl(
                output_fds[binding["fd_key"]],
                fcntl.F_DUPFD_CLOEXEC,
                128,
            )
            temporary_fds.append((binding, temporary))
            observed = tuple(
                int(getattr(os.fstat(temporary), field))
                for field in SEALED_PLATFORM_IDENTITY_FIELDS
            )
            if observed != binding["source_identity"]:
                raise StartupFailure(
                    "tracked output source fd identity drifted before dup"
                )
        for binding, temporary in temporary_fds:
            os.dup2(
                temporary,
                binding["fd"],
                inheritable=True,
            )
            observed = tuple(
                int(getattr(os.fstat(binding["fd"]), field))
                for field in SEALED_PLATFORM_IDENTITY_FIELDS
            )
            if (
                observed != binding["source_identity"]
                or not os.get_inheritable(binding["fd"])
            ):
                raise StartupFailure(
                    "tracked output target fd identity drifted after dup"
                )
    finally:
        for _binding, temporary in temporary_fds:
            try:
                os.close(temporary)
            except OSError:
                pass


def child_prepare_command_self_image_fd():
    if not command_self_image_fd:
        return
    if command_self_image_source_fd < 0:
        raise StartupFailure(
            "command self-image source fd is absent")
    temporary = fcntl.fcntl(
        command_self_image_source_fd,
        fcntl.F_DUPFD_CLOEXEC,
        256,
    )
    try:
        os.dup2(
            temporary,
            command_self_image_fd,
            inheritable=True,
        )
        observed_identity = command_self_image_full_identity(
            os.fstat(command_self_image_fd)
        )
        observed_inheritable = os.get_inheritable(
            command_self_image_fd
        )
        if (
            observed_identity != command_self_image_source_identity
            or not observed_inheritable
        ):
            raise StartupFailure(
                (
                    "command self-image target fd identity drifted after "
                    "dup expected=%r observed=%r inheritable=%d "
                    "source_fd=%d temporary_fd=%d target_fd=%d"
                ) % (
                    command_self_image_source_identity,
                    observed_identity,
                    int(observed_inheritable),
                    command_self_image_source_fd,
                    temporary,
                    command_self_image_fd,
                )
            )
    finally:
        os.close(temporary)


def child_close_uninherited_fds(handshake_fd):
    if (
        handshake_fd in {
            PARENT_PROOF_FD,
            command_self_image_fd,
            *(
                binding["fd"]
                for binding in tracked_output_fd_bindings.values()
            ),
        }
    ):
        raise StartupFailure(
            "fd inheritance handshake aliases an authority fd")
    preserved = sorted({
        PARENT_PROOF_FD,
        handshake_fd,
        *(
            binding["fd"]
            for binding in tracked_output_fd_bindings.values()
        ),
        *((command_self_image_fd,) if command_self_image_fd else ()),
    })
    maximum_fd = min(int(os.sysconf("SC_OPEN_MAX")), 1048576)
    cursor = PARENT_PROOF_FD + 1
    for descriptor in preserved:
        if descriptor < cursor:
            continue
        if cursor < descriptor:
            os.closerange(cursor, descriptor)
        cursor = descriptor + 1
    if cursor < maximum_fd:
        os.closerange(cursor, maximum_fd)
    for binding in tracked_output_fd_bindings.values():
        observed = tuple(
            int(getattr(os.fstat(binding["fd"]), field))
            for field in SEALED_PLATFORM_IDENTITY_FIELDS
        )
        if (
            observed != binding["source_identity"]
            or not os.get_inheritable(binding["fd"])
        ):
            raise StartupFailure(
                "tracked output inherited fd changed before exec"
            )
    if command_self_image_fd and (
        command_self_image_full_identity(
            os.fstat(command_self_image_fd))
            != command_self_image_source_identity
        or not os.get_inheritable(command_self_image_fd)
    ):
        raise StartupFailure(
            "command self-image inherited fd changed before exec")


def await_tracked_output_fd_inheritance():
    global target_fd_ready_read
    global tracked_output_fd_inheritance_status
    global command_self_image_inheritance_status
    if target_fd_ready_read < 0:
        raise StartupFailure(
            "tracked output fd inheritance handshake is absent"
        )
    try:
        observed = read_exact_until(
            target_fd_ready_read,
            1,
            time.monotonic() + startup_timeout_seconds,
        )
    except BaseException as exc:
        raise StartupFailure(
            "tracked output fd inheritance handshake failed: %s" % exc
        ) from exc
    finally:
        try:
            os.close(target_fd_ready_read)
        except OSError:
            pass
        target_fd_ready_read = -1
    if observed != b"F":
        raise StartupFailure(
            "tracked output fd inheritance handshake drifted"
        )
    tracked_output_fd_inheritance_status = (
        "verified_preexec_exact"
        if tracked_output_fd_bindings else "not_requested"
    )
    command_self_image_inheritance_status = (
        "verified_preexec_exact"
        if command_self_image_fd else "not_requested"
    )



def spawn_blocked():
    global child_pid, root_pgid, root_sid, startup_status
    global target_proof_monitor_socket, target_proof_unused_socket
    global target_fd_ready_read
    startup_status = "waiting"
    startup_deadline = time.monotonic() + startup_timeout_seconds
    seatbelt_profile_to_execute = darwin_seatbelt_profile
    if (
        command_execution_mode in (
            "sealed_system_volume_direct",
            "private_frozen_tree_direct",
        )
        and os.environ.get("BEAT_C_GUARD_SELF_TEST_MODE") == "1"
        and os.environ.get(
            "BEAT_C_GUARD_SELF_TEST_FORCE_SEATBELT_PROFILE_DRIFT") == "1"
    ):
        seatbelt_profile_to_execute += "(allow process-exec)\n"
    if (
        command_execution_mode in (
            "sealed_system_volume_direct",
            "private_frozen_tree_direct",
        )
        and hashlib.sha256(
            seatbelt_profile_to_execute.encode("utf-8")).hexdigest()
            != darwin_seatbelt_profile_sha256
    ):
        raise StartupFailure(
            "Darwin Seatbelt exact-exec profile drifted before launch")
    release_read, release_write = os.pipe()
    ready_read, ready_write = os.pipe()
    stdout_read, stdout_write = os.pipe()
    stderr_read, stderr_write = os.pipe()
    fd_ready_read, fd_ready_write = os.pipe()
    proof_monitor_socket, proof_child_socket = socket.socketpair(
        socket.AF_UNIX, socket.SOCK_STREAM)
    target_proof_monitor_socket = proof_monitor_socket
    _reserved_barrier_fds = {3, 9, 198, 256} | set(range(10, 64))

    def _barrier_fd_escape(fd):
        if fd not in _reserved_barrier_fds:
            return fd
        escaped = fcntl.fcntl(fd, fcntl.F_DUPFD_CLOEXEC, 300)
        os.close(fd)
        return escaped

    release_read = _barrier_fd_escape(release_read)
    release_write = _barrier_fd_escape(release_write)
    ready_read = _barrier_fd_escape(ready_read)
    ready_write = _barrier_fd_escape(ready_write)
    stdout_read = _barrier_fd_escape(stdout_read)
    stdout_write = _barrier_fd_escape(stdout_write)
    stderr_read = _barrier_fd_escape(stderr_read)
    stderr_write = _barrier_fd_escape(stderr_write)
    fd_ready_read = _barrier_fd_escape(fd_ready_read)
    fd_ready_write = _barrier_fd_escape(fd_ready_write)
    swap_proof_endpoints = (
        os.environ.get("BEAT_C_GUARD_SELF_TEST_MODE") == "1"
        and os.environ.get(
            "BEAT_C_GUARD_SELF_TEST_SWAP_PARENT_PROOF_ENDPOINTS") == "1"
    )
    try:
        pid = os.fork()
    except BaseException as exc:
        for fd in (
                release_read, release_write, ready_read, ready_write,
                stdout_read, stdout_write, stderr_read, stderr_write,
                fd_ready_read, fd_ready_write):
            os.close(fd)
        proof_monitor_socket.close()
        proof_child_socket.close()
        target_proof_monitor_socket = None
        raise StartupFailure("fork failed: %s" % exc)
    if pid == 0:
        try:
            inherited_proof_socket = (
                proof_monitor_socket
                if swap_proof_endpoints else proof_child_socket)
            if swap_proof_endpoints:
                proof_child_socket.close()
            else:
                proof_monitor_socket.close()
            os.close(release_write)
            os.close(ready_read)
            os.close(stdout_read)
            os.close(stderr_read)
            os.close(fd_ready_read)
            os.dup2(stdout_write, 1)
            os.dup2(stderr_write, 2)
            os.close(stdout_write)
            os.close(stderr_write)
            proof_child_fd = inherited_proof_socket.fileno()
            if proof_child_fd == PARENT_PROOF_FD:
                os.set_inheritable(PARENT_PROOF_FD, True)
                inherited_proof_socket.detach()
            else:
                os.dup2(
                    proof_child_fd, PARENT_PROOF_FD, inheritable=True)
                inherited_proof_socket.close()
            fd_handshake = fcntl.fcntl(
                fd_ready_write,
                fcntl.F_DUPFD_CLOEXEC,
                256,
            )
            os.close(fd_ready_write)
            if not parent_guard_mode:
                os.setsid()
            if os.environ.get("BEAT_C_GUARD_SELF_TEST_STALL_BEFORE_READY") == "1":
                time.sleep(startup_timeout_seconds + cleanup_timeout_seconds + 5)
            write_exact(ready_write, b"R")
            os.close(ready_write)
            if read_exact(release_read, 1) != b"G":
                os._exit(126)
            os.close(release_read)
            child_prepare_tracked_output_fds()
            child_prepare_command_self_image_fd()
            child_close_uninherited_fds(fd_handshake)
            write_exact(fd_handshake, b"F")
            os.close(fd_handshake)
            if command_execution_mode in (
                "sealed_system_volume_direct",
                "private_frozen_tree_direct",
            ):
                seatbelt_parameter_argv = []
                for parameter_name, parameter_value in \
                        darwin_seatbelt_parameters:
                    seatbelt_parameter_argv.extend([
                        "-D",
                        "%s=%s" % (parameter_name, parameter_value),
                    ])
                os.execve(
                    darwin_seatbelt_launcher_path,
                    [
                        darwin_seatbelt_launcher_path,
                        *seatbelt_parameter_argv,
                        "-p",
                        seatbelt_profile_to_execute,
                        command_snapshot_path,
                        *cmd[1:],
                    ],
                    target_env,
                )
            # Snapshot/direct modes execute their previously bound path.
            # Darwin sealed mode above uses Seatbelt to admit only the exact
            # attested target executable and reject every hidden child exec.
            os.execve(command_snapshot_path, cmd, target_env)
        except BaseException as exc:
            try:
                os.write(2, ("guard_child_launch_error=%s\n" % sanitize(exc)).encode())
            except BaseException:
                pass
            os._exit(127)
    child_pid = pid
    if swap_proof_endpoints:
        target_proof_unused_socket = proof_child_socket
    else:
        proof_child_socket.close()
    os.close(release_read)
    os.close(ready_write)
    os.close(stdout_write)
    os.close(stderr_write)
    os.close(fd_ready_write)
    target_fd_ready_read = fd_ready_read
    os.set_blocking(stdout_read, False)
    os.set_blocking(stderr_read, False)
    stream_read_fds["stdout"] = stdout_read
    stream_read_fds["stderr"] = stderr_read
    try:
        read_exact_until(ready_read, 1, startup_deadline)
        os.close(ready_read)
        root_pgid = os.getpgid(pid)
        root_sid = os.getsid(pid)
        send_parent_proof_record(pid)
        if (
            os.environ.get("BEAT_C_GUARD_SELF_TEST_MODE") == "1"
            and os.environ.get(
                "BEAT_C_GUARD_SELF_TEST_CLOSE_PARENT_PROOF_PEER") == "1"
        ):
            target_proof_monitor_socket.close()
            target_proof_monitor_socket = None
        startup_status = "ready"
        return release_write
    except BaseException:
        for fd in (
            ready_read,
            release_write,
            stdout_read,
            stderr_read,
            fd_ready_read,
        ):
            try:
                os.close(fd)
            except OSError:
                pass
        stream_read_fds["stdout"] = -1
        stream_read_fds["stderr"] = -1
        target_fd_ready_read = -1
        if target_proof_monitor_socket is not None:
            target_proof_monitor_socket.close()
            target_proof_monitor_socket = None
        if target_proof_unused_socket is not None:
            target_proof_unused_socket.close()
            target_proof_unused_socket = None
        raise


def signal_handler(signum, _frame):
    global received_signal
    received_signal = signum
    raise GuardInterrupted(signum)


def write_report():
    global output_path_history_status
    footprint_status = "available" if platform_is_darwin else "unsupported"
    enforcement_metric = (
        "max_process_tree_resident_and_phys_footprint"
        if platform_is_darwin else "process_tree_resident"
    )
    enforcement_kind = (
        "darwin_cooperative_process_tree_poll"
        if platform_is_darwin else "userspace_cooperative_process_tree_poll"
    )
    if parent_guard_mode:
        membership_metric = (
            "darwin_libproc_identity_history_descendants_parent_owned_group"
            if platform_is_darwin else
            "linux_procfs_identity_history_descendants_parent_owned_group"
        )
        memory_guard_scope = "identity_history_descendants_parent_owned_group"
    else:
        membership_metric = (
            "darwin_libproc_identity_history_group_session_and_descendants"
            if platform_is_darwin else
            "linux_procfs_identity_history_tree_process_group_and_session"
        )
        memory_guard_scope = (
            "identity_history_union_group_session_and_descendants")
    completed = (
        not abort_reason
        and exit_code_contract_status == "verified"
        and actual_exit_code == expected_exit_code
    )
    observed_sample_status = (
        "proved"
        if completed and measurement_status == "available" and sample_count > 0
        and root_identity_sampled == 1 and max_process_count > 0
        and (rss_limit_bytes == 0 or max_enforced_bytes <= rss_limit_bytes)
        else "not_proved"
    )
    if tracked_output_failure_label:
        verify_support_output_identities()
        output_path_history_status = "failed_closed"
    else:
        verify_all_output_identities()
    if tracked_outputs and not tracked_output_evidence:
        collect_tracked_output_evidence(require_complete=False)
    if output_path_history_status == "armed":
        output_path_history_status = "verified_clean"
    support_labels = [
        label for label in sorted(output_fds)
        if not label.startswith("tracked:") and label != "report"
    ]
    for label in support_labels:
        seal_held_output(label, 0o400)
    artifact_evidence = {}
    for label in ("stdout", "stderr", "resource_trace", "phase_trace"):
        if label in output_fds:
            digest, identity = held_output_digest(label)
            artifact_evidence[label] = (digest, identity)
    report_identity = held_output_identity("report")
    os.lseek(output_fds["report"], 0, os.SEEK_SET)
    os.ftruncate(output_fds["report"], 0)
    with CanonicalReceiptWriter(
        os.fdopen(os.dup(output_fds["report"]), "w", encoding="utf-8")
    ) as report:
        report.write("tool=tools/beat_c_process_group_guard.sh\n")
        report.write("schema=beat_c_process_memory_guard\n")
        report.write("inherited_authority_mode=%s\n" % (
            "exact" if inherited_authority_mode else "not_requested"))
        report.write("guard_authority_status=%s\n" %
                     guard_authority_status)
        report.write("guard_authority_fd=%d\n" % guard_authority_fd)
        report.write("guard_authority_path=%s\n" %
                     sanitize(guard_authority_path))
        report.write("guard_authority_sha256=%s\n" %
                     guard_authority_sha256)
        report.write("guard_authority_device=%d\n" %
                     guard_authority_device)
        report.write("guard_authority_inode=%d\n" %
                     guard_authority_inode)
        report.write("guard_authority_mode=%o\n" %
                     guard_authority_mode)
        report.write("guard_authority_nlink=%d\n" %
                     guard_authority_nlink)
        report.write("guard_authority_uid=%d\n" %
                     guard_authority_uid)
        report.write("guard_authority_gid=%d\n" %
                     guard_authority_gid)
        report.write("guard_authority_size=%d\n" %
                     guard_authority_size)
        report.write("guard_authority_mtime_ns=%d\n" %
                     guard_authority_mtime_ns)
        report.write("guard_authority_ctime_ns=%d\n" %
                     guard_authority_ctime_ns)
        report.write("output_artifact_schema=cheng.guard.output_artifacts\n")
        report.write("output_artifact_count=%d\n" % len(output_fds))
        report.write(
            "precreated_output_authority_schema="
            "cheng.guard.precreated_output_authority\n")
        report.write(
            "precreated_output_authority_status=%s\n" % (
                "required_verified"
                if require_precreated_output_authority
                else "not_required"))
        report.write("output_path_history_schema=%s\n" % output_path_history_schema)
        report.write("output_path_history_monitor=%s\n" % output_path_history_monitor_kind)
        report.write("output_path_history_status=%s\n" % output_path_history_status)
        report.write("output_path_history_watch_count=%d\n" % output_path_history_watch_count)
        report.write("output_path_history_forbidden_events=%s\n" %
                     output_path_history_forbidden_events)
        report.write("report_path=%s\n" % sanitize(report_path))
        report.write("report_device=%d\n" % int(report_identity.st_dev))
        report.write("report_inode=%d\n" % int(report_identity.st_ino))
        for label in ("stdout", "stderr", "resource_trace", "phase_trace"):
            enabled = label in artifact_evidence
            report.write("%s_status=%s\n" % (label, "available" if enabled else "disabled"))
            report.write("%s_path=%s\n" % (label, sanitize(output_paths.get(label, ""))))
            report.write("%s_sha256=%s\n" % (label, artifact_evidence[label][0] if enabled else ""))
            report.write("%s_device=%d\n" % (label, int(artifact_evidence[label][1].st_dev) if enabled else 0))
            report.write("%s_inode=%d\n" % (label, int(artifact_evidence[label][1].st_ino) if enabled else 0))
            report.write("%s_mode=%o\n" % (label, int(artifact_evidence[label][1].st_mode) if enabled else 0))
            report.write("%s_nlink=%d\n" % (label, int(artifact_evidence[label][1].st_nlink) if enabled else 0))
            report.write("%s_uid=%d\n" % (label, int(artifact_evidence[label][1].st_uid) if enabled else 0))
            report.write("%s_gid=%d\n" % (label, int(artifact_evidence[label][1].st_gid) if enabled else 0))
            report.write("%s_size=%d\n" % (label, int(artifact_evidence[label][1].st_size) if enabled else 0))
            report.write("%s_mtime_ns=%d\n" % (label, int(artifact_evidence[label][1].st_mtime_ns) if enabled else 0))
            report.write("%s_ctime_ns=%d\n" % (label, int(artifact_evidence[label][1].st_ctime_ns) if enabled else 0))
        report.write("tracked_output_schema=cheng.guard.tracked_outputs\n")
        report.write(
            "tracked_output_size_evidence_kind="
            "final_size_only_not_runtime_peak\n")
        report.write(
            "tracked_output_publication_policy="
            "guard_owned_0600_then_success_seal_0400_or0500\n")
        report.write(
            "tracked_output_fd_schema="
            "cheng.guard.tracked_output_inherited_fd\n")
        report.write(
            "tracked_output_fd_count=%d\n" %
            len(tracked_output_fd_bindings))
        report.write(
            "tracked_output_fd_argv_sha256=%s\n" %
            tracked_output_fd_argv_sha256)
        report.write(
            "tracked_output_fd_status=%s\n" %
            tracked_output_fd_inheritance_status)
        report.write("tracked_output_count=%d\n" % len(tracked_output_evidence))
        report.write("tracked_output_failure_label=%s\n" %
                     tracked_output_failure_label)
        report.write("tracked_output_failure_error=%s\n" %
                     sanitize(tracked_output_failure_error))
        report.write("tracked_output_failure_class=%s\n" % (
            "CFAIL" if tracked_output_failure_label else ""))
        for index, label in enumerate(sorted(tracked_output_evidence)):
            item = tracked_output_evidence[label]
            prefix = "tracked_output_%d_" % index
            report.write("%slabel=%s\n" % (prefix, label))
            report.write("%spath=%s\n" % (prefix, sanitize(item["path"])))
            report.write("%sstatus=%s\n" % (prefix, item["status"]))
            report.write("%srequired_mode=%s\n" %
                         (prefix, item["required_mode"]))
            report.write("%smax_bytes=%d\n" %
                         (prefix, item["max_bytes"]))
            report.write("%ssha256=%s\n" % (prefix, item["sha256"]))
            report.write("%spreopen_path_status=%s\n" %
                         (prefix, item["preopen_path_status"]))
            report.write("%sopen_device=%d\n" %
                         (prefix, item["open_device"]))
            report.write("%sopen_inode=%d\n" %
                         (prefix, item["open_inode"]))
            report.write("%sdevice=%d\n" % (prefix, item["device"]))
            report.write("%sinode=%d\n" % (prefix, item["inode"]))
            report.write("%snlink=%d\n" % (prefix, item["nlink"]))
            report.write("%suid=%d\n" % (prefix, item["uid"]))
            report.write("%sgid=%d\n" % (prefix, item["gid"]))
            report.write("%sidentity_stable=%d\n" %
                         (prefix, item["identity_stable"]))
            report.write("%ssize=%d\n" % (prefix, item["size"]))
            report.write("%smode=%o\n" % (prefix, item["mode"]))
            report.write("%smtime_ns=%d\n" %
                         (prefix, item["mtime_ns"]))
            report.write("%sctime_ns=%d\n" %
                         (prefix, item["ctime_ns"]))
            report.write("%sopen_mode=%o\n" %
                         (prefix, item["open_mode"]))
            report.write("%spreseal_mode=%o\n" %
                         (prefix, item["preseal_mode"]))
            report.write("%sfinal_mode=%o\n" %
                         (prefix, item["final_mode"]))
            report.write("%sseal_status=%s\n" %
                         (prefix, item["seal_status"]))
            report.write("%starget_fd=%d\n" %
                         (prefix, item["target_fd"]))
            report.write("%starget_fd_path=%s\n" %
                         (prefix, item["target_fd_path"]))
            report.write("%starget_fd_authority_mode=%s\n" %
                         (prefix, item[
                             "target_fd_authority_mode"]))
            report.write("%starget_fd_authority_selector=%s\n" %
                         (prefix, sanitize(item[
                             "target_fd_authority_selector"])))
            report.write("%starget_fd_authority_role=%s\n" %
                         (prefix, item[
                             "target_fd_authority_role"]))
            report.write("%starget_fd_argv_count=%d\n" %
                         (prefix, item["target_fd_argv_count"]))
            report.write("%starget_fd_argv_sha256=%s\n" %
                         (prefix, item["target_fd_argv_sha256"]))
            report.write("%starget_fd_inheritance_status=%s\n" %
                         (prefix, item[
                             "target_fd_inheritance_status"]))
            report.write("%starget_fd_identity_status=%s\n" %
                         (prefix, item["target_fd_identity_status"]))
        report.write("command_identity_status=%s\n" % command_identity_status)
        report.write("command_identity_error=%s\n" % sanitize(command_identity_error))
        report.write("command_path=%s\n" % sanitize(command_path))
        report.write("command_sha256=%s\n" % command_sha256)
        report.write("command_device=%d\n" % command_device)
        report.write("command_inode=%d\n" % command_inode)
        report.write("command_mode=%o\n" % command_mode)
        report.write("command_nlink=%d\n" % command_nlink)
        report.write("command_uid=%d\n" % command_uid)
        report.write("command_gid=%d\n" % command_gid)
        report.write("command_size=%d\n" % command_size)
        report.write("command_mtime_ns=%d\n" % command_mtime_ns)
        report.write("command_ctime_ns=%d\n" % command_ctime_ns)
        report.write("command_authority_fd=%d\n" %
                     command_authority_fd)
        report.write("command_authority_status=%s\n" %
                     command_authority_status)
        report.write("expected_command_path=%s\n" %
                     sanitize(expected_command_path))
        report.write("expected_command_sha256=%s\n" %
                     expected_command_sha256)
        report.write("formal_command_identity_status=%s\n" % (
            (
                "required_verified"
                if command_identity_status == "available"
                else "required_unverified"
            )
            if require_command_identity else "not_required"
        ))
        report.write("command_execution_snapshot_schema=cheng.guard.command_snapshot\n")
        report.write("command_execution_mode=%s\n" % command_execution_mode)
        report.write("command_execution_trust_boundary=%s\n" % {
            "private_single_link_snapshot":
                "private_0700_snapshot_with_post_run_identity_detection_not_same_uid_isolation",
            "sealed_system_volume_direct":
                "darwin_sealed_readonly_root_platform_path_with_pre_post_full_identity_bytes_sha256_and_seatbelt_exact_exec",
            "private_frozen_tree_direct":
                "darwin_private_frozen_tree_original_path_with_pre_post_command_and_full_closure_identity_kqueue_full_vnode_watch_ssv_attested_seatbelt_exact_exec_not_same_uid_isolation",
            "direct":
                "direct_path_with_pre_post_identity_detection_not_same_uid_isolation",
        }[command_execution_mode])
        report.write("command_execution_snapshot_path=%s\n" % sanitize(command_snapshot_path))
        report.write("command_execution_snapshot_sha256=%s\n" % command_snapshot_sha256)
        report.write("command_execution_snapshot_device=%d\n" % command_snapshot_device)
        report.write("command_execution_snapshot_inode=%d\n" % command_snapshot_inode)
        report.write("command_execution_snapshot_mode=%o\n" %
                     command_snapshot_mode)
        report.write("command_execution_snapshot_nlink=%d\n" %
                     command_snapshot_nlink)
        report.write("command_execution_snapshot_uid=%d\n" %
                     command_snapshot_uid)
        report.write("command_execution_snapshot_gid=%d\n" %
                     command_snapshot_gid)
        report.write("command_execution_snapshot_size=%d\n" % command_snapshot_size)
        report.write("command_execution_snapshot_mtime_ns=%d\n" % command_snapshot_mtime_ns)
        report.write("command_execution_snapshot_ctime_ns=%d\n" % command_snapshot_ctime_ns)
        report.write(
            "self_image_fd_schema=cheng.guard.command_self_image_fd\n")
        report.write("self_image_fd=%d\n" % command_self_image_fd)
        report.write("self_image_source_path=%s\n" %
                     sanitize(command_self_image_source_path))
        report.write("self_image_source_sha256=%s\n" %
                     command_self_image_source_sha256)
        report.write("self_image_source_device=%d\n" % (
            command_self_image_source_identity[0]
            if command_self_image_source_identity else 0))
        report.write("self_image_source_inode=%d\n" % (
            command_self_image_source_identity[1]
            if command_self_image_source_identity else 0))
        report.write("self_image_source_mode=%o\n" % (
            command_self_image_source_identity[2]
            if command_self_image_source_identity else 0))
        report.write("self_image_source_nlink=%d\n" % (
            command_self_image_source_identity[3]
            if command_self_image_source_identity else 0))
        report.write("self_image_source_uid=%d\n" % (
            command_self_image_source_identity[4]
            if command_self_image_source_identity else 0))
        report.write("self_image_source_gid=%d\n" % (
            command_self_image_source_identity[5]
            if command_self_image_source_identity else 0))
        report.write("self_image_source_size=%d\n" % (
            command_self_image_source_identity[6]
            if command_self_image_source_identity else 0))
        report.write("self_image_source_mtime_ns=%d\n" % (
            command_self_image_source_identity[7]
            if command_self_image_source_identity else 0))
        report.write("self_image_source_ctime_ns=%d\n" % (
            command_self_image_source_identity[8]
            if command_self_image_source_identity else 0))
        report.write("self_image_argv_count=%d\n" %
                     command_self_image_argv_count)
        report.write("self_image_argv_sha256=%s\n" %
                     command_self_image_argv_sha256)
        report.write("self_image_authority_status=%s\n" %
                     command_self_image_authority_status)
        report.write("self_image_inheritance_status=%s\n" %
                     command_self_image_inheritance_status)
        report.write("self_image_identity_status=%s\n" %
                     command_self_image_identity_status)
        report.write("self_image_source_fd_close_status=%s\n" %
                     command_self_image_source_fd_close_status)
        report.write(
            "private_frozen_tree_direct_schema="
            "cheng.guard.darwin_private_frozen_tree_direct\n")
        report.write("private_frozen_tree_direct_status=%s\n" %
                     private_frozen_tree_status)
        report.write("private_frozen_tree_root=%s\n" %
                     sanitize(private_frozen_tree_root))
        report.write("private_frozen_tree_expected_sha256=%s\n" %
                     private_frozen_tree_expected_sha256)
        report.write("private_frozen_tree_sha256=%s\n" %
                     private_frozen_tree_sha256)
        report.write("private_frozen_tree_entry_count=%d\n" %
                     private_frozen_tree_entry_count)
        report.write("private_frozen_tree_directory_count=%d\n" %
                     private_frozen_tree_directory_count)
        report.write("private_frozen_tree_file_count=%d\n" %
                     private_frozen_tree_file_count)
        report.write(
            "private_frozen_tree_ordering="
            "relative_path_fsbytes_then_kind_directory_before_regular\n")
        report.write(
            "private_frozen_tree_node_policy="
            "directories_and_single_link_regular_files_only\n")
        report.write("private_frozen_tree_command_membership_status=%s\n" % (
            "verified_single_link_executable_member"
            if private_frozen_tree_status == "verified"
            else "not_applicable"))
        report.write(
            "private_frozen_tree_watch_schema="
            "cheng.guard.darwin_private_frozen_tree_kqueue_watch\n")
        report.write("private_frozen_tree_watch_status=%s\n" %
                     private_frozen_tree_watch_status)
        report.write("private_frozen_tree_watch_count=%d\n" %
                     private_frozen_tree_watch_count)
        report.write("private_frozen_tree_watch_coverage=%s\n" % (
            "root_all_directories_and_all_regular_files"
            if private_frozen_tree_status == "verified"
            else "not_applicable"))
        report.write(
            "private_frozen_tree_watch_forbidden_events="
            "write,delete,extend,link,rename,revoke,"
            "attrib_without_exact_terminal_identity\n")
        report.write("private_frozen_tree_precheck_status=%s\n" %
                     private_frozen_tree_precheck_status)
        report.write("private_frozen_tree_postcheck_status=%s\n" %
                     private_frozen_tree_postcheck_status)
        report.write(
            "private_frozen_tree_attrib_event_status=%s\n" %
            private_frozen_tree_attrib_event_status)
        report.write(
            "private_frozen_tree_attrib_event_count=%d\n" %
            private_frozen_tree_attrib_event_count)
        report.write("private_frozen_tree_ssv_launcher_status=%s\n" %
                     private_frozen_tree_ssv_launcher_status)
        report.write("private_frozen_tree_ssv_root_device=%d\n" %
                     private_frozen_tree_ssv_root_device)
        report.write("private_frozen_tree_ssv_root_sealed=%d\n" %
                     private_frozen_tree_ssv_root_sealed)
        report.write("private_frozen_tree_ssv_root_read_only=%d\n" %
                     private_frozen_tree_ssv_root_read_only)
        report.write(
            "private_frozen_tree_same_uid_boundary="
            "mutation_detected_not_malicious_same_uid_isolation\n")
        report.write(
            "sealed_system_volume_direct_schema="
            "cheng.guard.darwin_sealed_system_volume_direct\n")
        report.write("sealed_system_volume_direct_status=%s\n" %
                     sealed_system_volume_status)
        report.write("sealed_system_volume_root_path=%s\n" %
                     sealed_system_volume_root_path)
        report.write("sealed_system_volume_root_device=%d\n" %
                     sealed_system_volume_root_device)
        report.write(
            "sealed_system_volume_format_capabilities=%08x\n" %
            sealed_system_volume_format_capabilities)
        report.write(
            "sealed_system_volume_format_capabilities_valid=%08x\n" %
            sealed_system_volume_format_capabilities_valid)
        report.write("sealed_system_volume_root_sealed=%d\n" %
                     sealed_system_volume_sealed)
        report.write("sealed_system_volume_root_read_only=%d\n" %
                     sealed_system_volume_read_only)
        report.write("sealed_system_volume_platform_path=%s\n" %
                     sealed_system_volume_platform_path)
        report.write("sealed_system_volume_platform_identity_status=%s\n" %
                     (
                         "verified"
                         if sealed_system_volume_status == "verified"
                         else "not_applicable"
                     ))
        report.write("sealed_system_volume_platform_sha256=%s\n" %
                     sealed_system_volume_platform_sha256)
        report.write("sealed_system_volume_platform_device=%d\n" %
                     sealed_system_volume_platform_device)
        report.write("sealed_system_volume_platform_inode=%d\n" %
                     sealed_system_volume_platform_inode)
        report.write("sealed_system_volume_platform_mode=%o\n" %
                     sealed_system_volume_platform_mode)
        report.write("sealed_system_volume_platform_nlink=%d\n" %
                     sealed_system_volume_platform_nlink)
        report.write("sealed_system_volume_platform_uid=%d\n" %
                     sealed_system_volume_platform_uid)
        report.write("sealed_system_volume_platform_gid=%d\n" %
                     sealed_system_volume_platform_gid)
        report.write("sealed_system_volume_platform_size=%d\n" %
                     sealed_system_volume_platform_size)
        report.write("sealed_system_volume_platform_mtime_ns=%d\n" %
                     sealed_system_volume_platform_mtime_ns)
        report.write("sealed_system_volume_platform_ctime_ns=%d\n" %
                     sealed_system_volume_platform_ctime_ns)
        report.write(
            "darwin_seatbelt_exact_exec_schema="
            "cheng.guard.darwin_seatbelt_exact_exec\n")
        report.write("darwin_seatbelt_exact_exec_status=%s\n" %
                     darwin_seatbelt_exact_exec_status)
        report.write("darwin_seatbelt_launcher_path=%s\n" %
                     sanitize(darwin_seatbelt_launcher_path))
        report.write("darwin_seatbelt_launcher_sha256=%s\n" %
                     darwin_seatbelt_launcher_sha256)
        report.write("darwin_seatbelt_launcher_device=%d\n" %
                     darwin_seatbelt_launcher_device)
        report.write("darwin_seatbelt_launcher_inode=%d\n" %
                     darwin_seatbelt_launcher_inode)
        report.write("darwin_seatbelt_launcher_mode=%o\n" %
                     darwin_seatbelt_launcher_mode)
        report.write("darwin_seatbelt_launcher_nlink=%d\n" %
                     darwin_seatbelt_launcher_nlink)
        report.write("darwin_seatbelt_launcher_uid=%d\n" %
                     darwin_seatbelt_launcher_uid)
        report.write("darwin_seatbelt_launcher_gid=%d\n" %
                     darwin_seatbelt_launcher_gid)
        report.write("darwin_seatbelt_launcher_size=%d\n" %
                     darwin_seatbelt_launcher_size)
        report.write("darwin_seatbelt_launcher_mtime_ns=%d\n" %
                     darwin_seatbelt_launcher_mtime_ns)
        report.write("darwin_seatbelt_launcher_ctime_ns=%d\n" %
                     darwin_seatbelt_launcher_ctime_ns)
        report.write("darwin_seatbelt_profile_sha256=%s\n" %
                     darwin_seatbelt_profile_sha256)
        report.write("darwin_seatbelt_allowed_exec_path=%s\n" %
                     sanitize(darwin_seatbelt_allowed_exec_path))
        report.write("darwin_seatbelt_parameter_count=%d\n" %
                     darwin_seatbelt_parameter_count)
        report.write("darwin_seatbelt_parameter_sha256=%s\n" %
                     darwin_seatbelt_parameter_sha256)
        report.write("darwin_seatbelt_allowed_output_count=%d\n" %
                     darwin_seatbelt_allowed_output_count)
        report.write("darwin_seatbelt_hidden_exec_policy=%s\n" % (
            "deny_all_except_exact_target"
            if darwin_seatbelt_exact_exec_status == "verified"
            else "not_applicable"))
        report.write("darwin_seatbelt_fork_policy=%s\n" % (
            "deny"
            if darwin_seatbelt_exact_exec_status == "verified"
            else "not_applicable"))
        report.write("darwin_seatbelt_write_policy=%s\n" % (
            "deny_all_except_exact_tracked_outputs"
            if darwin_seatbelt_exact_exec_status == "verified"
            else "not_applicable"))
        report.write(
            "publication_channel_schema="
            "cheng.guard.publication_channel\n")
        report.write("publication_channel_status=%s\n" %
                     publication_channel_status)
        report.write("publication_channel_error=%s\n" %
                     sanitize(publication_channel_error))
        report.write("publication_work_root_fshex=%s\n" %
                     publication_work_root_fshex)
        report.write("publication_publish_root_fshex=%s\n" %
                     publication_publish_root_fshex)
        for kind, requested_path, manifest in (
            (
                "argv",
                publication_argv_manifest_requested,
                publication_argv_manifest,
            ),
            (
                "env",
                publication_env_manifest_requested,
                publication_env_manifest,
            ),
        ):
            record = publication_manifest_records.get(kind)
            identity = record["identity"] if record is not None else (0,) * 9
            report.write(
                "publication_%s_manifest_path=%s\n" % (
                    kind, sanitize(requested_path)))
            report.write(
                "publication_%s_manifest_raw32=%s\n" % (
                    kind, record["raw32"] if record is not None else ""))
            for field, value in zip(
                (
                    "device",
                    "inode",
                    "mode",
                    "nlink",
                    "uid",
                    "gid",
                    "size",
                    "mtime_ns",
                    "ctime_ns",
                ),
                identity,
            ):
                rendered = (
                    format(value, "o")
                    if field == "mode"
                    else str(value)
                )
                report.write(
                    "publication_%s_manifest_%s=%s\n" % (
                        kind, field, rendered))
            report.write(
                "publication_%s_physical_sha256=%s\n" % (
                    kind,
                    manifest["physical_digest"]
                    if manifest is not None else "",
                ))
            report.write(
                "publication_%s_logical_sha256=%s\n" % (
                    kind,
                    manifest["logical_digest"]
                    if manifest is not None else "",
                ))
            report.write(
                "publication_%s_path_role_sha256=%s\n" % (
                    kind,
                    manifest["path_role_digest"]
                    if manifest is not None else "",
                ))
            report.write(
                "publication_%s_support_path_role_sha256=%s\n" % (
                    kind,
                    manifest["support_path_role_digest"]
                    if manifest is not None else "",
                ))
        report.write("command_argv_schema=cheng.guard.command_argv\n")
        report.write("command_argv_count=%d\n" % command_argv_count)
        report.write("command_argv_sha256=%s\n" % command_argv_sha256)
        report.write("target_env_schema=cheng.guard.target_env\n")
        report.write("target_env_mode=%s\n" % target_env_mode)
        report.write("target_env_requested_schema=cheng.guard.target_env.requested\n")
        report.write("target_env_requested_count=%d\n" %
                     target_env_requested_count)
        report.write("target_env_requested_sha256=%s\n" %
                     target_env_requested_sha256)
        report.write("target_env_count=%d\n" % target_env_count)
        report.write("target_env_sha256=%s\n" % target_env_sha256)
        report.write(
            "target_env_injected_parent_schema="
            "cheng.guard.target_env.injected_parent\n")
        report.write("target_env_injected_parent_capability=%s\n" %
                     target_env_injected_parent_capability)
        report.write(
            "target_env_injected_parent_capability_sha256=%s\n" %
            target_env_injected_parent_capability_sha256)
        report.write("target_env_injected_parent_monitor_pid=%d\n" %
                     target_env_injected_parent_monitor_pid)
        report.write("target_env_injected_parent_limit_bytes=%d\n" %
                     target_env_injected_parent_limit_bytes)
        report.write("target_env_injected_parent_proof_fd=%d\n" %
                     target_env_injected_parent_proof_fd)
        report.write(
            "target_env_injected_parent_proof_record_sha256=%s\n" %
            target_env_injected_parent_proof_record_sha256)
        report.write("target_env_injected_parent_root_pid=%d\n" %
                     target_env_injected_parent_root_pid)
        report.write(
            "target_env_injected_parent_root_start_tvsec=%d\n" %
            target_env_injected_parent_root_start_tvsec)
        report.write(
            "target_env_injected_parent_root_start_tvusec=%d\n" %
            target_env_injected_parent_root_start_tvusec)
        report.write("target_env_injected_parent_root_ppid=%d\n" %
                     target_env_injected_parent_root_ppid)
        report.write("target_env_injected_parent_root_sid=%d\n" %
                     target_env_injected_parent_root_sid)
        report.write("target_env_injected_parent_root_pgid=%d\n" %
                     target_env_injected_parent_root_pgid)
        report.write("parent_guard_mode=%s\n" % (
            "same_session_descendant" if parent_guard_mode else "standalone"))
        report.write("parent_guard_monitor_pid=%d\n" % parent_guard_monitor_pid)
        report.write("parent_guard_capability_sha256=%s\n" %
                     parent_guard_capability_sha256)
        report.write("parent_guard_limit_bytes=%d\n" % parent_guard_limit_bytes)
        report.write("parent_guard_binding_status=%s\n" %
                     parent_guard_binding_status)
        report.write("parent_guard_proof_fd=%d\n" %
                     parent_guard_proof_fd)
        report.write("parent_guard_proof_peer_pid=%d\n" %
                     parent_guard_proof_peer_pid)
        report.write("parent_guard_proof_record_sha256=%s\n" %
                     parent_guard_proof_record_sha256)
        report.write("parent_guard_root_pid=%d\n" %
                     parent_guard_root_pid)
        report.write("parent_guard_root_start_tvsec=%d\n" %
                     parent_guard_root_start_tvsec)
        report.write("parent_guard_root_start_tvusec=%d\n" %
                     parent_guard_root_start_tvusec)
        report.write("parent_guard_root_ppid=%d\n" %
                     parent_guard_root_ppid)
        report.write("parent_guard_root_sid=%d\n" %
                     parent_guard_root_sid)
        report.write("parent_guard_root_pgid=%d\n" %
                     parent_guard_root_pgid)
        report.write("monitor_python_path=%s\n" % sanitize(monitor_python_path))
        report.write("monitor_python_sha256=%s\n" % monitor_python_sha256)
        report.write("monitor_python_device=%d\n" % monitor_python_device)
        report.write("monitor_python_inode=%d\n" % monitor_python_inode)
        report.write("monitor_python_mode=%o\n" % monitor_python_mode)
        report.write("monitor_python_nlink=%d\n" %
                     monitor_python_nlink)
        report.write("monitor_python_uid=%d\n" % monitor_python_uid)
        report.write("monitor_python_gid=%d\n" % monitor_python_gid)
        report.write("monitor_python_size=%d\n" % monitor_python_size)
        report.write("monitor_python_mtime_ns=%d\n" % monitor_python_mtime_ns)
        report.write("monitor_python_ctime_ns=%d\n" % monitor_python_ctime_ns)
        report.write("monitor_python_authority_fd=%d\n" %
                     monitor_python_authority_fd)
        report.write("monitor_python_inherited_authority_status=%s\n" %
                     monitor_python_authority_status)
        report.write(
            "monitor_runtime_script_schema="
            "cheng.guard.monitor_runtime_script\n")
        report.write("monitor_runtime_script_path=%s\n" %
                     sanitize(monitor_runtime_script_path))
        report.write("monitor_runtime_script_sha256=%s\n" %
                     monitor_runtime_script_sha256)
        report.write("monitor_runtime_script_device=%d\n" %
                     monitor_runtime_script_device)
        report.write("monitor_runtime_script_inode=%d\n" %
                     monitor_runtime_script_inode)
        report.write("monitor_runtime_script_mode=%o\n" %
                     monitor_runtime_script_mode)
        report.write("monitor_runtime_script_nlink=%d\n" %
                     monitor_runtime_script_nlink)
        report.write("monitor_runtime_script_uid=%d\n" %
                     monitor_runtime_script_uid)
        report.write("monitor_runtime_script_gid=%d\n" %
                     monitor_runtime_script_gid)
        report.write("monitor_runtime_script_size=%d\n" %
                     monitor_runtime_script_size)
        report.write("monitor_runtime_script_mtime_ns=%d\n" %
                     monitor_runtime_script_mtime_ns)
        report.write("monitor_runtime_script_ctime_ns=%d\n" %
                     monitor_runtime_script_ctime_ns)
        report.write("monitor_runtime_script_fd=%d\n" %
                     monitor_runtime_script_fd)
        report.write("monitor_runtime_script_invocation_status=%s\n" %
                     monitor_runtime_script_invocation_status)
        report.write("monitor_runtime_script_stage_expected_sha256=%s\n" %
                     monitor_runtime_script_stage_expected_sha256)
        report.write("monitor_runtime_script_builtin_sha256=%s\n" %
                     monitor_runtime_script_builtin_sha256)
        report.write("monitor_runtime_script_expected_sha_match=%d\n" %
                     monitor_runtime_script_expected_sha_match)
        report.write(
            "monitor_python_startup_flags_schema="
            "cheng.guard.monitor_python_startup_flags\n")
        report.write("monitor_python_startup_flags_status=%s\n" %
                     monitor_python_startup_flags_status)
        report.write(
            "monitor_python_authority_schema=%s\n" %
            MONITOR_PYTHON_AUTHORITY_SCHEMA)
        report.write("monitor_python_authority_status=verified\n")
        report.write("monitor_python_implementation=%s\n" %
                     MONITOR_PYTHON_IMPLEMENTATION)
        report.write("monitor_python_version=%s\n" %
                     MONITOR_PYTHON_VERSION)
        report.write("monitor_python_base_prefix=%s\n" %
                     sanitize(MONITOR_BASE_PREFIX))
        for flag_name in (
            "isolated",
            "ignore_environment",
            "no_site",
            "no_user_site",
            "dont_write_bytecode",
        ):
            report.write("monitor_python_flag_%s=%d\n" % (
                flag_name, int(getattr(sys.flags, flag_name))))
        report.write(
            "monitor_python_safe_path_consistency_status=%s\n" %
            MONITOR_SAFE_PATH_CONSISTENCY_STATUS)
        report.write(
            "monitor_python_safe_path_observed=%s\n" %
            MONITOR_SAFE_PATH_OBSERVED)
        report.write(
            "monitor_python_preappend_sys_path_schema="
            "cheng.guard.monitor_python_preappend_sys_path\n")
        report.write("monitor_python_preappend_sys_path_count=%d\n" %
                     monitor_python_preappend_sys_path_count)
        report.write("monitor_python_preappend_sys_path_sha256=%s\n" %
                     monitor_python_preappend_sys_path_sha256)
        for index in range(3):
            report.write("monitor_python_preappend_sys_path_%d=%s\n" %
                         (
                             index,
                             sanitize(MONITOR_BASE_SYS_PATH[index]),
                         ))
        report.write(
            "monitor_python_absent_path_schema="
            "cheng.guard.monitor_python_absent_path\n")
        report.write("monitor_python_absent_path=%s\n" %
                     sanitize(monitor_python_absent_path))
        report.write("monitor_python_absent_path_status=%s\n" %
                     monitor_python_absent_path_status)
        report.write("monitor_python_absent_path_parent=%s\n" %
                     sanitize(monitor_python_absent_path_parent))
        report.write("monitor_python_absent_parent_watch_status=%s\n" %
                     monitor_python_absent_parent_watch_status)
        report.write("monitor_python_absent_parent_identity_sha256=%s\n" %
                     monitor_python_absent_parent_identity_sha256)
        report.write("monitor_psutil_path=%s\n" % sanitize(monitor_psutil_path))
        report.write("monitor_psutil_sha256=%s\n" % monitor_psutil_sha256)
        report.write("monitor_psutil_device=%d\n" % monitor_psutil_device)
        report.write("monitor_psutil_inode=%d\n" % monitor_psutil_inode)
        report.write("monitor_psutil_size=%d\n" % monitor_psutil_size)
        report.write("monitor_psutil_mtime_ns=%d\n" % monitor_psutil_mtime_ns)
        report.write("monitor_psutil_ctime_ns=%d\n" % monitor_psutil_ctime_ns)
        report.write("monitor_psutil_closure_schema=cheng.guard.file_closure\n")
        report.write("monitor_psutil_closure_root=%s\n" % sanitize(monitor_psutil_closure_root))
        report.write("monitor_psutil_closure_count=%d\n" % monitor_psutil_closure_count)
        report.write("monitor_psutil_closure_sha256=%s\n" % monitor_psutil_closure_sha256)
        report.write(
            "monitor_runtime_physical_schema="
            "cheng.guard.monitor_runtime_physical\n")
        report.write("monitor_runtime_physical_count=%d\n" %
                     monitor_runtime_physical_count)
        report.write("monitor_runtime_physical_sha256=%s\n" %
                     monitor_runtime_physical_sha256)
        report.write(
            "monitor_runtime_dyld_image_schema="
            "cheng.guard.darwin_dyld_images\n")
        report.write("monitor_runtime_dyld_image_count=%d\n" %
                     monitor_runtime_dyld_image_count)
        report.write("monitor_runtime_dyld_image_sha256=%s\n" %
                     monitor_runtime_dyld_image_sha256)
        report.write(
            "monitor_runtime_shared_cache_image_schema="
            "cheng.guard.darwin_shared_cache_images\n")
        report.write("monitor_runtime_shared_cache_image_count=%d\n" %
                     monitor_runtime_shared_cache_image_count)
        report.write("monitor_runtime_shared_cache_image_sha256=%s\n" %
                     monitor_runtime_shared_cache_image_sha256)
        report.write("monitor_runtime_shared_cache_uuid=%s\n" %
                     monitor_runtime_shared_cache_uuid)
        report.write("platform=%s\n" % sys.platform)
        report.write("status=%s\n" % ("completed" if completed else "ABORT"))
        report.write("rc=%d\n" % rc)
        report.write("abort_reason=%s\n" % abort_reason)
        report.write("expected_exit_code=%d\n" % expected_exit_code)
        report.write("actual_exit_code=%s\n" % (
            str(actual_exit_code) if actual_exit_code >= 0 else "unavailable"))
        report.write("exit_code_contract_status=%s\n" %
                     exit_code_contract_status)
        report.write("memory_guard_mode=process_tree\n")
        report.write("memory_guard_scope=%s\n" % memory_guard_scope)
        report.write("process_tree_membership_metric=%s\n" % membership_metric)
        report.write("enforcement_kind=%s\n" % enforcement_kind)
        report.write("observed_sample_limit_status=%s\n" % observed_sample_status)
        report.write("hard_memory_limit_proof_status=not_provable_userspace_poll\n")
        report.write("sampling_blind_spot=inter_sample_transient_peaks_not_provable_by_userspace_polling\n")
        report.write("memory_limit_bytes=%d\n" % rss_limit_bytes)
        report.write("memory_enforcement_metric=%s\n" % enforcement_metric)
        report.write("process_tree_resident_metric=current_resident_bytes_sum\n")
        report.write("process_tree_phys_footprint_metric=darwin_rusage_info_v0_phys_footprint_bytes_sum\n")
        report.write("process_tree_phys_footprint_status=%s\n" % footprint_status)
        report.write("process_tree_resident_peak_bytes=%d\n" % max_resident_bytes)
        report.write("process_tree_phys_footprint_peak_bytes=%d\n" % max_phys_footprint_bytes)
        report.write("process_tree_enforced_peak_bytes=%d\n" % max_enforced_bytes)
        report.write("process_tree_enforced_sample_peak_bytes=%d\n" % max_enforced_bytes)
        report.write("process_tree_peak_process_count=%d\n" % max_process_count)
        report.write("process_tree_identity_history_peak_count=%d\n" % identity_history_peak_count)
        report.write("root_identity_sampled=%d\n" % root_identity_sampled)
        report.write("process_tree_escape_pid=%d\n" % escape_pid)
        report.write("memory_measurement_status=%s\n" % measurement_status)
        report.write("memory_measurement_error=%s\n" % sanitize(measurement_error))
        report.write("memory_sample_count=%d\n" % sample_count)
        report.write("self_test_global_process_iter_trap_status=%s\n" % process_iter_trap_status)
        report.write("self_test_global_process_iter_trap_probe_status=%s\n" % process_iter_trap_probe_status)
        report.write("self_test_global_process_iter_trap_call_count=%d\n" % process_iter_trap_call_count)
        report.write("startup_status=%s\n" % startup_status)
        report.write("startup_timeout_seconds=%d\n" % startup_timeout_seconds)
        report.write("cleanup_status=%s\n" % cleanup_status)
        report.write("cleanup_timeout_seconds=%d\n" % cleanup_timeout_seconds)
        report.write("cleanup_error=%s\n" % sanitize(cleanup_error))
        report.write("timeout_seconds=%d\n" % timeout_seconds)
        report.write("poll_seconds=%s\n" % poll_seconds)
        report.write("combined_output_limit_schema=cheng.guard.combined_output_limit\n")
        report.write("combined_output_limit_bytes=%d\n" %
                     combined_output_limit_bytes)
        report.write("combined_output_observed_bytes=%d\n" %
                     combined_output_observed_bytes)
        report.write("combined_output_captured_bytes=%d\n" %
                     combined_output_captured_bytes)
        report.write("combined_output_limit_status=%s\n" %
                     combined_output_limit_status)
        report.write("combined_output_overflow_stream=%s\n" %
                     combined_output_overflow_stream)
        report.write("combined_output_failure_class=%s\n" % (
            "CFAIL" if combined_output_limit_status == "exceeded" else ""))
        report.write("stdout=%s\n" % stdout_path)
        report.write("stderr=%s\n" % stderr_path)
        report.finalize()
        report.flush()
        os.fsync(report.fileno())
    seal_held_output("report", 0o400)
    try:
        if tracked_output_failure_label:
            verify_support_output_identities()
        else:
            verify_all_output_identities()
    except BaseException:
        os.lseek(output_fds["report"], 0, os.SEEK_SET)
        os.ftruncate(output_fds["report"], 0)
        os.fsync(output_fds["report"])
        raise


try:
    tracked_outputs = parse_tracked_output_specs()
    prepare_output_artifacts()
    prepare_tracked_output_fd_bindings()
except (OSError, ValueError) as exc:
    sys.stderr.write("guard_error=output_artifact_contract detail=%s\n" % exc)
    sys.exit(3)

formal_path_history_unsupported = (
    require_command_identity
    and (
        sys.platform.startswith("linux")
        or os.environ.get(
            "BEAT_C_GUARD_SELF_TEST_FORCE_LINUX_HARDLINK_UNSUPPORTED") == "1"
    )
)
if formal_path_history_unsupported:
    output_path_history_status = "unsupported_hardlink_history"
    command_identity_status = "unavailable"
    command_identity_error = (
        "formal evidence requires hardlink path-history proof; "
        "Linux inotify does not provide it")
    abort_reason = "output_path_history_unsupported"
    rc = 3
    write_report()
    sys.stderr.write(
        "guard_error=output_path_history_unsupported detail=%s\n" %
        sanitize(command_identity_error))
    sys.exit(rc)


try:
    prepare_monitor_identity()
    validate_parent_guard_context()
    prepare_command_identity()
    prepare_command_self_image_authority()
    verify_private_frozen_tree_direct(final=False)
except (OSError, ValueError) as exc:
    if (
        command_execution_mode == "private_frozen_tree_direct"
        and private_frozen_tree_status == "verified"
    ):
        private_frozen_tree_status = "drifted"
        private_frozen_tree_watch_status = "drifted"
    command_identity_status = "unavailable"
    command_identity_error = "%s: %s" % (type(exc).__name__, exc)
    abort_reason = "command_identity_unavailable"
    rc = 3
    write_report()
    sys.stderr.write("guard_error=command_identity_unavailable detail=%s\n" % sanitize(command_identity_error))
    sys.exit(rc)


try:
    prepare_publication_channel_authority()
except (OSError, ValueError) as exc:
    publication_channel_status = "rejected"
    publication_channel_error = "%s: %s" % (type(exc).__name__, exc)
    abort_reason = "publication_channel_invalid"
    rc = 3
    write_report()
    sys.stderr.write(
        "guard_error=publication_channel_invalid detail=%s\n" %
        sanitize(publication_channel_error))
    sys.exit(rc)


if poll_seconds <= 0 or not poll_seconds < float("inf"):
    abort_reason = "invalid_poll_interval"
    measurement_status = "unavailable"
    measurement_error = "poll interval must be finite and positive"
    write_report()
    sys.exit(3)

if psutil is None:
    measurement_status = "unavailable"
    measurement_error = "psutil_missing: %s" % psutil_import_error
    abort_reason = "measurement_unavailable"
    write_report()
    sys.stderr.write("guard_error=measurement_unavailable detail=%s\n" % sanitize(measurement_error))
    sys.exit(rc)

try:
    footprint_reader = DarwinFootprintReader() if platform_is_darwin else None
    self_process = psutil.Process(os.getpid())
    if int(self_process.memory_info().rss) <= 0:
        raise MeasurementUnavailable("resident_preflight_non_positive")
    if (
        footprint_reader is not None
        and footprint_reader.read(os.getpid()) is None
    ):
        raise MeasurementUnavailable("monitor_exited_during_metric_preflight")
except (MeasurementUnavailable, OSError, psutil.Error) as exc:
    measurement_status = "unavailable"
    measurement_error = "memory_sampler_preflight_failed: %s" % exc
    abort_reason = "measurement_unavailable"
    write_report()
    sys.stderr.write("guard_error=measurement_unavailable detail=%s\n" % sanitize(measurement_error))
    sys.exit(rc)

process_iter_trap_requested = (
    os.environ.get("BEAT_C_GUARD_SELF_TEST_MODE") == "1"
    and os.environ.get("BEAT_C_GUARD_SELF_TEST_FORBID_GLOBAL_PROCESS_ITER") == "1"
)
if process_iter_trap_requested and not platform_is_darwin:
    process_iter_trap_status = "not_applicable"
elif process_iter_trap_requested:
    def forbidden_global_process_iter(*args, **kwargs):
        global process_iter_trap_call_count
        process_iter_trap_call_count += 1
        raise MeasurementUnavailable("global_process_iter_forbidden_on_darwin")
    psutil.process_iter = forbidden_global_process_iter
    process_iter_trap_status = "armed"
    try:
        psutil.process_iter(["pid"])
    except MeasurementUnavailable as exc:
        process_iter_trap_probe_status = (
            "passed" if str(exc) == "global_process_iter_forbidden_on_darwin"
            else "failed_wrong_exception"
        )
    else:
        process_iter_trap_probe_status = "failed_no_exception"
    if process_iter_trap_probe_status != "passed" or process_iter_trap_call_count != 1:
        measurement_status = "unavailable"
        measurement_error = "global_process_iter_trap_probe_failed"
        abort_reason = "measurement_unavailable"
        write_report()
        sys.exit(rc)

for handled_signal in (signal.SIGHUP, signal.SIGINT, signal.SIGTERM):
    signal.signal(handled_signal, signal_handler)

resource_trace = None
phase_trace = None
last_enforced_bytes = 0
release_fd = -1
try:
    if resource_trace_path:
        resource_trace = os.fdopen(os.dup(output_fds["resource_trace"]), "a", encoding="utf-8")
    if phase_trace_path:
        phase_trace = os.fdopen(os.dup(output_fds["phase_trace"]), "a", encoding="utf-8")
    release_fd = spawn_blocked()

    # The target cannot exec until this identity is registered and measured.
    resident, footprint, enforced, process_count = sample_process_tree(
        child_pid, root_pgid, root_sid, footprint_reader
    )
    sample_count += 1
    max_resident_bytes = resident
    max_phys_footprint_bytes = footprint
    max_enforced_bytes = enforced
    max_process_count = process_count
    last_enforced_bytes = enforced
    if process_count <= 0 or root_identity_sampled != 1:
        raise MeasurementUnavailable("startup_root_sample_missing")
    startup_status = "sampled"
    if resource_trace is not None:
        resource_trace.write("%d\t%d\n" % (trace_time_seconds(), trace_kibibytes(enforced)))
        resource_trace.flush()
    if rss_limit_bytes > 0 and enforced > rss_limit_bytes:
        abort_reason = "rss_limit_exceeded"
        rc = 137
    else:
        write_exact(release_fd, b"G")
        target_exec_released = 1
        os.close(release_fd)
        release_fd = -1
        await_tracked_output_fd_inheritance()

    while not abort_reason:
        time.sleep(poll_seconds)
        verify_monitor_absent_path_watch()
        resident, footprint, enforced, process_count = sample_process_tree(
            child_pid, root_pgid, root_sid, footprint_reader
        )
        sample_count += 1
        max_resident_bytes = max(max_resident_bytes, resident)
        max_phys_footprint_bytes = max(max_phys_footprint_bytes, footprint)
        max_enforced_bytes = max(max_enforced_bytes, enforced)
        max_process_count = max(max_process_count, process_count)
        last_enforced_bytes = enforced
        if resource_trace is not None:
            resource_trace.write("%d\t%d\n" % (trace_time_seconds(), trace_kibibytes(enforced)))
            resource_trace.flush()
        drain_phase_trace(phase_trace, enforced)
        if not drain_output_streams():
            refresh_observed_union_for_cleanup()
            kill_observed(signal.SIGTERM)
            abort_reason = "combined_output_limit_exceeded"
            rc = 74
            break
        root_done = reap_root()
        if rss_limit_bytes > 0 and enforced > rss_limit_bytes:
            abort_reason = "rss_limit_exceeded"
            rc = 137
            break
        if timeout_seconds > 0 and time.monotonic() - start >= timeout_seconds:
            abort_reason = "timeout"
            rc = 124
            break
        if root_done:
            # A target root is the lifetime owner for its process tree. Refresh
            # after reaping to catch children that changed group or were
            # reparented during the final sample, then refuse to wait forever
            # for pipe EOF when timeout=0.
            refresh_observed_union_for_cleanup()
            post_root_output_ok = True
            if not output_streams_eof():
                post_root_output_ok = drain_output_streams()
            live_after_root = [
                pid for pid, identity in list(history.items())
                if pid != child_pid and identity_is_live(pid, identity)
            ]
            if not post_root_output_ok:
                refresh_observed_union_for_cleanup()
                kill_observed(signal.SIGTERM)
                abort_reason = "combined_output_limit_exceeded"
                rc = 74
            elif cleanup_error or live_after_root or not output_streams_eof():
                kill_observed(signal.SIGTERM)
                abort_reason = "root_exited_with_live_process_or_open_output"
                rc = 3
            else:
                actual_exit_code = decode_wait_status(root_wait_status)
                if actual_exit_code == expected_exit_code:
                    exit_code_contract_status = "verified"
                    rc = 0
                else:
                    exit_code_contract_status = "mismatch"
                    abort_reason = "exit_code_contract_mismatch"
                    rc = 3
            break
except ProcessEscape as exc:
    escape_pid = exc.pid
    abort_reason = "process_tree_escape_detected"
    measurement_error = str(exc)
    rc = 3
except MeasurementUnavailable as exc:
    measurement_status = "unavailable"
    measurement_error = str(exc)
    abort_reason = "measurement_unavailable"
    rc = 3
except StartupTimeout as exc:
    startup_status = "timeout"
    measurement_status = "unavailable"
    measurement_error = str(exc)
    abort_reason = "startup_timeout"
    rc = 3
except StartupFailure as exc:
    startup_status = "failed"
    measurement_status = "unavailable"
    measurement_error = str(exc)
    abort_reason = "startup_failed"
    rc = 3
except TrackedOutputViolation as exc:
    refresh_observed_union_for_cleanup()
    kill_observed(signal.SIGKILL)
    tracked_output_failure_label = exc.label
    tracked_output_failure_error = str(exc)
    abort_reason = "tracked_output_contract_failed"
    rc = 74
except GuardInterrupted as exc:
    abort_reason = "guard_signal_%d" % exc.signum
    measurement_error = "guard interrupted"
    rc = 128 + exc.signum
except BaseException as exc:
    abort_reason = "guard_internal_error"
    measurement_status = "unavailable"
    measurement_error = "%s: %s" % (type(exc).__name__, exc)
    rc = 3
finally:
    for handled_signal in (signal.SIGHUP, signal.SIGINT, signal.SIGTERM):
        signal.signal(handled_signal, signal.SIG_IGN)
    if release_fd >= 0:
        try:
            os.close(release_fd)
        except OSError:
            pass
    try:
        if abort_reason or root_wait_status is None:
            cleanup_all()
    except BaseException as exc:
        cleanup_status = "failed"
        cleanup_error = "%s: %s" % (type(exc).__name__, exc)
    try:
        output_drain_status = drain_output_streams_bounded()
        if output_drain_status == "timeout" and not abort_reason:
            abort_reason = "output_stream_drain_timeout"
            measurement_status = "unavailable"
            measurement_error = "output streams did not reach EOF before cleanup deadline"
            rc = 3
    except BaseException as exc:
        if not abort_reason:
            abort_reason = "output_capture_finalize_failed"
            measurement_status = "unavailable"
            measurement_error = "%s: %s" % (type(exc).__name__, exc)
            rc = 3
    close_output_streams()
    if cleanup_status in ("timeout", "failed") and not abort_reason:
        abort_reason = "cleanup_timeout" if cleanup_status == "timeout" else "cleanup_failed"
        measurement_status = "unavailable"
        measurement_error = cleanup_error
        rc = 3
    try:
        drain_phase_trace(phase_trace, last_enforced_bytes or max_enforced_bytes, force=True)
    except BaseException as exc:
        if not abort_reason:
            abort_reason = "trace_finalize_failed"
            measurement_status = "unavailable"
            measurement_error = "%s: %s" % (type(exc).__name__, exc)
            rc = 3
    for trace in (resource_trace, phase_trace):
        if trace is not None:
            try:
                trace.close()
            except OSError:
                pass
    if target_proof_monitor_socket is not None:
        try:
            target_proof_monitor_socket.close()
        except OSError:
            pass
        target_proof_monitor_socket = None
    if target_proof_unused_socket is not None:
        try:
            target_proof_unused_socket.close()
        except OSError:
            pass
        target_proof_unused_socket = None

if (
    actual_exit_code < 0
    and target_exec_released == 1
    and root_wait_status is not None
):
    actual_exit_code = decode_wait_status(root_wait_status)

if (
    not abort_reason
    and (
        exit_code_contract_status != "verified"
        or actual_exit_code != expected_exit_code
    )
):
    abort_reason = "exit_code_contract_unverified"
    rc = 3

try:
    collect_tracked_output_evidence(
        require_complete=(
            not abort_reason
            and exit_code_contract_status == "verified"
            and actual_exit_code == expected_exit_code))
except (TrackedOutputViolation, OSError) as exc:
    refresh_observed_union_for_cleanup()
    kill_observed(signal.SIGKILL)
    tracked_output_failure_label = getattr(
        exc, "label", "unresolved"
    )
    tracked_output_failure_error = str(exc)
    if not abort_reason:
        abort_reason = "tracked_output_contract_failed"
        rc = 74

try:
    verify_command_identity()
    verify_command_self_image_authority()
except (OSError, ValueError) as exc:
    if command_execution_mode == "private_frozen_tree_direct":
        private_frozen_tree_status = "drifted"
        private_frozen_tree_watch_status = "drifted"
    command_identity_status = "drifted"
    command_identity_error = "%s: %s" % (type(exc).__name__, exc)
    if not abort_reason:
        abort_reason = "command_identity_drift"
        rc = 3

try:
    verify_publication_channel_authority()
except (OSError, ValueError) as exc:
    publication_channel_status = "drifted"
    publication_channel_error = "%s: %s" % (type(exc).__name__, exc)
    if not abort_reason:
        abort_reason = "publication_channel_identity_drift"
        rc = 3

try:
    verify_all_output_identities()
except (OSError, ValueError) as exc:
    if not abort_reason:
        abort_reason = "output_identity_drift"
        rc = 3

try:
    write_report()
except (OSError, ValueError) as exc:
    sys.stderr.write("guard_error=output_artifact_finalize detail=%s\n" % exc)
    rc = 3
sys.exit(rc)
