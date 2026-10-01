import assert from "node:assert/strict";

import {
  emitCsgWebSceneFacts,
  materializeCsgWebFactsToChengSource,
} from "../dist/csg-web-materializer.js";
import { CsgWebMaterializerFactKinds } from "../dist/csgc-reader.js";

assert(CsgWebMaterializerFactKinds.length > 0);
assert.deepEqual(
  CsgWebMaterializerFactKinds,
  [...new Set(CsgWebMaterializerFactKinds)].sort(),
  "materializer fact kinds must be strictly sorted and unique",
);

for (const entry of [
  materializeCsgWebFactsToChengSource,
  emitCsgWebSceneFacts,
]) {
  assert.throws(
    () => entry("CSGC\0physical-bytes-are-not-a-text-api"),
    /in-memory CSGC materialization is forbidden/,
  );
  assert.throws(
    () => entry("/nonexistent/production-input.csgc"),
    /requires an explicit current-HEAD manifest path/,
  );
}

process.stdout.write("csg_web_materializer_lazy_authority_smoke ok\n");
