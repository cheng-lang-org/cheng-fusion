#!/usr/bin/env python3
import argparse
import hashlib
import pathlib
import re
import sys


FAILURE_RELEASE = (
    "semanticSnapshotProductionCandidateBuildFailureReleaseInto"
)
CARGO_RELEASE = "snapshot_cargo.CsgCompilerSnapshotCargoRelease"
DECLARATION_RELEASE = (
    "declaration.SemanticSnapshotDeclarationTableReleaseInto"
)
FAILURE_MARKERS = (
    "if !cargo.ok:",
    "if !snapshot_core.PortableSemanticSnapshotIdentityMakeInto(",
    "if !snapshot_core.LocalSourceVersionBindingMakeInto(",
    "if !query_projection.SemanticSnapshotQueryProjectionBuildInto(",
    "if !snapshot_core.SemanticSnapshotValidationReceiptMakeInto(",
)
STATIC_RECEIPT_FIELDS = (
    "success_static_owner_allocation_sites",
    "success_static_owner_release_sites",
    "failure_exit_count",
    "failure_static_owner_allocation_sites",
    "failure_static_owner_release_sites",
)
FIXED_BYTES32_CAPTURE_BOUNDARIES = (
    (
        "originalTransitionCid",
        "csg.csgTransitionReceipt.receiptCid",
    ),
    ("originalSourceBundleCid", "csg.sourceBundleCid"),
    ("originalManifestCid", "universe.manifest.manifestCid"),
    ("originalExecutionCid", "compilerExecution.executionRaw32"),
    ("originalReceiptCid", "secondReceipt.receiptCid"),
    (
        "originalCompilerPackageCid",
        "secondReceipt.compilerPackageCid",
    ),
    ("originalTableInterface", "attackedInterfaces[0]"),
    (
        "originalProjectionContentCid",
        "candidate.queryProjection.documents[0].contentCid",
    ),
    (
        "originalQueryIndexCid",
        "candidate.queryProjection.queryIndex.indexCid",
    ),
    (
        "originalQueryIndexRootCid",
        "candidate.queryProjection.queryIndex.rootCid",
    ),
    (
        "originalProjectionCid",
        "candidate.queryProjection.projectionCid",
    ),
    (
        "originalDeclarationTableCid",
        "candidate.tables.declarations.tableCid",
    ),
    (
        "originalDeclarationType",
        (
            "candidate.tables.declarations."
            "portableSignatureTypeExpressionCids[functionDeclId]"
        ),
    ),
    (
        "originalNameProof",
        (
            "candidate.tables.declarations."
            "parserValidatedNameProofCids[functionDeclId]"
        ),
    ),
    (
        "storedDebugProjection",
        "store.payloadDebugFactProjectionCids[0]",
    ),
    (
        "storedQueryProjectionCid",
        "store.payloadQueryProjections[0].projectionCid",
    ),
    (
        "storedQueryIndexCid",
        "store.payloadQueryProjections[0].queryIndex.indexCid",
    ),
    (
        "storedQueryIndexRootCid",
        "store.payloadQueryProjections[0].queryIndex.rootCid",
    ),
    (
        "storedSymbolCid",
        "store.payloadTables[0].symbols.symbolCids[functionSymbolId]",
    ),
    (
        "originalBindingCompilerCid",
        "debugBindingReceipt.compilerCid",
    ),
    (
        "originalCompilerFactProjection",
        "store.payloadCompilerFactProjectionCids[0]",
    ),
    (
        "storedDeclarationType",
        (
            "store.payloadTables[0].declarations."
            "portableSignatureTypeExpressionCids[functionDeclId]"
        ),
    ),
    (
        "storedNameProof",
        (
            "store.payloadTables[0].declarations."
            "parserValidatedNameProofCids[functionDeclId]"
        ),
    ),
    (
        "storedDeclarationTableCid",
        "store.payloadTables[0].declarations.tableCid",
    ),
    (
        "predecessorQueryIndexCid",
        "store.payloadQueryIndexCids[0]",
    ),
    (
        "predecessorQueryIndexRootCid",
        "store.payloadQueryIndexRootCids[0]",
    ),
    (
        "predecessorValidationBindingCid",
        "store.payloadValidations[0].bindingReceiptCid",
    ),
    (
        "predecessorSourceContentCid",
        "store.payloadTables[0].sources.contentCids[0]",
    ),
    (
        "predecessorCompilerFactCid",
        "store.payloadCompilerFactProjectionCids[0]",
    ),
    (
        "predecessorSemanticFactCid",
        "store.payloadSemanticFactProjectionCids[0]",
    ),
    (
        "predecessorDebugFactCid",
        "store.payloadDebugFactProjectionCids[0]",
    ),
)


class ContractError(RuntimeError):
    pass


def require(condition: bool, reason: str) -> None:
    if not condition:
        raise ContractError(reason)


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def extract_function(text: str, name: str) -> tuple[str, int]:
    lines = text.splitlines()
    start = -1
    pattern = re.compile(r"^fn " + re.escape(name) + r"\(")
    for index, line in enumerate(lines):
        if pattern.match(line):
            start = index
            break
    require(start >= 0, "function_missing_" + name)
    end = len(lines)
    for index in range(start + 1, len(lines)):
        if lines[index].startswith("fn ") or lines[index].startswith(
            "@borrows"
        ):
            end = index
            break
    return "\n".join(lines[start:end]).rstrip() + "\n", start


