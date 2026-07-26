import {afterEach, describe, expect, test} from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  validateRemovedBackend2IndependentEmitterModules,
} from "../src/cheng_regalloc_preflight_m9022.ts";

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop()!, {recursive: true, force: true});
  }
});

function fixtureRoot(): string {
  const root = mkdtempSync(
    join(tmpdir(), "regalloc-current-single-emitter-"),
  );
  roots.push(root);
  mkdirSync(join(root, "src/core/backend2"), {recursive: true});
  return root;
}

describe("current backend2 canonical regalloc singleton", () => {
  test("all removed independent emitter modules remain absent", () => {
    const result =
      validateRemovedBackend2IndependentEmitterModules(fixtureRoot());
    expect(result.map((entry: {label: string}) => entry.label)).toEqual([
      "removed/src/core/backend2/backend2_emit.cheng",
      "removed/src/core/backend2/backend2_emit_ops.cheng",
      "removed/src/core/backend2/backend2_frame.cheng",
    ]);
  });

  test("reintroducing an independent emitter is a hard failure", () => {
    const root = fixtureRoot();
    writeFileSync(
      join(root, "src/core/backend2/backend2_emit_ops.cheng"),
      "fn IndependentEmitterReturned(): int32 =\n    return 1\n",
    );
    expect(
      () => validateRemovedBackend2IndependentEmitterModules(root),
    ).toThrow(
      "removed independent backend2 emitter module is present: " +
        "src/core/backend2/backend2_emit_ops.cheng",
    );
  });
});
