# UniMaker semantic manifest diff

Per-node / per-prop / per-handler / per-hit-target / per-edge runtime diff between
the React-side scene facts and the pure-Cheng Android runtime graph.

## Files

| File | Role |
| --- | --- |
| `ts-csg/scripts/scene-semantic-manifest-block.cheng` | Cheng `@exportc` block appended to `unimaker-react.scene-runtime.cheng`. Exposes `cheng_app_debug_semantic_*` accessors over `__csgSceneGraph`. |
| `ts-csg/scripts/semantic_manifest_probe.c` | Android headless probe. Initializes the runtime graph and writes `unimaker.scene_manifest.v1` JSON for all eight arrays. |
| `ts-csg/scripts/unimaker-semantic-diff.mjs` | Node diff tool. Joins React and Cheng manifests record-by-record and field-by-field. |
| `unimaker-react.scene-manifest.json` | React-side manifest written by `unimaker-one-click.mjs` after CHT compilation (same post-rewrite facts that go into the data asset). |
| `unimaker-semantic-diff.json` | Durable diff report. |

`unimaker-one-click.mjs` now appends the semantic block to the retained scene
runtime source and writes the React manifest automatically.

## Produce the React side

The retained-scene-only command used for the r12b evidence set is:

```bash
node ts-csg/scripts/unimaker-one-click.mjs \
  --out-dir src/.gen/oneclick-r12-computer-use \
  --retained-scene-only --no-run --stop-after materialize \
  --mobile-scene-route home_default:app/components/HomePage.tsx:HomePage \
  --mobile-scene-route home_search_open:app/components/HomePage.tsx:HomePage \
  --mobile-scene-route home_sort_open:app/components/HomePage.tsx:HomePage \
  --mobile-scene-route home_image_detail_open:app/components/HomePage.tsx:HomePage \
  --mobile-scene-route tab_profile:app/components/ProfilePage.tsx:ProfilePage \
  --mobile-scene-route publish_content:app/components/PublishVideoPage.tsx:PublishVideoPage \
  --mobile-scene-route publish_ad:app/components/PublishAdPage.tsx:PublishAdPage \
  --mobile-scene-route publish_product:app/components/PublishProductPage.tsx:PublishProductPage \
  --mobile-scene-route ecom_main:app/components/EcomFeedPage.tsx:EcomFeedPage \
  --mobile-scene-route tab_messages:app/components/MessagesPage.tsx:MessagesPage \
  --mobile-scene-route message_thread:app/components/ChatPage.tsx:ChatPage \
  --mobile-scene-direct-route home_image_detail_open_img1 \
  --mobile-scene-direct-route publish_content \
  --mobile-scene-direct-route publish_ad \
  --mobile-scene-direct-route publish_product \
  --mobile-scene-direct-route message_thread \
  --mobile-content-snapshot-file ts-csg/scripts/unimaker-fixtures/unimaker-pwa-content-snapshot.json \
  --require-glyph-sdf-precompute-cache-hit
```

Expected logs:

```text
React scene manifest: routes=11, nodes=3112, props=6555, eventHandlers=582,
hitTargets=568, edges=35, cssDecls=1533, layouts=11637
semantic manifest block: appended 11003 chars
```

## Produce the Cheng side

Compile the retained scene runtime for Android:

```bash
CHENG_PROCESS_MAX_RSS_BYTES=8589934592 CHENG_DISABLE_PRIMARY_OBJECT_CACHE=1 \
artifacts/bootstrap/cheng.stage3 system-link-exec \
  --root:$PWD \
  --in:src/.gen/oneclick-r12-computer-use/unimaker-react.scene-runtime.cheng \
  --emit:obj --target:aarch64-linux-android \
  --out:/tmp/app_semantic.o --report-out:/tmp/app_semantic.report.txt
```

Link the generated object with the Android NDK runtime:

