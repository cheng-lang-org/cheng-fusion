# BodyIR ingress LocalShape 墙（`code=11 site=1 index=4 detail=0`）静态定位

**任务**：静态定位判词 `ownership body ir production: ingress BodyIR ownership invalid code=11 site=1 index=4 detail=0 fn=0`
（`src/core/analysis/ownership_body_ir_production.cheng:1377`）的根因。
**纪律**：本轮零编译（未占编译槽）；交付 = 本文档 + 一枚**判词富化补丁**（读数 B，owner ①批准；
不落树、以文件形态交付，工作树已精确回退、字节等同 HEAD）；未留探针、未改任何判据。
**交付物**：
- 证据文档 = 本文件；
- 补丁 = `patches/bodyir_ingress_ownership_entry_slot_dump.patch`（+15/−0，sha256
  `1803884aff293d6b35b90216d1d67dd274c8f9e5f2a9731607efe3397b0c9c6a`），冻结副本
  `.rebuild/s1b_step3/r9/patchgen/bodyir_ingress_ownership_entry_slot_dump.patch`（同 sha256），
  `git apply --check` exit 0（基线=当前工作树）—— 详见 §7.1；
- **无根因修法补丁**（产生者未点名，理由见 §7.0）。

---

## 0. 结论（先行）

1. **这不是 ownership 语义问题，是槽表身份问题**。`code=11` = `BodyIrAccessErrorLocalShape`
   （`src/core/ir/body_ir_access.cheng:61`），全树唯一产生点 `:5904`，它审的是
   **`bodyIR.localSlots[]` 的形状**，不是 Owned/Borrowed、不是 value-def、不是 retain/release。
   四元组 `site=1`=`BodyIrAccessSiteEntry`（`:12`），`index=4`=槽行号，`detail=0`=`localSlots[4].id`。
   即：**第 5 个槽的不可变身份 `id` 是 0，而它落在第 4 行**（`id != index`），违反
   `id == index` 不变量。四条子句里只有这一条能同时产出 `index=4 / detail=0`
   （另三条失败时 `detail` 仍等于 `id`，会是 4 而不是 0）。
2. **类别判定 = (a) 生产者真缺口**，不是 (b) 消费者过严：`id == index` 在树内被 **9 处**独立确立
   （2 处生产者硬 panic 守卫 + 7 处消费者/契约检查，见 §4.1）。放宽 `:5897` 等于允许「槽身份≠行号」，
   下游 cleanup/regalloc 全部按行号索引槽表 ⇒ 只会把判词换成静默 miscompile。
3. **但"哪一个生产者写出这个槽"这一层，静态不可判**（明确结论，不是含糊），且留下一处必须解释的矛盾：
   - 反证链 A（生产者侧）：穷举全树 16 个 `localSlots` 变更点（§4.2 表），**每一个要么显式写
     `id = 当前行号`，要么紧跟一个 `id == len-1` 的硬 panic 守卫**（`core_types.cheng:1985-1993` /
     `:2126-2141`）；任何 `slotNames`/`localSlots` 失步都会在下一次追加时 panic。观测到的状态按
     源码语义**不可达**，且取证件里**从未出现过**这两条守卫的 panic 文案（§4.3 已 grep 全
     `.rebuild/s1b_step3`）。全树也不存在 `LocalSlot[]` 形参别名（`grep "LocalSlot\[\]"` 仅 2 处：字段与日志字段）。
   - 反证链 B（消费者/机制侧）：**同代驱动的正对照证明机制正常** —— AB 轮 `rc=0` 件
     `ordinary_zero_exit_fixture` / `call_fixture` / `cold_nested_fmt_interpolation_smoke` /
     `v6_direct1_repro` / `probe_local_only` / `probe_ordinary`（`.rebuild/s1b_step3/r9/ab_*.rc`，
     01:35–01:45，与 r9z 同工作树世代）都是多槽 body 且**通过了同一个 ingress**。
     ⇒ "驱动把 `ls.id=slotId`/守卫整体误编译"这种全局解释**被正对照否证**（那会让所有 body 在槽 1 就死）。
   - 结论：两条反证链合起来只留下一个读法 —— 坏槽来自**固定数组字段路径**上的槽产生/槽表重写，
     而它在树内 16 点穷举之外。（**保留口径**：正对照件产于 01:35–01:45 世代，早于 kd_r9z 的
     01:51 烤制；"kd_r9z 这一代整体回归"仍未被正对照覆盖，见 §8 第 4 条。）
     这一层必须由**一条运行期读数**终结（§6 读数 B，直接打出该槽的表行）。
4. **本轮不交补丁**（理由见 §7）：修法落点 = 那个漏写 `id`/绕过守卫的产生者，而这个产生者尚未点名。
   交一个"给 `:5897` 加白名单"或"事后补齐 id"的补丁就是兜底/启发式，按铁律禁止。

---

## 1. Q1：`code=11` 是什么

| 项 | 事实 | 坐标 |
|---|---|---|
| 错误码枚举 | `BodyIrAccessErrorLocalShape = 11`（枚举 0..15：None/UnknownOp/Arity/LocalRef/CallOrdinal/CallShape/PassKind/EncodedArg/TermShape/LiteralRef/OperandShape/**LocalShape**/AddressOwner/AddressRange/AbiLayout/Ownership） | `src/core/ir/body_ir_access.cheng:50-65` |
| 唯一产生点 | `bodyIrAccessFail(table, BodyIrAccessErrorLocalShape, BodyIrAccessSiteEntry, slotIndex, bodyIR.localSlots[slotIndex].id)` | `src/core/ir/body_ir_access.cheng:5904-5906` |
| 全树复查 | `grep -rn "BodyIrAccessErrorLocalShape" src/ --include=*.cheng` ⇒ 仅 `:61`（常量）与 `:5904`（调用）两行 | 同上 |
| 判词出口 | 判词前缀文本唯一出现于 ingress 门 | `src/core/analysis/ownership_body_ir_production.cheng:1377` |

**语义名**：`BodyIrAccessErrorLocalShape`（BodyIR 本地槽表形状非法）。
注意判词前缀写死为 "ingress BodyIR ownership invalid"，**与 code 的实际语义无关**
（同一出口还会以 `code=15` 报 Ownership、`code=3` 报 LocalRef 等）。

## 2. Q2：`site=1` / `index=4` / `detail=0` 各指什么

| 字段 | 含义 | 坐标 |
|---|---|---|
| `siteKind` | `BodyIrAccessSiteEntry = 1`（另有 `SiteOp = 2` / `SiteTerm = 3`）。**不是第 1 个函数/块，是"站点类别 = 入口相"** | `body_ir_access.cheng:11-14` |
| `errorSiteIndex` | 该站点类别下的行号。Entry 相下 = **`localSlots` 槽行号**（Op 相=op 行、Term 相=term 行、LiteralRef=字面量行） | `body_ir_access.cheng:5904-5906`、`:5914-5918`（Entry+slotIndex）、`:5922-5924`（Entry+literalIndex） |
| `errorDetail` | 该门自选的诊断整数；LocalShape 门下 = **`localSlots[index].id`** | `body_ir_access.cheng:5906` |
| 四元组写入 | `bodyIrAccessFail` 只在 `table.valid` 时写入 ⇒ 记录的是**首个**失败点的四元组 | `body_ir_access.cheng:347-357` |
| `fn=0` | `bodyIR.controlFunctionRow`，即该 body 的 typed 函数行；本夹具=第 0 号函数 `main` | `ownership_body_ir_production.cheng:1377` |

**为什么判词这么短（关键信息被结构化掐掉）**：ingress 的富化 dump 整块被 `errorSiteKind == SiteOp`
挡住（`ownership_body_ir_production.cheng:1356-1375`）。**槽表投影的打印代码本来就已经写好了**
（`:1373-1375`，逐槽打 `s{i}:tk=…:pk=…:mg=…:aux=…:off=…:tid=…`），只是 Entry 站点走不到 ——
这正是本轮无法从判词直接读出"哪个槽"的结构原因（§6 的第一条读数就是把它放出来）。

**被证伪的替代读法**（都不成立，逐条排除）：
- `detail` 是 typeKind/placeKind？否 —— 三条非 id 子句失败时 `detail` 仍取 `id`，会是 4。
- code=11 来自其它文件/其它表？否 —— 全树仅 `:5904` 一处（含 `bodyIrAccessFailPhase` 变体，同为该行）。
- `index=4` 来自 literal 循环？否 —— 那是 `BodyIrAccessErrorLiteralRef = 9`（`:5920-5925`）。

## 3. Q3：缺的精确事实是什么 / 该由谁产生 / 为什么 M-A 上没有

**缺的事实**：`bodyIR.localSlots[4]` 的**不可变身份**——它的 `id` 必须等于它的行号 4。
这不是 ownership 语义事实（Owned/Borrowed、value-definition、retain/release 平衡、sret 归属都与本门无关：
本门在 ownership 语义被审之前就拒了，`BodyIrAccessDecode` 整个返回 `valid=false`）。

**权威产生点（canonical form）**：
| 场景 | 产生者 | 坐标 | 守卫 |
|---|---|---|---|
| 未 seal 期（源码 lowering） | `PrimaryBodyIrLocalSlotNewSized`：`ls.id = slotId` → `add(localSlots, ls)` | `src/core/backend/primary_object_plan.cheng:4405-4449` | 紧跟 `BodyIRAppendUnboundLocalBindingValueDefinitionRow(bodyIR, slotId)`：要求 `slotId == localSlots.len-1`，否则 panic | `src/core/ir/core_types.cheng:1985-1993` |
| 已 seal 期（cleanup/ownership 合成槽） | `Post-seal` 各追加者 | `cleanup_cfg.cheng:3512/6882/6922/6971/13179`、`ownership_body_ir_production.cheng:235/254` | 紧跟 `BodyIREntryDefinitionOwnershipAppendSyntheticSlot(bodyIR, slotId)`：要求 `slotId == localSlots.len-1` 且三个 sidecar 长度都 `== slotId`，否则 panic | `src/core/ir/core_types.cheng:2126-2141` |

**为什么 M-A 上没有产生**：因为第 5 个槽带着 `id=0` 落了盘。**但"哪个产生者写的"在树内找不出**——
见 §4.2 穷举：16 个变更点全部自证会写对或直接 panic。观测状态要成立，必须有一个
**直接 `add(...localSlots, slot)` 且 `slot.id` 未写（默认 0）**的追加，并且它的三个 sidecar 长度仍与
`localSlots.len` 自洽 —— 而 seal 恰好会**回填**空 sidecar（`core_types.cheng:2085-2090`），
所以"seal 之前发生的裸追加"在事后**不会**被形状门抓住（形状门在 `:5882-5895`，先于槽循环，
且它只看长度/取值域，不看 `id`）。这条通路在树内**没有任何一个追加者符合**（§4.2 逐条排除）。

## 4. Q4：判定与反证链

### 4.1 排除 (b)：消费者过严（口径错）
`id == index` 不是本门新发明的口径，而是树内 9 处独立确立的同一不变量：

| # | 位置 | 角色 |
|---|---|---|
| 1 | `core_types.cheng:1985-1993` | 生产者守卫（未 seal 追加，`id != len-1` → panic） |
| 2 | `core_types.cheng:2126-2141` | 生产者守卫（已 seal 追加，同前 + sidecar 长度） |
| 3 | `core_types.cheng:3578-3580` | `BodyIR…ContractCheck`：`localSlots[i].id != i → return 20` |
| 4 | `core_types.cheng:12966-12970` | `bodyIRDodCheckLocalSlots`：DOD/SoA 契约 |
| 5 | `core_types.cheng:2481`、`:3405`、`:3518`、`:3704`、`:5893` | 若干投影/查表门 |
| 6 | `cleanup_cfg.cheng:2205`、`:2274`、`:3960` | cleanup 计划入口 |
| 7 | `regalloc_single_pass.cheng:4425` | canonical regalloc 入口 |
| 8 | `body_ir_access.cheng:5897` | 本门（ingress） |
| 9 | `body_ir_access.cheng:5921`（字面量同构） | 入口同族 |

同一 body 的槽 0..3 **都满足**该不变量（循环从 0 起，首个失败点是 4）⇒ 不是"整套口径不适用于本 body"，
而是**单点身份被写坏**。放宽 `:5897` ⇒ 该槽在 cleanup/regalloc 里会以行号被消费 = 用错身份，
属静默 miscompile（铁律禁止）。**(b) 排除。**

### 4.2 排除"树内某个已知产生者"：(a) 的具体点位静态不可判
穷举全树 `localSlots` 变更点（`add(...localSlots, …)` / `localSlots[i] = …` / `localSlots = …` / `setLen(localSlots, …)`，跨行匹配）：

| 变更点 | 形态 | `id` 是否写对 | 结论 |
|---|---|---|---|
| `primary_object_plan.cheng:4447` | `add(localSlots, ls)`，`ls.id = slotId` | 是 + 守卫 | 排除 |
| `primary_object_plan.cheng:70298` | `slot.id = 0`，index 0（`BodyIRNew()` 新体） | 是（0 行） | 排除 |
| `primary_object_plan.cheng:62272` | `out.localSlots = bodyIR.localSlots`（整体搬移） | 保留 | 排除 |
| `primary_object_plan.cheng:44732` | `setLen(localSlots, checkpoint.slotCount)`（事务回滚） | 不新建元素；前置 `:44641` 有 `len < slotCount → panic` 守卫 | 排除 |
| `primary_object_plan.cheng:4400/5632/5684/5873/44728` | 元素写：均从**既有槽**拷贝后改字段 | 保留 | 排除 |
| `cleanup_cfg.cheng:3512/6882/6922/6971/13179` | `projection/snapshot/owner/captured.id = <当前行号>` + synthetic 守卫 | 是 + 守卫 | 排除 |
| `ownership_body_ir_production.cheng:235/254` | `.id = localSlots.len` + synthetic 守卫 | 是 + 守卫 | 排除 |
| `low_uir.cheng:186` (`lowUirEnsureLocalSlot`) | `.id = localSlots.len` | 是 | 排除（但**不写 sidecar**，若在 seal 前发生会被 seal 回填） |
| `uir_thunk_synthesis.cheng:185` | `.id = localSlots.len` | 是 | 排除 |
| `backend2_*.cheng`（`lower_util:2288` 等） | 与 primary 同构（同守卫） | 是 | 排除（且本编译走 primary，见下） |
| `backend2_frag_codec.cheng:2844`（解码） | 从 payload 读 `slot.id`（写侧 `:1773-1780` 逐槽写 id） | 是 | 排除（且 `BACKEND_JOBS=1` ⇒ 池化/编解码路径不启用） |

补充排除（后端选择、体来源）：
- 本编译走 **primary**：`plan.actualBackendKind = "primary"`（`primary_object_plan.cheng:76911`），
  backend2 只在显式选择时启用（`:76830` 仅做 receipt 分派）。
- 失败体是**夹具自己的 `main`**（不是 provider）：取证件里只有 1 个源、1 个函数、1 个 typed 轮次
  （`.rebuild/s1b_step3/r9/fx_r8_fixed_len_inline_arith_main.stderr.txt:8` `functions=1`、
  `:10` `entries=1 sources=1`、`:17` `src=0 decls=1 path=…/r9_r8_fixed_len_inline_arith_main.cheng`），
  且只有一个非零 lifecycle（`:26`）。
