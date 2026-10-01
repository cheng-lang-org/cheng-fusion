# task_z_annot_comment_fix — cold parser 注解被夹注释静默断附（lessons 1084 地雷）根修

日期：2026-09-12。工作树：`/Users/lbcheng/cheng-f24/anchor_clones/ohosdev`（主仓 src/bootstrap 零改动）。
车头基线：`/private/tmp/cheng_w126_re`（binstamp v7）；修复车头：克隆内 `tmp/z_annot_fix/cheng_fixed`（cc -O2 单文件编 `bootstrap/cheng_cold.c`，内含 cold_parser.c）。

## 1. 根因

cold C 链的注解附着不靠 parser token 流，而是从声明行**逐行向上文本扫描**收集紧邻的 `@...` 行。该扫描的终止条件是「trim 后首字符非 `@` 即 break」——空行被显式 continue 跳过，但**注释行（`#` / `//` 整行注释）非空、首字符非 `@`**，于是 break，注解与 `fn` 之间夹一行注释就静默断开附着：

- `@borrows` 断附 → `borrows_args=false` → 形参从「借用」翻转为「拥有并释放」→ 调用方仍按借用/继续使用 → 双释放/use-of-consumed。**全程零诊断**（语法完全合法），即 lessons.md:1084「插入点劈开 @ 注解 = 静默的所有权翻转」的 parser 层真根因：那次事故的补丁插入只是触发形态之一，任何夹在 `@` 行与声明行之间的注释/文本都会同样断附。
- 同一缺陷共有 6 个扫描位点，覆盖全部函数注解，一修全修：
  - `bootstrap/cheng_cold.c`：`cold_function_exact_annotation_count_before`（@borrow_result）、`cold_function_has_exact_flag_before`（@borrows/@thread_boundary）、`cold_find_fn_c_symbol_attr`（@importc/@exportc）、`cold_find_fn_symbol_attr_value_scan`（@ffi_owned_result free=）
  - `bootstrap/cold_parser.c`：`cold_find_fn_attr_prefix`（@abi_internal/@ffi_map/@ffi_out_ptrs/@ffi_owned_result）、`cold_find_fn_attr_value`（同前带 key）
- 修复语义：注释行与空行同权——continue 跳过、继续向上找注解；非注释非 `@` 行仍 break（附着边界不放宽）。helper：`cold_span_is_comment_only(trimmed)`（cheng_cold.c 新增，仅认 `#` 与 `//`，与 `cold_scan_cheng_source`、`cold_line_is_comment_only`（cold_parser.c）既有口径一致）；cold_parser.c 复用其既有 `cold_line_is_comment_only` 加前向声明。

## 2. 最小复现（旧车头 w126_re，全部真实输出）

夹具（克隆 src/tests/）：`z_annot_clean.cheng` / `z_annot_comment.cheng` / `z_annot_noannot.cheng`——同一程序（`@borrows fn first(a: str): int32`，main 两次以借用实参调用），区别仅在注解与 fn 之间是否夹 `# probe comment between annotation and fn`。

| 组 | 源形态 | compile | run | 错误 |
|---|---|---|---|---|
| A | @borrows 紧贴 fn | rc=0 | rc=0 | — |
| B | @borrows 与 fn 之间夹一行 `#` 注释 | **rc=2** | — | `cheng_mem_release_underflow_fail` unresolved（形参被当 owned，释放路径插进 provider 体） |
| C | 完全无 @borrows | rc=2 | — | **与 B 逐字相同** |

B≡C 证明夹注释后注解的语义效果 = 注解不存在；A 正常证明失效的正是注解附着而非其他。

第二组交叉证据（`repro_borrowpass.cheng` 的夹注释变体 `z_repro_borrowpass_commented.cheng`，旧车头）给出更直接的判词：

```
cheng_cold: borrowed actual cannot bind non-var non-@borrows formal caller=outer callee=inner
cheng_cold: borrowed call argument rejected (recovery=0 depth=2)
```

即：借用实参调用一个「@borrows 被注释断附而失效」的形参被拒。

## 3. 修复 patch

`patches/z_annot_comment.patch`（本目录，已 `git add -f`）：8 hunk（cheng_cold.c 5 + cold_parser.c 3），103 行级变更。已验证 `git apply --check -R` 反向通过，且「撤销→重放→与工作区零 diff」往返一致。**注意：该 patch 只含本修复 8 个 hunk；克隆内 `bootstrap/cheng_cold.c` 另有先前会话的未提交改动（system_link publication/object_cache 族），不在本 patch 内。**

