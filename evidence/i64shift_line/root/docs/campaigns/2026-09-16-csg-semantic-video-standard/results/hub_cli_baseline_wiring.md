# F1.1 hub CLI 本体接线 x-physicsBaseline 基线对拍（smoke 收敛单一入口）

日期：2026-09-20。前置：results/f1_fixture_rerecord.md（探针 `SvSnapPhysicsBaseline` + manifest `x-physicsBaseline` + smoke 装载段对拍已在案；边界=「hub CLI 本体未接」）。本任务：把同款对拍接进 `src/apps/semantic_snapshot/main.cheng`，smoke 内联逻辑收敛到单一可复用入口，杜绝双实现漂移。

判定：**绿**。子命令全接（本 CLI 唯一 svblock 快照消费子命令 `restore`）+ smoke 回归 rc=0 三臂全绿 + CLI 级负例两路（真实旧夹具缺键 / 伪造基线失配）均报「夹具基线过期」rc=1 且无 cid_mismatch 字样 + 演练后源码 cmp byte_identical 还原 + 终态字节全链复验。

## 1. 消费路径盘点（结论：本 CLI 仅 restore 一个消费点）

`src/apps/semantic_snapshot/main.cheng` 子命令全集 = `capture` / `restore`（main 分发仅此两支）：

| 子命令 | 是否消费 svblock 快照 manifest | 处置 |
|---|---|---|
| capture | 否（生产端：装载 .csgworld，产 block；上一轮已接探针回显 `physicsBaseline=`） | 无改动 |
| restore | **是**（读 block manifest/snapshot 记录 + 依赖绑定 .csgworld 重放） | **本任务接线** |

不存在 open/verify 子命令；任务书括注的「open/verify 等」在本 CLI 无对应物。

## 2. 改动面（git diff --stat，全量三文件）

```
 src/apps/semantic_snapshot/main.cheng              | 36 +++++++++++++++-------
 src/game/assets/semantic_video/snapshot_block.cheng | 22 +++++++++++++
 src/tests/sv_f3_hub_smoke.cheng                    | 20 +++++-------
```

1. **单一入口** `snapshot_block.SvSnapBaselineGuard(recorded, facts) -> str`（新增，紧邻探针 `SvSnapPhysicsBaseline`）：返回 `""`=基线在场且与现树探针一致；非空=结构化过期文案（统一「夹具基线过期（物理默认行为已变，请重录）」，缺键附 `manifest x-physicsBaseline missing`，探针失败附 `physics baseline probe failed`，失配附 `expected=<前16> actual=<前16>`）。调用方加自身前缀 echo 后 rc=1（smoke 同款语义）。
2. **smoke 收敛**（`sv_f3_hub_smoke.cheng`）：装载段原 12 行内联对拍（缺键/探针/失配三分支）替换为一次 guard 调用；输出由全量 sha 收敛为前 16 位，判定语义不变。
3. **CLI restore 接线**（`main.cheng`）：facts 装载（load + embedded CID 校验 + dep 绑定检查）**前移**到 payload CID 判定之前，guard 插在 dep 绑定之后、payload 读入之前——「装载后、payload CID 判定前」与 smoke 同序；manifest 取 `[0]` 由 SvValidate 保障（0 条=`sv_missing_required_field manifest`，多条=`sv_ref_duplicate manifest`，均先于本检查拒绝）。

## 3. 新坑登记（本任务实测，已写进探针复现）

**裸 `return` 的续行 `+` 被静默截断**：无括号时 parser 在换行处结束语句，多行串接只返回首行字面量，后续行静默丢弃（编译零告警）。首轮负例 B 据此暴露 `expected=` 后空串；最小三形探针实测：裸续行=`X=`（截断），括号包裹与单行 ConcatStr 均=`X=1111 Y=3333`。guard 已改括号形并在源内留注释；语言级根治属编译器战役。**连带教训：echo 内括号续行（main.cheng 既有先例）不受此坑影响。**

## 4. 验证证据（原文）

烤制：`artifacts/bootstrap/cheng.stage3 system-link-exec`（08-31 冻结件），全流程 `tools/cheng_scratch_scope.sh` 炉内进行，每炉新驱动先过金丝雀。三文件终态 sha256：main.cheng=`65a715dc…`、snapshot_block.cheng=`83c8a496…`、sv_f3_hub_smoke.cheng=`265abc21…`。

### 4.1 金丝雀 + smoke 回归（guard 收敛后，rc=0 三臂全绿）