- 该体只被构建/审一次：`PrimaryBuildBodyIrForFunction` 只有一个调用点（`primary_object_plan.cheng:67324`），
  `ApplyOwned` 在 primary 只有一个挂接点（`:66382`），"LoweringPhase → BuildItemsPhase 重入"有 memo 短路
  （`:67206-67216`），池化路径要求 `BACKEND_JOBS>1`（`:67363`），而 `try_r9.sh` 设 `BACKEND_JOBS=1`。

### 4.3 阴性证据（金丝雀）+ 正对照（新）
两条守卫的 panic 文案是**金丝雀**：若源码语义被忠实执行，任何导致 `id != index` 的追加都必然先在
`:1989` 或 `:2134` abort，判词会是 `body ir local binding definition: append state invalid`
或 `body ir entry definition ownership: synthetic slot row invalid`，**而不会是 ingress code=11**。

- 阴性实测：`.rebuild/s1b_step3` 全量取证件 grep 这两条 + 相关事务守卫文案
  （`append state invalid` / `synthetic slot row invalid` / `freeze shape invalid` /
  `transaction_prefix_corrupt` / `name_overlay_invalid`）⇒ **0 命中**。
- **正对照（本轮新增，决定性）**：AB 轮 6 件 `rc=0`（`.rebuild/s1b_step3/r9/ab_*.rc`）
  —— 多槽 body（局部变量、调用、`str` 插值、聚合）**通过了同一个 ingress**，
  ⇒ 槽身份机制在生产驱动上工作正常，"全局误编译"解释排除；
  ⇒ 坏槽是**固定数组字段路径特有**的确定性缺陷（与 §5 的五夹具同坐标吻合）。
- 已做的部分核验：kd_r9z 与本树在**关键代码存在性**上一致（binary 内字符串抽检 8/8 命中：
  `ingress BodyIR ownership invalid`、两条守卫文案、`#seq_add_off#`、`#fae_esz#`、`#fae_addr#`、
  `#ownership_guard_snapshot#`、`#canonical_return_snapshot#`），且本路径 4 个相关文件
  （`body_ir_access.cheng` / `core_types.cheng` / `cleanup_cfg.cheng` / `primary_object_plan.cheng`）
  在本树 `git status` 中**未修改**（=HEAD）。
- 跨驱动复现：M-A 在 **kd_r9z**、四正例在 **kd_r10** 上报出**逐字相同**的四元组
  （`disc_ma_prerix_r9z.stderr.txt:3` / `fixtures_r10.txt:3,5,9,11`）⇒ 不是单次烤机的偶发产物。

### 4.4 (c) 的定位
只是"**暴露**"意义上的 (c)：本墙早已在链上，只是被前一堵 `canonical admission blocked missingFactBitmap=5`
挡在后面（`docs/campaigns/2026-08-31-kernel-userpath/design/deterministic_model_derivation.md:800-812`）。
**不是** const/symbol 义务修复引入的：五个夹具（含零 const 的 M-A）在**同一槽位、同一四元组**上失败，见 §5。
修 bit 4 不会改变本墙的存在（只改变它被谁先撞到）。

## 5. 五夹具同坐标（本轮新增证据，用于排除"const 相关"归因）

| 夹具 | 形态差异 | 判词 |
|---|---|---|
| `r9_ma_zero_const_probe.cheng`（M-A） | `int32[8]` 字面量长度、索引 0/3 | `code=11 site=1 index=4 detail=0 fn=0` |
| `r8_fixed_len_named_const_main` | `int32[SlotCount]`、索引 `SlotCount-1` | 同上**逐字相同** |
| `r8_fixed_len_inline_arith_main` | 长度处内联算术 | 同上 |
| `r9_fixed_len_forward_const_main` | 前向 const | 同上 |
| `r9_fixed_len_untyped_const_main` | 无标注 const | 同上 |

取证件：
- 四正例 = `.rebuild/s1b_step3/r9/fixtures_r10.txt:3,5,9,11`（kd_r10 轮，02:15，判词逐字相同）；
- M-A = `.rebuild/s1b_step3/r9/disc_ma_prerix_r9z.stderr.txt:3`（kd_r9z 轮，02:00，同四元组）；
- 对照（归因用）= `.rebuild/s1b_step3/r9/fixtures_r9z.txt:3,5,9,11`：**kd_r9z 轮上四正例还停在更早的
  `canonical admission blocked missingFactBitmap=5`**，只有 M-A（零 const）走到了本墙 ⇒
  本墙是"桥修好后"四正例的下一堵，**不是 const/symbol 义务修复引入的**。
（**注意**：`fx_*.stderr.txt` 是**逐轮复用**的临时件，02:18 已被 r11 轮覆盖为
`timeout: failed to run command … kd_r11`；引用请只用 `disc_ma_*` 与 `fixtures_r*.txt` 这两类稳定件。）
⇒ 失败点是**共享构造**（`type X = {scalar; int32[N]}` + `var s: X` + `s.values[k]` 读/写）
决定的确定性槽位，与 const 拼写、索引算术、数组长度无关。M-A 的源已复核
（`src/tests/r9_ma_zero_const_probe.cheng:1-13`，与任务书逐字一致）。

## 6. 需要的一条运行期读数（申请 owner 批准；我未自行占用编译槽）

> 现场变化（本轮观测到）：**r11 轮正在跑**（`.rebuild/s1b_step3/r9/kd_r11.report.txt`，02:18），
> 且 `fx_*.stderr.txt` 已被该轮复用覆盖。下面的读数 A 可能已随 r11 自动产生。

**读数 A（零源码改动，先看）**：r11 驱动下跑 **M-A 单源** + 一个**正对照**（`ordinary_zero_exit_fixture`）。

| 观测 | 判读 |
|---|---|
| 正对照 rc=0 且 M-A 仍 `code=11 site=1 index=4 detail=0` | 机制正常、坏槽是本品**形状特有**的确定性缺陷 ⇒ 直接做读数 B |
| 正对照也死在同一 ingress（尤其死在小 index） | 该代驱动的槽身份机制整体回归 ⇒ 立 driver/世代回归项（与 01:35–01:45 的 AB `rc=0` 世代对照） |
| M-A rc=0 | 本墙随 r11 改动消失（需登记是被哪一处改动带走的，不能只记"绿了"） |

**读数 B（主请求；owner 已批准，补丁已交 = §7.1）**：把 ingress 富化 dump 的
`errorSiteKind == SiteOp` 门（`ownership_body_ir_production.cheng:1356`）放宽为
「Op 站点走现有分支，**Entry 站点另打一份槽表**」——复用**已经写好的** `:1373-1375` 逐槽投影代码，
并补上 `id` 与 `name`，另打一条 `slots=/ids_ok=` 计数。
槽名是产生者指纹：`#seq_add_off#/#seq_add_hdr#`（地址算术）、`#fae_*/#fael_*/#fidx*`（定长数组/序列元素地址）、
`#cond_field_*`（条件字段读）、`#ownership_guard_snapshot#/#cleanup_captured_*`（cleanup）、
`#canonical_return_snapshot#`（返回快照）、或**源变量名**（如 `s` ⇒ 局部声明路径）。
判读：槽名 + typeKind + `ids_ok` 直接点名产生者/点名"身份未补"，一步闭环。
**本轮只交补丁，未编译、未烤、未改判据**（见 §7.1 边界声明）。

**读数 C（若 B 仍不足）**：lldb 断 `bodyIrAccessFail`（`body_ir_access.cheng:347`），命中
`code==11 && siteKind==1 && siteIndex==4` 时读 `bodyIR.localSlots[4]`（name/typeKind/placeKind/
stackOffset）与 `bodyIR.localSlots.len`；同时读 `slotNames` 长度与 `bodyIR.slotNameIndex` 是否含该名。
这一步能同时回答"槽是谁"和"是否曾发生 name/id 失步"。

## 7. 修法判断 + 诊断补丁交付

### 7.0 修法判断：根因修法仍不交（产生者未点名）
- 已确信的是**类别 (a)**，但**产生者未点名**。精确修法 = "让那个漏写 `id`（或绕过守卫）的追加者
  按 canonical 形态写身份"。在点名之前，任何补丁只能是下列兜底之一，全部违反铁律：
  - 在 `:5897` 放行 `id != index`（或按名字/行号重建 id）⇒ 用近似键替换精确身份；
  - 事后遍历槽表补齐 `id` ⇒ 静默 fallback，掩盖真正的生产者缺口；
  - 在 ingress 前"修一下" body ⇒ 后处理补救。
- 因此本轮交的是**判词富化补丁**（读数 B，owner ①批准），**不是根因修法**。

### 7.1 诊断补丁（判词富化）：`patches/bodyir_ingress_ownership_entry_slot_dump.patch`

| 项 | 值 |
|---|---|
| 补丁 | `patches/bodyir_ingress_ownership_entry_slot_dump.patch`（+15/−0，**1 hunk**，只动 1 文件） |
| sha256 | `1803884aff293d6b35b90216d1d67dd274c8f9e5f2a9731607efe3397b0c9c6a` |
| 冻结副本 | `.rebuild/s1b_step3/r9/patchgen/bodyir_ingress_ownership_entry_slot_dump.patch`（同 sha256，逐字节相同） |
| 基线 | **当前工作树**；`git apply --check` **exit 0**（实测）；反向 `-R --check` exit 1（= 树未被应用，符合预期） |
| 落点 | `src/core/analysis/ownership_body_ir_production.cheng:1355` 之后，`@@ -1353,6 +1353,21 @@` |
| 工作树状态 | 已**精确回退**（`git status` 该文件为空，字节等同 HEAD）；补丁只以文件形态交付，未应用 |

**改前 / 改后 dump 字段对照**（同一判词行 `…:1377` 的 `{ingressSiteDump}` 部分）：

| 站点 | 改前（现状） | 改后（本补丁） |
|---|---|---|
| `site=Op(2)` | `op_kind=… op_target=… op_operands=… a0=… vd_*=… src_*=… slots=N sealed=S phase=P [ownership-diag] s0:tk=..:pk=..:mg=..:aux=..:off=..:tid=..` | **逐字节不变**（该分支一字未动） |
| `site=Entry(1)` | **空**（判词止于 `fn=0`，本墙即此形） | `slots=N ids_ok=K sealed=S` + 每槽 `s{i}:id=..:tk=..:pk=..:mg=..:aux=..:off=..:tid=..:name=..` |
| `site=Term(3)` / 其它 | 空 | **仍为空**（未扩大） |
| 成功路径（表 valid） | 无打印 | **无打印**（不可达，见下） |

**为什么它不可能影响成功路径（三条，均可按行号核）**：
1. 新增代码整块位于 `if !bodyaccess.BodyIrAccessTableIsValid(entryAccess):`（`:1350`）**之内**；
   该 if 的唯一出口是 `ownershipBodyIrFail(...)`（`:1376-1377`），而 `ownershipBodyIrFail` =
   `panic(strings.CloneStr(message))`（`:48-49`）⇒ **硬终止**。成功路径（表 valid）根本不进这个 if。
2. 新增分支的条件只有 `entryAccess.errorSiteKind == BodyIrAccessSiteEntry`；它在 Op 分支
   （`:1356-1358` 原条件）**之前**、且两者互斥（`SiteEntry=1` vs `SiteOp=2`，`body_ir_access.cheng:12-13`）
   ⇒ Op 站点 dump 逐字节不变，不存在双打或覆盖。
3. 补丁只做**读取**（`id`/`typeKind`/`placeKind`/`managedStorageKind`/`auxValue`/`stackOffset`/
   `typeArenaTypeId`/`name` + 一个局部计数），**不写任何 body 字段、不改任何谓词、不改 code 语义、
   不改任何放行条件**（diff 全文只新增 15 行，无删改行）。
4. 唯一新增状态是局部变量 `ingressIdentityOkCount`（函数内 `var`，失败路径内自增）——无跨调用副作用。

**`ids_ok` 的判读（直接回应 owner 的取证线索"守卫根本没跑过"）**：

| 观测 | 判读 |
|---|---|
| `ids_ok == slots` | 全表身份都写对了 ⇒ 坏的是**别的**子句（typeKind/placeKind/typeArenaProof），产生者另找 |
| `ids_ok == slots-1` 且坏槽 `id=0` | 单点身份未写 ⇒ 与 §4.2 的"裸追加/整表搬移"族一致，按 `name` 直接点名产生者 |
| `ids_ok` 明显小于 `slots` | "表先长出来、身份后没补"（整表重写/复制）⇒ 点名范围缩到搬移/复制路径 |

任何一支都直接给出下一个精确落点；补丁本身**不放行、不修复、不掩盖**任何东西。

## 8. 未测项（不得当 0 处理）

1. **未编译**（按纪律未占编译槽；现场的 r11 轮是 owner 侧在跑，非本轮触发）：
   本文所有结论均为只读静态 + 既有取证件复核；§6 的三张判读表**未实测**。
2. 未测 `bodyIR.localSlots.len` 的真值（判词只在 Op 站点打印 `slots=`）；仅由 `index=4` 推得 `>= 5`。
3. 未测失败槽的名字/typeKind/placeKind/`ids_ok`（§7.1 补丁就是为拿这三个读数；**补丁未编译、未烤、未跑**，
   该格仍为空）。
4. **§7.1 补丁自身未经编译验证**：+15 行 Cheng 代码只做了静态核对（同族既有写法 + 字段类型核对），
   未过 cold 链/自举链编译，也未过任何门禁。首次烤轮须先看它自己能不能编译过。
5. 未做 driver 与工作树的**逐字节**等价证明（仅 mtime 对账 + 8 条字符串抽检 + 代码存在性）。
   正对照（AB `rc=0`）覆盖的是 **01:35–01:45 世代**的驱动（早于 kd_r9z 的 01:51 烤制），
   **kd_r9z / kd_r10 / kd_r11 这一代没有正对照件** —— 这一格是空的，不得当成"已验证"。
6. 未定位到具体产生者（§4.2 的 16 点穷举与实际状态互斥，矛盾未消解）。
7. 未测 backend2 路径对本源的行为（本编译已判为 primary；backend2 未跑）。
8. 未测 r11 驱动下 M-A 与正对照的表现（该轮 02:18 在跑；正对照由 owner ②在合炉轮跑）。
9. 未测五夹具在"越过本墙"后是否还需要更多同族修复（本墙是链上第 N 堵，不是终点）。
10. 未测 `s.values[0]` 之外的变体（变量索引 `s.values[i]`、`for` 内索引、`bool[N]`/`int64[N]` 字段、
    嵌套 `s.arr[i].f = v`）是否同坐标失败。
11. 未测 `PrimaryBodyIrApplyScopeExitReleases`（`primary_object_plan.cheng:66516`，在 ApplyOwned **之后**）
    与 `uir_thunk_synthesis` / `low_uir` 等**后置**槽追加者是否在本 body 上也追加了槽
    （它们各自 `id = localSlots.len`，本轮未验证其在 M-A 上是否触发）。

## 9. owner 裁决记录（2026-09-12，已生效）

