# 小优 S6 端侧可行性探针门禁（go/no-go 量化判据）

2026-07-25 立表。此前 S6 只有「load/forward/RSS 定生死」的定性描述，复核员（~/cheng-patches/20260719/15plan/critic.md:69/:76）判「无量化门槛=主观拍板」。本表补齐，探针数字落地后按表机判，不再拍脑袋。

## 判据表（Qwen2.5-0.5B bf16, 942.3MiB safetensors, aarch64 安卓真机）

| 指标 | go | 边缘（需二阶段优化立项） | no-go |
|---|---|---|---|
| 权重加载 load_ms | ≤ 30s | 30-90s | > 90s |
| 单次 forward（7-token prompt, --logits-top5 1）forward_ms | ≤ 10s | 10-60s | > 60s |
| 峰值 RSS（VmHWM） | ≤ 1.5GB | 1.5-2.5GB | > 2.5GB（贴 MemAvailable 2.73GB 必被 LMK 杀） |
| 进程存活 | 正常退出 rc=0 | — | exit 137/LMK 杀 = 直接 no-go |

判据锚点：
- 产品体验目标=CU 规划器分类（classifyTaskKind）端到端 ≤3s 量级；单 forward 10s 已是 3 倍超标，仅够「可演示不可用」，故 10s 为 go 上限、60s 以上连演示价值都没有。
- RSS 锚=设备 DCO-AL00 MemTotal 7.42GB / MemAvailable 2.73GB（2026-07-25 实测）；TensorQ int32 展开理论估 494M×4B≈1.98GB + 最大张量临时 260MB。
- 桌面参照（#141, ~/cheng-patches/20260719/141kv/）：prefill ≈7.3s/token、KV decode ≈4.8s/token（M 系列）。手机标量内核估 3-8×退化。

## no-go 时的三条既定出路（recon.md:161）
更激进量化（int8/int4 内核）/ 更小模型 / 服务端推理。任一都是独立立项，不改本表。

## 探针配方（阻塞解除后直接照跑）
1. 编译（唯一真未知）：`artifacts/bootstrap/cheng.stage3 system-link-exec --root:. --in:src/tests/inference_planner_cli_main.cheng --emit:obj --target:aarch64-linux-android`。
   **2026-07-25 实测双向 blocked**：当日重烤 stage3（10:57）死于 `managed consumer call source is not exact`（exactness 收敛期）；seed-rescue-20260718 旧 stage3 死于 `reachable cold function body missing: seqs.chengSeqHeader`（源树已随新编译器演进）。等 op-lane exactness 收敛后重试。
2. provider 三件 + 链接：照抄 `tools/moq_droid_two_process.sh:24-50`；CP_ROOTS 必须追加 `src/inference/device.cheng` 的 21 个 `cheng_inference_metal_*`（`core_runtime_provider_linux.cheng:1579` 起已有全部 43 桩）；NDK 用本机 26.3.11579264（脚本默认 26.1 不存在）。
3. 权重：`~/models/Qwen2.5-0.5B/`（config.json + model.safetensors）push 到 `/data/local/tmp/s6/`。
4. 执行：`--dtype bf16 --tensor-scale 100000 --prompt-tokens <短csv> --logits-top5 1`（tokenizer 夹具 artifacts/tokenizer/ 不存在，必须走 --prompt-tokens）；RSS 用 `/proc/<pid>/status VmHWM` 轮询。
5. 设备纪律：机主空闲窗执行；跑前 `MemAvailable` 复测；单进程；探针二进制不进任何生产身份链。

## 探针绿后的接线三件（不止 setenv）
① 用当前源重编 `libedgeplanner.so`（线上 2026-07-15 版是纯规则陈品，动态符号无推理闭包）；② 宿主初始化 `setenv(CHENG_PLANNER_CONFIG/WEIGHTS/...)` 指 App 私有目录（全仓 grep 零命中实证从未设过）；③ `asiPlannerTaskResolve.ts` 的 `await bridge.classifyTaskKind` 补超时保护（critic.md:32）。
