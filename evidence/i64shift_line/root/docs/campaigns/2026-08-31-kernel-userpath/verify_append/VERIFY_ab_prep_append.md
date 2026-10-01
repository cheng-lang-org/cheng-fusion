# VERIFY_ab_prep_append — R2 收口首刀 A+B manifest 手术预备线（AB-PREP）

日期 2026-09-05。纯静态线：零烤机、零主树源码改动；唯一一次克隆验证（`/tmp/ab_prep_clone`，
APFS clonefile）用后已删净。主树仅落 campaign `patches/` 与本卷。
输入：`r2_closure_ops_map.md`（09-06 口径）+ `tools/kernel_plugin_closure_check.py`
（严格门）+ `tools/kernel_plugin_manifest_gate.py`（组合清单门）+ `tools/kernel_plugin_attribution.tsv`。

---

## 1. 现值对账（2026-09-05 实测，与作战图逐项一致，源树未漂移）

| 门 | 结果 |
|---|---|
| Step0（默认） | rc=0 PASS：96/96 covered、uncovered=0、桶 k62/s18/x5/a64=4/rv32=1/rv64=5/wasm=1、direct_violations=0、indirect 18/130、divergence 246 |
| 严格门 `--require-strict-closure` | rc=1 FAIL_STRICT **violations=236 = 7(声明不可达) + 171(闭包未声明) + 13(arch 可达) + 45(token 文件/671 行)**；声明 37、闭包 201、入口 `tooling/compiler_composition_kernel_main.cheng` |
| `kernel_plugin_manifest_gate.py` | rc=0 PASS（x86_64=5, aarch64=4, riscv64=5; coverage=exact; cross_manifest_unique=true） |

A 名单（7）、arch 可达名单（13）与作战图 §2.1/§2.2 逐文件一致；171 未声明按目录分布
analysis 9 / backend 49 / backend2 12 / csg_core 35 / ir 9 / lang 6 / runtime 16 / tooling 35 亦一致。

## 2. A 名单定谳（7 死声明全数成立，非路径笔误）

每项：文件在盘（checker 无 `strict_manifest_source_missing` 硬错）、经入口闭包不可达
（checker BFS 全图实测）、闭包内有现链替代（排除「manifest 写错路径而真文件在链」的误判）。

| manifest key（删除行） | 文件 | 在盘 | 现链替代（闭包内实测） |
|---|---|---|---|
| tooling_gate_source | tooling/gate_main.cheng | ✓ | 入口已改 `compiler_composition_kernel_main`（manifest compiler_entry_source） |
| backend_native_link_exec_source | backend/native_link_exec.cheng | ✓ | native_link_exec_darwin / native_link_plan（闭包内）；链接执行主链已走 system_link_exec/direct_object_emit |
| backend_primary_object_emit_source | backend/primary_object_emit.cheng | ✓ | direct_object_emit（已声明可达）+ primary_object_csgc_emit/cargo（B 收编） |
| core_ir_low_uir_source | ir/low_uir.cheng | ✓ | 无近名替代：内核驱动现路径不进该中端段（作战图 §2.1 判读） |
| core_ir_type_abi_source | ir/type_abi.cheng | ✓ | 同上 |
| core_ir_body_ir_loop_source | ir/body_ir_loop.cheng | ✓ | 现路径经 body_ir_access/cfg/exact_def/lifecycle 等 9 件（B 收编） |
| core_ir_body_ir_opt_source | ir/body_ir_opt.cheng | ✓ | 同上 |

7 文件本体不动（TSV 覆盖不变、其他 composition 继续消费），只删 manifest 声明行。

## 3. B 名单定谳（作战图 155 → **146 收 B + 9 归 C6**，逐项切边反证）

方法（checker 同构，非照抄作战图）：在 src/core 全 import 图上切 11 条 C 族边
（§2.3 的 10 条 kernel→门面汇入边：pop→B4/B6、doe→B2、noep→B2、emitter→B8、
artifacts→B3、sler→B9、coff/elf/macho_linker→a64_link，加 C6 的
`system_link_exec.cheng:39 → backend2_pipeline`【更正 2026-09-10 审计：点名 import `backend2_pipeline` 在 HEAD 该文件 0 命中（唯一出现是 :6052 注释「本文件不再 import backend2_pipeline」），该锚点不可用、正确落点未定位；原文保留为历史证据】），从入口重算闭包 = 172 文件，
其中 arch=0、过渡门面=0（切边健全性实测）。