1. **① 读数 B：批准（已按裁决交付）**。约束与落实：只动失败路径 ✅（新增 15 行全在 `:1350` 的失败 if 内）；
   不改 `id == index` 判据 / `code=11` 语义 / 任何放行条件 ✅（diff 无删改行）；独立补丁 + `patchgen/` 冻结副本
   带 sha256 + `git apply --check` exit 0（基线=当前树）✅（§7.1）；"改前/改后 dump 字段对照" +
   "为什么不可能影响成功路径"（引 `:1350`、`:1376-1377`、`:48-49`、`SiteEntry=1 vs SiteOp=2`）✅；
   按裁决把 `id`、`typeKind`、**槽名**、**`slots=` vs `ids_ok=` 计数**一并打出 ✅。
2. **② 正对照：批准（owner 在下一合炉轮跑 `ordinary_zero_exit_fixture`）**；若本代也不放行 ⇒ 立即立
   "世代回归"项并停推。本代的空格在 §8 第 5 条，读数回填前不得当已验证。
3. **③ 归因裁定：接受** —— 本墙按"定长数组字段路径"**单独立项**，与 const 语义、symbol 义务两项解耦；
   (a)/(b)/(c) 判定采信：**生产者真缺口**，`id==index` 的 9 处独立确立构成 (b) 的排除证据。
4. **owner 追加取证线索（已并入读数 B）**：守卫文案 0 命中 ⇒ 坏槽很可能**根本没走 `LocalSlotNewSized`**，
   而是"别人的行"（整表搬移/复制，或 `setLen` 先长表后没补身份）。据此在 dump 里加
   `ids_ok`（`id==index` 的行数）与槽名，见 §7.1 判读表。
5. 纪律照旧：无 `git checkout/restore/stash`、无 `cp` 整份共享文件、无 `-3/--fuzz`、无探针留存
   （富化只在失败路径；成功路径零新增打印）。后续若动 `primary_object_plan.cheng` / `cleanup_cfg.cheng`
   等共享热点文件，落点与烤轮由 owner 指定，我只 stage 自己的 hunk。
6. 请 owner 注意现场件复用：`fx_*.stderr.txt` 会被下一轮直接覆盖（02:18 已发生）；
   稳定取证件只有 `disc_ma_prerix_r9z.stderr.txt` 与 `fixtures_r*.txt`。

---

## 10. r12 读数解析（`slots=33 ids_ok=31`，两个全零行）——点名到机制，并修正 ③ 的落点

取证件：`.rebuild/s1b_step3/r9/disc_ma_r12.stderr.txt:41-75`（完整 33 行 dump，非节选）；
四正例同型见 `.rebuild/s1b_step3/r9/fixtures_r12.txt`（`r8_named_const 34/32`、`r8_inline_arith 35/33`、
`r9_forward_const 34/32`、`r9_untyped_const 34/32`）。

### 10.1 读数事实（可复核）
- 33 行里 **2 行整行全零**：`s4`、`s10`（`id=0 tk=0 pk=0 mg=0 aux=0 off=0 tid=0 name=""`），其余 31 行 `id == index`。
- 全零行指纹 ⇒ **从未被赋值过**（不是"被写坏"）：
  - `tid=0` 而非 `-1` ⇒ **没走过 `BodyIRApplyLocalSlotDefaultProof`**（对比 `s0..s3`/`s5..` 全为 `tid=-1`，见 `core_types.cheng:8470-8481`）；
  - `off=0` ⇒ 没进 `PrimaryBodyIrReflowLocalStackOffsets`（sizeBytes=0 被跳过）；
  - 行内 `name` 为空。
- 位置规律（五件一致）：**每个 `s.values[k] = v` 店恰好一个空洞**，且都夹在
  `#nev{N}`（节点求值槽，`tk=1`）之后、`#fidx{line}#{ops}#esz` 之前 ⇒ 正是该店的
  **取值/索引操作数槽**（`primary_object_plan.cheng:35723` valueSlot / `:35781` fieldIdxSlot）。
- **id 不漂移**：`s5 id=5`、`s11 id=11` ⇒ 空洞行**消耗了一个 `slotNames` 名额** ⇒
  追加记账 `add(slotNames, share(name))`（`:5635`）**执行了**，并且 `id` 源是 `slotNames.len`（`:5634`）。

### 10.2 判定：不是源级产生者，是**托管元素落地丢失**（附 ③ 落点修正）
穷举复核（本轮把上一轮的两处扫描盲区补上：带下标的接收者 `x[i].localSlots`、`localSlots.len = …` 直写）：
- 13 个 `add(...localSlots, …)` 全部**先填字段再追加**（含 `BodyIRApplyLocalSlotDefaultProof` ⇒ `tid=-1`）；
- 9 个元素写全部**从既有行拷贝**（`4400/5632/5684/5873/44728`、backend2 同构 4 处）；
- 唯一 `setLen(localSlots, …)`（`:44732`）在 `:44641` 守卫下**只可能收缩**（增长必 panic）；
- `BodyIRInitNewInPlace`（`core_types.cheng:1513`，把 `localSlots.len/cap/buffer` 清零）唯二的活体调用
  `cleanupCfgBeginBodyPlanMutation`（`cleanup_cfg.cheng:3174-3188`）**其三个上层函数在树内无调用者**（死码）。
⇒ **没有任何源级产生者能写出"整行全零"**。

结合"记账已执行、元素字节未落地"，唯一自洽读法 = **`add(bodyIR.localSlots, ls)` 的元素落地丢失**
（长度推进了、元素没写进活缓冲）。这是本仓**已归档**的「全零行 / 幽灵零槽」族，指纹逐字同型：
- `cleanup_cfg.cheng:3181-3186`（wall69 注释）："…对同一批托管字段多减一次 rc——ops 候选缓冲在 stage
  开始前即被提前释放, 后续 NewStringCopy 分配复用清零即「initialized producer definition drift」**全零行**"；
- `docs/campaigns/2026-09-07-pure-cheng-rsi/probes/ghost_fix/FIX.md:1`、同战役 `findings.md:44/45/50`
  （move-steal 后源侧未逐字段 detach ⇒ "全零记录 store 落错址 → 幽灵零槽"）。

**修正 ③ 的落点（(a) 判定不变，位置声明收窄）**：(a) 仍成立（**生产者侧**缺陷，不是消费者过严）；
但缺陷**不在"定长数组字段 lowering"**，而在 **`LocalSlot` 数组追加时的托管元素落地**；
定长数组字段只是**触发器**（它让该 body 的追加序列踩中丢失）。§5/§9 里"按定长数组字段路径单独立项"
应改为"**按槽数组追加/托管元素落地单独立项**，定长数组字段是触发面"。

已排除项（本轮新增，均给了算式）：
- **简单倍增容量边界**：cap 4/8/16/32 的重分配点在追加 #5/#9/#17（行 4/8/16），而行 10 不是任何倍增边界
  ⇒ 不是"每次扩容必丢一条"。（cap 真值需读数 C 打出，见下。）
- **孤儿槽机制**（`primary_object_plan.cheng:15718-15723` #85 注释所述"先建槽、物化失败"的孤儿槽）：
  孤儿槽带 `name` 与 `tid=-1`，与本指纹（`name="" tid=0`）不符。
- **回滚把日志快照写回**（`:44709-44729`）：该路径要求该行**先被就地改动过**（`changed` 才 journaled，
  `:5630/5682`），而就地改动会顺带写 `sizeBytes/typeKind` ⇒ reflow 会给它非 0 `off`；观测 `off=0` ⇒ 该行
  在回滚前就没被碰过。（保留为次选：若读数 C 判定"追加时是好的、事后变零"，则回到本支。）

### 10.3 读数 C（决定性、健康编译零行为变化）
在两处各加一条**回读守卫**（guard，不是打印；只在已经坏掉时触发）：
1. `primary_object_plan.cheng:4447` `add(bodyIR.localSlots, ls)` 之后立刻回读：
   `localSlots.len == slotId+1` ∧ `localSlots[slotId].id == slotId` ∧ `.typeKind == typeKind` ∧
   `.name` 长度一致；否则 `panic(Fmt"primary slot element store lost slot=… len=… id=… tk=… cap=… name=…")`。
   - 判读 A：M-A 在**店操作数槽**处 abort ⇒ **元素落地丢失就发生在追加点**（机制确证 + 精确追加点，
     下一步即可定性是 Cheng 源级 `add` 语义还是 driver 机器码）。
   - 判读 B：不 abort 而 ingress 仍见空洞 ⇒ 行是**追加之后被清零**，转 2。
2. `:44709-44729`（日志恢复写回）写回后回读 `localSlots[slotIndex].id == slotIndex` ∧ `name` 非空，否则 panic。
   判读：若在此 abort ⇒ 与 §10.2 次选支吻合（快照/写回丢元素）。

交付形态照旧（先报 owner；`primary_object_plan.cheng` 是共享热点，须看 mtime/并发；冻结带 sha、不落树）。

**零代码替代（建议先做，省一轮）**：M-A 用**既有旋钮** `CHENG_PRIMARY_OBJECT_FAIL_TRACE=1` 重跑，
grep `phase=node_eval_hit|node_eval_miss … line=8|9`（发射点 `primary_object_plan.cheng:35648`、
`:35656`；店入口 `:35105`）：即可判定两处店操作数各自走的是**节点求值路径**还是**文本路径**
⇒ 直接给出空洞槽是"取值"还是"索引"，并顺带暴露是否有 `phase=node_eval_miss`（孤儿槽族）伴随。

### 10.4 现场状态（只读记录，未触碰）
`src/core/analysis/ownership_body_ir_production.cheng` 现为 **owner 已应用本补丁**状态
（mtime 02:39，`git diff` = 本补丁的 +15/−0 hunk，逐字节相同）—— 这是 r12 的取证载体；
本轮**未回退、未改动**该文件（按纪律：共享文件不做整文件 checkout）。
`src/core/backend/primary_object_plan.cheng` 仍为 HEAD 干净（mtime Sep 11 06:31）。

---

## 11. 读数 B 交付（owner 批准）+ 读数 A 结论并入

### 11.0 读数 A（owner 实测，已并入本判定）
`kd_r13` + `CHENG_PRIMARY_OBJECT_FAIL_TRACE=1`（取证件 `.rebuild/s1b_step3/r9/disc_ma_trace_r13.stderr.txt`）：
```
phase=node_eval_hit function=main line=8
phase=node_eval_hit function=main line=9
phase=assign_field_fast_entry fn=main line=10 reason_label=none
phase=node_eval_miss op=index_get function=main line=10 detail=s4_v-1
phase=node_eval_hit op=if_cond function=main line=11
phase=node_eval_hit op=return function=main line=12 / line=13
```
读法：两处 store（行 8/9，即 `s.values[0] = 7` / `s.values[3] = 9`）**都 `node_eval_hit`**（取值解析成功），
miss 出现在行 10 的 `index_get`，`detail=s4_v-1` 直接指向 **`s4` = 全零行之一**
⇒ **空洞在 store 期产生、在行 10 的读侧被消费**（与 §10.2「空洞 = 店的操作数槽、位置固定」一致，
并把"哪个操作数"钉到 store 期的追加点，而非读侧）。

### 11.1 补丁规格
| 项 | 值 |
|---|---|
| 补丁 | `patches/bodyir_slot_element_store_guard.patch`（+15/−0，**1 hunk**，只动 `src/core/backend/primary_object_plan.cheng`） |
| sha256 | `a3e7b3e733c0e5d5ec2105aa6f45eddedc652c74b163f60348b0e22959f9fd70` |
| 冻结副本 | `.rebuild/s1b_step3/r9/patchgen/bodyir_slot_element_store_guard.patch`（**两件字节相同**，`cmp` 实测） |
| 落点 | `@@ -4447,6 +4447,21 @@`：`add(bodyIR.localSlots, ls)`（`:4447`）与其后既有守卫（`:4448-4449`）之后、函数体末尾（下一条 `@borrows` 在 `:4451`） |
| 交付时 `git apply --check` | **exit 0**（基线 = 当时工作树，实测 03:13） |
| 反向 check（03:14 树） | `git apply --check -R` = **exit 0** ⇒ 现状树 = HEAD + 本补丁 |

**动共享热点文件前的状态报告（owner 要求 3）**：`src/core/backend/primary_object_plan.cheng`
**mtime Sep 11 06:31**（静止 ≈20h，远超 10min 纪律线）、`git status` **干净（=HEAD）** ⇒ 触点安全。
同目录邻线活动（只读观察）：`src/core/backend/codegen_contract.cheng` **02:39 被改**（另一 lane 在位）。
本次 hunk 只碰自己的插入点（1 hunk、+15 行、无删改行）。

### 11.2 成功路径逐字节不变（论证，可按行号核）
1. 插入点两侧：前一行是既有守卫调用 `coreir.BodyIRAppendUnboundLocalBindingValueDefinitionRow(bodyIR, slotId)`（`:4448-4449`），后一行是 `@borrows fn PrimaryBodyIrLocalSlotNew`（`:4451`）——即插在 `PrimaryBodyIrLocalSlotNewSized`（`:4405-4449`）函数体**末尾**，不改任何既有语句。
2. 四条谓词在健康路径**按构造成立**：`ls.id = slotId`（`:4412`）、`ls.name = name`（`:4413`）、`ls.typeKind = typeKind`（`:4414`）都在 `add` 之前落定，`add` 只增一行且写入的正是 `ls` ⇒ 四项恒真 ⇒ `if` 体永不执行。
3. 索引安全性：其上一步 `:4448` 的守卫（`core_types.cheng:1985-1993`）已要求 `slotId == localSlots.len-1`（否则 panic）⇒ `localSlots[slotId]` 恒在界内。
4. 纯读 + 局部量：只读 `localSlots.len/.cap`、元素 `id/typeKind/name` 与形参；唯一新状态是函数内 `var primarySlotElementStoreLostDetail`（返回即失效）；**无 `add`/`setLen`、无任何 body/irFunction/全局写入、无 `os.WriteLine`**；`Fmt`/`panic` 只在失败分支 ⇒ 成功路径零输出、零状态变化。
5. 代价：每槽 3 次 int 比较 + 1 次 name 长度比较（无分配、无 I/O）。
6. **已知扰动面（如实登记）**：读取 `len(localSlots[slotId].name)` 若被物化为 `str` 临时量，会带来一次引用计数读/还；不分配、不释放、不改槽表布局，无法掩盖"槽数组缓冲被提前释放/复用清零"这一候选机制。更保守的**标量-only 变体**（去掉 name 长度谓词、失败分支才读 name）已备，owner 要求即可另出（本轮不交付第二枚，避免一案两补丁）。

### 11.3 预登记判读（owner 要求 4）
| 观测 | 判读 | 下一步 |
|---|---|---|
| **在店操作数槽处 abort**：`primary slot element store lost slot=N … id=0 tk=0 …` | 元素落地丢失**就发生在追加点**（长度推进、元素字节未落活缓冲）⇒ §10.2 机制确证、坐标收窄到该次追加 | 定性分叉二选一：**Cheng 源级 `add` 语义** vs **driver 机器码**（自烤链 codegen）；判别=同源分别经 C 链驱动与自举驱动跑同一 guard，并看 `cap` 是否与扩容边界相关 |
| **不 abort，而 ingress 仍报 `slots=33 ids_ok=31`** | 行是**追加之后被清零**（追加时四项全等，事后被覆盖/复用清零） | 立刻在 `:44709-44729`（日志恢复写回）加第二条回读并重烤；该支与 `cleanup_cfg.cheng:3181-3186`（wall69「缓冲提前释放、后续分配复用清零 ⇒ 全零行」）及 RSI 幽灵零槽族吻合 |
| **guard 自身编译失败/行为漂移**（判词变、成功路径输出变） | 本补丁不合格 | 立即回退并另设计（不走"改判据"路线） |

