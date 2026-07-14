#!/usr/bin/env python3
"""cov_trace.py -- function-level first-hit coverage recorder (one binary,
one workload) via self-managed BRK traps under lldb.

Sedimented from the T60 campaign (2026-07-15). gen2_symbolize.sh killed the
"where did it crash" bisect class; the surviving class was "which code did
the patched binary newly ACTIVATE" (T60: fixing machoReadObject let the run
cross a false-positive bail and enter MachoProviderLinkExe's real path --
byte-identical in both binaries -- where a deeper latent defect crashed).
This tool records the set of functions entered during a workload run so two
runs can be diffed (cov_diff.sh): newly-covered functions ARE the activated
never-trodden arms, no bisect bakes needed.

Symbol source: Cheng-linked exes carry no function symtab (nm shows only
~79 imports); the full symtab (~3.6k functions) lives in the sibling
primary.o. In obj mode (--obj) symbols are read from the object and mapped
into the exe's __text. The mapping is NOT assumed: it is byte-verified by
comparing the object's entire __text against the exe's __text prefix with
all relocation sites masked out (linker only patches reloc sites). Any
non-reloc byte mismatch is a hard error -- no coverage is emitted from an
unproven mapping.

Trap engine: lldb one-shot breakpoints proved unsound here -- with
auto-continue there is no public stop, site cleanup is deferred, and a
second call into a one-shot-fired function hits a stale trap (observed:
orphan EXC_BREAKPOINT at ReadFileBytes+0x0). So this tool owns the traps
itself: at entry-stop it writes BRK #0 over every function's first
instruction (original words come from the exe file bytes; text is mapped
unmodified), and on each EXC_BREAKPOINT at a known site it records the
hit, restores the original word, and continues. Each function costs
exactly one stop; lldb is only the ptrace vehicle. Any exception NOT at a
known site is a real workload crash and is symbolized via the same
mapping (subsumes gen2_symbolize.sh for the in-run case).

Limitations (v1, by design):
  - main process only; child processes are not followed
  - function granularity: a new branch INSIDE an already-covered function
    is invisible; what it newly CALLS is visible
  - obj mode covers primary.o functions only (compiler code proper);
    provider/runtime text is not instrumented -- that is the wanted
    signal/noise split for emitter-arm work

Usage:
  PYTHONPATH="$(lldb -P)" /usr/bin/python3 cov_trace.py \
      --bin <binary> [--obj <primary.o>] --out <report.txt> \
      [--cwd <dir>] [--timeout <sec>] -- <workload argv...>

Without --obj the exe's own symtab is used (works for cold-C-linked
binaries); if the exe has no code symbols the tool errors and asks for
--obj. Environment is inherited. Workload stdout/stderr go to
<report>.stdout / <report>.stderr.

Report (line-oriented, grep/comm friendly):
  cov_status=completed|crashed|timeout
  cov_binary=/ cov_obj= / cov_workload= / cov_symbols_total=
  cov_exit=<rc>            (when exited)
  cov_stop=<desc>          (when crashed)
  cov_crash_frame=<sym>+0x<off>
  cov_covered_count=<N>
  cov_covered=<symbol>     (one per line, in first-hit order)
"""
import argparse
import bisect
import os
import re
import struct
import subprocess
import sys
import time


def die(msg, code=2):
    sys.stderr.write("cov_trace_error=%s\n" % msg)
    sys.exit(code)


try:
    import lldb
except ImportError:
    die("lldb_module_missing hint=PYTHONPATH=$(lldb -P) /usr/bin/python3 ...")

BRK_WORD = b"\x00\x00\x20\xd4"  # arm64 BRK #0, little-endian


def find_text_section(module):
    def walk(sec):
        if sec.GetName() == "__text":
            return sec
        for j in range(sec.GetNumSubSections()):
            r = walk(sec.GetSubSectionAtIndex(j))
            if r:
                return r
        return None
    for i in range(module.GetNumSections()):
        r = walk(module.GetSectionAtIndex(i))
        if r:
            return r
    return None


def parse_text_relocs(obj_path):
    """(offset, width) pairs for __TEXT,__text relocation entries."""
    p = subprocess.run(["otool", "-r", obj_path], capture_output=True, text=True)
    if p.returncode != 0:
        die("otool_r_failed path=%s" % obj_path)
    relocs = []
    in_text = False
    for line in p.stdout.splitlines():
        if line.startswith("Relocation information"):
            in_text = "(__TEXT,__text)" in line
            continue
        if not in_text or line.startswith("address"):
            continue
        m = re.match(r"^([0-9a-f]{8})\s+(\d+)\s+(\d+)\s", line)
        if not m:
            if line.strip():
                die("reloc_parse_failed line=%r" % line[:80])
            continue
        relocs.append((int(m.group(1), 16), 1 << int(m.group(3))))
    return relocs


