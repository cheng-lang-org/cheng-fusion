# android_consumer_playback.md — 安卓消费端半环：fetch→机上解封→机上播放至 EOF（2026-09-20）

判词：**绿（MVP 判据 2/2 轮全过）**。安卓真机（DCO-AL00 / GBJ0222B24021692，
Android 12）成为 SSM2 容器消费端：机上 fetch 容器（sha256==cid==`1eb20a17…`）
→ 机上解封（payload[0] sha==`927b37e6…`）→ 系统播放器（com.huawei.himovie
.local）机上播放提取出的 mp4 → 多时刻彩色互异帧 → 播放器窗口生命周期
≈片长后 EOF 自退。路径级=**①（系统播放器 content://，未走 ②最小 APK）**；
③深度 overlay 不适用（仅 APK 路加分项）。

## 0. 结论数字

| 轮 | serve 实例 | fetch(attempts/wall) | 容器机上=Mac | 解封 rc | payload[0] 播放 | 窗口生命周期 | 彩色互异帧 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | q3_serve 4592（conn=1 served=2） | 1 次 / 1906ms | `1eb20a17…`×2 | 0 | mp4 496,166B `927b37e6…` | 21.4s（14:12:40→14:13:01） | a/b/c 3 帧（MAD 11.2–13.8） |
| R2 | q3_serve 4593（conn=1 served=2） | 1 次 / 1863ms | `1eb20a17…`×2 | 0 | 同上 | ≈21.3s（14:09:44→14:10:05） | a/b/c 3 帧（MAD 11.0–14.4） |

- 容器 = `hgs_ssm2.ssm2` 582,340B（双载荷：mp4 + svblock），封套 =
  SSM1 单 kf `hgs_ssm2.ssm1` 582,457B（`c55de971…`，协议零改动）。
- 判据链（每轮九项全过）：fetch cheng 侧 `sha256-match=1eb20a17…` 断言 +
  `WRITE_OK 582340` + 机上 `sha256sum`==cid + Mac 拉回件 shasum==cid +
  字节数 582,340 + 解封 rc=0 + 双载荷 cidMatch=1/expectedMatch=1
  （payload[1] 另 `svblockValidator=ok`）+ payload_0 机上/Mac sha==`927b37e6…`。
- ffprobe 直测两轮拉回 payload_0：`duration=22.500000`、`size=496166`
  （播放的即该字节，机上 cp 至 /sdcard/Movies/cheng_ac_r{1,2}.mp4 后 MediaStore
  收录 id 1459/1464）。

## 1. 传输+解封形态（任务预案切换记录）

任务优先「真 Mac→安卓」：按 ma_reconnect/F-C 配方现烤 Mac serve
（`cheng.stage3 system-link-exec --in:src/tools/ssm1_moq_serve.cheng
--emit:exe --target:arm64-apple-darwin`，18,133,584B，`c52379da…`；烤前
金丝雀 2/2 rc=0：两行 main + ordinary_zero_exit_fixture）。**该腿红**：
R1 共 6 次拨号全败（`FAIL negotiate_ack_slot_4 lastErr=scan_exhausted
spins=3000 stream=4`，个别 `FAIL dial msquic native: handshake ! ready`），
serve 日志零 conn。差分定谳=**Mac 新烤 serve 本体在 QUIC 面不工作，网络面
无罪**：

- ICMP 双向 0% 丢；裸 UDP 探针（NDK 直编 udp_probe）安卓→Mac 10/10 发收回显全通；
- macOS 防火墙 disabled；netstat UDP delivered 对照窗 +22 vs 拨号窗 +27（≈背景噪声，握手包未见到达）；
- `sample`：serve_mac 主线程恒 `cheng_host_poll→poll()` 0.5% CPU（事件循环活着但从不处理入包）；socket 绑定正常（UDP *:14441）；
- 同期第二个 darwin 症状：`ssm1q_fetch_file_probe.cheng` darwin exe 链接直接失败（Darwin provider direct ld failed rc=1）；
- 溯源：上一个被证过跨机工作的 darwin serve 建于 9/17 12:46；此后 src/quic/
  落了 6+ 提交（b5c020f33 TLS PSK resume、37b873055 dual-role 锁、eba7adc41
  send 链、27c56dceb、3f79b522f provider roots 归位+全闭包 190+ 处默认初始化
  清除等），**darwin 目标的 QUIC 闭包此后从未被任何任务验证过**——按
  3f79b522f 自记「ohos 目标 aarch64 布局彩票，同源码 Android 目标正常——归
  编译器 lane」同型，登记为 **darwin 目标 QUIC 回归，归编译器/运行时战役另案**。

按任务预案切换**安卓自 serve 回环**（q3_serve 新端口 4592/4593，独立实例按轮
起停，fetch 走 WLAN IP 192.168.1.6 真网路径非 127.0.0.1）。回环内瞬态首连
negotiate 失败在案（诊断期每 server 首连 `negotiate_ack_4`、重试即愈，86KB/
582KB 均然），轮脚本带同实例 ≤3 次重试；正式两轮均 1 次即过。

## 2. 播放段（路径①系统播放器）

