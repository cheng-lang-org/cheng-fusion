# wall118.VERIFY

## wall118 报告：v6 `ownership body ir production: managed ref owned definition drop-glue authority missing kind=8 … op=3 own=2` 墙死亡（wall73 移交三文件包落地：program_support_backend var-ptr ABI glue + 双 backend 白名单 + link roots + ownership_body_ir_production 拒臂换 glue 绑定放行）——v6 判词推进至 `ownership_drop_ir: value definition consumed twice`（ownership_drop_ir.cheng:4634 消费唯一性硬契约，授权面外→停手完整移交）；ordinary 0/0、call_fixture 0/1 零回归；cold_nested 未采（并行内存线 root 租约持续占用）；烤机 1/3 轮一次过

日期 2026-09-03。授权面=src/core/runtime/program_support_backend.cheng + src/core/backend/primary_object_plan.cheng 或相关 backend + src/core/analysis/ownership_body_ir_production.cheng。主树净变更（本臂 5 文件，含前臂累积）：ownership_body_ir_production 172、primary_object_plan 982、system_link_exec_runtime 5、backend2_lower_slots 9、program_support_backend 251（git diff --stat insertions 计）；本臂净归属=①runtime +33（两个新 glue 函数+注释）②双白名单各 +2 判定+注释 ③link roots +2 条件根 ④拒臂条件收窄+注释 +glue 绑定按 structural kind 择符号。

### 判定（本墙死亡，判词推进至授权面外新契约点，停手移交）
1. **修法落地（三文件包全接线）**：
   - **runtime glue**（program_support_backend.cheng，cheng_mem_release_atomic_export 之后）：`@exportc("cheng_ref_drop_owned") fn …(slotRaw: uint64)`——读 8B 句柄→槽清零→条件 `cheng_mem_release_export(handle)`；`@exportc("cheng_ref_retain_owned") fn …(slotRaw: uint64)`——读 8B 句柄→条件 `cheng_mem_retain_export(handle)`。与 CleanupPlan 合成调用单实参 ByAddressAggregate 槽地址、argAbiSizes=8、void 结果的 call-site 约定逐项对齐（cleanup_cfg:12829-12843 drop unit / :10660-10662 retain unit），callee 读写宽度恒 8B ≠ str 头 24/32B。
   - **ABI 形状归因（秒级门 A/B 钉死）**：glue 首版 `value: var ptr` 参数（var-ptr 直接形）在冷链 `--emit:obj` 恒死 `cheng_cold: exact parameter carrier source edge is invalid (recovery=0 depth=2)`；最小探针二分（zz_probe_w118 五变体 A/B/D/E 死、B/F 活）钉死=冷链对「var ptr 参数的读」不可达（var int64 读活、var ptr 纯 store 活），与内容正交的冷链缺口。终版按本文件 registry-slot 先例（:1412/:1420）改 uint64 槽地址+`__cheng_runtime_ptr_slot_load_raw/store_raw` intrinsics（provider 在 program_support_host_runtime.cheng，exe 链接恒在），秒级门 rc=0。
   - **C 级自测探针**（/tmp/oob_ab/w118/probe_ref_glue.c，PASS rc=0）：real ps_backend 对象（`--symbol-visibility:internal --export-roots:` 根选择编译，杜绝与 host provider 的重复符号）+ C 侧 4 个 int32 atomic 同契约原语，实证 ①8B ABI 宽度（槽前后 guard 字未被砸=撞 str 头 glue 必炸）②retain 保槽值+计数增 ③drop 释放一档+槽清零 ④refcount 数学精确（retain/drop 各恰一档，末次手动 release 恰 rc=1→0 无 underflow abort）⑤nil 槽 no-op。
   - **双 backend 白名单**：primary_object_plan.cheng `PrimaryBodyIrDirectExternalCallTarget` 与 backend2_lower_slots.cheng 镜像函数各加 `cheng_ref_drop_owned`/`cheng_ref_retain_owned` 两判定（紧跟 str drop/retained 条目后）；system_link_exec_runtime.cheng `SystemLinkExecRuntimeAddCoreRuntimeRoots` 加两条件根（str glue 同款 `AddCoreRuntimeRootIfNeeded` 形；另 AppendProgramSupportRelocRoots 的 reloc 扫描本身兜底拉根，双保险）。
   - **拒臂换 glue 绑定**（ownership_body_ir_production.cheng）：①RefObject 臂 :428 拒臂条件从 `!= OwnBorrowShared` 收窄为 `!= OwnMove && != OwnBorrowShared`——OwnMove 落穿 call-mirror 段，其余 ownership 类保持原判词面 fail-closed；②CleanupPlan glue 绑定段按 `typeFactStructuralKinds==RefObject` 择符号：drop=`cheng_ref_drop_owned`/retain=`cheng_ref_retain_owned`，否则原 str glue 原样。形状审计（scalar=Invalid、fixed=0、LocalPtrTag、child 闭包域）与 drift 四条件零改动。
