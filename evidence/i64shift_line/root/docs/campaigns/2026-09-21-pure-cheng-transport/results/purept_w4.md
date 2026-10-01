# W4：QUIC 可靠性与拥塞控制纯逻辑层（RFC 9002，事件仿真起步）

结论先行：**判据 a-d 全绿，W4-RECON RESULT: PASS，run_rc=0**。交付 `src/quic/pure/recovery_{ack,loss,cc,fc}.cheng` 951 行 + 驱动 `src/tests/purept_w4_recon.cheng` 982 行（仿真器在驱动内），全为新文件；既有共享文件零改动（足迹见 git ??）。时间源全部由驱动注入（`nowUs` 参数），模块零内部时钟，W3b 落地后直接喂真包事件。判据驱动=冻结 stage3（当代 `./cheng` 两波金丝雀 SIGILL 判死，按纪律重试一次仍死，冻结 `artifacts/bootstrap/cheng.stage3` 05af823e…，金丝雀×2 bake=0/run=0）。

## 交付面

| 文件 | 行数 | sha256（前8） |
|---|---|---|
| src/quic/pure/recovery_ack.cheng | 214 | e62587fb |
| src/quic/pure/recovery_loss.cheng | 478 | c5c22dd9 |
| src/quic/pure/recovery_cc.cheng | 93 | abb3e441 |
| src/quic/pure/recovery_fc.cheng | 166 | d48349a3 |
| src/tests/purept_w4_recon.cheng | 982 | c752ca05 |

证据：`results/purept_w4_evidence_recon.txt`（最终轮全文逐字，rc=0，sha256 9842d0ab…）。

## 判据

### a. RFC 9002 附录 A 状态机迁移可达全覆盖——过（22/22）
迁移 id 及累计计数（loss+cc 合计，逐字见证据 COV 行）：sent=8679、sent_probe=13、rtt_first=11、rtt_update=375、acked_new=8400、acked_dup=299655、acked_unknown=1、spurious=2、lost_window=219、lost_time=237、persistent=5、cc_loss_reduce=85、timer_cancel=335、timer_arm_loss=297、timer_arm_pto=8484、timeout_loss=44、timeout_pto=7、pto_backoff=7、pto_reset=386、probes_pending=7；cc 侧 slow_start=42、ca=340、persistent=5。Lost（pn 窗 + 时间阈值）、Timeout（loss-timer 过期与 PTO 退避）、ACK 收敛（首样/递推/去重/未知/伪超）三类路径全部可达且各有专属单元用例（u1-u11）。

### b. 仿真场景 ≥6 条，每场景吞吐/重传率/收敛时间——过（6/6）
口径：2 MB 交付，RTT 20 ms（rtt_step 为 20→80 ms 阶跃），批量确认 +8 ms 确认时延；收敛时间=交付完成时刻（zero_read=信用窗耗尽停流时刻）。

| 场景 | 吞吐 (B/s) | 重传率 (‰) | 收敛 (ms) |
|---|---|---|---|
| 无丢包满速 | 13,888,888 | 0 | 144 |
| 随机丢 1% | 1,851,851 | 7 | 1,080 |
| 随机丢 5% | 388,500 | 47 | 5,148 |
| 突发丢窗（60 ms–1.26 s 全丢） | 964,457 | 91 | 2,073 |
| RTT 骤变（20→80 ms @100 ms） | 9,803,921 | 0 | 204 |
| 对端零读反压 | 1,200,000（信用窗内） | 0 | 54（停流） |

burst 场景确认持久拥塞 1 次（cwnd→2400 后完全恢复）；rtt_step 场景估计器 latest=48000 精确、min=18000 保持；zero_read 交付恰为初始信用（64800 ≤ 65536，BIF 归零停流）。