```bash
NDK=$ANDROID_HOME/ndk/26.3.11579264/toolchains/llvm/prebuilt/darwin-x86_64
$NDK/bin/ld.lld -shared --soname=libcheng_unimaker_scene.so \
  --allow-shlib-undefined -z now \
  -o /tmp/libcheng_unimaker_scene.semantic.so /tmp/app_semantic.o \
  $NDK/sysroot/usr/lib/aarch64-linux-android/30/libm.so \
  $NDK/sysroot/usr/lib/aarch64-linux-android/30/libdl.so \
  $NDK/sysroot/usr/lib/aarch64-linux-android/30/libc.so \
  $NDK/lib/clang/17/lib/linux/libclang_rt.builtins-aarch64-android.a \
  $NDK/lib/clang/17/lib/linux/aarch64/libunwind.a
patchelf --add-needed libcheng_scene_runtime_provider.so \
  /tmp/libcheng_unimaker_scene.semantic.so
```

Push the app library, updated `runtime/unimaker_scene_data.bin`, and probe:

```bash
cp /tmp/libcheng_unimaker_scene.semantic.so /tmp/cap_r17/libcheng_unimaker_scene.so
adb push /tmp/cap_r17/libcheng_unimaker_scene.so \
  /data/local/tmp/cheng_cap_r17/libcheng_unimaker_scene.so
adb push src/.gen/oneclick-r12-computer-use/runtime/unimaker_scene_data.bin \
  /data/local/tmp/cheng_cap_r17/runtime/unimaker_scene_data.bin
adb shell "cd /data/local/tmp/cheng_cap_r17 && \
  CHENG_HEADLESS_ASSET_DIR=/data/local/tmp/cheng_cap_r17 \
  LD_LIBRARY_PATH=/data/local/tmp/cheng_cap_r17 \
  ./semantic_manifest_probe /data/local/tmp/cheng_cap_r17/cheng_semantic_manifest.json"
adb pull /data/local/tmp/cheng_cap_r17/cheng_semantic_manifest.json \
  /tmp/cheng_semantic_manifest.json
```

`CHENG_HEADLESS_ASSET_DIR` points at the **parent** of `runtime/`; the host
reader appends the bundle-relative path `runtime/unimaker_scene_data.bin`
itself.

## Diff

Full mode (record-by-record):

```bash
node ts-csg/scripts/unimaker-semantic-diff.mjs \
  --cheng-manifest /tmp/cheng_semantic_manifest.json \
  --react-manifest src/.gen/oneclick-r12-computer-use/unimaker-react.scene-manifest.json \
  --summary src/.gen/oneclick-r12-computer-use/one-click.summary.json \
  --route-edge-details src/.gen/oneclick-r12-computer-use/unimaker-react.route-edge-details.json \
  --output src/.gen/oneclick-r12-computer-use/unimaker-semantic-diff.json
```

Exit status is `0` only when every table is exact. The report schema is
`unimaker.semantic_diff.v2` and includes, for each of
`routes / nodes / props / event_handlers / hit_targets / route_edges /
css_declarations / layout_constraints`:

- array counts;
- records joined by deterministic array index;
- per-field mismatches with `react` and `cheng` values;
- duplicate identity keys and extra records when counts differ.

Without `--react-manifest`, the tool falls back to summary scene counts plus
`route-edge-details.json` node parent/tag and resolved route-edge set checks.
Fallback cannot perform per-prop/per-handler/css field joins.

## r12b verified evidence

Cheng runtime manifest produced from the regenerated data asset (tagName
fix present):

```text
routes=11 nodes=3112 props=6555 handlers=582 hit_targets=568 edges=35
css_decls=1533 layouts=11637
```

Full diff result: `complete=true`, all eight tables exact. Artifacts:

- `src/.gen/oneclick-r12-computer-use/unimaker-react.scene-manifest.json`
- `src/.gen/oneclick-r12-computer-use/unimaker-react.scene-manifest.cheng.json`
- `src/.gen/oneclick-r12-computer-use/unimaker-semantic-diff.json`
