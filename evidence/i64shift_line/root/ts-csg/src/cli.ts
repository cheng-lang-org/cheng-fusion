#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { emitChengSourceFromTs } from "./cheng-source.js";
import { buildCsgCoreIndex, buildCsgCoreSummary, emitCsgCoreFromTs } from "./csg-core.js";
import { emitCsgJsFromTs } from "./csg-js.js";
import { emitBundleCsg } from "./bundle-csg.js";
import { emitCsgWebFromTs } from "./csg-web.js";
import { materializeCsgWebFactsToChengSource, type CsgWebMaterializerOptions } from "./csg-web-materializer.js";
import { requireChengCsgHeldExecLauncherIdentity } from "./csg-cheng-bridge.js";
import { extractTsCsg } from "./extractor.js";
import type { CsgFact, ExtractOptions } from "./schema.js";
import { stableJson } from "./stable-json.js";

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(helpText());
    return;
  }
  if (options.out && isCsgcOutput(options.out)) {
    return requireChengCsgHeldExecLauncherIdentity();
  }

  if (options.emit === "cheng-source") {
    const result = emitChengSourceFromTs(options);
    if (result.diagnostics.length > 0 || result.unsupported.length > 0) {
      writeFailures(result.diagnostics, result.unsupported);
      process.exitCode = 1;
    }
    await writeOutput(options, result.text || "");
    return;
  }

  if (options.emit === "runtime-closure") {
    const result = emitCsgCoreFromTs(options);
    if (result.diagnostics.length > 0) {
      writeFailures(result.diagnostics, []);
      process.exitCode = 1;
      return;
    }
    await writeOutput(options, stableJson(result.report.runtimeClosure, true) + "\n");
    return;
  }

  if (options.emit === "csg-web") {
    const result = emitCsgWebFromTs(options);
    if (options.reportOut) {
      await writeReport(options, stableJson(result.report, true) + "\n");
    }
    if (result.diagnostics.length > 0) {
      for (const diagnostic of result.diagnostics) {
        process.stderr.write(`error: ${diagnostic}\n`);
      }
      process.exitCode = 1;
      return;
    }
    await writeFactsOutput(options, result.facts, result.text);
    return;
  }

  if (options.emit === "cheng-web-source") {
    const csgWeb = emitCsgWebFromTs(options);
    if (options.reportOut) {
      await writeReport(options, stableJson(csgWeb.report, true) + "\n");
    }
    if (csgWeb.diagnostics.length > 0) {
      for (const diagnostic of csgWeb.diagnostics) {
        process.stderr.write(`error: ${diagnostic}\n`);
      }
      process.exitCode = 1;
      return;
    }
    const materializerOptions: CsgWebMaterializerOptions = {};
    if (options.dumpMode) materializerOptions.dumpMode = true;
    const result = materializeCsgWebFactsToChengSource(csgWeb.text, materializerOptions);
    if (result.diagnostics.length > 0) {
      for (const diagnostic of result.diagnostics) {
        process.stderr.write(`error: ${diagnostic}\n`);
      }
      process.exitCode = 1;
      return;
    }
    await writeOutput(options, result.text);
    return;
  }

  if (options.emit === "csg-js") {
    const result = emitCsgJsFromTs(options);
    if (options.reportOut) {
      await writeReport(options, stableJson(result.report, true) + "\n");
    }
    if (result.diagnostics.length > 0) {
      for (const diagnostic of result.diagnostics) {
        process.stderr.write(`error: ${diagnostic}\n`);
      }
      process.exitCode = 1;
      return;
    }
    await writeFactsOutput(options, result.facts, result.text);
    return;
  }

  if (options.emit === "csg-core") {
    // The serialized facts text is only needed for non-CSGC (JSONL) --out. For
    // report-only or binary .csgc output it would just be a multi-hundred-MB
    // string that overflows V8 on whole-program fact sets — skip building it.
    if (!options.out || isCsgcOutput(options.out)) options.emitText = false;
    const result = emitCsgCoreFromTs(options);
    if (options.reportOut) {
      await writeReport(options, stableJson(result.report, true) + "\n");
    }
    if (options.summaryOut) {
      await writeSummary(options, stableJson(buildCsgCoreSummary(result.report), true) + "\n");
    }
    if (options.indexOut) {
      await writeIndex(options, stableJson(buildCsgCoreIndex(result.facts, result.report), true) + "\n");
    }
    if (result.diagnostics.length > 0) {
      for (const diagnostic of result.diagnostics) {
        process.stderr.write(`error: ${diagnostic}\n`);
      }
      process.exitCode = 1;
      return;
    }
    await writeFactsOutput(options, result.facts, result.text);
    return;
  }

  if (options.emit === "csg-bundle") {
    const bundleDir = options.bundleDir ?? process.cwd();
    const result = emitBundleCsg({ bundleDir, runtime: options.runtime ?? ["browser"] });
    if (options.reportOut) {
      await writeReport(options, stableJson(result.report, true) + "\n");
    }
    if (result.diagnostics.length > 0) {
      for (const diagnostic of result.diagnostics.slice(0, 20)) {
        process.stderr.write(`diagnostic: ${diagnostic}\n`);
      }
      if (result.diagnostics.length > 20) {
        process.stderr.write(`... ${result.diagnostics.length - 20} more diagnostics\n`);
      }
    }
    process.stderr.write(`bundle-csg: ${result.counts.files} files, ${result.counts.totalFacts} facts, ${result.counts.literalFacts} literals, ${result.counts.callFacts} calls, ${result.counts.hookFacts} hooks, ${result.counts.domApiFacts} dom APIs\n`);
    await writeFactsOutput(options, result.facts, result.text);
    return;
  }

  const result = extractTsCsg(options);
  if (result.diagnostics.length > 0 || result.unsupported.length > 0) {
    for (const diagnostic of result.diagnostics) {
      process.stderr.write(`error: ${diagnostic}\n`);
    }
    for (const unsupported of result.unsupported) {
      const loc = unsupported.loc ? `${unsupported.loc.file}:${unsupported.loc.line}:${unsupported.loc.column}` : "<unknown>";
      process.stderr.write(`unsupported: ${loc} ${unsupported.code}: ${unsupported.message}\n`);
    }
    process.exitCode = 1;
    return;
  }

  const text = result.facts.map((fact) => stableJson(fact, options.pretty)).join("\n") + "\n";
  await writeFactsOutput(options, result.facts, text);
}

