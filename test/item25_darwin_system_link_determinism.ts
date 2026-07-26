#!/usr/bin/env bun
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import {tmpdir} from "node:os";
import {basename, dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fusionRoot = resolve(here, "..");
const chengRoot = resolve(fusionRoot, "../cheng-lang");
const darwinSourcePath = resolve(
  chengRoot,
  "src/core/backend/native_link_exec_darwin.cheng",
);
const directSourcePath = resolve(
  chengRoot,
  "src/core/backend/native_link_exec.cheng",
);
const driverSourcePath = resolve(
  chengRoot,
  "src/core/tooling/backend_driver_main.cheng",
);
const minDriverSourcePath = resolve(
  chengRoot,
  "src/core/tooling/backend_driver_dispatch_min.cheng",
);
const parseCommandSourcePath = resolve(
  chengRoot,
  "src/core/tooling/compiler_parse_receipt_command.cheng",
);
const coldBootstrapSourcePath = resolve(
  chengRoot,
  "bootstrap/cheng_cold.c",
);
const harnessPath = resolve(
  fusionRoot,
  "tools/current_parser_production_receipt_harness.ts",
);

function occurrences(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

function functionBody(
  source: string,
  name: string,
  nextName: string,
): string {
  const startMarker = `fn ${name}(`;
  const endMarker = `fn ${nextName}(`;
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `${name}_missing`);
  assert.ok(end > start, `${name}_end_missing`);
  return source.slice(start, end);
}

function validateDarwinSystemLinkArgv(source: string): void {
  const helper = functionBody(
    source,
    "NativeLinkExecSystemLinkerArgv",
    "NativeLinkExecRunLogged",
  );
  assert.equal(
    occurrences(source, "-Wl,-no_uuid"),
    0,
    "darwin_dyld_incompatible_no_uuid_flag_present",
  );
  assert.ok(
    helper.includes('add(argv, "-o")\n    add(argv, plan.outputPath)'),
    "system_linker_output_argv_invalid",
  );
  assert.equal(
    occurrences(
      source,
      "var argv: str[] = NativeLinkExecSystemLinkerArgv(plan)",
    ),
    2,
    "system_linker_argv_builder_not_unique_for_both_entrypoints",
  );
}

function validateDirectSystemLinkArgv(source: string): void {
  const argv = functionBody(
    source,
    "NativeLinkExecArgv",
    "NativeLinkExecCommandText",
  );
  assert.equal(occurrences(argv, "-Wl,-no_uuid"), 0,
    "direct_darwin_dyld_incompatible_no_uuid_flag_present");
  assert.ok(
    argv.includes(
      'add(argv, "-arch")\n' +
      '    add(argv, "arm64")\n' +
      '    for i in 0..<plan.linkInputPaths.len:',
    ),
    "direct_darwin_argv_contract_invalid",
  );
}

function validateColdDarwinSystemLinkArgv(source: string): void {
  assert.equal(occurrences(source, "-Wl,-no_uuid"), 0,
    "cold_darwin_dyld_incompatible_no_uuid_flag_present");
  assert.equal(occurrences(
    source,
    '"%s %s %s -lc %s -o %s > %s 2>&1"',
  ), 1, "cold_darwin_system_link_command_invalid");
}

function validateDriverParseReceiptDispatch(
  source: string,
  minSource: string,
  commandSource: string,
): void {
  assert.equal(
    occurrences(
      source,
      "import cheng/core/tooling/compiler_parse_receipt_command as parsecommand",
    ),
    1,
    "parse_receipt_canonical_import_invalid",
  );
  assert.equal(
    occurrences(
      minSource,
      "import cheng/core/tooling/compiler_parse_receipt_command as parsecommand",
    ),
    1,
    "parse_receipt_min_canonical_import_invalid",
  );
  assert.equal(
    occurrences(
      commandSource,
      "fn CompilerParseReceiptCommandRun(",
    ),
    1,
    "parse_receipt_canonical_producer_count_invalid",
  );
  assert.equal(
    occurrences(commandSource, "bytes.ReadFileBytes(path)"),
    1,
    "parse_receipt_canonical_binary_driver_hash_missing",
  );
  assert.equal(
    occurrences(
      source + minSource + commandSource,
      "preceipt.ParserSpanReceiptJsonBuild(",
    ),
    1,
    "parse_receipt_json_producer_not_unique",
  );
  assert.equal(
    occurrences(
      source + minSource + commandSource,
      "parsecommand.CompilerParseReceiptCommandRun(",
    ),
    2,
    "parse_receipt_two_entrypoint_delegation_invalid",
  );
  assert.equal(
    occurrences(source, "let driverPath = BackendDriverCurrentExecutablePath(rootDir)"),
    1,
    "parse_receipt_driver_path_not_from_current_executable",
  );
  assert.equal(
    occurrences(minSource, "strutil.Strip(cmdline.ProgramName())"),
    1,
    "parse_receipt_min_driver_path_not_from_program_name",
  );
  assert.equal(
    occurrences(source, "cmdline.CaptureCmdLine(argc, argv)"),
    1,
    "driver_canonical_cmdline_capture_missing",
  );
  assert.equal(
    occurrences(minSource, "cmdline.CaptureCmdLine(argc, argv)"),
    1,
    "min_driver_canonical_cmdline_capture_missing",
  );
  assert.equal(
    occurrences(source + minSource, "BackendDriverSetCmdLine(") +
      occurrences(source + minSource, "BackendDriverDispatchMinSetCmdLineBridge("),
    0,
    "legacy_cmdline_initializer_present",
  );
  const mainWrapper = functionBody(
    source,
    "BackendDriverRunParseReceipt",
    "BackendDriverForward",
  );
  const minWrapper = functionBody(
    minSource,
    "BackendDriverDispatchMinRunParseReceiptFromCmdline",
    "BackendDriverDispatchMinCommandCode",
  );
  assert.equal(
    occurrences(mainWrapper + minWrapper, "FileSha256"),
    0,
    "parse_receipt_caller_owned_driver_hash_fragment_present",
  );
  const dispatch = functionBody(
    source,
    "BackendDriverToolDispatch",
    "BackendDriverMain",
  );
  const direct =
    'if cmd == "parse-receipt":\n' +
    "            return BackendDriverRunParseReceipt(rootDir, args)";
  assert.equal(
    occurrences(dispatch, direct),
    1,
    "parse_receipt_direct_dispatch_invalid",
  );
  assert.ok(
    dispatch.indexOf(direct) <
      dispatch.lastIndexOf("return BackendDriverForward(rootDir, cmd, args)"),
    "parse_receipt_dispatch_occurs_after_forward",
  );
}

function validateReceiptDriverPaths(harness: string): void {
  assert.equal(
    occurrences(harness, 'const driverDir = join(outDir, role);'),
    1,
    "receipt_driver_distinct_directory_invalid",
  );
  assert.equal(
    occurrences(harness, 'const path = join(driverDir, "cheng");'),
    1,
    "receipt_driver_common_basename_invalid",
  );
  assert.equal(
    occurrences(harness, "mkdirSync(driverDir, {recursive: false});"),
    1,
    "receipt_driver_directory_creation_invalid",
  );
  assert.equal(
    occurrences(harness, "join(outDir, `cheng.${role}`)"),
    0,
    "receipt_driver_role_leaked_into_codesign_identifier",
  );
  assert.equal(
    occurrences(harness, "const uuidMatches = [...macho.stdout.matchAll("),
    1,
    "receipt_driver_lc_uuid_gate_missing",
  );
  assert.equal(
    occurrences(harness, 'fail("receipt driver LC_UUID fixed point invalid")'),
    1,
    "receipt_driver_lc_uuid_fixed_point_gate_missing",
  );
  assert.equal(
    occurrences(harness, '["--verify", "--strict", driver.path]'),
    1,
    "receipt_driver_codesign_gate_missing",
  );
  assert.equal(
    occurrences(
      harness,
      '"parser annotation: unregistered @inline"',
    ),
    1,
    "unregistered_annotation_mutation_gate_missing",
  );
  assert.equal(
    occurrences(
      harness,
      "if (existsSync(mutationOut))",
    ),
    1,
    "unregistered_annotation_mutation_output_gate_missing",
  );
}

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, {
    cwd: chengRoot,
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `${basename(command)}_failed stderr=${result.stderr}`,
  );
  return result.stdout;
}