## 4. 回归输出（修复车头 cheng_fixed）

| 项 | 结果 |
|---|---|
| 金丝雀：两行源 `fn main(): int32 = return 0` | compile rc=0, run rc=0 |
| 金丝雀：`src/tests/ordinary_zero_exit_fixture.cheng` | compile rc=0, run rc=0 |
| `cheng_fixed self-check --in:bootstrap/driver_bootstrap_contract.cheng` | rc=0，`cheng_bootstrap_self_check=ok` |
| 夹具 A（clean） | compile rc=0, run rc=0（与修前一致，无回归） |
| 夹具 B（夹注释） | **compile rc=2 → rc=0, run rc=0（修复生效，与 A 行为一致）** |
| 夹具 C（无注解对照） | compile rc=2，错误与修前逐字相同（无放水） |
| `src/tests/repro_borrowpass.cheng`（既有 @borrows smoke） | compile rc=0, run rc=3（=程序语义返回值 len("abc")，与旧车头基线一致） |
| `z_repro_borrowpass_commented.cheng`（其夹注释变体） | **compile rc=0, run rc=3（与原版一致；旧车头 rc=2）** |
| `src/tests/cold_borrowed_actual_borrows_smoke.cheng` | 新旧车头同败同错（`cheng_mem_release_underflow_fail` unresolved——该车头 provider closure 既有缺口，与本修复无关，修前后逐字相同） |
| **ssm1d_export obj 闭包重编对比（M4b ssm1 线）** | `system-link-exec --in:src/tools/ssm1_tick_daemon_export.cheng --emit:obj`：旧车头与修复车头产物 sha256 均为 `96afdb880baed2195e626819f1ea88f3501443fe3b66fb0919a7de4d9580c647`（136151 B）——**逐字节一致，ssm1 线零回归**，同时证明修复对无注释源逐位透明 |

## 5. 对场景壳墙 A 的潜在减负

M3 §6-A wall A 判词正是 `borrowed actual cannot bind non-var non-@borrows formal`（__chtJsonOf_*/__csg_scene_* 生成 helper 家族，跨 std/json），且「机械注解不可收敛（借出性级联，三种违规类轮换）」。本修复揭示一个此前不可见的贡献因子：**生成源中任何夹在 `@borrows` 与 `fn` 之间的注释行都会静默吃掉该注解**，其外在表现与「helper 漏标 @borrows」完全同形。若 8/26 存量场景源/生成器输出中存在此类夹注释，则部分 wall A 违规点不是真合同缺口而是断附假象；且「注解后级联不收敛」也可能是注解在更深层再次被注释断附所致。**建议**：wall A 复验时先用本修复车头重编 `unimaker-react.scene-runtime.cheng`，并 grep 生成 helper 家族源中 `@` 行与声明行之间的注释行；若违规集显著缩小或消失，wall A 可降级为「注解透明性问题已根修」的减负项。

## 6. 待主仓入库清单

1. `patches/z_annot_comment.patch`（已 add -f）→ apply 到主仓 `bootstrap/cheng_cold.c`、`bootstrap/cold_parser.c`（主仓并行会话改编译器，apply 前先跑 `python3 .rebuild/s1b_step3/r9/patch_preflight.py <patch>` 并确认两文件冻结窗口）。
2. 夹具四件 + 变体：`src/tests/z_annot_clean.cheng`、`z_annot_comment.cheng`（正反回归对）、`z_annot_noannot.cheng`（负对照）、`z_repro_borrowpass_commented.cheng`（既有 smoke 的夹注释镜像）；`z_canary_two_line.cheng` 为临时金丝雀可弃。
3. lessons.md:1084 条目补一句：事故根因已在 parser 层根修（6 个向上扫描位点对注释行透明），夹具对 `z_annot_clean/z_annot_comment` 入 tests 作常驻回归。
4. wall A 复验排期（§5）。
5. 已知遗留（非本任务域）：该车头 provider closure 缺 `cheng_mem_release_underflow_fail`，任何触发 owned 释放检查路径的源在 bootstrap 单文件车头下均 rc=2（`cold_borrowed_actual_borrows_smoke`、`zztmp_ifstr_repro`、`_ta_neg1_repro` 家族），完整 backend driver 链不受此限。
