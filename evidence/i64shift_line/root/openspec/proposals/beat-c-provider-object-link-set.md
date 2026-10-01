# Beat-C Provider Object Link Set Closure

状态: proposed。未获用户确认前不得 apply 到 `.cheng` source 或 provider/link 配置。

目标: 关闭 `docs/beat-c.md §1` 中 `provider_object_link_set` completion item。当前只提出修复合同，不声明完成。

## 2026-07-01 scope correction

本 proposal 最初按旧 `provider_object_link_set_inventory.tsv` 的 8 行缺口制定。当前工作树已经包含两类
`bail=0 missing_call_target` 源码侧闭环:

- `strToCStringTemp(s: ptr)` dead overload 已改名为 `ptrToCStringTemp(s: ptr)`，保留 `strToCStringTemp(s: str)`。
- `fixed256.Sha256Fixed` active wrapper 已删除，`biometric` 4 个调用点改为 `hash256.Sha256Fixed`。

这些变更的静态账本为:

```text
artifacts/perf/beat-c/bail0_source_side_progress.tsv
sha256=86748f51c2f8d4d28f68033601babcab65a23c75224abdd0cd16cf196a926bb7
rows=11
proved=10
missing=1
missing_row=provider_object_link_set_completion_still_missing
```

因此，旧 8 行 inventory 现在只能作为历史诊断输入，不能继续直接当作下一步 implementation list。
`provider_object_link_set` 仍不能关闭，因为还缺:

- 绑定当前 driver 的 proof report。
- `source_mutation_safety` proof。
- stage3 rebuild / full ZC delta / current-official exec_diff 证据。
- 两个 fnptr indirect/sret fixture 的当前 driver 证明。

后续 apply 必须先重算当前 inventory；若旧 `strToCStringTemp`/`Sha256Fixed` 行已消失，不得重新实现它们。

## 当前事实

`artifacts/perf/beat-c/provider_object_link_set_inventory.tsv` 当前仍是旧 8 行 `missing_call_target`
输入证据，hash:

```text
3dbbc19656f0f429e7f2992637353ade4dcea2697bd3d3421cb9b44432ff1511
```

该旧 8 行分两类，但其中 provider/helper target 方向已被 2026-07-01 scope correction 收窄:

| 类别 | 当前行 | 正确修复方向 |
| --- | --- | --- |
| 函数指针 indirect/sret | `digestConcatMini -> digest`, `pairViaCallback -> callback` | 真实 indirect call；聚合返回按 Darwin arm64 sret ABI 证明；禁止把形参名注册成静态 target |
| provider/link target set | `FixedCidFromBuf`, `FixedCidFromBuf -> Sha256Fixed`, `udpInetPton`, `udpInetPton -> strToCStringTemp`, `fileMtime`, `fileMtime -> strToCStringTemp` | 旧诊断输入；当前必须先重算 inventory。已由源码侧 PObjP 歧义闭环覆盖的行不得重复施工 |

当前 master audit 仍是:

```text
provider_object_link_set=missing
provider_object_link_set_reason=not_imported
bail0_missing_call_target_current_count=8
```

## 决议

`provider_object_link_set` 不能靠无证明修改调用方源码来“绕开”缺口。对 PObjP text-only
AnySource 同名歧义，允许在用户确认后做语义等价的 dead-overload rename / active-wrapper dedup，
但必须用源码账本、stage3 rebuild、full ZC delta 和 proof report 证明。

1. `FixedCidFromBuf` 这类 qualified/imported pure target 必须进入 structured link target set。
2. `udpInetPton/fileMtime` 内部调用的 `strToCStringTemp` 旧缺口必须用当前 inventory 重新确认；已由
   `ptrToCStringTemp` 改名消除的行不得按 provider helper target 再修一次。
3. 函数指针形参调用必须走真实 indirect call lowering；如果返回聚合值，必须显式处理 sret ABI。
4. proof report 只能在当前 inventory 中的 `missing_call_target` 全部归零后生成。
5. report 必须绑定 driver hash，不能只绑定 source diff、单模块 cold 编译或 fixture stdout。

## 分阶段执行

### 阶段 1: target 分类账本

从当前 `provider_object_link_set_inventory.tsv` 和 `bail0_source_side_progress.tsv` 生成确定性分类:

- `fnptr_indirect_sret`: 2 行。
- `qualified_pure_target`: 当前仍存在的 `FixedCidFromBuf` 行。
- `std_provider_helper_target`: 当前仍存在的 provider/helper 行。
- `source_side_pobjp_ambiguity_closed`: `ptrToCStringTemp` dead-overload rename、`Sha256Fixed` active-wrapper dedup。

