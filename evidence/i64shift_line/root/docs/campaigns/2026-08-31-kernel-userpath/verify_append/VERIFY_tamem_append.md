# VERIFY_tamem_append —— [TA-MEM] typed/TypeArena 内存刀：模型+B1/B2 落地+上游转译回归阻塞定谳 2026-09-08

date_utc=2026-09-08 · 代理=TA-MEM（战役 R「typed/TypeArena 内存刀」）· 克隆=/Users/lbcheng/cheng-f24/tamem（cp -cR 主树 13:30 态；刀 commit=b44f71b26）· 交付=patches/tamem_b1.patch+tamem_b2.patch+tamem_diag.patch+tamem_repro_ifexpr.cheng（主树 `git apply --check` 全过）+VERIFY_tamem_model_append.md（已过审）· 全程默认 1GiB 帽

## 一、结论先行

**三件已完成、一件被上游墙阻塞：①理论内存模型已交付并过审（VERIFY_tamem_model_append.md——闭包硬参数实测锚定（230 源/643,601 行/30.64MB/2.64M body ops）+逐相 DOD 确定性公式（forest token 9 列×4B、node 29 列×4B 等）+静态 census 校准（3.80M tokens=0.114/byte）+逐相实测对账）；②B1/B2 双刀已落地并通过补丁链逐字节验证（B1=forest arena 精确容量两阶段合并，ArenaReserveCapacity+parserForestReleasePending，零 realloc 拷贝瞬态零容量过冲；B2=lineStore+lineInternPool 释放点前移过整个 forest/expr 窗 ~95MB+相序重排）；③基线账完整入档（GEN2 自烤 rc=125@781s，guard ru_maxrss=1.10GiB，死亡窗=after_profiles(478MB)→after_profile_lookup 之间，13 个 csg_stage+5 张峰窗 vmmap+40 张连拍）；④刀态自烤验证被上游回归阻塞——**当前 bootstrap 冻结转译态烤出的任何驱动，其 cheng 级 parser 无法解析 if 表达式**（5 行秒级复现，无刀控制驱动同点失败，TA-MEM 刀零嫌疑），属 bootstrap 冻结面/编译器域上游墙，精确归因矩阵已交付主线程。**

## 二、基线核账（ta1 完整死点曲线，m60 车头×克隆，默认帽）

| 相 | t | RSS（csg_stage 内账） | live_allocations |
|---|---|---|---|
| enter | 0s | 139.5MB | 47,045 |
| after_binding_source_texts | ~8s | 257.9MB | 58,138 |
| after_sort_sources | 13.2s | 270.9MB | 109,381 |
| after_profiles | 131s | 478.0MB | 2,411,803 |
| （无后续 stage 打印——死于此窗） | 781s | **峰 1,181,549,984B=1.10GiB（guard trip rc=125）** | — |

- RSS 形态（1s 树采样）：478→917MB(593s)→**骤降 500MB(671s)**→回爬 832MB(781s) trip。骤降=forest 倍增 realloc 完成后旧块释放（−417MB），反推 forest arena capacity≈512MB、T(净用)∈[256,512)MB——与模型 445-530MB 吻合。
- vmmap 分解（ta1 700/800MB 窗+ta6 616MB 连拍 40 张）：MALLOC_SMALL 299-347MB（live 3.35-4.6M 块，frag 7-19%，无碎片遗留）+VM_ALLOCATE 212-259MB（arena 生长）+二进制 ~190MB。
- 对照轮：ta6（连拍轮，kill 于 616MB 窗，after_profiles=560MB@114s——与 ta1 的 478MB@117.6s 差为负载窗漂移）。

## 三、模型→遗留物→刀（排刀序与语义等价）

| 刀 | 遗留物（模型 §六） | 刀体 | 语义等价论证 |
|---|---|---|---|
| B1 | forest arena 倍增拷贝瞬态（峰 +450-680MB）+2× 容量过冲 | arena.cheng 新增 `ArenaReserveCapacity`（纯增量 API，既有调用面零改动）；compiler_csg.cheng `CompilerCsgBuildParserForestAuthorityInto` 重解析路径两阶段化：Phase A 逐源解析入 `pendingTrees` 列表累计精确 ΣArenaUsed → Phase B `ArenaReserveCapacity` 一次成型+逐源 AppendFrom 即释（`parserForestReleasePending` 兜错误路径全释放） | 合并产物逐行同构（AppendFrom 未动）；驻留形状变化：Phase A=基座+T（列表），Phase B=基座+T 恒定（列表递减/out 递增互补），全程无旧+新共存瞬态；单源快速路径保留 |
| B2 | lineStore+lineInternPool（~95MB）越过最后读者滞留整个 forest+expr/typed-facts 窗 | ①相序重排：forest 合并+typedContextLookup 从 reachable set 之前移到 CompactProfilesForFixedPoint 之后（依赖核查：两者不读 reachable 输出，reachable 不读 forest ✓）；②`CompilerCsgPhaseArenaLineStoreReset` 从 after_immutable_source_snapshot_release 前移到 compact 之后（reachable set=行表最后读者：metadata contexts(36558)与初始 reachable 扫描(25347,仅被 26224 初始构建调用)都在此前；后缀函数切片按七条②注释自 immutable snapshot 重建行 ✓；profileLineIdColumns 引用已由 compact 清空，reset 后无任何读者（grep 全量核验）），原释放点删除并留注释 | 释放点=最后读者之后（l3b2 三要素）；reset 幂等守卫原样（abort 面 teardown 不受影响）；代际 hard-fail 合同不变 |
| diag | —（计量面） | `CHENG_CSG_MEM_TRACE=1` 门控 csg_mem 打印（enter/逐源/forest 逐源/typed ir 轮/结构容量），默认关零漂移 | 纯打印，env 门控 |

