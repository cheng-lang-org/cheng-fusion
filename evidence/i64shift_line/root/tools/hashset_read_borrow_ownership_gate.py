#!/usr/bin/env python3
"""Validate the single borrowed HashSetStr read path and its HashMap root."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
HASHMAPS = ROOT / "src/std/hashmaps.cheng"
HASHSETS = ROOT / "src/std/hashsets.cheng"


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def require_once(text: str, needle: str, label: str) -> None:
    if text.count(needle) != 1:
        raise ValueError(f"{label}: expected exactly one occurrence")


def validate(hashmaps: str, hashsets: str) -> None:
    required_hashmap = (
        "@borrows\nfn hashMapStrIntReadOccupiedSlot(states: uint8[],",
        "@borrows\nfn hashMapStrIntFindSlot(m: HashMapStrInt,",
        "@borrows\nfn hashMapStrIntFindSlotMeta(m: HashMapStrInt,",
        "@borrows\nfn HashMapStrIntFindSlot(m: HashMapStrInt,",
    )
    required_hashset = (
        "@borrows\nfn hashSetStrHas(s: HashSetStr, key: str): bool =",
        "@borrows\nfn HashSetStrHas(s: HashSetStr, key: str): bool =",
    )
    for index, needle in enumerate(required_hashmap):
        require_once(hashmaps, needle, f"hashmap borrowed helper {index}")
    for index, needle in enumerate(required_hashset):
        require_once(hashsets, needle, f"hashset borrowed helper {index}")
    for forbidden in (
        "fn hashSetStrHas(s: var HashSetStr",
        "fn HashSetStrHas(s: var HashSetStr",
        "HashMapStrIntGetMutEx(s.map",
    ):
        if forbidden in hashsets:
            raise ValueError(f"mutable read overload remains: {forbidden}")
    for forbidden in (
        "fn hashMapStrIntFindSlotMut",
        "hashMapStrIntFindSlotMutMeta(",
        "fn hashMapStrIntFindSlotMeta(m: HashMapStrInt,\n"
        "                             key: str,",
        "fn hashMapStrEqMeta(cur: str, key: str,",
    ):
        if forbidden in hashmaps:
            raise ValueError(f"duplicate mutable probe remains: {forbidden}")
    read_start = hashmaps.index(
        "@borrows\nfn hashMapStrIntFindSlotMeta(m: HashMapStrInt,")
    read_end = hashmaps.index(
        "\nfn hashMapStrIntGrowWithProbe(", read_start)
    read_body = hashmaps[read_start:read_end]
    for forbidden in (
        "let states: uint8[] = m.states",
        "let hashes: uint64[] = m.hashes",
        "let keys: str[] = m.keys",
    ):
        if forbidden in read_body:
            raise ValueError(f"managed field alias remains: {forbidden}")
    for required in (
        "let st: uint8 = m.states[probe]",
        "if m.hashes[probe] == keyHash:",
        "m.keys[probe], keyLen, keyPtr",
    ):
        require_once(read_body, required, f"direct borrowed map field {required}")
    grow_start = hashmaps.index(
        "fn hashMapStrIntGrowWithProbe(m: var HashMapStrInt,")
    grow_end = hashmaps.index(
        "\nfn hashMapStrIntGrow(", grow_start)
    grow_body = hashmaps[grow_start:grow_end]
    for forbidden in (
        "var oldKeys:",
        "var oldVals:",
        "var oldHashes:",
        "var oldStates:",
        "let oldKeys:",
        "let oldVals:",
        "let oldHashes:",
        "let oldStates:",
        "hashMapTakeSeq",
    ):
        if forbidden in grow_body:
            raise ValueError(f"grow managed alias remains: {forbidden}")
    for required in (
        "let oldCap: int32 = m.keys.len\n"
        "    let oldUsed: int32 = m.used",
        "hashMapStrIntReadOccupiedSlot(m.states,",
        "let keyLen: int32 = m.keys[oldSlot].len\n"
        "        let keyPtr: ptr = m.keys[oldSlot].data",
        "hashMapStrIntFindSlotMeta(nextMap,\n"
        "                                                    keyHash,",
        "nextMap.keys[slot] = m.keys[oldSlot]\n"
        "        m.keys[oldSlot] = \"\"",
        "seqs.chengSeqFreeTyped(m.keys)\n"
        "    seqs.chengSeqFreeTyped(m.vals)\n"
        "    seqs.chengSeqFreeTyped(m.hashes)\n"
        "    seqs.chengSeqFreeTyped(m.states)\n"
        "    m = nextMap",
    ):
        require_once(grow_body, required, f"grow take authority {required}")


def mutate_once(text: str, old: str, new: str) -> str:
    if text.count(old) != 1:
        raise AssertionError(f"mutation source not unique: {old!r}")
    return text.replace(old, new, 1)


def self_test(hashmaps: str, hashsets: str) -> int:
    mutations: list[tuple[str, str, str]] = []
    for needle in (
        "@borrows\nfn hashMapStrIntReadOccupiedSlot(states: uint8[],",
        "@borrows\nfn hashMapStrIntFindSlot(m: HashMapStrInt,",
        "@borrows\nfn hashMapStrIntFindSlotMeta(m: HashMapStrInt,",
        "@borrows\nfn HashMapStrIntFindSlot(m: HashMapStrInt,",
    ):
        mutations.append(
            ("hashmaps", needle, needle.removeprefix("@borrows\n")))
    for needle in (
        "@borrows\nfn hashSetStrHas(s: HashSetStr, key: str): bool =",
        "@borrows\nfn HashSetStrHas(s: HashSetStr, key: str): bool =",
    ):
        mutations.append(
            ("hashsets", needle, needle.removeprefix("@borrows\n")))
    mutations.extend(
        (
            (
                "hashsets",
                "fn HashSetStrClear(s: var HashSetStr) =",
                "fn hashSetStrHas(s: var HashSetStr, key: str): bool =\n"
                "    return false\n\n"
                "fn HashSetStrClear(s: var HashSetStr) =",
            ),
            (
                "hashsets",
                "fn HashSetStrAdd(s: var HashSetStr, key: str) =",
                "fn HashSetStrHas(s: var HashSetStr, key: str): bool =\n"
                "    return false\n\n"
                "fn HashSetStrAdd(s: var HashSetStr, key: str) =",
            ),
            (
                "hashmaps",
                "let st: uint8 = m.states[probe]",
                "let states: uint8[] = m.states\n"
                "        let st: uint8 = m.states[probe]",
            ),
            (
                "hashmaps",
                "let st: uint8 = m.states[probe]",
                "let hashes: uint64[] = m.hashes\n"
                "        let st: uint8 = m.states[probe]",
            ),
            (
                "hashmaps",
                "let st: uint8 = m.states[probe]",
                "let keys: str[] = m.keys\n"
                "        let st: uint8 = m.states[probe]",
            ),
            (
                "hashmaps",
                "fn hashMapStrIntGrowWithProbe(m: var HashMapStrInt,",
                "fn hashMapStrIntFindSlotMut(m: var HashMapStrInt,\n"
                "                                key: str,\n"
                "                                allowInsert: bool): int32 =\n"
                "    return -1\n\n"
                "fn hashMapStrIntGrowWithProbe(m: var HashMapStrInt,",
            ),
            (
                "hashmaps",
                "hashMapStrIntFindSlotMeta(nextMap,",
                "hashMapStrIntFindSlotMutMeta(nextMap,",
            ),
            (
                "hashmaps",
                "fn hashMapStrIntFindSlotMeta(m: HashMapStrInt,\n"
                "                             keyHash: uint64,",
                "fn hashMapStrIntFindSlotMeta(m: HashMapStrInt,\n"
                "                             key: str,\n"
                "                             keyHash: uint64,",
            ),
            (
                "hashmaps",
                "fn hashMapStrEqMeta(cur: str, keyLen: int32,",
                "fn hashMapStrEqMeta(cur: str, key: str, keyLen: int32,",
            ),
            (
                "hashmaps",
                "        m.keys[oldSlot] = \"\"\n"
                "        nextMap.vals[slot] = val",
                "        nextMap.vals[slot] = val",
            ),
            (
                "hashmaps",
                "    let oldUsed: int32 = m.used",
                "    let oldUsed: int32 = m.used\n"
                "    var oldKeys: str[] = m.keys",
            ),
            (
                "hashmaps",
                "    seqs.chengSeqFreeTyped(m.keys)\n"
                "    seqs.chengSeqFreeTyped(m.vals)\n"
                "    seqs.chengSeqFreeTyped(m.hashes)\n"
                "    seqs.chengSeqFreeTyped(m.states)\n"
                "    m = nextMap",
                "    m = nextMap\n"
                "    seqs.chengSeqFreeTyped(m.keys)\n"
                "    seqs.chengSeqFreeTyped(m.vals)\n"
                "    seqs.chengSeqFreeTyped(m.hashes)\n"
                "    seqs.chengSeqFreeTyped(m.states)",
            ),
        )
    )
    rejected = 0
    for target, old, new in mutations:
        mutated_maps = hashmaps
        mutated_sets = hashsets
        if target == "hashmaps":
            mutated_maps = mutate_once(hashmaps, old, new)
        else:
            mutated_sets = mutate_once(hashsets, old, new)
        try:
            validate(mutated_maps, mutated_sets)
        except ValueError:
            rejected += 1
    if rejected != len(mutations):
        raise AssertionError(
            f"mutation rejection mismatch: {rejected}/{len(mutations)}")
    return rejected


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    hashmaps = HASHMAPS.read_text(encoding="utf-8")
    hashsets = HASHSETS.read_text(encoding="utf-8")
    validate(hashmaps, hashsets)
    rejected = self_test(hashmaps, hashsets) if args.self_test else 0
    print(json.dumps(
        {
            "schema": "cheng.hashset_read_borrow_ownership",
            "status": "GREEN",
            "hashmaps_sha256": sha256(hashmaps),
            "hashsets_sha256": sha256(hashsets),
            "unique_read_overload_count": 1,
            "mutations_rejected": rejected,
        },
        sort_keys=True,
    ))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
