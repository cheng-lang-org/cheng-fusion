# CSG-Core Boundary

`csg-core/` 是 CSG-Core 从 Cheng 仓库中产品化拆出的边界说明，不合并 `ts-csg`、`rust-csg-core`、`codex/src` 的实现。

## Owned Standard Surface

```text
csg-core/manifest.json
src/core/csg_core/
tools/csg
csg-core/tools/csg
csg-core/tools/csg_core_conformance_test.sh
csg-core/testdata/
docs/csg-core-standard.md
tools/csg_relfacts_conformance_test.sh
```

There is no npm/TypeScript implementation surface in `csg-core`.

Root-level compatibility paths remain:

```text
tools/csg_core_conformance_test.sh
tools/csg
testdata/csg-core/
docs/csg-core-standard.md
```

`csg-core/tools/csg` and root `tools/csg` execute the pure Cheng reference CLI from `src/core/csg_core/cli.cheng`. They compile it on demand with the real provider-linked runtime closure.

`ts-csg` remains the TypeScript/Web producer. It does not depend on the `csg-core` npm package; its summaries and debug reports are checked against the pure Cheng `tools/csg` surface.

## CSGC Format Contract

The production facts cargo is binary CSGC, not JSONL. JSONL remains a debug/export compatibility input only.

Current CSGC has one unversioned header shape:

```text
magic(4) + headerSize(2)=64 + flags(2) + factCount(4)
  + bodyCompressedSize(4) + bodyOriginalSize(4) + reserved(44)
```

`headerSize=64` is the admission guard. Old headers are rejected because offset 4 does not contain 64. `src/core/csg_core/csgc.cheng` is the pure Cheng reference writer/reader. It encodes canonical JSON facts as tokenized UTF-8 rows with a deterministic dictionary. The dictionary only keeps repeated tokens whose measured byte savings are positive; this avoids making small or low-repeat fixtures larger just because a token appeared twice.

`csg pack` reports both binary and canonical JSONL sizes:

```text
fact_count=<n>
csgc_bytes=<bytes>
canonical_jsonl_bytes=<bytes>
out=<path>
```

Required gates:

```text
repeated facts -> CSGC smaller than canonical JSONL
repeated pack  -> byte-identical CSGC
decode/validate/root/diff/edit -> unchanged facts_root semantics
```

Current measured baseline for the full CSG-Core input on 2026-07-09:

```text
full csg-core.csgc:       173716125 -> 137931020 bytes (-35785105 bytes)
csg.runtime_requirement:  ~70.0 MB -> ~34.5 MB
runtime requirement write: ~10.96 s -> ~1.80 s
full readback:             ~3.8 s - ~4.4 s
```

These numbers are evidence for this input and implementation, not a universal compression guarantee. Roundtrip coverage must keep `requirementKind`, `proofs`, `loc`, and `owner` intact.

Production runs should ship `.csgc` plus a lightweight `summary.json`. Query hot paths may also ship `facts.idx.json` for file/symbol/function/call lookup. Full `report.json` is a debug artifact and is generated only when an operator explicitly asks for it.

Conformance is one core layer:

```text
Core conformance       pure Cheng CLI + canonical fixtures + schema/hash rules
```

## Producer / Consumer Model

```text
ts-csg          producer: csg_core + csg_dialect::web
rust-csg-core   Rust/Codex migration implementation; no Rust dialect facts producer is wired
codex/src       consumer: Codex migration profile, not core schema
Cheng cold      consumer: csg_abi::* / legacy CHENG_CSG wire bridge
Vexa            future profile: vexa-csg, not tied to ts-csg or rust-csg
```

## Hard Rules

```text
CSG-Core standard names use csg_* namespaces only.
Cheng-specific wire magic stays legacy compatibility only.
Profile facts may extend CSG-Core but cannot redefine core field meaning.
complete=false blocks production lowering.
Tombstone sandbox validates structure but cannot generate production artifacts.
```