- 切边后**仍可达 146** = 确定性中立（kernel 真实链成员，与 C 族收口无关）→ 收 B。
- 切边后**掉出 9** = 误可达，全部单通道挂在 `system_link_exec → backend2_pipeline`
  一条边上：8 个 backend2 文件（pipeline/lower/lower_slots/lower_stmt/lower_util/
  assemble/assembler_lifecycle/fragment_lifecycle）+ `tooling/compile_skip_cache.cheng`
  （唯一 importer = backend2_pipeline.cheng:51）→ **剔出 B，归 C6/GEN2-LADDER**。
- 作战图 155 = 171−13−3 的静态减法；本线反证后修正为 146+9。宁缺勿滥达成。
- 4 个已声明门面（codegen_writer_units/encoder_event_units/x64_body_units/a64_body_units）
  切边后同样掉出，但其命运本就归 C 族（C2/C1/C3 过渡形态），不在 A/B 手术范围。
- backend2 4 文件（backend2_cid/backend2_frag_codec/backend2_plugin_cid/backend2_types）
  被 kernel 侧 primary_object_plan / codegen_contract 直接消费，切边后仍可达 → 确定中立
  收 B；只补声明不改源码，施工领地仍在 GEN2-LADDER。

逐项证据（BFS 首跳到首个已声明祖先；`(+N)` = 隔 N 跳）：

