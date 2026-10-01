# W5 补完：互操作参照台收尾

结论先行：**五项补完判据全绿**——全量自检四 case 全 PASS（`compare.py` exit 0，38 check / 0 fail / 1 显式 SKIP）；openssl 参照连通补完轮复测 rc=0；quicdiff「msquic vs msquic」恒等自检 PASS + 篡改负例必抓（exit 1）；VPN 态本轮复验与初采同态（tun0 UP）→ 按纪律沿用库内 msquic 存档不重采；pure 第三列接入位已落 README 且与 W6 审计 §4 逐条对上。本轮零 `src/` 改动，harness/ 独占，未 commit。

## 1. selfcheck 闭环（遗留项核销）

前轮（13:46-13:51 挂死前）已把 openssl 腿复跑、compare.py 补 quicdiff/quicref/恒等 case、README 落第三列；本轮对全部遗留项做了**当轮新鲜复测**：

- openssl 参照连通：`openssl_ref.sh up → probe → down` rc=0，回执关键行 `Protocol version: TLSv1.3` / `Ciphersuite: TLS_AES_128_GCM_SHA256` / `Verification: OK` / `Verify return code: 0 (ok)`，`-www` 状态页 200 且自报启动参数含 `-ciphersuites TLS_AES_128_GCM_SHA256`（原文 `artifacts/openssl_ref/probe_receipt.txt`）。
- 全量自检：`python3 compare.py artifacts artifacts/selfcheck.json` exit 0，人读回执 `artifacts/selfcheck_w5final_stdout.txt`。四 case：openssl_ref PASS(12 check) / msquic_layer2 PASS(14) / msquic_dorpub PASS(8, 1 SKIP=besteffort_pcap，显式不计 PASS) / quic_frames_identity PASS(4)。
- openssl case 的 pcap 仍为 12:18 root daemon 初采件（本轮未弹管理员框重抓）：回执检查与线上格式检查是同配置（同证书 12:18、套件钉死）两次会话的独立证据，窗口已如实标注于 §4。

## 2. compare.py 判定完备化（QUIC 包保护线，W3b 契约）

- `quicref`：pcap → 头级帧序列（保护前可读字段 kind/dir/version/dcid/scid/payload_len，idx=pcap 包序号，无密钥面）。本轮从 layer2_en0.pcap 重抽：2137 包。
- `quicdiff`：候选解密帧序列 JSON vs msquic 参照 → 按 idx 对齐、FRAME_DIFF_FIELDS + frames[] 逐元素逐键出 pass/fail，mismatch 逐条带 ref/cand 值；exit 0=PASS / 1=FAIL。
- **恒等自检（必过线）**：`artifacts/quicdiff_identity_msquic_vs_msquic.json` — msquic 存档 vs 自身 fields=12822 mismatches=0，exit 0 PASS。
- **篡改负例（引擎非恒过）**：`artifacts/quicdiff_tamper_negative.json` — 篡改 packets[idx=0].kind 后精确抓到 1 处分歧，exit 1。
- W3b 出解密轨迹后一键对拍：`python3 compare.py quicdiff <pure_frames.json> artifacts/msquic_layer2/quic_frames_msquic_ref.json <out>.json`。

## 3. 三方位表（pure 第三列接入位）

README「pure 后端接入方式」节已落，本轮核对与 `results/purept_w6_audit.md` §4 逐条一致：

- 驱动级 hook 点：① 注册口 `initQuicTransportWithBackend`/`setQuicTransportBackend`/`quicTransportBackend`；② 三分派旁路（dial.cheng 注册序 / switch.cheng `listenKindForAddress` 优先序 / host_quic 直用点）——只切适配器切不动流量，M4 必改；③ 数据面 `connection.cheng` 的 `msquicNativeIsPipeIdx` token 门扩双后端分派，pure 后端自签 token 区间。
- 工件命名规约：`artifacts/pure_tls|pure_layer2|pure_dorpub/`，与 msquic 列逐一同形；帧序列 `quic_frames_<腿>_<后端>.json`。
- M1/M2 一键判据已实测走通（本轮即按 README 命令序列执行）：M1=`openssl_ref.sh up` → 探针 → `compare.py`；M2=`quicref`+`quicdiff` 两条命令。

## 4. VPN 态与采集窗口（如实标注）

- 本轮复验（14:00:34，`artifacts/vpn_state_w5final.txt`）：安卓 **tun0 UP**（VPN-DNS 应用在机）但 VpnNetworkProvider 活动计数=0、到 Mac(192.168.1.8) 路由 `dev wlan0 table 1022` 直连不进隧道、Mac 无 VPN 服务——与 12:29（初采）、13:50（W5c 复验）**三次同态**。
- 判定：按任务纪律 tun0 开着 → **沿用库内 msquic 存档不重采**；且鸿蒙 hdc list targets=[Empty] 离线，dor_pub 重采客观不可行（不硬跑）。
- 采集窗口标注：layer2 pcap+双侧日志=当日 12:27-12:29（现役 layer2_cross.sh 两轮 2/2）；dorpub 存档=当日 07:00:06 现役 v2r1 历史轮（PROVENANCE.txt，双回执等价判定）；openssl pcap=12:18 初采、回执=14:00 本轮复测、13:46 W5c 轮回执存底=`probe_receipt_w5_capture.txt`。

## 5. 判据核销清单

| 判据 | 结果 |
|---|---|
| compare.py 对两类在案工件（pcap/hilog）出判定 JSON 无崩溃 | exit 0，四 case JSON 落 `artifacts/selfcheck.json` |
| 恒等自检 PASS | `quicdiff_identity_msquic_vs_msquic.json` fields=12822 mismatches=0 |
| 篡改负例必抓 | `quicdiff_tamper_negative.json` mismatch=1，exit 1 |
| openssl 参照连通 + 回执原文 | probe rc=0，原文在 `openssl_ref/probe_receipt.txt` |
| 跨机采集 VPN 先核后动 | tun0 UP 三次同态 → 沿用存档；取证 `vpn_state_w5final.txt` |

## 遗留（不阻塞本役）

- 鸿蒙回线后：`sh capture_session.sh leg-dorpub <round> 150` 重采替换历史存档（含 best-effort pcap，消掉唯一 SKIP）。
- W2/M1 起跑即用：`openssl_ref.sh up` → pure TLS 引擎探针 → `compare.py` 出判定（README 一键判据）。
- W3b 起跑即用：解密轨迹按 compare.py 头注契约产 frames JSON → `quicdiff` 对 msquic 参照。
