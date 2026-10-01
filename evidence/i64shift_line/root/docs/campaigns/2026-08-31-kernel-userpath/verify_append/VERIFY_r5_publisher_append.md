# VERIFY_r5_publisher_append — R5 发布链预演（干跑，零发布）

日期：2026-09-07。执行：R5 子代理（重派后从零接手，前世产物已盘点入账）。

## 结论

R5 发布链全链干跑 rc=0：回执 create→verify 重算字节全等，publisher 身份后置重算 passed、
无覆盖断言 clean、GEN3 固定点门如实 blocked（固定点未达成，不虚绿）。发布零写入，
真模式保持占位（rc=3 拒绝）。GEN3 达成后按本文步骤单即可直通 plan_ready。

## 盘点（接手时现状）

- `tools/kernel_release_receipt.sh`（27282ac65e1b426af51fcbb382bfc7757ce9e6e2dc20400a3f9595865af9213c，本轮未改）
  与 `tools/kernel_release_publisher.sh`（修订后 f64b8c94f6d3716e903d922a4841083ee40327e009f08253bb86dc0d8e21bc44）
  已在盘上（前世 R5 遗产，`git log` 无记录：`.gitignore:325` 全局忽略 `*.sh`，未跟踪；入正式仓需主线程 `git add -f`）。
- R0 证据体系（`kernel_release_gate.py`/`kernel_release_receipt.py` 及合同测试）未动。
- 前世干跑样例：`fixtures/r5_publisher/receipt_dryrun_m19pair.kv`（m18==m19 字节全等对，
  活树根绑定，其 source_closure 对今日活树已过期——回执的预期性质，非缺陷）。
- 前世饿死尝试：`r5pub_starved_attempt.log`（bake_win 被占，600s 超时 rc=124）。
- cheng-fusion 正式仓不在本机：publisher 按文档口径写死接口假定（见「待联调」）。

## 本轮修订（Review 查出缺口一处）

缺口：publisher 原版对 `fixedpoint_status != equal` 的回执照样出 `plan_ready`——发布前置缺 GEN3 门。
修订（仅 publisher）：新增 `fixedpoint_gate=pass|blocked` 行；`publish_status` 三态
（`no_overwrite_violation` / `fixedpoint_gate_blocked` / `plan_ready`）；selftest P1 夹具补
gen2/gen3 等字节对（正例），新增 P6 非固定点负例（rc=0 且必须 blocked、不得 plan_ready）。
干跑 rc=0 语义不变（预演允许 blocked）；真模式接线时 blocked/violation 一律拒执（占位注释已写明）。

## 自检证据（scratch scope 内，退出即清）

```
kernel_release_receipt_selftest=PASS   rc=0
kernel_release_publisher_selftest=PASS rc=0
```

## m31 全链干跑（2026-09-07T08:46Z）

对象：现役 m31 驱动 `/tmp/oob_ab2/run_m31/kernel_driver`，
sha256=b4c97b833be9fa76d285234878f56d10c7558cc2f1111e7ae8e79ad7282172a6（与 summary.txt 一致）。

关键事实（烤机报告 `/tmp/oob_ab2/run_m31/kernel_driver.bake.report.txt`）：
- maxrss（/usr/bin/time 口径）=703168512；jobs=8；target=arm64-apple-darwin；ld 哈希与 m19pair 回执一致。
- seed 驱动（compiler_executable_sha256=7f731d4dfbaca2094097503b6a1af8456edd766daab05e3b225850b16e12c86c）
  二进制已不在盘上（m27/m28 仅存报告）→ 回执 seed_compiler_sha256=none，seed 真值以本行文字绑定。
- m31 与 m32 输出字节全等（b4c97b83），但两者同 seed、同源快照 cid（d258fda2…）——这是**确定性配对**，
  不是 GEN2→GEN3 链对。GEN3 仍缺「以 m31 为 seed 再烤复现 b4c97b83」。

活树障碍（操作发现）：干跑首轮 3 次尝试全部失败——`user_path_gate.sh`（PID 51345，主线程用 m31 跑门）
向 `src/tests/` 持续写删 `ug_gate_probe_*.51345.cheng`，`find` 与 `shasum` 之间文件消失，
`source_closure_failed`；实测两次完整闭包哈希不同（db6d282b… vs 635c40fd…）。叠加并行 lane 对
`src/game`、`src/apps`、`src/tools` 的人速编辑，活树无稳定窗。**正式发布必须在冻结窗（bake_win 式独占、
无并发门/编辑）内做 create+publish；verify 重算即漂移检测器，活树漂移按设计 hard-fail。**

干跑处置：APFS clonefile 冻结快照（src+bootstrap 共 6015 文件），create→verify→publish 全部绑定同一快照，
一次通过：

