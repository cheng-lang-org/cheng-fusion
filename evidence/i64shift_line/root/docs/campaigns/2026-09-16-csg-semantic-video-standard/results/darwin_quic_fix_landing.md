# darwin_quic_fix_landing.md — darwin QUIC 零受理回归修复落地 + 四层验证（2026-09-20）

判词：**层 1 绿 ×2 轮、层 2 绿 ×2 轮、层 3 待回归（设备离线 + HAP 冻结件不可重建，精确缺口见 §4）、层 4 护轨全履**。
修复 = `src/quic/native_runtime.cheng` 泵 recv 所有权分形态 gate（候选 2 落地修订，主树未 commit，
diff 留档 `.scratch/darwin_quic_fix/fix_landing.diff`，+47/-20）。

## 1. 修复内容（单文件 src/quic/native_runtime.cheng）

归因修正（对 triage §3 机制的一处修订）：RAW 探针实证（§3）**accept 判定环正常完成受理**
（`accept_return=proc`），失败点在受理后的 negotiate 阶段——`AppRecvAvailable` 是全局
(side,stream) 键（`native_runtime.cheng` 1428），而扫描循环按 bind k 构造读端
（`ConnFromPipeIdx(1000001+k)`）。F-H5 泵门（数据面存在性）使泵在**任意 bind** 上 recv：
数据恒落 owner 槽（泵内重绑 cur=owner），avail 即刻置位，扫描却返回**当下 bind 的 k**
→ 读端错槽 → serve 端 negotiate 静默死（serve 工具对 ServeAcceptStream 失败零打印，故
日志恒"零 conn"）→ 客户端 `FAIL negotiate_ack_slot_N`。数据到达落在哪个 bind 纯属时序
彩票（同源码 R1 形态靠旧门只在 owner bind recv 而必然 ks 真实）。旧门（候选 1）救扫描
但饿死 ohos serve-only 入站首包（F-H5 初衷），两难。

落地规则（门判定先于 cur=owner 重绑，否则恒真被架空——首个探针版即栽在此）：

- **listener 分支**：`serverSlot = SlotByListenerDatapath(…)`；`listenerRecvAllowed =
  (serverSlot < 0) || (cur == serverSlot)`。会话在册时 recv 只准发生在 owner 槽自身的
  bind 上（ks 恒真）；会话未在册（serve-only 入站首个 Initial）维持 F-H5 泵可 recv。
- **client 分支**：同型，`clientRecvAllowed = (clientSlot >= 0) && (cur == clientSlot)`。
- **timer/flush（重传/冲刷）不收缩**：两分支恒以 owner 槽重绑后执行（ohos 需要的
  F-H5 救援通道保留）。
- **dial 泵环**（`msquicNativeDialPumpReadyCode`，本文件内）：每轮 pump 后重钉
  `cur = dialSlot`，消解 dual-role listener 分支重绑引发的 client 半环 drift（拨号
  半环是这些泵调用的所有者，重钉后 client gate 恒过，拨号握手不受影响）。

## 2. 验证判据与回执

层 0 差分定谳（探针，`.scratch/darwin_quic_fix/`）：
- HEAD 对照组（现烤 head_ctl，4700）：`FAIL negotiate_ack_slot_4` ×2，serve 零 conn（基线钉住）。
- 隔离矩阵（同 g_base/fetch 好客户端）：head 红 / r1（单 hunk 反演）绿复现 / 我的首版
  ready-state gate 红 → 排除 accept 相位、钉死 negotiate 相位。
- RAW 探针（r1src/fixsrc 双树同插）：R1 绿轨迹 `RAWSCAN k=0 avail=45`（真）；fix 红轨迹
  `k=3/6 avail=45`（错槽）+ `RAWRECYCLE cur=0`；修正 gate 后 `k=0 avail=45` ×4（真）。

层 1 Mac 环回（`layer1_formal.sh`，4701，载荷 huguangsheng.ssm1 c11e2997… 2,955,365B）：
- 金丝雀 2/2：`ac_two_line_canary` bake=0 run=0；`ordinary_zero_exit_fixture` bake=0 run=0。
- 现烤：serve_mac f696a6be… 18,133,584B；fetch_mac e5fc92d3… 18,179,392B。
- R1/R2 双轮：`conn=1 served=2` ×2；`fetch ok chunks=45 kfChunk=0 manifest=4625B
  chunk=65572B sha256-match=be20ab8e…` ×2，FETCH_RC=0/0。

