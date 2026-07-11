#!/usr/bin/env python3
"""gen3≡gen2 掩码字节比对: 掩 LC_UUID(16B) + LC_CODE_SIGNATURE 数据区, 其余须逐字节恒等.
依据: 同树双烤实测唯二差异区 (findings wave-36 终章 §3). 用法: macho_masked_cmp.py a b"""
import struct, sys

def load_commands(buf):
    magic, = struct.unpack_from('<I', buf, 0)
    assert magic == 0xfeedfacf, hex(magic)  # MH_MAGIC_64 LE
    ncmds, = struct.unpack_from('<I', buf, 16)
    off = 32
    out = []
    for _ in range(ncmds):
        cmd, cmdsize = struct.unpack_from('<II', buf, off)
        out.append((cmd, off, cmdsize))
        off += cmdsize
    return out

def mask_regions(buf):
    regions = []
    for cmd, off, cmdsize in load_commands(buf):
        if cmd == 0x1b:  # LC_UUID
            regions.append((off + 8, off + 8 + 16))
        elif cmd == 0x1d:  # LC_CODE_SIGNATURE
            dataoff, datasize = struct.unpack_from('<II', buf, off + 8)
            regions.append((dataoff, dataoff + datasize))
    return regions

a = bytearray(open(sys.argv[1], 'rb').read())
b = bytearray(open(sys.argv[2], 'rb').read())
if len(a) != len(b):
    print(f"MISMATCH size {len(a)} != {len(b)}")
    sys.exit(1)
for buf in (a, b):
    for lo, hi in mask_regions(bytes(buf)):
        buf[lo:hi] = b'\x00' * (hi - lo)
diff = sum(1 for x, y in zip(a, b) if x != y)
if diff == 0:
    print(f"IDENTICAL (masked uuid+signature, {len(a)} bytes)")
    sys.exit(0)
first = next(i for i, (x, y) in enumerate(zip(a, b)) if x != y)
print(f"MISMATCH {diff} bytes, first at offset {first:#x}")
sys.exit(1)
