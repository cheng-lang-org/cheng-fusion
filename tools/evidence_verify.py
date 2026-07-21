#!/usr/bin/env python3
"""evidence_verify.py -- post-deposit verifier for the checked-in evidence store.

evidence_deposit.py validates a run workDir at deposit time; nothing
re-checked the deposited evidence/<runId>/ payloads afterwards (GAP-1).
This verifier closes that gap. For every deposited run it re-checks, from
the checked-in bytes alone:

  1. manifest.json: schema/runId exact; every listed file re-hashes to the
     recorded sha256 and size; the on-disk file set is exactly
     manifest.files + {"manifest.json"} (no missing, no extra files)
  2. done.json and completion.claim.json are byte-identical
  3. journal.jsonl parses line-by-line, starts with a provenance record,
     ends with a done record whose verdict equals done.json's verdict
  4. receipt.json shape: schema exact, runId == directory name, verdict a
     non-empty upper-case enum-shaped token, depositedAt/depositedAtEpoch
     present
  5. index.json: schema exact; entry for the run is consistent with the
     receipt hash block (verdict, lastStage, ts, seedSha256,
     treeSrcHash<->sourceTreeSrcHash, inputManifestSha256, driverSha256,
     gen2Sha256, gen3Sha256, gen3MaskedIdentical)
  6. provenance.json / input_manifest.json / stages.json cross-checks:
     inputManifestSha256 agrees with the receipt hash block, stages.json
     carries the same runId and the exact stages schema

  7. store-level: every run in index.json has a deposited directory and
     every deposited directory is listed in index.json (no orphan either
     way)

Any mismatch is a hard error (exit 1). Usage errors exit 2.

Usage:
  evidence_verify.py [--evidence-dir DIR] [runId ...]

With no runId, every run listed in index.json plus the store-level checks
are verified. With explicit runIds only those runs are verified (the
store-level orphan checks are skipped).

Exit codes: 0 all verified, 1 verification failure, 2 usage error.
"""

import argparse
import hashlib
import json
import os
import re
import sys

SCHEMA_RECEIPT = "cheng-fusion-evidence-receipt/v1"
SCHEMA_STAGES = "cheng-fusion-evidence-stages/v1"
SCHEMA_MANIFEST = "cheng-fusion-evidence-manifest/v1"
SCHEMA_INDEX = "cheng-fusion-evidence-index/v1"

VERDICT_SHAPE = re.compile(r"^[A-Z][A-Z0-9_]{1,127}$")

# index.json entry key -> receipt.json path for the consistency check.
INDEX_RECEIPT_FIELDS = (
    ("verdict", ("verdict",)),
    ("lastStage", ("lastStage",)),
    ("ts", ("ts",)),
    ("seedSha256", ("hashes", "seedSha256")),
    ("treeSrcHash", ("hashes", "sourceTreeSrcHash")),
    ("inputManifestSha256", ("hashes", "inputManifestSha256")),
    ("driverSha256", ("hashes", "driverSha256")),
    ("gen2Sha256", ("hashes", "gen2Sha256")),
    ("gen3Sha256", ("hashes", "gen3Sha256")),
    ("gen3MaskedIdentical", ("hashes", "gen3MaskedIdentical")),
)

failures = []


def fail(msg):
    failures.append(msg)
    sys.stderr.write("evidence_verify: FAIL: %s\n" % msg)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return "sha256:" + h.hexdigest()


def load_json_file(path, what):
    try:
        with open(path, "r") as f:
            return json.load(f)
    except (OSError, ValueError) as e:
        fail("cannot parse %s at %s: %s" % (what, path, e))
        return None


def nested(obj, path):
    cur = obj
    for key in path:
        if not isinstance(cur, dict) or key not in cur:
            return None
        cur = cur[key]
    return cur