### 11.4 交付后现场状态（只读记录；非本轮动作）
- 03:13（本席）：生成补丁 → 冻结副本（sha 同上）→ **精确回退**自己的工作树插入（edit 工具逐行还原，未用 `git checkout/restore/stash`）→ 实测该文件 `git status` 空、字节数回到 4,498,706（=HEAD）⇒ **本席未落树**。
- 03:14（观测）：该文件再现**与本补丁 `cmp` 逐字节相同**的 +15 行（size 4,499,832，mtime 03:13），
  且 `git apply --check -R` = exit 0 ⇒ 现状 = **HEAD + 本补丁**，系 owner lane 应用（供下一轮烤机）。
  本席**未回退、未触碰**该状态（共享热点文件纪律：不做整文件 checkout；那是 owner 的 WIP）。
- 因此：现在对"当前树"正向 `git apply --check` 会报 already-applied（预期）；反向 check=0 即"树 = 基线 + 本补丁"的证明。
  若需重新生成，请以 owner 指定基线（HEAD 或已回退树）为准。

---

## 12. 读数 B 结果（guard 未 abort）后的**重新推演**与第二条判别读数交付

### 12.0 新事实（owner 实测，`kd_r14`）
guard 补丁（sha `a3e7b3e7…`）在 **5 件 × 33–35 槽**上**一次都没触发**
（取证件 `disc_ma_r14.stderr.txt`、`fixtures_r14.txt`：M-A 末行仍 `code=11 site=1 index=4 detail=0 slots=33 ids_ok=31`）
⇒ **追加时四谓词全等**：`localSlots[k]` 在 `add` 之后确实等于 `ls`（`id==k`、`tk`、`name` 长度都对）。
⇒ 空洞行**不是"从未被写"**（否则 `:4450+` 的回读会在该次追加处命中），而是**写对之后被清零**。

### 12.1 三支与判别式（owner 要求 1：先写判别式再落点）
| 支 | 机制 | 独有指纹（可判别） | 判别读数 |
|---|---|---|---|
| **A** | **有代码把一整行 `LocalSlot` 写成默认值**（typed 写）。本路径唯一的 typed 默认值来源 = 日志恢复写回 `bodyIR.localSlots[slotIndex] = slotCopy`（`:44756`），其载荷取自 `journal.slotMutationOldValues[…]`（`:4130`）。载荷为默认 ⇒ 该 **`LocalSlot[]` 元素本身丢失**（日志数组的 `add` 丢元素） | 空洞**恰好一整行、字段对齐**（`id/tk/pk/mg/aux/off/tid/name` 全零、邻行完好）——与观测**逐字相符** | **J1**（`:4130` 后回读快照元素）与 **J2**（`:44756` 后回读写回元素） |
| **B** | `localSlots` 缓冲**被提前释放后复用清零**（wall69 / 幽灵零槽族）；无任何代码写入者 | 清零是**字节区间**行为：可能**跨界/参差**（半行、跨两行），邻行 `name` 亦可能受损；`len/cap` 头可能完好或被改 | **T1/T2/T3 行程探针**（阶段二分：build 内 vs build 后） |
| **C** | **len 先长出来、元素留待后续填**（第三条路：`setLen` 预长 / 整表复制只搬部分行） | 该行**从未被写** ⇒ 追加后立刻就是全零；且下一次 `add` 的 `slotId == len-1` 守卫仍成立（不会被守卫拦住） | T1（post_build）会命中；且需 §12.2 的"预长调用点表"有实际条目 |

**推演结论**：C 在树内**已被穷举排除**（§12.2 表）；A 与观测指纹**逐字吻合**（整行、字段对齐、邻行完好）；
B 无法由静态排除，且 owner 的判断（wall69/幽灵零槽）指向它。⇒ 本轮交**同时覆盖 A 与 B 的判别读数**（不含任何修法）。

### 12.2 "会预长 `localSlots` 而不填元素"的既有调用点表（owner 要求 2）
| 候选形态 | 树内事实（本轮重新穷举：含带下标接收者 `x[i].localSlots`、跨行、`.len =` 直写） | 结论 |
|---|---|---|
| `setLen(bodyIR.localSlots, n)` 增长 | 全树仅一处：回滚 `:44762`；其前置守卫 `bodyIR.localSlots.len < checkpoint.slotCount → panic`（`:44656`）⇒ **只可能收缩** | **排除** |
| `setLen` 预长为 `len+1` 再等后续填 | 不存在（同上，`localSlots` 上无第二处 setLen） | **排除** |
| 整表复制只搬部分行 | 整数组赋值仅两处：`PrimaryBodyIRMoveInto`（`:62295 out.localSlots = bodyIR.localSlots`）与 `body_ir_noalias.cheng:312`（同形）——**整数组搬移，不逐行重建** | **排除** |
| `BodyIRInitNewInPlace` 把 `len/cap/buffer` 清零 | `core_types.cheng:1513-1524`；唯一活体调用者 `cleanupCfgBeginBodyPlanMutation`（`cleanup_cfg.cheng:3174-3188`），其三个上层函数**树内无调用者**（死码） | **排除** |
| `LocalSlot[]` 形参别名（被调方预长） | 全树 `LocalSlot[]` 仅 2 处：`BodyIR.localSlots` 字段、日志 `slotMutationOldValues` 字段；**无该类型形参** | **排除** |
| 13 个 `add(...localSlots, …)` 追加 | 全部先填字段再追加；且 `:4450` 既有守卫 + `:4450+` 回读守卫在 5 件×33–35 槽全通过 | **排除** |
⇒ **第三条路（C）在树内不存在**；若 T1（post_build）仍命中，则说明存在树外/驱动链路径，届时按 C 支再查。

### 12.3 第二条判别读数补丁（本轮交付；**不改落点、不覆盖 guard 补丁**）
| 项 | 值 |
|---|---|
| 补丁 | `patches/bodyir_slot_identity_discriminators.patch`（**+29 行 / 6 hunk**，只动 `src/core/backend/primary_object_plan.cheng`）<br>⚠️ **更正（2026-09-12 03:5x）**：本表初版写"+44 行"，那是当时 `git diff --stat` 的**合计**读数（含 guard 的 15 行）；本补丁自身增行为 **+29**（`grep '^+' | grep -v '^+++'` = 29，`@@` 计 6 hunk） |
| sha256 | `5e8c0a55361cffa24ce1dd289bb4b18c34720e3bf8cf7639add4548ad9cb84e3` |
| 冻结副本 | `.rebuild/s1b_step3/r9/patchgen/bodyir_slot_identity_discriminators.patch`（**`cmp` 逐字节相同**） |
| 基线 | **HEAD + guard 补丁**（= owner 当前树；guard 补丁**未被覆盖**：本补丁内含 guard 字样 0 处） |
| `git apply --check` | **exit 0**（对 HEAD+guard 基线实测） |
| 六处落点（**权威行号**，取自已落树的工作树） | **J1** `:4131-4140`（日志快照 `add` 后回读）／**J2** `:44755-44759`（日志恢复写回后回读）／**T1** `:66214`（post_build）／**T2** `:66332`（post_hotpath，紧跟 `bodyIR = hotPathReport.bodyIR` `:66331`）／**T3** `:66424`（pre_applyowned，`ApplyOwned` `:66426` 之前）／helper `primarySlotIdentityTripwire` `:66129-66139` |
| 判词 | J1 `primary journal snapshot element lost slot=… snap_len=… snap_cap=… id=… tk=…`；J2 `primary journal restore element store lost slot=… restored_id=… tk=… inplace_id=… len=… cap=…`；T `primary slot identity lost stage=… index=… id=… tk=… name=… len=… cap=…`（**均带 `len`+`cap`**，按 owner 口径提醒） |

**无扰动/零行为变化论证**：六处全部**只读**——无 `add`/`setLen`/元素写、无 body/全局写、无 `os.WriteLine`；
`panic`/`Fmt` 只在已经坏掉时执行。J1/J2 仅在事务活跃且确有日志/回滚时各跑一次；T1/T2/T3 每函数各一次 O(槽数) 只读扫描（无分配）。
健康编译下：J1 恒真（快照即刚复制的 `oldSlot`）、J2 恒真（`slotCopy` 刚写入同址）、T 系列恒真（全行 `id==index`）⇒ **零输出、零状态变化**。

### 12.4 预登记判读（本轮 6 个回读的决策树）
| 观测 | 判读 | 下一步 |
|---|---|---|
| **J1 命中** | A 支确证：**日志快照数组（模块级全局结构体的 `LocalSlot[]` 字段）的 `add` 丢元素** ⇒ 与 `:4450+` 未触发互补（丢的是另一个数组） | 直接定性：该 `add` 在"全局结构体字段"上的元素落地——查 Cheng 源级 `add` 语义 vs driver 机器码；这是**能一次修全**的形态（同族：所有"全局结构体字段上的结构数组追加"） |
| **J2 命中**（J1 未命中） | A 支变体：快照是好的，**元素写回 `localSlots[i] = slotCopy` 丢落地** | 同上，落点换成元素写路径 |
| **T1（post_build）命中、J1/J2 均未命中** | 清零发生在 build 内、且非日志路径 ⇒ 转 C 支核查（§12.2 表已排除树内路径 ⇒ 指向树外/驱动链）或 build 内其他 typed 写 | 我再列 build 内全部 typed 写点表 |
| **T1 干净、T2（post_hotpath）命中** | **B 支**：清零发生在 hotpath/noalias/egraph 段（`:62295 PrimaryBodyIRMoveInto`、`body_ir_noalias.cheng:312/460-466`、`:66314 bodyIR = hotPathReport.bodyIR`）⇒ 搬移/共享缓冲/悬垂复用 | 在该段逐个搬移点加同款回读，二分到具体搬移 |
| **T2 干净、T3（pre_applyowned）命中** | 清零发生在 hotpath 之后、ApplyOwned 之前（ManualConsume/FFI 投影、ExactDefDerive、cleanup projection bind） | 同法二分 |
| **T1/T2/T3 全干净、ingress 仍见空洞** | 清零发生在 **ApplyOwned 内部且在 ingress 之前** | 下一读数落 ApplyOwned 入口（`ownership_body_ir_production.cheng:1349` 之前） |

### 12.5 交付后现场状态
- 本轮结束态：`primary_object_plan.cheng` = **HEAD + guard 补丁**（我的判别读数已精确回退，`git diff --stat` = 15 insertions，
  与 guard 补丁 `-R --check` = 0 一致）；判别读数补丁**未落树**，等 owner 应用。
- 临时件（patchgen/.tmp_pg）已删除；`patchgen/` 现存三枚本线补丁：`bodyir_ingress_ownership_entry_slot_dump.patch`、
  `bodyir_slot_element_store_guard.patch`、`bodyir_slot_identity_discriminators.patch`。

---

## 13. r15 读数（T1 命中、J1/J2 零命中）后的**穷举写点表 + 排序 + 下一条读数**（本轮只交诊断，不交补丁）

### 13.0 新事实与两个直接推论
- `kd_r15` 判词（逐字，唯一一条）：`primary slot identity lost stage=post_build index=4 id=0 tk=0 name= len=33 cap=64`
  （取证件 `.rebuild/s1b_step3/r9/disc_ma_r15.stderr.txt`）；J1（快照 append 回读）与 J2（恢复写回回读）**零命中**。
- **推论 1（窗口）**：T1 插在 `PrimaryBuildBodyIrFromTypedStatements(...)`（`:66203`）返回之后、ORC/hotpath **之前**
  （`primarySlotIdentityTripwire(bodyIR, "post_build")` `:66214`；`PrimaryBodyIrHotPathApply` 在 `:66281`）
  ⇒ **清零发生在 build 函数体（`:52039-58088`）之内**。T2/T3 从未跑到（T1 先 abort）。
- **推论 2（时序排除"另一份 body"支）**：`MoveInto` 系（`:62296-62303` 定义；调用点 `:65991/:65996/:66001`，经 hotpath `:66281`）、
  noalias（`:66002` → `body_ir_noalias.cheng:312 / :460-466`）、`bodyIR = hotPathReport.bodyIR`（`:66331`）、
  `PrimaryBodyIRTakeFromTable`（`:62416`，唯一活调用点 `:75615`）**全部在 T1 之后**
  ⇒ 它们**不可能**是本墙的直接原因（不是"可能性低"，是被指令顺序排除）。
  ⚠️ 这条**修正了**我在 §10/§12 把 `PrimaryBodyIRMoveInto` 列为头号嫌疑的排序（当时只凭"它整表赋值"）。

### 13.1 穷举表：`post_build`（`:66214`）之前会写 `bodyIR.localSlots` 的**每一个点**
枚举口径（跨行 + 带下标接收者 + `.len=` 直写 + 别名 + 整 body 搬移）覆盖全 `src/core`。

**A. 窗口内（build 函数体内，`:52039-58088`）**

| # | 点（当前树行号） | 写法 | 能否写出一整行零 | guard（`:4458` 后四谓词）是否覆盖 | 该点的判别读数 |
|---|---|---|---|---|---|
| W1 | `:4411` `PrimaryBodyIrRetypeLocalScalarSlotForType` | 元素写（自读 `localSlots[slotId]` → 改 tk/size/align → 写回） | **只能传播**（源为默认才会写零；自身不产生零） | **否**（guard 只管追加） | 写后回读 `localSlots[slotId].id == slotId ∧ name 非空` |
| W2 | `:5658` `PrimaryBodyIrFindOrCreateSlot` 更新分支 | 元素写（同上，改 size/align/tk） | 只能传播 | **否** | 同上 |
| W3 | `:5710` `PrimaryBodyIrFindOrCreateSlotSized` 更新分支 | 元素写（同上） | 只能传播 | **否** | 同上 |
| W4 | `:5899` `PrimaryBodyIrRetireIncompatibleAggregateRebind` | 元素写（自读 → 改 name → 写回） | 只能传播 | **否** | 同上 |
| W5 | `:44754` 回滚日志恢复 | 元素写（源=日志快照 `journal.slotMutationOldValues[j]`，**可独立为默认值**） | **能（源头可零；J2 不能发现"0 写 0"）** | **否** | **恢复前读 `restored.id` 是否等于 `slotMutationIndexes[j]`**（快照本应镜像该行 ⇒ id 必等于行号）；这是本轮排序第 1 的读数 |
| W6 | `:4458` `PrimaryBodyIrLocalSlotNewSized` 追加 | `add(localSlots, ls)` | 否（构造性填满，含 `BodyIRApplyLocalSlotProof` ⇒ `tid=-1`） | **是**（5 件 ×33–35 槽全通过 ⇒ **追加路径与"扩容路径"都已证明干净**） | 已有（无需再加） |
| W7 | `:44763` 回滚 `setLen(localSlots, checkpoint.slotCount)` | 长度改（**不写元素**）；前置 `:44656` 守卫 `len < checkpoint.slotCount → panic` ⇒ 只收缩 | 否（不写元素；仅当实现"裁掉即清零"才清字节，且若再追加必走 W6 ⇒ 被 guard 覆盖） | 否（但下游被 W6 覆盖） | setLen 前记 `len`、后读被裁区间首元素 `id`（可选） |
| W8 | `:4130` 日志快照数组 `add(slotMutationOldValues, oldSlot)` | 另一数组（全局结构体字段）的追加 | 该数组元素为默认 ⇒ 经 **W5** 落成整行零 | 否 | **J1 已在**（capture 时刻干净）⇒ 若快照在 capture 之后被清零，只有 W5 前的读数能抓到 |
| W9 | `:58088 return bodyIR` → `:66203 var bodyIR = …` | **整 body 按值返回（sret 拷贝）**，唯一的窗口内整 body 复制事件 | 若拷贝不完整，表现为**表头/整表**异常而非两行空洞（可判） | 否 | 在 T1 前读 `len/cap` 与 `ids_ok`（T1 本身即此读数；已命中 ⇒ 该拷贝引入的只能是"拷贝后才被清零"之外的形态） |
| W10 | 全窗口大量 `fn f(bodyIR: coreir.BodyIR)` **按值传参** | 引用计数共享（跨切面） | 若 rc/位拷贝记账错 ⇒ 提前释放 ⇒ 缓冲被复用清零（**能写整行零**） | 否 | 需"逐语句行程探针"把清零时刻钉到某条语句，再对该语句内的传参面审计（见 13.3 建议 3） |

