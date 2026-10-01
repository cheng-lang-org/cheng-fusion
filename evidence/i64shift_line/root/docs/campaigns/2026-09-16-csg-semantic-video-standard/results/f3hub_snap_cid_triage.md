# f3_hub 预存红 sv_snap_cid_mismatch 只读 triage（2026-09-20）

结论先行：**不是回归，是 f1 夹具过期**。首坏 = 提交 `557e8e8d9`（09-19 05:22，基座求解门方向反转 bug 修正）：它把 base pass 从潜伏 bug 的 1 扫恢复为真 96 扫，球世界状态轨迹大变（该提交自证：球漂移 267mm→61.5mm，4.3×），而 `f1_ball.svblock` 的 worldCid 是 09-17 在"1 扫基座"轨迹上录制的 → 同一 csgworld 重推导的 payload 字节与录制 worldCid 必然不等。前一线程"归他 lane 未提交 typed_expr/compiler_csg 变更"的假设**不成立**：stage3 是 08-31 冻结二进制，且 typed_expr/compiler_csg/parser 根本不在 smoke 编译闭包内；红与工作树任何未提交改动无关。

## 1. 复现配方（本窗口实测，源码零改动）

编译产物进 `tools/cheng_scratch_scope.sh` 任务级目录：

```
artifacts/bootstrap/cheng.stage3 system-link-exec --root:<repo> \
  --in:<repo>/src/tests/sv_f3_hub_smoke.cheng --emit:exe \
  --target:arm64-apple-darwin --out:<scratch>/sv_f3_hub_smoke
cd <repo> && <scratch>/sv_f3_hub_smoke
```

实测输出（2026-09-20，HEAD=4bc1ddf62）：hgs 段绿；`f1 pass-through run + verify-snap binding: check sv_snap_cid_mismatch`，rc=1。smoke 抛点 `src/tests/sv_f3_hub_smoke.cheng:271`（SvF3PayloadCheck：`SvSnapResourceCid(encoded) != worldCid`，首检查点 ck-1200 即红）。

hub 侧取具体值：

```
<scratch>/hub verify-snap docs/campaigns/2026-09-16-csg-semantic-video-standard/fixtures/f1_ball.svblock \
  artifacts/csg_world_video/csgworld/ballbalance.csgworld
→ factsCid=538f3f61b26ecfe59dba02ebe5df68fa6356e590c94e2836e90de72e99e602b7
→ sv_snap_cid_mismatch expected=sha256:5d33ec215651bcae07546971be6b902712cda9c6a9f0a6ce8cce677ccaa5939b
                  actual  =sha256:17ad0b24bbed2a9de37900d47955653ed62c026cd8a6acfd9a81e694690fd9d9
```

factsCid 与 09-17 f3_hub.md 记录逐字节一致 → csgworld/事实域零漂移，差异纯在状态演化轨迹（物理求解），与编码格式无关（payloadBytes=8444 不变）。

## 2. 肇事最小集

文件：`src/game/constraints3d.cheng`，函数 `Constraints3dSolveTrackedBudget`（HEAD 行 253 起；肇事语句现 HEAD 行 330）：

```
- residual = constraints3dRun(w, Constraints3dIterations, 1000000000.0, supRepair)   # 1e9 门 + <= 比较
+ residual = constraints3dRun(w, Constraints3dIterations, 0.0 - 1.0, supRepair)      # -1.0 门 = 真跑满 96 扫
```

时间线：
- `ee53b9202`（09-16 07:52，"约束细化通道达标早退"）引入潜伏 bug：base 门 1e9 配 `<=`，mm 级残差第一扫即满足 → 基座 pass 自始只跑 1 扫非 96。
- 09-17：F1 夹具 f1_ball.svblock（ck-1200/2400/3600 的 payload/worldCid）在该 1 扫轨迹上录制，f3_hub 当日绿（f3_hub.md 佐证 worldCid=5d33ec…/3214f675…/a2ffc69a…）。
- `557e8e8d9`（09-19 05:22）修 bug（上 diff），恢复真 96 扫 → 轨迹变 → 夹具录制值永久不可再推导。同提交亦改 `src/apps/csg_player/main.cheng`（demo 键 2 行，与红无关）。

物理伴生文件 `src/game/physics3d.cheng` 在 G..HEAD 同步演化，但二分证明单独肇事者是 557e8e8d9 的 gate 一行（#13 b3ccbe47b 绿 → #14 557e8e8d9 红）。

## 3. 归因实验证据（shadow root A/B，全部 rc 实测）

方法：scratch 任务目录内建 shadow root（全量硬链接 repo src + `.git` 软链 + bootstrap 硬链），仅覆写嫌疑文件为指定提交版本后编译运行；共享树零改动。

| 变体 | 物理对版本（constraints3d+physics3d） | sv 模块 | 结果 |
|---|---|---|---|
| HEAD 现树 | HEAD（含 557e8e8d9 及后续） | 现树（含 plane 脏改） | 红 sv_snap_cid_mismatch |
| 全回退 | G=ef795a13b（09-17 23:51） | 47d0412a3（09-18 04:06 创建版） | **全绿 rc=0** |
| 只回退物理对 | G | 现树 | **全绿 rc=0** |
| 二分 #9 94d635fd6 | #9 | 现树 | 绿 |
| 二分 #12 b51b17546 | #12 | 现树 | 绿 |
| 二分 #13 b3ccbe47b | #13 | 现树 | 绿 |
| 二分 #14 557e8e8d9 | #14 | 现树 | **红（首坏）** |

补充定性：semantic_video 全部 G..HEAD 变更（含 plane additive 脏改 reader/schema/validator/writer）无罪——"只回退物理对"变体里 sv 保持现树仍全绿。单文件回退（只回 constraints3d）编不过：两物理文件协同演化，必须共版本测试。

## 4. 根因（一句）

f1_ball.svblock 夹具的 worldCid 是在基座求解 1 扫早退 bug（ee53b9202）的物理轨迹上录制的，557e8e8d9 恢复 96 扫后轨迹不可逆改变，夹具录制值过期，属预期失效而非代码回归。

## 5. 建议修法（未执行——本次只读 triage）

1. 用修复后物理重录 f1 夹具：以现树驱动重跑 F1 capture 序列（同 ballbalance.csgworld，factsCid 不变），生成新 f1_ball.svblock 并入库，替换 docs/campaigns/2026-09-16-csg-semantic-video-standard/fixtures/f1_ball.svblock；旧三枚 worldCid（5d33ec…/3214f675…/a2ffc69a…）在 f3_hub.md 等文档中标注"1 扫时代录制，已由 557e8e8d9 失效"。
2. 机械防线：状态快照类夹具应在录制时把 `git rev-parse HEAD`（或编译器/闭包哈希）写进 manifest `x-` 扩展键，物理默认行为变更时 hub 可结构化报"夹具基线过期"而非裸 cid_mismatch。
3. 不建议为绿回退 557e8e8d9：它是正当物理修复（96 扫是合同轨迹），且后续 919726941 等提交叠加其上。

## 6. 置信度

高（复现层：确定——同窗同树稳定红，cid 值实测；归因层：确定——绿/红边界在共版本二分下单调且收窄到单提交单 hunk；残余不确定：09-17 捕获时工作树可能含未提交改动，但"全回退到 G+创建版=绿"已覆盖该不确定性，结论不依赖对当日未提交内容的假设。）