def function_body(function_text: str) -> str:
    match = re.search(r"\)(?:\s*:[^=]+?)?\s*=\n", function_text)
    require(match is not None, "function_body_boundary_missing")
    return function_text[match.end() :]


def branch_block(function_text: str, marker: str) -> str:
    lines = function_text.splitlines()
    indexes = [index for index, line in enumerate(lines) if marker in line]
    require(len(indexes) == 1, "failure_marker_count_" + marker)
    start = indexes[0]
    indentation = len(lines[start]) - len(lines[start].lstrip(" "))
    end = len(lines)
    for index in range(start + 1, len(lines)):
        line = lines[index]
        if not line.strip():
            continue
        current = len(line) - len(line.lstrip(" "))
        if current <= indentation:
            end = index
            break
    return "\n".join(lines[start:end]) + "\n"


def validate_failure_release_helper(production_text: str) -> None:
    helper, _ = extract_function(
        production_text,
        "semanticSnapshotProductionCandidateBuildFailureReleaseInto",
    )
    body = function_body(helper)
    require(
        body.count(CARGO_RELEASE + "(") == 1,
        "failure_helper_cargo_release_count",
    )
    require(
        body.count(DECLARATION_RELEASE + "(") == 1,
        "failure_helper_declaration_release_count",
    )
    require(
        body.index(CARGO_RELEASE + "(")
        < body.index(DECLARATION_RELEASE + "("),
        "failure_helper_release_order",
    )
    require(
        "candidate" not in body and "return" not in body,
        "failure_helper_scope_expanded",
    )


def validate_candidate_make(production_text: str) -> None:
    candidate_make, _ = extract_function(
        production_text, "SemanticSnapshotProductionCandidateMakeInto"
    )
    body = function_body(candidate_make)
    require(
        body.count(
            "snapshot_schema.CsgCompilerSnapshotTablesClone(tables)"
        )
        == 1,
        "candidate_table_clone_count",
    )
    require(
        body.count(
            "snapshot_cargo.CsgCompilerSnapshotCargoBuild(candidateTables)"
        )
        == 1,
        "candidate_cargo_build_count",
    )
    require(
        body.index(
            "snapshot_schema.CsgCompilerSnapshotTablesClone(tables)"
        )
        < body.index(
            "snapshot_cargo.CsgCompilerSnapshotCargoBuild(candidateTables)"
        ),
        "candidate_owner_allocation_order",
    )
    require(
        body.count(FAILURE_RELEASE + "(") == len(FAILURE_MARKERS),
        "candidate_failure_release_exit_count",
    )
    require(
        CARGO_RELEASE + "(" not in body
        and DECLARATION_RELEASE + "(" not in body,
        "candidate_failure_bypasses_release_helper",
    )
    for marker in FAILURE_MARKERS:
        block = branch_block(candidate_make, marker)
        require(
            block.count(FAILURE_RELEASE + "(") == 1,
            "failure_exit_release_count_" + marker,
        )
        require(
            block.count("return false") == 1,
            "failure_exit_return_count_" + marker,
        )
        require(
            block.index(FAILURE_RELEASE + "(")
            < block.index("return false"),
            "failure_exit_returns_before_release_" + marker,
        )
    cargo_block = branch_block(candidate_make, FAILURE_MARKERS[0])
    owned_error = "let cargoError = parser.ParserOwnedText(cargo.error)"
    require(
        cargo_block.count(owned_error) == 1,
        "cargo_error_owned_copy_count",
    )
    require(
        cargo_block.index(owned_error)
        < cargo_block.index(FAILURE_RELEASE + "(")
        < cargo_block.index("err = cargoError")
        < cargo_block.index("return false"),
        "cargo_error_owner_lifetime_order",
    )
    require(
        body.count("out = candidate") == 1
        and body.count("return true") == 1
        and body.index("out = candidate") < body.index("return true"),
        "candidate_success_owner_transfer",
    )


def validate_candidate_release(production_text: str) -> None:
    release, _ = extract_function(
        production_text, "SemanticSnapshotProductionCandidateRelease"
    )
    body = function_body(release)
    require(
        body.count(CARGO_RELEASE + "(candidate.cargo)") == 1,
        "success_cargo_release_count",
    )
    require(
        body.count(DECLARATION_RELEASE + "(") == 1,
        "success_declaration_release_count",
    )
    require(
        body.count(
            "candidate = SemanticSnapshotProductionCandidate()"
        )
        == 1,
        "success_candidate_reset_count",
    )
    cargo = body.index(CARGO_RELEASE + "(candidate.cargo)")
    declaration = body.index(DECLARATION_RELEASE + "(")
    reset = body.index(
        "candidate = SemanticSnapshotProductionCandidate()"
    )
    require(
        cargo < declaration < reset,
        "success_release_order",
    )