**B. 窗口外（T1 之后 ⇒ 由推论 2 排除为直接原因；列出以证"穷举"）**

| # | 点 | 写法 | 说明 |
|---|---|---|---|
| X1 | `:62303` `PrimaryBodyIRMoveInto`：`out.localSlots = bodyIR.localSlots` | 整表 move/share | 调用点 `:65991/:65996/:66001`（hotpath `:66281`）⇒ **T1 之后**；仅对"hotpath 之后被清零"负责（本墙 T1 已命中 ⇒ 无关） |
| X2 | `body_ir_noalias.cheng:312`（`BodyIrNoAliasForwardLocalsInBlocks` 的 `out.localSlots = bodyIR.localSlots`） | 整表赋值 | 唯一活调用链：`noalias.BodyIrNoAliasFinalize`（`primary_object_plan.cheng:66002`，hotpath 内）⇒ 之后 |
| X3 | `body_ir_noalias.cheng:460-466`（`report.bodyIR = bodyIR; bodyIR = BodyIRNew()`） | 整 body move + 源重置 | 同上，之后 |
| X4 | `:66331` `bodyIR = hotPathReport.bodyIR` | 整 body 赋值 | T2 之后（T2 从未跑到） |
| X5 | `:70342 primaryLowerPoolContractBody` 的 `add` | 追加（新合成体） | 池路径；本编译 `BACKEND_JOBS=1` ⇒ 未启用 |
| X6 | `core_types.cheng:1513-1524` `BodyIRInitNewInPlace`（清零 `localSlots.len/cap/buffer`） | 表头清零 | 唯一活体调用者 `cleanupCfgBeginBodyPlanMutation`（`cleanup_cfg.cheng:3174-3188`）的 3 个上层函数**树内无调用者**（死码） |
| X7 | 其它模块的 `localSlots` 追加（`cleanup_cfg` 5 处、`ownership_body_ir_production` 2 处、`low_uir`/`uir_thunk`/backend2/编解码） | 追加/解码 | 全部在 ApplyOwned 内或其之后（且本编译为 primary、池关） |

**C. 别名面（"经别名写"）**：全树 `LocalSlot[]` 仅 2 处（`BodyIR.localSlots` 字段、日志 `slotMutationOldValues` 字段），
**不存在 `LocalSlot[]` 形参**；`localSlots` 的整表赋值仅 X1/X2 两处（都是 `out.localSlots = <body>.localSlots`，`out` 是新体）。
⇒ "经别名直接写元素"在树内不存在；剩下的别名面只有 **W10 的整 body 按值传参（rc 共享）**。

### 13.2 `cap=64` 的解释（owner 点名要的）
- `len=33 cap=64` ⇒ 最后一次扩容是 **32→64**，与"从 cap 4 起倍增、每次 len 触顶才扩"的序列一致：
  **扩容追加发生在索引 0/4/8/16/32**（第 33 次追加即 `len 32→33` 触发 32→64）。
- 空洞 #1 在 **索引 4 —— 恰好是第一次扩容（4→8）的那次追加**；空洞 #2 在 **索引 10 —— 不在任何扩容点上**（8、16 才是）。
- ⇒ 纯"扩容时旧缓冲拷贝不全"**最多解释一个空洞**；但更强的是：**现有的 guard 恰恰在每个扩容追加之后都读过元素**
  （它在 `:4458` 的 `add` 之后立刻回读 `id/tk/name`），索引 4 那次也读到了正确的行 ⇒ **扩容路径已被 guard 直接证明干净**。
  因此两个空洞都是"**写对之后被整行零覆盖**"，与你的判断一致；`cap=64` 只作为"不是扩容边界问题"的旁证，不再作为候选机制。
- 另外 `cap=64 > len=33` 说明该数组有 31 个空位：若发生"缓冲被复用清零"，**表头（len/cap）仍可能是活数组的**
  ⇒ 这条读数不能区分 A/B，但它排除了"数组被重新分配成 0 容量/被重置"的粗形态（那种 `cap` 会变）。

### 13.3 排序与建议的下一条读数（只建议，不落点）
**排序依据 = ①是否在窗口内 ②能否凭空产出整行零（而不只是传播） ③是否已被现有回读排除。**

| 名次 | 候选 | 依据 | 判别读数（建议） |
|---|---|---|---|
| **1** | **W5：回滚写回的"快照源"本身是零**（`restored` 零 ⇒ 写出一整行零；J2 因"0==0"必然通过，J1 只在 capture 时刻读过 ⇒ **现有两读数都盖不住它**） | 唯一"能凭空产出整行零"的窗口内 typed 写；且 `journal.slotMutationOldValues` 是**模块级全局结构体的数组**（跨 body 长寿命、被 Reset 释放/复用） | **恢复前**加一条：`restored.id != slotMutationIndexes[j]` 或 `restored.typeKind == 0 ∧ len(restored.name)==0` ⇒ panic（诊断读数：`stage=journal_restore_pre j=… src_index=… src_id=… src_tk=…`）。这条把"快照零"与"写回丢落地"彻底分开 |
| **2** | **W1/W2/W3/W4：元素写丢落地或写出零**（写后回读） | 四个都只自读自写（正常只会传播），但**若元素写本身的 codegen 丢/清零**就会凭空产出零；guard 不覆盖它们 | 在 4 处写后各加一条 `localSlots[i].id == i` 回读（判词带 `site=retype/forupdate/sizedupdate/retire i=…`） |
| **3** | **W10：按值传参（rc 共享）导致缓冲被提前释放、复用清零** | 唯一能解释"无任何 typed 写却整行清零"的机制；与 `cleanup_cfg.cheng:3181-3186`（wall69）与 RSI 幽灵零槽族同族 | **逐语句行程探针**：在 `PrimaryBuildBodyIrFromTypedStatements` 的语句循环（`:52227 for stmtIndex in 0..<stmtEnd:`）末尾调用现成的 `primarySlotIdentityTripwire(bodyIR, Fmt"stmt_{stmtIndex}")` ⇒ 把清零钉到某一条语句（M-A 只有 6 条） |
| 4 | W7（`setLen` 收缩清零被裁元素） | 只能清到 len 之外；再追加必走 W6（已被 guard 证明干净） | 低优先；若 1–3 都不命中再加 |
| — | X1–X7（MoveInto/noalias/`:66331`/池/InitNewInPlace/其它模块） | **被 T1 的时序排除**（T1 在它们之前就命中） | 无需读数 |

**建议执行顺序**：先加 **名次 1（W5 前置读数）** ＋ **名次 2（4 处写后回读）**（两者都极小、只读、健康编译零行为变化），
一次烤机即可判定"快照零 / 写丢落地 / 都不命中"；若都不命中 ⇒ 直接上 **名次 3 的逐语句行程探针**（复用已交付的 tripwire，只加一个调用点）。

### 13.4 本轮交付形态与现场状态（只读核对）
- **只交本表 + 排序 + 建议读数**（owner 要求 3）；**未生成补丁、未动 `primary_object_plan.cheng`**（本轮零写入）。
- 现场状态（03:42 只读核对，与 owner"两枚都保留在树"一致）：工作树 = **HEAD + 44 行 = guard（15）+ 判别读数（29）**；
  marker 行号：guard `:4464-4475`、J1 `:4131-4140`、J2 `:44755-44759`、tripwire helper `:66133`、T1 `:66214`、T2 `:66332`、T3 `:66424`；
  `git diff --numstat` = `44 0`、`git status` = ` M`（仅工作树）、`git diff --cached` 空（未 stage）；
  文件 mtime 03:33 / 4,502,425 B（= HEAD 78,694 行 → 78,738 行）。
- 既有三枚补丁件 sha256 未变（`bodyir_ingress_ownership_entry_slot_dump.patch` `1803884a…`、
  `bodyir_slot_element_store_guard.patch` `a3e7b3e7…`、`bodyir_slot_identity_discriminators.patch` `5e8c0a55…`），**未覆盖**。

---

## 14. 读数 1+2（W5 前置读数 + W1–W4 写后回读）＋回退探针：交付（owner 已批准）

### 14.1 补丁规格
| 项 | 值 |
|---|---|
| 补丁 | `patches/bodyir_slot_element_write_readbacks.patch`（**+31 行 / 7 hunk / 0 删行**，只动 `src/core/backend/primary_object_plan.cheng`） |
| sha256 | `c7c6006d493d0cbfcf64568ba8a03689535dcd2ece2c950eda5f9fb9a7ab78d8` |
| 冻结副本 | `.rebuild/s1b_step3/r9/patchgen/bodyir_slot_element_write_readbacks.patch`（`cmp` 逐字节相同） |
| 基线 | **当前树** = HEAD + guard(15) + 判别读数(29) + owner 新 apply 的 `builtin_type_constructor_arity` / `e1_p0_release_probe`（后两件在别的文件） |
| `git apply --check` | **exit 0**（对当前树实测） |
| 不覆盖既有件 | 本补丁内 guard/discriminator 的判词体出现 **0** 次（grep 实测） |
| 落点（**基线权威行号**，用 `awk NR` 复核） | W1 `:4411` 后｜W2 `:5658` 后｜W3 `:5710` 后｜W4 `:5899` 后｜W5 恢复源检查插在 `:44740` 前（`slotCopy.id = restored.id` 之前）｜语句探针插在 `:52227 for stmtIndex in 0..<stmtEnd:` 之后｜helper `primarySlotElementWriteBackCheck` 插在 `primarySlotIdentityTripwire` 之前（基线 `:66129`） |
| 判词 | W5 `primary journal restore snapshot zero j=… slot=… src_id=… src_tk=… snap_len=… len=… cap=…`；W1–W4 `primary slot element write lost site=<site名> site_line=<行号> index=… id=… tk=… name=… len=… cap=…`（附 index 越界变体）；回退 `primary slot identity lost stage=stmt_begin_k …` |

**时序纪律已写进补丁注释**（owner 要求 3，helper 注释块）：本读数覆盖 **T1（基线 `:66214`）之前**的全部 typed 写点 W1–W5；
窗口外各点（`PrimaryBodyIRMoveInto` `:62303` 与 `body_ir_noalias.cheng:312/:460-466`、`bodyIR = hotPathReport.bodyIR` `:66331`、池化 `:70342`）
**已被 T1 时序排除**（它们全在 T1 之后执行），注释明写"勿再重走该排查路径"。

### 14.2 "回退探针同补丁还是另出"——裁定：**同补丁**（省一轮）
理由：① 它复用**已在树**的 `primarySlotIdentityTripwire`，只需 1 个调用点；② 三态判读在一次烤机内即可全部落定
（W5/W1–W4 的读数按发生顺序先于语句探针触发）；③ 探针每语句一次 O(槽数) 只读扫描，健康编译零输出零行为变化。
**放置取舍**：owner 原建议"语句循环末端"，我放在**循环顶部**（`:52227` 之后）——因为顶部每轮必执行、**不受 `continue` 影响**、
落点唯一确定；信息量等价：**首个命中 `stage=stmt_begin_k` ⇒ 清零发生在处理语句 k−1（上一条）期间**（M-A 仅 6 条语句）。
此取舍已写进补丁注释。

### 14.3 预登记三态判读（写死，不许事后解释；owner 要求 4）
| 观测（按触发顺序） | 判读 | 下一步 |
|---|---|---|
| `primary journal restore snapshot zero j=… slot=… src_id=…` | **W5 支**：快照本身已零/身份漂移 ⇒ 回滚把整行零写进槽表。再二分：`src_id != slotMutationIndexes[j]` ⇒ **快照身份漂移**（日志数组元素被覆盖/索引错位）；`src_tk==0 ∧ name 空` 而 id 相符 ⇒ **快照被整行清零**（缓冲复用/生命周期族） | 修法面锁定到日志快照数组（**模块级全局结构体的 `LocalSlot[]` 字段**）的元素落地与生命周期；并要求"全局结构体字段上的结构数组追加"全族同查 |
| `primary slot element write lost site=<名> site_line=…` | **W1–W4 支**：元素写丢落地/写出零，**按 site 名点名**（`retype_scalar_slot` / `findorcreate_update` / `findorcreate_sized_update` / `retire_rebind_rename`） | 定性 Cheng 源级元素写语义 vs driver 机器码（同源分别经 C 链与自举链跑同一读数） |
| 前两者不命中，而 `stage=stmt_begin_k` 命中 | **回退支**：清零在处理语句 k−1 期间发生、且非上述 typed 写点 ⇒ 审计该语句内的 **W10（整 body 按值传参 / rc 共享）** 与其它非 typed 面 | 该语句内逐个传参点/共享点二分 |
| 四条全不命中，而 T1（`post_build`）命中 | 清零发生在**语句循环之外、build 之内**（seed params / 循环前后收尾 / build 尾部 `:58088 return bodyIR` 的 sret 拷贝） | 在该区间按同样方式插探针二分 |

### 14.4 `cap=64` 结论（owner 已接受，落档）
扩容追加点 = 索引 0/4/8/16/32（cap 4 起倍增）；空洞 #1 落在索引 4（第一次扩容那次追加）但**被 guard 在那一刻证明是好的**
⇒ **扩容路径干净**；空洞 #2 在索引 10（非扩容点）⇒ 两洞均为"写对之后被整行零覆盖"。`cap` 仅作旁证（并排除"数组被重置/整体重建"）。

### 14.5 动共享热点文件前的状态报告（owner 要求 6/8）
- 进手前（03:47 实测）：`primary_object_plan.cheng` **mtime 03:33**（静止 14 min > 10 min 纪律线）、
  `git diff --numstat` = `44 0`（= 既有两枚，无外来改动）⇒ 允许动。
- 邻线情报（只读）：`src/core/tooling/compiler_csg.cheng` **mtime 03:47（正在被别的 lane 改）**、
  `src/core/backend/codegen_contract.cheng` 02:39 —— 两者都不是本次触点，已记录。
