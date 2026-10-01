# wall136.VERIFY

## 判定：v6 `cleanup_cfg: return snapshot action authority missing` 墙已死——根因=heap `new(T)` 的 setMem 清零调用 arg0（裸 targetSlot）在 exact_def mirror 臂被伪消费（Move 戳），r3 烤机实证判词推进至 `cleanup_cfg: snapshot interface source invalid`。修面落 primary_object_plan.cheng `PrimaryBodyIrAppendHeapObjectAllocZero`（[wall136] 标记，跨文件最小触碰，必然性论证见二）。ordinary 0/0、call 0/1、车头四夹具全绿零回归；cold_nested compile=0（wall134 在树进展，run=139 SIGSEGV 归 wall134 台账）。烤机 3/3 用尽。

## 一、定性（声明真而填充缺的生产漏环节）

- **墙点**：`cleanup_cfg.cheng:15331-15336 cleanupCfgAppendIntentReturnSnapshot`——`exitUsesOwnershipActions[exitId]=真` 但 `exitOwnershipActionStarts[exitId] ∈ {-1, ≥len}` 即 fail。
- **r1 富化判词**（进场复现，逐字）：`... fn=3 exit=2 start=0 count=0 actions=0 snap=1 src=14 snapSlot=36 edge=2 retEdge=-1 trStart=2 trCount=0 exits=13 csr=[e0k1s0a0c0|e1k1s0a0c0|e2k2s1a0c0|e3k1s0a0c0|e4k1s0a0c0|e5k1s0a0c0|e6k2s1a0c0|e7k1s0a0c0|e8k1s0a0c0|e9k1s0a0c0|e10k2s1a0c0|e11k1s0a0c0|e12k2s1a0c0]`——fn3=main（唯一拥有托管局部者，fn0-2 全 15 节点过），13 exit 中 4 个 return（k2=Return）全部 UnmanagedCopy 快照（s1），**plan 全域 0 动作**。
- **r2 二级取数**（失败臂增列）：`places=1 sites=2 siteActions=0 qual=1 [o4s0k4st2]`——qual=唯一合格 def op4（slot0=Node，Ptr/Managed，即 `n = new(Node)` 的 wall72 (R_decl,OwnMove) 盖章 def）；places=1=place(n) 已注册；sites=2=Initialize(op4)+**唯一一个 Consume**；siteActions=0。
- **伪消费源定位**（零烤机，r1 驱动 `CHENG_PRIMARY_OBJECT_FAIL_TRACE=1` 实录）：`phase=call_arg_formal_ownership_fill function=main line=47 target=outer argc=2 owns=4,2,` + `phase=exact_def_arg_formal_mirror op=17 call=4 arg=0 formal=4 def=3`——用户调用 `outer(n,2)` 的形参权威已落列且 BorrowUnique 覆盖臂生效（无消费）。唯一 consume fact 源=`new(T)` 发射器 `PrimaryBodyIrAppendHeapObjectAllocZero`（primary_object_plan :17119-17135）内 `setMem(targetSlot, zero, size)` 的 arg0：裸槽（非地址编码，堆块清零必须传指针值）→ exact_def derive mirror 臂（formalOwns 空=合成 call 既有行为）按 op4.vd_own=OwnMove 镜像 → body_ir_access :1421 `consumesDefinition=(arg==OwnMove)` → ownership 生产 AppendConsume(place(n)) → n 在 setMem 处被杀，全程再无 live 窗口 → return 边零 drop 动作（validateClosed 因 n 死而 vacuous 通过）→ exit 无条件 uses=true（:8096 注册态）+ 快照 ≠ None → append 守卫必死。
- **C 参照链对拍**：cheng_w126 编 v6 obj 含 `_cheng_mem_release` 未定义引用=参照语义有释放；kernel 链 0 动作=伪消费丢失 drop，非合法形。守卫本身 fail-closed 正确，**禁消费侧放水**成立——修生产侧填充。