| 文件 | 定谳 | 证据链（→ 首个已声明祖先） |
|---|---|---|
| src/core/analysis/cleanup_cfg.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+3) |
| src/core/analysis/exact_def_call_authority.cheng | B-146 中立 | src/core/backend/primary_object_plan.cheng(+0) |
| src/core/analysis/exact_def_derive.cheng | B-146 中立 | src/core/backend/primary_object_plan.cheng(+0) |
| src/core/analysis/exact_def_freeze.cheng | B-146 中立 | src/core/backend/primary_object_plan.cheng(+0) |
| src/core/analysis/exact_def_identity.cheng | B-146 中立 | src/core/backend/primary_object_plan.cheng(+0) |
| src/core/analysis/exact_def_merge.cheng | B-146 中立 | src/core/backend/primary_object_plan.cheng(+1) |
| src/core/analysis/managed_lvalue_replace.cheng | B-146 中立 | src/core/backend/lowering_plan.cheng(+0) |
| src/core/analysis/ownership_body_ir_production.cheng | B-146 中立 | src/core/backend/primary_object_plan.cheng(+0) |
| src/core/analysis/ownership_drop_ir.cheng | B-146 中立 | src/core/backend/primary_object_plan.cheng(+1) |
| src/core/backend/build_plan.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+0) |
| src/core/backend/canonical_type_chain.cheng | B-146 中立 | src/core/backend/primary_object_plan.cheng(+0) |
| src/core/backend/coff_object_linker.cheng | B-146 中立 | src/core/backend/system_link_exec_runtime.cheng(+0) |
| src/core/backend/coff_object_writer.cheng | B-146 中立 | src/core/backend/direct_object_emit.cheng(+0) |
| src/core/backend/compiler_facts.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+2) |
| src/core/backend/csg_plugin_pickup.cheng | B-146 中立 | src/core/backend/primary_object_plan.cheng(+0) |
| src/core/backend/data_payload_codec.cheng | B-146 中立 | src/core/backend/primary_object_plan.cheng(+0) |
| src/core/backend/debug_emission_plan_evidence.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+1) |
| src/core/backend/debug_emission_receipt.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+1) |
| src/core/backend/debug_facts.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+1) |
| src/core/backend/debug_relocatable_object_evidence.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+2) |
| src/core/backend/debug_section_plan_consumer.cheng | B-146 中立 | src/core/backend/primary_object_plan.cheng(+0) |
| src/core/backend/debug_section_plan_receipt.cheng | B-146 中立 | src/core/backend/primary_object_plan.cheng(+0) |
| src/core/backend/direct_object_debug_sections.cheng | B-146 中立 | src/core/backend/direct_object_emit.cheng(+0) |
| src/core/backend/elf_object_linker.cheng | B-146 中立 | src/core/backend/system_link_exec_runtime.cheng(+1) |
| src/core/backend/elf_object_writer.cheng | B-146 中立 | src/core/backend/direct_object_emit.cheng(+0) |
| src/core/backend/host_pool_runtime.cheng | B-146 中立 | src/core/backend/primary_object_plan.cheng(+0) |
| src/core/backend/line_map.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+0) |
| src/core/backend/linker_shared_core.cheng | B-146 中立 | src/core/backend/direct_object_emit.cheng(+0) |
| src/core/backend/lowering_payload_lifecycle.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+0) |
| src/core/backend/macho_debug_section_evidence.cheng | B-146 中立 | src/core/backend/direct_object_emit.cheng(+0) |
| src/core/backend/macho_provider_linker.cheng | B-146 中立 | src/core/backend/system_link_exec_runtime.cheng(+1) |
| src/core/backend/metadata_text_authority.cheng | B-146 中立 | src/core/backend/primary_object_plan.cheng(+0) |
| src/core/backend/native_link_exec_darwin.cheng | B-146 中立 | src/core/backend/system_link_exec_runtime.cheng(+0) |
| src/core/backend/native_object_emission_plan.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+2) |
| src/core/backend/primary_object_csgc_cargo.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+1) |
| src/core/backend/primary_object_csgc_emit.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+0) |
| src/core/backend/regalloc_production_artifacts.cheng | B-146 中立 | src/core/backend/direct_object_emit.cheng(+0) |
| src/core/backend/regalloc_production_emitter.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+2) |
| src/core/backend/regalloc_single_pass.cheng | B-146 中立 | src/core/backend/codegen_contract.cheng(+0) |
| src/core/backend/semantic_facts.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+2) |
| src/core/backend/semantic_snapshot_debug_binding_receipt.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+1) |
| src/core/backend/target_matrix.cheng | B-146 中立 | src/core/backend/codegen_contract.cheng(+0) |
| src/core/backend2/backend2_assemble.cheng | C6 误可达(剔出B) | src/core/backend/system_link_exec.cheng(+1) |
| src/core/backend2/backend2_assembler_lifecycle.cheng | C6 误可达(剔出B) | src/core/backend/system_link_exec.cheng(+1) |
| src/core/backend2/backend2_cid.cheng | B-146 中立 | src/core/backend/primary_object_plan.cheng(+0) |
| src/core/backend2/backend2_frag_codec.cheng | B-146 中立 | src/core/backend/codegen_contract.cheng(+1) |
| src/core/backend2/backend2_fragment_lifecycle.cheng | C6 误可达(剔出B) | src/core/backend/system_link_exec.cheng(+1) |
| src/core/backend2/backend2_lower.cheng | C6 误可达(剔出B) | src/core/backend/system_link_exec.cheng(+1) |
| src/core/backend2/backend2_lower_slots.cheng | C6 误可达(剔出B) | src/core/backend/system_link_exec.cheng(+1) |
| src/core/backend2/backend2_lower_stmt.cheng | C6 误可达(剔出B) | src/core/backend/system_link_exec.cheng(+1) |
| src/core/backend2/backend2_lower_util.cheng | C6 误可达(剔出B) | src/core/backend/system_link_exec.cheng(+1) |
| src/core/backend2/backend2_pipeline.cheng | C6 误可达(剔出B) | src/core/backend/system_link_exec.cheng(+0) |
| src/core/backend2/backend2_plugin_cid.cheng | B-146 中立 | src/core/backend/primary_object_plan.cheng(+1) |
| src/core/backend2/backend2_types.cheng | B-146 中立 | src/core/backend/codegen_contract.cheng(+2) |
| src/core/csg_core/body_ir_cleanup_authority.cheng | B-146 中立 | src/core/backend/primary_object_plan.cheng(+0) |
| src/core/csg_core/compiler_snapshot_cargo.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+2) |
| src/core/csg_core/compiler_snapshot_lowering_authority.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+1) |
| src/core/csg_core/compiler_snapshot_schema.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+0) |
| src/core/csg_core/csgc.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+1) |
| src/core/csg_core/csgc_authority.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+1) |
| src/core/csg_core/csgc_mapped_reader.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+2) |
| src/core/csg_core/csgc_projection_stream.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+2) |
| src/core/csg_core/identity.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+1) |
| src/core/csg_core/json_canonical.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+1) |
| src/core/csg_core/json_field.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+1) |
| src/core/csg_core/merkle_admission.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+1) |
| src/core/csg_core/merkle_artifacts.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+1) |
| src/core/csg_core/merkle_builder.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+1) |
| src/core/csg_core/merkle_cargo.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+1) |
| src/core/csg_core/merkle_closure.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+2) |
| src/core/csg_core/merkle_dag.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+0) |
| src/core/csg_core/merkle_invalidation.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+1) |
| src/core/csg_core/merkle_manifest.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+1) |
| src/core/csg_core/merkle_manifest_verifier.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+1) |
| src/core/csg_core/merkle_store.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+0) |
| src/core/csg_core/merkle_store_artifact_codec.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+2) |
| src/core/csg_core/merkle_store_codec.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+0) |
| src/core/csg_core/merkle_store_identity.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+1) |
| src/core/csg_core/merkle_store_pipeline.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+1) |
| src/core/csg_core/merkle_store_snapshot_reader.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+1) |
| src/core/csg_core/merkle_store_types.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+1) |
| src/core/csg_core/merkle_transaction.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+1) |
| src/core/csg_core/merkle_transaction_authority.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+1) |
| src/core/csg_core/merkle_transaction_operation.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+1) |
| src/core/csg_core/merkle_transaction_receipt.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+1) |
| src/core/csg_core/merkle_transaction_request.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+1) |
| src/core/csg_core/plugin_trade_record.cheng | B-146 中立 | src/core/backend/primary_object_plan.cheng(+1) |
| src/core/csg_core/production_launcher.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+0) |
| src/core/csg_core/validator.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+1) |
| src/core/ir/alias_licm_gvn.cheng | B-146 中立 | src/core/backend/primary_object_plan.cheng(+0) |
| src/core/ir/alias_licm_gvn_plan.cheng | B-146 中立 | src/core/backend/primary_object_plan.cheng(+0) |
| src/core/ir/body_ir_access.cheng | B-146 中立 | src/core/backend/codegen_contract.cheng(+1) |
| src/core/ir/body_ir_cfg.cheng | B-146 中立 | src/core/backend/codegen_contract.cheng(+1) |
| src/core/ir/body_ir_exact_def.cheng | B-146 中立 | src/core/backend/codegen_contract.cheng(+2) |
| src/core/ir/body_ir_lifecycle.cheng | B-146 中立 | src/core/backend/system_link_exec_runtime.cheng(+0) |
| src/core/ir/escape_arena_plan.cheng | B-146 中立 | src/core/backend/primary_object_plan.cheng(+0) |
| src/core/ir/escape_arena_route.cheng | B-146 中立 | src/core/backend/primary_object_plan.cheng(+0) |
| src/core/ir/function_source_slice_index.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+1) |
| src/core/lang/browser_abi_rule.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+0) |
| src/core/lang/diagnostic_failure.cheng | B-146 中立 | src/core/lang/parser.cheng(+0) |
| src/core/lang/intern.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+0) |
| src/core/lang/parser_diagnostic_authority.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+1) |
| src/core/lang/typed_expr_frag_codec.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+2) |
| src/core/lang/typed_expr_type_arena.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+1) |
| src/core/runtime/arena.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+0) |
| src/core/runtime/compiler_runtime.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+0) |
| src/core/runtime/core_runtime.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+0) |
| src/core/runtime/debug_runtime.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+0) |
| src/core/runtime/handle_table.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+1) |
| src/core/runtime/held_exec_identity.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+1) |
| src/core/runtime/production_held_exec_admission_proof_codec.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+1) |
| src/core/runtime/production_held_exec_darwin_capability.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+1) |
| src/core/runtime/production_held_exec_event_issuer.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+1) |
| src/core/runtime/production_held_exec_provider.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+0) |
| src/core/runtime/production_held_exec_spawn.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+1) |
| src/core/runtime/production_held_exec_terminal_guardian.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+1) |
| src/core/runtime/production_system_link_capability.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+0) |
| src/core/runtime/production_terminal_journal_codec.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+1) |
| src/core/runtime/program_support.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+0) |
| src/core/runtime/provider_root.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+1) |
| src/core/tooling/artifact_paths.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+0) |
| src/core/tooling/bootstrap_contracts.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+0) |
| src/core/tooling/cas_fetch_subprocess.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+0) |
| src/core/tooling/compile_skip_cache.cheng | C6 误可达(剔出B) | src/core/backend/system_link_exec.cheng(+1) |
| src/core/tooling/compiler_compile_receipt_codec.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+1) |
| src/core/tooling/compiler_csg.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+0) |
| src/core/tooling/compiler_csg_build_fragment_lifetime.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+1) |
| src/core/tooling/compiler_csg_egraph_contract.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+1) |
| src/core/tooling/compiler_csg_production_lifetime.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+0) |
| src/core/tooling/compiler_equivalence.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+0) |
| src/core/tooling/compiler_execution_stage_receipt.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+0) |
| src/core/tooling/compiler_execution_stage_receipt_wire.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+1) |
| src/core/tooling/compiler_parser_receipt.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+1) |
| src/core/tooling/compiler_payload_lifecycle.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+0) |
| src/core/tooling/compiler_publish_gate.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+0) |
| src/core/tooling/compiler_snapshot_builder.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+1) |
| src/core/tooling/compiler_snapshot_lowering_bridge.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+0) |
| src/core/tooling/compiler_stage_receipt.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+1) |
| src/core/tooling/compiler_toolchain_encoder_authority_import.cheng | B-146 中立 | src/core/backend/primary_object_plan.cheng(+0) |
| src/core/tooling/compiler_world.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+0) |
| src/core/tooling/compiler_world_bundle.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+0) |
| src/core/tooling/compiler_world_libp2p.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+0) |
| src/core/tooling/csg_normalize.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+1) |
| src/core/tooling/export_visibility_gate.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+0) |
| src/core/tooling/host_bridge_audit_gate.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+0) |
| src/core/tooling/host_ops.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+0) |
| src/core/tooling/lifetime_ledger.cheng | B-146 中立 | src/core/backend/system_link_plan.cheng(+0) |
| src/core/tooling/path.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+0) |
| src/core/tooling/root_discovery.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+0) |
| src/core/tooling/semantic_snapshot.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+2) |
| src/core/tooling/semantic_snapshot_declaration_identity.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+1) |
| src/core/tooling/semantic_snapshot_incremental_plan.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+2) |
| src/core/tooling/semantic_snapshot_production.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+1) |
| src/core/tooling/semantic_snapshot_query_projection.cheng | B-146 中立 | src/core/backend/system_link_exec.cheng(+2) |
| src/core/tooling/seven_stage_receipt.cheng | B-146 中立 | src/core/tooling/compiler_main.cheng(+0) |

