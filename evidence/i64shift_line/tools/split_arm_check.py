#!/usr/bin/env python3
"""按 objdump 符号表把移位指令归位到具名函数, 断言各臂移位方向。

用法: split_arm_check.py <disc.asm> <disc.symtab> <asr_mnem> <lsr_mnem> <tag>=<asr|lsr> ...
  disc.asm   = objdump -d 输出
  disc.symtab= objdump -t 输出（F .text 符号行: addr ... name）
  tag        = 符号名子串; expect=该臂应含的助记（另一方向出现=WRONG）
输出: 每臂归位 + VERDICT=GREEN/RED。
"""
import re
import sys

asm_path, sym_path, m_asr, m_lsr = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
spec = []
for arg in sys.argv[5:]:
    tag, expect = arg.split("=", 1)
    spec.append((tag, expect))

syms = []  # (addr, name)
for line in open(sym_path, encoding="utf-8", errors="replace"):
    line = line.rstrip("\n")
    if not re.match(r"^[0-9a-f]{4,}\s", line) or " F .text" not in line:
        continue
    syms.append((int(line.split()[0], 16), line.split()[-1].strip()))
syms.sort()

def owner(addr):
    best = None
    for a, name in syms:
        if a <= addr:
            best = name
        else:
            break
    return best

hits = {}  # funcname -> set(mnems)
insn = re.compile(r"^\s*([0-9a-f]+):\s*(?:[0-9a-f]{2,8}\s+)*(\w+)")
for line in open(asm_path, encoding="utf-8", errors="replace"):
    mm = insn.match(line)
    if not mm:
        continue
    mnem = mm.group(2)
    if mnem.startswith(m_asr) or mnem.startswith(m_lsr):
        name = owner(int(mm.group(1), 16))
        if name:
            hits.setdefault(name, set()).add(mnem)

verdict = "GREEN"
for tag, expect in spec:
    names = [n for n in hits if tag in n]
    if not names:
        print(f"{tag}: NOT_FOUND_IN_HITS (syms={len(syms)} hits={sorted(hits)})")
        verdict = "RED"
        continue
    name = sorted(names)[0]
    mnems = hits[name]
    has_asr = any(m.startswith(m_asr) for m in mnems)
    has_lsr = any(m.startswith(m_lsr) for m in mnems)
    if expect == "asr":
        ok = has_asr and not has_lsr
    else:
        ok = has_lsr and not has_asr
    print(f"{tag}: sym={name} mnems={sorted(mnems)} expect={expect} -> {'OK' if ok else 'WRONG'}")
    if not ok:
        verdict = "RED"

print(f"VERDICT={verdict}")
sys.exit(0)