def validate_store_reader(smoke_text: str) -> None:
    reader, start = extract_function(
        smoke_text, "AssertStoreCountsUnchanged"
    )
    lines = smoke_text.splitlines()
    previous = start - 1
    while previous >= 0 and not lines[previous].strip():
        previous -= 1
    require(
        previous >= 0 and lines[previous].strip() == "@borrows",
        "store_reader_exact_borrows_missing",
    )
    require(
        "store: production.SemanticSnapshotProductionStore" in reader
        and "store: var " not in reader,
        "store_reader_formal_not_value",
    )
    body = function_body(reader)
    calls = re.findall(r"([A-Za-z_][A-Za-z0-9_.]*)\s*\(", body)
    require(
        calls == ["assert"],
        "store_reader_non_read_callee_" + "_".join(calls),
    )
    require(
        "share(" not in body
        and "var store" not in body
        and re.search(r"(?<![=!<>])=(?!=)", body) is None,
        "store_reader_mutates_or_copies_owner",
    )


def exact_borrows_precedes(
    text: str,
    function_name: str,
) -> tuple[str, str]:
    function, start = extract_function(text, function_name)
    lines = text.splitlines()
    previous = start - 1
    while previous >= 0 and not lines[previous].strip():
        previous -= 1
    require(
        previous >= 0 and lines[previous].strip() == "@borrows",
        function_name + "_exact_borrows_missing",
    )
    return function, function_body(function)


def validate_debug_plan_reader(
    smoke_text: str,
    debug_evidence_text: str,
) -> None:
    reader, body = exact_borrows_precedes(
        smoke_text, "MakeDebugSectionPlanEvidence"
    )
    require(
        "bundle: debugfacts.DebugFactBundle" in reader
        and "bundle: var " not in reader,
        "debug_plan_bundle_formal_not_value",
    )
    bundle_fields = re.findall(r"bundle\.([A-Za-z0-9_]+)", body)
    require(
        bundle_fields == ["functionCount", "debugOpCount"],
        "debug_plan_bundle_read_set_" + "_".join(bundle_fields),
    )
    require(
        "share(bundle" not in body and "var bundle" not in body,
        "debug_plan_bundle_copy_or_var",
    )
    downstream, downstream_body = exact_borrows_precedes(
        debug_evidence_text,
        "DebugEmissionPlanEvidenceDebugMachineFragmentRootSha256",
    )
    require(
        "evidence: DebugEmissionPlanEvidence" in downstream
        and "evidence: var " not in downstream,
        "debug_evidence_formal_not_value",
    )
    require(
        "share(evidence" not in downstream_body
        and "var evidence" not in downstream_body,
        "debug_evidence_copy_or_var",
    )
    for line in downstream_body.splitlines():
        if "evidence." in line and "(" in line:
            require(
                "strings.ConcatStr(" in line
                or "strings.IntToStr(" in line
                or line.lstrip().startswith("if "),
                "debug_evidence_non_read_callee_" + line.strip(),
            )


def validate_smoke_borrows_census(smoke_text: str) -> None:
    expected = (
        "TestCid",
        "TestSha256",
        "MakeDebugSectionPlanEvidence",
        "AssertStoreCountsUnchanged",
    )
    lines = smoke_text.splitlines()
    observed: list[str] = []
    for index, line in enumerate(lines):
        if line.strip() != "@borrows":
            continue
        next_index = index + 1
        while next_index < len(lines) and not lines[next_index].strip():
            next_index += 1
        require(
            next_index < len(lines)
            and lines[next_index].startswith("fn "),
            "smoke_borrows_without_function",
        )
        observed.append(
            lines[next_index][len("fn ") :].split("(", 1)[0]
        )
    require(
        tuple(observed) == expected,
        "smoke_borrows_census_" + "_".join(observed),
    )
    test_cid, test_cid_body = exact_borrows_precedes(
        smoke_text, "TestCid"
    )
    require(
        "label: str" in test_cid and "label: var " not in test_cid,
        "test_cid_label_formal_not_value",
    )
    require(
        "share(label" not in test_cid_body
        and "var label" not in test_cid_body
        and "TestCid(label)" not in test_cid_body,
        "test_cid_label_copy_store_or_recursion",
    )
    label_uses = [
        line.strip()
        for line in test_cid_body.splitlines()
        if "label" in line
    ]
    require(
        label_uses
        == [
            "var buf = layout.ByteBufInit(label.len)",
            "for index in 0..<label.len:",
            "layout.ByteBufAppendByte(buf, Int32(label[index]) & 255)",
        ],
        "test_cid_label_read_set",
    )
    test_sha, test_sha_body = exact_borrows_precedes(
        smoke_text, "TestSha256"
    )
    require(
        "label: str" in test_sha and "label: var " not in test_sha,
        "test_sha_label_formal_not_value",
    )
    require(
        test_sha_body.strip()
        == "return layout.FixedBytes32Hex(TestCid(label))",
        "test_sha_downstream_not_exact_read_chain",
    )
    make_compiler, _ = extract_function(smoke_text, "MakeCompilerCsg")
    require(
        "root: str" in make_compiler
        and "share(root)" in make_compiler,
        "make_compiler_owned_escape_boundary_changed",
    )


