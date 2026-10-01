import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const packageRoot = new URL("../", import.meta.url);
const standardPath = new URL("src/csg-standard.ts", packageRoot);
const stableJsonPath = new URL("src/stable-json.ts", packageRoot);
const standardSource = readFileSync(standardPath, "utf8");

function isResultStandard(node) {
  return ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "result" &&
    node.name.text === "standard";
}

function isOnlyThrow(node) {
  if (ts.isThrowStatement(node)) return true;
  return ts.isBlock(node) &&
    node.statements.length === 1 &&
    ts.isThrowStatement(node.statements[0]);
}

const sourceFile = ts.createSourceFile(
  standardPath.pathname,
  standardSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);
const validationFunctions = sourceFile.statements.filter((statement) =>
  ts.isFunctionDeclaration(statement) &&
  statement.name?.text === "validateCsgFacts"
);
assert.equal(
  validationFunctions.length,
  1,
  "csg-standard must have exactly one validateCsgFacts admission boundary",
);
const validationFunction = validationFunctions[0];
assert.ok(validationFunction?.body, "validateCsgFacts must have a body");

const admissionStatements = validationFunction.body.statements;
assert.equal(
  admissionStatements.length,
  3,
  "validateCsgFacts admission must remain call, exact standard guard, return",
);
const resultStatement = admissionStatements[0];
assert.ok(ts.isVariableStatement(resultStatement));
assert.ok(resultStatement.declarationList.flags & ts.NodeFlags.Const);
assert.equal(resultStatement.declarationList.declarations.length, 1);
const resultDeclaration = resultStatement.declarationList.declarations[0];
assert.ok(ts.isIdentifier(resultDeclaration.name));
assert.equal(resultDeclaration.name.text, "result");
assert.ok(ts.isCallExpression(resultDeclaration.initializer));
assert.ok(ts.isIdentifier(resultDeclaration.initializer.expression));
assert.equal(resultDeclaration.initializer.expression.text, "chengCsgValidateFacts");

const exactStandardGuard = admissionStatements[1];
assert.ok(ts.isIfStatement(exactStandardGuard));
assert.ok(ts.isBinaryExpression(exactStandardGuard.expression));
assert.equal(
  exactStandardGuard.expression.operatorToken.kind,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
);
assert.ok(isResultStandard(exactStandardGuard.expression.left));
assert.ok(ts.isIdentifier(exactStandardGuard.expression.right));
assert.equal(exactStandardGuard.expression.right.text, "CsgCoreStandard");
assert.ok(
  isOnlyThrow(exactStandardGuard.thenStatement),
  "non-canonical standard must immediately throw",
);
assert.ok(
  ts.isReturnStatement(admissionStatements[2]),
  "validateCsgFacts must return only after exact standard admission",
);

let legacyLiteralCount = 0;
let canonicalReturnCount = 0;
function auditValidationFunction(node) {
  if (ts.isStringLiteral(node) && node.text === "csg_core") {
    legacyLiteralCount += 1;
  }
  if (ts.isPropertyAssignment(node) &&
      ((ts.isIdentifier(node.name) && node.name.text === "standard") ||
       (ts.isStringLiteral(node.name) && node.name.text === "standard")) &&
      isResultStandard(node.initializer)) {
    canonicalReturnCount += 1;
  }
  ts.forEachChild(node, auditValidationFunction);
}
auditValidationFunction(validationFunction);
assert.equal(
  legacyLiteralCount,
  0,
  "validateCsgFacts must not contain a legacy csg_core acceptance alias",
);
assert.equal(
  canonicalReturnCount,
  1,
  "validateCsgFacts must return the admitted standard instead of normalizing it",
);

function transpile(path) {
  const source = readFileSync(path, "utf8");
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: path.pathname,
    reportDiagnostics: true,
  });
  assert.deepEqual(
    result.diagnostics ?? [],
    [],
    `failed to transpile ${path.pathname}`,
  );
  return result.outputText;
}

const sandbox = mkdtempSync(join(tmpdir(), "csg-standard-admission-"));
try {
  writeFileSync(join(sandbox, "package.json"), '{"type":"module"}\n');
  writeFileSync(join(sandbox, "csg-standard.js"), transpile(standardPath));
  writeFileSync(join(sandbox, "stable-json.js"), transpile(stableJsonPath));
  writeFileSync(join(sandbox, "csg-cheng-bridge.js"), `
export function chengCsgValidateFacts(facts, mode) {
  return {
    valid: true,
    mode,
    standard: globalThis.__csgStandardAdmissionValue,
    profiles: ["csg_core"],
    profileSetCid: "sha256:${"0".repeat(64)}",
    factCount: facts.length,
    factsRoot: "sha256:${"1".repeat(64)}",
    complete: true,
    unsupportedCount: 0,
    tombstoneCount: 0,
    errors: [],
  };
}
export function chengCsgFactsRoot() { throw new Error("unexpected root call"); }
export function chengCsgDiffFacts() { throw new Error("unexpected diff call"); }
`);

  const standardModule = await import(
    `${pathToFileURL(join(sandbox, "csg-standard.js")).href}?strict-admission`
  );
  globalThis.__csgStandardAdmissionValue = "csg_core::v1";
  const canonical = standardModule.validateCsgFacts([], "strict");
  assert.equal(canonical.standard, "csg_core::v1");

  globalThis.__csgStandardAdmissionValue = "csg_core";
  assert.throws(
    () => standardModule.validateCsgFacts([], "strict"),
    /pure Cheng CSG standard mismatch: csg_core != csg_core::v1/,
  );

  globalThis.__csgStandardAdmissionValue = "csg_core::v2";
  assert.throws(
    () => standardModule.validateCsgFacts([], "strict"),
    /pure Cheng CSG standard mismatch: csg_core::v2 != csg_core::v1/,
  );
} finally {
  delete globalThis.__csgStandardAdmissionValue;
  rmSync(sandbox, { recursive: true, force: true });
}

console.log("csg-standard-strict-admission: ok");
