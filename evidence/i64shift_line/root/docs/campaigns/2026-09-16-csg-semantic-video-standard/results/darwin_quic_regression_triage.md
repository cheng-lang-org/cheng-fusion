# darwin_quic_regression_triage.md — darwin 目标 QUIC 闭包回归只读归因（2026-09-20）

判词：**最小肇事集 = 提交 `27c56dceb`（09-18 14:51，"TCP buffer tuning + WS shift6"）在
`src/quic/native_runtime.cheng` 的唯一闭包 hunk——`msquicNativePumpCodeUnlocked` 泵门
改写（旧行 4949-4952 active/closed 门 → 新行 4949-4956 datapath 存在性门，F-H5）**。
该单 hunk 同时承载两症：serve 角色零受理（A）与 fetch 角色 negotiate_ack_4（B），
单 hunk 反演（其余 HEAD 原样）双角色全愈。主树零改动，无 commit。

## 1. 基线复现回执（判据=主线程 poll 静止 + 零受理）

现树 HEAD=757d6ab05 现烤（08-31 冻结 `artifacts/bootstrap/cheng.stage3`，
`--emit:exe --target:arm64-apple-darwin`，金丝雀 2/2 先行 rc=0）：

| 件 | SHA-256 | 大小 |
| --- | --- | --- |
| serve_mac（src/tools/ssm1_moq_serve.cheng，闭包 49,531 行 7.9s） | `505e0b1ab2140e9ca2e42624a3c914ee460e20df5c79bce4e550e4b42801235c` | 18,133,584B |
| fetch_mac（ssm1_moq_fetch.cheng） | `e47ce0e9cb85f90621a1567613816874e1fac1077b7029bb88bd32eefd39ed83` | 18,179,392B |

环回 127.0.0.1:4700（载荷 huguangsheng.ssm1 `c11e2997…` 2,955,365B）：两次拨号
`FAIL negotiate_ack_slot_4`，serve 日志零 conn（零受理回执）；`sample` 3s：主线程
2585 样本中 2523 恒在 `cheng_mobile_udp_fd_wait_readable → cheng_host_poll → poll()`
——与安卓消费端现场（android_consumer_playback.md §1）逐签名一致。

## 2. 差分归因（shadow root 二分，全 src 提交快照，主树零改动）

方法：`.scratch/darwin_quic_triage/shadow`（git archive 整 src + `.git` 软链 +
包身份文件），逐提交物化 src 后烤 serve+fetch 对打环回（脚本 bake_state.sh /
run_pair.sh 在案）。窗口 = 25acbbbe8..HEAD 内触闭包目录的 43 提交，单调二分：

| 状态 | 提交 | 配对结果 |
| --- | --- | --- |
| G 基点 | `905f359a7`（b5c020f33^） | **绿**：fetch ok ×2、sha256-match、conn=1/2 served=2/4 |
| #11 | `47d0412a3`（09-18 04:06 std/net RSS） | 绿 |
| #17 | `9bd864042`（09-18 11:38） | 绿 |
| #19 | `eba7adc41`（09-18 13:39 send 链去 cur 化） | **绿** |
| #20 | `27c56dceb`（09-18 14:51） | **红（首坏）**：FAIL negotiate_ack_slot_4 ×2 |
| #21 | `2c29fe556` | 红 |
| #22 | `aab247694`（mux 连接复用） | 红 |
| HEAD | `757d6ab05` | 红（=§1 基线） |

**优先级组全部白**：PSK resume（b5c020f33）/PSK 修复（29b959179）/dual-role 锁
（37b873055）/send 链（eba7adc41，#19 绿）全绿；3f79b522f 的 190+ 处初始化清除与
provider roots 归位不在肇事链（s19→s20 之间只有 27c56dceb，其红与初始化清除无关；
后继全红保持单调）。

### 2.1 分侧定谳（杂交对拍）

- serve@s20/s21/s22/HEAD × fetch@G：**全红 conn=0** —— 服务角色自 s20 起零受理。
- serve@G × fetch@s20/HEAD：全红，FAIL negotiate_ack_4（transport 握手已过、
  negotiate 流交换断）——客户端角色同提交起坏。