补丁（主树 `git apply --check` 全 rc=0；链式 apply tamem_b1→tamem_b2→tamem_diag 与克隆状态 `/usr/bin/diff` 逐字节等值；`git apply -R` 回滚干净）：
- `patches/tamem_b1.patch`：arena.cheng（+20 行）+compiler_csg forest 合并 5 hunks
- `patches/tamem_b2.patch`：compiler_csg 相序/释放点 3 hunks
- `patches/tamem_diag.patch`：csg_mem 计量通道 9 hunks（可选，默认关）
- `patches/tamem_repro_ifexpr.cheng`：上游回归 5 行复现件（§五）

## 四、模型 vs 实测对账（第二步口径，现状实现基线）

| 相 | 模型值 | 实测 | 差值 | 定性 |
|---|---|---|---|---|
| enter | 190MB | 139.5MB | −50MB | LINKEDIT 未全驻，✓ |
| bind | 230-250MB | 258MB | +8-28MB | ✓贴线 |
| profiles | 372-392MB | 478-560MB | +86-188MB | churn 死页+负载窗漂移；B2 后重测应回落 |
| forest 窗峰 | 理想 350+T+s≈780-880MB；现状实现=理想+倍增瞬态 | 1,081-1,127MB | +250-300MB | **B1 靶**：倍增瞬态（骤降段实证） |
| B1+B2 预期 | 基座(~300)+T(450-510)+s ≈ 750-880MB | 待上游墙解除后实测 | — | §六 验证协议 |

## 五、上游墙（阻塞定谳+精确移交）

**墙形态**：任何由当前 bootstrap 冻结转译态（73debaef2，09-05 提交；11:02 与 HEAD 两态冷二进制 sha 同为 b0db924a…）烤出的驱动，其 cheng 级 parser 对 if 表达式（`let x = if c: a else: b`）误报 `parser value expr: if expression else missing`。首个命中源=src/core/analysis/ownership_body_ir_production.cheng（statement_offset=14919/12418），GEN2 自烤 rc=2@66-72s。

复现件：`patches/tamem_repro_ifexpr.cheng`（5 行，克隆内 `src/tests/` 下秒级复现）。

归因矩阵（3×驱动判别）：

| 驱动 | parser.cheng 源 | 冷后端 vintage | 刀 | 同一复现件结果 |
|---|---|---|---|---|
| m60（认证） | 09:19 工作树态 | cheng_cold_v2（Sep 7 二进制） | 无 | **parse 过**（rc=2 reachable entry missing: main——晚得多的相位） |
| ta8h/ta9h | HEAD（WIP 已回退验证） | 11:02/HEAD 转译（两态冷二进制同 sha） | 有 | parse FAIL |
| ta10h | HEAD | 同上 | **无（控制轮）** | **parse FAIL** |

**定性**：TA-MEM 刀零嫌疑（控制轮同点失败）；变量收敛=冷后端 vintage（cheng_cold_v2→当前转译态之间的 bootstrap 变更）和/或 parser.cheng@HEAD 与 09:19 工作树态之差。归属=bootstrap 冻结转译面/编译器域（非 TA-MEM 五面任一）。gen2break §九「快照纪律」教训的在途实例：认证车头（m60/m52）与当前转译态已分叉。

## 六、解除阻塞后的验证协议（主线程执行，模型已给预期值）

1. bootstrap 修复后：`tools/build_backend_driver_clt.sh --no-raster`（克隆根）重编冷二进制 → `ta_bake_knife.sh taXh`（.w/ 内，默认帽）烤刀态驱动 → 先跑 repro 件探针（应 rc=2 reachable entry missing 而非 parse fail）。
2. 刀态自烤：`.w/ta_bake_ta8.sh`（换新驱动路径），900s 默认帽——判据：rc=0+树峰 ≤768MiB+逐相对模型 §四报差值（B1 后 forest 窗无骤降锯齿、B2 后 expr 窗基座 −95MB）。
3. 配对烤机 sha EQ×2+四夹具门（`tools/user_path_gate.sh --driver <刀态驱动>`）+12 绿 7 红判词对 m14 零漂移。
4. csg_mem 通道（CHENG_CSG_MEM_TRACE=1）钉模型待钉区①-⑤（token/node/typeSyntax/行池 entries/facts 行数打印已在 diag patch 内）。

## 七、纪律记录

- 抬帽违章自首与处置：ta4h/ta5h 两轮 12GiB 抬帽（V6-MEM 先例引用错误）被用户抓拍纠正，立即 kill 在飞轮次并销毁产物（ta4h rc=125 无产物；ta5h rc=124 部分产物已删），未入任何交付链。此后全轮默认帽。
- ta6 连拍轮按指令 kill 于 616MB 窗，曲线+40 张 vmmap 已入档 .w/ta/ta6/。
- 主树足迹=纯新增：patches/tamem_*4 件+verify_append/ 两份文档，零源码改动、零他线文件触碰；patch 链测试在 /tmp 副本与克隆内完成，主树 `git apply -R` 演练后即回滚。
- 大产物清理：.w/ta 仅留 ta8h 刀态驱动（sha d900da18…，线内克隆自烤口径）与日志/曲线/vmmap；ta2h/ta3h/ta7h/ta9h/ta10h 驱动已删（sha 已录：ta7h=5f718d48…、ta9h=ta8h 同 sha、ta10h=26f05b30…）。
- 语义权威零改动：parser.cheng/primary_object_plan/program_support_backend 零接触（parser.cheng 曾在克隆内回退 WIP 做判别，已按 b44f71b26~1 基线复原后只含本刀两文件改动）；bytes 铁门/守卫合同/报告契约零触碰。
