import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  readdirSync,
  readSync,
  rmSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

const MANIFEST_NAME = "freeze-manifest.json";
const MANIFEST_SCHEMA = "ts_csg_dist_freeze";
const SOURCE_NAME = "dist";
const TARGET_NAME = "dist-frozen";
const REQUIRED_RUNTIME_FILES = [
  "cli.js",
  "csg-cheng-bridge.js",
  "csg-facts-identity.js",
  "csgc-reader.js",
  "csgc-writer.js",
];
const ATOMIC_PUBLISH_HELPER = fileURLToPath(
  new URL("./atomic-publish-directory", import.meta.url),
);
const PYTHON = "/usr/bin/python3";
const READ_CHUNK_BYTES = 1024 * 1024;

function fail(reason) {
  throw new Error(`ts_csg_dist_freeze:${reason}`);
}

function utf8Compare(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function canonicalRelativePath(root, absolutePath) {
  const raw = relative(root, absolutePath);
  if (!raw || isAbsolute(raw)) fail("relative_path_invalid");
  const canonical = raw.split(sep).join("/");
  if (
    canonical.startsWith("../") ||
    canonical.includes("/../") ||
    canonical.includes("\\") ||
    /[\0\r\n]/.test(canonical) ||
    Buffer.from(canonical, "utf8").toString("utf8") !== canonical
  ) {
    fail(`relative_path_not_canonical:${canonical}`);
  }
  return canonical;
}

function stableStatEqual(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function openStableRegularFile(path) {
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const fd = openSync(path, constants.O_RDONLY | noFollow);
  const before = fstatSync(fd, { bigint: true });
  if (!before.isFile()) {
    closeSync(fd);
    fail(`non_regular_file:${path}`);
  }
  if (before.nlink !== 1n) {
    closeSync(fd);
    fail(`hardlink_rejected:${path}`);
  }
  return { fd, before };
}

function hashStableFile(path) {
  const { fd, before } = openStableRegularFile(path);
  const hash = createHash("sha256");
  const chunk = Buffer.allocUnsafe(READ_CHUNK_BYTES);
  let size = 0;
  try {
    while (true) {
      const count = readSync(fd, chunk, 0, chunk.length, null);
      if (count === 0) break;
      hash.update(chunk.subarray(0, count));
      size += count;
    }
    const after = fstatSync(fd, { bigint: true });
    if (!stableStatEqual(before, after) || BigInt(size) !== after.size) {
      fail(`source_file_changed_during_read:${path}`);
    }
  } finally {
    closeSync(fd);
  }
  return { size, sha256: hash.digest("hex") };
}

function scanTree(root, { excludeManifest = false } = {}) {
  const rootInfo = lstatSync(root, { bigint: true });
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    fail(`tree_root_not_real_directory:${root}`);
  }

  const directories = [];
  const files = [];
  function visit(directory) {
    const names = readdirSync(directory).sort(utf8Compare);
    for (const name of names) {
      const path = join(directory, name);
      const relativePath = canonicalRelativePath(root, path);
      if (excludeManifest && relativePath === MANIFEST_NAME) continue;
      if (!excludeManifest && relativePath === MANIFEST_NAME) {
        fail(`source_reserved_manifest_name:${relativePath}`);
      }
      const info = lstatSync(path, { bigint: true });
      if (info.isSymbolicLink()) fail(`symlink_rejected:${relativePath}`);
      if (info.isDirectory()) {
        directories.push(relativePath);
        visit(path);
        continue;
      }
      if (!info.isFile()) fail(`special_file_rejected:${relativePath}`);
      if (info.nlink !== 1n) fail(`hardlink_rejected:${relativePath}`);
      const identity = hashStableFile(path);
      files.push({ path: relativePath, ...identity });
    }
  }
  visit(root);
  directories.sort(utf8Compare);
  files.sort((left, right) => utf8Compare(left.path, right.path));
  return { directories, files };
}

function validateRequiredRuntimeFiles(tree) {
  const paths = new Set(tree.files.map((entry) => entry.path));
  for (const required of REQUIRED_RUNTIME_FILES) {
    if (!paths.has(required)) fail(`required_runtime_file_missing:${required}`);
  }
}

function requireMatch(text, pattern, reason) {
  if (!pattern.test(text)) fail(reason);
}

function rejectMatch(text, pattern, reason) {
  if (pattern.test(text)) fail(reason);
}

function matchCount(text, pattern) {
  return text.match(pattern)?.length ?? 0;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function jsSkipString(text, index) {
  const quote = text[index];
  index += 1;
  while (index < text.length) {
    if (text[index] === "\\") {
      index += 2;
      continue;
    }
    if (text[index] === quote) return index + 1;
    index += 1;
  }
  return index;
}

function jsSkipTrivia(text, index) {
  while (index < text.length) {
    const character = text[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      index = jsSkipString(text, index);
      continue;
    }
    if (text.startsWith("//", index)) {
      const end = text.indexOf("\n", index);
      index = end < 0 ? text.length : end + 1;
      continue;
    }
    if (text.startsWith("/*", index)) {
      const end = text.indexOf("*/", index + 2);
      index = end < 0 ? text.length : end + 2;
      continue;
    }
    return index;
  }
  return index;
}

function jsScanBalanced(text, index, openCharacter, closeCharacter) {
  let depth = 0;
  while (index < text.length) {
    index = jsSkipTrivia(text, index);
    if (index >= text.length) break;
    if (text[index] === openCharacter) {
      depth += 1;
    } else if (text[index] === closeCharacter) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
    index += 1;
  }
  return -1;
}

function guardDominatedBody(text, operation) {
  // Strict guard domination: exactly one exported function named `operation`
  // whose entire body is the launcher guard return. Balanced scanning keeps
  // object-literal return types distinct from the body, and a conditional
  // wrapper such as `if (globalThis) { return guard(); }` fails closed.
  const anchor = new RegExp(
    `export\\s+function\\s+${escapeRegExp(operation)}\\s*\\(`,
    "g",
  );
  const matches = [...text.matchAll(anchor)];
  if (matches.length !== 1) return false;
  const openParen = matches[0].index + matches[0][0].length - 1;
  const closeParen = jsScanBalanced(text, openParen, "(", ")");
  if (closeParen < 0) return false;
  let openBrace = jsSkipTrivia(text, closeParen);
  while (openBrace >= 0 && openBrace < text.length && text[openBrace] !== "{") {
    openBrace = jsSkipTrivia(text, openBrace + 1);
  }
  if (openBrace < 0 || openBrace >= text.length) return false;
  let closeBrace = jsScanBalanced(text, openBrace, "{", "}");
  if (closeBrace < 0) return false;
  // An object-literal return type is immediately followed by the real body
  // open brace; rescan so the body, never the type, is examined.
  const following = jsSkipTrivia(text, closeBrace);
  if (following < text.length && text[following] === "{") {
    openBrace = following;
    closeBrace = jsScanBalanced(text, openBrace, "{", "}");
    if (closeBrace < 0) return false;
  }
  const inner = text.slice(openBrace + 1, closeBrace - 1);
  return inner.includes("requireChengCsgHeldExecLauncherIdentity(");
}

function requireHeldExecGuardDominates(text, operation) {
  if (!guardDominatedBody(text, operation)) {
    fail(`held_exec_launcher_guard_not_dominant:${operation}`);
  }
}

function validateHeldExecFailClosedBoundary(bridge) {
  requireMatch(
    bridge,
    /const ChengCsgHeldExecHardRed =\s*["']HARD_RED:production_launcher_runtime_primitives_missing["']/,
    "held_exec_hard_red_marker_missing",
  );
  requireMatch(
    bridge,
    /function requireChengCsgHeldExecLauncherIdentity\(\)/,
    "held_exec_launcher_guard_missing",
  );
  requireMatch(
    bridge,
    /ChengCsgHeldCliInstallPath\s*=\s*["']\/usr\/libexec\/cheng\/csg-cli["']/,
    "held_exec_fixed_install_path_missing",
  );
  requireMatch(
    bridge,
    /\/proc\/self\/fd\//,
    "held_exec_fd_exec_missing",
  );
  for (const operation of [
    "chengCsgRootFileStrict",
    "chengCsgDecodeFactKindsAuthorized",
    "chengCsgFactIdentitiesThroughRootCli",
    "chengCsgPackFacts",
    "chengCsgUnpackFacts",
    "chengCsgValidateFacts",
    "chengCsgFactsRoot",
    "chengCsgDiffFacts",
  ]) {
    requireHeldExecGuardDominates(bridge, operation);
  }
  rejectMatch(
    bridge,
    /\bprocess\.env\b|["']tools["']\s*,\s*["']csg["']|artifacts\/backend_driver|cheng\.stage3/,
    "typescript_prelauncher_path_authority_reintroduced",
  );
  rejectMatch(
    bridge,
    /spawnSync\(\s*["'](?!\/usr\/libexec\/cheng\/csg-cli)(?!\/proc\/self\/fd\/)/,
    "typescript_pathname_cli_reintroduced",
  );
}

function validateCliHeldExecBoundary(cli) {
  requireMatch(
    cli,
    /from\s*["']\.\/csg-cheng-bridge\.js["']/,
    "cli_held_exec_bridge_import_missing",
  );
  requireMatch(
    cli,
    /function main\(\)[^{]*\{\s*const options = parseArgs\([^;]+;\s*if \(options\.help\) \{(?:(?!\n\s*if \(options\.out)[\s\S])*?return;\s*\}\s*if \(options\.out && isCsgcOutput\(options\.out\)\) \{\s*return requireChengCsgHeldExecLauncherIdentity\(\);\s*\}/,
    "cli_csgc_prelauncher_guard_missing",
  );
  requireMatch(
    cli,
    /if\s*\([^{}]*\.endsWith\(["']\.csgc["']\)[^{}]*\)\s*\{\s*return requireChengCsgHeldExecLauncherIdentity\(\);\s*\}/,
    "cli_csgc_writer_guard_missing",
  );
  rejectMatch(
    cli,
    /node:child_process|\b(?:spawn|spawnSync|execFile|execFileSync|execSync|mkdtemp)\s*\(|\b(?:writeUnifiedCsgcOutput|writeFactsJsonl|runPureCsgPack)\b|["']tools["']\s*,\s*["']csg["']/,
    "cli_csgc_prelauncher_io_or_direct_tool_reintroduced",
  );
}

function validatePureChengBoundary(root) {
  const bridge = readFileSync(join(root, "csg-cheng-bridge.js"), "utf8");
  const identity = readFileSync(join(root, "csg-facts-identity.js"), "utf8");
  const reader = readFileSync(join(root, "csgc-reader.js"), "utf8");
  const writer = readFileSync(join(root, "csgc-writer.js"), "utf8");
  const standard = readFileSync(join(root, "csg-standard.js"), "utf8");
  const cli = readFileSync(join(root, "cli.js"), "utf8");

  for (const [pattern, reason] of [
    [/\bbuildIdentityBinary\b/, "typescript_identity_binary_builder_reintroduced"],
    [/\bensureIdentityBinary\b/, "typescript_identity_binary_cache_reintroduced"],
    [/system-link-exec/, "typescript_identity_system_link_exec_reintroduced"],
    [/csg-facts-identity\.cheng/, "typescript_identity_cheng_source_reintroduced"],
  ]) {
    rejectMatch(identity, pattern, reason);
  }
  requireMatch(
    identity,
    /from\s*["']\.\/csg-cheng-bridge\.js["']/,
    "identity_pure_cheng_bridge_import_missing",
  );
  requireHeldExecGuardDominates(identity, "chengCsgFactIdentities");
  requireMatch(
    identity,
    /requireChengCsgHeldExecLauncherIdentity|chengCsgFactIdentitiesThroughRootCli/,
    "identity_held_exec_guard_missing",
  );
  requireMatch(
    writer,
    /from\s*["']\.\/csg-cheng-bridge\.js["']/,
    "writer_pure_cheng_bridge_import_missing",
  );
  for (const operation of ["csgcWriteDebugFile", "csgcWriteFacts"]) {
    requireHeldExecGuardDominates(writer, operation);
  }
  requireMatch(
    writer,
    /requireChengCsgHeldExecLauncherIdentity|chengCsgPackFacts/,
    "writer_held_exec_guard_missing",
  );
  requireMatch(
    reader,
    /from\s*["']\.\/csg-cheng-bridge\.js["']/,
    "reader_pure_cheng_bridge_import_missing",
  );
  requireMatch(
    reader,
    /requireChengCsgHeldExecLauncherIdentity|chengCsgUnpackFacts/,
    "reader_held_exec_guard_missing",
  );
  for (const operation of ["csgcReadFactKindsAuthorized", "csgcReadFacts"]) {
    requireHeldExecGuardDominates(reader, operation);
  }
  requireMatch(
    standard,
    /from\s*["']\.\/csg-cheng-bridge\.js["']/,
    "standard_pure_cheng_bridge_import_missing",
  );
  for (const operation of ["csgFactsRoot", "validateCsgFacts", "diffCsgFacts"]) {
    requireHeldExecGuardDominates(standard, operation);
  }
  const physicalBoundary = `${bridge}\n${identity}\n${reader}\n${writer}\n${standard}`;
  rejectMatch(
    physicalBoundary,
    /\b(?:CSGC_MAGIC|CSGC_FLAG_[A-Z0-9_]+|CsgcFactKind|FIELD_TAGS|OP_KIND_COLUMNS|LocalStringTable)\b|\bDataView\b|\.(?:write|read)U?Int(?:8|16|32|64|LE|BE)*\s*\(|\b(?:encode|decode|write|read)Varint\b|\b(?:brotli|zlib)\b/i,
    "typescript_physical_codec_reintroduced",
  );
  validateHeldExecFailClosedBoundary(bridge);
  validateCliHeldExecBoundary(cli);
  rejectMatch(
    bridge,
    /\b(?:CSG_FACTS_ROOT_VIA_JS|packFactsWithJsWriter|CSG_PACK_VIA_CLI|createHmac|sha256Facts|hashFact|computeFactsRoot|computeFactHash|buildMerkleProof|verifyMerkleProof|encodeCsgc|decodeCsgc)\b|\bcrypto\.subtle\b/,
    "typescript_root_or_pack_authority_reintroduced",
  );
  rejectMatch(
    cli,
    /--relfacts-diff-in|\b(?:replayRelfactsDiff|parseRelfactsDiff|buildRelFactsReport|emitRelFactsFromFacts|withRelfactHashes)\b|["']cheng-csg["']/,
    "typescript_cli_authority_reintroduced",
  );

  const relfactsPath = join(root, "csg-relfacts.js");
  if (existsSync(relfactsPath)) {
    const relfacts = readFileSync(relfactsPath, "utf8");
    requireMatch(
      relfacts,
      /\bbuildRelationFactsFromFacts\s*\(/,
      "typescript_relfacts_semantic_producer_missing",
    );
    rejectMatch(
      relfacts,
      /\b(?:replayRelfactsDiff|parseRelfactsDiff|buildRelFactsReport|emitRelFactsFromFacts|withRelfactHashes|csgFactsRoot|chengCsgFactIdentities|createHash)\b|\bJSON\.parse\s*\(|["'](?:facts_root|fact_hash|CHENG_RELFACTS)["']/,
      "typescript_relfacts_authority_reintroduced",
    );
  }
}

function buildManifest(tree) {
  return {
    schema: MANIFEST_SCHEMA,
    source_root: SOURCE_NAME,
    target_root: TARGET_NAME,
    directories: tree.directories,
    file_count: tree.files.length,
    files: tree.files,
  };
}

function renderManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function parseManifest(path) {
  const raw = readFileSync(path, "utf8");
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch {
    fail("manifest_json_invalid");
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    fail("manifest_root_invalid");
  }
  const keys = Object.keys(manifest);
  const expectedKeys = [
    "schema",
    "source_root",
    "target_root",
    "directories",
    "file_count",
    "files",
  ];
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
    fail("manifest_fields_invalid");
  }
  if (
    manifest.schema !== MANIFEST_SCHEMA ||
    manifest.source_root !== SOURCE_NAME ||
    manifest.target_root !== TARGET_NAME ||
    !Array.isArray(manifest.directories) ||
    !Number.isSafeInteger(manifest.file_count) ||
    manifest.file_count < 1 ||
    !Array.isArray(manifest.files) ||
    manifest.file_count !== manifest.files.length
  ) {
    fail("manifest_header_invalid");
  }
  const directories = manifest.directories;
  for (let index = 0; index < directories.length; index += 1) {
    const entry = directories[index];
    if (
      typeof entry !== "string" ||
      entry.length === 0 ||
      entry === MANIFEST_NAME ||
      (index > 0 && utf8Compare(directories[index - 1], entry) >= 0)
    ) {
      fail("manifest_directories_invalid");
    }
  }
  for (let index = 0; index < manifest.files.length; index += 1) {
    const entry = manifest.files[index];
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      JSON.stringify(Object.keys(entry)) !== JSON.stringify(["path", "size", "sha256"]) ||
      typeof entry.path !== "string" ||
      entry.path.length === 0 ||
      entry.path === MANIFEST_NAME ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      !/^[0-9a-f]{64}$/.test(entry.sha256) ||
      (index > 0 && utf8Compare(manifest.files[index - 1].path, entry.path) >= 0)
    ) {
      fail("manifest_file_entry_invalid");
    }
  }
  if (raw !== renderManifest(manifest)) fail("manifest_not_canonical");
  return { manifest, raw };
}

function treeEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function ensureTreeEqual(left, right, reason) {
  if (!treeEqual(left, right)) fail(reason);
}

function ensureDirectory(path, mode = 0o755) {
  mkdirSync(path, { recursive: false, mode });
}

function copyStableFile(source, destination, expected) {
  const { fd: sourceFd, before } = openStableRegularFile(source);
  const destinationFd = openSync(
    destination,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    0o444,
  );
  const hash = createHash("sha256");
  const chunk = Buffer.allocUnsafe(READ_CHUNK_BYTES);
  let size = 0;
  try {
    while (true) {
      const count = readSync(sourceFd, chunk, 0, chunk.length, null);
      if (count === 0) break;
      hash.update(chunk.subarray(0, count));
      let offset = 0;
      while (offset < count) {
        const written = writeSync(destinationFd, chunk, offset, count - offset);
        if (written <= 0) fail(`destination_write_failed:${expected.path}`);
        offset += written;
      }
      size += count;
    }
    fsyncSync(destinationFd);
    const after = fstatSync(sourceFd, { bigint: true });
    if (!stableStatEqual(before, after) || BigInt(size) !== after.size) {
      fail(`source_file_changed_during_copy:${expected.path}`);
    }
  } finally {
    closeSync(destinationFd);
    closeSync(sourceFd);
  }
  const sha256 = hash.digest("hex");
  if (size !== expected.size || sha256 !== expected.sha256) {
    fail(`source_file_identity_changed:${expected.path}`);
  }
  const targetInfo = lstatSync(destination, { bigint: true });
  if (!targetInfo.isFile() || targetInfo.isSymbolicLink() || targetInfo.nlink !== 1n) {
    fail(`staged_file_identity_invalid:${expected.path}`);
  }
}

function fsyncDirectory(path) {
  const fd = openSync(path, constants.O_RDONLY | (constants.O_DIRECTORY ?? 0));
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function fsyncDirectoryTree(root, directories) {
  const deepestFirst = [...directories].sort((left, right) => {
    const depth = right.split("/").length - left.split("/").length;
    return depth || utf8Compare(right, left);
  });
  for (const directory of deepestFirst) fsyncDirectory(join(root, directory));
  fsyncDirectory(root);
}

function stageDistribution(sourceRoot, stageRoot, tree, manifestRaw) {
  for (const directory of tree.directories) {
    ensureDirectory(join(stageRoot, ...directory.split("/")));
  }
  for (const entry of tree.files) {
    copyStableFile(
      join(sourceRoot, ...entry.path.split("/")),
      join(stageRoot, ...entry.path.split("/")),
      entry,
    );
  }
  const manifestPath = join(stageRoot, MANIFEST_NAME);
  writeFileSync(manifestPath, manifestRaw, { encoding: "utf8", flag: "wx", mode: 0o444 });
  const manifestFd = openSync(manifestPath, constants.O_RDONLY);
  try {
    fsyncSync(manifestFd);
  } finally {
    closeSync(manifestFd);
  }
  chmodSync(stageRoot, 0o755);
  fsyncDirectoryTree(stageRoot, tree.directories);
}

function validateHelper() {
  const info = lstatSync(ATOMIC_PUBLISH_HELPER, { bigint: true });
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1n) {
    fail("atomic_publish_helper_invalid");
  }
  const pythonExecutable = realpathSync(PYTHON);
  const pythonInfo = lstatSync(pythonExecutable, { bigint: true });
  if (!pythonInfo.isFile() || pythonInfo.isSymbolicLink()) {
    fail("python_runtime_invalid");
  }
  return pythonExecutable;
}

function atomicPublish(mode, source, destination) {
  const pythonExecutable = validateHelper();
  const result = spawnSync(
    pythonExecutable,
    [ATOMIC_PUBLISH_HELPER, mode, source, destination],
    {
      encoding: "utf8",
      env: {
        HOME: process.env.HOME ?? "",
        LANG: "C",
        LC_ALL: "C",
        PATH: "/usr/bin:/bin",
        PYTHONNOUSERSITE: "1",
      },
      maxBuffer: 1024 * 1024,
    },
  );
  if (result.error) fail(`atomic_publish_spawn_failed:${result.error.message}`);
  if (result.status !== 0 || result.stdout !== "" || result.stderr !== "") {
    const detail = `${result.stderr ?? ""}${result.stdout ?? ""}`
      .trim()
      .replace(/[\r\n]+/g, "|");
    fail(`atomic_publish_failed:${mode}:${result.status ?? "signal"}:${detail}`);
  }
}

function validatePackageRoot(packageRoot) {
  const absolute = resolve(packageRoot);
  const real = realpathSync(absolute);
  if (absolute !== real || basename(absolute) === "" || !existsSync(absolute)) {
    fail("package_root_invalid");
  }
  const info = lstatSync(absolute, { bigint: true });
  if (!info.isDirectory() || info.isSymbolicLink()) fail("package_root_not_real_directory");
  return absolute;
}

function validateTargetRootShape(targetRoot) {
  if (!existsSync(targetRoot)) return false;
  const info = lstatSync(targetRoot, { bigint: true });
  if (!info.isDirectory() || info.isSymbolicLink()) fail("target_not_real_directory");
  return true;
}

function validateFrozenAgainstExpected(targetRoot, expectedTree, expectedManifestRaw) {
  const manifestPath = join(targetRoot, MANIFEST_NAME);
  const manifestInfo = lstatSync(manifestPath, { bigint: true });
  if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink() || manifestInfo.nlink !== 1n) {
    fail("frozen_manifest_identity_invalid");
  }
  const parsed = parseManifest(manifestPath);
  const actualTree = scanTree(targetRoot, { excludeManifest: true });
  validateRequiredRuntimeFiles(actualTree);
  validatePureChengBoundary(targetRoot);
  if (parsed.raw !== expectedManifestRaw) fail("frozen_manifest_bytes_mismatch");
  const manifestTree = {
    directories: parsed.manifest.directories,
    files: parsed.manifest.files,
  };
  ensureTreeEqual(manifestTree, expectedTree, "frozen_manifest_tree_mismatch");
  ensureTreeEqual(actualTree, expectedTree, "frozen_tree_bytes_mismatch");
}

function assertStableFileBytesEqual(source, target, relativePath) {
  const sourceFile = openStableRegularFile(source);
  let targetFile;
  const sourceChunk = Buffer.allocUnsafe(READ_CHUNK_BYTES);
  const targetChunk = Buffer.allocUnsafe(READ_CHUNK_BYTES);
  try {
    targetFile = openStableRegularFile(target);
    while (true) {
      const sourceCount = readSync(sourceFile.fd, sourceChunk, 0, sourceChunk.length, null);
      const targetCount = readSync(targetFile.fd, targetChunk, 0, targetChunk.length, null);
      if (sourceCount !== targetCount) fail(`source_target_bytes_mismatch:${relativePath}`);
      if (sourceCount === 0) break;
      if (!sourceChunk.subarray(0, sourceCount).equals(targetChunk.subarray(0, targetCount))) {
        fail(`source_target_bytes_mismatch:${relativePath}`);
      }
    }
    const sourceAfter = fstatSync(sourceFile.fd, { bigint: true });
    const targetAfter = fstatSync(targetFile.fd, { bigint: true });
    if (
      !stableStatEqual(sourceFile.before, sourceAfter) ||
      !stableStatEqual(targetFile.before, targetAfter)
    ) {
      fail(`source_or_target_changed_during_compare:${relativePath}`);
    }
  } finally {
    if (targetFile !== undefined) closeSync(targetFile.fd);
    closeSync(sourceFile.fd);
  }
}

function assertSourceAndFrozenIdentity(sourceRoot, targetRoot, tree) {
  for (const entry of tree.files) {
    const source = join(sourceRoot, ...entry.path.split("/"));
    const target = join(targetRoot, ...entry.path.split("/"));
    const sourceInfo = lstatSync(source, { bigint: true });
    const targetInfo = lstatSync(target, { bigint: true });
    if (sourceInfo.dev === targetInfo.dev && sourceInfo.ino === targetInfo.ino) {
      fail(`source_target_inode_shared:${entry.path}`);
    }
    assertStableFileBytesEqual(source, target, entry.path);
  }
}

export function verifyFrozenDistribution({ packageRoot } = {}) {
  const root = validatePackageRoot(
    packageRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  );
  const sourceRoot = join(root, SOURCE_NAME);
  const targetRoot = join(root, TARGET_NAME);
  if (!validateTargetRootShape(targetRoot)) fail("target_missing");
  const sourceTree = scanTree(sourceRoot);
  validateRequiredRuntimeFiles(sourceTree);
  validatePureChengBoundary(sourceRoot);
  const manifestRaw = renderManifest(buildManifest(sourceTree));
  validateFrozenAgainstExpected(targetRoot, sourceTree, manifestRaw);
  assertSourceAndFrozenIdentity(sourceRoot, targetRoot, sourceTree);
  return {
    status: "verified",
    fileCount: sourceTree.files.length,
    manifestSha256: createHash("sha256").update(manifestRaw).digest("hex"),
  };
}

export function freezeDistribution({ packageRoot, beforePublish } = {}) {
  const root = validatePackageRoot(
    packageRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  );
  const sourceRoot = join(root, SOURCE_NAME);
  const targetRoot = join(root, TARGET_NAME);
  const lockRoot = join(root, `.${TARGET_NAME}.freeze.lock`);
  mkdirSync(lockRoot, { recursive: false, mode: 0o700 });
  let stageRoot;
  let committed = false;
  try {
    const sourceTree = scanTree(sourceRoot);
    validateRequiredRuntimeFiles(sourceTree);
    validatePureChengBoundary(sourceRoot);
    const manifestRaw = renderManifest(buildManifest(sourceTree));
    stageRoot = mkdtempSync(join(root, `.${TARGET_NAME}.stage-`));
    stageDistribution(sourceRoot, stageRoot, sourceTree, manifestRaw);
    validateFrozenAgainstExpected(stageRoot, sourceTree, manifestRaw);
    assertSourceAndFrozenIdentity(sourceRoot, stageRoot, sourceTree);

    if (beforePublish !== undefined) {
      if (typeof beforePublish !== "function") fail("before_publish_hook_invalid");
      beforePublish({ sourceRoot, stageRoot, targetRoot });
    }

    const sourceTreeBeforeCommit = scanTree(sourceRoot);
    ensureTreeEqual(sourceTreeBeforeCommit, sourceTree, "source_tree_changed_before_publish");
    validatePureChengBoundary(sourceRoot);
    validateFrozenAgainstExpected(stageRoot, sourceTree, manifestRaw);

    const targetExists = validateTargetRootShape(targetRoot);
    atomicPublish(targetExists ? "exchange" : "noreplace", stageRoot, targetRoot);
    committed = true;
    try {
      const sourceTreeAfterCommit = scanTree(sourceRoot);
      ensureTreeEqual(sourceTreeAfterCommit, sourceTree, "source_tree_changed_after_publish");
      validatePureChengBoundary(sourceRoot);
      validateFrozenAgainstExpected(targetRoot, sourceTree, manifestRaw);
      assertSourceAndFrozenIdentity(sourceRoot, targetRoot, sourceTree);
    } catch (error) {
      if (targetExists) {
        atomicPublish("exchange", stageRoot, targetRoot);
        committed = false;
      } else {
        rmSync(targetRoot, { recursive: true, force: true });
        committed = false;
      }
      throw error;
    }

    if (targetExists) rmSync(stageRoot, { recursive: true, force: true });
    stageRoot = undefined;
    return {
      status: "published",
      fileCount: sourceTree.files.length,
      manifestSha256: createHash("sha256").update(manifestRaw).digest("hex"),
    };
  } finally {
    if (!committed && stageRoot !== undefined) {
      rmSync(stageRoot, { recursive: true, force: true });
    }
    rmSync(lockRoot, { recursive: true, force: true });
  }
}

function parseArguments(args) {
  let packageRoot;
  let verify = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--verify") {
      if (verify) fail("duplicate_verify_argument");
      verify = true;
    } else if (arg === "--package-root") {
      if (packageRoot !== undefined || index + 1 >= args.length) {
        fail("package_root_argument_invalid");
      }
      packageRoot = args[index + 1];
      index += 1;
    } else {
      fail(`unknown_argument:${arg}`);
    }
  }
  return { packageRoot, verify };
}

function printReceipt(result) {
  process.stdout.write(
    [
      `ts_csg_dist_freeze_status=${result.status}`,
      `source_root=${SOURCE_NAME}`,
      `target_root=${TARGET_NAME}`,
      `file_count=${result.fileCount}`,
      `manifest_sha256=sha256:${result.manifestSha256}`,
    ].join("\n") + "\n",
  );
}

const invokedPath = process.argv[1] === undefined ? "" : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const result = options.verify
      ? verifyFrozenDistribution({ packageRoot: options.packageRoot })
      : freezeDistribution({ packageRoot: options.packageRoot });
    printReceipt(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message.replace(/[\r\n]+/g, "|")}\n`);
    process.exitCode = 1;
  }
}
