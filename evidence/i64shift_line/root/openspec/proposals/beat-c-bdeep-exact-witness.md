# B 深 rsa_pss exact actual 证据闭环

状态：`applying`。2026-07-10 用户明确要求“完成 B 深”，本提案按当前四线任务的窄定义执行：闭合 `rsa_pss_self_smoke -> pointJacobianDoubleInto` 的 nodes2/BodyIR actual-codegen 证据；不把该结论外推为历史 4713 行 surfaceText 迁移全部完成。

## 已 apply

- exact selector 同时绑定 source path、原函数名和 driver，三项缺一 hard-fail。
- typedIr function row 必须唯一；nodes2 span 内 owner 数等于 span，span 外同 owner 数为零。
- Primary 只在释放目标单函数 BodyIR 前复制 op/term/block/local-slot 四个计数。
- actual 字段只允许成功出口在 `full_backend_codegen=1` 后签发；error/plan/dry report 携带该前缀立即失败。
- witness 绑定 driver、入口、目标源、target、output、run log 哈希与唯一 runtime marker。
- witness 强制关闭 backend-driver handoff，并要求 current-source candidate summary、candidate hash 与完整 `src/**/*.cheng` manifest 三者一致；实际编译前后闭包任一字节变化立即失败。

## 剩余 apply

| files | action | verify | done |
|---|---|---|---|
| `src/core/tooling/compiler_main.cheng` + 全量 Cheng source manifest | 直接物化 current-source compiler-main candidate；构建前后源码与 stage3 哈希不变 | candidate 含三项 flag 与 schema，报告为 full/selfhost/non-cold | 候选身份不可漂移 |
| `tools/rsa_pss_nodes2_coverage_witness.sh` | 用同一 candidate 生成并复核唯一最新 `exact_function_evidence` actual evidence | 禁止二次 handoff；candidate summary/完整源码 manifest 一致；唯一 row/span owner、BodyIR 四计数、runtime rc/marker/hash 全部通过 | `rsa_pss_nodes2_witness_status=passed` |

## 拒绝路径

- 不用 `build-backend-driver` 的 dispatch-min 入口冒充 compiler-main exact schema。
- 不接受 dry-compile、cold fallback、BodyIR 非空、名称专用探针或 BigInt 特判作为 actual 证据。
- 不接受 candidate 构建后源码漂移，亦不允许实际编译再次 handoff 到另一个 backend driver。
- 不在源码/stage3/candidate 漂移时继续运行或拼接旧报告。

## Archive 条件

actual witness 由锁定的 current-source compiler-main 生成并通过严格复核；证据落稳定 verification 目录，Review 无 success/error 混写和 cleanup 绕过。历史完整 B 深保留在独立长期计划，不随本窄提案虚假关闭。