def validate_declaration_constructor_contract(
    declaration_text: str,
    smoke_text: str,
) -> None:
    constructor, start = extract_function(
        declaration_text,
        "SemanticSnapshotDeclarationCandidateAppendInto",
    )
    declaration_lines = declaration_text.splitlines()
    previous = start - 1
    while previous >= 0 and not declaration_lines[previous].strip():
        previous -= 1
    require(
        previous < 0
        or declaration_lines[previous].strip() != "@borrows",
        "declaration_constructor_falsely_borrows",
    )
    constructor_body = function_body(constructor)
    stores = (
        (
            "add(store.portableDocumentPackageIds, "
            "portableDocumentPackageId)"
        ),
        (
            "add(store.portableDocumentModulePaths, "
            "portableDocumentModulePath)"
        ),
        "add(store.canonicalNames, canonicalName)",
    )
    for store in stores:
        require(
            constructor_body.count(store) == 1,
            "declaration_constructor_owned_store_" + store,
        )
    require(
        constructor.count("sourcePhysicalPath") == 2
        and "sourcePhysicalPath.len != 0" in constructor_body
        and re.search(
            r"add\([^)]*sourcePhysicalPath",
            constructor_body,
            flags=re.DOTALL,
        )
        is None,
        "declaration_source_physical_path_retained_or_unchecked",
    )

    main, _ = extract_function(smoke_text, "main")
    start_anchor = (
        "    var declarationCandidates:\n"
        "        declaration.SemanticSnapshotDeclarationCandidateStore\n"
    )
    end_anchor = (
        "    var declarationTable: "
        "declaration.SemanticSnapshotDeclarationTable\n"
    )
    require(
        main.count(start_anchor) == 1 and main.count(end_anchor) == 1,
        "declaration_caller_boundary_missing",
    )
    caller = main[
        main.index(start_anchor) : main.index(end_anchor)
    ]
    owner_initializers = (
        'let declarationPackageId = parser.ParserOwnedText("pkg")',
        (
            "let declarationModulePath = "
            'parser.ParserOwnedText("pkg/main")'
        ),
        (
            "let declarationModuleCanonicalName =\n"
            '        parser.ParserOwnedText("pkg/main")'
        ),
        (
            "let declarationFunctionCanonicalName =\n"
            '        parser.ParserOwnedText("Main")'
        ),
    )
    for initializer in owner_initializers:
        require(
            caller.count(initializer) == 1,
            "declaration_owned_initializer_" + initializer,
        )
    require(
        caller.count(
            "SemanticSnapshotDeclarationCandidateAppendInto("
        )
        == 2,
        "declaration_constructor_call_count",
    )
    require(
        caller.count("share(declarationPackageId)") == 1
        and caller.count("share(declarationModulePath)") == 1,
        "declaration_first_store_share_count",
    )
    require(
        len(
            re.findall(
                r"^\s+declarationPackageId,$",
                caller,
                flags=re.MULTILINE,
            )
        )
        == 1
        and len(
            re.findall(
                r"^\s+declarationModulePath,$",
                caller,
                flags=re.MULTILINE,
            )
        )
        == 1,
        "declaration_last_store_not_exact_move",
    )
    require(
        len(
            re.findall(
                r"^\s+declarationModuleCanonicalName,$",
                caller,
                flags=re.MULTILINE,
            )
        )
        == 1
        and len(
            re.findall(
                r"^\s+declarationFunctionCanonicalName,$",
                caller,
                flags=re.MULTILINE,
            )
        )
        == 1,
        "declaration_canonical_name_not_unique_move",
    )
    require(
        caller.count('"pkg"') == 1
        and caller.count('"pkg/main"') == 2
        and caller.count('"Main"') == 1
        and caller.count(
            "layout.FixedBytes32Copy(documentCid), \"\""
        )
        == 2,
        "declaration_literal_or_physical_path_contract",
    )