- 本轮结束后现场：`primary_object_plan.cheng` **mtime 03:49**、内容 = **基线（44 行）**（我的 7 处插入已精确回退，
  `git diff --numstat` 回到 `44 0`、marker grep = 0）；补丁**未落树**；临时件 `.tmp_pg2` 已删除。

---

## 15. r18 读数（`stmt_begin_4`，`len=28 cap=32`）解析 —— 归因纠偏 + 下一条读数方案

### 15.0 读数（owner 实测，`kd_r18`）
`primary slot identity lost stage=stmt_begin_4 index=4 id=0 tk=0 name= len=28 cap=32`
（取证件 `.rebuild/s1b_step3/r9/disc_ma_r18.stderr.txt`）；W5 / W1–W4 读数**零命中**。

### 15.1 槽→语句映射（用 r12 全量 dump + 本次 `len=28` 双重锚定）
| 语句（0 基，`:52227` 循环） | 源行 | 该语句创建的槽 | 累计 len |
|---|---|---|---|
| 0 `var s: Slots` | 7 | s0 `s`、s1 `s#zero`、s2 `s#size` | 3 |
| 1 `s.values[0] = 7` | 8 | s3 `#nev5`、**s4 空洞**、s5 `#fidx8#5#esz`、s6 `#fidx8#6#addr`、s7/s8 `#seq_add_*#8#*` | 9 |
| 2 `s.values[3] = 9` | 9 | s9 `#nev10`、**s10 空洞**、s11 `#fidx9#12#esz`、s12 `#fidx9#13#addr`、s13/s14 `#seq_add_*#9#*` | 15 |
| 3 `s.used = s.values[0] + s.values[3]` | 10 | s15–s18 `#seq_add_*#10#*`、s19/s20 `s.values#cond_field_*#19`、s21 `s.values[0]`、s22/s23 `#seq_add_*#10#*`、s24/s25 `s.values#cond_field_*#25`、s26 `s.values[3]`、s27 `s.values[0]`（13 个） | **28** ✓ 与 `stmt_begin_4` 的 `len=28` 逐字吻合 |
| 4 `if s.used != 16:` / 5 `return 0` | 11/13 | s28–s32 `#nev23..#nev27`（5 个） | 33（最终 `slots=33`） |

### 15.2 归因纠偏（重要）：语句 3 是**破坏者**，不是空洞的制造者
- 两个空洞**都在语句 1/2 的槽块内**（s4、s10），而语句 3 创建的 s15–s27 **全部 `id == index`**（r12 dump 逐行可核）。
- `stmt_begin_3` 时 len=15：探针**扫描全表**、未命中 ⇒ **行 0..14 全部 `id == index`**（含 s4 与 s10）⇒ 两者在语句 3 开始前**都是好的**。
- `stmt_begin_4` 时 len=28、首个坏行 = 4 ⇒ **s4 是在语句 3 处理期间被清零的**（它早在语句 1 就被正确创建、且被 guard 在那一刻证明过）。
⇒ 结论：**语句 3 把两条既存行写成了整行零**（corruption），不是"语句 3 造了自己的空洞"。
**s10 的时点仍未定**：`stmt_begin_3` 时它还是好的；此后在语句 3/4/5 之一被清零。现有探针只报**首个**坏行，报不出这一点（→ 读数 R4b）。

### 15.3 为什么是语句 3：唯一"整批触碰既存行"的事件 = 扩容（算式）
- 语句 3 把表从 15 行加到 28 行 ⇒ 其中**索引 16 的那次追加**必然触顶扩容；
- 观测 `stmt_begin_4 cap=32` ⇒ 该次扩容正是 **16→32**（`len=16` 触顶）；语句 4/5 再加到 33 时触发 **32→64** ⇒ 最终 `cap=64` ✓（与 r12 的 `len=33 cap=64` 一致）。
- 扩容追加点（cap 4 起倍增）= 索引 **4 / 8 / 16 / 32**：索引 4 的扩容发生在语句 1（其后 guard 读该行是好的 ✓）、索引 8 在语句 2、**索引 16 在语句 3**、索引 32 在语句 4/5。
- ⇒ 语句 3 期间**唯一**会重排/拷贝既存行的子事件就是这次 **16→32 扩容**；而现有 guard 只回读**刚追加的那一行**，对"老行在扩容拷贝中被写坏"**完全不可见** ⇒ 与"两条老行（4、10）变零"完全相容。
- 这也解释了此前被排除的"扩容路径干净"结论有**覆盖盲区**：guard 证明的是"**新追加行**在扩容后是对的"，**不等于**"扩容拷贝对老行无损"。§14.4 的结论需据此**收窄**（不是推翻：空洞 #1 那行本身在那一刻确实是好的）。

### 15.4 语句 3 路径内的写点与按值面（owner 任务 1）
**写点**：语句 3 路径**不引入任何新写点**——全文件 `localSlots` 写入点已在 §13.1 穷举（ELEM ×5、ADD ×2、SETLEN ×1、WHOLE ×1），
语句 3 期间可能被执行的只有：W1/W2/W3（读物化时的 `FindOrCreate*` 更新分支）、W6（13 次追加）、W5/W7（若 `#nev` 节点求值的
bool-chain 事务回滚）。**其中 W1–W4 有写后回读、W5 有恢复源前置检查 + 写回回读、W6 有 guard ⇒ 全部未命中** ⇒
语句 3 期间**没有**任何 typed 写把整行写成零 ⇒ 只能是**缓冲层事件**。

**按值面（W10）**：全文件共 **100 个函数**按值接收 `coreir.BodyIR`（源码语义上只读 ⇒ **不构成写点**，只构成**生命周期/rc 面**：
"缓冲被提前释放后被复用清零"）。语句 3 路径上高频出现的：`PrimaryBodyIrSlotType :8079`、`PrimaryBodyIrNextLocalStackOffset :4259`、
`PrimaryBodyIrLocalStackOffset :8410`、`PrimaryBodyIrLoadSlotWordCount :8465`、`PrimaryBodyIrStoreSlotWordCount :8470`、
`PrimaryBodyIrSlotIsStrRoot :8090`、`PrimaryBodyIrVarParamPointeeKind :5369`、`PrimaryBodyIrConditionOperandNeedsI64 :13319`、
`PrimaryBodyIrCallArgSlotCarriesAddressValue :15032`。

### 15.5 下一条读数方案（**先报方案，等批再出补丁**）
| 编号 | 读数 | 落点（**基线权威行号**） | 判词 | 判读 |
|---|---|---|---|---|
| **R4a** | **扩容完整性检查**：`add` 前记 `let primarySlotAppendGrew = localSlots.len == localSlots.cap`；`add` 后（在既有 guard 与新回读之后）**若本次触顶扩容**，则**全表扫描** `id != index` ⇒ panic | `PrimaryBodyIrLocalSlotNewSized`：基线 `:4457`（`add`）前后 | `primary slot table corrupted across growth appended=<slotId> index=<首个坏行> id=… tk=… name=… len=… cap=…` | **命中且 `appended=16` ⇒ 机制确证**：16→32 扩容把老行写零（下一步查数组增长实现 = runtime/codegen 面）；**不命中 ⇒ 排除扩容**，转 R4c |
| **R4b** | **全坏行列举**：把 `primarySlotIdentityTripwire` 升级为打印**全部**坏行（`bad=[i:id@tk,…]`，封顶若干条） | helper 本体：基线 `:66133-66139`（只改判词组装，不改扫描语义） | `primary slot identity lost stage=… bad=[…] len=… cap=…` | 直接回答 owner 问题 2：`stmt_begin_4` 判词里若 `bad=[4,10]` ⇒ 两个洞**同一条语句内**产生（同一机制、同一次触发）；若 `bad=[4]` ⇒ s10 是**后来**才坏的 ⇒ 机制在语句 3/4/5 各触发一次，"语句 3 特有"不成立，改看三条语句的共同点 |
| **R4c** | 回退：语句 3 路径内**边界回读二分**（进入/离开 `#cond_field` 读物化、binop 求值、`ScalarValueSlotForText` 前后各扫一次全表 id） | 语句 3 求值路径上的 3–4 个锚点（待定，出补丁前再按 `awk NR` 复核） | `primary slot identity lost stage=<锚点名> …` | 把清零压到语句 3 内的一个子阶段；若最终指向某 helper 的按值面 ⇒ 转 rc/生命周期审计 |
**建议**：R4a + R4b **同一枚补丁**（两处都很小、都只读、健康编译零行为变化；一次烤机即可判"扩容 / 老行时点"两问）。
R4c 留作不命中时的下一枚（落点待定，避免一次插太多锚点干扰）。

**交付纪律**：待 owner 批准后出补丁；独立、不覆盖既有四枚（`1803884a…`/`a3e7b3e7…`/`5e8c0a55…`/`c7c6006d…`）、
冻结副本带 sha256、`git apply --check` 基线=当前树、不落树；动 `primary_object_plan.cheng` 前重查 mtime 与 `git status`。

---

## 16. R4a + R4b 交付（owner 已批准）+ 扩容实现静态结论 + 收窄更正 + 最小复现

### 16.0 扩容实现**静态结论**（owner 补充线索 1：静态可判的三问，已判）
读件：`src/core/runtime/program_support_backend.cheng`。
1. **cap 策略**（`:7144-7155 cheng_seq_next_cap_calc`）：`cap<4 → 4`，然后 `while cap < needLen: cap = cap*2`
   ⇒ **自 4 起倍增**。⇒ 扩容追加点（cap 4→8→16→32→64）= **索引 4 / 8 / 16 / 32** ——
   **这是静态确认**，不再依赖"由 `cap=32/64` 反推"（§15.3 的算式由此升级为定论）。
2. **有没有"拷贝循环"、上界用旧 len 还是新 len**：**没有拷贝循环**。`cheng_seq_grow_to_raw_export`（`:7277-7297`）走
   `cheng_realloc_export(rawBuffer, newBytes)`（`:6168+`）—— 由分配器负责搬迁；长度上界不是源码层可控量。
3. **新缓冲是否先清零**：只清 **新增尾部**：`cheng_bytes_set(newBuffer + oldBytes, 0, newBytes - oldBytes)`
   （`oldBytes = curCap × elemSize`，`:7281/7293-7295`）⇒ **老区不重写**（realloc 保留），新区清零。
   `elemSize` 由调用方给出、`cheng_seq_alloc_bytes_checked` 为 `cap × elemSize`（`:7157-7161`）⇒ 若传入的 elemSize 偏小，
   被清零的区间会**从旧区内部开始**（会表现为**连续一段**行被清），**与本墙"两个不相邻空洞（4、10）"不符** ⇒ 该变体**静态降权**。
4. **新增（关键，本轮静态发现）**：`cheng_realloc_export` 在 **rc > 1（缓冲共享）** 分支是
   `malloc + copy(min(oldSize,newSize)) + release(旧块)`（`:6221-6236`）⇒ **扩容会释放旧块**；
   任何仍然指向旧块的**旁引用**随即悬垂，而后续分配复用该区并清零即可产出
   "**整行全零、位置任意、互不相邻**"的指纹 —— 与本墙观测**逐条吻合**（这也解释了 §15.3 里"扩容唯一整批触碰老行"为何可疑：
   不是拷贝写坏，而是**释放旧块后旁引用/复用**）。

### 16.1 文档收窄更正（owner 要求 3：逐字改，不许留给"上下文推断"）
- **原表述（§14.4，作废）**："扩容路径干净"。
- **改后（逐字）**：**"新追加行在扩容后是对的；老行是否在拷贝/搬迁中被打坏，guard 覆盖不到、本轮未证。"**
- 同步：§15.3 已先行标注该收窄；本节为最终口径。

### 16.2 补丁规格（R4a + R4b，同一枚）
| 项 | 值 |
|---|---|
| 补丁 | `patches/bodyir_slot_growth_integrity_readbacks.patch`（**+36 / −1 / 3 hunk**，只动 `src/core/backend/primary_object_plan.cheng`） |
| sha256 | `eaf41cd2b802ce93f998349545204967dec9026d13537b8c3412e8d339213470` |
| 冻结副本 | `.rebuild/s1b_step3/r9/patchgen/bodyir_slot_growth_integrity_readbacks.patch`（`cmp` 逐字节相同） |
| 基线 | **当前树**（HEAD + 75 行诊断 = guard15 + 判别读数29 + W 回读31）；`git apply --check` **exit 0**（实测） |
| 不覆盖既有件 | 补丁内既有四枚的**代码体**只作为上下文出现，新增行仅本枚（`+36`） |
| 落点（**基线权威行号**） | R4a 前半插在 `:4458`（`ls.stackOffset = …`）之后、`:4459 add` 之前；R4a 后半插在 `:4476`（既有 guard 回读）之后；R4b 改 `primarySlotIdentityTripwire` 函数体（`:66163-66169`） |
| 判词 | R4a：`primary slot table corrupted across growth phase=<pre_growth\|post_growth> appended=<slotId> grown_from=<旧cap> grown_to=<新cap> bad_before=… bad_after=… index=<首个坏行> id=… tk=… name=… len=… cap=…`；R4b：`primary slot identity lost stage=… bad=<计数>[i:id@tk,name]×≤8 len=… cap=…` |

**R4a 实现要点**：① `add` 前记 `primarySlotGrowthCapBefore = localSlots.cap` 与
`primarySlotGrowthWillGrow = localSlots.len == localSlots.cap`；② **触顶时先在 append 前扫一遍全表身份**（`bad_before`）；
③ append 后（在既有 guard 与新回读之后）再扫一遍（`bad_after`、首个坏行）；
④ 任一 >0 即 panic，`phase` 区分 `pre_growth`（坏点在该次扩容**之前**）与 `post_growth`（本次扩容后出现/增多）。
代价：**只在扩容追加点**多两次 O(n) 只读扫描（M-A 共 4 次），其余追加零成本；不写任何 body 字段；健康编译零输出。

### 16.3 预登记判读（owner 要求 1 + 2，写死）
| 观测 | 判读 |
|---|---|
| `phase=post_growth appended=16 grown_from=16 grown_to=32` | **16→32 那次扩容把老行打坏**（或触发释放/复用）⇒ 机制落到扩容路径（结合 §16.0-4 的 rc>1 释放旧块） |
| `phase=pre_growth appended=16 …` | **`bad_before>0`**：表在 16→32 扩容**之前**就坏了 ⇒ **该次扩容被排除**，坏点被夹在"上一次扩容（索引 8，语句 2）之后、本次扩容之前"，即**语句 3 前半段** |
| `phase=post_growth appended=4`（M-A 语句 1 的 4→8） | ⚠️ **立刻停下报 owner**：这与"`stmt_begin_3` 全表干净"**矛盾**（若每次扩容都打坏，s10 应在语句 2 的 8→16 就坏）⇒ 说明我们对**扩容点**或**语句↔槽块映射**的理解有错，不得继续推进 |
| `phase=post_growth appended=8` | 同上：与 `stmt_begin_3` 干净矛盾 ⇒ 停下报 owner |
| R4a 完全不命中（4 次扩容前后都干净），而 R4b 在 `stmt_begin_4` 报 `bad=…` | **扩容被排除** ⇒ 坏点在语句 3 的非扩容子事件里 ⇒ 转 R4c（语句 3 内二分边界回读） |
| R4b 报 `bad=2 [4:…][10:…]` | **两个洞同一次触发/同一语句内产生** ⇒ "语句 3 期间"成立，机制单一 |
| R4b 报 `bad=1 [4:…]` | s10 是**之后**才坏的 ⇒ 机制在语句 3/4/5 各触发一次，"语句 3 特有"不成立 ⇒ 改看三条语句共同点（`s.values[…]` 读写 / `ScalarValueSlotForText` / `FindOrCreateSlot` 通道） |