```
canary_two_line_rc=0
canary_ordinary_rc=0
 sv_f3 smoke: hgs verify-footage ok, query [0,200000) matched=6, seek 10000000 readahead_bytes=454624
 sv_f3 smoke: f1 verify-snap ok (3 ckpts bound, payloadBytes=8444 each)
 sv_f3 smoke: f1 restore ck-1200 ahead 1000 replayCidMatch=1 (continuation 1000 ticks all equal pass-through)
 sv_f3 smoke: combined block ok (blockBytes=4323)
 sv_f3 smoke: combined chain segments ok (footage/query/seek/verify-snap/restore)
 sv_f3 smoke: negatives ok (corrupt-source/f1-as-footage/hgs-as-snap/ck-9999/payload-flip/payload-magic)
 sv_f3_hub_smoke ok
smoke_rc=0
```

（终态字节修注释后另行复跑同文，smoke_rc=0。）

### 4.2 CLI 正常路径（新夹具 capture→restore，guard 不误伤 + f1 报告锚点逐字节命中）

```
capture_rc=0
factsCid=538f3f61b26ecfe59dba02ebe5df68fa6356e590c94e2836e90de72e99e602b7
physicsBaseline=0127baf1324a74572ceb72654b012babd0f49da1b1ad290c5d1cbff5e9f2dea5
anchor_factsCid=hit
anchor_physicsBaseline=hit
restore_ok_rc=0
mode=restore
ckpt=ck-1200 tick=1200
replayCid=a31ec47a820fe74f47906790f981e53f428129026f0d0909df1b827723a030ba
decodedCid=a31ec47a820fe74f47906790f981e53f428129026f0d0909df1b827723a030ba
replayCidMatch=1
restore=ok
```

三臂 worldCid 与 f1 报告表逐一相同（17ad0b24…/7079d189…/622f4fce…），blockBytes=3129。

### 4.3 负例 A：真实旧夹具（缺键路）

旧件自 `488ccaf88^` 只读取件（sha256=`0175b22ce2fd5b3af16f27f466004f5c467c19e6fda2628409427b938b2fb19e`，3035 B，与 f1 报告旧值一致）：

```
negA_rc=1
FAIL fixture baseline expired 夹具基线过期（物理默认行为已变，请重录）: manifest x-physicsBaseline missing
negA_expired_msg=hit
negA_missing_key=hit
negA_no_cid_mismatch=1
```

### 4.4 负例 B：伪造基线（失配路，源码级 forge，f1 同法）

冻结→forge（recorded 传 64 个 `0`）→烤制→演练→`cp` 冻结件还原→`cmp` byte_identical（sha `65a715dc…` 前后一致，两轮演练同法）：

```
negB_rc=1
FAIL fixture baseline expired 夹具基线过期（物理默认行为已变，请重录） expected=0000000000000000 actual=0127baf1324a7457
negB_expired_msg=hit
negB_expected16=hit
negB_actual16=hit
negB_no_cid_mismatch=1
```

（首轮演练暴露 §3 截断坑→guard 改括号形后复得本全文。）两路负例输出均无 `sv_snap_cid_mismatch`/`payload cid mismatch`/`replay diverged` 字样，证明 guard 先于一切 CID 判定。

### 4.5 终态字节全链复验（注释修正后的最终源码重烤）

smoke rc=0（同 4.1 七行）；capture rc=0（anchors 同 4.2）；restore rc=0 尾行 `restore=ok`。

## 5. 诚实边界

- **`src/apps/semantic_hub/main.cheng`（真正的五段链 hub，verify-snap/restore/chain 消费快照 manifest）仍未接 guard**——任务纪律明确限改 semantic_snapshot main + smoke 收敛，故不越界。其 verify-snap/restore 用旧夹具时仍会裸撞 payload/replay CID 失配；接法=同款 `SvSnapBaselineGuard` 调用（已 import snapshot_block，各 ~5 行），随时可接。
- CLI restore 的 dep 绑定检查（`FAIL block dep does not bind this csgworld`）位于 guard 之前：world 文件错配时先报绑定失败再轮到基线——两故障互斥可分辨，非遮蔽。
- guard 指纹仍只覆盖 tick 8 前显形的物理默认行为变更（f1 报告边界原文继续有效）。
- 旧夹具的旧 payload 资源已随旧物理湮灭（f1 报告在案），负例 A 的「若无 guard 将撞 payload cid mismatch」由代码序保证（guard 先于 payload 读入），输出无 cid_mismatch 佐证。
- 临时件零留存：探针/金丝雀两文件与 `.scratch/hub_baseline_wiring/`（脚本/冻结件/演练块）任务末删除；无 git commit（遵任务纪律）。
