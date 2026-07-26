// line_map 唯一协议与 source function span parser 回归。
// .cheng 只解析当前源；显式 .map 只解析 canonical map，禁止按 mtime 双读或回退。
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {startMcp, assertTrue} from "./mcp_client.ts";
import {
  assertLineMapReportSchema,
  parseLineMapReport,
} from "../src/cheng_toolkit_m9000.ts";

const CHENG_ROOT = realpathSync(process.env.CHENG_TOOLCHAIN_ROOT || process.env.CHENG_ROOT || "/Users/lbcheng/cheng-lang");

function createFixtureProject() {
  let root = mkdtempSync(join(tmpdir(), "fusion-harness-item4-"));
  root = realpathSync(root);
  writeFileSync(join(root, "cheng-package.toml"), `package_id = "pkg://local/fusion-harness-item4"\n`);
  mkdirSync(join(root, "src"), {recursive: true});
  writeFileSync(join(root, "src", "big.cheng"), `fn RealFnInSource(): int32 =\n    return 7\nfn main(): int32 =\n    return RealFnInSource()\n`);
  return root;
}

function sidecarText(sourcePath: string) {
  return [
    "cheng_line_map",
    "entry_count=1",
    `entry\tSidecarSentinelFn\tSidecarSentinelFn\t${sourcePath}\t1\t2\t2\tfunction_name=SidecarSentinelFn\tmodule_path=${sourcePath}`,
    "",
  ].join("\n");
}

function semanticLineMapText(sourcePath: string) {
  const cid = "0".repeat(64);
  return [
    "cheng_line_map",
    "source_version=1",
    `semantic_snapshot_cid=${cid}`,
    `binding_receipt_cid=${cid}`,
    `world_head_cid=${cid}`,
    `compiler_cid=${cid}`,
    `source_bundle_cid=${cid}`,
    `csg_root_cid=${cid}`,
    `validation_receipt_cid=${cid}`,
    `debug_projection_cid=${cid}`,
    `declaration_table_cid=${cid}`,
    `declaration_identity_cid=${cid}`,
    `object_cid=${cid}`,
    `object_structure_cid=${cid}`,
    `debug_map_cid=${cid}`,
    "text_section_index=0",
    "text_section_file_offset=1",
    "text_section_byte_length=1",
    "entry_count=1",
    "location_count=1",
    `entry\tfunction_id=0\tfunction_symbol_id=0\tfunction_decl_id=0\tfunction_decl_key_cid=${cid}\tfunction_symbol_cid=${cid}\tobject_section_index=0\tpc_start=0\tpc_end_exclusive=1\tobject_file_byte_start=1\tobject_file_byte_end_exclusive=2\tsymbol_bytes_cid=${cid}\tsource_id=0\tdocument_cid=${cid}\tdeclaration_span_id=0\tbody_span_id=0\tbody_start_line=1\tbody_start_column=0\tbody_end_line=1\tbody_end_column=1\tfunction_name=SemanticFn\tmodule_path=${sourcePath}`,
    `location\tdebug_op_id=0\tfunction_id=0\tfunction_symbol_id=0\tfunction_decl_id=0\tfunction_decl_key_cid=${cid}\tfunction_symbol_cid=${cid}\tpc_start=0\tpc_end_exclusive=1\tobject_file_byte_start=1\tobject_file_byte_end_exclusive=2\tbytes_cid=${cid}\ttyped_node_id=0\ttyped_ir_node_index=0\tsource_id=0\tspan_id=0\tdocument_cid=${cid}\tstart_line=1\tstart_column=0\tend_line=1\tend_column=1\tmodule_path=${sourcePath}`,
    "",
  ].join("\n");
}

