"""lldb_syscall_probe.py -- entry/return-paired lldb breakpoint probe for a
libc syscall wrapper (waitpid, read, etc), logging arg/return-value pairs.

Based on scratchpad/t52v2/t52_probe2.py (T52 campaign, cheng_pty_wait_runtime
waitpid diagnosis), with one known bug fixed:

  BUG (t52_probe2.py): the one-shot return breakpoint's context was stored
  keyed by `bp2.GetID()` (`internal_dict[bp2.GetID()] = {...}`). lldb RECYCLES
  breakpoint IDs after a one-shot breakpoint auto-deletes itself on hit --
  so if this probe fires on a hot call site many times (this campaign's
  waitpid poll loop hit it hundreds of times per provider), a *later*
  entry's one-shot return breakpoint can be assigned the same numeric ID a
  *former*, already-fired-and-deleted one-shot breakpoint had. The return
  callback would then read a stale/wrong entry's args (`pid_arg`, caller
  name) paired with the current call's actual return value -- a silent
  mislabeling, not a crash, so it does not announce itself. Lesson from the
  T52 case file: "pid_arg 标签曾错位, 只信硬件读数序列" -- the *sequence* of
  raw register reads (w0/errno at the return site) was always trustworthy;
  only the *label* attaching each read back to its calling context could be
  wrong.

  FIX (this file): key context by thread ID with a per-thread FIFO queue
  (`entry` pushes to the back, `return` pops from the front), never by the
  recyclable breakpoint ID. This assumes calls on a single thread are not
  reentrant into the SAME probed function before returning (true for a
  blocking syscall wrapper like waitpid/read on one thread -- verified in
  the T52 case via `thread list` showing only `com.apple.main-thread` for
  the whole reproduction). Keying per-thread additionally protects against
  genuine cross-thread interleaving that the original script never guarded
  against at all (it had exactly one global dict, no thread separation).

Usage (batch mode, no separate driver script needed):
  lldb -b \\
    -o "command script import /path/to/lldb_syscall_probe.py" \\
    -o "command script add -f lldb_syscall_probe.set_target set_probe_target" \\
    -o "target create <exe>" \\
    -o "set_probe_target <hex_or_symbolic_entry_addr> <log_path>" \\
    -o "run" \\
    -o "quit"

  Or interactively inside an already-running `lldb <exe>` session:
    (lldb) command script import /path/to/lldb_syscall_probe.py
    (lldb) script lldb_syscall_probe.configure(target, "<log_path>")
    (lldb) breakpoint set --address <entry_addr>
    (lldb) breakpoint command add -F lldb_syscall_probe.on_entry <bp_id>
    (lldb) run

Entry breakpoint must be at the FIRST instruction of the probed function (so
x0/x1/x2/... hold the incoming arguments per AArch64 ABI) with the return
address still intact in `lr`. This module reads `lr` at entry to plant the
one-shot return breakpoint -- it does not single-step or otherwise alter
control flow, so it does not perturb the timing-sensitive behavior it is
observing (a lesson from the same case: breakpoint *conditions* on a hot
polling loop can themselves distort timing enough to hide the bug; this
module only ever sets unconditional breakpoints and does the discrimination
in Python instead, in the callback body).
"""

import lldb

_QUEUES = {}  # thread_id (int) -> list of dicts, FIFO: append() / pop(0)
_LOG_PATH = {"path": None}
_HIT_COUNT = {"n": 0}


def configure(target, log_path):
    """Call once after `command script import` to set the log destination."""
    _LOG_PATH["path"] = log_path
    with open(log_path, "a") as f:
        f.write("# lldb_syscall_probe configured, log=%s\n" % log_path)


def on_entry(frame, bp_loc, internal_dict):
    """Attach as a breakpoint command/callback on the probed function's
    entry address. Reads incoming args (x0/x1/x2) and `lr`, plants a
    one-shot breakpoint at the return address, and pushes this call's
    context onto this thread's FIFO queue for on_return to pop."""
    thread = frame.GetThread()
    process = thread.GetProcess()
    target = process.GetTarget()
    thread_id = thread.GetThreadID()

    arg0 = frame.FindRegister("x0").GetValueAsSigned()
    arg1 = frame.FindRegister("x1").GetValueAsSigned()
    arg2 = frame.FindRegister("x2").GetValueAsSigned()
    lr = frame.FindRegister("lr").GetValueAsUnsigned()

    caller_frame = thread.GetFrameAtIndex(1)
    caller_name = caller_frame.GetFunctionName() or "?"
    caller_off = caller_frame.GetPCAddress().GetOffset()

    bp_return = target.BreakpointCreateByAddress(lr)
    bp_return.SetOneShot(True)
    bp_return.SetScriptCallbackFunction("lldb_syscall_probe.on_return")

    _QUEUES.setdefault(thread_id, []).append({
        "arg0": arg0, "arg1": arg1, "arg2": arg2,
        "caller_name": caller_name, "caller_off": caller_off,
    })
    return False  # do not stop execution, keep running


def on_return(frame, bp_loc, internal_dict):
    """Fires at the one-shot return breakpoint. Pops the OLDEST still-open
    context for this thread (FIFO) -- never looks up by breakpoint ID."""
    thread = frame.GetThread()
    thread_id = thread.GetThreadID()

    w0 = frame.FindRegister("w0").GetValueAsSigned()
    errno_val = frame.EvaluateExpression("(int)*(int*)__error()")
    errno_str = errno_val.GetValue()

    queue = _QUEUES.get(thread_id, [])
    if queue:
        ctx = queue.pop(0)
    else:
        ctx = {"arg0": None, "arg1": None, "arg2": None,
               "caller_name": "?", "caller_off": 0}

    _HIT_COUNT["n"] += 1
    log_path = _LOG_PATH["path"]
    if log_path:
        with open(log_path, "a") as f:
            f.write(
                "n=%d thread=%d arg0=%s arg1=%s arg2=%s ret_w0=%d errno=%s "
                "caller=%s+0x%x\n" % (
                    _HIT_COUNT["n"], thread_id,
                    ctx.get("arg0"), ctx.get("arg1"), ctx.get("arg2"),
                    w0, errno_str,
                    ctx.get("caller_name"), ctx.get("caller_off", 0),
                )
            )
    return False  # do not stop execution, keep running
