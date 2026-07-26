#!/usr/bin/env bun

import assert from "node:assert/strict";
import {mkdirSync, mkdtempSync, symlinkSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  CidOracleError,
  assertUnversionedCidBytes,
  buildCompileSemanticReceipt,
  buildPortableSourceIdentity,
  canonicalModulePath,
  encoding,
  parseCompileSemanticReceipt,
  parsePortableSourceReceipt,
  sha256,
  sourceToCsgBindingSeal,
  verifyMigrationProofBindings,
} from "../src/cheng_cid_identity_chain_oracle.ts";
import {CID_CGROUP_ARTIFACT_ROLES, CID_CURRENT_DRIVER_CONTAINER_PATH, CID_CURRENT_DRIVER_RUN_CASE_COMMAND, CID_OFFICIAL_ENTRY_SPECS, CID_REQUIRED_IDENTITY_TOOLS, assertCanonicalUstarFilesEqual, assertCidExecutionImageLineage, assertCidRequiredIdentityTools, assertCidSourcePhaseContract, assertMutationReplayRecipe, canonicalCaseImageLayerMembers, canonicalJson, canonicalUstarFiles, cidCaseTargetArgv, parseCompileReceipt, parseEvidenceManifest, requiredCidEvidenceRoles, verifyCidCaseControllerBinding, verifyCidEvidence, verifyCidExecutionImageEvidence, verifyLinuxMemoryReceipt, verifyNativeDescriptorReceiptBinding} from "../src/cheng_cid_identity_chain_evidence.ts";

function canonicalUstar(entries: readonly (readonly [string, Buffer])[]): Buffer {
  const chunks: Buffer[] = [];
  for (const [path, raw] of [...entries].sort((left, right) => Buffer.compare(Buffer.from(left[0]), Buffer.from(right[0])))) {
    assert(Buffer.byteLength(path) <= 100);
    const header = Buffer.alloc(512); header.write(path, 0, "utf8"); header.write("0000600\0", 100, "ascii"); header.write("0000000\0", 108, "ascii"); header.write("0000000\0", 116, "ascii"); header.write(`${raw.length.toString(8).padStart(11, "0")}\0`, 124, "ascii"); header.write("00000000000\0", 136, "ascii"); header.fill(0x20, 148, 156); header[156] = 0x30; header.write("ustar\0", 257, "ascii"); header.write("00", 263, "ascii"); header.write("0000000\0", 329, "ascii"); header.write("0000000\0", 337, "ascii");
    const checksum = header.reduce((sum, byte) => sum + byte, 0); header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, "ascii"); chunks.push(header, raw, Buffer.alloc((512 - raw.length % 512) % 512));
  }
  const payload = Buffer.concat(chunks); const total = Math.ceil((payload.length + 1024) / 10240) * 10240;
  return Buffer.concat([payload, Buffer.alloc(total - payload.length)]);
}

function canonicalCaseImageLayer(candidate: Buffer, runner: Buffer): Buffer {
  const chunks: Buffer[] = [];
  for (const [path, raw, directory] of [["cheng-cid", Buffer.alloc(0), true], ["cheng-cid/candidate", candidate, false], ["cheng-cid/run-case", runner, false]] as const) {
    const header = Buffer.alloc(512); header.write(directory ? `${path}/` : path, 0, "utf8"); header.write(`${(directory ? 0o755 : 0o555).toString(8).padStart(7, "0")}\0`, 100, "ascii"); header.write("0000000\0", 108, "ascii"); header.write("0000000\0", 116, "ascii"); header.write(`${raw.length.toString(8).padStart(11, "0")}\0`, 124, "ascii"); header.write("00000000000\0", 136, "ascii"); header.fill(0x20, 148, 156); header[156] = directory ? 0x35 : 0x30; header.write("ustar\0", 257, "ascii"); header.write("00", 263, "ascii"); header.write("0000000\0", 329, "ascii"); header.write("0000000\0", 337, "ascii"); const checksum = header.reduce((sum, byte) => sum + byte, 0); header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, "ascii"); chunks.push(header, raw, Buffer.alloc((512 - raw.length % 512) % 512));
  }
  return Buffer.concat([...chunks, Buffer.alloc(1024)]);
}