def validate_fixed_bytes32_owner_census(smoke_text: str) -> None:
    main, _ = extract_function(smoke_text, "main")
    exact_copy_boundaries = (
        (
            "source_document_table",
            (
                "tables.sources.documentCids = [\n"
                "        layout.FixedBytes32Copy(documentCid)]"
            ),
        ),
        (
            "parser_function_name_proof",
            (
                "tables.parserSidecars.functionNameProofCids = [\n"
                "        layout.FixedBytes32Copy(functionNameProofCid)]"
            ),
        ),
        (
            "scalar_trait_initial",
            (
                "tables.types.traitProofCids[0] =\n"
                "        layout.FixedBytes32Copy(scalarTraitProofCid)"
            ),
        ),
        (
            "scalar_type_initial",
            (
                "tables.types.typeCids[0] =\n"
                "        layout.FixedBytes32Copy(scalarTypeCid)"
            ),
        ),
        (
            "signature_trait_initial",
            (
                "tables.types.traitProofCids[1] =\n"
                "        layout.FixedBytes32Copy(signatureTraitProofCid)"
            ),
        ),
        (
            "signature_type_initial",
            (
                "tables.types.typeCids[1] =\n"
                "        layout.FixedBytes32Copy(signatureTypeCid)"
            ),
        ),
        (
            "signature_type_sorted",
            (
                "tables.types.typeCids = [\n"
                "            layout.FixedBytes32Copy(signatureTypeCid), "
                "scalarTypeCid]"
            ),
        ),
        (
            "module_document_identity",
            (
                "share(declarationModulePath),\n"
                "               layout.FixedBytes32Copy(documentCid), \"\""
            ),
        ),
        (
            "module_name_proof",
            (
                "declarationModuleCanonicalName,\n"
                "               layout.FixedBytes32Copy(documentCid),\n"
                "               layout.FixedBytes32Copy(documentCid),"
            ),
        ),
        (
            "module_signature_type",
            (
                "layout.FixedBytes32Copy(documentCid),\n"
                "               layout.FixedBytes32Copy(documentCid),\n"
                "               layout.FixedBytes32(), 0, 0, "
                "moduleCandidateIndex"
            ),
        ),
        (
            "function_document_identity",
            (
                "declarationModulePath,\n"
                "               layout.FixedBytes32Copy(documentCid), \"\""
            ),
        ),
        (
            "function_name_proof",
            (
                "declarationFunctionCanonicalName,\n"
                "               "
                "layout.FixedBytes32Copy(functionNameProofCid),"
            ),
        ),
        (
            "function_signature_type",
            (
                "layout.FixedBytes32Copy(functionNameProofCid),\n"
                "               layout.FixedBytes32Copy(signatureTypeCid),"
            ),
        ),
        (
            "call_target_symbol",
            (
                "tables.calls.targetSymbolCids[0] =\n"
                "        layout.FixedBytes32Copy(symbolCid)"
            ),
        ),
        (
            "function_interface",
            (
                "tables.functions.interfaceCids[0] =\n"
                "        layout.FixedBytes32Copy(interfaceCid)"
            ),
        ),
        (
            "query_source_document",
            (
                "sourceDocument.documentCid =\n"
                "        layout.FixedBytes32Copy(documentCid)"
            ),
        ),
    )
    for label, boundary in exact_copy_boundaries:
        require(
            main.count(boundary) == 1,
            "fixed_bytes32_copy_boundary_" + label,
        )
    compact_main = re.sub(r"\s+", "", main)
    for local_name, source in FIXED_BYTES32_CAPTURE_BOUNDARIES:
        boundary = (
            "let"
            + local_name
            + "=layout.FixedBytes32Copy("
            + source
            + ")"
        )
        require(
            compact_main.count(boundary) == 1,
            "fixed_bytes32_capture_boundary_" + local_name,
        )
    require(
        main.count("layout.FixedBytes32Copy(")
        == len(exact_copy_boundaries)
        + len(FIXED_BYTES32_CAPTURE_BOUNDARIES),
        "fixed_bytes32_copy_boundary_extra_or_missing",
    )
    require(
        "tables.types.typeCids = [\n"
        "            layout.FixedBytes32Copy(signatureTypeCid), "
        "scalarTypeCid]"
        in main
        and "tables.types.traitProofCids = [signatureTraitProofCid,\n"
        "                                       scalarTraitProofCid]"
        in main,
        "fixed_bytes32_last_store_not_exact_move",
    )
    require(
        "pinnedTypeExpressionCid, signatureTypeCid" in main
        and "pinnedNameProofCid, functionNameProofCid" in main,
        "fixed_bytes32_final_read_missing",
    )
    require(
        "letpublishedSymbolCid="
        "tables.symbols.symbolCids[functionSymbolId]"
        in compact_main
        and "letpublishedSymbolCid=layout.FixedBytes32Copy(" not in compact_main,
        "fixed_bytes32_borrow_only_symbol_changed",
    )


def validate(
    production_text: str,
    smoke_text: str,
    debug_evidence_text: str,
    declaration_text: str,
) -> None:
    validate_failure_release_helper(production_text)
    validate_candidate_make(production_text)
    validate_candidate_release(production_text)
    validate_store_reader(smoke_text)
    validate_debug_plan_reader(smoke_text, debug_evidence_text)
    validate_smoke_borrows_census(smoke_text)
    validate_declaration_constructor_contract(
        declaration_text,
        smoke_text,
    )
    validate_fixed_bytes32_owner_census(smoke_text)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    require(text.count(old) >= 1, "mutation_anchor_missing_" + label)
    return text.replace(old, new, 1)


def remove_fixed_bytes32_capture_copy(
    text: str,
    local_name: str,
    source: str,
) -> str:
    source_pattern = r"\s*".join(re.escape(char) for char in source)
    pattern = (
        r"let\s+"
        + re.escape(local_name)
        + r"\s*=\s*layout\.FixedBytes32Copy\(\s*"
        + source_pattern
        + r"\s*\)"
    )
    matches = list(re.finditer(pattern, text))
    require(
        len(matches) == 1,
        "mutation_capture_copy_anchor_" + local_name,
    )
    match = matches[0]
    replacement = "let " + local_name + " = " + source
    return text[: match.start()] + replacement + text[match.end() :]


def remove_failure_release_at(text: str, index: int) -> str:
    needle = (
        "        "
        + FAILURE_RELEASE
        + "(\n"
        + "            candidateTables, cargo)\n"
    )
    starts = [match.start() for match in re.finditer(re.escape(needle), text)]
    require(
        len(starts) == len(FAILURE_MARKERS),
        "mutation_failure_release_anchor_count",
    )
    start = starts[index]
    return text[:start] + text[start + len(needle) :]


def expect_rejected(
    label: str,
    production_text: str,
    smoke_text: str,
    debug_evidence_text: str,
    declaration_text: str,
) -> None:
    try:
        validate(
            production_text,
            smoke_text,
            debug_evidence_text,
            declaration_text,
        )
    except ContractError:
        return
    raise ContractError("mutation_survived_" + label)