function machoUuid(path: string): string {
  const matches = [...run("/usr/bin/otool", ["-l", path]).matchAll(
    /\buuid ([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})\b/g,
  )];
  assert.equal(matches.length, 1, "driver_canonical_lc_uuid_missing");
  return matches[0]![1]!.toUpperCase();
}

function validateRealDarwinLinkFixedPoint(): void {
  if (process.platform !== "darwin") {
    return;
  }
  const root = mkdtempSync(
    join(tmpdir(), "cheng-darwin-link-determinism-"),
  );
  try {
    const input = resolve(
      chengRoot,
      "bootstrap/bodyir_packed_slab_test.c",
    );
    const driverA = join(root, "receipt_driver_a", "cheng");
    const driverB = join(root, "receipt_driver_b", "cheng");
    mkdirSync(dirname(driverA));
    mkdirSync(dirname(driverB));
    for (const output of [driverA, driverB]) {
      run("/usr/bin/cc", [
        input,
        "-o",
        output,
      ]);
    }
    const statA = lstatSync(driverA, {bigint: true});
    const statB = lstatSync(driverB, {bigint: true});
    assert.notEqual(statA.ino, statB.ino, "driver_inode_not_distinct");
    assert.equal(
      basename(driverA),
      basename(driverB),
      "driver_basename_not_equal",
    );
    assert.deepEqual(
      readFileSync(driverA),
      readFileSync(driverB),
      "driver_raw_bytes_not_fixed_point",
    );
    assert.equal(machoUuid(driverA), machoUuid(driverB),
      "driver_lc_uuid_not_fixed_point");
    run("/usr/bin/codesign", ["--verify", "--strict", driverA]);
    run("/usr/bin/codesign", ["--verify", "--strict", driverB]);
    run(driverA, []);
    run(driverB, []);

    const mutationA = join(root, "mutation_a");
    const mutationB = join(root, "mutation_b");
    for (const output of [mutationA, mutationB]) {
      run("/usr/bin/cc", [
        input,
        "-o",
        output,
      ]);
    }
    assert.notDeepEqual(
      readFileSync(mutationA),
      readFileSync(mutationB),
      "different_basename_mutation_did_not_fail_fixed_point",
    );
  } finally {
    rmSync(root, {recursive: true});
  }
}