2. **v6 判词推进实锤（kernel_driver_w118 sha256=d74d051309cb3fb8b511d8a01c5b5353dc05a3c3f0462a7f009d3c9bfc79757f，size 185413376）**：v6 compile rc=1 stderr（1056B 全文在 /tmp/oob_ab/w118/v6_w118_nextwall.stderr）唯一判词=`ownership_drop_ir: value definition consumed twice`；旧墙系列 grep 全 0：`drop-glue authority missing kind=8`=0、`TypeArena layout drift`=0、`ingress BodyIR ownership invalid`=0、`managed structural kind unsupported`=0。读法：op=3（`n = new(Node)` OwnMove）过 wall73 形状审计后进入 drop IR 构建分析（place 注册→Initialize→exit DropPlace 动作发射全通），死在 ownership_drop_ir.cheng:4618-4634 消费唯一性子句——某 (definitionOriginKind, definitionOriginId, sourceDefinitionDomain, sourceDefinitionRow) 四元组被两个 consume 动作（previous.consumeActionRow>=0 各持同四元组）命中。
3. **下一墙定性（授权面外，停手）**：判词死点=ownership_drop_ir.cheng :4622-4634（analyze 终审「同一 value definition 不得被两个 cleanup 动作消费」硬契约）；该文件不在本臂授权面，且判词零列（无 originId/domain/row 实况），需先富化判词（照 wall98/wall117 先例加四元组+actionIndex 全列）再定性双消费来源。两候选：①ref owned def 的 exit DropPlace 与 managed-producer/captured-old 释放臂对同一定义各发一 consume（drop IR 对「8B 句柄 place + 字段 place 挂同一 def」的新形状缺豁免臂，修法=ownership_drop_ir 加 RefObject 形同款放行/去重臂）；②上游 def 盖章把两个字段定义的 valueDefOriginId 盖成同一行（typed_expr/primary 盖章端查）。修法面=ownership_drop_ir.cheng（+可能 typed_expr/primary_object_plan 盖章端），均授权面外。
4. **同域检查（授权面内零残留）**：seq OwnMove 拒臂（:396-398）与 Borrow 视图 OwnMove 拒臂（:457-459）原样保留（各自 glue 权威属不同 ABI 家族，非本包范围）；ReturnSnapshotPolicy（:1429-1434 str snapshot glue）对 ref 类型保持原样——v6 无托管返回不触发， owned-ref-return 的 sret ABI 属后续臂，移交在案。
5. **门禁归因**：秒级门 primary_object_plan rc=2=既有缺口（wall28/w33/w35/w117 同签名归档；本臂 A/B 复证：apply 前 stash 态同命令同死 `trailing tokens in let initializer`）；其余 4 文件秒级门 rc=0。烤机 1 轮 rc=0（1/3 预算），零抬帽零 rc=125。