def validate_static_receipt_fields(fields: tuple[str, ...]) -> None:
    require(
        fields == STATIC_RECEIPT_FIELDS,
        "static_receipt_field_schema_invalid",
    )
    for field in fields:
        require(
            "live" not in field
            and "runtime" not in field
            and field
            not in (
                "success_owner_alloc_count",
                "success_owner_release_count",
                "failure_owner_alloc_count",
                "failure_owner_release_count",
            ),
            "static_receipt_claims_dynamic_evidence_" + field,
        )


def self_test(
    production_text: str,
    smoke_text: str,
    debug_evidence_text: str,
    declaration_text: str,
) -> int:
    validate(
        production_text,
        smoke_text,
        debug_evidence_text,
        declaration_text,
    )
    mutation_count = 0
    for index, marker in enumerate(FAILURE_MARKERS):
        expect_rejected(
            "omitted_failure_exit_" + str(index) + "_" + marker,
            remove_failure_release_at(production_text, index),
            smoke_text,
            debug_evidence_text,
            declaration_text,
        )
        mutation_count += 1
    expect_rejected(
        "failure_release_order",
        replace_once(
            production_text,
            (
                "    "
                + CARGO_RELEASE
                + "(cargo)\n"
                + "    "
                + DECLARATION_RELEASE
                + "(\n"
                + "        tables.declarations)"
            ),
            (
                "    "
                + DECLARATION_RELEASE
                + "(\n"
                + "        tables.declarations)\n"
                + "    "
                + CARGO_RELEASE
                + "(cargo)"
            ),
            "failure_release_order",
        ),
        smoke_text,
        debug_evidence_text,
        declaration_text,
    )
    mutation_count += 1
    expect_rejected(
        "success_release_order",
        replace_once(
            production_text,
            (
                "    "
                + CARGO_RELEASE
                + "(candidate.cargo)\n"
                + "    "
                + DECLARATION_RELEASE
                + "(\n"
                + "        candidate.tables.declarations)"
            ),
            (
                "    "
                + DECLARATION_RELEASE
                + "(\n"
                + "        candidate.tables.declarations)\n"
                + "    "
                + CARGO_RELEASE
                + "(candidate.cargo)"
            ),
            "success_release_order",
        ),
        smoke_text,
        debug_evidence_text,
        declaration_text,
    )
    mutation_count += 1
    expect_rejected(
        "double_release",
        replace_once(
            production_text,
            CARGO_RELEASE + "(candidate.cargo)",
            (
                CARGO_RELEASE
                + "(candidate.cargo)\n"
                + "    "
                + CARGO_RELEASE
                + "(candidate.cargo)"
            ),
            "double_release",
        ),
        smoke_text,
        debug_evidence_text,
        declaration_text,
    )
    mutation_count += 1
    expect_rejected(
        "cargo_error_dangling",
        replace_once(
            production_text,
            "let cargoError = parser.ParserOwnedText(cargo.error)",
            "let cargoError = cargo.error",
            "cargo_error_dangling",
        ),
        smoke_text,
        debug_evidence_text,
        declaration_text,
    )
    mutation_count += 1
    expect_rejected(
        "store_reader_borrows",
        production_text,
        replace_once(
            smoke_text,
            "@borrows\nfn AssertStoreCountsUnchanged(",
            "fn AssertStoreCountsUnchanged(",
            "store_reader_borrows",
        ),
        debug_evidence_text,
        declaration_text,
    )
    mutation_count += 1
    expect_rejected(
        "debug_plan_reader_borrows",
        production_text,
        replace_once(
            smoke_text,
            "@borrows\nfn MakeDebugSectionPlanEvidence(",
            "fn MakeDebugSectionPlanEvidence(",
            "debug_plan_reader_borrows",
        ),
        debug_evidence_text,
        declaration_text,
    )
    mutation_count += 1
    expect_rejected(
        "debug_evidence_downstream_borrows",
        production_text,
        smoke_text,
        replace_once(
            debug_evidence_text,
            (
                "@borrows\n"
                "fn DebugEmissionPlanEvidenceDebugMachineFragmentRootSha256("
            ),
            "fn DebugEmissionPlanEvidenceDebugMachineFragmentRootSha256(",
            "debug_evidence_downstream_borrows",
        ),
        declaration_text,
    )
    mutation_count += 1
    expect_rejected(
        "test_cid_borrows",
        production_text,
        replace_once(
            smoke_text,
            "@borrows\nfn TestCid(",
            "fn TestCid(",
            "test_cid_borrows",
        ),
        debug_evidence_text,
        declaration_text,
    )
    mutation_count += 1
    expect_rejected(
        "test_sha_borrows",
        production_text,
        replace_once(
            smoke_text,
            "@borrows\nfn TestSha256(",
            "fn TestSha256(",
            "test_sha_borrows",
        ),
        debug_evidence_text,
        declaration_text,
    )
    mutation_count += 1
    declaration_caller_mutations = (
        (
            "declaration_package_first_share",
            "share(declarationPackageId)",
            "declarationPackageId",
        ),
        (
            "declaration_module_first_share",
            "share(declarationModulePath)",
            "declarationModulePath",
        ),
        (
            "declaration_package_last_move",
            "               declarationPackageId,\n",
            "               share(declarationPackageId),\n",
        ),
        (
            "declaration_module_last_move",
            "               declarationModulePath,\n",
            "               share(declarationModulePath),\n",
        ),
        (
            "declaration_borrowed_literal_store",
            "share(declarationPackageId)",
            '"pkg"',
        ),
        (
            "declaration_canonical_literal_store",
            "               declarationModuleCanonicalName,\n",
            '               "pkg/main",\n',
        ),
    )
    for label, old, new in declaration_caller_mutations:
        expect_rejected(
            label,
            production_text,
            replace_once(smoke_text, old, new, label),
            debug_evidence_text,
            declaration_text,
        )
        mutation_count += 1
    fixed_bytes32_copy_removal_mutations = (
        (
            "source_document_table_copy",
            (
                "tables.sources.documentCids = [\n"
                "        layout.FixedBytes32Copy(documentCid)]"
            ),
            "tables.sources.documentCids = [documentCid]",
        ),
        (
            "parser_function_name_proof_copy",
            (
                "tables.parserSidecars.functionNameProofCids = [\n"
                "        layout.FixedBytes32Copy(functionNameProofCid)]"
            ),
            (
                "tables.parserSidecars.functionNameProofCids = "
                "[functionNameProofCid]"
            ),
        ),
        (
            "scalar_trait_initial_copy",
            (
                "tables.types.traitProofCids[0] =\n"
                "        layout.FixedBytes32Copy(scalarTraitProofCid)"
            ),
            "tables.types.traitProofCids[0] = scalarTraitProofCid",
        ),
        (
            "scalar_type_initial_copy",
            (
                "tables.types.typeCids[0] =\n"
                "        layout.FixedBytes32Copy(scalarTypeCid)"
            ),
            "tables.types.typeCids[0] = scalarTypeCid",
        ),
        (
            "signature_trait_initial_copy",
            (
                "tables.types.traitProofCids[1] =\n"
                "        layout.FixedBytes32Copy(signatureTraitProofCid)"
            ),
            "tables.types.traitProofCids[1] = signatureTraitProofCid",
        ),
        (
            "signature_type_initial_copy",
            (
                "tables.types.typeCids[1] =\n"
                "        layout.FixedBytes32Copy(signatureTypeCid)"
            ),
            "tables.types.typeCids[1] = signatureTypeCid",
        ),
        (
            "signature_type_sorted_copy",
            "layout.FixedBytes32Copy(signatureTypeCid), scalarTypeCid]",
            "signatureTypeCid, scalarTypeCid]",
        ),
        (
            "module_document_identity_copy",
            (
                "share(declarationModulePath),\n"
                "               layout.FixedBytes32Copy(documentCid), \"\""
            ),
            (
                "share(declarationModulePath),\n"
                "               documentCid, \"\""
            ),
        ),
        (
            "module_name_proof_copy",
            (
                "declarationModuleCanonicalName,\n"
                "               layout.FixedBytes32Copy(documentCid),\n"
                "               layout.FixedBytes32Copy(documentCid),"
            ),
            (
                "declarationModuleCanonicalName,\n"
                "               documentCid,\n"
                "               layout.FixedBytes32Copy(documentCid),"
            ),
        ),
        (
            "module_signature_type_copy",
            (
                "layout.FixedBytes32Copy(documentCid),\n"
                "               layout.FixedBytes32Copy(documentCid),\n"
                "               layout.FixedBytes32(), 0, 0, "
                "moduleCandidateIndex"
            ),
            (
                "layout.FixedBytes32Copy(documentCid),\n"
                "               documentCid,\n"
                "               layout.FixedBytes32(), 0, 0, "
                "moduleCandidateIndex"
            ),
        ),
        (
            "function_document_identity_copy",
            (
                "declarationModulePath,\n"
                "               layout.FixedBytes32Copy(documentCid), \"\""
            ),
            (
                "declarationModulePath,\n"
                "               documentCid, \"\""
            ),
        ),
        (
            "function_name_proof_copy",
            (
                "declarationFunctionCanonicalName,\n"
                "               "
                "layout.FixedBytes32Copy(functionNameProofCid),"
            ),
            (
                "declarationFunctionCanonicalName,\n"
                "               functionNameProofCid,"
            ),
        ),
        (
            "function_signature_type_copy",
            (
                "layout.FixedBytes32Copy(functionNameProofCid),\n"
                "               layout.FixedBytes32Copy(signatureTypeCid),"
            ),
            (
                "layout.FixedBytes32Copy(functionNameProofCid),\n"
                "               signatureTypeCid,"
            ),
        ),
        (
            "call_target_symbol_copy",
            (
                "tables.calls.targetSymbolCids[0] =\n"
                "        layout.FixedBytes32Copy(symbolCid)"
            ),
            "tables.calls.targetSymbolCids[0] = symbolCid",
        ),
        (
            "function_interface_copy",
            (
                "tables.functions.interfaceCids[0] =\n"
                "        layout.FixedBytes32Copy(interfaceCid)"
            ),
            "tables.functions.interfaceCids[0] = interfaceCid",
        ),
        (
            "query_source_document_copy",
            (
                "sourceDocument.documentCid =\n"
                "        layout.FixedBytes32Copy(documentCid)"
            ),
            "sourceDocument.documentCid = documentCid",
        ),
    )
    for label, old, new in fixed_bytes32_copy_removal_mutations:
        expect_rejected(
            label,
            production_text,
            replace_once(smoke_text, old, new, label),
            debug_evidence_text,
            declaration_text,
        )
        mutation_count += 1
    for local_name, source in FIXED_BYTES32_CAPTURE_BOUNDARIES:
        expect_rejected(
            "fixed_bytes32_capture_copy_" + local_name,
            production_text,
            remove_fixed_bytes32_capture_copy(
                smoke_text,
                local_name,
                source,
            ),
            debug_evidence_text,
            declaration_text,
        )
        mutation_count += 1
    aliased_copy = replace_once(
        smoke_text,
        (
            "    tables.parserSidecars.functionNameProofCids = [\n"
            "        layout.FixedBytes32Copy(functionNameProofCid)]"
        ),
        (
            "    let sharedFunctionNameProofCid =\n"
            "        layout.FixedBytes32Copy(functionNameProofCid)\n"
            "    tables.parserSidecars.functionNameProofCids = [\n"
            "        sharedFunctionNameProofCid]"
        ),
        "fixed_bytes32_aliased_copy_declaration",
    )
    aliased_copy = replace_once(
        aliased_copy,
        "layout.FixedBytes32Copy(functionNameProofCid),\n"
        "               layout.FixedBytes32Copy(signatureTypeCid),",
        "sharedFunctionNameProofCid,\n"
        "               layout.FixedBytes32Copy(signatureTypeCid),",
        "fixed_bytes32_same_copy_reused",
    )
    expect_rejected(
        "fixed_bytes32_same_copy_reused",
        production_text,
        aliased_copy,
        debug_evidence_text,
        declaration_text,
    )
    mutation_count += 1
    expect_rejected(
        "fixed_bytes32_extra_copy",
        production_text,
        replace_once(
            smoke_text,
            "layout.FixedBytes32Copy(signatureTypeCid), scalarTypeCid]",
            (
                "layout.FixedBytes32Copy(signatureTypeCid), "
                "layout.FixedBytes32Copy(scalarTypeCid)]"
            ),
            "fixed_bytes32_extra_copy",
        ),
        debug_evidence_text,
        declaration_text,
    )
    mutation_count += 1
    expect_rejected(
        "declaration_constructor_fake_borrows",
        production_text,
        smoke_text,
        debug_evidence_text,
        replace_once(
            declaration_text,
            "fn SemanticSnapshotDeclarationCandidateAppendInto(",
            (
                "@borrows\n"
                "fn SemanticSnapshotDeclarationCandidateAppendInto("
            ),
            "declaration_constructor_fake_borrows",
        ),
    )
    mutation_count += 1
    validate_static_receipt_fields(STATIC_RECEIPT_FIELDS)
    schema_mutations = (
        (
            "success_owner_alloc_count",
            *STATIC_RECEIPT_FIELDS[1:],
        ),
        (
            "success_runtime_owner_allocation_count",
            *STATIC_RECEIPT_FIELDS[1:],
        ),
        (
            *STATIC_RECEIPT_FIELDS,
            "success_static_owner_live_count",
        ),
    )
    for fields in schema_mutations:
        try:
            validate_static_receipt_fields(fields)
        except ContractError:
            mutation_count += 1
            continue
        raise ContractError("mutation_survived_static_receipt_schema")
    print(
        "semantic_snapshot_candidate_lifecycle_gate_status=pass "
        "success_static_owner_allocation_sites=2 "
        "success_static_owner_release_sites=2 "
        "failure_exit_count=5 "
        "failure_static_owner_allocation_sites=2 "
        "failure_static_owner_release_sites=2 "
        "authority_mutations_rejected=%d" % mutation_count
    )
    return mutation_count


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--production", required=True)
    parser.add_argument("--smoke", required=True)
    parser.add_argument("--debug-evidence", required=True)
    parser.add_argument("--declaration-source", required=True)
    parser.add_argument("--self-test", action="store_true")
    arguments = parser.parse_args()
    production_path = pathlib.Path(arguments.production).resolve(strict=True)
    smoke_path = pathlib.Path(arguments.smoke).resolve(strict=True)
    debug_evidence_path = pathlib.Path(arguments.debug_evidence).resolve(
        strict=True
    )
    declaration_path = pathlib.Path(
        arguments.declaration_source
    ).resolve(strict=True)
    production_text = production_path.read_text(encoding="utf-8")
    smoke_text = smoke_path.read_text(encoding="utf-8")
    debug_evidence_text = debug_evidence_path.read_text(encoding="utf-8")
    declaration_text = declaration_path.read_text(encoding="utf-8")
    try:
        if arguments.self_test:
            mutation_count = self_test(
                production_text,
                smoke_text,
                debug_evidence_text,
                declaration_text,
            )
        else:
            validate(
                production_text,
                smoke_text,
                debug_evidence_text,
                declaration_text,
            )
            mutation_count = 0
    except ContractError as error:
        print(
            "semantic_snapshot_candidate_lifecycle_gate_status=failed "
            "reason=%s" % error,
            file=sys.stderr,
        )
        return 1
    print("production_sha256=" + sha256_text(production_text))
    print("smoke_sha256=" + sha256_text(smoke_text))
    print("debug_evidence_sha256=" + sha256_text(debug_evidence_text))
    print("declaration_source_sha256=" + sha256_text(declaration_text))
    print("authority_mutations_rejected=%d" % mutation_count)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
