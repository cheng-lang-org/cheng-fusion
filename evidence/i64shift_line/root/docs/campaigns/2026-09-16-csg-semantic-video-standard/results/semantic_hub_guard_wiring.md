# F1.2 semantic_hub 五段链 hub 接线 x-physicsBaseline 基线对拍（verify-snap/restore/chain 快照臂全覆盖）

日期：2026-09-20。前置：results/hub_cli_baseline_wiring.md（semantic_snapshot CLI restore 已接 + guard 单一入口 `SvSnapBaselineGuard` 已收敛；边界原文=「真正的五段链 hub 仍未接」）。本任务：把同款对拍接进 `src/apps/semantic_hub/main.cheng` 的快照 manifest 消费子命令。

判定：**绿**。消费子命令全接（verify-snap/restore 两函数级接线点，chain 经函数调用传导覆盖两快照臂）+ cheng.stage3 金丝雀 2/2 rc=0 + f3 smoke rc=0 七行全段绿 + CLI 正常路三命令 rc=0（replayCidMatch=1、chain=ok）+ 负例 A 缺键路两接线点均报「夹具基线过期（物理默认行为已变，请重录）: manifest x-physicsBaseline missing」rc=1 且无 cid_mismatch + 负例 B 伪造基线失配路 verify-snap/restore/chain(seg=verify-snap) 三路均报 expected=0000000000000000 actual=0127baf1324a7457 rc=1 且无 cid_mismatch，源码冻结→forge→还原 cmp byte_identical=1 + 相邻 smoke（sv_f1_snapshot_smoke/sv_b3_player_smoke）rc=0。

**工具层事件（如实入档，不改判定）**：任务纪律指定的 kernel lane 现役 knife `.rebuild/s1b_step3/r9/kd_orcd10` 对 hub 闭包**预存崩溃**——编译器进程自身 `cheng_orc_release_failure code=registry_miss operation=normal_release detail=wrong_object_or_owner`（deref16=0xDD quarantine 毒签名，即该 lane 在追的 orc drop 缺陷家族；r9 lane 仅用它烤过小型 ab_* 探针件）。归属定谳：带接线源 16s 崩（2/2 确定），`git show HEAD:` 无接线源 18s 同签名崩 ⇒ **与本任务接线 diff 无关**（金丝雀两件在该 knife 下 rc=0 判活后复核）。验证改用本战役既有冻结件 `artifacts/bootstrap/cheng.stage3`（08-31 冻结件，f1/f3/hub_baseline_wiring 前轮同件先例），换驱动后金丝雀重过 2/2 rc=0。源码零绕改，knife 崩溃归编译器战役。

## 1. 消费路径盘点（以实际代码为准）

`src/apps/semantic_hub/main.cheng` 子命令全集 = `verify-footage` / `verify-snap` / `restore` / `query` / `seek` / `chain`（+`--help`）：

| 子命令 | 是否消费 svblock 快照 manifest | 接线 |
|---|---|---|
| verify-footage | 否（footage 族双绑定） | 无改动 |
| verify-snap | **是** | **接线点①** HubSnapPrep dep 绑定后、payload 消费前 |
| restore | **是** | **接线点②** HubSnapPrep dep 绑定后、replay/payload 消费前 |
| query / seek | 否（footage 族） | 无改动 |
| chain | 经 `HubModeVerifySnap`→`HubModeRestore` 两快照臂传导 | 两臂各含同款 guard（五段依次 fail-stop） |

相邻 app 复核：`semantic_player` 零 snapshot 消费（grep 无命中）；`semantic_snapshot` CLI 上一轮已接。快照消费装载时序两处一致：块 load（HubBlockLoad：decode→parse→validate→manifest 恰 1）→ world load（load+embedded CID 校验）→ HubSnapPrep（快照 dep 绑定 `s.deps[0]==factsCid` + resCid/resType 绑定 + 时基换算）→ **guard** → 驱动/payload 消费——「facts 装载（load+CID 校验+dep 绑定）之后、payload 读入之前」，与 semantic_snapshot 先例同序。