### 16.4 最小复现计划（owner 补充线索 2：样本太小）
M-A 只有 6 条语句、2 个洞。建议下一轮做**对照三件**（源码放 `docs/campaigns/2026-08-31-kernel-userpath/fixtures/`，命名 `r19_hole_*`）：
| 件 | 源（要点） | 预期洞数（"每 store 一洞"机制） | 预期洞数（"扩容/复用打坏老行"机制） |
|---|---|---|---|
| **H0 对照** | 只有 `var s: Slots` + `return 0`（零 store） | 0 | 0（无后续扩容） |
| **H1 单店** | `var s: Slots` + `s.values[0] = 7` + `s.used = s.values[0]` + `return 0` | **1** | **1**（该行之后仍有扩容点 8/16） |
| **H2 双店** | 两条 `s.values[k] = v` + 一条读（= M-A 去掉 `if`） | **2** | ≥1（视后续扩容次数而定） |
判读：**H1 出 1 洞 ≠ 判别**（两机制都预测 1）；**真正判别靠 H0/H2 + R4b 的 `bad` 计数**：
若 H2 也是 2 洞而 H1 是 1 洞 ⇒ "每 store 触发一次"；若 H2 的洞数随**语句数/槽数**变化（例如加一条无用读语句就多一洞）⇒ 指向"扩容/复用"。
（H1/H2 的槽数按 §15.1 的映射可预估：H1 ≈ 3+6+3 ≈ 12 槽 ⇒ 仍跨过 8 扩容点，故两机制不可由 H1 单独分开。）

---

## 17. r20 判读（R4a 零命中、R4b `bad=2`）→ 扩容假设**证伪** + R4c 方案（因 mtime 未过线**暂停落点**）

### 17.1 r20 读数与判读（owner 实测，`kd_r20`）
唯一判词：`primary slot identity lost stage=stmt_begin_4 bad=2 [4:id=0,tk=0,name=] [10:id=0,tk=0,name=] len=28 cap=32`
（取证件 `.rebuild/s1b_step3/r9/disc_ma_r20.stderr.txt`）。
- **R4a 零命中** ⇒ 索引 4/8/16/32 四次扩容**前后全表都干净** ⇒ **扩容路径被实测排除**。
- **R4b `bad=2 [4][10]`** ⇒ 两个洞**同一次触发**，且落在 `stmt_begin_3`（那时全表干净）与 `stmt_begin_4` 之间
  ⇒ **"语句 3 期间一次事件同时清零 s4 与 s10"成立**；"语句 3/4/5 各触发一次"这一支排除。

### 17.2 假设降级（逐字，不许当主候选）
- §16.0 第 4 条（`cheng_realloc_export` rc>1 分支"malloc+copy+**release 旧块** ⇒ 旁引用悬垂 ⇒ 复用清零"）：
  **已证伪（本输入）** —— 四次扩容全部由 R4a 前后扫描证明未打坏任何老行，该假设**不得再作为主候选**保留。
  （保留价值仅限于"机制类型参考"：若后续在**别的输入**上出现 R4a 命中，再回来查它。）
- 同理：**"扩容拷贝/尾部清零写坏老行"整族**在本输入上排除。

### 17.3 R4c 方案（owner 已批准；**本轮因共享文件 mtime 未过 10 分钟线而未落点**）
**读数设计**：新增 helper `primarySlotStageProbe(bodyIR: coreir.BodyIR, stage: str, stageLine: int32)`，
组装方式与 R4b 相同：**输出该阶段结束时全部坏行的完整列表**（`bad=<计数>[i:id@tk,name]×≤8`）+ `len/cap` + 阶段名 + 行号。
**落点（入口探针，只读；精确插入行在动笔时用 `awk NR` 复核）**：
| # | 探针 stage | 插入点（当前基线 def 行号） | 覆盖 owner 要求的阶段 |
|---|---|---|---|
| S1 | `field_assign_enter` | `fn PrimaryBodyIrAppendSimpleFieldAssignFast`（`:35151`）入口 | `s.used` 的 store 全程入口 |
| S2 | `scalar_text_enter` | `fn PrimaryBodyIrScalarValueSlotForText`（`:15552`）入口 | 取值/索引文本物化 |
| S3 | `scalar_text_impl_enter` | `fn PrimaryBodyIrScalarValueSlotForTextImpl`（`:15599`）入口 | 同上（内层） |
| S4 | `cond_field_enter` | `fn PrimaryBodyIrConditionFieldOperandSlot`（`:10647`）入口 | `#cond_field` 读物化 |
| S5 | `eval_node_enter` | `fn PrimaryBodyIrEvalNode`（`:41997`）入口 | 两个 `index_get` / binop 的节点求值 |
| S6 | `find_or_create_enter` | `fn PrimaryBodyIrFindOrCreateSlot`（`:5647`）入口 | 槽分配通道 |
| S7 | `find_or_create_sized_enter` | `fn PrimaryBodyIrFindOrCreateSlotSized`（`:5698`）入口 | 槽分配通道（Sized） |
（已有的 `stmt_begin_k`（循环顶）继续作为语句级包夹；J1/J2/W5/W1–W4/guard 全部保留。）
**代价**：每探针 O(槽数) 只读扫描；M-A 规模下合计 ≈ 百次 × ≤33 行，可忽略；不写任何 body 字段；健康编译零输出。

### 17.4 R4c 预登记判读（写死，不许事后解释）
| 观测 | 判读 | 下一步 |
|---|---|---|
| **S1 `field_assign_enter` 首个命中** | 语句 3 的 store 路径**入场时**表已坏 ⇒ 坏点在**该语句 RHS 求值之前**（含前一条语句收尾/循环推进） | 立刻转"语句 2 收尾 → 语句 3 入场"这段（含循环体末段），**不回**语句 3 内部 |
| **S2/S3 `scalar_text*` 首个命中** | 坏点在该次文本物化**之前**（上一次探针之后） | 按"上一个干净探针"包夹，点名该区间内的写者 |
| **S4 `cond_field_enter` 首个命中** | 坏点在 `#cond_field` 读物化之前 | 同上 |
| **S5 `eval_node_enter` 首个命中** | 坏点在节点求值之前（binop/index_get 的求值链） | 同上 |
| **S6/S7 `find_or_create*` 首个命中** | 坏点在槽分配调用之前（上一次探针之后） | 同上；若恰在 `FindOrCreateSlot` 的**内部**（进入干净、其后第一个探针坏）⇒ 直接查该函数的元素写/更新分支 |
| **语句 3 内所有探针都干净，而 `stmt_begin_4` 仍 `bad=2`** | **写点在语句循环的收尾**（`:52227` 循环体末段 / `stmtEnd` 推进处） | **立刻转那里**（循环末段插同类探针），**不许回到语句 3** |
| 判词列表形态 | 首个命中若 `[4][10]` 同时出现 ⇒ 单条指令一次扫过两处；若先 `[4]` 后 `[4][10]` ⇒ 两处先后中招 | 决定"一条写指令 vs 两次写" |

### 17.5 "按字节区间写 LocalSlot 数组"的候选清单（owner 要求 3，随 R4c 一并覆盖）
| 候选 | 位置 | 说明 / 现状 |
|---|---|---|
| ① 扩容尾部清零 `cheng_bytes_set(newBuffer+oldBytes, 0, …)` | `program_support_backend.cheng:7293-7295` | **已实测排除**（R4a） |
| ② `realloc` 搬迁（rc>1 分支 malloc+copy+release） | `:6221-6236` | **已实测排除**（同上；§17.2 降级） |
| ③ **`setMem` 零初始化槽存储**：`PrimaryBodyIrAppendZeroLocalSlot` 发 `setMem(CallArgSlotAddress(targetSlot), 0, size)` | `primary_object_plan.cheng:17897-17938` | 写的是**槽的帧存储**（不是槽表）；若槽号→地址映射错乱才可能误伤槽表 ⇒ 列为候选，S1–S7 包夹可判 |
| ④ 聚合 `FieldStore`/字节拷贝（`storeSizeBytes` 宽拷贝） | 定长数组/聚合店路径 | 同上：目标是帧存储；错址时会误伤 ⇒ 候选 |
| ⑤ **堆分配复用清零**（wall69 族：某块被提前释放后被复用零化） | `cheng_malloc_locked`/`NewStringCopy` 系 | 仍未证伪；若 S1–S7 全干净而 `stmt_begin_4` 坏 ⇒ 与"循环收尾处发生分配"一致 ⇒ 转 17.4 末行 |
| ⑥ 整 body 按值返回（sret 拷贝） | `return bodyIR`（`:58088`）；本语句内不适用（build 期无整 body 返回） | 语句 3 内无此事件 ⇒ 低优先 |

### 17.6 本轮纪律记录：**因 mtime 未过线而暂停落点**（owner 要求）
- 动笔前实测（04:28）：`primary_object_plan.cheng` **mtime 04:21 = 7 分钟前**（< 10 分钟线）、
  `git diff --numstat` = `110 0`（= 基线 75 + 我的 R4a/R4b 补丁 +35，系 owner 应用）⇒ **按 owner 规则停下报备，未抢写**。
- 本轮**零源码写入**；仅更新本文档（§17）与报告；R4c 补丁待 owner 确认文件静默后一次性落点。

### 17.7 共享文件触碰判据（owner 2026-09-12 04:3x 常驻规则，照录）
> 动笔前查 mtime + `git numstat`；**若与"我上次交付 + owner 已 apply"的预期一致就继续；不一致才停。**
> 判据不是"mtime 是否在 10 分钟内"本身 —— owner 的 apply 会正常刷新 mtime；**别人的 lane**（如 `compiler_csg.cheng`、
> `codegen_contract.cheng`）的改动才是要停的信号。

---

## 18. R4c 交付（语句 3 全阶段探针 + 循环收尾探针）

### 18.1 补丁规格
| 项 | 值 |
|---|---|
| 补丁 | `patches/bodyir_slot_stage_probes.patch`（**+39 / −0 / 9 hunk**，只动 `src/core/backend/primary_object_plan.cheng`） |
| sha256 | `55e5349c1caec108269e731f8192771f10e0eb06fc6f138266e8dc4d6337d3e4` |
| 冻结副本 | `.rebuild/s1b_step3/r9/patchgen/bodyir_slot_stage_probes.patch`（`cmp` 逐字节相同） |
| 基线 | **当前树**（`git diff --numstat` = `110 0` = guard15 + 判别读数29 + W 回读31 + R4a/R4b 35）；`git apply --check` **exit 0** |
| 不覆盖既有件 | 六枚既有补丁（`1803884a…`/`a3e7b3e7…`/`5e8c0a55…`/`c7c6006d…`/`eaf41cd2…`）代码体仅作上下文；新增行仅本枚 |

### 18.2 落点（`awk NR` 复核后的**基线行号**；`stageLine` 即写入判词的那个数）
| 探针 | stage 名 | 函数 / 位置 | 基线行 | 覆盖的 owner 要求项 |
|---|---|---|---|---|
| S6 | `find_or_create_enter` | `fn PrimaryBodyIrFindOrCreateSlot` 入口 | 5651 | 槽分配通道 |
| S7 | `find_or_create_sized_enter` | `fn PrimaryBodyIrFindOrCreateSlotSized` 入口 | 5704 | 槽分配通道（Sized） |
| S4 | `cond_field_enter` | `fn PrimaryBodyIrConditionFieldOperandSlot` 入口 | 10656 | `#cond_field` 读物化 |
| S2 | `scalar_text_enter` | `fn PrimaryBodyIrScalarValueSlotForText` 入口 | 15560 | 取值/索引文本物化 |
| S3 | `scalar_text_impl_enter` | `fn PrimaryBodyIrScalarValueSlotForTextImpl` 入口 | 15607 | 同上（内层） |
| S1 | `field_assign_enter` | `fn PrimaryBodyIrAppendSimpleFieldAssignFast` 入口 | 35161 | `s.used` 的 store 全程入口 |
| S5 | `eval_node_enter` | `fn PrimaryBodyIrEvalNode` 入口 | 42005 | 两个 `index_get` / binop 的节点求值 |
| E1 | `stmt_end_{k}` | **语句循环收尾**：`:52267 for stmtIndex in 0..<stmtEnd:` 循环体**最后一条语句之后**（`pendingWhileFalseTerms = []` `:57661` 之后）、循环体闭合（`if PrimaryBodyIrNodeEvalOnlyActive():` `:57662`）**之前**，缩进 8 | 57662 | owner 追加要求 2（分辨"收尾写坏"vs"下一条入场前写坏"） |

**说明**：`stmt_begin_k`（循环顶）保留，仍是主包夹（`continue` 会跳过 `stmt_end_k`，故循环顶探针不可省，已写进补丁注释）。

### 18.3 预登记判读（**原文照录进补丁注释**，不许事后解释；owner 要求 4）
1. **S1 `field_assign_enter` 首个命中** ⇒ 坏点在语句 3 的 RHS 求值**之前** ⇒ 转"语句 2 收尾→语句 3 入场"，**不回语句 3 内部**；
2. **S2/S3 `scalar_text*`、S4 `cond_field`、S5 `eval_node`、S6/S7 `find_or_create*` 首个命中** ⇒ 按"上一个干净探针"包夹点名写者；
   进入干净而其后的第一个探针坏 ⇒ 直接查该函数内部（元素写/更新分支）；
3. **语句 3 内所有探针都干净、而 `stmt_begin_4` 仍报坏** ⇒ 写点在**语句循环收尾**（`stmt_end_k` 与 `stmt_begin_{k+1}` 之间），
   立刻转那里，**不许回到语句 3**；
4. 坏行列表形态：`[4][10]` 同时出现 ⇒ 一条指令一次扫过两处；先 `[4]` 后 `[4][10]` ⇒ 两处先后中招。

### 18.4 "按字节区间写"候选（owner 要求 3，随探针一并覆盖）
③ `setMem(CallArgSlotAddress(targetSlot), 0, size)`（`primary_object_plan.cheng:17897-17938`，写槽的**帧存储**；槽号→地址错乱才误伤槽表）；
④ 聚合 `FieldStore` 宽拷贝（同③）；⑤ 堆分配复用清零（wall69 族，未证伪）；
①扩容尾部清零、②realloc 搬迁 —— **已由 R4a 实测排除**（§17.1/17.2）。

### 18.5 交付后现场
`primary_object_plan.cheng` 内容 = **基线 110 行**（我的 9 处插入已逐行精确回退，`git diff --numstat` 回到 `110 0`、
`primarySlotStageProbe` grep = 0）；补丁**未落树**；临时件 `.tmp_pg4` 已删除；六枚补丁 sha 未变。

---

## 19. r22 判读（S6 命中、`bad=1 [4]`）→ 包夹分析 + R5 阶段轨迹（**零接触共享文件**交付）