function exactLspLineMapReport(sourcePath: string, modulePath: string) {
  const cid = "1".repeat(64);
  const zeroCid = "0".repeat(64);
  const exactReceipt = {
    chengSourceVersion: 1,
    chengSemanticSnapshotCid: cid,
    chengBindingReceiptCid: cid,
    chengCsgRootCid: cid,
    chengQueryProjectionCid: cid,
    chengQueryIndexCid: cid,
    chengDeclarationTableCid: cid,
    chengCompilerFactProjectionCid: cid,
    chengSnapshotRejected: false,
    chengFailureDiagnosticRootCid: zeroCid,
    chengFailureCargoCid: zeroCid,
    chengFailureAdmissionReceiptCid: zeroCid,
  };
  const functionRecord = {
    functionId: 0,
    typedFunctionIndex: 0,
    functionDeclId: 0,
    functionSymbolId: 0,
    sourceId: 0,
    declarationSpanId: 0,
    bodySpanId: 1,
    documentCid: cid,
    functionDeclKeyCid: cid,
    functionSymbolCid: cid,
    interfaceCid: cid,
    fragmentCid: cid,
    modulePath,
    functionName: "main",
    qualifiedName: `${modulePath}.main`,
    bodyStartByte: 0,
    bodyEndByte: 8,
    bodyStartLine: 0,
    bodyStartColumn: 0,
    bodyEndLine: 0,
    bodyEndColumn: 8,
    threadBoundary: false,
  };
  const locationRecord = {
    debugOpId: 0,
    typedNodeId: 0,
    typedIrNodeIndex: 0,
    originParserNodeId: 0,
    syntheticOriginKind: 0,
    spanAuthorityKind: 1,
    functionId: 0,
    functionDeclId: 0,
    functionSymbolId: 0,
    symbolDeclId: -1,
    symbolId: -1,
    sourceId: 0,
    spanId: 0,
    opKind: 1,
    typedOpKind: 1,
    typeId: -1,
    ownershipKind: 1,
    documentCid: cid,
    functionDeclKeyCid: cid,
    functionSymbolCid: cid,
    symbolDeclKeyCid: zeroCid,
    symbolCid: zeroCid,
    modulePath,
    startByte: 0,
    endByte: 1,
    startLine: 0,
    startColumn: 0,
    endLine: 0,
    endColumn: 1,
  };
  return {
    schema: "cheng_line_map",
    source: sourcePath,
    sourceVersion: 1,
    semanticSnapshotCid: cid,
    bindingReceiptCid: cid,
    csgRootCid: cid,
    declarationTableCid: cid,
    debugProjectionCid: cid,
    documentCid: cid,
    entryCount: 1,
    functionCount: 1,
    locationCount: 1,
    syntheticCount: 0,
    functions: [functionRecord],
    locations: [locationRecord],
    syntheticLocations: [],
    ...exactReceipt,
  };
}