async function writeFactsOutput(options: CliOptions, facts: readonly CsgFact[], text: string): Promise<void> {
  if (options.out && options.out.endsWith(".csgc")) {
    return requireChengCsgHeldExecLauncherIdentity();
  }
  if (options.out && options.out.endsWith(".csgwebc")) {
    throw new Error("csgwebc output is not the CSG-Core default cargo; use CSG-Core .csgc for unified facts or the dedicated CSG-Web binary pipeline");
    return;
  }
  await writeOutput(options, text);
}

function isCsgcOutput(out: string): boolean {
  return out.endsWith(".csgc");
}

async function writeOutput(options: CliOptions, text: string): Promise<void> {
  if (options.out) {
    const out = path.resolve(options.rootDir ?? process.cwd(), options.out);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, text, "utf8");
    return;
  }

  process.stdout.write(text);
}

async function writeReport(options: CliOptions, text: string): Promise<void> {
  if (!options.reportOut) return;
  const out = path.resolve(options.rootDir ?? process.cwd(), options.reportOut);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, text, "utf8");
}

async function writeSummary(options: CliOptions, text: string): Promise<void> {
  if (!options.summaryOut) return;
  const out = path.resolve(options.rootDir ?? process.cwd(), options.summaryOut);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, text, "utf8");
}

async function writeIndex(options: CliOptions, text: string): Promise<void> {
  if (!options.indexOut) return;
  const out = path.resolve(options.rootDir ?? process.cwd(), options.indexOut);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, text, "utf8");
}

function writeFailures(diagnostics: readonly string[], unsupported: readonly string[]): void {
  for (const diagnostic of diagnostics.slice(0, 100)) {
    process.stderr.write(`error: ${diagnostic}\n`);
  }
  if (diagnostics.length > 100) {
    process.stderr.write(`error: ... ${diagnostics.length - 100} more diagnostics\n`);
  }
  for (const item of unsupported.slice(0, 100)) {
    process.stderr.write(`unsupported: ${item}\n`);
  }
  if (unsupported.length > 100) {
    process.stderr.write(`unsupported: ... ${unsupported.length - 100} more unsupported items\n`);
  }
}

