# W5 互操作参照台（pure vs msquic vs openssl 三方对拍台）

结论先行：**台已建成，三 case 自检全 PASS（`compare.py` exit 0，TOTAL: PASS）**。M1/M2 的"互通"判据从此由本台出证：M1 对 openssl 参照端、M2 对 msquic 抓包字节+端侧回执；pure 接入即加第三列（方式见 harness/README.md）。本轮不碰 `src/` 协议代码。

## 三件套路径

- 脚本+对拍器：`docs/campaigns/2026-09-21-pure-cheng-transport/harness/`（capture_session.sh / root_capture_daemon.sh / openssl_ref.sh / compare.py / README.md；`*.sh` 被 .gitignore L327 全局忽略，入库 `git add -f harness/*.sh`，本次未 commit）
- 标准答案存档：`harness/artifacts/`（msquic_layer2 1.3M / msquic_dorpub 16K / openssl_ref 36K / selfcheck.json / vpn_state_*.txt）
- 判定 JSON：`harness/artifacts/selfcheck.json`

## 自检摘要（compare.py artifacts artifacts/selfcheck.json）

- **openssl_ref: PASS**（11 check）——回执原文关键行：`Protocol version: TLSv1.3` / `Ciphersuite: TLS_AES_128_GCM_SHA256` / `Verification: OK`（全文 `artifacts/openssl_ref/probe_receipt.txt`）；pcap 26 包：ClientHello offered 0x1301+supported_versions 0x0304，ServerHello selected 0x1301，appdata 双向（client=3/server=8）。
- **msquic_layer2: PASS**（14 check）——现役 layer2_cross.sh 两轮 2/2 全过（fetch_rc=0、fetch_assert、write_ok、devsha、macsha、bytes=582340）；pcap 2137 包：QUIC v1 Initial client=6/server=2（首 dcid 前缀 0000000022222232）、Handshake 两向飞行、1-RTT 1056/1059、零 VN；时延：dial=1484ms、chunk residual=884ms、pcap Initial→Handshake=462.8ms。
- **msquic_dorpub: PASS + 1 SKIP**——本轮新采失败（鸿蒙 12:30 掉线，hdc [Empty] 轮询 3 分钟未回）；按 PROVENANCE.txt 以**当日 07:00 现役 v2r1 轮**存档：T_PUBLISH resp=OK listening（chunks=45/4625B/65572B）+ T_SERVE conn=12 resp=OK + 安卓 fetch 断言行逐字（sha256-match=be20ab8e…）+ hilog 流 3748B；无 run.log（后加的判决件），对拍器以双回执等价判定并在 JSON 显式标注。SKIP=best-effort pcap（Mac 不在该腿数据路径，Wi-Fi 受管模式收不到从站单播），设备回线后重采替换。

## VPN 态（如实）

安卓 **tun0 UP**（VPN-DNS 应用在机，10.111.0.2/32）。按任务纪律，跨机两腿（layer2、dorpub）**标污染待重采**；旁证在案（`artifacts/vpn_state_*.txt`）：到 192.168.1.8 路由 `dev wlan0 table 1022` 直连不进隧道、系统层 `VpnNetworkProvider:[1-9]` 计数=0、Mac 无 VPN 服务。是否豁免由你定；重采窗口随时可跑（一条 `leg-layer2` 即刷新）。

## 本轮踩坑与修正（防复发，详见 harness/README.md 运维备忘）

1. macOS tcpdump -w 空闲接口收 SIGTERM 不退（libpcap poll 重启）→ req 模板改 SIGKILL 看门狗（-U 逐包落盘，文件无损）。
2. osascript `do shell script` 环境禁 nohup（can't detach from console）→ 重定向文件 + `&`。
3. 守护同步执行 req 卡死会锁死 spool → 一次授权 kill 三 pid 后重启（已实录恢复路径）。
4. wait_file 超时误把迭代数当秒数（0.5s sleep 实际半速）→ 改 epoch 墙钟。
5. 现役配方一行修正：layer2_cross.sh `WRITE_OK 582340` grep 对现客户端 `WRITE_OK path=… bytes=…` 失配，已改 `WRITE_OK .*bytes=582340 written=582340`（对齐其判据头注）。

## 待办

- 鸿蒙回线后：`sh capture_session.sh leg-dorpub w6 150` 重采替换 hist 存档（含 best-effort pcap），PROVENANCE 归档为历史注记。
- W2/M1 开工即用：`openssl_ref.sh up` 起参照端，pure TLS 引擎互通后按 README"pure 接入方式"插第三列。