const darwinSource = readFileSync(darwinSourcePath, "utf8");
validateDarwinSystemLinkArgv(darwinSource);
const directSource = readFileSync(directSourcePath, "utf8");
validateDirectSystemLinkArgv(directSource);
const driverSource = readFileSync(driverSourcePath, "utf8");
const minDriverSource = readFileSync(minDriverSourcePath, "utf8");
const parseCommandSource = readFileSync(parseCommandSourcePath, "utf8");
const coldBootstrapSource = readFileSync(coldBootstrapSourcePath, "utf8");
validateColdDarwinSystemLinkArgv(coldBootstrapSource);
validateDriverParseReceiptDispatch(
  driverSource,
  minDriverSource,
  parseCommandSource,
);
const harness = readFileSync(harnessPath, "utf8");
validateReceiptDriverPaths(harness);
validateRealDarwinLinkFixedPoint();

assert.throws(
  () => validateDarwinSystemLinkArgv(
    darwinSource.replace(
      "    var argv: str[]\n",
      '    var argv: str[]\n    add(argv, "-Wl,-no_uuid")\n',
    ),
  ),
  /darwin_dyld_incompatible_no_uuid_flag_present/,
);
assert.throws(
  () => validateDarwinSystemLinkArgv(
    darwinSource.replace(
      "var argv: str[] = NativeLinkExecSystemLinkerArgv(plan)",
      "var argv: str[]",
    ),
  ),
  /system_linker_argv_builder_not_unique_for_both_entrypoints/,
);
assert.throws(
  () => validateDirectSystemLinkArgv(
    directSource.replace(
      '    add(argv, "arm64")\n',
      '    add(argv, "arm64")\n    add(argv, "-Wl,-no_uuid")\n',
    ),
  ),
  /direct_darwin_dyld_incompatible_no_uuid_flag_present/,
);
assert.throws(
  () => validateColdDarwinSystemLinkArgv(
    coldBootstrapSource.replace(
      '"%s %s %s -lc %s -o %s > %s 2>&1"',
      '"%s -Wl,-no_uuid %s %s -lc %s -o %s > %s 2>&1"',
    ),
  ),
  /cold_darwin_dyld_incompatible_no_uuid_flag_present/,
);
assert.throws(
  () => validateDriverParseReceiptDispatch(
    driverSource.replace(
      "return BackendDriverRunParseReceipt(rootDir, args)",
      "return BackendDriverForward(rootDir, cmd, args)",
    ),
    minDriverSource,
    parseCommandSource,
  ),
  /parse_receipt_direct_dispatch_invalid/,
);
assert.throws(
  () => validateDriverParseReceiptDispatch(
    driverSource.replace(
      "let driverPath = BackendDriverCurrentExecutablePath(rootDir)",
      "let driverPath = chengpath.PathAbsolute(rootDir, BackendDriverParamStr(0))",
    ),
    minDriverSource,
    parseCommandSource,
  ),
  /parse_receipt_driver_path_not_from_current_executable/,
);
assert.throws(
  () => validateReceiptDriverPaths(
    harness.replace(
      'const path = join(driverDir, "cheng");',
      "const path = join(outDir, `cheng.${role}`);",
    ),
  ),
  /receipt_driver_common_basename_invalid/,
);
assert.throws(
  () => validateReceiptDriverPaths(
    harness.replace(
      "mkdirSync(driverDir, {recursive: false});",
      "mkdirSync(driverDir, {recursive: true});",
    ),
  ),
  /receipt_driver_directory_creation_invalid/,
);

console.log(
  "item25 darwin system link determinism: PASS " +
  "target=arm64-apple-darwin canonical_lc_uuid=1 " +
  "entrypoints=2 driver_basename=cheng",
);