## 4. draft patch 与静态验证（克隆内，已删净）

- 交付：`patches/ab_manifest_draft.patch`（sha256 `41ee0c8cc2287e0ecaef43c65df68d83e5aa909decc2b30198409b3ac0e453e1`，+178/−17，235 行，仅触 `bootstrap/kernel_manifest.cheng` 一个文件）。
- 内容：删 §2 的 7 行；增 §3 的 146 条目（key 规则沿用现 manifest 目录前缀风格
  `backend_/core_ir_/tooling_/lang_/csg_core_/runtime_/analysis_/backend2_` + stem + `_source`，
  机械生成并过碰撞检查）；头注 DRAFT 标记（勿直接 apply）；尾注「对账」段按 176 源口径重写。
- 一致性自检（gate/checker 同构）：checker parser 解析 176 源零错；key 全唯一；路径全在盘；
  与既有 37 源零重复；与 3 份 plugin manifest 零重叠（gate 同构检查）。
- 克隆验证（`cp -cR` → `git apply --check` rc=0 → apply rc=0，克隆内 manifest sha
  `a639d4b0ed28060c65ef0676fa27b366b5b6b7a17683e81a6cd106ae8d96ad75` 与生成物逐字节一致）：

| 门 | 克隆实测 |
|---|---|
| 严格门 | rc=1 FAIL_STRICT **violations=83 = 0 + 25 + 13 + 45**（236→83，削减 153）；声明 176、闭包 201（manifest 手术不动 import 图，闭包/arch/token 三面不变） |
| 残余 25 未声明 | 13 arch + 3 过渡门面（a64_link_units/darwin_provider_units/regalloc_adapter_units）+ 8 backend2 + compile_skip_cache —— 与 §3 反证名单逐文件一致 |
| manifest gate | rc=0 PASS（5/4/5; exact; unique）——组合面门不破 |
| Step0 | rc=0 PASS 全同（96/96、0 direct、18/130） |

