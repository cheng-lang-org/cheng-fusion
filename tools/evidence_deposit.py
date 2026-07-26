#!/usr/bin/env python3
"""evidence_deposit.py -- deposit one ignition-chain run's release evidence into the package.

Copies the strict evidence an ignition chain already produces inside its
ephemeral run workDir (journal.jsonl, done.json + completion.claim.json
sentinel pair, provenance record with inputManifestSha256 / per-input-file
sha256 / tree src hash / comparator hash, per-stage verdicts, GEN2/GEN3
masked-compare result) into the checked-in package directory
`evidence/<runId>/`, then re-hashes every deposited file into
`manifest.json` and appends one entry per run to `evidence/index.json`
(append-only: runId -> verdict + hashes + ts).

Atomicity contract: everything is staged in a sibling tmp directory and
committed with a single directory rename; index.json is written to a tmp
file and committed with rename(2). A run whose evidence is already
deposited is refused (exit 2) unless --force is passed, in which case the
old directory is swapped aside and removed only after the new one is in
place. Re-deposit with --force rewrites the index entry; nothing else
ever mutates existing entries.

Integrity contract (all violations are hard errors, exit 1):
  - runId must equal the run directory basename
  - done.json and completion.claim.json must exist and be byte-identical
    (chain.py writes both from one record; a mismatch means tampering)
  - journal.jsonl must parse line-by-line, start with a provenance
    record and end with a done record whose verdict matches done.json
  - a baked binary still present in the run dir (DRV/GEN2) must still
    hash to the value the journal recorded at bake time

Usage:
  evidence_deposit.py <runId> <runDir> [--evidence-dir DIR] [--force]

Exit codes: 0 deposited, 1 integrity/usage error, 2 already deposited.
"""

import argparse
import datetime
import hashlib
import json
import os
import shutil
import sys

SCHEMA_RECEIPT = "cheng-fusion-evidence-receipt"
SCHEMA_STAGES = "cheng-fusion-evidence-stages"
SCHEMA_MANIFEST = "cheng-fusion-evidence-manifest"
SCHEMA_INDEX = "cheng-fusion-evidence-index"

# Stage-record keys that are bulky, workDir-absolute, or both; the verbatim
# journal.jsonl is deposited alongside, so the stage summary drops them.
SUMMARY_DROP_KEYS = (
    "stdoutLog", "stderrLog", "stderrTail", "stdoutTail", "maskedOutput",
)
CASE_KEEP_KEYS = ("name", "rc", "compileRc", "runRc", "expect", "pass")


def fail(msg):
    sys.stderr.write("evidence_deposit: error: %s\n" % msg)
    sys.exit(1)


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


def write_json(path, obj):
    with open(path, "w") as f:
        json.dump(obj, f, indent=2, sort_keys=False)
        f.write("\n")
        f.flush()
        os.fsync(f.fileno())


def project_case(case):
    return {k: case[k] for k in CASE_KEEP_KEYS if k in case}


def project_stage(rec):
    """Compact verdict summary of one journal record; never fabricates
    fields a record does not have (chain_journal.sh house rule)."""
    out = {"stage": rec["stage"], "ts": rec.get("ts")}
    for k, v in rec.items():
        if k in ("stage", "ts") or k in SUMMARY_DROP_KEYS:
            continue
        if isinstance(v, list) and v and isinstance(v[0], dict) and "name" in v[0]:
            out[k] = [project_case(c) for c in v]
        else:
            out[k] = v
    return out


def binary_receipt(run_dir, fname, journal_sha):
    """Return (sha256, reverified). Hard-fails when the file is still
    present but no longer matches the at-bake journal hash."""
    path = os.path.join(run_dir, fname)
    if not os.path.isfile(path):
        return journal_sha, False
    actual = sha256_file(path)
    if journal_sha is not None and actual != journal_sha:
        fail("%s hash drifted since the run: journal=%s now=%s "
             "(run workDir mutated; refusing to deposit false evidence)"
             % (fname, journal_sha, actual))
    return actual, True