## 二、修法（在树，2 hunk 全带 [wall136] 标记）

1. **[wall136] 主修（跨文件最小触碰，primary_object_plan.cheng `PrimaryBodyIrAppendHeapObjectAllocZero`，纯插入 +16）**：zeroCall 落 `argFormalOwnerships=[BorrowUnique, OwnInvalid, OwnInvalid]`。arg0 走 exact_def derive 既有 BorrowUnique 覆盖臂（wall131 形参权威同机制、同代码路径，mirror 实录已证其生效）→ argOwnerships=BorrowUnique → consumesDefinition=false → 伪消费消失 → place(n) 全程 live → return 边逐 exit 落 DropPlace 动作（glue=cheng_ref_drop_owned，wall118 绑定在册）。arg1/2 哨兵行（OwnInvalid=契约明文的 no-formal-authority）保持 mirror 逐字节不变；argSlots/argPassKinds/ABI 零改动；`formalOwns.len==argCount` 契约满足。跨文件必然性：消费链 exact_def fact → body_ir_access consume 谓词 → ownership AppendConsume 三处共同根=合成 call 无形参权威，唯一不动 ABI、不动 exact_def 既有臂、复用已验证机制的堵点=发射器落列；该文件授权面外但为唯一契约对齐修面（任务书授权条款），wall133 LocalPtrTag 第三臂「注册白名单补同步」同构。
2. **[wall136] 判词富化（cleanup_cfg.cheng append 守卫失败臂，+52 守卫行逐字保留）**：fn/exit/start/count/actions/snap/src/snapSlot/edge/retEdge/trStart/trCount/exits + 全 exit CSR 投影 + places/sites/siteActions/qual 全列。仅失败臂取数（wall133 st=103 同域先例），绿路径零行为变化。

## 三、烤机台账（3/3，全部 sha256+size，配方=head 三件套+cold_cache+ENTRY_CACHE=0，cwd=仓库根）

| 轮 | 产物 | sha256 | size | 内容 | 结果 |
|---|---|---|---|---|---|
| r1 | kernel_driver_w136_r1 | 53487b2cf8c49540ddb3939eee61d21319d3c8483562404862adeb6ed1edaff4 | 186269472 | 进场复现+判词富化 | v6 判词逐字富化（fn3 全域 0 动作铁证） |
| r2 | kernel_driver_w136_r2 | 8b74e82de24d736383c72c8ce09fc9ffdd1555cb0f9b881e7d6e7588f8fc8005 | 186285888 | 二级诊断增列 | places=1 sites=2 siteActions=0 qual=1 定位伪消费 |
| r3 | kernel_driver_w136_r3 | f5ac83a5c904a833bf0660df56f157e3db3fba68d899f551e74defb83ec29fa7 | 186285888 | + zeroCall 落列主修 | v6 判词推进（见四） |

秒级门：cleanup_cfg.cheng × 车头 rc=0（r1/r2 两次，产物 w136_cleanup_cfg*.o ≈5.18-5.19MB）；primary_object_plan.cheng × 车头 rc=2=**任务书既有雷**（闭包触及 codegen_a64_fill_units.cheng :471 var-缩进块 parse，判词点名该文件，非本改动；本 hunk 纯插入零删行、语法与同文件 fill 函数 :14757 既有模式逐字同款）。探针 zz_probe_w136_a/b/c 已建已删（a 挂 lowering 既有墙、b/c 挂 csg 既有墙，均非本墙，零残留）。

## 四、v6 判词推进实录

- r1/r2（修前）：`cleanup_cfg: return snapshot action authority missing fn=3 exit=2 ... actions=0 ...`（compile=1）
- r3（修后）：`cleanup_cfg: snapshot interface source invalid`（compile=1）——**本墙已死**，append 守卫通过（动作已填），判词前移至同函数 `cleanupCfgSnapshotInterfaceCid`（cleanup_cfg.cheng :15201-15206，`BodyIRTypeArenaArtifactCidValid(typeArenaArtifactCid) || typeArenaTypeId < 0 || projectionPolicy 无效` 三联判）。

