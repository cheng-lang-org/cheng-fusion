# Beat-C Source Mutation Safety Closure

状态: proposed。未获用户确认前不得 apply 到 `.cheng` source、ghost module、注释或 compiler/runtime 配置。

目标: 关闭 `docs/beat-c.md §1` 中 `source_mutation_safety` completion item。当前只提出证明合同，不声明完成。

## 当前事实

`artifacts/perf/beat-c/source_mutation_safety_inventory.tsv` 当前 11 行，hash:

```text
d654815380907e28cdd21cca53c16e4ce25c4351b891d7e32c2b777a8aab1867
```

当前 master audit 仍是:

```text
source_mutation_safety=missing
source_mutation_safety_reason=not_imported
completion_missing_count=8
```

当前 `.cheng` source dirty surface 只能作为风险输入，不是完成证据:

```text
dirty_tracked_cheng=330
dirty_untracked_cheng=29
dirty_total_cheng=359
```

## 决议

任何 `.cheng` source、ghost module 或注释级变更，只要可能进入 stage3 self-host、typed_expr、primary lowering、provider/link、CSG/ZC 或 runtime path，都必须用 stage3 rebuild 与 full ZC delta 证明安全。

source mutation safety 的作用不是证明某个修复完成，而是证明“这批 source mutation 没有制造新的 `bail=44` cascade 或隐藏 not-ready 回归”。

## 分阶段执行

### 阶段 1: source diff boundary

建立稳定 source diff 边界:

- changed tracked `.cheng` file list
- untracked `.cheng` file list
- source diff hash
- touched compiler/runtime/prover domain
- forbidden route scan

禁止:

- 把 dirty worktree 本身当 proof。
- 用 ghost module/comment mutation 证明“无语义影响”。
- 用 `ci_gate`、`cc`、dry-compile 或 default baseline rc=0 代替 stage3/full ZC。

验收:

```text
source_diff_hash=<nonempty_sha256_or_stable_diff_id>
source_mutation_forbidden_route_count=0
```

### 阶段 2: stage3 rebuild

必须证明当前 source diff 进入 stage3 self-host 路径，并产出可绑定 driver hash。

验收:

```text
stage3_rebuild=passed
stage3_driver_sha256=<nonempty_sha256>
```

禁止:

- 用 stale driver。
- 用 cold subset、single fixture、bootstrap wrapper 或 dry-compile 冒充 stage3 rebuild。
- 用外部失败尝试导入 completion proof。

### 阶段 3: full ZC delta

必须在同一 source diff / driver hash 下跑 full ZC delta，并证明没有 `bail=44` cascade。

验收:

```text
full_zc_delta_no_bail44_cascade=1
bail44_before=<count>
bail44_after=<count>
full_zc_report_sha256=<nonempty_sha256>
full_zc_delta_report_sha256=<nonempty_sha256>
full_zc_delta_unexpected_regression=0
```

如果 full ZC 因 RSS abort，则不能生成 source mutation safety proof；必须先修 RSS 或导入有效 ZC zero/delta report。

### 阶段 4: completion proof

只有以下字段同时成立，才允许生成 source mutation safety proof:

```text
proof_kind=source_mutation_safety
schema_version=beat_c_proof
status=proved
stage3_rebuild=passed
full_zc_delta_no_bail44_cascade=1
source_diff_hash=<nonempty_sha256_or_stable_diff_id>
stage3_driver_sha256=<sha256>
full_zc_report_sha256=<sha256>
full_zc_delta_report_sha256=<sha256>
bail44_before=<count>
bail44_after=<count>
full_zc_delta_unexpected_regression=0
source_mutation_forbidden_route_count=0
```

导入前必须通过:

```sh
tools/beat_c_validate_proof_report.sh source_mutation_safety <report>
```

导入后必须重新运行 default/import-only baseline，并确认:

```text
source_mutation_safety=proved
completion_missing_count decreases by 1
```

## 禁止项

- 不得把 Result variant/helper-wrap/helper rename 当成 source safety proof；它们如果没有改变 typed_expr
  观测到的 aggregate ctor / rhs_call_surface 形态，只会保留原 bail。
- 不得把 source mutation inventory、repair proposals guard、audit integrity 或 doc snapshot 写成完成证明。
- 不得在未获用户确认前修改 `.cheng` source/ghost/comment。
- 不得提高 RSS 上限硬跑来掩盖 `zc_zero` 或 full ZC delta 缺口。

## 当前完成状态

本 proposal 只完成 propose。`docs/beat-c.md §1` 仍必须保持:

```text
status=incomplete
reason includes source_mutation_safety
completion_missing_count=8
```