async function main() {
  const root = createFixtureProject();
  const sourcePath = join(root, "src", "big.cheng");
  const sidecarPath = `${sourcePath}.map`;
  try {
    console.log("[0] production parser 精确接受 canonical 完整记录并拒绝旧 schema");
    {
      const expectedSource = {expectedModulePath: sourcePath};
      const parsed = parseLineMapReport(Buffer.from(sidecarText(sourcePath), "utf8"), sourcePath, expectedSource);
      assertTrue(parsed.schema === "cheng_line_map" && parsed.functionCount === 1, "canonical line-map 完整记录解析成功");
      const semantic = parseLineMapReport(Buffer.from(semanticLineMapText(sourcePath), "utf8"), sourcePath, expectedSource);
      assertTrue(semantic.schema === "cheng_line_map" && semantic.functions[0]?.funcName === "SemanticFn", "canonical semantic line-map 完整 header/entry/location 解析成功");
      const exactLsp = exactLspLineMapReport(sourcePath, "pkg/main");
      assertLineMapReportSchema(exactLsp, {expectedSource: sourcePath});
      let crossSourceRejected = false;
      try {
        assertLineMapReportSchema(exactLsp, {
          expectedSource: `${sourcePath}.same-content-other-source`,
        });
      } catch {
        crossSourceRejected = true;
      }
      assertTrue(
        crossSourceRejected,
        "同内容跨 source path mutation 被 current LSP consumer hard-fail",
      );
      let crossModuleRejected = false;
      try {
        const mutated = structuredClone(exactLsp);
        mutated.functions[0].modulePath = "pkg/same-content-other-module";
        assertLineMapReportSchema(mutated, {expectedSource: sourcePath});
      } catch {
        crossModuleRejected = true;
      }
      assertTrue(
        crossModuleRejected,
        "同内容跨 module identity mutation 被 current LSP consumer hard-fail",
      );
      let legacyRejected = false;
      try {
        parseLineMapReport(Buffer.from(sidecarText(sourcePath).replace("cheng_line_map\n", "cheng_line_map_v1\n"), "utf8"), sourcePath, expectedSource);
      } catch (error) {
        legacyRejected = String(error).includes("unsupported line-map schema");
      }
      assertTrue(legacyRejected, "旧 line-map schema mutation 被 production parser hard-fail");
      for (const [label, mutated] of [
        ["schema prefix", sidecarText(sourcePath).replace("cheng_line_map\n", "cheng_line_map_extra\n")],
        ["missing keyed field", sidecarText(sourcePath).replace(`\tmodule_path=${sourcePath}`, "")],
        ["unexpected keyed field", sidecarText(sourcePath).replace(`\tmodule_path=${sourcePath}`, `\tmodule_path=${sourcePath}\textra=1`)],
        ["semantic missing field", semanticLineMapText(sourcePath).replace("\tend_column=1\tmodule_path=", "\tmodule_path=")],
        ["semantic extra field", semanticLineMapText(sourcePath).replace(`\tmodule_path=${sourcePath}\n`, `\tmodule_path=${sourcePath}\textra=1\n`)],
        ["wrong requested source", sidecarText(sourcePath).replaceAll(sourcePath, `${sourcePath}.other`)],
        ["non LF terminated", sidecarText(sourcePath).slice(0, -1)],
      ] as const) {
        let rejected = false;
        try {
          parseLineMapReport(Buffer.from(mutated, "utf8"), sourcePath, expectedSource);
        } catch {
          rejected = true;
        }
        assertTrue(rejected, `${label} mutation 被 production parser hard-fail`);
      }
    }

    console.log("[A] .cheng 直接走唯一 source function span parser");
    {
      const mcp = startMcp({}, root);
      try {
        await mcp.initialize({rootUri: `file://${root}`, workspaceFolders: [{uri: `file://${root}`, name: "fusion-harness-item4"}]});
        const {isError, parsed} = await mcp.callTool("cheng_line_map_read", {file: "src/big.cheng"});
        assertTrue(isError !== true, `无边车调用未报错, 实得: ${JSON.stringify(parsed).slice(0, 200)}`);
        assertTrue(parsed.cacheHit === false, `无边车时 cacheHit=false, 实得 ${parsed.cacheHit}`);
        assertTrue(parsed.functions?.some((f: any) => f.funcName === "RealFnInSource" || f.functionName === "RealFnInSource"), `结果含真实函数名 RealFnInSource, 实得: ${JSON.stringify(parsed.functions)}`);
      } finally {
        mcp.kill();
      }
    }

    console.log("[B] 显式传 line-map 文件时只解析 canonical map，不和 source parser 双读");
    writeFileSync(sidecarPath, sidecarText(sourcePath));
    {
      const mcp = startMcp({}, root);
      try {
        await mcp.initialize({rootUri: `file://${root}`, workspaceFolders: [{uri: `file://${root}`, name: "fusion-harness-item4"}]});
        const started = Date.now();
        const {isError, parsed} = await mcp.callTool("cheng_line_map_read", {file: "src/big.cheng.map"});
        const elapsedMs = Date.now() - started;
        assertTrue(isError !== true, `显式 map 调用未报错, 实得: ${JSON.stringify(parsed).slice(0, 200)}`);
        assertTrue(parsed.functions?.some((f: any) => f.funcName === "SidecarSentinelFn"), `显式 map 结果来自 canonical map, 实得: ${JSON.stringify(parsed.functions)}`);
        assertTrue(elapsedMs < 2000, `显式 map 解析耗时 <2s, 实得 ${elapsedMs}ms`);
      } finally {
        mcp.kill();
      }
    }

    console.log("[C] 跨行返回类型与长函数体边界回归");
    {
      const mcp = startMcp({}, CHENG_ROOT);
      try {
        await mcp.initialize({rootUri: `file://${CHENG_ROOT}`, workspaceFolders: [{uri: `file://${CHENG_ROOT}`, name: "cheng"}]});
        const lifecycle = await mcp.callTool("cheng_line_map_read", {
          root: CHENG_ROOT,
          file: "src/core/ir/body_ir_lifecycle.cheng",
        });
        assertTrue(lifecycle.isError !== true, `lifecycle source span parser 成功: ${JSON.stringify(lifecycle.parsed).slice(0, 300)}`);
        assertTrue(lifecycle.parsed.entryCount >= 22, `lifecycle 全部顶层函数被节点化, 实得 ${lifecycle.parsed.entryCount}`);
        for (const name of ["BodyIrPayloadRetained", "BodyIrPayloadRelease"]) {
          const fn = lifecycle.parsed.functions.find((entry: any) => entry.funcName === name);
          assertTrue(!!fn, `${name} 未因跨行返回类型漏失`);
          assertTrue(fn.signatureEndLine > fn.sigLine && fn.bodyLine > fn.signatureEndLine && fn.endLine > fn.bodyLine + 20, `${name} 的 signature/body/end 跨度完整: ${JSON.stringify(fn)}`);
        }

        const backend2 = await mcp.callTool("cheng_line_map_read", {
          root: CHENG_ROOT,
          file: "src/core/backend2/backend2_assemble.cheng",
        });
        assertTrue(backend2.isError !== true, `backend2 source span parser 成功: ${JSON.stringify(backend2.parsed).slice(0, 300)}`);
        const assemble = backend2.parsed.functions.find((entry: any) => entry.funcName === "Backend2AssembleInto");
        assertTrue(!!assemble, "Backend2AssembleInto 存在");
        assertTrue(assemble.signatureEndLine > assemble.sigLine && assemble.bodyLine > assemble.signatureEndLine && assemble.endLine > assemble.bodyLine + 100, `Backend2AssembleInto 长函数尾边界完整: ${JSON.stringify(assemble)}`);
      } finally {
        mcp.kill();
      }
    }
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
  console.log("item4 line_map sidecar: PASS");
}

main().catch((error) => {
  console.error("item4 line_map sidecar: FAIL", error);
  process.exit(1);
});