## 五、门禁实况（cwd=仓库根）

| 门 | r3 | 车头 cheng_w126（语义参照） |
|---|---|---|
| zz_v6_w7 | compile=1 `snapshot interface source invalid`（**推进**） | 0/0 |
| ordinary_zero_exit | 0/0 | 0/0 |
| call_fixture | 0/1（契约预期） | 0/1（契约预期） |
| cold_nested（wall134 领地，只记录） | compile=0 run=139（SIGSEGV）——r2 轮时尚 compile=2 cold export root missing，r3 已编过=wall134 在树进展；run 挂=CN-3 run 值语义，归 wall134 台账 | 0/0 |

log 档案：/tmp/oob_ab/w136/{r1_v6,r2_v6,r3_v6,r3_call,w126_*,r1_v6_trace,sec_r2c,sec_r3}.log、gates_w136.sh、bake_rN.sh。

## 六、移交事项（下一线）

1. **新死点（cleanup_cfg.cheng :15201 `cleanupCfgSnapshotInterfaceCid`）**：`return 100+r` 类 unmanaged temp 快照（exit=2 src=14）落 interface CID 时三联判死。定性线索：slot14 为算术 temp，`typeArenaTypeId` 疑似 -1（unmanaged 标量槽无 TypeArena proof 生产面，wall135 同源结论：int32 无 drop-glue 无布局 hop）；对照 wall133 已放行的「proof 即完整」dual-domain 先例，修面候选=interface CID 对无 proof unmanaged 快照源的精确镜像放行或快照源 typeId 缺省权威补齐，归属线先以富化判词核实三联判中具体哪条腿死（判词现无列）。
2. **wall131 移交债（大幅推进）**：argFormalOwnerships fill/mirror 的语义级正确性已由本墙修复实证（BorrowUnique 覆盖臂生产可用、伪消费根随 setMem 落列同步收敛）；剩余=全 15 节点 rc 契约验证，随 v6 清墙轮顺带完成。
3. **cold_nested run=139**：wall134 领地（CN-3 run 值语义，census 预判命中），本轮只记录。
4. **本线增列的持久价值**：append 守卫失败臂已带全 CSR/qual/places/sites 列，下一线定性无需再烤诊断轮。
5. 仓库根残档：src/tests/zztmp_claude_ccfg_probe.cheng、cold_ok_result_three_consumer_negative.cheng（他线残留，非本线产物）。

## 七、diff 统计与交付

- **/tmp/oob_ab/wall136.patch**：当前树态 `git diff HEAD` 全树生成，14243 行，72 files +8180/−1278（含 wall134/135 等并行线在途 hunks 原样照录）；`git apply --check --reverse` **PASS**（sha256=f01e4e1b0dd5e9f165d9de337ddbd29424cb2a1d5ab45b5dde2fee86fdb2cf02）。
- **本线增量=2 hunk**：src/core/analysis/cleanup_cfg.cheng `cleanupCfgAppendIntentReturnSnapshot` 失败臂富化（原 8 行→60 行，守卫谓词逐字保留）；src/core/backend/primary_object_plan.cheng `PrimaryBodyIrAppendHeapObjectAllocZero` 纯插入 +16（零删行）。其余文件零触碰；两文件内他人 hunks（wall44/57/62/64/76/79/95/121/122/129/131/133 系）原样保留。
- 未 git commit、零分支/worktree；src/tests 零本线探针残留（zz_probe_w136_a/b/c 用后即删）；临时产物全部收在 /tmp/oob_ab/w136/。
- 租约纪律：wall134 线并行烤机多波 `parent lease unavailable`，全部按退避（30-60s×N）串行消化，无误燃；call 门与 r3 门禁矩阵的租约波均重跑补齐。