### c. 不变量——过（零违例）
- **包号永不复用**：单调分配 + 环槽位占用守卫（QuicOnPacketSent rc!=0 即 hard-fail），全跑 8679 次发送零违例。
- **credit 永不为负**：AllowSend 门 + OnSent 拒绝式记账（拒绝时零变异），每事件批后断言 conn/stream 双信用 ≥0。
- **cwnd 单调性**：仅在丢包轮（QuicCcOnPacketsLost）内允许下降，其余任何事件步下降即 hard-fail；且 §7.3.2 每 RTT 至多一次减窗节流（skippedReductions 计入 cc）。

### d. 无丢包场景吞吐退化 ≤5%——过（0%）
纯逻辑开销口径：无丢包场景仿真完成时刻 144,000 us 与闭式 newreno 管道模型（慢启动每确认轮翻倍、批量节奏=单向时延+确认时延）144,000 us **逐毫秒相等**（允许带 90%–105%，实测 100.0%）。恢复层在无损管线中零伪事件（0 重传、0 探针、0 PTO、0 伪丢包）。

## 工程实证（红=自产/编译器，均闭环）
1. **编译器 residual（登记，未绕语义）**：冻结 stage3 的 body-store-freeze 准入拒绝「同函数内 int64 数组元素读 + 分支下 int32 数组元素写」及「含定长数组记录的 var 穿透调用后继续使用」两类合法表面（约 12 轮最小复现探针定界：2 数组小记录全绿、≥3-5 数组同形即拒，错误 `fixed-array field store lacks exact predecessor` / `managed consume-only edge is broken`）。解法=结构化实现：ring 全 int64 化（size|flags 位打包进单个 meta 字，DOD 位打包）+ 模块内零记录穿透（计数内联）。归属 primary/backend realizer，与 W1 typed-ir residual 同族。
2. **仿真抓出真 bug：ACK 集合重建越界**（同产）——满 64 range 再插入时先写 `outStart[64]` 后逐出 → OS trap（表现为 silent SIGTRAP）。修复=逐出先行；burst 场景从此复绿。配套把 `QuicMaxLostPerRound` 64→4096（单轮批量丢包声明 >64 时驱动重排队越界的同类问题，先修）。
3. **驱动侧丢包率真 bug**：xorshift 负值 × int64 保号 `%` → 负余数恒判「丢」，实际丢包率≈50%。修为 `QuicLshr64(v,1) % 100`。
4. **RFC 校准两处**：§7.3.1 CA 增量按确认包数计（`packets × mss²/cwnd`，批量确认下一帧一增量曾欠 10×）；§7.3.2 减窗每 RTT 一次节流 + §7.5 PTO 探针不受拥塞窗阻断。二者由 1%/5% 场景吞吐从 32KB/s（塌缩爬行）恢复至 Mathis 公式区间（1.85MB/s / 389KB/s）实证。

## 驱动判活与纪律
- 当代 repo 根 `./cheng`：金丝雀 bake 两次均 SIGILL（Illegal instruction: 4），按任务纪律重试一次仍死 → 冻结 `artifacts/bootstrap/cheng.stage3`（05af823e…）全轮判据；stage3 金丝雀×2（`ac_two_line_canary` + `ordinary_zero_exit_fixture`）bake=0/run=0。
- 编译一律经 `tools/cheng_scratch_scope.sh`（每轮换 `--out` 名）；无 heredoc 落盘脚本、无裸 /tmp、无 stash/checkout/reset、未 commit；探针/调试副本已清理。

## 如实边界（本片不含）
ECN（ECN 计数恒 0、无 CE 反应）、逐包重排深度跟踪（完整 §6.1.2 RACK 形，本片为附录 A 简化 RACK：pn 窗 + 时间阈值）、cubic/BBR、pacing、真实 ack_delay 折算（对端立即确认，采样=真 RTT）、spurious 重传的拥塞窗回补（DOO/SACK 反馈）、多包 PN 空间与加密层时序（W3b）。W3b 落地后以同一事件接口（`QuicOnPacketSent/QuicOnAckFrame/QuicOnTimeout + QuicLossNextTimer/QuicLossTakeProbes + nowUs`）接真包事件，netem 注入对拍归 M3 收敛段。