### 门禁与验收实况（cwd=仓库根）
| 门 | 结果 |
|---|---|
| 车头重建 cheng_w118（clang bootstrap/cheng_cold.c） | rc=0（13 warnings 冷链既有噪音），sha256=2f63cb3d42f6815ce97c6638233c01e1cb74854a4a73fcac8da422b4f147ebd8 |
| 秒级门 5 改动文件 | program_support_backend/backend2_lower_slots/system_link_exec_runtime/ownership_body_ir_production rc=0；primary_object_plan rc=2（既有缺口，A/B 归因在案） |
| 冷链 v6（cheng_w118 --emit:exe + 单跑） | compile=0 / run=0（语义参照 pass） |
| 烤机 1 kernel_driver_w118 | rc=0，sha256=d74d051309cb3fb8b511d8a01c5b5353dc05a3c3f0462a7f009d3c9bfc79757f，size 185413376 |
| **v6 × w118** | compile rc=1 判词推进：旧判词族 0 命中，新墙=`ownership_drop_ir: value definition consumed twice`（授权面外契约点） |
| ordinary × w118 | compile=0 / run=0 不回归 |
| call_fixture × w118 | compile=0 / run=1 契约预期不回归 |
| cold_nested × w118（只记录） | 未采——并行内存线（memline2b/2c/3）对 repo root flock 长窗口占用，v6 门经 45+ 次退避重试才进入，cold_nested 不属本臂必采项且并行线在先 |
| C 级 glue 探针 probe_ref_glue | PASS rc=0（5 项断言全过） |

### 交付与统计
- /tmp/oob_ab/wall118.patch（==wall118_r1.patch，131508 字节，vs HEAD 累积式以当前树态生成，HEAD 干净态 git apply --check 过；sha256=c25d32d414d126b2fed82627a1143b9576ac05555034668679500c1ebc639238）。分文件 hunk 区：program_support_backend +33（glue 对，mem_release_atomic 后）、primary_object_plan +10（白名单 2 判定+注释）、backend2_lower_slots +9（镜像）、system_link_exec_runtime +5（2 条件根）、ownership_body_ir_production +27/−5（拒臂条件+glue 择符号）。
- apply 前 git diff --stat（全树 60 文件）与 apply 后（5 授权文件 1334+/85−，其余为并行线态）存 /tmp/oob_ab/w118/diffstat_{pre,post}.txt + diffstat_post_5files.txt。注：并行 libp2p 线中途 commit 1baefe30f 未触及本臂 5 文件，patch 哈希前后一致复验。
- 产物 /tmp/oob_ab/w118/：probe_ref_glue.c/.o、probe_host_bridges.c/.o、probe_ref_glue（PASS）、ps_backend_v4.o/ps_backend_roots.o/ps_host_roots.o/core_prov.o、v6_cold_w118.exe、ordinary_w118.exe、call_fixture_w118.exe、v6_w118_nextwall.stderr（新判词全文）、secsgate_*.log、diffstat 三件、accept_w118.sh、accept_w118_lease.sh。
- 探针夹具 zz_probe_w118.cheng 用后已删；编排者资产（zz_v6_w7.cheng、user_path_gate.* 工作目录）零触碰；未 git commit；烤机 1/3 轮。
- **纪律自查**：一次 python3 内联串改探针文件误用 heredoc（当即改回 str_replace_editor 路径，无残留）；primary_object_plan 白名单 Edit 曾误截断后段条目，当次 Edit 内完整复原并 sed 复核零丢失。

### 移交（授权面外契约点，完整证据）
1. 下一墙=`ownership_drop_ir.cheng` :4618-4634 消费唯一性契约（判词 `ownership_drop_ir: value definition consumed twice`，v6 × w118 stderr 全文在案）。第一步=判词富化（四元组 originKind/originId/sourceDomain/sourceRow + actionIndex + kind，wall98/wall117 富化先例同款），再定性双消费来源（候选①drop IR 对 ref-owned「句柄 place+字段 place」新形的双 consume 臂缺豁免；候选②上游 def 盖章 originId 碰撞，查 typed_expr/primary 盖章端）。修法面=ownership_drop_ir.cheng（+可能盖章端），全部授权面外。
2. backend2 管线未实测 ref-owned drop 路径（白名单已对称接线；v6 走 primary，backend2 侧待专用夹具）。
3. owned-ref-return 的 sret ABI（ReturnSnapshotPolicy 对 ref 类型暂挂 str snapshot glue，不可达但不严谨）与 pointee 托管字段级联深释放（wall73 移交遗留 3）：均后续臂，v6 现形不触发。
4. 并行内存线对 repo root flock 的长窗口占用使 v6 门累计等待 ~80 分钟（45s/75s 退避 30+ 次全 busy，4s 密轮才挤入窗口）；后续臂验收建议避开其烤窗或预留同量级等待预算。
