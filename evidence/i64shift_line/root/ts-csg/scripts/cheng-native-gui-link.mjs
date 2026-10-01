import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chengSmokeEnv } from "./cheng-smoke-env.mjs";

/**
 * Pure-Cheng GUI link path.
 *
 * Production path: backend_driver system-link-exec --emit:exe with Darwin
 * runtime provider (int32 handle table + drawlist command state).
 *
 * Legacy Cocoa dual-link (emit:obj + support/cocoa_bridge.m) is NOT production:
 * modern primary objects also need runtime provider symbols (Assert, seq, str
 * bridges) that cocoa_bridge does not export. Enabling CHENG_GUI_COCOA=1 will
 * hard-fail with linker diagnostics rather than pretend Cocoa is linked.
 */
export function compileNativeGuiChengSourceToExe(options) {
  const {
    repoRoot,
    sourcePath,
    exePath,
    outDir,
    reportPath,
    cheng,
    timeout = 120000,
  } = options;

  if (process.platform !== "darwin") {
    throw new Error("native Cheng GUI execution requires a Darwin host");
  }
  if (!existsSync(sourcePath)) throw new Error(`missing Cheng source: ${sourcePath}`);
  if (!existsSync(cheng)) throw new Error(`missing Cheng compiler: ${cheng}`);

  mkdirSync(outDir, { recursive: true });

  if (process.env.CHENG_GUI_COCOA === "1") {
    throw new Error(
      "CHENG_GUI_COCOA=1 is blocked: cocoa dual-link is incomplete (missing runtime provider symbols). " +
        "Use system-link-exec --emit:exe (default pure-Cheng provider path). " +
        "Real Cocoa surface requires Darwin provider Window/Surface present, not support/*.m stubs.",
    );
  }

  const args = [
    "system-link-exec",
    `--root:${repoRoot}`,
    `--in:${sourcePath}`,
    "--emit:exe",
    "--target:arm64-apple-darwin",
    `--out:${exePath}`,
    `--report-out:${reportPath}`,
  ];
  // env-gated 额外 provider 对象注入(本任务: 并发 lane 未提供的 ORC diag stub)
  if (process.env.CSG_PROVIDER_OBJECTS_DIR) {
    args.push(`--provider-objects:${process.env.CSG_PROVIDER_OBJECTS_DIR}`);
  }
  if (process.env.CSG_EXPORT_ROOTS) {
    args.push(`--export-roots:${process.env.CSG_EXPORT_ROOTS}`);
  }

  execFileSync(cheng, args, {
    cwd: repoRoot,
    // RSS 守卫探针必须针对真实参与编译的 binary 校验（默认 backend_driver 路径可能不存在），
    // 预算与 unimaker 生产管线一致（8GiB）。
    env: chengSmokeEnv({
      CHENG_PROCESS_MAX_RSS_BYTES: process.env.CHENG_PROCESS_MAX_RSS_BYTES ?? "8589934592",
    }, cheng, repoRoot),
    stdio: ["ignore", "pipe", "pipe"],
    timeout,
  });

  if (!existsSync(exePath)) {
    throw new Error(`system-link-exec produced no executable: ${exePath}`);
  }

  return {
    mode: "system_link_exec_emit_exe",
    surface: "darwin_provider_handle_table",
    cocoaLinked: false,
    exePath,
    reportPath,
  };
}