- 提取字节链：机上解封 `payload_0.bin`（496,166B）→ `cp` 至
  `/sdcard/Movies/cheng_ac_r{R}.mp4`（shell 属主 media_rw）→
  `am broadcast MEDIA_SCANNER_SCAN_FILE` 收录 → MediaStore `_id` 1459/1464 →
  `am start -a android.intent.action.VIEW -d content://media/external/video/
  media/<id> -t video/mp4`。
- 解析播放器 = **com.huawei.himovie.local / hwvplayer.service.player.
  FullscreenActivity**（华为视频），起播窗 t+0~1.2s。
- 仪器：mCurrentFocus 每秒轨迹（play_r{R}_focus.txt）——播放器窗口出现=起播、
  消失=退出；定点截图（+4/+10/+16/+21s）。
- 帧证据（中带 20-80% 区域，PIL 量化）：
  - R1：a/b/c 14,141/14,889/14,359 色（彩色占比 4.14%/3.35%/2.64%），两两
    MAD 11.2–13.8 全互异；d（+21s）=暗场过渡帧（彩色占比 0.07%，与播放帧
    2–4% 明显断层），时点与片尾/退出过渡吻合（不区分片尾暗场与退出淡出，
    如实口径）。
  - R2：a/b/c 14,171/16,158/12,775 色，两两 MAD 11.0–14.4 全互异。
  - 目检：任素汐演唱画面彩色可见（R1 首播 t8 帧含「胡广生」标题卡+歌词字幕；
    R2 b/c 帧姿态与字幕位置不同=画面真实推进）。
- **完成判据（如实口径）**：该系统播放器不注册 MediaSession（`dumpsys
  media_session` 播放窗内恒 state=null，R1 首播全程 24s 采样在案），拿不到
  播放器完成回调。完成=**推断依据：时长+窗口生命周期+自退**——播放器前台
  窗口存在 21.3–21.4s ≈ ffprobe 片长 22.5s（差≈1s 为起播/焦点判定偏置），
  无任何交互下窗口自动消失、焦点回到既有前台（hy2tunvpn），与「播完 EOF
  自退」一致；视频末段过渡帧（R1 d）为直接旁证。
- ③DPD1 深度 overlay：不实施（仅 APK 路加分项，本轮走①）。

## 3. 产物与改动面

- 零源码改动（主树 src/ 零触碰、UniMaker 零触碰、鸿蒙零触碰）；无 git commit。
- Mac 侧（.scratch/android_consumer/）：serve_mac（c52379da…）、fetch_mac 链接
  失败日志、udp_probe.c/udp_probe、ac_round.sh/ac_round2.sh/ac_play.sh、
  fetch_r{1,2}*.txt、unseal_r{1,2}.txt、q3_ac_r{1,2}.mac.log、
  play_r{1,2}_focus.txt、play_r1_amstart.txt、media_session_r1.txt、
  serve_mac_sample.txt、udp_mac_echo.log、netstat 对照四件、截图 11 张
  （cheng_ac_p_r1_t3/t8/t14/t20 + cheng_ac_s_r1_a-d + cheng_ac_s_r2_a-c）、
  拉回件 ac_r{1,2}_container.ssm2 / ac_r{1,2}_payload_0.bin。
- 安卓机留置（新名，交付物）：/data/local/tmp/{ac_env_r.ssm1, ac_env_r1.ssm1,
  ac_env_r2.ssm1, ac_r1_container.ssm2, ac_r2_container.ssm2, ac_r1_out/,
  ac_r2_out/, ac_ssm2_unseal(=89886b5f… 原件), ac_udp_probe} +
  /sdcard/Movies/cheng_ac_r{1,2}.mp4；MediaStore 条目 1459/1464。
- 现场纪律：既有 12 个 q3_serve 实例逐 pid 零扰动（24197/24198/27260…28568）、
  既有 ssm1/ssm2 件哈希复算全对（1eb20a17…/c074b1ed…/c11e2997…）、4443 现场
  零接触；我的 4590–4593 诊断/正式实例全部即杀清零；svc power stayon 已还原
  false；设备端临时截图已清（证据在 Mac scratch）。

## 4. 如实标注 / 遗留

1. **Mac serve 腿红**是本轮唯一未达标项（任务优先路径），切换自 serve 回环为
   任务预案明文授权；darwin QUIC 回归证据链已闭合（§1），修复归编译器/运行时
   战役另案——修复后仅需以同轮脚本把 serve 端换回 serve_mac 即可回收「真
   Mac→安卓」形态。
2. 完成回调不可得属系统播放器形态边界（非本轮缺陷），完成推断依据三重
   （片长+窗口生命周期+自退焦点回归）与任务书对系统播放器路径的预期一致；
   如需确定性 onCompletion 回调，走②最小 APK 路（本轮无需）。
3. 回环形态下「跨机」语义弱化：fetch 客户端走设备 WLAN IP 真网栈（非 127.0.0.1
   回环地址），但收发两端同机；跨机性的两端证据由历史轮承担（安卓 q2_fetch_h
   ↔鸿蒙 serve 跨机 7/7 绿，reverse_transfer §0）。
4. 瞬态首连 negotiate 失败（每 server 首实例首连 FAIL、重试即愈）与 R1 Mac 腿
   的 scan_exhausted 是否同根未定谳（前者自愈、后者不自愈）；登记待 darwin
   回归修复时一并查。
