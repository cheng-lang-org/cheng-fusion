# Beat-C Residual Bail Route Closure

状态: proposed。未获用户确认前不得 apply 到 `.cheng` source、typed_expr、primary lowering 或 provider/link 配置。

目标: 关闭 `docs/beat-c.md §1` 中 `residual_bail_route_closure` completion item。当前只提出修复合同，不声明完成。

## 当前事实

**修正（2026-07-01，阶段1 shape census，`docs/residual-bail-route-shape-census-2026-07-01.md` §3.2）**: 下方 `bail707_current_count=1`/`known_ineffective_707_change=38c1e6b07_helper_wrap_same_rhs_call_surface` 已被现跑推翻——用 `tools/zc_enumerate.sh` 对 `src/tests/oracle_p256_sign_probe_min.cheng` 在当前 HEAD 现跑，不含 bail=707/`keyToBlock`。原判定依据的日志（mtime 6/30 08:48）早于 `38c1e6b07` 提交（6/30 14:38）近 6 小时，记录的是修复前旧源码，不是修复效果的证据。`artifacts/perf/beat-c/bail_route_contract.txt`/`tools/beat_c_validate_bail_route_contract.sh` 已同步更正为 `bail707_current_count=0`。下方 801 家族 `bail801_current_count=4` 经同一工具实测**仍然成立**，未受影响。此修正只是单 probe 口径的现跑结果，全量口径复核仍是阶段 3 的前置动作（见下文阶段 3）。

`artifacts/perf/beat-c/residual_bail_route_inventory.tsv` 当前 6 行，hash:

```text
9f9d6e794bf09277031928013bb7bc3fc95646e68a5531d2e894a1c9688fbe0a
```

当前有效缺口:

| Bail | Count | Functions | Required route | Forbidden route |
| --- | ---: | --- | --- | --- |
| 44 | 0 | rsa_pss line 已清零 | 保持 0，并用 full ZC delta 防 cascade | 未经 full ZC delta 的 source mutation |
| 801 | 4 | `ecdsaVerifyTrustedPublicKeyBytes`, `ecdsaPublicKeyFromPrivateBytes`, `hmacDigest`, `FileMtimeNs` | `typed_expr_aggregate_ctor_shape_lockstep_change` | Result variant / helper-wrap 但 typed_expr 仍看到同款 aggregate ctor |
| 707 | 1 | `keyToBlock` | `typed_expr_rhs_call_surface_shape_lockstep_change` | helper-wrap / rename 但 typed_expr 仍看到同款 rhs_call_surface |

`artifacts/perf/beat-c/bail_route_contract.txt` 已证明:

```text
route_contract_status=proved
bail44_rsa_pss_after_count=0
bail801_current_count=4
bail707_current_count=1
known_effective_shape_change=inline_index_arithmetic_to_named_idx_plus_helper_call
known_ineffective_801_change=b6500835e_result_variant_same_aggregate_ctor_shape
known_ineffective_707_change=38c1e6b07_helper_wrap_same_rhs_call_surface
```

## 决议

residual bail closure 只接受改变 typed_expr 实际观测形态的 lockstep change。

1. `bail=801` 必须让 aggregate ctor 不再以当前不可接受形态进入 typed_expr/primary lowering。
2. `bail=707` 必须让 rhs call surface 不再以当前不可接受形态进入 typed_expr WholeCall/RHS lowering。
3. 修复必须同时覆盖 producer、consumer、diagnostic、proof report，不接受只改 source 表面形态。
4. 任何新增 `.cheng` source/ghost/comment 改动都必须配 `source_mutation_safety` proof。
5. 完成证明必须绑定 driver hash 与 full ZC delta。

## 分阶段执行

### 阶段 1: shape census

为 4 个 801 和 1 个 707 建立 typed_expr 观测形态账本:

- function
- source line
- statement kind
- typed_expr observed shape
- current bail code
- expected accepted shape
- consumer list

验收:

- 5 个活缺口全部有形态记录。
- 账本能解释 b6500835e / 38c1e6b07 为什么不生效。
- 账本本身仍是 `not_completion_evidence`。

### 阶段 2: 801 aggregate ctor lockstep change