def verify_run(evidence_root, run_id):
    run_dir = os.path.join(evidence_root, run_id)
    if not os.path.isdir(run_dir):
        fail("%s: deposited directory missing" % run_id)
        return

    # ---- 1. manifest.json re-hash --------------------------------------
    manifest_path = os.path.join(run_dir, "manifest.json")
    manifest = load_json_file(manifest_path, "manifest.json")
    listed = {}
    if manifest is not None:
        if manifest.get("schema") != SCHEMA_MANIFEST:
            fail("%s: manifest.json schema %r != %r"
                 % (run_id, manifest.get("schema"), SCHEMA_MANIFEST))
        if manifest.get("runId") != run_id:
            fail("%s: manifest.json runId %r mismatch"
                 % (run_id, manifest.get("runId")))
        files = manifest.get("files")
        if not isinstance(files, dict) or not files:
            fail("%s: manifest.json files block missing/empty" % run_id)
        else:
            listed = files
            for name, info in files.items():
                p = os.path.join(run_dir, name)
                if not os.path.isfile(p):
                    fail("%s: manifest lists %s but file is absent"
                         % (run_id, name))
                    continue
                actual_sha = sha256_file(p)
                actual_size = os.path.getsize(p)
                if not isinstance(info, dict) or info.get("sha256") != actual_sha:
                    fail("%s: %s sha256 drifted: manifest=%s now=%s"
                         % (run_id, name,
                            None if not isinstance(info, dict) else info.get("sha256"),
                            actual_sha))
                if not isinstance(info, dict) or info.get("size") != actual_size:
                    fail("%s: %s size drifted: manifest=%s now=%d"
                         % (run_id, name,
                            None if not isinstance(info, dict) else info.get("size"),
                            actual_size))
    on_disk = set(os.listdir(run_dir))
    expected = set(listed.keys()) | {"manifest.json"}
    missing = expected - on_disk
    extra = on_disk - expected
    if missing:
        fail("%s: files missing on disk: %s" % (run_id, sorted(missing)))
    if extra:
        fail("%s: undeclared files present: %s" % (run_id, sorted(extra)))

    # ---- 2. done.json == completion.claim.json byte-identical ----------
    done_path = os.path.join(run_dir, "done.json")
    claim_path = os.path.join(run_dir, "completion.claim.json")
    done = None
    if os.path.isfile(done_path) and os.path.isfile(claim_path):
        with open(done_path, "rb") as f:
            done_bytes = f.read()
        with open(claim_path, "rb") as f:
            claim_bytes = f.read()
        if done_bytes != claim_bytes:
            fail("%s: done.json and completion.claim.json differ" % run_id)
        done = load_json_file(done_path, "done.json")
        if done is not None:
            if done.get("stage") != "done" or not done.get("verdict"):
                fail("%s: done.json is not a done record with a verdict" % run_id)

    # ---- 3. journal.jsonl structure + final verdict ---------------------
    journal_path = os.path.join(run_dir, "journal.jsonl")
    if os.path.isfile(journal_path):
        records = []
        with open(journal_path, "r") as f:
            for lineno, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    records.append(json.loads(line))
                except ValueError as e:
                    fail("%s: journal.jsonl line %d does not parse: %s"
                         % (run_id, lineno, e))
        if records:
            if records[0].get("stage") != "provenance":
                fail("%s: journal.jsonl does not start with provenance" % run_id)
            if records[-1].get("stage") != "done":
                fail("%s: journal.jsonl does not end with done" % run_id)
            elif done is not None and records[-1].get("verdict") != done.get("verdict"):
                fail("%s: journal done verdict %r != done.json verdict %r"
                     % (run_id, records[-1].get("verdict"), done.get("verdict")))
        else:
            fail("%s: journal.jsonl is empty" % run_id)

    # ---- 4. receipt.json shape ------------------------------------------
    receipt_path = os.path.join(run_dir, "receipt.json")
    receipt = load_json_file(receipt_path, "receipt.json")
    if receipt is not None:
        if receipt.get("schema") != SCHEMA_RECEIPT:
            fail("%s: receipt.json schema %r != %r"
                 % (run_id, receipt.get("schema"), SCHEMA_RECEIPT))
        if receipt.get("runId") != run_id:
            fail("%s: receipt.json runId %r != directory %r"
                 % (run_id, receipt.get("runId"), run_id))
        verdict = receipt.get("verdict")
        if not isinstance(verdict, str) or not VERDICT_SHAPE.match(verdict):
            fail("%s: receipt.json verdict %r is not enum-shaped" % (run_id, verdict))
        if not receipt.get("depositedAt") or not isinstance(
                receipt.get("depositedAtEpoch"), (int, float)):
            fail("%s: receipt.json lacks depositedAt/depositedAtEpoch" % run_id)
        if not isinstance(receipt.get("hashes"), dict):
            fail("%s: receipt.json hashes block missing" % run_id)

    # ---- 6. provenance/input_manifest/stages cross-checks ---------------
    prov = load_json_file(os.path.join(run_dir, "provenance.json"),
                          "provenance.json")
    input_manifest = load_json_file(os.path.join(run_dir, "input_manifest.json"),
                                    "input_manifest.json")
    stages = load_json_file(os.path.join(run_dir, "stages.json"), "stages.json")
    if receipt is not None and isinstance(receipt.get("hashes"), dict):
        want = receipt["hashes"].get("inputManifestSha256")
        for name, obj, key in (("provenance.json", prov, "inputManifestSha256"),
                               ("input_manifest.json", input_manifest,
                                "inputManifestSha256")):
            if obj is not None and obj.get(key) != want:
                fail("%s: %s %s %r != receipt %r"
                     % (run_id, name, key, obj.get(key), want))
    if stages is not None:
        if stages.get("schema") != SCHEMA_STAGES:
            fail("%s: stages.json schema %r != %r"
                 % (run_id, stages.get("schema"), SCHEMA_STAGES))
        if stages.get("runId") != run_id:
            fail("%s: stages.json runId %r mismatch"
                 % (run_id, stages.get("runId")))

    return receipt