- 主树完整性：施打前后 `bootstrap/kernel_manifest.cheng` sha256 同为
  `bdcbe0d30eea0831366a0653f7587f7dbc09a537a94a1ae00eebf2af68da2e28`（未动）；克隆已 `rm -rf` 删净。
- 严格门轨迹预期：施打后 83；C4→C5→C1→C2→C3 逐族收口消 13 arch + 3 门面（未声明与
  arch 可达同步归零）；C6 收口（断 system_link_exec→backend2_pipeline 单边）消 9 个 stray；
  token 45 文件/671 行不受 A+B 影响（token 扫可达闭包不扫 manifest），留族 D 终扫。

## 5. 手术手册（GEN2-WAVE2 守卫穿后由主线程施打）

1. **基线复核**：重跑 §1 三道门对账现值。patch 按 2026-09-05 名单固化；源树生长
   （新增 src/core 文件或 import 边）会使名单过期——严格门 unmanifested 名单与 §3
   证据表有出入时，先重跑切边反证再施打，不得直接 apply 旧 patch。
2. **施打**：`git apply docs/campaigns/2026-08-31-kernel-userpath/patches/ab_manifest_draft.patch`（单文件）。
3. **静态门三连（主树）**：严格门预期 83（0/25/13/45）；manifest gate 预期 PASS；Step0 预期 PASS。
4. **字节门（假绿红线）**：manifest 行变 → `composition_declared_source_count` 37→176、
   `composition_declared_sources_sha256` 漂移 → 组合驱动字节必变（build_kernel_driver.sh:198-205
   报告绑定）。重跑配对 exec_diff（wall40/wall42 口径）+ 四夹具门（0 UAF / 0 exit70 /
   字节铁门配对相等），结论绑定源码/编译器/工具哈希。未过字节门不得计完成。
