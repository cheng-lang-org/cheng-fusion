# evidence/

Checked-in release evidence deposited from finished ignition-chain runs by
`tools/evidence_deposit.py`. One directory per run: `<runId>/` holds the
verbatim `journal.jsonl` + `done.json`/`completion.claim.json` sentinel pair,
the provenance record (`provenance.json`, `input_manifest.json`), per-stage
verdict summaries (`stages.json`), the hash-binding `receipt.json`
(source tree / seed / driver / GEN2 / GEN3 / fixture manifest / comparator /
chain tool / deposit tool), and `manifest.json` re-hashing every deposited
file. `index.json` is the append-only machine index: runId -> verdict +
hashes + ts. Directories are committed by atomic rename; a runId is deposited
exactly once unless `--force` is passed explicitly.
