// 私有包布局暂存根：现行 cheng_cold 要求 root 有 cheng-package.toml、入口在 src/ 下、
// std/core 实体在包内（realpath 前缀检查拒绝符号链接外挂）。本 helper 为 stage3 真编
// 测试提供隔离的 scratch 包，绝不写共享主树。
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const MAIN_TREE = "/Users/lbcheng/cheng-lang";

export function makeScratchPackage(tag) {
  const rootDir = mkdtempSync(join(tmpdir(), `${tag}-`));
  writeFileSync(join(rootDir, "cheng-package.toml"), `package_id = "${tag}"\n`);
  const srcDir = join(rootDir, "src");
  mkdirSync(srcDir, { recursive: true });
  cpSync(join(MAIN_TREE, "src", "std"), join(srcDir, "std"), { recursive: true });
  cpSync(join(MAIN_TREE, "src", "core"), join(srcDir, "core"), { recursive: true });
  cpSync(join(MAIN_TREE, "src", "apps"), join(srcDir, "apps"), { recursive: true });
  let counter = 0;
  return {
    rootDir,
    writeSource(basename, text) {
      counter += 1;
      const rel = `src/prog_${counter}_${basename}`;
      writeFileSync(join(rootDir, rel), text);
      return rel;
    },
  };
}
