# sv_serve_android_v2_redeploy.md — 安卓 serve 当代树重烤+部署+单角色收官（2026-09-21）

**判词：黄（重烤部署绿+单角色出站 PASS；dual 收官轮因安卓 VPN（Cheng HY2 TUN）开着按任务书跳过，ready 态+一键命令在案）。** 层 3 矩阵 C 出站腿的清偿前提「安卓 sv_serve_android 用当代树重烤」（darwin_quic_fix_v2_scanpark.md §4）已兑现：v2 件（含 quic 泵门 gate v2 71dec35b0 + F-H5/dual-role lock）单角色跨机出站 fetch 全判据绿，serve 端 `served key=sv-closure length=28897` 为当代安卓 serve 首次跨机受理。

## 1. 重烤（源入口+驱动+NDK 链，配方沿 results/fd_libp2p_slice.md §G2 重建）

- 源：`src/tools/sv_libp2p_serve.cheng`（主树 HEAD `5bdb73644`，含 `71dec35b0` 泵门 v2；`src/quic/native_runtime.cheng` 工作树对 HEAD 干净，park 门在件）。任务目录：`.scratch/darwin_ohos_reg/sv_v2_rebake/`。
- 驱动：`artifacts/bootstrap/cheng.stage3`（[binstamp] v7）。
- obj emit：`system-link-exec --root:/Users/lbcheng/cheng-lang --in:src/tools/sv_libp2p_serve.cheng --emit:obj --target:aarch64-linux-android --out:sv_serve_android_v2.o --report-out:…report.txt`（obj 44,392,504B；`unresolved_symbol_count=0`）。
- **双 main 补丁（fd 配方重建 `patch_obj_main.py`）**：v7 驱动 obj 仍有 fd_libp2p_slice.md §G2 登记的双 `main` 缺陷（wrapper `main`@0x0 + 程序 `main`@0x552ca8，GLOBAL FUNC ×2 实测）；按 fd 同法把程序 main 改名 `cheng_prog_main`（symtab idx=1383，strtab 拼接 +16B），wrapper `bl main` 经符号索引落点不变。金丝雀对照组实证：未补丁件真机自旋挂死（timeout rc=124），补丁件 rc=0。
- provider 闭包：psb/psh/dbg 三 obj（同配方当代树重烤，aarch64-linux-android）+ `src/tools/ssm1_ohos_shim.c`（NDK 编，`-Dmain=fb_shim_unused_main`；供 atomic 四件套/event lock/fail_stop/sock/terminal 全家桥）+ `rss_bridge_android.c`（任务目录新件：`cheng_native_process_rss_bytes_value_bridge` 唯一定义在 core_runtime_provider_linux.cheng，android 冷编不可用，按 UniMaker ssm1_napi_shim.c:225 ohos 精确同源实现 statm 读数，门禁闭包非兜底，主树零改动）。
- 链接：NDK r27 `aarch64-linux-android28-clang -O2 -pie` + `-ffunction-sections -Wl,--allow-multiple-definition -Wl,--gc-sections`。残余未定义=纯 bionic libc（`residual_runtime_undef=0`，RESIDUAL_CLEAN）。
- **产物：`sv_serve_android_v2` 45,537,448B，sha256 前 16 = `ff72bcdbce4c4ce0`**（全值 `ff72bcdbce4c4ce06ed4074d5be469306106a35c9608457dab13caf83df30732`，`sv_serve_android_v2.sha256.txt` 在案）。
- 金丝雀（规则 10-②）：android 目标全链判活 `bake_canary_android.sh`——two_line + ordinary_zero 真机 `RUN_RC=0` ×2。

## 2. 部署（38120）

- push `/data/local/tmp/sv_serve_android_v2`，机上 sha256 前 16 与产物全等 `ff72bcdbce4c4ce0`。
- 旧实例清扫：/proc cmdline **arg0 精确扫描**只杀 sv_serve 族（4444/4460/4480 既有守护与 4443 零接触，netstat 事后复核三守卫原样）。
- **启动形教训（deploy1/2 红换来的）**：一发式 `adb shell "…nohup/setsid cmd &"` 在起会话退出瞬间被信号 teardown 杀掉，runtime 优雅收场打印 `accept timed code=0`+`SV_SERVE_DONE served=0`——与 v2_scanpark 轮「我的启动败」同坑；**不是二进制红**（同件前台跑 `--wait-ms 20000/300000` 分别整 20.03s/40s+ 正常，金丝雀 rc=0）。修正形=子壳双离 `(setsid … &)` + 同会话内轮询 netstat 确认在听（`start_sv38120_v2.sh` 已固化）。
- 终态：`0.0.0.0:38120` 在听，pid 12416，启动参数沿 start_sv38120.sh 原配方（`--max-serve 4 --wait-ms 300000`，约 5h 自然退出）；READY/PART 五件 sha256 与载荷基线逐字节全对（0175b22c/fed24d6f/16c89b37/64721332/b444f023）。