def main():
    ap = argparse.ArgumentParser(description="Deposit ignition-chain run evidence into the package.")
    ap.add_argument("runId")
    ap.add_argument("runDir")
    ap.add_argument("--evidence-dir",
                    default=os.path.normpath(os.path.join(
                        os.path.dirname(os.path.abspath(__file__)), os.pardir, "evidence")),
                    help="default: <package>/evidence")
    ap.add_argument("--force", action="store_true",
                    help="replace an existing deposit for the same runId")
    args = ap.parse_args()

    run_id = args.runId
    run_dir = os.path.normpath(args.runDir)
    evidence_root = os.path.normpath(args.evidence_dir)

    if not os.path.isdir(run_dir):
        fail("run directory does not exist: %s" % run_dir)
    if os.path.basename(run_dir) != run_id:
        fail("runId %r does not match run directory basename %r"
             % (run_id, os.path.basename(run_dir)))

    # ---- load and cross-validate the run's own records -----------------
    journal_path = os.path.join(run_dir, "journal.jsonl")
    done_path = os.path.join(run_dir, "done.json")
    claim_path = os.path.join(run_dir, "completion.claim.json")
    for p, what in ((journal_path, "journal.jsonl"), (done_path, "done.json"),
                    (claim_path, "completion.claim.json")):
        if not os.path.isfile(p):
            fail("run is missing %s (%s); only finished runs can be deposited"
                 % (what, p))

    with open(done_path, "rb") as f:
        done_bytes = f.read()
    with open(claim_path, "rb") as f:
        claim_bytes = f.read()
    if done_bytes != claim_bytes:
        fail("done.json and completion.claim.json differ; chain.py writes "
             "both from one record, so the run directory was tampered with")
    done = load_json_file(done_path, "done.json")
    if done.get("stage") != "done" or not done.get("verdict"):
        fail("done.json is not a done record with a verdict: %r" % (done,))

    records = []
    with open(journal_path, "r") as f:
        for lineno, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except ValueError as e:
                fail("journal.jsonl line %d does not parse: %s" % (lineno, e))
    if not records or records[0].get("stage") != "provenance":
        fail("journal.jsonl does not start with a provenance record")
    if records[-1].get("stage") != "done":
        fail("journal.jsonl does not end with a done record; run incomplete?")
    if records[-1].get("verdict") != done["verdict"]:
        fail("journal done verdict %r != done.json verdict %r"
             % (records[-1].get("verdict"), done["verdict"]))

    prov = records[0]
    if not prov.get("inputManifestSha256") or not prov.get("inputFiles"):
        fail("provenance record lacks inputManifestSha256/inputFiles")
    for finfo in prov["inputFiles"]:
        if not finfo.get("sha256AtRun"):
            fail("provenance input %r lacks sha256AtRun" % finfo.get("name"))

    stage_by_name = {}
    for rec in records:
        stage_by_name.setdefault(rec.get("stage"), rec)
    drv = stage_by_name.get("drvBake", {})
    gen2 = stage_by_name.get("gen2Bake", {})
    gen3 = stage_by_name.get("gen3", {})

    # ---- key receipts: re-verify binaries still present -----------------
    driver_sha, driver_reverified = binary_receipt(run_dir, "DRV", drv.get("sha256"))
    gen2_sha, gen2_reverified = binary_receipt(run_dir, "GEN2", gen2.get("sha256"))
    gen3_sha, gen3_reverified = binary_receipt(run_dir, "GEN3", None)

    comparator_sha = None
    for finfo in prov["inputFiles"]:
        if finfo.get("kind") == "comparator":
            comparator_sha = finfo["sha256AtRun"]
    chain_py = os.path.join(run_dir, "chain.py")
    chain_tool_sha = sha256_file(chain_py) if os.path.isfile(chain_py) else None
    deposit_tool_sha = sha256_file(os.path.abspath(__file__))

    now_epoch = datetime.datetime.now(datetime.timezone.utc).timestamp()
    now_iso = datetime.datetime.now(datetime.timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ")

    receipt = {
        "schema": SCHEMA_RECEIPT,
        "runId": run_id,
        "verdict": done["verdict"],
        "lastStage": done.get("lastStage"),
        "ts": done.get("ts"),
        "hashes": {
            "sourceTreeSrcHash": prov.get("treeSrcHashAtRun"),
            "seedSha256": prov.get("seedSha256AtRun"),
            "inputManifestSha256": prov["inputManifestSha256"],
            "driverSha256": driver_sha,
            "gen2Sha256": gen2_sha,
            "gen3Sha256": gen3_sha,
            "gen3MaskedIdentical": gen3.get("maskedIdentical"),
            "comparatorSha256": comparator_sha,
            "chainToolSha256": chain_tool_sha,
            "depositToolSha256": deposit_tool_sha,
        },
        "verification": {
            "doneClaimIdentical": True,
            "seedShaMatch": prov.get("seedShaMatch"),
            "treeSrcHashMatch": prov.get("treeSrcHashMatch"),
            "inputFilesMatch": prov.get("inputFilesMatch"),
            "driverFileReverified": driver_reverified,
            "gen2FileReverified": gen2_reverified,
            "gen3FileReverified": gen3_reverified,
        },
        "depositedAt": now_iso,
        "depositedAtEpoch": now_epoch,
    }

    input_manifest = {
        "inputManifestSha256": prov["inputManifestSha256"],
        "inputFilesMatch": prov.get("inputFilesMatch"),
        "inputFiles": prov["inputFiles"],
    }
    stages = {
        "schema": SCHEMA_STAGES,
        "runId": run_id,
        "stages": [project_stage(r) for r in records],
    }

    # ---- stage everything, then commit atomically -----------------------
    final_dir = os.path.join(evidence_root, run_id)
    staging_dir = os.path.join(evidence_root, ".tmp-%s.%d" % (run_id, os.getpid()))
    index_path = os.path.join(evidence_root, "index.json")
    index_tmp = os.path.join(evidence_root, ".index.json.tmp.%d" % os.getpid())

    if os.path.exists(final_dir) and not args.force:
        sys.stderr.write("evidence_deposit: %s already deposited at %s "
                         "(use --force to replace)\n" % (run_id, final_dir))
        sys.exit(2)

    os.makedirs(evidence_root, exist_ok=True)
    trash_dir = None
    try:
        os.makedirs(staging_dir)
        for src, dst in ((journal_path, "journal.jsonl"),
                         (done_path, "done.json"),
                         (claim_path, "completion.claim.json")):
            shutil.copyfile(src, os.path.join(staging_dir, dst))
        guard_src = os.path.join(run_dir, "inputs", "tree", ".tree_guard_manifest")
        if os.path.isfile(guard_src):
            shutil.copyfile(guard_src, os.path.join(staging_dir, "tree_guard_manifest"))
        write_json(os.path.join(staging_dir, "provenance.json"), prov)
        write_json(os.path.join(staging_dir, "input_manifest.json"), input_manifest)
        write_json(os.path.join(staging_dir, "stages.json"), stages)
        write_json(os.path.join(staging_dir, "receipt.json"), receipt)
        manifest = {"schema": SCHEMA_MANIFEST, "runId": run_id, "files": {}}
        for name in sorted(os.listdir(staging_dir)):
            p = os.path.join(staging_dir, name)
            manifest["files"][name] = {
                "sha256": sha256_file(p),
                "size": os.path.getsize(p),
            }
        write_json(os.path.join(staging_dir, "manifest.json"), manifest)

        # Prepare the merged index content before touching anything live.
        index = {"schema": SCHEMA_INDEX, "runs": {}}
        if os.path.isfile(index_path):
            index = load_json_file(index_path, "index.json")
            if index.get("schema") != SCHEMA_INDEX or not isinstance(index.get("runs"), dict):
                fail("index.json has unexpected schema: %r" % index.get("schema"))
        if run_id in index["runs"] and not args.force:
            sys.stderr.write("evidence_deposit: %s already present in index.json "
                             "(use --force to replace)\n" % run_id)
            sys.exit(2)
        index["runs"][run_id] = {
            "verdict": done["verdict"],
            "lastStage": done.get("lastStage"),
            "ts": done.get("ts"),
            "depositedAt": now_iso,
            "seedSha256": prov.get("seedSha256AtRun"),
            "treeSrcHash": prov.get("treeSrcHashAtRun"),
            "inputManifestSha256": prov["inputManifestSha256"],
            "driverSha256": driver_sha,
            "gen2Sha256": gen2_sha,
            "gen3Sha256": gen3_sha,
            "gen3MaskedIdentical": gen3.get("maskedIdentical"),
        }
        write_json(index_tmp, index)

        # Commit: swap the directory in one rename, then the index.
        if os.path.exists(final_dir):
            trash_dir = os.path.join(
                evidence_root, ".trash-%s.%d" % (run_id, os.getpid()))
            os.rename(final_dir, trash_dir)
        os.rename(staging_dir, final_dir)
        os.replace(index_tmp, index_path)
        if trash_dir is not None:
            shutil.rmtree(trash_dir)
            trash_dir = None
    except SystemExit:
        raise
    except BaseException as e:
        fail("deposit failed mid-flight (%s); staging=%s final=%s "
             "(staging dir removed, prior deposit untouched if present)"
             % (e, staging_dir, final_dir))
    finally:
        shutil.rmtree(staging_dir, ignore_errors=True)
        if os.path.isfile(index_tmp):
            os.remove(index_tmp)
        if trash_dir is not None and os.path.isdir(trash_dir):
            # Rename-back already happened but commit did not; restore.
            if not os.path.exists(final_dir):
                os.rename(trash_dir, final_dir)
            else:
                shutil.rmtree(trash_dir, ignore_errors=True)

    print("deposited %s -> %s (verdict=%s, index runs=%d)"
          % (run_id, final_dir, done["verdict"], len(index["runs"])))


if __name__ == "__main__":
    main()