type CliOptions = ExtractOptions & {
  emit?: "ts-csg" | "csg-core" | "csg-js" | "csg-web" | "csg-bundle" | "cheng-source" | "cheng-web-source" | "runtime-closure";
  entry?: string;
  entryRoots?: string[];
  help?: boolean;
  dumpMode?: boolean;
  reportOut?: string;
  summaryOut?: string;
  indexOut?: string;
  runtime?: string[];
  target?: string;
  bundleDir?: string;
  emitText?: boolean;
};

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { files: [] };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--project" || arg === "-p") {
      options.project = requireValue(args, ++index, arg);
    } else if (arg.startsWith("--project=")) {
      options.project = arg.slice("--project=".length);
    } else if (arg === "--file" || arg === "-f") {
      options.files?.push(requireValue(args, ++index, arg));
    } else if (arg.startsWith("--file=")) {
      options.files?.push(arg.slice("--file=".length));
    } else if (arg === "--out" || arg === "-o") {
      options.out = requireValue(args, ++index, arg);
    } else if (arg.startsWith("--out=")) {
      options.out = arg.slice("--out=".length);
    } else if (arg === "--emit") {
      options.emit = parseEmit(requireValue(args, ++index, arg));
    } else if (arg.startsWith("--emit=")) {
      options.emit = parseEmit(arg.slice("--emit=".length));
    } else if (arg === "--runtime") {
      options.runtime = parseRuntime(requireValue(args, ++index, arg));
    } else if (arg.startsWith("--runtime=")) {
      options.runtime = parseRuntime(arg.slice("--runtime=".length));
    } else if (arg === "--report-out") {
      options.reportOut = requireValue(args, ++index, arg);
    } else if (arg.startsWith("--report-out=")) {
      options.reportOut = arg.slice("--report-out=".length);
    } else if (arg === "--summary-out") {
      options.summaryOut = requireValue(args, ++index, arg);
    } else if (arg.startsWith("--summary-out=")) {
      options.summaryOut = arg.slice("--summary-out=".length);
    } else if (arg === "--index-out") {
      options.indexOut = requireValue(args, ++index, arg);
    } else if (arg.startsWith("--index-out=")) {
      options.indexOut = arg.slice("--index-out=".length);
    } else if (arg === "--target") {
      options.target = requireValue(args, ++index, arg);
    } else if (arg.startsWith("--target=")) {
      options.target = arg.slice("--target=".length);
    } else if (arg === "--entry") {
      options.entry = requireValue(args, ++index, arg);
    } else if (arg.startsWith("--entry=")) {
      options.entry = arg.slice("--entry=".length);
    } else if (arg === "--entry-root") {
      pushEntryRoot(options, requireValue(args, ++index, arg));
    } else if (arg.startsWith("--entry-root=")) {
      pushEntryRoot(options, arg.slice("--entry-root=".length));
    } else if (arg === "--bundle-dir") {
      options.bundleDir = requireValue(args, ++index, arg);
    } else if (arg.startsWith("--bundle-dir=")) {
      options.bundleDir = arg.slice("--bundle-dir=".length);
    } else if (arg === "--root") {
      options.rootDir = requireValue(args, ++index, arg);
    } else if (arg.startsWith("--root=")) {
      options.rootDir = arg.slice("--root=".length);
    } else if (arg === "--pretty") {
      options.pretty = true;
    } else if (arg === "--dump") {
      options.dumpMode = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown argument: ${arg}`);
    } else {
      options.files?.push(arg);
    }
  }

  if (options.files && options.files.length === 0) {
    delete options.files;
  }
  return options;
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value || value.startsWith("-")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parseEmit(value: string): "ts-csg" | "csg-core" | "csg-js" | "csg-web" | "csg-bundle" | "cheng-source" | "cheng-web-source" | "runtime-closure" {
  if (value === "relfacts") {
    throw new Error("pure Cheng csg_relfacts::v1 CLI entry is unavailable");
  }
  if (value === "ts-csg" || value === "csg-core" || value === "csg-js" || value === "csg-web" || value === "csg-bundle" || value === "cheng-source" || value === "cheng-web-source" || value === "runtime-closure") return value;
  throw new Error(`unknown --emit value: ${value}`);
}

function parseRuntime(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
}

function pushEntryRoot(options: CliOptions, value: string): void {
  options.entryRoots ??= [];
  options.entryRoots.push(value);
}

function helpText(): string {
  return `ts-csg: TypeScript -> Cheng Semantic Graph facts

Usage:
  ts-csg --project tsconfig.json --out out.csgc
  ts-csg --emit csg-core --project tsconfig.json --runtime node,browser --out out.csgc --summary-out summary.json --index-out facts.idx.json
  ts-csg --emit csg-js --project tsconfig.json --runtime node,browser --out out.csgc --report-out report.json
  ts-csg --emit csg-web --project tsconfig.json --runtime node,browser --out out.csgcore --report-out report.json
  ts-csg --emit cheng-web-source --project tsconfig.json --out out.cheng
  ts-csg --emit runtime-closure --project tsconfig.json --runtime node,browser --out runtime-closure.json
  ts-csg --emit cheng-source --project tsconfig.json --out out.cheng
  ts-csg --file src/main.ts --out out.csgc

Options:
  --emit <kind>        ts-csg (default), csg-core, csg-js, csg-web, runtime-closure, cheng-source, or cheng-web-source
  --project, -p <path>  TypeScript project file
  --file, -f <path>     Source file, repeatable
  --runtime <list>     Runtime surface for csg-core/csg-web: node,browser
  --summary-out <path>  Lightweight production summary for csg-core
  --index-out <path>  External csg-core query index for files/symbols/functions/calls
  --report-out <path>  Full debug JSON coverage/runtime/unsupported report; can be large
  --entry-root <path>  Expected project entry root for csg-core/csg-web, repeatable
  --target <triple>    Target metadata for Cheng source generation
  --entry <name>       Entry function for Cheng source generation
  --root <path>         Root used for relative paths
  --out, -o <path>      Output facts; *.csgc writes unified CSGC through pure Cheng, other fact outputs write debug JSONL
  --pretty             Pretty-print debug JSON facts
  --dump               Enable DOM/layout/screenshot dump mode for oracle comparison
  --help, -h           Show this help
`;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`error: ${message}\n`);
  process.exitCode = 1;
});