5. **组合面联动**：kernel+3 plugin manifest gate rc=0 复验；composition_manifest 绑定硬门
   （declared==actual，作战图 §5 待实测项）此时应从预期 HARD_RED 转一致，顺带实测归档。
6. **回滚预案**：`git apply -R <同 patch>`（纯 manifest 单文件 reverse 即恢复 37 源原样）；
   回滚后重跑 §5.3 静态门 + §5.4 字节门配对确认。若施打后源树又生长，先记录现值再回滚。

边界与风险：
- A 的 7 文件本体与 TSV 覆盖不动；B 只加声明行，零源码/零桶归属改动。
- strict gate 对 backend2 无 TSV 归属（作战图 §6.2 盲区）；9 个 stray 的 C6 归属以本线
  静态切边反证为据，GEN2-LADDER 定桶后复核。
- 施打会推高烤机闭包声明面（37→176），这正是排程在 GEN2 守卫穿后的原因；本线不烤机。

## 6. 交付物哈希

| 物 | sha256 |
|---|---|
| patches/ab_manifest_draft.patch | 41ee0c8cc2287e0ecaef43c65df68d83e5aa909decc2b30198409b3ac0e453e1 |
| 施打后 manifest（=生成物） | a639d4b0ed28060c65ef0676fa27b366b5b6b7a17683e81a6cd106ae8d96ad75 |
| 施打前 manifest（主树现值） | bdcbe0d30eea0831366a0653f7587f7dbc09a537a94a1ae00eebf2af68da2e28 |