层 2 真机跨机（`layer2_cross.sh`，Mac 192.168.1.8 serve 4801/4802 → 安卓
GBJ0222B24021692 `q2_fetch_h` WLAN 真网，载荷封套 ac_env_r.ssm1 c55de971… 582,457B）：
- R1：attempts=1，`fetch ok chunks=1 kfChunk=0 manifest=117B chunk=582340B
  sha256-match=1eb20a17…`，`WRITE_OK … bytes=582340 written=582340`，机上
  sha256sum==1eb20a17 ✓，Mac 拉回 sha256==1eb20a17 ✓，字节数 582,340 ✓，fetch_rc=0。
- R2：同上全对，attempts=1，fetch_rc=0。轮间 sleep 3s。
- 温度护栏：两轮轮前 `dumpsys battery` temperature=410（41.0°C ≤ 43°C）。

层 3 鸿蒙 PUBLISH 回归：**待回归**（缺口见 §4）。

层 4 护轨：真机轮前温度检查（安卓 410×2）；串行 + 轮间 sleep 3s；Mac 侧 serve 实例
轮末即杀（pgrep 复核零残留）；安卓机上临时件 `l2_r{1,2}_container.ssm2` 已清；
4443 现场零接触（我的实例全在 4701/4801/4802 与 4700-4726 环回）；主树只改
`src/quic/native_runtime.cheng`（git status src/ 单文件 M），无 stash/checkout/reset，
无 commit。

## 3. 证据清单（`.scratch/darwin_quic_fix/`）

| 面 | 文件 |
| --- | --- |
| diff/指纹 | fix_landing.diff（96 行）、pre_edit_native_runtime.sha256、pre_edit_diff.txt |
| 层 1 | layer1_formal.sh、fixed/{serve,fetch}.bake.log、fixed/sha256.txt、serve_l1_r{1,2}.log、fetch_l1_r{1,2}.log、canary_*.log |
| HEAD 对照 | layer1_loopback.sh、serve_head_ctl.log、fetch_head_ctl.log(.2)（FAIL negotiate_ack_slot_4 ×2） |
| 隔离/探针 | isolate_serve.sh、iso_{serve,fetch}_*.log、r1src/fixsrc/（RAW 插桩源）、fx5b.log（gate 生效轨迹）、r12.log（R1 绿轨迹）、tp.log（HEAD 时序：accept_return=proc 证实受理完成） |
| 层 2 | layer2_cross.sh、l2_serve_r{1,2}.log、l2_fetch_r{1,2}.txt、l2_r{1,2}_container.ssm2（拉回件） |
| 层 3 | hdc 离线记录（本文件 §4）；无设备侧证据 |

## 4. 如实边界 / 遗留

1. **层 3 精确缺口（两重）**：①鸿蒙 3KN0224C18003262 离线——`hdc list targets`=[Empty]
   （`hdc kill -r` 重启 ×2 无效），PUBLISH runbook 无法起步；②即便在机，装机件
   1000069 为 F-H5 代冻结 .so，不含本修复——本修复的 ohos 侧回归实质 = **下次 ohos
   闭包重建+装机的固定项**：需重验 ①PUBLISH 跨机 serve（§18.6 判据：安卓 q2_fetch →
   fetch ok + sha256-match=be20ab8e + T_SERVE hilog）；②dual-role loop-head 泵形态
   （QWaitReadable q_listening 分支：loop-head 单泵 cur=遗留槽，本规则下 recv 会被
   skip——自连回环首 spin 即命中 owner 槽故 §18.8 形态预计无恙；跨机轮数据晚到场景
   有饿死暴露面）。根治 = 工具面迁移 F-J 处方的 `AppRecvAvailableAt(sessionSlot,…)`
   + 按 owner 槽返回 ks（`ssm1q_loopback_export.cheng` / `ssm1_moq_{serve,fetch}.cheng`
   工具文件，本轮按简报禁改未动）。
2. **客户端分支同规则已落**（fetch 侧 scan 同病：层 1 首版只落 listener 时 fetch 报
   `FAIL negotiate_ack_4/8` 错槽读端失败，client 分支同型 gate 后双轮绿）。HAP
   dual-session 拨号环的 drift 已由 dial 泵环每轮重钉 cur=dialSlot 清偿（本文件内）。
3. triage §3 的机制表述修订：accept 并非"永不就绪"（探针实证 `accept_return=proc`），
   真死因是受理后扫描 ks 错槽；本报告 §1 已改写，triage 原文不改（历史档案）。
4. 端口 4443（安卓 pid 11370 保护）零接触；清理时实测该 pid 已不存在（`ps -p 11370`
   空，非本轮所为——本轮安卓侧仅 q2_fetch_h 拉取与临时件清理）。
