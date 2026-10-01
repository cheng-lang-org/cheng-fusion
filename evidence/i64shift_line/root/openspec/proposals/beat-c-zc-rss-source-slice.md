> **口径迁移（2026-09-08 用户令）**：内存模型理论极限=768MiB=805,306,368 bytes；本文历史 1GiB/1073741824 为迁移前口径，当前守卫与验收一律以 768MiB 为准。

# Beat-C ZC RSS Source-Slice Typed Facts

状态: applying。source-slice/accumulator 代码已落地，动态 ZC 与 1GiB 门禁尚未完成。

目标: 关闭 `docs/beat-c.md §1` 中 `zc_zero` 的 1GiB RSS blocker。当前只提出 source 改动合同，不声明完成。

## 问题

历史 1GiB ZC 失败不是未知失败。`artifacts/perf/beat-c/zc_rss_diagnosis.txt` 当时定位为:

```text
zc_rss_diagnosis_status=diagnosed
zc_rss_diagnosis_reason=rss_limit_exceeded_after_compiler_csg_typed_facts
zc_rss_root_class=compiler_csg_typed_facts_retained_rss
last_typed_facts_count=7315
max_phase_trace_rss_kb=1050368
```

以下旧源码触点已经被流式实现替换，不再是当前生产结构:

- `CompilerCsgAppendSourceExprLayerFacts`: per-source/chunk 构建 typed facts 后追加到全局 `typedExprFacts`，同时保留 fact expr layer 和 typed-ir expr layer。
- profile loop: 临时 `sourceExprLayer` 已清，但全局 facts/layers append-only 保留。
- after-profile cleanup: `reuseLinkPlanExprLayer=false` 下仍有 `retainedFactExprLayer = parser.NormalizedExprLayerClone(exprLayer)`。
- final build: `typedExprFacts` 被 `CompilerCsgReachableExpandFromTypedFacts`、`CompilerCsgTypedFactsForFrontierSources`、`CompilerCsgV2BuildTypedFactTable`、graph cid 和 `out.typedExprFacts` 消费。

当前实现不再保留或最终重建全量 `typedExprFacts`；该诊断仍是验收基线，不能靠提高 RSS 关闭。

## 决议

把 compiler CSG typed facts 从“全局对象数组长期保留”改成“source/function slice + compact V2 accumulator”，不做 late full materialization。

核心规则:

1. 每个 source/function slice 在局部 `TypedExprFactTable` 中生成、规范化、消费并 reset；禁止追加到全局 facts object array。
2. `CompilerCsgV2TypedFactAccumulator` 直接提交 compact row，slice metadata 绑定 `sourceIndex/sourcePath/functionIndex/factStart/factCount`。
3. frontier 只提交当前 touched function 的稀疏 transaction；失败不得修改 live graph、output 或 cache。
4. graph cid 只消费稳定的 compact count/graph facts；`out.typedExprFacts` 保持物理空表，正式 payload 在 `out.v2`。
5. reusable source context 与局部 fact table 由 owner 在 slice 结束时 reset，在 build 终点 terminal release。
6. 物理顺序必须稳定；同一输入重复编译的 CSG hash 不得漂移。

## 分阶段执行

### 阶段 1: slice schema

- 在 compiler_csg 内部新增 typed fact slice metadata。
- `CompilerCsgV2AppendExprSlice` 旁路记录 source fact range。
- 只改内部表示，不改变 `out.typedExprFacts` wire 行为。

验收:

- `bash -n tools/beat_c_baseline.sh tools/beat_c_diagnose_zc_rss.sh`
- 小 fixture CSG hash 不漂移。
- `BEAT_C_SELF_TEST=1 tools/beat_c_baseline.sh`

### 阶段 2: frontier consumers

- `CompilerCsgV2AppendUnprocessedFrontierFacts` 按 touched function range 生成稀疏 transaction。
- 禁止扫描全局 facts 后再过滤，禁止为事务 clone 全量 processed/local/queued 状态。
- `CompilerCsgReachableExpandFromTypedFacts` 只消费当前局部 slice。

验收:

- fnptr/sret fixtures 不新增 `missing_call_target`。
- debug runtime 小闭包不新增 `bail=44`。

### 阶段 3: CSG v2 / graph cid consumers

- `CompilerCsgV2TypedFactAccumulatorAppend/Finish` 直接构建 compact typed-fact table。
- graph cid / canonical graph cid 消费 compact typed-fact count 与稳定图事实，不 materialize 全量 fact object。
- `out.typedExprFacts` 必须为空且 `typedFactsLiveBytes=0`；binary payload 以 `out.v2` 为准。

验收:

- 同一输入重复编译 CSG hash 一致。
- graph cid 若故意改变，必须记录 schema/version bump；否则必须 byte-identical。

### 阶段 4: retained expr layer cleanup

- 去掉不必要的 `exprLayer -> retainedFactExprLayer` 整层 clone。
- 只保留最终输出或 TypedIR 必需的 expr slice。
- source/chunk 临时层消费后清空，并用 report 证明 RSS 峰值下降。

验收:

- `zc_rss_diagnosis` 不再定位到 `compiler_csg_typed_facts_retained_rss`。
- `zc_max_rss_bytes <= 1073741824`。

## 验收门

完成 `zc_zero` 必须有真实 report:

```text
zc_enumerate_rc=0
zc_missing_function_count=0
zc_abort_reason=
zc_max_rss_bytes <= 1073741824
```

并且必须同时生成 source mutation safety proof:

```text
proof_kind=source_mutation_safety
schema_version=beat_c_proof
status=proved
stage3_rebuild=passed
full_zc_delta_no_bail44_cascade=1
source_diff_hash=nonempty
```

## 禁止项

- 不得提高 RSS 作为修复。
- 不得重复跑同一失败 ZC 冒充推进。
- 不得新增 ghost module/comment mutation。
- 不得只删/清空 `typedExprFacts` 而不改全部消费者。
- 不得让 `ci_gate`、cold subset、dry-compile 代替 1GiB full ZC。

## 当前完成状态

本 proposal 已进入 apply 候选。当前只完成 RSS 修复候选源码改动与低成本 dry-compile 预检；
`docs/beat-c.md §1` 仍必须保持:

```text
status=incomplete
reason includes zc_zero
```
