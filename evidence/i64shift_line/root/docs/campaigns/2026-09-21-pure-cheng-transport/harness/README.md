# W5 互操作参照台（three-way interop harness）

三方对拍台：**pure（待接入） vs msquic（标准答案） vs openssl（TLS 参照）**。M1/M2 的所有"互通"判据都由本台出证：M1 与 `openssl s_client/s_server` 对拍，M2 与 msquic 桥抓包字节对拍。本目录是测试资产，不碰 `src/` 协议代码。

## 目录

```
harness/
  capture_session.sh     采集驱动（用户态；daemon-start/leg-openssl/leg-layer2/leg-dorpub）
  root_capture_daemon.sh root 面守护（osascript 授权拉起，只执行 tcpdump）
  openssl_ref.sh         openssl 参照端（gen/up/probe/down/status）
  compare.py             对拍器（pcap+日志 → 结构化判定 JSON）
  artifacts/
    openssl_ref/         自签证书 + probe_lo0.pcap + probe_receipt.txt + server_serve.log
    msquic_layer2/       layer2_en0.pcap + serve/fetch 双侧日志 + layer2_cross.run.log
    msquic_dorpub/       鸿蒙 hilog + 安卓 fetch 断言 + PROVENANCE.txt
    selfcheck.json       三 case 全量自检判定
    vpn_state_*.txt      双端 VPN 态取证（每腿一份）
  .capture_spool/        抓包请求 spool（会话级，跑完即删，不入库）
```

## 三方对拍的判据形态

| 维度 | openssl 参照（M1 用） | msquic layer2（M2 用） | msquic dor_pub（M2 用） | pure 接入后（第三列） |
|---|---|---|---|---|
| 握手字段 | pcap: ClientHello offered 0x1301 + supported_versions 0x0304；ServerHello selected 0x1301 | pcap: QUIC v1 Initial/Handshake 包两向飞行、无 VN（version 直连 1）、首 dcid | 端侧回执：T_PUBLISH listening + T_SERVE resp=OK | 同左形态：pure 后端跑同一对拍器，字段从 pure 侧 pcap/日志出 |
| stream 字节 | 回执 200 OK + appdata 双向记录 | `fetch ok` sha256-match=1eb20a17… + WRITE_OK bytes=582340 written=582340 + 双侧 sha | fetch 断言行逐字（chunks=45/4625B/65572B + sha256-match=be20ab8e…） | 同一断言逐字复用，仅换执行端 |
| 时延 | 握手窗内 pcap 时间戳 | fetch timeline（dial/ready→first-frame）+ pcap Initial→Handshake→1-RTT | driver wall ms | 同窗相对比较口径（沿用内存门纪律） |

对拍口径：每条 check 必须落到真实工件；工件缺失即 FAIL；缺席的可选件显式 SKIP（不冒充 PASS）；无任何估计/兜底值。

## 工件命名

- pcap：`<腿>_<iface>.pcap`（classic pcap，libpcap LE usec；对拍器也兼容 BE/nanos）。
- 端侧日志：保留现役脚本原名（`l2_serve_rN.log`、`dor_pub_<R>_fetch.txt`、`dor_pub_<R>.hilog.stream`）。
- 历史轮存档必须带 `PROVENANCE.txt`（来源/时间/缺项/待补项），对拍器会把 round_verdict 降级为"双回执等价判定"。
- vpn 取证：`vpn_state_<leg>.txt`。

## 复现（全流程）

```sh
cd docs/campaigns/2026-09-21-pure-cheng-transport/harness
sh capture_session.sh daemon-start     # 弹一次 macOS 管理员密码框，拉起 root tcpdump 守护
sh capture_session.sh leg-openssl 30   # openssl 参照腿
sh capture_session.sh leg-layer2 120   # msquic Mac serve → 安卓 fetch（现役 layer2_cross.sh，2 轮）
sh capture_session.sh leg-dorpub w5 150  # 鸿蒙 PUBLISH → 安卓 fetch（现役 dor_pub_round.sh）
sh capture_session.sh daemon-stop      # 收尾守护
rm -rf .capture_spool
python3 compare.py artifacts artifacts/selfcheck.json   # 全量自检，exit 0 = 全 PASS
```