def verify_obj_mapping(obj_path, o_off, size, exe_path, exe_off, exe_text_size):
    """Prove primary.o __text == exe __text prefix, reloc sites masked."""
    if size > exe_text_size:
        die("obj_text_larger_than_exe_text obj=0x%x exe=0x%x" % (size, exe_text_size))
    with open(obj_path, "rb") as f:
        f.seek(o_off)
        a = bytearray(f.read(size))
    with open(exe_path, "rb") as f:
        f.seek(exe_off)
        b = bytearray(f.read(size))
    if len(a) != size or len(b) != size:
        die("text_read_short obj=%d exe=%d want=%d" % (len(a), len(b), size))
    for off, width in parse_text_relocs(obj_path):
        if off + width <= size:
            a[off:off + width] = b"\0" * width
            b[off:off + width] = b"\0" * width
    if a != b:
        first = next(i for i in range(size) if a[i] != b[i])
        die("obj_exe_text_mismatch first_diff_off=0x%x (mapping unproven; refusing)" % first)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bin", required=True)
    ap.add_argument("--obj", default=None,
                    help="object file supplying the symtab (e.g. sibling primary.o)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--cwd", default=os.getcwd())
    ap.add_argument("--timeout", type=float, default=600.0)
    ap.add_argument("workload", nargs=argparse.REMAINDER)
    args = ap.parse_args()
    workload = args.workload
    if workload and workload[0] == "--":
        workload = workload[1:]

    binary = os.path.abspath(args.bin)
    if not os.access(binary, os.X_OK):
        die("binary_not_executable path=%s" % binary)

    dbg = lldb.SBDebugger.Create()
    dbg.SetAsync(True)
    target = dbg.CreateTarget(binary)
    if not target.IsValid():
        die("target_create_failed path=%s" % binary)
    exe_module = target.GetModuleAtIndex(0)
    exe_text = find_text_section(exe_module)
    if exe_text is None:
        die("exe_text_section_missing path=%s" % binary)

    # ---- (text_offset, name) function list --------------------------------
    if args.obj:
        obj_path = os.path.abspath(args.obj)
        otarget = dbg.CreateTarget(obj_path)
        if not otarget.IsValid():
            die("obj_target_create_failed path=%s" % obj_path)
        omod = otarget.GetModuleAtIndex(0)
        o_text = find_text_section(omod)
        if o_text is None:
            die("obj_text_section_missing path=%s" % obj_path)
        verify_obj_mapping(obj_path, o_text.GetFileOffset(), o_text.GetByteSize(),
                           binary, exe_text.GetFileOffset(), exe_text.GetByteSize())
        o_base = o_text.GetFileAddress()
        addr_names = {}
        for i in range(omod.GetNumSymbols()):
            s = omod.GetSymbolAtIndex(i)
            if s.GetType() != lldb.eSymbolTypeCode or not s.GetName():
                continue
            sa = s.GetStartAddress()
            if not sa.IsValid() or not sa.GetSection().IsValid():
                continue
            if sa.GetSection().GetName() != "__text":
                continue
            addr_names.setdefault(sa.GetFileAddress() - o_base, []).append(s.GetName())
    else:
        exe_base = exe_text.GetFileAddress()
        addr_names = {}
        for i in range(exe_module.GetNumSymbols()):
            s = exe_module.GetSymbolAtIndex(i)
            if s.GetType() != lldb.eSymbolTypeCode or not s.GetName():
                continue
            sa = s.GetStartAddress()
            if not sa.IsValid():
                continue
            fa = sa.GetFileAddress()
            if fa == lldb.LLDB_INVALID_ADDRESS:
                continue
            addr_names.setdefault(fa - exe_base, []).append(s.GetName())
        if not addr_names:
            die("no_text_symbols_in_exe path=%s (Cheng-linked exes carry none; pass --obj sibling primary.o)" % binary)

    syms = sorted((off, sorted(ns)[0]) for off, ns in addr_names.items())
    sym_offs = [off for off, _ in syms]
    sym_names = [name for _, name in syms]
    total = len(syms)

    # original first words, from exe file bytes (text maps unmodified)
    exe_file_off = exe_text.GetFileOffset()
    with open(binary, "rb") as f:
        f.seek(exe_file_off)
        text_bytes = f.read(exe_text.GetByteSize())
    orig_word = {off: text_bytes[off:off + 4] for off in sym_offs}
    for off, w in orig_word.items():
        if len(w) != 4:
            die("orig_word_read_short off=0x%x" % off)
        if w == BRK_WORD:
            die("function_starts_with_brk off=0x%x (cannot distinguish)" % off)

    def symbolize(off):
        k = bisect.bisect_right(sym_offs, off) - 1
        if k < 0:
            return "off=0x%x (before first symbol)" % off
        return "%s+0x%x" % (sym_names[k], off - sym_offs[k])

    # ---- launch stopped-at-entry, arm traps, run ---------------------------
    launch = lldb.SBLaunchInfo(workload)
    launch.SetWorkingDirectory(args.cwd)
    launch.SetLaunchFlags(lldb.eLaunchFlagStopAtEntry)
    env = lldb.SBEnvironment()
    for k, v in os.environ.items():
        env.Set(k, v, True)
    launch.SetEnvironment(env, False)
    launch.AddOpenFileAction(1, args.out + ".stdout", False, True)
    launch.AddOpenFileAction(2, args.out + ".stderr", False, True)
    err = lldb.SBError()
    process = target.Launch(launch, err)
    if err.Fail() or not process.IsValid():
        die("launch_failed msg=%s" % err.GetCString())

    listener = dbg.GetListener()
    deadline = time.time() + args.timeout
    status = "completed"
    exit_code = None
    stop_desc = None
    crash_frame = None
    covered = []            # first-hit order
    covered_set = set()
    armed = False
    text_load = None
    event = lldb.SBEvent()

    def arm_all():
        nonlocal text_load
        text_load = exe_text.GetLoadAddress(target)
        if text_load == lldb.LLDB_INVALID_ADDRESS:
            die("text_load_addr_unknown_at_entry")
        werr = lldb.SBError()
        for off in sym_offs:
            n = process.WriteMemory(text_load + off, BRK_WORD, werr)
            if werr.Fail() or n != 4:
                die("trap_write_failed off=0x%x msg=%s" % (off, werr.GetCString()))

    while True:
        if time.time() > deadline:
            status = "timeout"
            process.Kill()
            break
        if not listener.WaitForEvent(1, event):
            continue
        if not lldb.SBProcess.EventIsProcessEvent(event):
            continue
        state = lldb.SBProcess.GetStateFromEvent(event)
        if state == lldb.eStateExited:
            exit_code = process.GetExitStatus()
            break
        if state not in (lldb.eStateStopped, lldb.eStateCrashed):
            continue
        if not armed:
            arm_all()
            armed = True
            process.Continue()
            continue
        # classify this stop: our trap(s) vs real crash
        real_crash = None
        resumed_any = False
        for t in process:
            sr = t.GetStopReason()
            if sr == lldb.eStopReasonNone or sr == lldb.eStopReasonInvalid:
                continue
            pc = t.GetFrameAtIndex(0).GetPC()
            off = pc - text_load
            if sr in (lldb.eStopReasonException, lldb.eStopReasonSignal,
                      lldb.eStopReasonBreakpoint) and off in orig_word:
                if off not in covered_set:
                    covered_set.add(off)
                    covered.append(off)
                werr = lldb.SBError()
                n = process.WriteMemory(pc, orig_word[off], werr)
                if werr.Fail() or n != 4:
                    die("trap_restore_failed off=0x%x msg=%s" % (off, werr.GetCString()))
                resumed_any = True
            elif sr in (lldb.eStopReasonException, lldb.eStopReasonSignal):
                real_crash = t
                break
        if real_crash is not None:
            status = "crashed"
            stop_desc = real_crash.GetStopDescription(256)
            pc = real_crash.GetFrameAtIndex(0).GetPC()
            off = pc - text_load
            if 0 <= off < exe_text.GetByteSize():
                crash_frame = symbolize(off)
            else:
                crash_frame = "pc=0x%x (outside __text)" % pc
            process.Kill()
            break
        if resumed_any or True:
            # exec/plan stops or handled traps: resume
            process.Continue()

    covered_names = [sym_names[bisect.bisect_right(sym_offs, off) - 1] for off in covered]

    with open(args.out, "w") as f:
        f.write("cov_status=%s\n" % status)
        f.write("cov_binary=%s\n" % binary)
        if args.obj:
            f.write("cov_obj=%s\n" % os.path.abspath(args.obj))
        f.write("cov_workload=%s\n" % " ".join(workload))
        f.write("cov_symbols_total=%d\n" % total)
        if exit_code is not None:
            f.write("cov_exit=%d\n" % exit_code)
        if stop_desc:
            f.write("cov_stop=%s\n" % stop_desc)
        if crash_frame:
            f.write("cov_crash_frame=%s\n" % crash_frame)
        f.write("cov_covered_count=%d\n" % len(covered_names))
        for name in covered_names:
            f.write("cov_covered=%s\n" % name)
    print("cov_status=%s covered=%d/%d crash=%s out=%s"
          % (status, len(covered_names), total, crash_frame or "-", args.out))
    lldb.SBDebugger.Destroy(dbg)


if __name__ == "__main__":
    main()