## 2. 改动面（git diff --stat，全量两文件）

```
 src/apps/semantic_hub/main.cheng  | 22 ++++++++++++++++++++++
 src/tests/sv_f3_hub_smoke.cheng   |  9 +++++++--
```

1. **接线点①/②**：`HubModeVerifySnap`、`HubModeRestore` 各插一次 `snapshot_block.SvSnapBaselineGuard(m.xPhysicsBaseline, facts)` 调用（复用单一入口，无双实现），非空即 `semantic_hub error: <guard 文案>` echo 后 rc=1；头部合同注释同步登记「快照消费模式均先做基线对拍」。
2. **smoke 最小补**（任务书「+若 smoke 缺则最小补」）：`sv_f3_hub_smoke.cheng` 的合并块构建 `SvF3BuildCombined` 新增 `physicsBaseline` 入参并发射 `manifest.xPhysicsBaseline`（合并块是 hub chain 快照臂的夹具，无键会被新 guard 拒）；main 里以 `SvSnapPhysicsBaseline(facts)` 现树探针值传入。合并块 4323→4418 B（+95 B 即基线键行）。

终态 sha256：main.cheng=`3e9ad58eb7763c502deac394fc98d2e608abc8d8f244dade2b9eec26c42902ef`、sv_f3_hub_smoke.cheng=`6ef331c965805818447eff51fb4553af892f36c1602e82aa85adaa2ee59bcd1e`。

## 3. 验证证据（原文）

全流程 `tools/cheng_scratch_scope.sh` 炉内进行，编译器=`artifacts/bootstrap/cheng.stage3 system-link-exec --emit:exe --target:arm64-apple-darwin`，每驱动先过金丝雀。

### 3.1 金丝雀

kd_orcd10（knife 判活用）与 cheng.stage3（实际烤制驱动）各跑两件金丝雀（`hub_guard_canary_two_line` + `ordinary_zero_exit_fixture`）：

```
canary_A_compile_ok / canary_two_line_rc=0
canary_B_compile_ok / canary_ordinary_rc=0 / CANARY_ALIVE      （两编译器各一轮，文本同）
```

### 3.2 f3 smoke 回归（guard 收敛后 rc=0 全段）

```
 sv_f3 smoke: hgs verify-footage ok, query [0,200000) matched=6, seek 10000000 readahead_bytes=454624
 sv_f3 smoke: f1 verify-snap ok (3 ckpts bound, payloadBytes=8444 each)
 sv_f3 smoke: f1 restore ck-1200 ahead 1000 replayCidMatch=1 (continuation 1000 ticks all equal pass-through)
 sv_f3 smoke: combined block ok (blockBytes=4418)
 sv_f3 smoke: combined chain segments ok (footage/query/seek/verify-snap/restore)
 sv_f3 smoke: negatives ok (corrupt-source/f1-as-footage/hgs-as-snap/ck-9999/payload-flip/payload-magic)
 sv_f3_hub_smoke ok
smoke_rc=0
```

### 3.3 CLI 正常路（新夹具，guard 不误伤）

verify-snap（f1_ball.svblock + ballbalance.csgworld）：

```
mode=verify-snap
factsCid=538f3f61b26ecfe59dba02ebe5df68fa6356e590c94e2836e90de72e99e602b7
ckpt=ck-1200 tick=1200 payloadBytes=8444 worldCid=sha256:17ad0b24…
ckpt=ck-2400 tick=2400 payloadBytes=8444 worldCid=sha256:7079d189…
ckpt=ck-3600 tick=3600 payloadBytes=8444 worldCid=sha256:622f4fce…
verifySnap=ok / pos_verify_snap_rc=0
```

restore（ck-1200 ahead 1000）：`replayCid==decodedCid=a31ec47a…`、`finalTick=2200`、`replayCidMatch=1`、`pos_restore_rc=0`。