- serve@G × fetch@HEAD 深拍：server `conn=1 ERR manifest_write` 后客户端
  `FAIL negotiate_ack_4` —— 客户端侧走到 manifest 段仍不收敛。

### 2.2 单 hunk 反演实锤（R1 变体）

shadow@HEAD 仅把泵门 hunk 换回旧形（两处 `if` 原样，python 精确单点替换），
其余 HEAD 原样，烤 R1 双件：

- serve_R1 × fetch@G：**绿**（fetch ok，conn=1 served=2）
- fetch_R1 × serve@G：**绿**
- R1 全对：**2/2 绿**（FETCH_RC=0/0，conn=1/2，sha256-match 双验）

⇒ 该 hunk 是两角色致坏的充分因，也是最小反演面。

## 3. 根因机制（探针实证层）

HEAD shadow 泵门加打印（`pumpgate c=<client> l=<listener>`）+ 开 debug 重烤，
一通拨号的时序原文（serve_probe.log）：

1. 泵门**开**：`pumpgate c=0 l=1` 恒（l=ListenerDatapathId=1，非短路、非未初始化，
   初始化清除/编译器误读假设排除）。
2. accept 判定路径收 Initial（`accept recv len=169` → `init server enter…done`）→
   server 发 32B + **722B handshake flight**。
3. 客户端（已知好件 fetch@G）**重发同一 169B Initial**（=从未接受该 flight）；
   server `retransmit=handshake ×3`。
4. 泵路径在 accept 切片间隙 `recv direct code=27/61` 并行消费后续包、
   `data_frame stream=4 len=45`（negotiate 数据到达 transport 层被缓冲），
   但 app 层 accept 永不完成 → conn=0、客户端 scan_exhausted。

**机制一句**：F-H5 把泵门从 `cur 槽 active/closed` 改为 `datapath 存在性` 后，
darwin `ssm1_moq_serve` 形态（AcceptGlobalTimed 自带 recv 判定环 + 切片间隙
`pump(1)`）的泵从「恒关」变「恒开」，泵路径与 accept 判定路径两条消费者交织推进
同一 server 会话，握手不收敛（server flight 反复重传、accept 永不就绪）→ 跨机零
受理；旧门在 serve-only 预 accept 期恒关恰好隔离两条路径。F-H5 要救的 ohos
PUBLISH 形态是泵驱动单路径（无 accept recv 环），无此竞争，故 ohos 真机 3/3 绿而
darwin 中招——同一 hunk 的形态分叉，不是 ohos 修复本身错了。客户端角色 B 同族：
fetch 扫描泵同样提前参与会话推进，单 hunk 反演即愈。

**如实边界**：字节级最后一步（722B flight 为何不被好客户端确认）未逐字节解码；
探针证据链收口在「双路径交织 + 重传×3 + accept 不就绪」。置信度：肇事集=确定
（双向杂交 + 单 hunk 反演双绿）；机制=高（运行时探针时序在案，非纯静态推断）。

## 4. 附带线索定谳：fetch_file_probe darwin exe 链接失败 = 非回归

`ssm1q_fetch_file_probe.cheng` 生于 `3f79b522f` 本身（git log --diff-filter=A 实证，
无更早版本可反演）。其 darwin exe 链接失败原文（ffp_head.link.log）：

```
Undefined symbols for architecture arm64:
  "_cheng_qprobe_tick", referenced from: _cheng_cold_b3fe1224_4428 in ffp_head.primary.o
ld: symbol(s) not found for architecture arm64
```

`cheng_qprobe_tick` 等 `@importc` 桥（另见 ssm1q_client_probe.cheng:89、
ssm1q_loopback_export.cheng:89）全仓无 C 提供者——由鸿蒙宿主 NAPI shim 链接期供
符。三个 qprobe 工具是 ohos 宿主导出面，以 darwin exe 形态烤制属**类别错误**，
非 darwin 回归；ssm1q_client_probe darwin exe 同样 rc=2 同签名（cprobe_head.link.log）。