## 3. 单角色验证（svro_round.sh v2r1，1 轮，鸿蒙→安卓出站 fetch）

`VERDICT=PASS`，判据原文（rounds/svro_v2r1.hilog.stream + svro_r1 判据行）：

```
sv_fetch_done rc=0 resp=SV_FETCH_BYTES=28897 SV_FETCH_MS=1764 SV_FETCH_DIAL_MS=1516
F0=f1_ball.svblock,3035,0175b22c…b2fb19e,1 … F4=ballbalance.csgworld,530,b444f023…5a2ff026,1
SV_FETCH_OK=1
LIBP2P SVFETCH PASS totalMs=1814 rc_line=DONE rc=0
```

- 28,897B ✓；F0..F4 五件 ok=1、sha256 与 fe_hap_libp2p.md/F-D 基线逐字节全对 ✓；SV_FETCH_MS=1764（dial 1516）在历史区间（1268–1962ms）✓。
- serve 侧回执（sv38120_v3.log 原文）：`sv_libp2p_serve: readable stream id=4` + `sv_libp2p_serve: served key=sv-closure offset=0 length=28897` ✓。
- 注：VPN 开着本腿仍过——污染路径是安卓 shell uid 的 UDP **出站**（q2_fetch 族），鸿蒙→安卓方向不受影响；与任务书预判一致（红签名 rc=42/超时才判污染，本次无）。

## 4. dual 收官判定：VPN 开着 → 跳过（ready 态）

- 实测：`dumpsys connectivity` → `VPN CONNECTED … VpnTransportInfo{type=1, sessionId=Cheng HY2 TUN}`（network{132}，OwnerUid 10242）；`ip rule` 含 tun0 规则 ×3；`ip link show tun0` Permission denied（shell uid 无权，旁证 TUN 在管）。
- 按任务书第 5 步：**不跑 dor_dual_round.sh**。dual 收官前提=入站 fetch sha 全等+出站 SVFETCH PASS+守卫全 0；本腿在 VPN 关后一键执行：

```
sh /Users/lbcheng/cheng-lang/.scratch/darwin_ohos_reg/sv_v2_rebake/start_sv38120_v2.sh && \
sh /Users/lbcheng/cheng-lang/.scratch/darwin_ohos_reg/rounds/dor_dual_round.sh 1
```

（`start_sv38120_v2.sh` 已含旧族清扫+修正启动形；dor_dual_round.sh 原样。）

## 5. 清场与回滚

- 实例登记：`sv_serve_android_v2` pid 12416 留守 38120（为 dual 收官轮备用，`--wait-ms 300000` 约 5h 自然退出）；清扫命令同 start_sv38120_v2.sh 内建 arg0 扫描。探针件（canary_*_probe、sv_probe*.{log,port}）已删；acapk_canary*/ac_udp_probe 为他 lane 在件未动。
- 回滚（随时可切）：旧冻结件 `/data/local/tmp/sv_serve_android`（09-17 14:52，45,521,672B，sha 前 16 `f1b15a9f089d66cb`）**未动**；`pkill` sv_serve 族后按原 `start_sv38120.sh` 一发式起旧件即回滚（该件为一发式启动存活的老代见证，若遇同款 teardown 杀，改用 start_sv38120_v2.sh 把二进制名换回旧件即可）。
- 主树零改动、无 commit；Mac 侧无 serve 残留进程；hdc/adb 全程带看门狗+温度门（安卓 420≤430，鸿蒙 360≤430，串行+轮间 sleep）。

## 6. 证据清单（.scratch/darwin_ohos_reg/sv_v2_rebake/ + rounds/）

| 面 | 文件 |
| --- | --- |
| 烤链 | bake_canary_android.sh、patch_obj_main.py、bake_serve_android_v2.sh、bake_providers_android.sh、link_serve_android_v2.sh、rss_bridge_android.c、*.report.txt/*.link.log |
| 判活 | canary_two_line_runrc.txt、canary_ord_runrc.txt（RUN_RC=0 ×2） |
| 产物 | sv_serve_android_v2（45,537,448B）、sv_serve_android_v2.sha256.txt、sv_serve_android_v2.undef.txt |
| 部署 | deploy_sv_v2_38120.sh、start_sv38120_v2.sh、sv38120_v3.log（READY+PART 五 sha 原文） |
| 单角色 | rounds/svro_v2r1.{hilog.stream,hilog.raw}、svro_v2r1_start.txt（PASS 全判据） |
| 启动教训 | deploy1/2 日志同款 `accept timed+DONE` teardown 签名 vs 前台 20.03s/40s 正常对照（本档 §2） |
