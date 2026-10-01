# Step 3 内核纯自举固定点：冻结窗口作业程序（草案 v1）

> 依据 docs/cheng-minimal-kernel-plan.md Step 3 与工程规范 6/7。本文件为作业 checklist，
> 开烤前逐项打勾，缺一不得点火。

## 前置门槛（全部满足才允许申请冻结窗口）

- [ ] 收敛线 system-link-exec rc=0（当前死点 FinishSystemLinkExecChildInto 由收敛线子代理处理中）
- [ ] 全部临时探针清零：findings 追加257/259/262 清单逐项核销；`grep -cE '\\[(ra|rlp|rlt|rl|vol|VP|prd|lin|ppg|ubg|rew|smgw|voret|voimpl|vos|uvs|vopub)\\]' bootstrap/cold_parser.c bootstrap/cheng_cold.c` 两文件均为 0
- [ ] CHENG_NO_MEMO11 等环境开关代码路径删除（grep getenv 核对）
- [ ] 双跑稳定：同输入两次构建二进制 sha256 一致
- [ ] 双后端 smoke 绿：--emit:obj 对 riscv64-unknown-elf 与 esp32s31 各产出非零 .o 且过 tools/riscv_elf_isa_check.py（e_flags=RVC|single-float=0x5 于 RV32F 目标）
- [ ] 三重验收绿：tools/cross_platform_acceptance.sh、tools/exec_diff.sh、SEEDS=200 JOBS=1 tools/diff_fuzz_test.sh、tools/f17_byte_identical_gate.sh

## 审计回执（2026-08-24 18:5x，实测）

- ① 未过：`build-backend-driver` 实测死于 `primary object emit failed`（exact point liveness /
  managed CFG merge batch mismatch），current-source 源链仍红，属收敛线持有。
- ② 未过：探针 grep 实测 cold_parser.c=151、cheng_cold.c=4，均非 0。
- ③ 未过：`CHENG_NO_MEMO11` 仍在 cold_parser.c:73260；getenv 计数 cold_parser.c=71、
  cheng_cold.c=93。
- ④–⑥ 不点火：因 ① 未过，双跑/双 smoke/三重验收跑出来也是移动靶，按本文件门槛
  不得执行；所有动态项待收敛线 rc=0 后统一复跑。
- 结论：Step3 前置仍 0/7，不是工具或文档缺口，是编译链收敛未完成的单一上游阻塞。

- 复验工具化（2026-08-26 04:5x）：`tools/kernel_step3_static_freeze_gate.sh` 落位，
  将②③合并为硬门。主树实测 rc=1（probe_lines 151/4、CHENG_NO_MEMO11 于
  cold_parser.c:75218）；临时仓正例 rc=0、负例 rc=1。两项均在 door11 热区，
  待收敛线解禁后清零复跑；不提前勾选。


## 冻结窗口程序

1. **窗口宣告**：progress.md 记录开始时刻；并发 lane 收到 mtime 静止要求。
2. **静止确认**：对将进内核源集的每个共享文件记录 mtime+sha256；等待 ≥10 分钟无变化方可继续。
3. **源集圈定**：bootstrap/kernel_manifest.cheng（Step2 草案转正版）所列文件全集。
4. **烤制**：`tools/bootstrap_from_cheng.sh --kernel-mode`（待 Step3 接线）跑两代；
   每代产出 stage 固定点哈希；全程 `tools/768MiB 进程树守卫` 挂网。
5. **证据包**：源码 manifest 哈希 + 编译器哈希 + 工具链哈希 + 两代固定点哈希 + 守卫日志，
   六件套落 `artifacts/kernel-freeze/<date>/` 并在 findings.md 记卷。
6. **CI 门禁**：ci_gate.sh 新增 kernel-fixed-point 项转正式。
7. **解封**：progress.md 记录结束时刻与解封原因。

## 红线复述（开烤前再读一遍）

- 共享文件只进不改；绝不 `git checkout -- <file>` / `git restore <file>`。
- 单 smoke 不算完成；一切结论绑三方哈希。
- 发现漂移即 hard-fail，禁止任何带病降级。