## 5. 修法建议（主树不落，落不落由主线定）

**候选 1（最小反演，已验证愈 darwin，但有 ohos 回退风险）**：泵门恢复旧形：

```diff
--- a/src/quic/native_runtime.cheng
+++ b/src/quic/native_runtime.cheng
@@ fn msquicNativePumpCodeUnlocked(count: int32): int32 =
-    if msquicNativeSessionClientDatapathId <= 0 && msquicNativeSessionListenerDatapathId <= 0:
-        return msquicNativeProcessOutcomeNone
+    if ! gMsQuicSessions[msquicNativeCurSlot].active:
+        return msquicNativeProcessOutcomeNone
+    if gMsQuicSessions[msquicNativeCurSlot].closed:
+        return msquicNativeProcessOutcomeNone
```

⚠️ 这会把 ohos PUBLISH serve-only 打回 F-H5 前的泵死（该提交正是为此而改），
单独采纳不可取，除非 ohos 形态已改由 accept 环驱动。

**候选 2（分形态所有权，推荐方向，约 6 行 + 一个不变量决定）**：监听 datapath 的
recv 所有权按形态二选一——accept 环驱动形态（darwin ssm1_moq_serve）泵只做
timer/retransmit/flush、不 recv；泵驱动形态（ohos PUBLISH）维持 F-H5 行为。
区分标志需 quic 运行时 lane 定夺（如新 module 级
`msquicNativeServeAcceptDriven: bool` 由工具层 start 前 declaration，或以
`msquicNativeAcceptPending` 语义延伸），示意：

```diff
--- a/src/quic/native_runtime.cheng
+++ b/src/quic/native_runtime.cheng
@@ 泵 listener 分支
-        if msquicNativeSessionListenerDatapathId > 0:
+        # accept 环驱动形态：recv 归 msquicNativeAcceptTimed 独占，泵只推进
+        # timer/flush（darwin 实证：泵 recv 与 accept 判定交织=握手不收敛）。
+        if msquicNativeSessionListenerDatapathId > 0 && ! msquicNativeServeAcceptDriven:
```

落地前置=先钉「Initial 首处理权」不变量并跑 ohos PUBLISH + darwin serve 双形态
回归（4700-4799 环回判据同 §1）。该区是并行 lane 热区，本报告不落任何改动。

## 6. 证据清单

| 面 | 路径（`.scratch/darwin_quic_triage/`） |
| --- | --- |
| 驱动/金丝雀 | artifacts/bootstrap/cheng.stage3；canary2b+canary_ord compile/run rc=0（canary2 首烤 rc=2 系源路径出包根，与驱动无关） |
| 基线红 | serve_head/fetch_head、fetch_head.log(.2)=FAIL negotiate_ack_slot_4、serve_head.log 零 conn、sample_head.txt |
| 二分 | bake_state.sh、run_pair.sh、g_base(绿)/s11/s17/s19(绿)/s20/s21/s22(红)/head 各目录+日志、serve_vs_g_*.log |
| 杂交分侧 | mix1（serve@G+fetch@HEAD）、mix2（serve@HEAD+fetch@G）、serve_vs_gbase 批量回执 |
| 反演 R1 | shadow（HEAD src + 单 hunk 替换脚本在案）、r1/serve+fetch、serve_r1_vs_g.log、r1_pair 全绿日志 |
| 探针 | shadow=HEAD+打印版、serve_probe、serve_probe.log（pumpgate/accept recv/722B/重传×3 时序） |
| 链接失败 | ffp_head.link.log（_cheng_qprobe_tick undefined）、cprobe_head.link.log、ffp_pre.bake.log（3f79b522f^ 无此文件实证） |

现场纪律：端口仅用 4700-4721；测试实例全部即杀（pgrep 复核零残留）；主树 src/
零触碰、无 stash/checkout/reset、无 worktree/clone、无 commit；shadow 全在
.scratch 任务目录。