依赖：`/opt/homebrew/opt/openssl@3`（TLS1.3 套件全）、`/usr/sbin/tcpdump`（root）、
`adb`（GBJ0222B24021692，`/data/local/tmp/q2_fetch_h|q2_fetch_new`）、
`hdc`（3KN0224C18003262，unimaker PUBLISH）、现役脚本
`.scratch/darwin_quic_fix/layer2_cross.sh`、`.scratch/darwin_ohos_reg/rounds/dor_pub_round.sh`（.scratch 不入库，重采前先确认其在）。

## 入库注意

`.gitignore` 命中本台的规则：`*.sh`（L327）、`*.py`（L77）、`artifacts/`（L15，整目录）、`*.txt`（L16）。入库需显式：

```sh
git add -f docs/campaigns/2026-09-21-pure-cheng-transport/harness/*.sh \
           docs/campaigns/2026-09-21-pure-cheng-transport/harness/compare.py \
           docs/campaigns/2026-09-21-pure-cheng-transport/harness/artifacts
```

README.md、results/、progress.md 不受忽略规则影响，普通 add 即可。`artifacts/openssl_ref/server.{pem,key}` 是一次性自签测试证书（仅 lo0 参照端用），随档入库无风险。本次只建资产，未 commit。

## 运维备忘（本轮实测踩坑，防复发）

1. **macOS tcpdump -w 对 SIGTERM 不退**：空闲 lo0 上 libpcap poll() 自动重启，TERM 标志不生效。req 模板用 SIGKILL 看门狗（`-U` 逐包落盘，KILL 不损文件）。
2. **osascript 环境禁 nohup**：`do shell script ... &` 里 nohup 报 "can't detach from console"；全输出重定向文件后 `&` 即脱离。
3. **守护死锁恢复**：req 卡住时守护被同步执行阻塞，看不到新 req/STOP；`osascript` 一次授权 `kill -9 <daemon> <req> <tcpdump>` 后重启守护。
4. **wait_file 墙钟口径**：超时用 epoch 差，不数迭代（0.5s sleep 迭代≈半速，曾差几秒误报超时）。
5. **hdc list targets 输出带 `\r`**：字符串比较先 `tr -d '\r'`，否则 "[Empty]" 比较恒真/假翻转。
6. 现役配方修正：layer2_cross.sh 的 `grep "WRITE_OK 582340"` 对现客户端输出（`WRITE_OK path=… bytes=582340 written=582340`）失配，已改为 `WRITE_OK .*bytes=582340 written=582340`（对齐其判据头注）。

## pure 后端接入方式（第三列怎么插）

1. pure 后端编译出与 `q2_fetch_h`/`serve_mac` 同接口的 serve/fetch 驱动后，在 `artifacts/` 增设 `pure_layer2/`、`pure_dorpub/`（命名同 msquic 列）。
2. 采集复用同两条腿：`capture_session.sh` 增 `leg-pure-layer2`/`leg-pure-dorpub`（只换 SERVE/FETCH 二进制路径与端口段，tcpdump 过滤器同步换端口）。
3. `compare.py` 增 `case_pure_*`：check 集与 msquic 列逐条同形（握手字段/stream 字节/时延），判定 JSON 三列并列，逐条 check 可横向 diff——分歧项按 plan §3 仲裁序（RFC 条文 → openssl 侧）处理。
4. M1 阶段先接 `pure_tls/`：pure TLS1.3 引擎对 `openssl_ref` 参照端互通，对拍器复用 openssl case 的 pcap 检查（ClientHello/ServerHello 字段）+ 双 Cheng 端互通 case。
