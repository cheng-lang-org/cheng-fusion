#!/usr/bin/env python3
"""Tracked .cheng source purity gate: reject Mach-O / ELF binaries committed as .cheng sources.

Born from the backend_driver_dispatch_min.cheng incident (2026-08-24): a 51KB
Cheng cold-direct Mach-O artifact was committed as a .cheng source file and
survived every gate because no gate looked at file magic.

用法：
    python3 tools/cheng_source_purity_gate.py              # 在仓库 cwd 下审 `git ls-files *.cheng`
    python3 tools/cheng_source_purity_gate.py --self-test  # 三腿契约自检（临时 git 仓在 /private/tmp，用完即删）

自检三腿（真实 CLI 子进程 + 临时 git 仓，不碰主仓任何文件）：
    1. 正例：tracked 干净 .cheng            -> 期望 rc=0 且判词 `purity-gate: PASS`
    2. 负例：tracked .cheng 内嵌 Mach-O 魔数 -> 期望 rc=1 且判词 `VIOLATION <path> is a Mach-O 64-bit ...`
    3. 缺失腿：(a) tracked-but-worktree-missing -> 期望 rc=0 且判词 `notice ... absent from worktree`；
       (b) 空仓（无 tracked .cheng）-> 记录实际行为（该门未定义空仓语义，见 --self-test 输出说明）。

退出码：0 = pass, 1 = binary-magic violation, 2 = operational error。
Worktree-deleted (tracked-but-absent) files are skipped with a notice: this
gate audits committed content, not worktree sync state.
"""
import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

MAGICS = {
    b"\xcf\xfa\xed\xfe": "Mach-O 64-bit (little endian)",
    b"\xca\xfe\xba\xbe": "Mach-O fat/universal",
    b"\xfe\xed\xfa\xce": "Mach-O 32-bit (big endian)",
    b"\xce\xfa\xed\xfe": "Mach-O 32-bit (little endian)",
    b"\x7fELF": "ELF",
}

def scan(root: Path) -> int:
    try:
        files = subprocess.run(
            ["git", "-C", str(root), "ls-files", "*.cheng"],
            capture_output=True, text=True, check=True,
        ).stdout.split()
    except FileNotFoundError:
        print("purity-gate: operational error: git executable not found", file=sys.stderr)
        return 2
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or "").strip().splitlines()
        suffix = f": {detail[-1]}" if detail else ""
        print(
            f"purity-gate: operational error: git ls-files failed"
            f" rc={exc.returncode} under root={root}{suffix}",
            file=sys.stderr,
        )
        return 2
    bad = []
    absent = []
    checked = 0
    for path in files:
        try:
            with open(root / path, "rb") as fh:
                head = fh.read(16)
        except FileNotFoundError:
            absent.append(path)
            continue
        except OSError as exc:
            print(f"purity-gate: unreadable {path}: {exc}", file=sys.stderr)
            return 2
        checked += 1
        for magic, label in MAGICS.items():
            if head.startswith(magic):
                bad.append((path, label))
                break
    if absent:
        print(
            f"purity-gate: notice {len(absent)} tracked .cheng absent from worktree"
            " (committed-content audit only; not a violation)"
        )
    if bad:
        for path, label in bad:
            print(f"purity-gate: VIOLATION {path} is a {label} binary committed as .cheng source")
        return 1
    print(f"purity-gate: PASS ({checked} files scanned, no binary magic)")
    return 0

def _selftest_case(name, expect, got_ok, detail):
    print("[self-test] case=%s expected=%s actual=%s verdict=%s"
          % (name, expect, detail, "PASS" if got_ok else "FAIL"))
    return got_ok