def main():
    ap = argparse.ArgumentParser(
        description="Verify checked-in evidence deposits (GAP-1 hardening).")
    ap.add_argument("runIds", nargs="*")
    ap.add_argument("--evidence-dir",
                    default=os.path.normpath(os.path.join(
                        os.path.dirname(os.path.abspath(__file__)),
                        os.pardir, "evidence")),
                    help="default: <package>/evidence")
    args = ap.parse_args()
    evidence_root = os.path.normpath(args.evidence_dir)

    if not os.path.isdir(evidence_root):
        sys.stderr.write("evidence_verify: error: evidence dir missing: %s\n"
                         % evidence_root)
        sys.exit(2)

    index_path = os.path.join(evidence_root, "index.json")
    index = None
    if os.path.isfile(index_path):
        index = load_json_file(index_path, "index.json")
        if index is not None:
            if index.get("schema") != SCHEMA_INDEX:
                fail("index.json schema %r != %r"
                     % (index.get("schema"), SCHEMA_INDEX))
            if not isinstance(index.get("runs"), dict):
                fail("index.json runs block missing/not an object")
                index = None
    elif not args.runIds:
        sys.stderr.write("evidence_verify: error: index.json missing at %s\n"
                         % index_path)
        sys.exit(2)

    explicit = list(args.runIds)
    if explicit:
        run_ids = explicit
    else:
        run_ids = sorted(index["runs"].keys()) if index else []

    receipts = {}
    for run_id in run_ids:
        receipts[run_id] = verify_run(evidence_root, run_id)

    # ---- 5. index entries consistent with receipts ----------------------
    if index is not None:
        for run_id in run_ids:
            receipt = receipts.get(run_id)
            entry = index["runs"].get(run_id)
            if entry is None:
                fail("%s: present on disk but absent from index.json" % run_id)
                continue
            if receipt is None:
                continue
            for index_key, receipt_path in INDEX_RECEIPT_FIELDS:
                if entry.get(index_key) != nested(receipt, receipt_path):
                    fail("%s: index.%s %r != receipt.%s %r"
                         % (run_id, index_key, entry.get(index_key),
                            ".".join(receipt_path), nested(receipt, receipt_path)))

    # ---- 7. store-level orphan checks (full-store mode only) ------------
    if not explicit and index is not None:
        for run_id in index["runs"]:
            if not os.path.isdir(os.path.join(evidence_root, run_id)):
                fail("%s: listed in index.json but directory missing" % run_id)
        for name in sorted(os.listdir(evidence_root)):
            path = os.path.join(evidence_root, name)
            if not os.path.isdir(path):
                continue
            if name.startswith(".") or name in index["runs"]:
                continue
            fail("%s: deposited directory not listed in index.json" % name)

    if failures:
        sys.stderr.write("evidence_verify: %d check(s) failed\n" % len(failures))
        sys.exit(1)
    print("evidence_verify: verified %d run(s) in %s" % (len(run_ids), evidence_root))


if __name__ == "__main__":
    main()