```
snapshot files=6015  source_closure_sha256=a21b373cd9cbc9c5a0961a24efffcf42b29aebd3f16d8970b8f47e622c59c405
receipt create=OK  verify(重算)=OK  receipt_sha256=803bce5c45ce9542749533f222be0b80a630952522aedd064e0a6a87aaa45eb2
publisher identity_recompute=passed  fixedpoint_gate=blocked  publish_status=fixedpoint_gate_blocked  rc=0
```

样例产物（campaign 目录）：
- `fixtures/r5_publisher/receipt_dryrun_m31.kv`
  文件 sha256=f89750c5b99cfd566b1ee7d73107ade2c60963fd80188b279e3453b28d193dd0
- `fixtures/r5_publisher/publish_plan_dryrun_m31.kv`
  文件 sha256=bad205b0a7217bfe621b06d1653e99a93ccb7f6c49ae335201494bf4ef4937f0
- `fixtures/r5_publisher/fusion_repo_sim/`（干跑专用 sim 仓根，README.kv 已注明）

回执绑定说明（如实）：回执 `source_root` 指向任务级快照路径
`/private/var/folders/.../cheng-r5_dryrun_m31.BcYl9i/srcroot`，scratch 退出已释放——本样例是
**预演快照绑定**，验证重算需按同内容重建树；正式回执将绑定冻结真根（活树路径），可长期重算。
publisher 清单中 `receipt_path`/`planned_file_0_source` 同理指向 scratch 内回执，属预演态记录。

## GEN3 即插即用步骤单

1. 冻结窗独占复烤：以 m31 驱动为 seed（rebake 风格），`CHENG_DISABLE_COLD_OBJECT_CACHE=1`+空缓存根、
   `BACKEND_JOBS=8`，产 `run_mNN/kernel_driver` + bake 报告。
2. 判固定点：sha256(新烤)==b4c97b833be9fa76d285234878f56d10c7558cc2f1111e7ae8e79ad7282172a6
   → equal；不等→阶梯未闭合，如实记 RED，停。
3. 回执（冻结窗内，活树根）：`kernel_release_receipt.sh create --driver:<m31> --source-root:<真根>
   --artifact:<新烤> --gen2:<m31> --gen3:<新烤> --darwin-time-maxrss:<本轮读数>
   [--linux-guard-report:<linux_cgroup_guard report.kv>，Linux 口径轮必带] --tool:… --target:… --jobs:8`
   → `fixedpoint_status=equal`。
4. `verify` 重算通过（即冻结窗漂移检测）。
5. `kernel_release_publisher.sh --dry-run --receipt:… --repo:<cheng-fusion> --release-id:<id>` 
   → `publish_status=plan_ready` 才算链通；`fixedpoint_gate_blocked`/`no_overwrite_violation` 照字面停。
6. 真模式（占位中）：用户显式授权后由主线程接线 stage→fsync→dir rename→index 追加→tmp rename；
   发布前再跑一遍身份后置重算。
7. 双口径：Linux 轮以 `tools/linux_cgroup_guard.sh`+validator 回执进 `--linux-guard-report`；
   Darwin 轮以 /usr/bin/time maxrss 进 `--darwin-time-maxrss`。两口径各出一份回执或分两轮补齐。

## CI 接线建议（建议 diff，主线程施；本任务不改 ci_gate）

```diff
--- a/tools/ci_gate.sh
+++ b/tools/ci_gate.sh
@@ (kernel 门区块，见 "kernel-plugin-manifest" 行后)
 check "kernel-plugin-manifest" python3 "$ROOT/tools/kernel_plugin_manifest_gate.py"
+check "kernel-release-receipt-selftest" bash "$ROOT/tools/kernel_release_receipt.sh" selftest
+check "kernel-release-publisher-selftest" bash "$ROOT/tools/kernel_release_publisher.sh" --selftest
```

两 selftest 自带 cheng_scratch_scope 任务临时目录（退出即清），无需 `check_scratch_gate` 包装。

## 待联调（cheng-fusion 不在本机，接口按文档口径假定）

- 发布基路径 `evidence/kernel_release/<release_id>/`、index=`evidence/kernel_release/index.json`
  （追加式，`{"release_id":"…"}` 含义上唯一）；无覆盖=目录不存在+index 无同 id。
- 原子序：stage 目录→fsync→rename 成目录→index tmp→rename（清单 atomic_sequence_0..5 已冻结）。
- 真模式接线前须与正式仓对账以上三条；不一致改 publisher 常量而非调用方。

## 红线核对

未发布任何东西；真模式拒绝路径经 P5 实证 rc=3。主树源码零接触。临时物已清：
`/tmp/r5_dryrun_m31.sh` 已删，scratch scope 自动清理；fixtures 内三个新文件为交付样例。