验收:

- 分类行数合计必须等于当前 inventory 行数加 source-side progress 行数。
- 每行必须保留 `function/target/line/report_path`。
- 分类账本本身仍是 `not_completion_evidence`。

### 阶段 2: provider/link target set

修复当前仍存在的 link target set 构建，使 imported qualified target 和 provider helper target 都能进入同一结构化闭包。

必须覆盖:

- `FixedCidFromBuf`
- `udpInetPton`
- `fileMtime`
- `strToCStringTemp`

禁止:

- 在调用方预先包一层 helper 只为改变表面形态。
- 把 `strToCStringTemp` 调用改名后直接当作 completion proof；它只算 source-side progress，仍需 proof import。
- 用 source-level 静态 target 注册掩盖 link-set 缺口。

验收:

- 当前 oracle ZC 中仍存在的 provider/link target 行 `missing_call_target` 为 0。
- provider/link report 写出稳定 `provider_object_link_set_hash`。
- driver report 绑定 `driver_sha256`。
- provider/link 产物绑定 `provider_object_report_sha256` 与 `provider_object_archive_sha256`。
- `source_level_call_target_patch_count=0`，`static_fnparam_target_registration_count=0`。

### 阶段 3: fnptr indirect/sret

修复 `fn(T):U` 形参调用:

- `digestConcatMini` 的 `digest` 是函数指针形参，不是静态函数名。
- `pairViaCallback` 的 `callback` 是函数指针形参，且返回聚合 `Pair`。
- lowering 必须生成真实 indirect call。
- 聚合返回必须按 Darwin arm64 sret ABI 对拍。

禁止:

- 把 `digest` 或 `callback` 注册成静态 call target。
- 写 fixture 专用解析。
- 用 C shim 兜底绕过 Cheng lowering。

验收:

- `src/tests/exec_diff_corpus/return_fnptr_nested_call.cheng` report 为 `full_backend_codegen=1` 且 `primary_object_missing_function_count=0`。
- `src/tests/exec_diff_corpus/return_fnptr_agg_sret.cheng` report 为 `full_backend_codegen=1` 且 `primary_object_missing_function_count=0`。

### 阶段 4: completion proof

只有以下条件同时满足，才允许生成 provider_object_link_set proof:

```text
proof_kind=provider_object_link_set
schema_version=beat_c_proof
status=proved
missing_call_target_count=0
provider_object_link_set_hash=<nonempty_hash>
driver_sha256=<nonempty_driver_sha256>
provider_object_report_sha256=<sha256>
provider_object_archive_sha256=<sha256>
current_provider_inventory_sha256=<sha256>
provider_inventory_freshness_sha256=<sha256>
provider_inventory_freshness_blocked_count=0
source_level_call_target_patch_count=0
static_fnparam_target_registration_count=0
fnptr_indirect_sret_fixture_count=2
qualified_provider_target_count=<positive_current_inventory_count>
```

导入前必须通过:

```sh
tools/beat_c_validate_proof_report.sh provider_object_link_set <report>
```

导入后必须重新运行 default/import-only baseline，并确认:

```text
provider_object_link_set=proved
completion_missing_count decreases by 1
```

## 验证门

最小验证:

1. 两个 fnptr fixture 都 `missing_count=0`。
2. oracle 中 `current_provider_object_inventory.tsv` 的 provider/link target 行归零。
3. `current_provider_object_inventory.tsv` 保持 5 行 current input，且 `provider_inventory_freshness.tsv` 的 blocked 行归零后才能导入 proof。
4. `tools/beat_c_validate_proof_report.sh provider_object_link_set <report>` 输出 `proof_validation_status=proved`。

生产验证:

1. 1GiB guarded Pass B 产出 candidate driver。
2. `driver_sha256` 与 proof report 一致。
3. full ZC delta 不新增 `bail=44/801/707` cascade。
4. current-official exec_diff 重新跑，不能复用 stale driver hash。

## 禁止项

- 不得恢复旧 driver 或旧 exec_diff report。
- 不得将函数指针形参名伪注册为静态 call target。
- 不得用 source-level helper-wrap 代替 link-set 修复。
- 不得把 cold subset、dry-compile、单模块编译当作 proof。
- 不得在未获用户确认前修改 `.cheng` source、provider 配置或 export roots。

## 当前完成状态

本 proposal 只完成 propose。`docs/beat-c.md §1` 仍必须保持:

```text
status=incomplete
reason includes provider_object_link_set
completion_missing_count=8
```