### 19.1 读数与判读
`primary slot stage corruption stage=find_or_create_enter stage_line=5651 bad=1 [4:id=0,tk=0,name=] len=20 cap=32`
（`kd_r22`，四件正例一致；取证件 `.rebuild/s1b_step3/r9/disc_ma_r22.stderr.txt`）。
- **首个命中探针 = S6 `find_or_create_enter`**，此刻 **`bad=1`（只有 s4）**；`stmt_begin_4` 才是 `bad=2` ⇒
  **两个洞是"先后中招"，不是一条指令扫过两处**（§18.3 第 4 条判读的后半支）✓
- 结合 `stmt_begin_3`（len=15）全表干净、S6 处 len=20 ⇒ **s4 变坏的窗口 = `stmt_begin_3` 之后 → 本次 S6 入场之前**，
  且**只坏了一行**（`bad=1`）。这是本轮最强的约束：**单行、任意位置、且发生在 `FindOrCreateSlot` 调用之前**。

### 19.2 owner 任务 1：前一个干净探针是谁？——**当前判词无法判定，原因与解法如下**
- **能严格说的**：探针 helper 在**首个坏状态**即 panic ⇒ **所有在本次 S6 之前执行过的探针都是干净的** ⇒
  坏点被夹在"**上一个干净的探针入口**"与"**本次 S6 入口**"之间 ✓（这一点是确定的）。
- **不能判的**：S6 探针插在 `PrimaryBodyIrFindOrCreateSlot` 的**函数入口**，它**不知道调用者是谁**；
  而该函数在语句 3 路径上被 **43（Impl）+ 34（EvalNode）+ 14（field-assign）+ 1（cond_field）** 处调用
  ⇒ "上一个探针"取决于**是哪一次调用**命中的，现有 7 个入口探针都是"函数级"、不带调用点身份 ⇒ **单靠这条判词判不出来**。
- **解法（本轮交付 R5）**：加**阶段执行轨迹**（`trail=` 打进判词），把"探针执行顺序"变成**可观测量** ⇒
  一次烤机即可读出 `…>scalar_text_impl_enter@15607>find_or_create_enter` 这样**完整的调用顺序链**，
  并据此点名"上一个干净探针" ✓（见 §19.4）。

### 19.3 owner 任务 2：`FindOrCreateSlot` 入口之前那一小段（`:5647` 调用者 → `:5651`）
- 探针就是该函数**第一条语句** ⇒ 函数体内**没有任何东西在它之前跑过**；函数自身的**前置查找分支**
  `PrimaryBodyIrNodeBoolChainSlotNameIndexLookup`（基线 `:5652` 起）在探针**之后** ✓。
- 调用点一侧的实参传递：`bodyIR: var coreir.BodyIR`（**引用**）、`slotNames: var str[]`（**引用**）、
  `name: str` / `typeKind: int32`（标量按值）⇒ **没有 `localSlots` 按值传递、没有返回值拷贝** ✓。
  ⇒ **坏点必在调用者体内、该调用之前** ✓（与 §19.1 的窗口一致）。
- **候选包夹段（按"上一个干净探针"分列；行号为当前基线）**：
  | 上一个干净探针 | 该调用者内**首个** `FindOrCreateSlot(` 调用点 | 待查段（长度） |
  |---|---|---|
  | S3 `scalar_text_impl_enter` `:15611` | `:15643`（cast 臂；其后还有 `:15723/15743/15758/15775/…` 等 43 处） | `:15612-…`（36 行起） |
  | S4 `cond_field_enter` `:10658` | `:10813` | `:10659-10813`（≈155 行） |
  | S5 `eval_node_enter` `:42011` | `:42055` | `:42012-42055`（≈44 行） |
  | S1 `field_assign_enter` `:35166` | `:35480` | `:35167-35480`（≈314 行） |
  | S2 `scalar_text_enter` `:15563` | 本函数体只转调 Impl（S3） | 极窄（≈1 调用） |
  | S7 `find_or_create_sized_enter` `:5705` | S7 体内（`PrimaryBodyIrLocalSlotNewSized` 之前） | 极窄 |
  **R5 的 trail 一旦点名，就只在对应的那一行段落点，不再铺开。**

### 19.4 R5 交付：阶段执行轨迹（`patches/bodyir_slot_stage_trail.patch`）
| 项 | 值 |
|---|---|
| 补丁 | `patches/bodyir_slot_stage_trail.patch`（**+24 / −2 / 5 hunk**，只动 `src/core/backend/primary_object_plan.cheng`） |
| sha256 | `26cb99eb186ea2bf733c7adc9b3dcf6eb49d4167fd74fd264fce52e1a658eb5d` |
| 冻结副本 | `.rebuild/s1b_step3/r9/patchgen/bodyir_slot_stage_trail.patch`（`cmp` 逐字节相同） |
| 基线 | **当前树**（`git diff --numstat` = `149 0` = 110 + R4c 39，即"我上次交付 + owner 已 apply"）⇒ `git apply --check` **exit 0** |
| 内容 | ① 模块级 `primarySlotStageTrail: str` + `…Initialized: bool`（`:146` 后）；② `primarySlotStageTrailPush(stage)`；③ `primarySlotStageProbe` 入口先记 `primaryStageTrailBefore` 再 push（`stage@line`），判词尾加 **`trail={…}`**；④ `primarySlotIdentityTripwire` 同样 push 并在判词尾加 `trail={…}`（语句级 `stmt_begin_k`/`stmt_end_k`/T1–T3 因此也进链）；轨迹封顶 768 字符 |
| 判词形态 | `… bad=<计数>[i:id@tk,name]×≤8 len=… cap=… trail=>stmt_begin_3>field_assign_enter@35161>scalar_text_enter@15560>scalar_text_impl_enter@15607` |
| 预登记判读 | **`trail` 的最后一段 = 上一个干净探针** ⇒ 直接落到 §19.3 表的对应行段；若 trail 显示的是 `>find_or_create_enter` 连续两次（S6 内再入 S6，例如经 `LocalSlotNewSized`）⇒ 上一个干净者是**同函数内的上一次调用**，待查段 = 两次调用之间的调用者代码 |

### 19.5 owner 任务 4：候选 ③④⑤ 在新约束下重排
新约束：**只坏 1 行（s4）、位置任意、且发生在某次 `FindOrCreateSlot` 调用之前、语句 3 之内**。
| 候选 | 新判读 | 依据 |
|---|---|---|
| **⑤ 堆分配复用清零**（wall69 族） | **提权为首位** | 单行、任意位置、且窗口落在物化链（`StripOuterParens`/`TypeCastInnerForTarget`/`Fmt`/`CloneStr` 等**会产生堆分配**的调用）内 ⇒ "某块被提前释放后被复用零化"与"只有一行、位置不贴边"完全相容 |
| **③ `setMem(CallArgSlotAddress(targetSlot),0,size)`** | **降权** | 其 20+ 个调用点都在**聚合/ctor/seq 零初始化**路径（`:15764/17868/24619/24984/25540/27575/31627/…`），而语句 3 是**标量字段店**；且它写的是**帧存储**，要误伤槽表还需"槽号→地址映射错乱"（额外假设） |
| **④ 聚合 FieldStore 宽拷贝** | **低位** | 语句 3 唯一的店是 `s.used`（4 字节标量 FieldStore），无宽拷贝 |
| ①扩容尾部清零 / ②realloc 搬迁 | **已实测排除**（R4a） | §17.1/17.2 |

### 19.6 纪律：违规承认 + 方法更正（下不为例已收到）
- **事实**：`bodyir_slot_stage_probes.patch` 在 owner 未 apply 的情况下被烤进 `kd_r22` ——
  根因是**我生成补丁时在共享树上做"就地插入 → `git diff` → 逐行回退"**（04:38–04:41 窗口内该文件一度带探针），
  并发烤机正好读到该窗口 ⇒ **混合树**。
- **更正（本轮起生效）**：**补丁一律在 scratch 副本上生成，共享文件零接触**：
  `cp` 到 `.rebuild/s1b_step3/r9/patchgen/.scratch/base.cheng` → 只编辑该副本 → `difflib` 生成 `a/`…`b/` 补丁 →
  `git apply --check`（只读）→ 冻结 → **删除 scratch**。本轮实测：全程 `git diff --numstat` 恒为 `149 0`、
  文件 mtime 恒为 04:52（owner apply 时刻）⇒ **零写入** ✓。
- **apply 权限**：共享文件的 apply 只由 owner 这条 lane 执行；我只交补丁件。

---

## 20. r24 trail 判读 → 嵌套求值**按序排除**、窗口压进 `Impl`、**穷举表缺口更正**、R6 交付

### 20.1 trail 读数与两条严格结论（`kd_r24`，四件正例一致）
`stage=find_or_create_enter stage_line=5651 bad=1 [4:id=0,tk=0,name=] len=20 cap=32`
+ `trail=…>stmt_begin_3>field_assign_enter@35161>eval_node_enter@42005>eval_node_enter@42005>scalar_text_enter@15560>scalar_text_impl_enter@15607`
（语句 1/2 的链更长且**多一次** `find_or_create_enter@5651` 紧跟在 `eval_node_enter` 之后 ⇒ 与语句 3 的嵌套路径**不同构**，owner 的观察成立）。
- **结论 A（嵌套 `eval_node` 支被排除）**：`scalar_text_impl_enter@15607` 这一条**进了 trail 且未触发** ⇒ 该探针**扫全表**、在 **S3 入口处表是干净的**。
  而 trail 显示**两次 `eval_node_enter` 都在它之前** ⇒ 内层求值、其**返回/合并**、外层继续执行，全部发生在"一次干净观测"之前
  ⇒ **它们都是干净的** ⇒ "嵌套 eval_node 返回/临时槽复用"**按执行序排除**（不是降权，是排除）。若后续探针与该结论冲突，再回查。
- **结论 B（窗口压进 `Impl`）**：坏点 = `scalar_text_impl_enter@15607`（干净）之后、**下一次 `find_or_create_enter@5651`** 之前
  ⇒ 窗口 = `PrimaryBodyIrScalarValueSlotForTextImpl`（`15607-16659`）内、**从入口到该次调用**之间的一条窄缝。

### 20.2 穷举表缺口更正（我自己发现的，必须留痕）
- 之前 §13.1/§15.4 的"全文件 `localSlots` 写点穷举"用的是 `localSlots[i] = …` 形态，**漏掉了"字段级写"** `localSlots[i].<field> = …`
  （左值里 `]` 与 `=` 之间夹字段名）⇒ 那一版**不完整**，本节更正。
- **更正后的完整清单**（全文件，当前基线 171 行）：
  | 形态 | 处数 | 行号 |
  |---|---|---|
  | 整行写 `localSlots[i] = …` | **5** | `4415`（retype）、`5693`（FindOrCreate 更新）、`5747`（Sized 更新）、`5937`（retire 改名）、`44805`（日志回滚恢复） |
  | **字段级写 `localSlots[i].field = …`（新增列出）** | **33** | `4303/4318`（stackOffset）、`5392/5399/8024/18460`（auxValue）、`6391/12879/16648/16802/16828/18806/18858/20481/26850/36145/36290/39187/47336/47472/47510/47556/47831/47946/48016/48246`（placeKind，全局槽标记）、`9223-9225/41988-41991`（typeKind/sizeBytes/alignBytes）、`8010`（stackOffset） |
  | 追加 `add(localSlots, …)` | 2 | `4459`（LocalSlotNewSized）、`70389`（池化合同体） |
  | `setLen(localSlots, …)` | 1 | `44814`（日志回滚，守卫只许收缩） |
  | 整表赋值 | 1 | `62360`（`PrimaryBodyIRMoveInto`，窗口外） |
- **对判定的影响**：字段级写**无法产出"整行全零"**（只改一个字段）⇒ "全行零必须是缓冲层事件"这一结论**不受影响**；
  但 `Impl` 内**确实有一处字段级写**：`16648 bodyIR.localSlots[globalSlot].placeKind = BodyPlaceGlobalAddressTag`
  ⇒ §15.4/§19 里"`Impl` 不写槽表"这句**收窄为**："`Impl` 内**无整行写、无追加**，只有 1 处字段级写（`:16648`）"。

### 20.3 候选重排（owner 任务 3）
| 候选 | 结论 |
|---|---|
| **⑤ 堆分配复用清零**（wall69 族） | **唯一首位**：窗口在 `Impl` 内，而 `Impl` 无整行写/无追加、字段级写又只能改单字段 ⇒ **全行零只能来自缓冲层**（某块被提前释放后被复用零化）；`Impl` 的物化链（`StripOuterParens`/`TypeCastInnerForTarget`/`Fmt`/`CloneStr`/hashmap）正是会产生堆分配的地方 |
| 嵌套 `eval_node` 返回/临时槽复用 | **按执行序排除**（§20.1 结论 A） |
| ③ `setMem(CallArgSlotAddress(targetSlot),0,size)` | 降权维持（调用点全在聚合/ctor/seq 零初始化路径；语句 3 是标量字段店；且需"槽号→地址错乱"额外假设） |
| ④ 聚合 FieldStore 宽拷贝 | 低位维持（语句 3 唯一的店是 4 字节标量 FieldStore） |
| ①扩容尾部清零 / ②realloc 搬迁 | 已由 R4a 实测排除 |

### 20.4 R6 交付：`Impl` 内二分 + `ops` 计数进 trail（`patches/bodyir_slot_impl_bisect.patch`）
| 项 | 值 |
|---|---|
| 补丁 | `patches/bodyir_slot_impl_bisect.patch`（**+8 / −2 / 4 hunk**，只动 `src/core/backend/primary_object_plan.cheng`） |
| sha256 | `54601a05164dca285646436a5f9ed3c1fb67708a4915a11dbb804c658b1c23e8` |
| 冻结副本 | `.rebuild/s1b_step3/r9/patchgen/bodyir_slot_impl_bisect.patch`（`cmp` 逐字节相同） |
| 基线 | **当前树**（`git diff --numstat` = `171 0` = 149 + R5 22，即"我上次交付 + owner 已 apply"）⇒ `git apply --check` **exit 0** |
| 内容 | ① trail 条目**带上 op 计数**：`stage@line/ops{N}`（探针与 tripwire 两处）；② `Impl` 内新增两个只读探针：`impl_after_cast_prologue@15658`（cast 前导段之后）、`impl_generic_text_arm@16543`（尾部"裸文本→既有槽"臂，`s.values[…]` 在语句 3 上最可能走的收尾臂） |
| 预登记判读 | 若下一条 trail 最后一段是 `impl_after_cast_prologue@15658/opsX` ⇒ 坏点在 **Impl 前导段（15612-15658）**；若是 `impl_generic_text_arm@16543/opsX` ⇒ 坏点在 **15658-16543 之间的某个臂**（结合 `ops` 增量与该区间内的臂/调用点定位）；若两者都没进 trail 而 panic 仍在 `find_or_create_enter` ⇒ 坏点在 **两探针之间更早的那次 `FindOrCreateSlot` 调用之前**，用 `ops` 差把区间缩到具体 op 段，再按 slot 名里的 `ops.len` 锚点（如 `#fidx8#5#esz` = ops 5）对齐到源码区间 |
| 零接触证据 | 全程 `git diff --numstat` 恒 `171 0`、文件 mtime 恒 `05:04`（owner apply 时刻）；scratch 已删 |