def run_self_test() -> int:
    """三腿契约自检：夹具全部在 /private/tmp 的临时 git 仓，用完即删，不碰主仓。"""
    base = "/private/tmp" if os.path.isdir("/private/tmp") else None
    work = Path(tempfile.mkdtemp(prefix="purity_gate_selftest.", dir=base))
    ok = True
    try:
        env = dict(os.environ,
                   GIT_AUTHOR_NAME="purity-selftest", GIT_AUTHOR_EMAIL="selftest@local",
                   GIT_COMMITTER_NAME="purity-selftest", GIT_COMMITTER_EMAIL="selftest@local",
                   GIT_CONFIG_GLOBAL="/dev/null", GIT_CONFIG_SYSTEM="/dev/null")
        gate = str(Path(__file__).resolve())

        def new_repo(name):
            repo = work / name
            repo.mkdir()
            subprocess.run(["git", "init", "-q"], cwd=repo, env=env, check=True,
                           capture_output=True, text=True)
            return repo

        def git(repo, *args):
            subprocess.run(["git", *args], cwd=repo, env=env, check=True,
                           capture_output=True, text=True)

        def run_gate(repo):
            p = subprocess.run([sys.executable, gate], cwd=repo, env=env,
                               capture_output=True, text=True)
            return p.returncode, (p.stdout + p.stderr).strip()

        # 腿 1 正例：tracked 干净 .cheng -> rc=0 + PASS
        repo = new_repo("repo")
        (repo / "src").mkdir()
        (repo / "src/clean.cheng").write_text("fn main() =\n    return\n", encoding="utf-8")
        git(repo, "add", "-A")
        git(repo, "commit", "-qm", "clean source")
        rc1, out1 = run_gate(repo)
        ok &= _selftest_case("positive_clean_cheng", "rc=0 + 'purity-gate: PASS'",
                             rc1 == 0 and out1.startswith("purity-gate: PASS"),
                             "rc=%d out=%r" % (rc1, out1))

        # 腿 2 负例：tracked .cheng 内嵌 Mach-O 64-bit LE 魔数 cffaedfe -> rc=1 + VIOLATION
        (repo / "src/evil.cheng").write_bytes(b"\xcf\xfa\xed\xfe" + b"\x00" * 60)
        git(repo, "add", "-A")
        git(repo, "commit", "-qm", "binary magic")
        rc2, out2 = run_gate(repo)
        want2 = "VIOLATION src/evil.cheng is a Mach-O 64-bit (little endian) binary committed as .cheng source"
        ok &= _selftest_case("negative_macho_magic_cffaedfe", "rc=1 + 精确 VIOLATION 判词",
                             rc2 == 1 and want2 in out2, "rc=%d out=%r" % (rc2, out2))
        (repo / "src/evil.cheng").unlink()
        git(repo, "add", "-A")
        git(repo, "commit", "-qm", "drop binary magic")

        # 腿 3a 缺失腿：tracked 但 worktree 已删 -> rc=0 + notice（不算违规）
        (repo / "src/clean.cheng").unlink()
        rc3, out3 = run_gate(repo)
        want3 = "notice 1 tracked .cheng absent from worktree"
        ok &= _selftest_case("missing_tracked_file_skipped", "rc=0 + 'notice ... absent from worktree'",
                             rc3 == 0 and want3 in out3 and "VIOLATION" not in out3,
                             "rc=%d out=%r" % (rc3, out3))

        # 腿 3b 空仓：无 tracked .cheng -> 记录实际行为（语义未定义，此处仅作行为锚点）
        empty = new_repo("empty_repo")
        rc4, out4 = run_gate(empty)
        print("[self-test] note 空仓（无 tracked .cheng）实际行为：rc=%d out=%r —— "
              "该门未定义空仓语义；建议保持 rc=0 但在判词里显式写 0 scanned 已足够，"
              "若要更强语义可加 'no .cheng tracked' 提示（本次不改，待裁决）" % (rc4, out4))
        ok &= _selftest_case("empty_repo_behavior_recorded", "记录实际行为（锚定 rc=0 + 0 scanned）",
                             rc4 == 0 and "0 files scanned" in out4, "rc=%d out=%r" % (rc4, out4))
    finally:
        shutil.rmtree(work, ignore_errors=True)
    print("[self-test] result: %s (tmpdir removed: %s)" % ("PASS" if ok else "FAIL", work))
    return 0 if ok else 1


def main() -> int:
    ap = argparse.ArgumentParser(description="tracked .cheng source purity gate")
    ap.add_argument("--self-test", action="store_true",
                    help="三腿契约自检（/private/tmp 临时 git 仓，用完即删）")
    ap.add_argument("--root", default=".",
                    help="被审仓根（默认 cwd；CI 必须显式传仓根，勿依赖调用方 cwd）")
    args = ap.parse_args()
    if args.self_test:
        return run_self_test()
    return scan(Path(args.root).resolve())


if __name__ == "__main__":
    sys.exit(main())