覆盖 4 个函数:

- `ecdsaVerifyTrustedPublicKeyBytes`
- `ecdsaPublicKeyFromPrivateBytes`
- `hmacDigest`
- `FileMtimeNs`

修复要求:

- 改变 typed_expr 看到的 aggregate ctor 形态，而不是只换 Result variant 名称。
- primary lowering consumer 必须同步接受新形态。
- diagnostics 必须输出新旧形态差异，避免“源码改了但形态没变”的假修。

验收:

```text
bail801_after_count=0
route_contract_status=proved
full_zc_delta_unexpected_regression=0
```

### 阶段 3: 707 rhs call surface lockstep change

**注（2026-07-01）**: 单 probe 口径实测显示 `keyToBlock` 当前已不在 not_ready 列表（见上文"当前事实"修正段）。若全量口径复核确认无残留，本阶段可能不需要额外源码改动，只需重新生成 `residual_bail_route_inventory.tsv`/`bail_route_contract.txt` 并跑验收门确认 `bail707_after_count=0`。

覆盖:

- `keyToBlock`

修复要求:

- 改变 typed_expr 看到的 `rhs_call_surface`。
- 禁止 helper rename 或 wrapper 但 RHS surface 不变。
- 如涉及 WholeCall/NoTrace sentinel，必须同步列出下游 consumer 合同，不做上游单点放宽。

验收:

```text
bail707_after_count=0
route_contract_status=proved
full_zc_delta_unexpected_regression=0
```

### 阶段 4: anti-cascade proof

所有 residual bail source 改动必须配套:

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
full_zc_delta_unexpected_regression=0
source_mutation_forbidden_route_count=0
```

禁止只用:

- `ci_gate`
- cold subset compile
- single fixture compile
- dry-compile
- default baseline rc=0

### 阶段 5: completion proof

只有以下条件同时满足，才允许生成 residual bail route closure proof:

```text
proof_kind=residual_bail_route_closure
schema_version=beat_c_proof
status=proved
bail44_after_count=0
bail801_after_count=0
bail707_after_count=0
route_contract_status=proved
full_zc_delta_unexpected_regression=0
driver_sha256=<nonempty_driver_sha256>
bail_route_contract_sha256=<sha256>
typed_expr_shape_delta_sha256=<sha256>
full_zc_report_sha256=<sha256>
full_zc_delta_report_sha256=<sha256>
source_mutation_safety_report_sha256=<sha256>
forbidden_route_count=0
bail801_required_route=typed_expr_aggregate_ctor_shape_lockstep_change
bail707_required_route=typed_expr_rhs_call_surface_shape_lockstep_change
```

导入前必须通过:

```sh
tools/beat_c_validate_proof_report.sh residual_bail_route_closure <report>
```

导入后必须重新运行 default/import-only baseline，并确认:

```text
residual_bail_route_closure=proved
completion_missing_count decreases by 1
```

## 验证门

最小验证:

1. `residual_bail_route_inventory.tsv` 重新生成后只保留 `bail44_rsa_pss_after_count=0` 守卫，不再出现 801/707 活缺口。
2. `bail_route_contract.txt` 仍为 `route_contract_status=proved`。
3. `tools/beat_c_validate_proof_report.sh residual_bail_route_closure <report>` 输出 `proof_validation_status=proved`。

生产验证:

1. 1GiB guarded Pass B 产出 candidate driver。
2. full ZC delta 证明没有新增 44/801/707 或未知 cascade。
3. current-official exec_diff 重新跑，不能复用 stale driver hash。
4. source mutation safety proof 同时导入并通过。

## 禁止项

- 不得再用 Result variant 替换关闭 801。
- 不得再用 helper-wrap/helper rename 关闭 707。
- 不得放宽 typed_expr sentinel 而不同步 downstream consumers。
- 不得把 44=0 的局部口径扩展成全树安全证明。
- 不得在未获用户确认前修改 `.cheng` source 或 typed_expr/primary lowering。

## 当前完成状态

本 proposal 只完成 propose。`docs/beat-c.md §1` 仍必须保持:

```text
status=incomplete
reason includes residual_bail_route_closure
completion_missing_count=8
```