chain（smoke 产合并块 chain_hgs_ball.svblock + hgs_faststart.mp4 + ballbalance.csgworld，ck-1200 ahead1000 [0,200000)）：五段 `seg=verify-footage→verify-snap→restore→query(matched=6 bytes=59152)→seek` 依次过，`chain=ok`、`pos_chain_rc=0`——chain 两快照臂在 guard 在场下正向全通。

### 3.4 负例 A：真实旧夹具缺键路（每接线点抽一）

旧件自 `488ccaf88^` 只读取出（sha256=`0175b22ce2fd5b3af16f27f466004f5c467c19e6fda2628409427b938b2fb19e`，3035 B，与 f1 报告旧值一致）：

```
semantic_hub error: 夹具基线过期（物理默认行为已变，请重录）: manifest x-physicsBaseline missing
negA_verify_snap_rc=1
semantic_hub error: 夹具基线过期（物理默认行为已变，请重录）: manifest x-physicsBaseline missing
negA_restore_rc=1
```

两路输出均无 `cid_mismatch` 字样（guard 先于 payload 读入）。

### 3.5 负例 B：伪造基线失配路（源码级 forge，两接线点 recorded 整体替换 64 个 0）

冻结→forge（sed 命中 2 处）→烤制→演练→冻结件还原→`cmp` **byte_identical=1**（sha `3e9ad58e…` 前后一致）：

```
semantic_hub error: 夹具基线过期（物理默认行为已变，请重录） expected=0000000000000000 actual=0127baf1324a7457
negB_verify_snap_rc=1
（restore 同文）negB_restore_rc=1
```

chain 臂传导负例（合法合并块 + 伪造 recorded，fail-stop 倒在第一快照臂）：

```
seg=verify-footage
mode=verify-footage
sourceCid=sha256:b6bbf351… indexCid=sha256:dcb7a7b3…
samples=675 keyframes=6 timescale=1000000 timeEnd=22500000
verifyFootage=ok
seg=verify-snap
semantic_hub error: 夹具基线过期（物理默认行为已变，请重录） expected=0000000000000000 actual=0127baf1324a7457
negB_chain_rc=1
```

三路输出均无 `cid_mismatch` 字样，且 chain 臂负例证明 seg=verify-snap 臂确实经过 guard（verify-footage 臂全过后才倒下，排除「chain 先期拒绝遮蔽」）。

### 3.6 相邻 smoke 回归

```
sv_f1_snapshot_smoke_rc=0（三恢复臂 + validator/修订并存/字节确定 + 损坏双拒）
sv_b3_player_smoke_rc=0（sample/hgs 两夹具）
REGRESSION_GREEN
```

## 4. 诚实边界

- **chain 级「缺键」负例不可构造**：chain 要求双族资源（合并块），纯快照旧块在 seg=verify-footage 即被 `sv_res_type_mismatch` 拒（本炉实测，属 chain 前置拒绝非 guard 缺口）；而合并块由 smoke 进程内构建，无 CLI 可产「无基线合并块」。chain 快照臂防线由 negB 失配路演示（3.5 第三段）+ 两臂与独立子命令共用同一函数体（代码路径同一）。
- **guard 时序与上一轮先例一致**：dep 绑定失败（world 错配）先于 guard 报 `sv_snap_facts_unbound`，两故障互斥可分辨，非遮蔽。
- **防线覆盖边界继承 f1 报告原文**：指纹仅覆盖 tick 8 前显形的物理默认行为变更；tick 8 后显形的变更穿透防线落裸 cid_mismatch。
- **kd_orcd10 预存崩溃**：对本 hub 闭包确定崩溃（含 HEAD 无接线源），本任务未修（属 r9 lane 在追的 orc drop 家族，编译器战役）；`hub_head_probe.cheng` 诊断探针已随炉清除，主树零残留。
- **临时件零留存**：`.scratch/hub_guard_wiring/`（炉脚本/驱动/冻结件/演练块/旧夹具副本）、`.scratch/f3/`（smoke 产合并块）与金丝雀两源文件任务末删除；无 git commit。