const phaseContract = {
  systemLinkPlan: Buffer.from(`fn SystemLinkPlanProgressMemoryStage(stage: str) =
    if os.GetEnv("CHENG_PROGRESS") != "1": return
    os.WriteLine(os.Get_stderr(), Fmt"system_link_plan_stage={stage} rss_bytes={os.ProcessRssBytes()}")
fn SystemLinkPlanSourceBundleBindingStructuralColumnsValidInto(plan: var SystemLinkPlanStub): bool =
    SystemLinkPlanCanonicalExternalPackageRootsInto()
    SystemLinkPlanSourceRowIdentityInto()
    SystemLinkPlanCanonicalImportEdgesInto()
    SystemLinkPlanComputeSourceBundleBindingSeal()
fn SystemLinkPlanSourceBundleBindingColumnsValidInto(plan: var SystemLinkPlanStub): bool =
    SystemLinkPlanSourceBundleBindingStructuralColumnsValidInto()
    ParserSourceTextWithExternalPackageRootsInto()
    SystemLinkPlanPortableSourceBindingValidateTextsInto()
fn SystemLinkPlanSourceBundleBindingValidInto(plan: var SystemLinkPlanStub): bool =
    SystemLinkPlanSourceBundleBindingColumnsValidInto()
    FixedBytes32Equal(expectedSeal, plan.sourceBundleBindingSeal)
fn SystemLinkPlanSourceBundleBindingStructuralValidInto(plan: var SystemLinkPlanStub): bool =
    SystemLinkPlanSourceBundleBindingStructuralColumnsValidInto()
    FixedBytes32Equal(expectedSeal, plan.sourceBundleBindingSeal)
fn SystemLinkPlanSourcePathBundleCidInto(plan: Plan): bool =
    ParserSourceIdentityPathAbsolute()
    ParserSourceIdentityLexicalPathInto()
    CompilerWorldPathOrderInto()
    CompilerWorldSourceRawBytesCidBorrowed()
fn SystemLinkPlanPortableSourceBindingFromRebuiltImportEdgesInto(modulePaths: var str[], sourceTexts: var str[], rebuiltImportEdges: var parser.ImportEdge[]): bool =
    let entryIsSourcePath = parser.ParserSourceIdentityPathAbsolute(entryModulePath)
    if !entryIsSourcePath:
        parser.ParserSourceIdentityModuleTextValid(entryModulePath)
        SystemLinkPlanModuleOwnedByPackage(entryModulePath, packageId)
    var sourceIdentityValid = parser.ParserSourceIdentityModuleTextValid(modulePaths[sourceIndex])
    if !sourceIdentityValid:
        parser.ParserSourceIdentityPathAbsolute(modulePaths[sourceIndex])
        parser.ParserSourceIdentityLexicalPathInto(modulePaths[sourceIndex], canonicalSourceIdentity)
        canonicalSourceIdentity == modulePaths[sourceIndex]
    SystemLinkPlanProgressMemoryStage("after_portable_identity_rows")
    SystemLinkPlanProgressMemoryStage("after_portable_import_graph_cid")
    var hasSourcePathIdentity = false
    if parser.ParserSourceIdentityPathAbsolute(modulePaths[sourceIndex]):
        hasSourcePathIdentity = true
    if hasSourcePathIdentity:
        SystemLinkPlanSourcePathBundleCidInto()
    else:
        CompilerWorldSourceBundleCidFromIdentityTextsBorrowedInto()
    SystemLinkPlanProgressMemoryStage("after_portable_source_bundle_cid")
    CompilerWorldSourceRawBytesCidBorrowed()
    SystemLinkPlanProgressMemoryStage("after_portable_entry_source_cid")
    SystemLinkPlanProgressMemoryStage("after_portable_binding_seal")
fn SystemLinkPlanRebuildImportEdgesFromTextsInto(externalPackageRoots: var parser.ParserExternalPackageRoot[], sourceClosurePaths: var str[], ownerModulePaths: var str[], sourceTexts: var str[]): bool =
    parser.ParserReadImportSpecs()
fn SystemLinkPlanPortableSourceBindingValidateRebuiltTextsInto(modulePaths: var str[], sourceTexts: var str[], rebuiltImportEdges: var parser.ImportEdge[]): bool =
    SystemLinkPlanPortableSourceBindingFromRebuiltImportEdgesInto()
fn SystemLinkPlanBuildSourceBundleBindingFromFilesInto(plan: Plan): bool =
    SystemLinkPlanRebuildImportEdgesFromTextsInto()
    SystemLinkPlanPortableSourceBindingFromRebuiltImportEdgesInto()
`),
  systemLinkExec: Buffer.from(`fn SystemLinkExecSourceBundleReceiptCaptureInto(plan: Plan): bool =
    slplan.SystemLinkPlanSourceBundleBindingStructuralValidInto()
    PortableSourceIdentityReceiptStrictValidateInto()
    err = "portable source receipt disagrees with sealed source bundle"
`),
  parser: Buffer.from(`type
    ParserImportOriginSoA =
        declarationProducerSourceIndexes: arenamod.ArenaArrayInt32
        declarationSourceLocalRows: arenamod.ArenaArrayInt32
        declarationKeywordTokenIndexes: arenamod.ArenaArrayInt32
        declarationItemStarts: arenamod.ArenaArrayInt32
        declarationItemCounts: arenamod.ArenaArrayInt32
        itemProducerSourceIndexes: arenamod.ArenaArrayInt32
        itemSourceLocalRows: arenamod.ArenaArrayInt32
        itemDeclarationRows: arenamod.ArenaArrayInt32
        itemAliasTokenIndexes: arenamod.ArenaArrayInt32
        itemModuleTokenStarts: arenamod.ArenaArrayInt32
        itemModuleTokenCounts: arenamod.ArenaArrayInt32
        itemPrefixTokenCounts: arenamod.ArenaArrayInt32
        moduleTokenIndexes: arenamod.ArenaArrayInt32
    ParserValueExprTree =
        tokenProducerSourceIndexes: arenamod.ArenaArrayInt32
        tokenSourceLocalIndexes: arenamod.ArenaArrayInt32
        tokenLexicalParentIndexes: arenamod.ArenaArrayInt32
fn ParserReadImportSpecs(owner: str): bool =
    while lineStart <= text.len:
        ParserLineRangeStartsImport()
fn ParserReadImportEdgesWithExternalPackageRoots(owner: str): bool =
    while lineStart <= text.len:
        ParserLineRangeStartsImport()
fn ParserValueExprTreeStatementRootsStrictValidateInto(tree: ParserValueExprTree): bool =
    tree.statementRootAnchorTokenIndexes
    tree.statementRootBindingDeclarationStarts
    tree.statementRootBindingDeclarationCounts
    ParserValueExprStatementTypeDefault
    ParserValueTokenAssign
    ParserDeclarationLocal
    ParserDeclarationField
    ParserDeclarationType
    err = "type default declaration cardinality invalid"
    err = "type default declaration authority invalid"
    tree.declarationSpanStarts
    tree.declarationSpanEnds
fn ParserValueExprAppendToken(tree: var ParserValueExprTree,
                              producerSourceIndex: int32,
                              sourceLocalIndex: int32,
                              lexicalParentIndex: int32) =
    tree.tokenProducerSourceIndexes
    tree.tokenSourceLocalIndexes
    tree.tokenLexicalParentIndexes
fn ParserValueExprLexSpan(tree: var ParserValueExprTree,
                          lexicalParentIndex: int32): bool =
    tree.tokenCount
    ParserValueExprAppendToken(tree, lexicalParentIndex)
fn ParserValueExprParseFmtInterpolations(tree: var ParserValueExprTree,
                                         fmtTokenIndex: int32): bool =
    var expressionTokenStart: int32
    var expressionTokenCount: int32
    ParserValueExprLexSpan(tree,
                          fmtTokenIndex,
                          expressionTokenStart,
                          expressionTokenCount)
fn ParserValueExprTreeTokensStrictValidateInto(tree: ParserValueExprTree): bool =
    tree.tokenProducerSourceIndexes
    tree.tokenSourceLocalIndexes
    tree.tokenLexicalParentIndexes
    sourceLocalCounts[producerSourceIndex]
    ParserValueTokenFmtString
    lastChildEnds[lexicalParentIndex]
fn ParserValueExprAppendImportDeclaration(tree: var ParserValueExprTree): bool =
    let declarationRow = origins.declarationCount
    origins.declarationProducerSourceIndexes
    origins.declarationSourceLocalRows
    origins.declarationKeywordTokenIndexes
    origins.declarationItemStarts
    origins.declarationItemCounts
    origins.declarationCount = declarationRow + 1
    ParserValueTokenLeftBracket
    ParserValueTokenRightBracket
    ParserValueTokenSlash
    ParserValueExprTokenText(tree, moduleLimit) != "as"
    err = "parser import origin: malformed alias"
    parserValueExprAppendImportItem()
    let itemCount = origins.itemCount - itemStartRow
    origins.declarationItemCounts
fn ParserValueExprTreeImportOriginsStrictValidateInto(tree: ParserValueExprTree): bool =
    origins.declarationProducerSourceIndexes
    origins.declarationSourceLocalRows
    origins.declarationKeywordTokenIndexes
    origins.declarationItemStarts
    origins.declarationItemCounts
    origins.itemProducerSourceIndexes
    origins.itemSourceLocalRows
    origins.itemDeclarationRows
    origins.itemAliasTokenIndexes
    origins.itemModuleTokenStarts
    origins.itemModuleTokenCounts
    origins.itemPrefixTokenCounts
    origins.moduleTokenIndexes
    ParserValueExprTokenProducerSourceIndexAt()
    ParserValueExprTokenKindAt(tree, keywordToken)
    ParserValueTokenImport
    err = "module token adjacency invalid"
    err = "simple surface replay failed"
    err = "grouped prefix drift"
    err = "module token CSR incomplete"
fn ParserValueExprProcessBindingEntryRange(tree: var ParserValueExprTree): bool =
    let declarationStart = tree.declarationCount
    ParserValueExprParsePatternRange()
    let bindingDeclarationCount =
        tree.declarationCount - declarationStart
    let statementRole =
        bindingDeclarationCount > 0 ?
            ParserValueExprStatementBindingInitializer :
            ParserValueExprStatementAssignmentRhs
    ParserValueExprParseExactRoot()
    if bindingDeclarationCount > 0:
        let bindingInitializerEnd =
            ParserValueExprNodeSpanEndAt(tree, valueRoot)
        for declarationRow in declarationStart..<declarationStart + bindingDeclarationCount:
            arenamod.ArenaArrayInt32Set(
                tree.arena,
                tree.declarationSpanEnds,
                declarationRow,
                bindingInitializerEnd)
        ParserValueExprSetStatementRootDeclarationAuthority(
            tree,
            ParserValueExprNodeDirectStatementRootEventAt(tree, valueRoot),
            declarationStart,
            bindingDeclarationCount)
fn ParserValueExprProcessStatementRangeWithTypeOwner(tree: var ParserValueExprTree): bool =
    let assignedFieldColon = ParserValueExprFindTopLevelKind()
    var assignedFieldDeclarationRow: int32 = -1
    assignedFieldDeclarationRow = ParserValueExprAppendDeclaration(
        tree,
        ParserDeclarationField,
        tree.activeTypeDeclarationRow)
    let valueRole =
        assignedFieldDeclarationRow >= 0 ?
            ParserValueExprStatementTypeDefault :
            ParserValueExprStatementAssignmentRhs
    ParserValueExprParseExactRoot()
    if assignedFieldDeclarationRow >= 0:
        ParserValueExprSetStatementRootDeclarationAuthority(
            tree,
            ParserValueExprNodeDirectStatementRootEventAt(tree, valueRoot),
            assignedFieldDeclarationRow,
            1)
fn ParserValueExprProcessTypeDeclarationRangeInto(tree: var ParserValueExprTree): bool =
    let defaultRootEventStart = tree.statementRootCount
    ParserValueExprStatementTypeDefault
    var declarationRow: int32
    declarationRow = ParserValueExprAppendDeclaration()
    for defaultRootEvent in defaultRootEventStart..<tree.statementRootCount:
        ParserValueExprStatementRootRoleAt()
        ParserValueExprSetStatementRootDeclarationAuthority()
fn ParserValueExprAppendBindingInitializerFact(tree: ParserValueExprTree): bool =
    ParserValueExprStatementRootAnchorTokenAt()
    ParserValueExprStatementRootBindingDeclarationStartAt()
    ParserValueExprStatementRootBindingDeclarationCountAt()
    tree.declarationSpanStarts
    ParserValueExprProjectSpan()
fn ParserReadNormalizedExprLayerFromTextWithKnownCallsAndProfilesCachedWithCurrentLines(): bool =
    var lineHasBindingInitializerRoot = false
    var lineHasAssignmentRoot = false
    lineHasBindingInitializerRoot = true
    ParserValueExprAppendBindingInitializerFact()
    lineHasAssignmentRoot = true
    ParserValueExprAppendAssignmentRhsFact()
    if !lineHasBindingInitializerRoot &&
       !lineHasAssignmentRoot &&
       !typeDeclarationHeaderLines[i]:
        ParserAppendAssignStmtExprsLine()
fn ParserValueExprStatementRootIsNonFunctionDeclarationValue(tree: ParserValueExprTree, rootIndex: int32): bool =
    ParserValueExprStatementRootRoleAt()
    ParserValueExprStatementBindingInitializer
    ParserValueExprStatementTypeDefault
    ParserValueExprStatementRootBindingDeclarationStartAt()
    ParserValueExprStatementRootBindingDeclarationCountAt()
    tree.declarationKinds
    tree.declarationFunctionRows
    tree.declarationLexicalScopeRows
    tree.declarationLexicalScopeKinds
    ParserDeclarationLocal
    ParserDeclarationField
    ParserDeclarationType
    ParserDeclarationLexicalScopeSource
    ParserDeclarationLexicalScopeType
`),
  parserReceipt: Buffer.from(`type
    ParserCanonicalImportOriginSoA =
        importDeclarationProducerSourceIds: int32[]
        importDeclarationSourceLocalRows: int32[]
        importDeclarationKeywordTokenIds: int32[]
        importDeclarationSpanIds: int32[]
        importDeclarationItemStarts: int32[]
        importDeclarationItemCounts: int32[]
        importItemProducerSourceIds: int32[]
        importItemSourceLocalRows: int32[]
        importItemDeclarationIds: int32[]
        importItemAliasTokenIds: int32[]
        importItemSpanIds: int32[]
        importItemModuleTokenStarts: int32[]
        importItemModuleTokenCounts: int32[]
        importItemPrefixTokenCounts: int32[]
        importModuleTokenIds: int32[]
    ParserCanonicalSourceSidecar =
        tokenProducerSourceIds: int32[]
        tokenSourceLocalRows: int32[]
        tokenLexicalParentIds: int32[]
        importOrigins: ParserCanonicalImportOriginSoA
fn parserCanonicalSourceSidecarHash(sidecar: ParserCanonicalSourceSidecar): FixedBytes32 =
    sidecar.tokenProducerSourceIds[row]
    sidecar.tokenSourceLocalRows[row]
    sidecar.tokenLexicalParentIds[row]
    sidecar.statementRootAnchorTokenIds[row]
    sidecar.statementRootBindingDeclarationStarts[row]
    sidecar.statementRootBindingDeclarationCounts[row]
    importOrigins.importDeclarationProducerSourceIds[row]
    importOrigins.importDeclarationSourceLocalRows[row]
    importOrigins.importDeclarationKeywordTokenIds[row]
    importOrigins.importDeclarationItemStarts[row]
    importOrigins.importDeclarationItemCounts[row]
    importOrigins.importItemProducerSourceIds[row]
    importOrigins.importItemSourceLocalRows[row]
    importOrigins.importItemDeclarationIds[row]
    importOrigins.importItemAliasTokenIds[row]
    importOrigins.importItemModuleTokenStarts[row]
    importOrigins.importItemModuleTokenCounts[row]
    importOrigins.importItemPrefixTokenCounts[row]
    importOrigins.importModuleTokenIds[row]
fn parserCanonicalSourceSidecarBuildMappedInto(sidecar: ParserCanonicalSourceSidecar): bool =
    parser.ParserValueExprTreeImportOriginsStrictValidateInto()
    let parserImportOrigins = tree.importOrigins
    let outImportOrigins = out.importOrigins
    parserImportOrigins.declarationProducerSourceIndexes
    outImportOrigins.importDeclarationSourceLocalRows
    outImportOrigins.importDeclarationKeywordTokenIds
    outImportOrigins.importDeclarationItemStarts
    outImportOrigins.importDeclarationItemCounts
    parserImportOrigins.itemProducerSourceIndexes
    outImportOrigins.importItemSourceLocalRows
    outImportOrigins.importItemDeclarationIds
    outImportOrigins.importItemAliasTokenIds
    outImportOrigins.importItemModuleTokenStarts
    outImportOrigins.importItemModuleTokenCounts
    outImportOrigins.importItemPrefixTokenCounts
    outImportOrigins.importModuleTokenIds
fn parserCanonicalSourceSidecarPayloadStrictValidateInto(sidecar: ParserCanonicalSourceSidecar): bool =
    sidecar.tokenProducerSourceIds
    sidecar.tokenSourceLocalRows
    sidecar.tokenLexicalParentIds
    parser.ParserValueTokenFmtString
    previousChildEndBytes[parent]
    sidecar.statementRootAnchorTokenIds
    sidecar.statementRootBindingDeclarationStarts
    sidecar.statementRootBindingDeclarationCounts
    parser.ParserValueTokenAssign
    parser.ParserDeclarationLocal
    parser.ParserDeclarationField
    parser.ParserDeclarationType
    parser.ParserValueExprStatementTypeDefault
    err = "type default declaration cardinality invalid"
    err = "type default declaration authority invalid"
    importOrigins.importDeclarationProducerSourceIds
    importOrigins.importDeclarationSourceLocalRows
    importOrigins.importItemDeclarationIds
    importOrigins.importItemAliasTokenIds
    importOrigins.importModuleTokenIds
    err = "import module adjacency invalid"
    err = "simple import replay failed"
    err = "grouped prefix drift"
    err = "import module token CSR incomplete"
    parserCanonicalSourceSidecarHash(sidecar)
fn ParserCanonicalSourceSidecarStrictValidateInto(sidecar: ParserCanonicalSourceSidecar): bool =
    parserCanonicalSourceSidecarPayloadStrictValidateInto(sidecar, err)
    parserCanonicalSourceSidecarHash(sidecar)
    sidecar.sidecarRaw32
`),
  typedExpr: Buffer.from(`fn TypedExprIrPrepareValueExprCallMetadata(ir: var TypedExprIr): bool =
    ir.valueExprTransactionProducerSourceIndex = -1
    ir.valueExprCallMetaResultTypeIds = []
    ir.valueExprCallMetaOriginParserNodeIds = []
    if ir.internPool == nil:
        return false
fn TypedExprIrReleasePayload(ir: var TypedExprIr) =
    ir = TypedExprIr()
    ir.valueExprTransactionProducerSourceIndex = -1
fn typedExprIrCloneImpl(ir: var TypedExprIr): TypedExprIr =
    var out: TypedExprIr
    out.valueExprTransactionProducerSourceIndex = -1
    out.buildIndex = TypedExprBuildIndexClone(ir.buildIndex)
    return out
fn TypedExprIrMoveInto(out: var TypedExprIr, ir: var TypedExprIr) =
    ir = TypedExprIr()
    ir.valueExprTransactionProducerSourceIndex = -1
fn TypedExprIrZeroFunctionSealedDomainStrictValidate(ir: var TypedExprIr): bool =
    return typedExprIrZeroFunctionDomainStrictValidateWithLocalBindingSeal(
        ir, true)
`),
  snapshotBuilder: Buffer.from(`fn compilerSnapshotBuilderSourceInputsValidateInto(tables: Tables): bool =
    parser_receipt.ParserCanonicalSourceSidecarStrictValidateInto()
    sidecars[producerIndex].sidecarRaw32
fn compilerSnapshotBuilderProjectionValidate(tables: Tables): bool =
    ParserCanonicalSourceSidecarStrictValidateInto()
    sidecars[producerIndex].sidecarRaw32
    tokenSourceLocalRows
    tokenLexicalParentIds
    tokens.sourceLocalRows
    tokens.lexicalParentTokenIds
    tokenBase + localParent
    statementRootAnchorTokenIds
    statementRootBindingDeclarationStarts
    statementRootBindingDeclarationCounts
    declarationBase + localBindingDeclarationStart
    tables.parserSidecars.sidecarCids
    sidecars[producerIndex].sidecarRaw32
fn CompilerSnapshotParserTablesBuildInto(tables: var Tables): bool =
    add(parserSidecars.sidecarCids,
        sidecars[producerIndex].sidecarRaw32)
    add(tokens.sourceLocalRows, sourceLocalRow)
    add(tokens.lexicalParentTokenIds, tokenBase + localParent)
    add(parserSidecars.statementRootAnchorTokenIds, anchorToken)
    add(parserSidecars.statementRootBindingDeclarationStarts,
        declarationBase + localBindingDeclarationStart)
    add(parserSidecars.statementRootBindingDeclarationCounts, declarationCount)
fn compilerSnapshotProductionSymbolInterfaceObligations(csg: var Csg) =
    declarationInterfaceCount = csg.sourceSnapshotCount
    for producerIndex in 0..<
            csg.parserNormalizedExprReceipt.sourceSidecars.len:
        sidecar.declarationKinds[declarationRow]
        if kind != Int32(parser.ParserDeclarationModule):
            declarationInterfaceCount =
                declarationInterfaceCount + 1
        genericInterfaceCount =
            sidecar.typeGenericSymbolNameTokenIds.len
        annotationTargetBindingCount =
            sidecar.annotationTargetTokenIds.len
fn compilerSnapshotProductionFunctionInspectionStrictValidateInto(
        csg: var Csg,
        parameterCount: var int32,
        genericCount: var int32): bool =
    csg.semanticGraph.reachableFunctionTable.graphNodeIds.len
    setLen(functionDeclarationBySpanId, sidecar.spanStartBytes.len)
    for spanId in 0..<functionDeclarationBySpanId.len:
        functionDeclarationBySpanId[spanId] = -1
    for declarationRow in 0..<sidecar.declarationKinds.len:
        sidecar.declarationSpanIds[declarationRow]
        sidecar.declarationFunctionRows[declarationRow]
        functionDeclarationBySpanId[declarationSpanId] =
            declarationRow
    for parserFunctionRow in 0..<sidecar.functionIndexes.len:
        sidecar.functionIndexes[parserFunctionRow]
        csg.semanticGraph.reachableFunctionTable.sourceIndex[functionId]
        sidecar.sourceIndex
        sidecar.functionDeclarationSpanIds[parserFunctionRow]
        sidecar.functionNameSpanIds[parserFunctionRow]
        let ownerDeclaration =
            functionDeclarationBySpanId[functionSpanId]
        sidecar.declarationNameSpanIds[ownerDeclaration]
        sidecar.declarationFunctionRows[ownerDeclaration]
        let ownerToken =
            sidecar.declarationNameTokenIds[ownerDeclaration]
        functionSeen[functionId] = true
        executableFunctionByOwnerToken[ownerToken] = true
    for declarationRow in 0..<sidecar.declarationKinds.len:
        sidecar.declarationOwnerIds[declarationRow]
        sidecar.declarationFunctionRows[declarationRow]
        parameterCount = parameterCount + 1
    for genericRow in 0..<sidecar.typeGenericSymbolNameTokenIds.len:
        sidecar.typeGenericSymbolDeclarationOwnerTokenIds[genericRow]
        if executableFunctionByOwnerToken[ownerToken]:
            genericCount = genericCount + 1
    if !functionSeen[functionId]:
        return false
    return true
fn compilerSnapshotBuilderTypeFunctionBindingsInto(
        csg: var Csg): bool =
    var sourceIdByProducer: int32[]
    var producerBySourceId: int32[]
    for row in 0..<sourceCount:
        sourceIdByProducer[producerSourceIndex] = sourceId
        producerBySourceId[sourceId] = producerSourceIndex
    for producerSourceIndex in 0..<sidecars.len:
        var tokenBySpan: int32[]
        for localToken in 0..<sidecar.tokenSpanIds.len:
            tokenBySpan[spanId] = localToken
        for localFunctionRow in 0..<sidecar.functionIndexes.len:
            let localNameToken =
                tokenBySpan[nameSpanId]
    return true
fn compilerSnapshotProductionFunctionTypeArenaBridgeStrictValidateInto(
        csg: var Csg): bool =
    typeSyntaxProducerSourceIndexes
    typeSyntaxRootKinds
    ParserTypeSyntaxRootFunctionParameter
    ParserTypeSyntaxRootFunctionReturn
    typeSyntaxParserKinds
    typeSyntaxOwnerTokenIndexes
    typeSyntaxDeclarationOwnerTokenIndexes
    typeSyntaxDeclarationOwnerNodeIndexes
    typeSyntaxGenericSymbolCounts
    for localGenericRow in 0..<genericCount:
        genericSymbolProducerSourceIndexes
        genericSymbolDeclarationOwnerTokenIndexes
        genericSymbolNameTokenIndexes
        genericSymbolOrdinals
    return true
fn compilerSnapshotProductionFunctionRequiredDomainCidInto(
        csg: var Csg,
        expectedParameterCount: int32,
        expectedGenericCount: int32,
        outCid: var Cid): bool =
    csg.semanticGraph.reachableFunctionTable.graphNodeIds.len
    CompilerSnapshotProductionTypeArenaBindingStrictValidateInto()
    compilerSnapshotBuilderTypedFunctionJoinInto()
    ParserCanonicalSourceSidecarStrictValidateInto()
    compilerSnapshotProductionFunctionTypeArenaBridgeStrictValidateInto()
    setLen(functionByOwnerToken, tokenCount)
    for producerSourceIndex in 0..<sourceCount:
        sidecar.functionIndexes[localFunctionRow]
        sidecar.functionNameSpanIds[localFunctionRow]
        functionByOwnerToken[ownerToken] = functionId
        sidecar.typeGenericSymbolDeclarationOwnerTokenIds
    compilerSnapshotBuilderTypeFunctionBindingsFromOwnerTokensInto()
    returnArenaTypeIds
    parameterArenaTypeIds
    parameterOwnershipKinds
    sidecar.typeGenericSymbolDeclarationOwnerTokenIds
    functionGenericRows
    "cheng.compiler.snapshot.production_function_required_domain"
    csg.typeArena.artifactRaw32
    for functionId in 0..<functionCount:
        typedRowByReachable[functionId]
        csg.semanticGraph.reachableFunctionTable.producerDeclarationIndexes
        sidecar.functionAnnotationFlags[localFunctionRow]
    outCid = compilerSnapshotBuilderHashFinish(buf)
    return true
fn compilerSnapshotProductionTypedNodeRequiredDomainStrictValidateInto(
        csg: var Csg): bool =
    texpr.TypedExprValueDefinitionAuthorityStrictValidateInto(
        csg.typedIr, err)
    setLen(sourceNodeBases, sidecars.len)
    compilerSnapshotBuilderCountAppendSafe(
        totalParserNodeCount, sidecar.nodeKinds.len)
    setLen(expectedFunctionByParserNode, totalParserNodeCount)
    expectedFunctionByParserNode[parserNodeRow] = -1
    setLen(parserExprRequiredByFunction, functionCount)
    for exprRow in 0..<sidecar.normalizedExprParserNodeIds.len:
        sidecar.normalizedExprProducerSourceIds[exprRow]
        csg.semanticGraph.reachableFunctionTable.sourceIndex[functionIndex]
        expectedFunctionByParserNode[parserNodeRow] =
            functionIndex
        parserExprRequiredByFunction[functionIndex] = true
    var reachableFunctionByGraphNodeId: int32[]
    setLen(reachableFunctionByGraphNodeId, csg.nodes.len + 1)
    reachableFunctionByGraphNodeId[graphNodeId] = -1
    csg.semanticGraph.reachableFunctionTable.graphNodeIds[functionIndex]
    reachableFunctionByGraphNodeId[graphNodeId] =
        functionIndex
    setLen(typedFunctionSeenByReachableFunction, functionCount)
    for typedFunctionIndex in 0..<
            csg.semanticGraph.typedIrTable.functionGraphNodeIds.len:
        csg.semanticGraph.typedIrTable.functionSourceIndexes[
            typedFunctionIndex]
        if typedFunctionSeenByReachableFunction[functionIndex]:
            return false
        typedFunctionSeenByReachableFunction[functionIndex] = true
        let nodeStart =
            csg.semanticGraph.typedIrTable.functionNodeStart[
                typedFunctionIndex]
        let nodeCount =
            csg.semanticGraph.typedIrTable.functionNodeCount[
                typedFunctionIndex]
    if parserExprRequiredByFunction[functionIndex] &&
       !typedFunctionSeenByReachableFunction[functionIndex]:
        return false
    return true
fn compilerSnapshotProductionAdmissionReceiptCid(receipt: Admission): Cid =
    receipt.functionInterfaceRequiredDomainCid
fn compilerSnapshotProductionFunctionInterfaceProofCid(
        csg: var Csg,
        tables: var Tables,
        requiredDomainCid: Cid): Cid =
    requiredDomainCid
    csg.canonicalGraphCid
    csg.typeArena.artifactRaw32
    tables.functions.symbolIds.len
    for functionId in 0..<tables.functions.symbolIds.len:
        tables.symbols.symbolCids[symbolId]
        tables.functions.interfaceCids[functionId]
        tables.symbols.typeIds[symbolId]
        tables.functions.typedFunctionIndexes[functionId]
        tables.functions.parameterOwnershipCounts[functionId]
        tables.functions.parameterOwnershipKinds[ownershipStart + offset]
    return compilerSnapshotBuilderHashFinish(buf)
fn compilerSnapshotProductionAdmissionBuildValidated(
        csg: var Csg,
        functionInterfaceRequiredDomainCid: Cid): Admission =
    out.functionInterfaceRequiredDomainCid =
        functionInterfaceRequiredDomainCid
    compilerSnapshotProductionSymbolInterfaceObligations(
        csg, declarationInterfaceCount, genericInterfaceCount,
        annotationTargetBindingCount)
    out.symbolCount =
        declarationInterfaceCount + genericInterfaceCount
    out.reachableFunctionCount =
        csg.semanticGraph.reachableFunctionTable.graphNodeIds.len
    out.missingSymbolDeclarationInterfaceCount =
        declarationInterfaceCount
    out.missingSymbolGenericInterfaceCount =
        genericInterfaceCount
    out.missingSymbolAnnotationTargetBindingCount =
        annotationTargetBindingCount
    out.missingSymbolInterfaceCount =
        declarationInterfaceCount +
        genericInterfaceCount +
        annotationTargetBindingCount
    out.missingFunctionInterfaceCount = out.reachableFunctionCount
    out.missingFunctionOwnerIdentityCount =
        out.reachableFunctionCount
    out.missingFunctionParameterTypeCount = 0
    out.missingFunctionParameterOwnershipCount = 0
    out.missingFunctionReturnTypeCount = 0
    out.missingFunctionGenericIdentityCount = 0
    out.missingFunctionSourceBindingCount = 0
    return out
fn CompilerSnapshotProductionAdmissionAssessInto(csg: var Csg): bool =
    var functionParameterCount: int32
    var functionGenericCount: int32
    var functionInterfaceRequiredDomainCid: Cid
    compilerSnapshotBuilderGraphStrictValidateInto(csg, err)
    compilerSnapshotProductionFunctionInspectionStrictValidateInto(
        csg, functionParameterCount, functionGenericCount, err)
    compilerSnapshotProductionFunctionRequiredDomainCidInto(
        csg, functionParameterCount, functionGenericCount,
        functionInterfaceRequiredDomainCid, err)
    compilerSnapshotProductionTypedNodeRequiredDomainStrictValidateInto(
        csg, err)
    compilerSnapshotProductionAdmissionBuildValidated(
        csg,
        functionInterfaceRequiredDomainCid)
    receipt.functionInterfaceRequiredDomainCid
    receipt.missingSymbolInterfaceCount > 0
    receipt.symbolInterfaceProofCid
    receipt.missingFunctionInterfaceCount > 0
    receipt.functionInterfaceProofCid
    return true
fn CompilerSnapshotProductionSourceInterfacesFinalizeInto(
        csg: var Csg,
        dependencyProofCid: Cid,
        tables: var Tables,
        outProofCid: var Cid): bool =
    let expectedDependencyProofCid =
        compilerSnapshotProductionDependencyProofCid(csg)
    if !compilerSnapshotBuilderGraphStrictValidateInto(csg, err):
        return false
    if !layout.FixedBytes32Equal(
            dependencyProofCid, expectedDependencyProofCid):
        return false
    compilerSnapshotProductionCanonicalSourceRowsBuildInto()
    schema.CsgCompilerSymbolRowCidInto()
    schema.CsgCompilerSymbolInterfaceCidInto()
    csg.semanticGraph.importEdgeTable.ownerSourceIndex
    schema.CsgCompilerSourceInterfacesFinalizeInto(tables, err)
    schema.CsgCompilerSourceInterfaceCidsInto()
    outProofCid = compilerSnapshotProductionSourceInterfaceProofCid(
        csg, tables, dependencyProofCid)
    return true
fn CompilerSnapshotProductionCandidateBuildInto(
        csg: var Csg,
        tables: var Tables,
        admission: var Admission): bool =
    CompilerSnapshotProductionAdmissionAssessInto()
    CompilerSnapshotParserTablesBuildInto()
    tables.sources.interfaceCids[sourceId]
    layout.FixedBytes32()
    compilerSnapshotBuilderTypeFunctionProjectValidatedInto()
    admission.missingFunctionOwnerIdentityCount = 0
    admission.missingFunctionInterfaceCount = 0
    if admission.missingSymbolInterfaceCount == 0:
        CompilerSnapshotProductionSourceInterfacesFinalizeInto()
    admission.sourceInterfaceProofCid = proofCid
    admission.missingSourceInterfaceCount = 0
    admission.missingFactBitmap =
        admission.missingFactBitmap -
        CompilerSnapshotAdmissionMissingSourceInterface
    admission.functionInterfaceProofCid =
        compilerSnapshotProductionFunctionInterfaceProofCid(
            admission.functionInterfaceRequiredDomainCid)
    admission.receiptCid =
        compilerSnapshotProductionAdmissionReceiptCid(admission)
    CompilerSnapshotProductionCandidateReceiptStrictValidateInto()
    tables = candidateTables
    admission = candidateAdmission
    return true
fn CompilerSnapshotProductionCandidateReceiptStrictValidateInto(
        csg: var Csg,
        tables: var Tables,
        receipt: var Admission): bool =
    CompilerSnapshotProductionAdmissionAssessInto()
    schema.CsgCompilerSnapshotSymbolFunctionTablesStrictValidateInto()
    tables.functions.symbolIds.len
    expected.reachableFunctionCount
    expected.missingFunctionOwnerIdentityCount = 0
    expected.missingFunctionInterfaceCount = 0
    expected.functionInterfaceProofCid =
        compilerSnapshotProductionFunctionInterfaceProofCid(
            expected.functionInterfaceRequiredDomainCid)
    expected.missingFactBitmap =
        expected.missingFactBitmap -
        CompilerSnapshotAdmissionMissingFunctionInterface
    tables.symbols.symbolCids.len
    if expected.missingSymbolInterfaceCount == 0:
        expected.sourceInterfaceProofCid =
            compilerSnapshotProductionSourceInterfaceProofCid()
    expected.receiptCid =
        compilerSnapshotProductionAdmissionReceiptCid(expected)
    compilerSnapshotProductionAdmissionReceiptCid(receipt)
    receipt.receiptCid, expected.receiptCid
    return true
fn compilerSnapshotBuilderArenaTypeTextsInto(csg: var Csg): bool =
    TypedExprStructuralTypeTuple
    csg.typeArena.childNameIds
    langintern.LookupIntern()
    add(parts, Value(childNameResult))
    add(parts, ":")
    add(parts, out[childTypeId])
fn compilerSnapshotBuilderAppendArenaTypeRow(tables: var Tables): bool =
    schema.CsgCompilerTypeTuple
    add(tables.types.argTypeIds, childTypeId)
    csg.typeArena.childNameIds
    langintern.LookupIntern()
    compilerSnapshotBuilderTextFind()
    add(tables.types.argNameTextIds, childNameTextId)
fn compilerSnapshotBuilderFunctionParameterOwnershipKindInto(csg: var Csg, arenaTypeId: int32): bool =
    csg.typeArena.typeKinds
    TypedExprStructuralTypeBorrow
    CsgCompilerOwnershipBorrowed
    csg.typeArena.managedFlags
    CsgCompilerOwnershipOwned
    CsgCompilerOwnershipUnmanaged
fn compilerSnapshotBuilderCanonicalSpansBuildInto(): bool =
    var sourceExtent: CompilerSnapshotCanonicalSpanInput
    sourceExtent.startByte = sidecars[producerIndex].spanStartBytes[0]
    sourceExtent.endByte = sidecars[producerIndex].spanEndBytes[0]
    if value.startByte < sourceExtent.startByte:
        sourceExtent.startByte = value.startByte
    if value.endByte > sourceExtent.endByte:
        sourceExtent.endByte = value.endByte
    add(candidates, sourceExtent)
fn compilerSnapshotBuilderZeroFunctionLexicalScopesProjectInto(tables: var Tables): bool =
    tables.sources.documentCids.len != 1
    csg.semanticGraph.importEdgeTable.ownerSourceIndex.len != 0
    texpr.TypedExprIrZeroFunctionSealedDomainStrictValidate(
        csg.typedIr)
    ParserDeclarationLexicalScopeSource
    compilerSnapshotBuilderSourceSemanticExtentSpanId(tables, 0)
    add(tables.lexicalScopes.sourceIds, 0)
    add(tables.lexicalScopes.parentScopeIds, -1)
    add(tables.lexicalScopes.visibleSymbolIds, symbolId)
    add(tables.lexicalScopes.visibleCounts, count)
fn compilerSnapshotBuilderGraphReceiptBuildInto(csg: var Csg): bool =
    let functionDomainExact = true
    let zeroFunctionDomainExact =
        out.sourceCount == 1 &&
        csg.semanticGraph.importEdgeTable.ownerSourceIndex.len == 0 &&
        out.symbolCandidateCount == 0 &&
        out.reachableFunctionCount == 0 &&
        out.typedIrFunctionCount == 0 &&
        out.resolvedCallCount == 0 &&
        prebuildFacts.symbolCids.len == 0 &&
        prebuildFacts.functionSymbolIds.len == 0 &&
        csg.typedIr.nodes2_nodeIndexs.len == 0 &&
        csg.parserNormalizedExprReceipt.functionCount == Int64(0) &&
        compilerSnapshotBuilderTypedDomainExact(csg)
    let domainExact =
        functionDomainExact || zeroFunctionDomainExact
    out.missingLexicalScopeProofCount =
        zeroFunctionDomainExact ? 0 : out.sourceCount
`),
  snapshotSchema: Buffer.from(`type
    CsgCompilerTokenTable =
        sourceIds: int32[]
        sourceLocalRows: int32[]
        lexicalParentTokenIds: int32[]
        spanIds: int32[]
        kinds: int32[]
        valueTextIds: int32[]
    CsgCompilerTypeTable =
        argStarts: int32[]
        argCounts: int32[]
        argTypeIds: int32[]
        argNameTextIds: int32[]
    CsgCompilerFunctionTable =
        annotationFlags: int32[]
        parameterOwnershipStarts: int32[]
        parameterOwnershipCounts: int32[]
        parameterOwnershipKinds: int32[]
fn csgCompilerFunctionParameterOwnershipExpectedInto(snapshot: Snapshot, functionTypeId: int32, parameterOffset: int32): bool =
    let argStart = snapshot.types.argStarts[functionTypeId]
    let argCount = snapshot.types.argCounts[functionTypeId]
    let parameterTypeId = snapshot.types.argTypeIds[argStart + parameterOffset]
    if snapshot.types.typeKinds[parameterTypeId] == CsgCompilerTypeBorrow:
        out = CsgCompilerOwnershipBorrowed
    elif snapshot.types.managedFlags[parameterTypeId]:
        out = CsgCompilerOwnershipOwned
    else:
        out = CsgCompilerOwnershipUnmanaged
fn CsgCompilerSymbolInterfaceCidInto(snapshot: Snapshot): bool =
    snapshot.functions.annotationFlags[functionId]
    csgCompilerTypeCidAppendU32(
            buf,
            snapshot.functions.annotationFlags[functionId])
    let ownershipStart = snapshot.functions.parameterOwnershipStarts[functionId]
    let ownershipCount = snapshot.functions.parameterOwnershipCounts[functionId]
    snapshot.functions.parameterOwnershipKinds
    csgCompilerFunctionParameterOwnershipExpectedInto()
    csgCompilerTypeCidAppendU32(buf, ownershipKind)
fn csgCompilerFunctionsAndReadsValidateInto(snapshot: Snapshot): bool =
    snapshot.functions.annotationFlags.len
    CsgCompilerFunctionAnnotationFlagsValid(
        snapshot.functions.annotationFlags[row])
    snapshot.functions.parameterOwnershipStarts.len
    snapshot.functions.parameterOwnershipCounts.len
    snapshot.functions.parameterOwnershipKinds.len
    ownershipCursor
    csgCompilerFunctionParameterOwnershipExpectedInto()
fn csgCompilerTypeStructureAppendInto(snapshot: Snapshot): bool =
    snapshot.types.argNameTextIds.len
    let argNameTextId = snapshot.types.argNameTextIds[argRow]
    csgCompilerOptionalIndexValid(argNameTextId, snapshot.texts.len)
    CsgCompilerTypeTuple
    csgCompilerTypeCidAppendOptionalText()
fn csgCompilerTypesValidateInto(snapshot: Snapshot): bool =
    snapshot.types.argNameTextIds.len
    snapshot.types.argTypeIds.len
    snapshot.types.argNameTextIds[argRow]
    kind != CsgCompilerTypeTuple
fn CsgCompilerSourceInterfaceCidsInto(snapshot: Snapshot): bool =
    snapshot.sources.documentCids[sourceId]
    snapshot.symbols.exportedFlags[symbolId]
    snapshot.symbols.symbolCids[symbolId]
    snapshot.symbols.interfaceCids[symbolId]
    snapshot.symbols.symbolKinds[symbolId]
    snapshot.dependencies.targetSourceIds[dependencyId]
    snapshot.dependencies.observedInterfaceCids[dependencyId]
    snapshot.sources.interfaceCids[targetSourceId]
    snapshot.dependencies.dependencyKinds[dependencyId]
    hash256.Sha256Fixed()
fn CsgCompilerSourceInterfacesFinalizeInto(snapshot: var Snapshot): bool =
    remainingDependencyCounts[sourceId] =
        dependencyCounts[sourceId]
    if remainingDependencyCounts[sourceId] == 0:
        add(queue, sourceId)
    while queueCursor < queue.len:
        if !completed[targetSourceId]:
            return false
        nextObservedInterfaceCids[dependencyId] =
            nextSourceInterfaceCids[targetSourceId]
        hash256.Sha256Fixed()
    if completedCount != sourceCount:
        return false
    snapshot.sources.interfaceCids = nextSourceInterfaceCids
    snapshot.dependencies.observedInterfaceCids =
        nextObservedInterfaceCids
fn csgCompilerDependenciesValidateInto(snapshot: Snapshot): bool =
    snapshot.dependencies.observedInterfaceCids[row]
    snapshot.sources.interfaceCids[target]
    CsgCompilerSourceInterfaceCidsInto()
    expectedInterfaceCids[sourceId]
    snapshot.sources.interfaceCids[sourceId]
    err = "source interface CID mismatch"
fn csgCompilerParserValidateInto(snapshot: Snapshot): bool =
    snapshot.parserSidecars.sidecarCids.len
    csgCompilerCidObserved(snapshot.parserSidecars.sidecarCids[row])
    snapshot.parserSidecars.functionAnnotationFlags
    CsgCompilerFunctionAnnotationFlagsValid(
        snapshot.parserSidecars.functionAnnotationFlags[row])
    tokens.sourceLocalRows
    tokens.lexicalParentTokenIds
    CsgCompilerTokenFmtString
    previousChildEndBytes[lexicalParent]
    statementRootAnchorTokenIds
    statementRootBindingDeclarationStarts
    statementRootBindingDeclarationCounts
    CsgCompilerParserStatementTypeDefault
    CsgCompilerParserDeclarationField
    CsgCompilerParserDeclarationType
    err = "type default declaration cardinality invalid"
    err = "type default declaration authority invalid"
    err = "binding statement declaration range invalid"
    err = "binding statement declaration authority invalid"
`),
  snapshotCargo: Buffer.from(`fn csgCompilerCargoTokensLine(snapshot: Snapshot): str =
    snapshot.tokens.kinds
    snapshot.tokens.lexicalParentTokenIds
    snapshot.tokens.sourceIds
    snapshot.tokens.sourceLocalRows
    snapshot.tokens.spanIds
    snapshot.tokens.valueTextIds
fn csgCompilerCargoTypesLine(snapshot: Snapshot): str =
    snapshot.types.argCounts
    snapshot.types.argNameTextIds
    snapshot.types.argStarts
    snapshot.types.argTypeIds
fn csgCompilerCargoFunctionsLine(snapshot: Snapshot): str =
    csgCompilerCargoAppend(out, "{\\"annotationFlags\\":")
    snapshot.functions.annotationFlags
    csgCompilerCargoAppend(out, ",\\"bodyContentCids\\":")
    snapshot.functions.parameterOwnershipCounts
    snapshot.functions.parameterOwnershipKinds
    snapshot.functions.parameterOwnershipStarts
fn csgCompilerCargoParserSidecarsLine(snapshot: Snapshot): str =
    declarationTypeSyntaxRootIds
    snapshot.parserSidecars.functionAnnotationFlags
    functionBodySpanIds
    statementRootAnchorTokenIds
    statementRootBindingDeclarationCounts
    statementRootBindingDeclarationStarts
    genericSpanIds
    csg_dialect::cheng_compiler::parser_sidecars
    normalizedExprFunctionIndexes
    normalizedExprKinds
    normalizedExprParserNodeIds
    normalizedExprProducerSourceIds
    normalizedExprSourceLocalRows
    normalizedExprStatementRoles
    parserInputCids
`),
  snapshotValidator: Buffer.from(`lexicalParentTokenIds
sourceLocalRows
tokenLexicalParentIds
tokenSourceLocalRows
CsgCoreParserTokenFmtString
functionAnnotationFlags
annotationFlags
statementRootAnchorTokenIds
statementRootBindingDeclarationCounts
statementRootBindingDeclarationStarts
fn csgCompilerWireFunctionParameterOwnershipValidateInto(facts: Facts): bool =
    functionParameterOwnershipStarts
    functionParameterOwnershipCounts
    functionParameterOwnershipKinds
    symbolTypeIds[symbolId]
    typeArgStarts[functionTypeId]
    typeArgCounts[functionTypeId]
    typeArgTypeIds
    typeKinds[parameterTypeId]
    CsgCoreCompilerTypeBorrow
    typeManagedFlags[parameterTypeId]
    CsgCoreCompilerOwnershipBorrowed
    CsgCoreCompilerOwnershipOwned
    CsgCoreCompilerOwnershipUnmanaged
`),
  compilerWorld: Buffer.from(`fn CompilerWorldSourceRawBytesCidFromSpan(sourceBytes: layout.ByteSpan): layout.FixedBytes32 =
    var header = ByteBufInit(64)
    CompilerWorldAppendText(header, "cheng.compiler.source_raw_bytes")
    CompilerWorldAppendU32BE(header, layout.ByteSpanLen(sourceBytes))
    let cid = hash256.Sha256FixedTwo(layout.ByteBufView(header), sourceBytes)
    layout.ByteBufFree(header)
fn CompilerWorldSourceRawBytesCidBorrowed(sourceText: var str): bool =
    let sourceBytes = rawbytes.BytesFromString(sourceText)
    CompilerWorldSourceRawBytesCidFromSpan(sourceBytes)
fn CompilerWorldSourceRawBytesCidFromBytes(sourceBytes: Bytes): layout.FixedBytes32 =
    return CompilerWorldSourceRawBytesCidFromSpan(
        layout.ByteSpanFromBytes(sourceBytes))
fn CompilerWorldSourceBundleCidFromIdentityTextsBorrowedInto(identityPaths: var str[], sourceTexts: var str[]): bool =
    CompilerWorldPathOrderInto()
    CompilerWorldSourceRawBytesCidBorrowed(sourceTexts[sourceIndex])
`),
  sha256: Buffer.from(`fn Sha256CompressBlockReuse(state: Bytes, block: Bytes, kTable: Bytes, schedule: var int64[]) =
    if schedule.len != 64: panic("shape")
    schedule[index] = GetU32BE(block, index * 4)
fn Sha256TwoPartStateInit(): Sha256TwoPartState =
    state.state = BytesAlloc(32)
    state.block = BytesAlloc(64)
    state.kTable = BytesAlloc(256)
    setLen(state.schedule, 64)
fn Sha256TwoPartUpdate(state: var Sha256TwoPartState, data: Bytes) =
    state.totalLen = state.totalLen + Int64(data.len)
    let blockView = BytesView(RawmemPtrAdd(data.data, offset), 64)
    Sha256TwoPartCompress(state, blockView)
fn Sha256TwoPartFinish(state: var Sha256TwoPartState): Bytes =
    if state.blockLen > 56:
        Sha256TwoPartCompress(state, state.block)
    let bitLen = state.totalLen * 8
    Sha256TwoPartCompress(state, state.block)
    Sha256TwoPartStateRelease(state)
fn Sha256DigestTwo(first: Bytes, second: Bytes): Bytes =
    var state = Sha256TwoPartStateInit()
    Sha256TwoPartUpdate(state, first)
    Sha256TwoPartUpdate(state, second)
    return Sha256TwoPartFinish(state)
`),
  hash256: Buffer.from(`fn Sha256FixedTwo(first: layout.ByteSpan, second: layout.ByteSpan): layout.FixedBytes32 =
    var digestBytes = sha256.Sha256DigestTwo(first.data, second.data)
    let digestRes = layout.FixedBytes32FromBytes(digestBytes)
    BytesFree(digestBytes)
`),
  compilerCsg: Buffer.from(`fn CompilerCsgTraceStderrStageAllowed(stage: str): bool =
    if stage == "after_binding_source_texts": return true
    if stage == "after_binding_import_rebuild": return true
    if stage == "after_binding_import_compare": return true
    if stage == "after_portable_binding_validation": return true
    if stage == "after_binding_source_text_release": return true
    return false
fn CompilerCsgPortableOverrideBindingValidateInto(plan: Plan, sourceTexts: var str[], rebuiltImportEdges: var parser.ImportEdge[]): bool =
    SystemLinkPlanPortableSourceBindingValidateRebuiltTextsInto()
fn CompilerCsgExactExprRowsMarkNonFunctionDeclarationDomain(fullSourceLayer: var Layer, rowDomains: var int32[]): bool =
    let expr = fullSourceLayer.exprs[exprIndex]
    expr.valueExprRootNodeIndex
    expr.originParserNodeId
    parser.ParserValueExprNodeEnclosingStatementRootEventAt()
    parser.ParserValueExprStatementRootIsNonFunctionDeclarationValue()
    rowDomains[exprIndex] = CompilerCsgExactExprDomainNonFunctionDeclaration
fn CompilerCsgExactExprRowsRequireClosed(rowDomains: int32[]): bool =
    CompilerCsgExactExprDomainReachableFunction
    CompilerCsgExactExprDomainUnreachableFunction
    CompilerCsgExactExprDomainNonFunctionDeclaration
fn CompilerCsgSemanticDependencyStrictValidateInto(semanticGraph: var Graph, sourceReceipt: var Receipt): bool =
    semanticGraph.sourceTable.sourcePaths.len
    semanticGraph.sourceTable.modulePaths.len
    semanticGraph.sourceTable.textBytes.len
    semanticGraph.sourceTable.declStart.len
    semanticGraph.sourceTable.declCount.len
    semanticGraph.sourceTable.importEdgeStart.len
    semanticGraph.sourceTable.importEdgeCount.len
    sourceReceipt.sourceSnapshotCount
    semanticGraph.declTable.sourceIndex.len
    semanticGraph.declTable.lineNumbers.len
    semanticGraph.declTable.importc.len
    semanticGraph.declTable.exported.len
    sourceReceipt.importEdgeCount
    semanticGraph.importEdgeTable.targetSourceIndex.len
    semanticGraph.importEdgeTable.ownerModulePaths.len
    semanticGraph.importEdgeTable.targetModulePaths.len
    semanticGraph.importEdgeTable.targetSourcePaths.len
    semanticGraph.importEdgeTable.resolved.len
    semanticGraph.declTable.sourceIndex[declarationIndex]
    semanticGraph.importEdgeTable.ownerSourceIndex[importEdgeIndex]
    semanticGraph.sourceTable.modulePaths[sourceIndex]
    semanticGraph.sourceTable.modulePaths[targetSourceIndex]
    semanticGraph.sourceTable.sourcePaths[targetSourceIndex]
fn CompilerCsgGraphCid(semanticGraph: var Graph): Cid =
    semanticGraph.sourceTable.sourcePaths.len
    semanticGraph.sourceTable.sourcePaths[i]
    semanticGraph.sourceTable.modulePaths[i]
    semanticGraph.sourceTable.textBytes[i]
    semanticGraph.sourceTable.declStart[i]
    semanticGraph.sourceTable.declCount[i]
    semanticGraph.sourceTable.importEdgeStart[i]
    semanticGraph.sourceTable.importEdgeCount[i]
    semanticGraph.declTable.names.len
    semanticGraph.declTable.sourceIndex[i]
    semanticGraph.declTable.names[i]
    semanticGraph.declTable.lineNumbers[i]
    semanticGraph.declTable.importc[i]
    semanticGraph.declTable.exported[i]
    semanticGraph.importEdgeTable.ownerSourceIndex.len
    semanticGraph.importEdgeTable.ownerSourceIndex[i]
    semanticGraph.importEdgeTable.targetSourceIndex[i]
    semanticGraph.importEdgeTable.ownerModulePaths[i]
    semanticGraph.importEdgeTable.targetModulePaths[i]
    semanticGraph.importEdgeTable.targetSourcePaths[i]
    semanticGraph.importEdgeTable.resolved[i]
fn CompilerCsgPruneGraphForReachable(nodes: var Node[]) =
    for i in 0..<nodes.len:
        let node = nodes[i]
        if node.nodeKind == CompilerCsgNodeKindPackage ||
           node.nodeKind == CompilerCsgNodeKindModule:
            keepByNodeId[node.nodeId] = true
    for i in 0..<nodes.len:
        let node = nodes[i]
        if node.nodeKind != CompilerCsgNodeKindSymbol:
            continue
fn compilerCsgBuildConsumeWithOverridesCoreInto(plan: Plan): bool =
    CompilerCsgReadSourceTextCached()
    CompilerCsgTraceStage("after_binding_source_texts")
    SystemLinkPlanRebuildImportEdgesFromTextsInto()
    CompilerCsgTraceStage("after_binding_import_rebuild")
    CompilerCsgTraceStage("after_binding_import_compare")
    CompilerCsgPortableOverrideBindingValidateInto()
    CompilerCsgTraceStage("after_portable_binding_validation")
    CompilerCsgTraceStage("after_binding_source_text_release")
    CompilerCsgExactExprRowsMarkNonFunctionDeclarationDomain()
    CompilerCsgExactExprRowsRequireClosed()
    let zeroFunctionTypedIr =
        texpr.TypedExprIrZeroFunctionDomainStrictValidate()
    CompilerCsgVerifyImmutableSourceIdentity()
`),
  backendDriver: Buffer.from(`fn BackendDriverDispatchMinRunSystemLinkExecConcretePlanAfterSourceBundle(plan: Plan): int32 =
    SystemLinkExecSourceBundleReceiptCaptureInto()
    BuildCompilerCsgConsumePortableReceiptWithOverridesInto()
`),
  debugSectionPlanReceipt: Buffer.from(`type
    DebugSectionPlanFunctionRow =
        functionSymbolName: str
        sourceId: int32
        documentCid: layout.FixedBytes32
    DebugSectionPlanRow =
        sourceId: int32
        documentCid: layout.FixedBytes32
    DebugSectionPlanReceipt =
        sourceIds: int32[]
        sourceModulePaths: str[]
        sourceDocumentCids: layout.FixedBytes32[]
        functionNames: str[]
        functions: DebugSectionPlanFunctionRow[]
        rows: DebugSectionPlanRow[]
fn debugSectionPlanReceiptCid(receipt: DebugSectionPlanReceipt): layout.FixedBytes32 =
    debugSectionPlanAppendI32(buf, receipt.sourceIds.len)
    for index in 0..<receipt.sourceIds.len:
        debugSectionPlanAppendI32(buf, receipt.sourceIds[index])
        debugSectionPlanAppendText(buf, receipt.sourceModulePaths[index])
        debugSectionPlanAppendCid(buf, receipt.sourceDocumentCids[index])
    debugSectionPlanAppendI32(buf, receipt.functions.len)
    for index in 0..<receipt.functions.len:
        debugSectionPlanAppendText(buf, receipt.functionNames[index])
fn debugSectionPlanObserveSourceInto(sourceId: int32, modulePath: str, documentCid: layout.FixedBytes32, sourceSeen: var bool[], sourceModulePaths: var str[], sourceDocumentCids: var layout.FixedBytes32[], err: var str): bool =
    if sourceModulePaths[sourceId] != modulePath ||
       !layout.FixedBytes32Equal(sourceDocumentCids[sourceId], documentCid):
        err = "split source identity"
fn debugSectionPlanBuildExactInto(facts: DebugFacts, out: var DebugSectionPlanReceipt): bool =
    setLen(sourceSeen, facts.sourceCount)
    debugSectionPlanObserveSourceInto(functionFact.sourceId, functionFact.modulePath, functionFact.documentCid, sourceSeen, sourceModulePaths, sourceDocumentCids, err)
    debugSectionPlanObserveSourceInto(operation.sourceId, operation.modulePath, operation.documentCid, sourceSeen, sourceModulePaths, sourceDocumentCids, err)
    add(out.functionNames, functionFact.functionName)
    for sourceId in 0..<facts.sourceCount:
        add(out.sourceIds, sourceId)
        add(out.sourceModulePaths, sourceModulePaths[sourceId])
        add(out.sourceDocumentCids, sourceDocumentCids[sourceId])
    out.receiptCid = debugSectionPlanReceiptCid(out)
fn DebugSectionPlanReceiptStrictValidateInto(receipt: DebugSectionPlanReceipt): bool =
    debugSectionPlanBuildExactInto()
    debugSectionPlanSourceTablesEqual(receipt, rebuilt)
    debugSectionPlanFunctionNamesEqual(receipt.functionNames, rebuilt.functionNames)
    layout.FixedBytes32Equal(receipt.receiptCid, rebuilt.receiptCid)
fn DebugSectionPlanReceiptSelfValidateInto(receipt: DebugSectionPlanReceipt): bool =
    receipt.sourceIds.len != receipt.sourceModulePaths.len
    receipt.sourceIds.len != receipt.sourceDocumentCids.len
    receipt.functionNames.len != receipt.functions.len
    receipt.sourceIds[sourceIndex] <= previousSourceId
    receipt.sourceDocumentCids[functionSourceIndex]
    functionRow.documentCid
    receipt.sourceDocumentCids[rowSourceIndex]
    row.documentCid
`),
  directObjectDebugSections: Buffer.from(`fn directObjectDebugSourceFileIndex(sourceIds: int32[], sourceId: int32): int32 =
    sourceIds[index] == sourceId
fn directObjectDebugBuildInfoInto(receipt: DebugSectionPlanReceipt, sourceIds: int32[]): bool =
    directObjectDebugSourceFileIndex(sourceIds, functionRow.sourceId)
    directObjectDebugWriteCString(body, receipt.functionNames[functionRowIndex])
fn DirectObjectDebugSectionsBuildInto(receipt: DebugSectionPlanReceipt): bool =
    DebugSectionPlanReceiptSelfValidateInto(receipt, err)
    directObjectDebugBuildLineInto(
        receipt, receipt.sourceIds, receipt.sourceModulePaths,
        symbols, out, err)
    directObjectDebugBuildInfoInto(
        receipt, receipt.sourceIds, symbols, out, err)
`),
} as const;
assert.doesNotThrow(() => assertCidSourcePhaseContract(phaseContract));
const structuralReopen = {...phaseContract, systemLinkPlan: Buffer.from(phaseContract.systemLinkPlan.toString().replace("    SystemLinkPlanComputeSourceBundleBindingSeal()", "    ParserSourceTextWithExternalPackageRootsInto()\n    SystemLinkPlanComputeSourceBundleBindingSeal()"))};
assert.throws(() => assertCidSourcePhaseContract(structuralReopen), /reopened source bytes/);
const captureReopen = {...phaseContract, systemLinkExec: Buffer.from(phaseContract.systemLinkExec.toString().replace("SystemLinkPlanSourceBundleBindingStructuralValidInto", "SystemLinkPlanSourceBundleBindingValidInto"))};
assert.throws(() => assertCidSourcePhaseContract(captureReopen), /compact receipt capture|system_link_exec/);
const parserMaterializesAllLines = {...phaseContract, parser: Buffer.from(phaseContract.parser.toString().replace("        ParserLineRangeStartsImport()", "        ParserSplitChar()"))};
assert.throws(() => assertCidSourcePhaseContract(parserMaterializesAllLines), /streaming import specs|full source line table/);
const bindingFactReconstructsLine = {...phaseContract, parser: Buffer.from(phaseContract.parser.toString().replace("    ParserValueExprProjectSpan()", "    PathTrimLeft(lineRaw)"))};
assert.throws(() => assertCidSourcePhaseContract(bindingFactReconstructsLine), /binding initializer fact/);
const wildcardDiscardClaimsBindingAuthority = {...phaseContract, parser: Buffer.from(phaseContract.parser.toString().replace("            ParserValueExprStatementAssignmentRhs", "            ParserValueExprStatementBindingInitializer"))};
assert.throws(() => assertCidSourcePhaseContract(wildcardDiscardClaimsBindingAuthority), /binding declaration producer/);
const bindingInitializerKeepsDelimiterEnd = {...phaseContract, parser: Buffer.from(phaseContract.parser.toString().replace("            tree.declarationSpanEnds,", "            tree.declarationNameSpanEnds,"))};
assert.throws(() => assertCidSourcePhaseContract(bindingInitializerKeepsDelimiterEnd), /binding declaration producer/);
const bindingInitializerClaimsRhsDeclarations = {...phaseContract, parser: Buffer.from(phaseContract.parser.toString().replace("declarationStart..<declarationStart + bindingDeclarationCount", "declarationStart..<tree.declarationCount"))};
assert.throws(() => assertCidSourcePhaseContract(bindingInitializerClaimsRhsDeclarations), /binding declaration producer/);
const bindingInitializerUsesLastStatementRoot = {...phaseContract, parser: Buffer.from(phaseContract.parser.toString().replace("ParserValueExprNodeDirectStatementRootEventAt(tree, valueRoot)", "tree.statementRootCount - 1"))};
assert.throws(() => assertCidSourcePhaseContract(bindingInitializerUsesLastStatementRoot), /binding declaration producer/);
const bindingInitializerRestoresLegacyDuplicate = {...phaseContract, parser: Buffer.from(phaseContract.parser.toString().replace("    if !lineHasBindingInitializerRoot &&\n", "    if "))};
assert.throws(() => assertCidSourcePhaseContract(bindingInitializerRestoresLegacyDuplicate), /normalized-row uniqueness/);
const typeDefaultDropsDeclarationAuthority = {...phaseContract, parser: Buffer.from(phaseContract.parser.toString().replace("        ParserValueExprSetStatementRootDeclarationAuthority(\n            tree,\n            ParserValueExprNodeDirectStatementRootEventAt(tree, valueRoot),\n            assignedFieldDeclarationRow,\n            1)", "        assignedFieldDeclarationRow = -1"))};
assert.throws(() => assertCidSourcePhaseContract(typeDefaultDropsDeclarationAuthority), /type default declaration producer/);
const zeroFunctionKeepsStaleTransactionSource = {...phaseContract, typedExpr: Buffer.from(phaseContract.typedExpr.toString().replace("    ir.valueExprTransactionProducerSourceIndex = -1\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(zeroFunctionKeepsStaleTransactionSource), /zero-function transaction sentinel/);
const zeroFunctionReleaseRestoresAggregateZero = {...phaseContract, typedExpr: Buffer.from(phaseContract.typedExpr.toString().replace("fn TypedExprIrReleasePayload(ir: var TypedExprIr) =\n    ir = TypedExprIr()\n    ir.valueExprTransactionProducerSourceIndex = -1\n", "fn TypedExprIrReleasePayload(ir: var TypedExprIr) =\n    ir = TypedExprIr()\n"))};
assert.throws(() => assertCidSourcePhaseContract(zeroFunctionReleaseRestoresAggregateZero), /zero-function release sentinel/);
const zeroFunctionCloneRestoresAggregateZero = {...phaseContract, typedExpr: Buffer.from(phaseContract.typedExpr.toString().replace("    out.valueExprTransactionProducerSourceIndex = -1\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(zeroFunctionCloneRestoresAggregateZero), /zero-function clone sentinel/);
const zeroFunctionMoveRestoresAggregateZero = {...phaseContract, typedExpr: Buffer.from(phaseContract.typedExpr.toString().replace("fn TypedExprIrMoveInto(out: var TypedExprIr, ir: var TypedExprIr) =\n    ir = TypedExprIr()\n    ir.valueExprTransactionProducerSourceIndex = -1\n", "fn TypedExprIrMoveInto(out: var TypedExprIr, ir: var TypedExprIr) =\n    ir = TypedExprIr()\n"))};
assert.throws(() => assertCidSourcePhaseContract(zeroFunctionMoveRestoresAggregateZero), /zero-function moved-from sentinel/);
const zeroFunctionSealedDomainUsesUnsealedContract = {...phaseContract, typedExpr: Buffer.from(phaseContract.typedExpr.toString().replace("        ir, true)\n", "        ir, false)\n"))};
assert.throws(() => assertCidSourcePhaseContract(zeroFunctionSealedDomainUsesUnsealedContract), /zero-function sealed local-binding identity/);
const zeroFunctionGraphDropsBaseIdentity = {...phaseContract, compilerCsg: Buffer.from(phaseContract.compilerCsg.toString().replace("        if node.nodeKind == CompilerCsgNodeKindPackage ||\n           node.nodeKind == CompilerCsgNodeKindModule:\n            keepByNodeId[node.nodeId] = true\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(zeroFunctionGraphDropsBaseIdentity), /zero-function graph base identity/);
const fmtInterpolationDropsParent = {...phaseContract, parser: Buffer.from(phaseContract.parser.toString().replace("                          fmtTokenIndex,\n                          expressionTokenStart", "                          -1,\n                          expressionTokenStart"))};
assert.throws(() => assertCidSourcePhaseContract(fmtInterpolationDropsParent), /Fmt token parent producer/);
const parserImportOriginDropsDeclarationRow = {...phaseContract, parser: Buffer.from(phaseContract.parser.toString().replace("        itemDeclarationRows: arenamod.ArenaArrayInt32\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(parserImportOriginDropsDeclarationRow), /parser import origin SoA/);
const parserReceiptImportHashDropsAlias = {...phaseContract, parserReceipt: Buffer.from(phaseContract.parserReceipt.toString().replace("    importOrigins.importItemAliasTokenIds[row]\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(parserReceiptImportHashDropsAlias), /parser receipt identity hash/);
const snapshotBuilderDropsSealedSidecarCid = {...phaseContract, snapshotBuilder: Buffer.from(phaseContract.snapshotBuilder.toString().replace("    add(parserSidecars.sidecarCids,\n        sidecars[producerIndex].sidecarRaw32)\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(snapshotBuilderDropsSealedSidecarCid), /snapshot identity remap producer/);
const snapshotBuilderBlocksZeroFunctionGraph = {...phaseContract, snapshotBuilder: Buffer.from(phaseContract.snapshotBuilder.toString().replace("        zeroFunctionDomainExact ? 0 : out.sourceCount\n", "        out.sourceCount\n"))};
assert.throws(() => assertCidSourcePhaseContract(snapshotBuilderBlocksZeroFunctionGraph), /zero-function graph admission/);
const snapshotBuilderAdmitsImportedZeroFunctionGraph = {...phaseContract, snapshotBuilder: Buffer.from(phaseContract.snapshotBuilder.toString().replace("        csg.semanticGraph.importEdgeTable.ownerSourceIndex.len == 0 &&\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(snapshotBuilderAdmitsImportedZeroFunctionGraph), /zero-function graph admission/);
const snapshotBuilderDropsSourceExtent = {...phaseContract, snapshotBuilder: Buffer.from(phaseContract.snapshotBuilder.toString().replace("    add(candidates, sourceExtent)\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(snapshotBuilderDropsSourceExtent), /source extent identity/);
const snapshotBuilderDropsLexicalVisibility = {...phaseContract, snapshotBuilder: Buffer.from(phaseContract.snapshotBuilder.toString().replace("    add(tables.lexicalScopes.visibleSymbolIds, symbolId)\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(snapshotBuilderDropsLexicalVisibility), /lexical scope identity/);
const snapshotBuilderDropsTupleFieldIdentity = {...phaseContract, snapshotBuilder: Buffer.from(phaseContract.snapshotBuilder.toString().replace("    add(tables.types.argNameTextIds, childNameTextId)\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(snapshotBuilderDropsTupleFieldIdentity), /tuple field identity projection/);
const snapshotBuilderDropsFunctionOwnershipTypeKind = {...phaseContract, snapshotBuilder: Buffer.from(phaseContract.snapshotBuilder.toString().replace("    csg.typeArena.typeKinds\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(snapshotBuilderDropsFunctionOwnershipTypeKind), /Function parameter ownership producer/);
const snapshotBuilderAcceptsForeignDependencyProof = {...phaseContract, snapshotBuilder: Buffer.from(phaseContract.snapshotBuilder.toString().replace("            dependencyProofCid, expectedDependencyProofCid", "            dependencyProofCid, dependencyProofCid"))};
assert.throws(() => assertCidSourcePhaseContract(snapshotBuilderAcceptsForeignDependencyProof), /production source interface authority/);
const snapshotBuilderSkipsSourceInterfaceFinalizer = {...phaseContract, snapshotBuilder: Buffer.from(phaseContract.snapshotBuilder.toString().replace("    schema.CsgCompilerSourceInterfacesFinalizeInto(tables, err)\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(snapshotBuilderSkipsSourceInterfaceFinalizer), /production source interface authority/);
const snapshotBuilderPublishesSourceInterfaceProofBeforeFinalize = {...phaseContract, snapshotBuilder: Buffer.from(phaseContract.snapshotBuilder.toString().replace("    CompilerSnapshotProductionSourceInterfacesFinalizeInto()\n    admission.sourceInterfaceProofCid = proofCid\n", "    admission.sourceInterfaceProofCid = proofCid\n    CompilerSnapshotProductionSourceInterfacesFinalizeInto()\n"))};
assert.throws(() => assertCidSourcePhaseContract(snapshotBuilderPublishesSourceInterfaceProofBeforeFinalize), /production source interface admission/);
const snapshotBuilderSkipsCandidateReceiptReplay = {...phaseContract, snapshotBuilder: Buffer.from(phaseContract.snapshotBuilder.toString().replace("    CompilerSnapshotProductionCandidateReceiptStrictValidateInto()\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(snapshotBuilderSkipsCandidateReceiptReplay), /production source interface admission/);
const snapshotBuilderDropsAnnotationSymbolObligation = {...phaseContract, snapshotBuilder: Buffer.from(phaseContract.snapshotBuilder.toString().replace("        annotationTargetBindingCount =\n            sidecar.annotationTargetTokenIds.len\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(snapshotBuilderDropsAnnotationSymbolObligation), /production Symbol interface obligations/);
const snapshotBuilderCountsAnnotationTargetAsSymbol = {...phaseContract, snapshotBuilder: Buffer.from(phaseContract.snapshotBuilder.toString().replace("        declarationInterfaceCount + genericInterfaceCount\n", "        declarationInterfaceCount + genericInterfaceCount + annotationTargetBindingCount\n"))};
assert.throws(() => assertCidSourcePhaseContract(snapshotBuilderCountsAnnotationTargetAsSymbol), /production interface admission ledger/);
const snapshotBuilderDropsFunctionSourceIdentity = {...phaseContract, snapshotBuilder: Buffer.from(phaseContract.snapshotBuilder.toString().replace("    csg.semanticGraph.reachableFunctionTable.sourceIndex[functionId]\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(snapshotBuilderDropsFunctionSourceIdentity), /production FunctionId inspection/);
const snapshotBuilderDropsFunctionGenericOwner = {...phaseContract, snapshotBuilder: Buffer.from(phaseContract.snapshotBuilder.toString().replace("        sidecar.typeGenericSymbolDeclarationOwnerTokenIds[genericRow]\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(snapshotBuilderDropsFunctionGenericOwner), /production FunctionId inspection/);
const snapshotBuilderDropsFunctionRequiredTypeBinding = {...phaseContract, snapshotBuilder: Buffer.from(phaseContract.snapshotBuilder.toString().replace("    compilerSnapshotBuilderTypeFunctionBindingsFromOwnerTokensInto()\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(snapshotBuilderDropsFunctionRequiredTypeBinding), /production Function required domain/);
const snapshotBuilderDropsFunctionAnnotationFlags = {...phaseContract, snapshotBuilder: Buffer.from(phaseContract.snapshotBuilder.toString().replace("        sidecar.functionAnnotationFlags[localFunctionRow]\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(snapshotBuilderDropsFunctionAnnotationFlags), /production Function required domain/);
const snapshotBuilderDropsFunctionTypeArenaOwnerBridge = {...phaseContract, snapshotBuilder: Buffer.from(phaseContract.snapshotBuilder.toString().replace("    typeSyntaxDeclarationOwnerTokenIndexes\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(snapshotBuilderDropsFunctionTypeArenaOwnerBridge), /Function TypeArena parser bridge/);
const snapshotBuilderRestoresFunctionTokenScan = {...phaseContract, snapshotBuilder: Buffer.from(phaseContract.snapshotBuilder.toString().replace("            let localNameToken =\n                tokenBySpan[nameSpanId]\n", "            for localToken in 0..<sidecar.tokenSpanIds.len:\n                sidecar.tokenSpanIds[localToken]\n            let localNameToken =\n                tokenBySpan[nameSpanId]\n"))};
assert.throws(() => assertCidSourcePhaseContract(snapshotBuilderRestoresFunctionTokenScan), /Function TypeArena binding index: Function loop uses token scan/);
const snapshotBuilderDropsFunctionSourceReverseIndex = {...phaseContract, snapshotBuilder: Buffer.from(phaseContract.snapshotBuilder.toString().replace("        producerBySourceId[sourceId] = producerSourceIndex\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(snapshotBuilderDropsFunctionSourceReverseIndex), /Function TypeArena binding index/);
const snapshotBuilderRestoresNestedFunctionDeclarationScan = {...phaseContract, snapshotBuilder: Buffer.from(phaseContract.snapshotBuilder.toString().replace("        let ownerDeclaration =\n            functionDeclarationBySpanId[functionSpanId]\n", "        for declarationRow in 0..<sidecar.declarationKinds.len:\n            sidecar.declarationSpanIds[declarationRow]\n        let ownerDeclaration =\n            functionDeclarationBySpanId[functionSpanId]\n"))};
assert.throws(() => assertCidSourcePhaseContract(snapshotBuilderRestoresNestedFunctionDeclarationScan), /reopened declaration scan|superlinear scan/);
const snapshotBuilderRestoresNestedTypedFunctionScan = {...phaseContract, snapshotBuilder: Buffer.from(phaseContract.snapshotBuilder.toString().replace("        sidecar.normalizedExprProducerSourceIds[exprRow]\n", "        sidecar.normalizedExprProducerSourceIds[exprRow]\n        for typedRow in 0..<csg.semanticGraph.typedIrTable.functionGraphNodeIds.len:\n            csg.semanticGraph.typedIrTable.functionGraphNodeIds[typedRow]\n"))};
assert.throws(() => assertCidSourcePhaseContract(snapshotBuilderRestoresNestedTypedFunctionScan), /TypedExpr origin inspection: parser expression loop uses superlinear scan/);
const snapshotSchemaDropsTupleFieldCid = {...phaseContract, snapshotSchema: Buffer.from(phaseContract.snapshotSchema.toString().replace("    csgCompilerTypeCidAppendOptionalText()\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(snapshotSchemaDropsTupleFieldCid), /tuple field CID identity/);
const snapshotSchemaDropsFunctionOwnershipCid = {...phaseContract, snapshotSchema: Buffer.from(phaseContract.snapshotSchema.toString().replace("    csgCompilerTypeCidAppendU32(buf, ownershipKind)\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(snapshotSchemaDropsFunctionOwnershipCid), /Function parameter ownership interface CID/);
const snapshotSchemaDropsFunctionAnnotationCid = {...phaseContract, snapshotSchema: Buffer.from(phaseContract.snapshotSchema.toString().replace("    csgCompilerTypeCidAppendU32(\n            buf,\n            snapshot.functions.annotationFlags[functionId])\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(snapshotSchemaDropsFunctionAnnotationCid), /Function annotation interface CID/);
const snapshotSchemaRestoresThreadOnlyCompatibility = {...phaseContract, snapshotSchema: Buffer.from(phaseContract.snapshotSchema.toString().replace("        annotationFlags: int32[]\n", "        annotationFlags: int32[]\n        threadBoundaryFlags: bool[]\n"))};
assert.throws(() => assertCidSourcePhaseContract(snapshotSchemaRestoresThreadOnlyCompatibility), /legacy thread-only compatibility/);
const snapshotSchemaDropsSourceInterfaceSymbolCid = {...phaseContract, snapshotSchema: Buffer.from(phaseContract.snapshotSchema.toString().replace("    snapshot.symbols.symbolCids[symbolId]\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(snapshotSchemaDropsSourceInterfaceSymbolCid), /source interface CID producer/);
const snapshotSchemaDropsSourceInterfaceReplay = {...phaseContract, snapshotSchema: Buffer.from(phaseContract.snapshotSchema.toString().replace("    snapshot.sources.interfaceCids[sourceId]\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(snapshotSchemaDropsSourceInterfaceReplay), /source interface CID replay/);
const snapshotSchemaDropsSourceInterfaceDagTarget = {...phaseContract, snapshotSchema: Buffer.from(phaseContract.snapshotSchema.toString().replace("        if !completed[targetSourceId]:\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(snapshotSchemaDropsSourceInterfaceDagTarget), /source interface DAG finalization/);
const snapshotSchemaPublishesSourceInterfaceBeforeCycleCheck = {...phaseContract, snapshotSchema: Buffer.from(phaseContract.snapshotSchema.toString().replace("    if completedCount != sourceCount:\n        return false\n    snapshot.sources.interfaceCids = nextSourceInterfaceCids\n", "    snapshot.sources.interfaceCids = nextSourceInterfaceCids\n    if completedCount != sourceCount:\n        return false\n"))};
assert.throws(() => assertCidSourcePhaseContract(snapshotSchemaPublishesSourceInterfaceBeforeCycleCheck), /source interface DAG finalization/);
const snapshotCargoDropsTokenParent = {...phaseContract, snapshotCargo: Buffer.from(phaseContract.snapshotCargo.toString().replace("    snapshot.tokens.lexicalParentTokenIds\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(snapshotCargoDropsTokenParent), /snapshot token identity cargo/);
const snapshotCargoDropsTupleFieldIdentity = {...phaseContract, snapshotCargo: Buffer.from(phaseContract.snapshotCargo.toString().replace("    snapshot.types.argNameTextIds\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(snapshotCargoDropsTupleFieldIdentity), /tuple field identity cargo/);
const snapshotCargoDropsFunctionOwnership = {...phaseContract, snapshotCargo: Buffer.from(phaseContract.snapshotCargo.toString().replace("    snapshot.functions.parameterOwnershipKinds\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(snapshotCargoDropsFunctionOwnership), /Function parameter ownership cargo/);
const snapshotCargoDropsFunctionAnnotation = {...phaseContract, snapshotCargo: Buffer.from(phaseContract.snapshotCargo.toString().replace("    snapshot.functions.annotationFlags\n", "    snapshot.functions.symbolIds\n"))};
assert.throws(() => assertCidSourcePhaseContract(snapshotCargoDropsFunctionAnnotation), /Function annotation canonical cargo/);
const snapshotCargoDropsParserFunctionAnnotation = {...phaseContract, snapshotCargo: Buffer.from(phaseContract.snapshotCargo.toString().replace("    snapshot.parserSidecars.functionAnnotationFlags\n", "    snapshot.parserSidecars.functionIndexes\n"))};
assert.throws(() => assertCidSourcePhaseContract(snapshotCargoDropsParserFunctionAnnotation), /snapshot Function annotation cargo/);
const snapshotCargoMovesNormalizedExprBeforeKind = {...phaseContract, snapshotCargo: Buffer.from(phaseContract.snapshotCargo.toString().replace("    csg_dialect::cheng_compiler::parser_sidecars\n    normalizedExprFunctionIndexes\n", "    normalizedExprFunctionIndexes\n    csg_dialect::cheng_compiler::parser_sidecars\n"))};
assert.throws(() => assertCidSourcePhaseContract(snapshotCargoMovesNormalizedExprBeforeKind), /normalized-expression canonical cargo order/);
const nonFunctionDeclarationUsesLineApproximation = {...phaseContract, parser: Buffer.from(phaseContract.parser.toString().replace("    tree.declarationFunctionRows\n", "    lineNumber\n"))};
assert.throws(() => assertCidSourcePhaseContract(nonFunctionDeclarationUsesLineApproximation), /non-function declaration value authority/);
const csgDeclarationDomainDropsParserAuthority = {...phaseContract, compilerCsg: Buffer.from(phaseContract.compilerCsg.toString().replace("    parser.ParserValueExprStatementRootIsNonFunctionDeclarationValue()\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(csgDeclarationDomainDropsParserAuthority), /non-function declaration domain/);
const csgSemanticDependencyDropsImportReceiptJoin = {...phaseContract, compilerCsg: Buffer.from(phaseContract.compilerCsg.toString().replace("    sourceReceipt.importEdgeCount\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(csgSemanticDependencyDropsImportReceiptJoin), /semantic dependency strict validation/);
const csgSemanticDependencyDropsExportedCid = {...phaseContract, compilerCsg: Buffer.from(phaseContract.compilerCsg.toString().replace("    semanticGraph.declTable.exported[i]\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(csgSemanticDependencyDropsExportedCid), /semantic dependency CID/);
const debugFunctionRowRestoresTextIdentity = {...phaseContract, debugSectionPlanReceipt: Buffer.from(phaseContract.debugSectionPlanReceipt.toString().replace("        functionSymbolName: str", "        functionSymbolName: str\n        functionName: str\n        modulePath: str"))};
assert.throws(() => assertCidSourcePhaseContract(debugFunctionRowRestoresTextIdentity), /row retained text identity/);
const debugReceiptDropsSourceDocumentCid = {...phaseContract, debugSectionPlanReceipt: Buffer.from(phaseContract.debugSectionPlanReceipt.toString().replace("        debugSectionPlanAppendCid(buf, receipt.sourceDocumentCids[index])\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(debugReceiptDropsSourceDocumentCid), /debug receipt CID/);
const debugReceiptDropsOperationSourceObservation = {...phaseContract, debugSectionPlanReceipt: Buffer.from(phaseContract.debugSectionPlanReceipt.toString().replace("    debugSectionPlanObserveSourceInto(operation.sourceId, operation.modulePath, operation.documentCid, sourceSeen, sourceModulePaths, sourceDocumentCids, err)\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(debugReceiptDropsOperationSourceObservation), /debug source projection producer/);
const debugReceiptDropsFunctionSourceJoin = {...phaseContract, debugSectionPlanReceipt: Buffer.from(phaseContract.debugSectionPlanReceipt.toString().replace("    receipt.sourceDocumentCids[functionSourceIndex]\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(debugReceiptDropsFunctionSourceJoin), /debug source projection self validation/);
const directDebugReconstructsSourceTable = {...phaseContract, directObjectDebugSections: Buffer.from(phaseContract.directObjectDebugSections.toString().replace("        receipt, receipt.sourceIds, receipt.sourceModulePaths,", "        receipt, compactSourceIds, compactSourcePaths,"))};
assert.throws(() => assertCidSourcePhaseContract(directDebugReconstructsSourceTable), /direct debug source table consumption/);
const directDebugUsesRowFunctionName = {...phaseContract, directObjectDebugSections: Buffer.from(phaseContract.directObjectDebugSections.toString().replace("receipt.functionNames[functionRowIndex]", "functionRow.functionName"))};
assert.throws(() => assertCidSourcePhaseContract(directDebugUsesRowFunctionName), /direct debug info/);
const parserReceiptDropsDeclarationCount = {...phaseContract, parserReceipt: Buffer.from(phaseContract.parserReceipt.toString().replace("    sidecar.statementRootBindingDeclarationCounts[row]\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(parserReceiptDropsDeclarationCount), /parser receipt identity hash/);
const snapshotBuilderDropsDeclarationBase = {...phaseContract, snapshotBuilder: Buffer.from(phaseContract.snapshotBuilder.toString().replaceAll("declarationBase + localBindingDeclarationStart", "localBindingDeclarationStart"))};
assert.throws(() => assertCidSourcePhaseContract(snapshotBuilderDropsDeclarationBase), /snapshot identity remap/);
const snapshotSchemaDropsAuthority = {...phaseContract, snapshotSchema: Buffer.from(phaseContract.snapshotSchema.toString().replace('    err = "type default declaration authority invalid"\n', ""))};
assert.throws(() => assertCidSourcePhaseContract(snapshotSchemaDropsAuthority), /snapshot identity validation/);
const snapshotCargoDropsDeclarationCount = {...phaseContract, snapshotCargo: Buffer.from(phaseContract.snapshotCargo.toString().replace("    statementRootBindingDeclarationCounts\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(snapshotCargoDropsDeclarationCount), /snapshot statement cargo/);
const sourceBundleCopiesTexts = {...phaseContract, compilerWorld: Buffer.from(phaseContract.compilerWorld.toString().replace("    CompilerWorldPathOrderInto()", "    var orderedTexts: str[]\n    CompilerWorldSortPathTextPairs()"))};
assert.throws(() => assertCidSourcePhaseContract(sourceBundleCopiesTexts), /module bundle|second full source-text sequence/);
const sourceBundleUnborrowedRawCid = {...phaseContract, compilerWorld: Buffer.from(phaseContract.compilerWorld.toString().replaceAll("CompilerWorldSourceRawBytesCidBorrowed", "CompilerWorldSourceRawBytesCid"))};
assert.throws(() => assertCidSourcePhaseContract(sourceBundleUnborrowedRawCid), /borrowed raw source CID|module bundle/);
const sourceRawCidCoalescesPayload = {...phaseContract, compilerWorld: Buffer.from(phaseContract.compilerWorld.toString().replace("ByteBufInit(64)", "ByteBufInit(sourceBytes.data.len + 96)"))};
assert.throws(() => assertCidSourcePhaseContract(sourceRawCidCoalescesPayload), /streaming raw source CID|coalesced/);
const sourceRawCidSinglePart = {...phaseContract, compilerWorld: Buffer.from(phaseContract.compilerWorld.toString().replace("hash256.Sha256FixedTwo", "hash256.Sha256Fixed"))};
assert.throws(() => assertCidSourcePhaseContract(sourceRawCidSinglePart), /streaming raw source CID|coalesced/);
const sourceRawCidBytesCoalesces = {...phaseContract, compilerWorld: Buffer.from(phaseContract.compilerWorld.toString().replace("fn CompilerWorldSourceRawBytesCidFromBytes(sourceBytes: Bytes): layout.FixedBytes32 =\n    return CompilerWorldSourceRawBytesCidFromSpan(\n        layout.ByteSpanFromBytes(sourceBytes))", "fn CompilerWorldSourceRawBytesCidFromBytes(sourceBytes: Bytes): layout.FixedBytes32 =\n    var preimage = ByteBufInit(sourceBytes.len + 96)\n    return CompilerWorldBufCid(preimage)"))};
assert.throws(() => assertCidSourcePhaseContract(sourceRawCidBytesCoalesces), /bytes raw source CID/);
const sourceRawCidDigestConcatenates = {...phaseContract, sha256: Buffer.from(phaseContract.sha256.toString().replace("    var state = Sha256TwoPartStateInit()", "    var joined = BytesAlloc(first.len + second.len)\n    var state = Sha256TwoPartStateInit()"))};
assert.throws(() => assertCidSourcePhaseContract(sourceRawCidDigestConcatenates), /two-part SHA: concatenated full message/);
const sourceRawCidPerBlockSchedule = {...phaseContract, sha256: Buffer.from(phaseContract.sha256.toString().replace("    schedule[index] = GetU32BE(block, index * 4)", "    setLen(schedule, 64)\n    schedule[index] = GetU32BE(block, index * 4)"))};
assert.throws(() => assertCidSourcePhaseContract(sourceRawCidPerBlockSchedule), /reused schedule: allocated per block/);
const sourceBundleMixesDomains = {...phaseContract, systemLinkPlan: Buffer.from(phaseContract.systemLinkPlan.toString().replace("        parser.ParserSourceIdentityLexicalPathInto(modulePaths[sourceIndex], canonicalSourceIdentity)", "        parser.ParserSourceIdentityPathAbsolute(modulePaths[sourceIndex])"))};
assert.throws(() => assertCidSourcePhaseContract(sourceBundleMixesDomains), /portable identity domain/);
const sourceBundleRoutesSourcePathThroughModuleDomain = {...phaseContract, systemLinkPlan: Buffer.from(phaseContract.systemLinkPlan.toString().replace("        SystemLinkPlanSourcePathBundleCidInto()", "        CompilerWorldSourceBundleCidFromIdentityTextsBorrowedInto()"))};
assert.throws(() => assertCidSourcePhaseContract(sourceBundleRoutesSourcePathThroughModuleDomain), /portable identity domain/);
const portableMemoryTraceMissing = {...phaseContract, systemLinkPlan: Buffer.from(phaseContract.systemLinkPlan.toString().replace('    SystemLinkPlanProgressMemoryStage("after_portable_source_bundle_cid")\n', ""))};
assert.throws(() => assertCidSourcePhaseContract(portableMemoryTraceMissing), /portable identity domain|memory trace/);
const portableMemoryTraceReordered = {...phaseContract, systemLinkPlan: Buffer.from(phaseContract.systemLinkPlan.toString().replace('    SystemLinkPlanProgressMemoryStage("after_portable_source_bundle_cid")\n    CompilerWorldSourceRawBytesCidBorrowed()\n    SystemLinkPlanProgressMemoryStage("after_portable_entry_source_cid")', '    SystemLinkPlanProgressMemoryStage("after_portable_entry_source_cid")\n    CompilerWorldSourceRawBytesCidBorrowed()\n    SystemLinkPlanProgressMemoryStage("after_portable_source_bundle_cid")'))};
assert.throws(() => assertCidSourcePhaseContract(portableMemoryTraceReordered), /memory trace/);
const portableBindingReparses = {...phaseContract, compilerCsg: Buffer.from(phaseContract.compilerCsg.toString().replace("SystemLinkPlanPortableSourceBindingValidateRebuiltTextsInto", "SystemLinkPlanPortableSourceBindingFromTextsInto"))};
assert.throws(() => assertCidSourcePhaseContract(portableBindingReparses), /portable binding|reparsed immutable source imports/);
const traceWhitelistMissing = {...phaseContract, compilerCsg: Buffer.from(phaseContract.compilerCsg.toString().replace('if stage == "after_binding_import_rebuild": return true', 'if stage == "after_binding_import_rebuild_missing": return true'))};
assert.throws(() => assertCidSourcePhaseContract(traceWhitelistMissing), /trace whitelist/);
const csgNoImmutableCheck = {...phaseContract, compilerCsg: Buffer.from(phaseContract.compilerCsg.toString().replace("    CompilerCsgVerifyImmutableSourceIdentity()\n", ""))};
assert.throws(() => assertCidSourcePhaseContract(csgNoImmutableCheck), /CompilerCsgVerifyImmutableSourceIdentity/);
const driverReordered = {...phaseContract, backendDriver: Buffer.from(`fn BackendDriverDispatchMinRunSystemLinkExecConcretePlanAfterSourceBundle(plan: Plan): int32 =
    BuildCompilerCsgConsumePortableReceiptWithOverridesInto()
    SystemLinkExecSourceBundleReceiptCaptureInto()
`)};
assert.throws(() => assertCidSourcePhaseContract(driverReordered), /CSG consume must follow/);

const modules = [
  {modulePath: "pkg/empty", bytes: Buffer.alloc(0)},
  {modulePath: "pkg/main", bytes: Buffer.from("import pkg/empty\nfn main(): int32 = 0\n")},
] as const;

const source = buildPortableSourceIdentity("pkg", "pkg/main", modules);
assert.deepEqual(source, {
  sourceSnapshotCount: 2,
  importEdgeCount: 1,
  unresolvedImportCount: 0,
  sourcePackageIdCid: "bda70843eb170bf9392f625cc0384668c99e0fc6a8bcbcd341f54114288a273b",
  entryModulePathCid: "ffdf372f08faa5cc01acae7bc2ab29323fc3e97328c879c8e82608ed08fa3d01",
  sourceBundleCid: "91190b10afb533b9b7a1e85728d7ff21826aa826197b20896f413c6b4f54ce94",
  entrySourceCid: "68495a2fdc1a4c0e2478f77b8495088027271afdcac0aa38934ef37323f8ca9e",
  importGraphCid: "07d22a1a6297bce8303a451ed98f043277b84e5b47157825e6076a1e3b3e387e",
  receiptCid: "0e7cfc9883965adb3850d45f18896986749b056d9cacad8efac38ef0617d08e1",
});
const zeroEntrySource = buildPortableSourceIdentity("pkg", "pkg/zero-entry", [{modulePath: "pkg/zero-entry", bytes: Buffer.alloc(0)}]);
assert.equal(zeroEntrySource.sourceSnapshotCount, 1);
assert.equal(zeroEntrySource.importEdgeCount, 0);
assert.equal(zeroEntrySource.entrySourceCid, "91a7a1856deffb140e3fdc5f2316366f4e38e32fbbbb14f12892c98c05a11bd9");
assert.notEqual(zeroEntrySource.receiptCid, source.receiptCid);
assert.throws(
  () => buildPortableSourceIdentity("pkg", "pkg/main", [
    {modulePath: "pkg/main", bytes: Buffer.from("fn main(): int32 = 0\n")},
    {modulePath: "pkg/unreachable", bytes: Buffer.alloc(0)},
  ]),
  /entry 可达闭包不完整/,
);

const semantic = buildCompileSemanticReceipt(
  source.receiptCid,
  "11".repeat(32),
  "22".repeat(32),
  "x86_64-unknown-linux-gnu",
  "stage3_local",
  ["pkg/runtime/a", "pkg/runtime/b"],
);
assert.deepEqual(semantic, {
  sourceIdentityReceiptCid: source.receiptCid,
  canonicalCompilerCsgCid: "11".repeat(32),
  canonicalOutputDigest: "22".repeat(32),
  targetTripleCid: "0c2364c55f79d4f574417181ecaea8b8ea50cc9e363967b3b66b7c23069dea3b",
  bootstrapStageCid: "15fdf08176c35b2ca027a7636c4bc8830f0908674ae3a6ca81844e021908aab5",
  orderedProviderSetCid: "c00ee303c8ab634f8705cc68f44eefc8efcef80717ce4cbb2790686a2a6d8f02",
  receiptCid: "9632af784cbe4735a425b44113719714d3b1e33b1a0ac85c2dab63265432a3aa",
});
assert.equal(
  sourceToCsgBindingSeal(source.receiptCid, semantic.canonicalCompilerCsgCid, semantic.receiptCid),
  "74f29af824a9474e996f8b417c20da0210365123ebd6ea5305d534e2263911ad",
);
const sourceWire = Buffer.from([`source_snapshot_count=${source.sourceSnapshotCount}`, `import_edge_count=${source.importEdgeCount}`, `unresolved_import_count=${source.unresolvedImportCount}`, `source_package_id_cid=${source.sourcePackageIdCid}`, `entry_module_path_cid=${source.entryModulePathCid}`, `source_bundle_cid=${source.sourceBundleCid}`, `entry_source_cid=${source.entrySourceCid}`, `import_graph_cid=${source.importGraphCid}`, `receipt_cid=${source.receiptCid}`].join("\n"));
assert.deepEqual(parsePortableSourceReceipt(sourceWire), source);
assert.throws(() => parsePortableSourceReceipt(Buffer.concat([sourceWire, Buffer.from("\n")])), /无 terminal newline/);
const semanticWire = Buffer.from([`source_identity_receipt_cid=${semantic.sourceIdentityReceiptCid}`, `canonical_compiler_csg_cid=${semantic.canonicalCompilerCsgCid}`, `canonical_output_digest=${semantic.canonicalOutputDigest}`, `target_triple_cid=${semantic.targetTripleCid}`, `bootstrap_stage_cid=${semantic.bootstrapStageCid}`, `ordered_provider_set_cid=${semantic.orderedProviderSetCid}`, `semantic_receipt_cid=${semantic.receiptCid}`].join("\n"));
assert.deepEqual(parseCompileSemanticReceipt(semanticWire), semantic);
assert.throws(() => parseCompileSemanticReceipt(Buffer.concat([semanticWire, Buffer.from("\n")])), /无 terminal newline/);
const proofBindingCid = "55".repeat(32); const fakeEvidence = {packageId: "pkg", evidenceCid: proofBindingCid, legacySourceReceipt: {receiptCid: source.receiptCid}, migratedSourceReceipt: {receiptCid: source.receiptCid}} as never; const fakeCsg = {canonicalGraphCid: proofBindingCid} as never; const fakeSurface = {surfaceCid: proofBindingCid} as never; const fakeProof = {packageId: "pkg", migrationEvidenceCid: proofBindingCid, legacySourceIdentityReceiptCid: source.receiptCid, migratedSourceIdentityReceiptCid: source.receiptCid, baselineGraphCid: proofBindingCid, migratedGraphCid: proofBindingCid, baselineSurfaceCid: proofBindingCid, migratedSurfaceCid: proofBindingCid, baselineSemanticReceiptCid: semantic.receiptCid, migratedSemanticReceiptCid: semantic.receiptCid, baselineSemanticSourceIdentityReceiptCid: semantic.sourceIdentityReceiptCid, migratedSemanticSourceIdentityReceiptCid: semantic.sourceIdentityReceiptCid, baselineSemanticCompilerCsgCid: semantic.canonicalCompilerCsgCid, migratedSemanticCompilerCsgCid: semantic.canonicalCompilerCsgCid, baselineSemanticTargetTripleCid: semantic.targetTripleCid, migratedSemanticTargetTripleCid: semantic.targetTripleCid, target: "x86_64-unknown-linux-gnu", graphEquivalent: 0, exportSurfaceCompatible: 0, semanticEquivalent: 0, equivalenceKind: "incompatible"} as never;
assert.throws(() => verifyMigrationProofBindings(fakeProof, fakeEvidence, fakeCsg, fakeCsg, fakeSurface, fakeSurface, semantic, semantic), /production proof 不等价/);
const targetMutantProof = {...fakeProof, target: "aarch64-unknown-linux-gnu", graphEquivalent: 1, exportSurfaceCompatible: 1, semanticEquivalent: 1, equivalenceKind: "canonical_semantic_identity"} as never;
assert.throws(() => verifyMigrationProofBindings(targetMutantProof, fakeEvidence, fakeCsg, fakeCsg, fakeSurface, fakeSurface, semantic, semantic), /predecessors\/target/);

const byteMutant = buildPortableSourceIdentity("pkg", "pkg/main", [modules[0], {...modules[1], bytes: Buffer.from("import pkg/empty\nfn main(): int32 = 1\n")}]);
assert.notEqual(byteMutant.receiptCid, source.receiptCid, "源码字节变异必须改变 source receipt");
assert.throws(
  () => buildCompileSemanticReceipt(source.receiptCid, "11".repeat(32), "22".repeat(32), "x86_64-unknown-linux-gnu", "stage3_local", ["pkg/runtime/b", "pkg/runtime/a"]),
  /非 canonical 排序/,
);
assert.throws(
  () => buildCompileSemanticReceipt(source.receiptCid, "11".repeat(32), "22".repeat(32), "x86_64-unknown-linux-gnu", "stage3_local", ["pkg/runtime/a", "pkg/runtime/a"]),
  /重复/,
);
assert.throws(() => assertUnversionedCidBytes(Buffer.from("schema=cheng.cid.identity_chain.v1\n"), "negative old bytes"), /拒绝版本碎片/);
assert.throws(() => parseEvidenceManifest(Buffer.from("{}\n")), CidOracleError);
assert.throws(() => parseEvidenceManifest(Buffer.from("{ \"schema\":\"cheng.cid.identity_chain.evidence\"}\n")), /未知\/缺失字段|非 canonical/);
assert.equal(canonicalModulePath("pkg:channel/module"), "pkg:channel/module", "普通 segment colon 应合法");
assert.throws(() => canonicalModulePath("C:/workspace/module"), /非 canonical/);
assert.throws(() => canonicalModulePath("pkg/module\tname"), /非 canonical/);

const payloadIndexRaw = Buffer.from("{\"schema\":\"cheng.cid.case_payload_index\"}\n"); const payloadRaw = Buffer.from([0, 1, 2, 3]); const payloadTar = canonicalUstar([["case-index.json", payloadIndexRaw], ["payload.bin", payloadRaw]]); const expectedPayloadFiles = new Map([["case-index.json", payloadIndexRaw], ["payload.bin", payloadRaw]]);
assert.deepEqual([...canonicalUstarFiles(payloadTar, "unit USTAR").keys()], ["case-index.json", "payload.bin"]);
assert.doesNotThrow(() => assertCanonicalUstarFilesEqual(payloadTar, expectedPayloadFiles, "unit USTAR"));
assert.throws(() => assertCanonicalUstarFilesEqual(payloadTar, new Map([["case-index.json", payloadIndexRaw]]), "unit USTAR unbound"), /unbound\/missing/);
assert.throws(() => assertCanonicalUstarFilesEqual(payloadTar, new Map([["case-index.json", payloadIndexRaw], ["payload.bin", Buffer.from([0, 1, 2, 4])]]), "unit USTAR raw mutation"), /raw payload mismatch/);
const headerMutation = Buffer.from(payloadTar); headerMutation[0] ^= 1;
assert.throws(() => canonicalUstarFiles(headerMutation, "unit USTAR header mutation"), /checksum/);
const layerCandidate = Buffer.from([0x7f, 0x45, 0x4c, 0x46]); const layerRunner = Buffer.from("#!/bin/sh\nexit 0\n"); const caseLayer = canonicalCaseImageLayer(layerCandidate, layerRunner); const layerMembers = canonicalCaseImageLayerMembers(caseLayer, "unit case image layer");
assert.deepEqual([...layerMembers.keys()], ["cheng-cid", "cheng-cid/candidate", "cheng-cid/run-case"]);
assert.equal(layerMembers.get("cheng-cid")?.mode, 0o755); assert(layerMembers.get("cheng-cid/candidate")?.raw.equals(layerCandidate)); assert(layerMembers.get("cheng-cid/run-case")?.raw.equals(layerRunner));
const layerOwnerMutation = Buffer.from(caseLayer); layerOwnerMutation.write("0000001\0", 108, "ascii"); layerOwnerMutation.fill(0x20, 148, 156); const layerOwnerChecksum = layerOwnerMutation.subarray(0, 512).reduce((sum, byte) => sum + byte, 0); layerOwnerMutation.write(`${layerOwnerChecksum.toString(8).padStart(6, "0")}\0 `, 148, "ascii");
assert.throws(() => canonicalCaseImageLayerMembers(layerOwnerMutation, "unit case image owner mutation"), /metadata/);
const builderImageId = `sha256:${"11".repeat(32)}`; const caseImageId = `sha256:${"22".repeat(32)}`;
assert.doesNotThrow(() => assertCidExecutionImageLineage(builderImageId, builderImageId, caseImageId));
assert.throws(() => assertCidExecutionImageLineage(builderImageId, builderImageId, builderImageId), /builder\/case image lineage/);
assert.throws(() => assertCidExecutionImageLineage(builderImageId, caseImageId, caseImageId), /counterexample is not bound to builder image/);
assert.throws(() => assertCidExecutionImageLineage("sha256:bad", builderImageId, caseImageId), /builder image id invalid/);
const builderImageManifestRaw = Buffer.from("[builder-image-inspect]\n");
const imageEvidence = verifyCidExecutionImageEvidence({
  builderImageId,
  counterexampleImageId: builderImageId,
  caseImageId,
  builderImageManifestRaw,
  counterexampleImageManifestRaw: Buffer.from(builderImageManifestRaw),
});
assert.deepEqual(imageEvidence, {builderImageId, caseImageId});
assert.throws(() => verifyCidExecutionImageEvidence({
  builderImageId,
  counterexampleImageId: caseImageId,
  caseImageId,
  builderImageManifestRaw,
  counterexampleImageManifestRaw: Buffer.from(builderImageManifestRaw),
}), /counterexample is not bound to builder image/);
assert.throws(() => verifyCidExecutionImageEvidence({
  builderImageId,
  counterexampleImageId: builderImageId,
  caseImageId,
  builderImageManifestRaw,
  counterexampleImageManifestRaw: Buffer.from("[case-image-inspect]\n"),
}), /builder image raw identity/);
const requiredIdentityToolPaths = new Set(CID_REQUIRED_IDENTITY_TOOLS);
for (const required of [
  "tools/cid_linux_identity_chain_evidence_producer.py",
  "tools/cid_linux_identity_chain_evidence_schema.py",
]) {
  assert(requiredIdentityToolPaths.has(required), `required identity tool missing: ${required}`);
  const sourceDeletion = new Set(requiredIdentityToolPaths); sourceDeletion.delete(required);
  assert.throws(() => assertCidRequiredIdentityTools(sourceDeletion, requiredIdentityToolPaths), /缺正式身份工具/);
  const evidenceDeletion = new Set(requiredIdentityToolPaths); evidenceDeletion.delete(required);
  assert.throws(() => assertCidRequiredIdentityTools(requiredIdentityToolPaths, evidenceDeletion), /缺正式身份工具/);
}
assert.doesNotThrow(() => assertCidRequiredIdentityTools(requiredIdentityToolPaths, requiredIdentityToolPaths));

const emptySha = sha256(Buffer.alloc(0)); let artifactIndex = 0;
const officialEntryPath =
  "src/core/tooling/backend_driver_dispatch_min.cheng";
const officialEntryModulePath = CID_OFFICIAL_ENTRY_SPECS[officialEntryPath];
const officialEntrySha256 = "61".repeat(32);
assert.deepEqual(CID_OFFICIAL_ENTRY_SPECS, {
  "src/core/tooling/backend_driver_dispatch_min.cheng":
    "cheng/core/tooling/backend_driver_dispatch_min",
  "src/core/tooling/backend_driver_main.cheng":
    "cheng/core/tooling/backend_driver_main",
});
const artifact = () => ({path: `artifacts/raw-${artifactIndex++}`, raw_byte_length: 0, sha256: emptySha});
const kinds = ["zero_byte_import", "source_bundle_entry", "source_csg_binding", "csg_atomic_consume", "migration_cross_root_fixed_point", "mirror_atomic_install"] as const;
const zeroRoles = requiredCidEvidenceRoles("zero_byte_import");
for (const role of ["zero_entry_source", "zero_entry_source_receipt", "zero_entry_stdout", "zero_entry_stderr", "zero_entry_trace"]) assert.equal(zeroRoles.filter((candidate) => candidate === role).length, 1, `zero entry evidence role ${role}`);
const consumeRoles = requiredCidEvidenceRoles("csg_atomic_consume");
for (const role of ["consume_first_graph_before", "consume_first_graph_after", "consume_second_graph_before", "consume_second_graph_after", "consume_rehash_graph_before", "consume_rehash_graph_after", "consume_first_stdout", "consume_first_stderr", "consume_second_stdout", "consume_second_stderr", "consume_rehash_stdout", "consume_rehash_stderr"]) assert.equal(consumeRoles.filter((candidate) => candidate === role).length, 1, `consume evidence role ${role}`);
const mirrorRoles = requiredCidEvidenceRoles("mirror_atomic_install");
for (const role of ["mirror_conflict_tree", "mirror_tampered_tree", "mirror_conflict_stdout", "mirror_conflict_stderr", "mirror_tamper_stdout", "mirror_tamper_stderr"]) assert.equal(mirrorRoles.filter((candidate) => candidate === role).length, 1, `mirror evidence role ${role}`);
const cgroupRun = () => ({artifacts: Object.fromEntries(CID_CGROUP_ARTIFACT_ROLES.map((role) => [role, artifact()]))});
const moduleRef = () => ({module_path: "pkg/main", source: artifact()});
const projection = {
  candidate: artifact(),
  candidate_entry_path: officialEntryPath,
  candidate_entry_module_path: officialEntryModulePath,
  candidate_entry_sha256: officialEntrySha256,
  candidate_build: cgroupRun(),
  cases: kinds.map((kind, index) => ({
    artifacts: Object.fromEntries(requiredCidEvidenceRoles(kind).map((role) => [role, artifact()])), bootstrap_stage: "stage3_local", case_id: `case-${index}`,
    entry_module_path: "pkg/main", kind, legacy_modules: kind === "migration_cross_root_fixed_point" || kind === "mirror_atomic_install" ? [moduleRef()] : [], migrated_modules: kind === "migration_cross_root_fixed_point" || kind === "mirror_atomic_install" ? [moduleRef()] : [], modules: kind === "migration_cross_root_fixed_point" ? [] : [moduleRef()], package_id: "pkg", providers: ["pkg/runtime"], root_b_legacy_modules: kind === "migration_cross_root_fixed_point" || kind === "mirror_atomic_install" ? [moduleRef()] : [], root_b_migrated_modules: kind === "migration_cross_root_fixed_point" || kind === "mirror_atomic_install" ? [moduleRef()] : [], target: "x86_64-unknown-linux-gnu",
  })),
  cgroup_counterexample: cgroupRun(), evidence_kind: "production", image_build_receipt: artifact(), image_config: artifact(), image_final_layer: artifact(), image_final_layer_gzip: artifact(), image_manifest: artifact(), image_oci_manifest: artifact(), mutation_replay: artifact(), schema: "cheng.cid.identity_chain.evidence", source_files: [{logical_path: "src/main.cheng", artifact: artifact()}], source_manifest: artifact(), tool_files: [{logical_path: "tools/gate.py", artifact: artifact()}], tool_manifest: artifact(),
};
const evidenceBytes = (value: Record<string, unknown>) => {
  const manifestSha = sha256(Buffer.from(canonicalJson(value)));
  return Buffer.from(canonicalJson({...value, manifest_sha256: manifestSha}) + "\n");
};
const dispatchEntryManifest =
  parseEvidenceManifest(evidenceBytes(projection));
const mainEntry = structuredClone(projection);
mainEntry.candidate_entry_path =
  "src/core/tooling/backend_driver_main.cheng";
mainEntry.candidate_entry_module_path =
  "cheng/core/tooling/backend_driver_main";
const mainEntryManifest = parseEvidenceManifest(evidenceBytes(mainEntry));
assert.notEqual(
  dispatchEntryManifest.manifest_sha256,
  mainEntryManifest.manifest_sha256,
);
const missingEntry = structuredClone(projection) as Record<string, unknown>; delete missingEntry.candidate_entry_path;
assert.throws(() => parseEvidenceManifest(evidenceBytes(missingEntry)), /未知\/缺失字段/);
const thirdEntry = structuredClone(projection); thirdEntry.candidate_entry_path = "src/core/tooling/backend_driver_other.cheng"; thirdEntry.candidate_entry_module_path = "cheng/core/tooling/backend_driver_other";
assert.throws(() => parseEvidenceManifest(evidenceBytes(thirdEntry)), /两个官方 entry/);
const entryModuleDrift = structuredClone(projection); entryModuleDrift.candidate_entry_module_path = "cheng/core/tooling/backend_driver_main";
assert.throws(() => parseEvidenceManifest(evidenceBytes(entryModuleDrift)), /entry module\/path/);
const legacyMutationField = structuredClone(projection) as Record<string, unknown>; legacyMutationField.mutation_report = legacyMutationField.mutation_replay; delete legacyMutationField.mutation_replay;
assert.throws(() => parseEvidenceManifest(evidenceBytes(legacyMutationField)), /未知\/缺失字段/);
const zeroArtifactSha = structuredClone(projection); zeroArtifactSha.candidate.sha256 = "0".repeat(64);
assert.throws(() => parseEvidenceManifest(evidenceBytes(zeroArtifactSha)), /非法 SHA-256/);
const aliasedRole = structuredClone(projection); aliasedRole.cases[0].artifacts.stderr.path = aliasedRole.cases[0].artifacts.stdout.path;
assert.throws(() => parseEvidenceManifest(evidenceBytes(aliasedRole)), /artifact path role alias/);
const missingRole = structuredClone(projection); delete (missingRole.cases[0].artifacts as Record<string, unknown>).stderr;
assert.throws(() => parseEvidenceManifest(evidenceBytes(missingRole)), /role 集不精确/);
const symlinkRoot = mkdtempSync(join(tmpdir(), "cheng-cid-symlink-mutant-")); mkdirSync(join(symlinkRoot, "artifacts")); const targetPath = join(symlinkRoot, "candidate-target"); writeFileSync(targetPath, Buffer.alloc(0)); symlinkSync(targetPath, join(symlinkRoot, projection.candidate.path)); writeFileSync(join(symlinkRoot, "evidence.json"), evidenceBytes(projection));
assert.throws(() => verifyCidEvidence(join(symlinkRoot, "evidence.json")), /symlink/);

assert.throws(() => verifyLinuxMemoryReceipt(Buffer.from("schema=beat_c_linux_cgroup_v2_hard_memory_gate\nmemory_limit_bytes=1073741824\n"), "partial receipt mutant", "workload"), /字段顺序|字段.*canonical|字段.*集合/);
assert.throws(() => verifyLinuxMemoryReceipt(Buffer.from("schema=beat_c_linux_cgroup_v2_hard_memory_gate.v1\n"), "versioned receipt mutant", "workload"), /字段顺序|当前无版本/);

const framedStringsSha256 = (values: readonly string[]): string => {
  const chunks: Buffer[] = [];
  for (const value of values) {
    const raw = Buffer.from(value);
    const length = Buffer.alloc(8);
    length.writeBigUInt64BE(BigInt(raw.length));
    chunks.push(length, raw);
  }
  return sha256(Buffer.concat(chunks));
};
const controllerCaseId = "zero-byte-import";
const controllerCandidateSha = "ab".repeat(32);
const controllerArgv = cidCaseTargetArgv(
  controllerCaseId,
  controllerCandidateSha,
);
assert.deepEqual(controllerArgv, [
  CID_CURRENT_DRIVER_CONTAINER_PATH,
  CID_CURRENT_DRIVER_RUN_CASE_COMMAND,
  controllerCaseId,
  controllerCandidateSha,
]);
const descriptor = new Map<string, string>([
  ["schema", "cheng.backend2.current_source_native_executor"],
  ["status", "CONFIGURED"],
  ["host_os", "linux"],
  ["execution_environment", "controlled_cgroup_v2"],
  ["target", "x86_64-unknown-linux-gnu"],
  ["machine", "x86_64"],
  ["image_id", `sha256:${"cd".repeat(32)}`],
  ["worker_path_in_image_fshex",
    Buffer.from(CID_CURRENT_DRIVER_CONTAINER_PATH).toString("hex")],
  ["worker_sha256", controllerCandidateSha],
  ["source_closure_cid", "12".repeat(32)],
  ["source_closure_capture_sha256", "34".repeat(32)],
  ["candidate_build_receipt_path_fshex",
    Buffer.from("/cheng-current/build.receipt").toString("hex")],
  ["candidate_build_receipt_sha256", "56".repeat(32)],
  ["candidate_entry_path", officialEntryPath],
  ["candidate_entry_module_path", officialEntryModulePath],
  ["candidate_entry_sha256", officialEntrySha256],
  ["controller_host_os", "darwin"],
  ["controller_host_machine", "x86_64"],
  ["controller_host_translated", "false"],
  ["native_execution_proof",
    "controller_guest_same_isa_and_guest_cpuinfo_no_qemu_tcg"],
  ["native_execution", "true"],
  ["emulation", "false"],
  ["target_argv_encoding", "be64_length_utf8_sequence"],
  ["target_argv_count", String(controllerArgv.length)],
  ["target_argv_sha256", framedStringsSha256(controllerArgv)],
  ["target_env_encoding", "be64_length_utf8_sequence"],
  ["target_env_count", "5"],
  ["target_env_sha256", "78".repeat(32)],
  ["cgroup_producer_sha256", "9a".repeat(32)],
  ["cgroup_validator_sha256", "bc".repeat(32)],
  ["cgroup_version", "2"],
  ["cgroup_mount_type", "cgroup2"],
  ["memory_enforcement_scope", "container_and_all_descendants"],
  ["memory_max_bytes", "1073741824"],
  ["memory_swap_max_bytes", "0"],
  ["memory_and_swap_total_limit_bytes", "1073741824"],
  ["backend_count", "2"],
  ["backend.0.name", "primary"],
  ["backend.1.name", "backend2"],
  ["descriptor_payload_sha256", "de".repeat(32)],
]);
const descriptorReceipt = new Map<string, string>();
for (const [key, value] of descriptor) {
  descriptorReceipt.set(
    key === "descriptor_payload_sha256"
      ? "native_descriptor_payload_sha256"
      : `native_descriptor_${key}`,
    value,
  );
}
descriptorReceipt.set("current_source_binding_status", "bound_unique_current");
descriptorReceipt.set(
  "current_driver_container_path",
  CID_CURRENT_DRIVER_CONTAINER_PATH,
);
descriptorReceipt.set("current_driver_sha256", controllerCandidateSha);
descriptorReceipt.set("current_entry_path", officialEntryPath);
descriptorReceipt.set("current_entry_module_path", officialEntryModulePath);
descriptorReceipt.set("current_entry_sha256", officialEntrySha256);
descriptorReceipt.set("target_argv_count", String(controllerArgv.length));
descriptorReceipt.set(
  "target_argv_sha256",
  framedStringsSha256(controllerArgv),
);
descriptorReceipt.set("target_env_count", descriptor.get("target_env_count")!);
descriptorReceipt.set(
  "target_env_sha256",
  descriptor.get("target_env_sha256")!,
);
descriptorReceipt.set("image_id", descriptor.get("image_id")!);
descriptorReceipt.set(
  "current_build_receipt_sha256",
  descriptor.get("candidate_build_receipt_sha256")!,
);
descriptorReceipt.set(
  "source_closure_cid",
  descriptor.get("source_closure_cid")!,
);
descriptorReceipt.set(
  "source_closure_capture_sha256",
  descriptor.get("source_closure_capture_sha256")!,
);
assert.doesNotThrow(() =>
  verifyNativeDescriptorReceiptBinding(descriptor, descriptorReceipt));
assert.doesNotThrow(() =>
  verifyCidCaseControllerBinding(
    descriptorReceipt,
    controllerCaseId,
    controllerCandidateSha,
    officialEntryPath,
    officialEntryModulePath,
    officialEntrySha256,
  ));
const oldControllerReceipt = new Map(descriptorReceipt);
oldControllerReceipt.set(
  "target_argv_sha256",
  framedStringsSha256([
    "/cheng-cid/run-case",
    controllerCaseId,
    controllerCandidateSha,
    officialEntryPath,
    officialEntryModulePath,
    officialEntrySha256,
  ]),
);
assert.throws(
  () => verifyCidCaseControllerBinding(
    oldControllerReceipt,
    controllerCaseId,
    controllerCandidateSha,
    officialEntryPath,
    officialEntryModulePath,
    officialEntrySha256,
  ),
  /driver-owned run-case/,
);
const controllerEntryDrift = new Map(descriptorReceipt);
controllerEntryDrift.set("current_entry_sha256", "f1".repeat(32));
assert.throws(
  () => verifyCidCaseControllerBinding(
    controllerEntryDrift,
    controllerCaseId,
    controllerCandidateSha,
    officialEntryPath,
    officialEntryModulePath,
    officialEntrySha256,
  ),
  /driver-owned run-case/,
);
const descriptorEntryDrift = new Map(descriptorReceipt);
descriptorEntryDrift.set(
  "native_descriptor_candidate_entry_sha256",
  "f2".repeat(32),
);
assert.throws(
  () => verifyNativeDescriptorReceiptBinding(
    descriptor,
    descriptorEntryDrift,
  ),
  /candidate_entry_sha256/,
);
const descriptorHashDrift = new Map(descriptorReceipt);
descriptorHashDrift.set(
  "native_descriptor_target_argv_sha256",
  "ef".repeat(32),
);
assert.throws(
  () => verifyCidCaseControllerBinding(
    descriptorHashDrift,
    controllerCaseId,
    controllerCandidateSha,
    officialEntryPath,
    officialEntryModulePath,
    officialEntrySha256,
  ),
  /driver-owned run-case/,
);
const descriptorReceiptDrift = new Map(descriptorReceipt);
descriptorReceiptDrift.set(
  "native_descriptor_candidate_build_receipt_sha256",
  "f0".repeat(32),
);
assert.throws(
  () => verifyNativeDescriptorReceiptBinding(
    descriptor,
    descriptorReceiptDrift,
  ),
  /descriptor\/receipt candidate_build_receipt_sha256/,
);

const compileProviders = ["pkg/runtime/a", "pkg/runtime/b"];
const compileFields = {world: "33".repeat(32), source: source.receiptCid, semantic: semantic.receiptCid, output: "44".repeat(32), canonical: semantic.canonicalOutputDigest, target: "x86_64-unknown-linux-gnu", stage: "stage3_local"};
const compileCid = encoding.hashParts([encoding.framedText("cheng.compiler.compile_receipt"), encoding.framedFixed32(compileFields.world, "world"), encoding.framedFixed32(compileFields.source, "source"), encoding.framedFixed32(compileFields.semantic, "semantic"), encoding.framedFixed32(compileFields.output, "output"), encoding.framedFixed32(compileFields.canonical, "canonical"), encoding.framedText(compileFields.target), encoding.framedText(compileFields.stage), encoding.framedU32(compileProviders.length, "provider_count"), ...compileProviders.map((provider) => encoding.framedText(provider))]);
const compileWire = Buffer.from([`world_head_cid=${compileFields.world}`, `source_identity_receipt_cid=${compileFields.source}`, `semantic_receipt_cid=${compileFields.semantic}`, `target=${compileFields.target}`, `output_raw_sha256=${compileFields.output}`, `canonical_output_sha256=${compileFields.canonical}`, `bootstrap_stage=${compileFields.stage}`, `runtime_provider_count=${compileProviders.length}`, `receipt_cid=${compileCid}`, ...compileProviders.map((provider, index) => `runtime_provider[${index}]=${provider}`)].join("\n"));
assert.deepEqual(parseCompileReceipt(compileWire).providers, compileProviders);
assert.throws(() => parseCompileReceipt(Buffer.from(compileWire.toString().replace("runtime_provider[0]", "provider[0]"))), /runtime provider wire/);
assert.throws(() => parseCompileReceipt(Buffer.concat([compileWire, Buffer.from("\n")])), /canonical wire/);

const mutationRoutes = [
  ["byte", "source_entry_byte"], ["length", "source_entry_length"], ["kind", "csg_node_kind"], ["package", "source_package_id"], ["module", "csg_module_path"], ["entry", "source_entry_module"], ["count", "source_receipt_count"], ["order", "source_receipt_field_order"], ["edge", "source_import_edge"], ["csg", "semantic_csg_binding"], ["provider", "semantic_provider_set"], ["target", "semantic_target"], ["migration_mapping", "migration_unit_mapping"], ["proof", "migration_proof_binding"], ["manifest", "universe_manifest_entry"], ["mirror_path", "mirror_module_path"], ["world_lock", "world_head_manifest_lock"], ["external_payload", "mirror_external_payload"], ["source_root_relocation", "migration_cross_root_source"], ["mirror_root_relocation", "mirror_cross_root_bundle"], ["canonical_input_permutation", "source_module_permutation"],
] as const;
const mutationTools = {oracle: sha256(Buffer.from("oracle")), evidence: sha256(Buffer.from("evidence")), cli: sha256(Buffer.from("cli"))};
const mutationProjection = {candidate_sha256: sha256(Buffer.from("candidate")), cli_sha256: mutationTools.cli, evidence_sha256: mutationTools.evidence, oracle_sha256: mutationTools.oracle, rows: mutationRoutes.map(([category, oracle_route], index) => ({category, expected_relation: index < 18 ? "reject" : "same_cid", id: `mutation-${category}`, oracle_route})), schema: "cheng.cid.mutation_replay"};
const mutationRaw = Buffer.from(canonicalJson({...mutationProjection, manifest_sha256: sha256(Buffer.from(canonicalJson(mutationProjection)))}) + "\n");
assert.doesNotThrow(() => assertMutationReplayRecipe(mutationRaw, mutationProjection.candidate_sha256, mutationTools));
assert.throws(() => assertMutationReplayRecipe(mutationRaw, mutationProjection.candidate_sha256, {...mutationTools, evidence: "11".repeat(32)}), /oracle\/evidence\/CLI raw bytes binding/);
const mutationRouteTamper = structuredClone(mutationProjection); mutationRouteTamper.rows[0].oracle_route = "claimed_exit_code";
assert.throws(() => assertMutationReplayRecipe(Buffer.from(canonicalJson({...mutationRouteTamper, manifest_sha256: sha256(Buffer.from(canonicalJson(mutationRouteTamper)))}) + "\n")), /非冻结 recipe/);
assert.throws(() => assertMutationReplayRecipe(Buffer.from("destructive_kill_percent=100\npreserving_false_red_count=0")), /JSON/);

if (process.env.CHENG_FUSION_CID_UNIT_ONLY === "1") {
  console.log("item29 CID oracle unit/mutation vectors: PASS (production evidence 未判定)");
} else {
  const manifest = process.env.CHENG_FUSION_CID_EVIDENCE;
  if (!manifest) throw new Error("CID_RED: 缺 CHENG_FUSION_CID_EVIDENCE，六例真实原始证据未接入");
  const result = verifyCidEvidence(manifest);
  assert.equal(result.status, "CID_GREEN_CANDIDATE");
  console.log(`item29 CID identity chain: PASS manifest=${result.manifestSha256} candidate=${result.candidateSha256}`);
}
