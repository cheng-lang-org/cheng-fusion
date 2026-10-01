# fg_android_verify.md — ORCMISS 修复后 libp2p fetch 安卓真机验证 + 压缩闭包端到端（任务 F-G，2026-09-17）

**判词：PASS（安卓宿主形全绿）——修复后 `sv_libp2p_fetch_export.cheng` 重编 android obj → NDK API28 bionic PIE，Mac serve → 安卓真机 fetch 5/5 轮全 PASS（28,897B、5/5 逐文件 SHA 对拍、rc=0，SV_FETCH_MS=1272/1248/1172/1176/1120）；fetch 落地闭包在设备上直接 restore 3/3（ck-1200/2400/3600 → rc=0、finalTick=1300/2500/3700、replayCidMatch=1）。「29KB 上线 → 设备可重演」数字闭环成立。边界：本验证 = 安卓 bionic 宿主形功能回归（证明重组后调用序列正确、且修复未在 android 宿主形引入回归）；ohos 形 ORCMISS 崩溃是否同修需鸿蒙回归装机 HAP `b30f2670…`（versionCode 1000009）后方可宣告，不因本轮安卓绿而预记。**

---

## 0. 任务与输入

- 背景：fe_hap_libp2p.md §9——ohos HAP 形 fetch 崩于 `Libp2pQuicDialOneShotClientNamed → cold-drop-object:217 → ORCMISS`；修复 = 调用点重组（不走 OneShot 包装，按 ssm1q_loopback_export 鸿蒙 PASS 形状直调原语：AddrFromHostPort → 显式 settings 覆盖 → ConfigureTlsWithServerName → dial）。修复后 ohos obj `c520fb40…` 已编，**android obj 此前仍是修复前源**（F-E §1.4 的 `660d123b…`）。
- 本任务：用修复后源重编 android obj 并链真机 exe，安卓真机（DCO-AL00，GBJ0222B24021692，USB）验证全部当前可验证面；鸿蒙离线不等待。

## 1. 重建产物（修复后源，SHA-256 实测）

| 产物 | 形态 | SHA-256 / 大小 |
| --- | --- | --- |
| `.scratch/fg/sv_libp2p_fetch_export_android.o` | android obj（修复后源重编，llvm-nm：`main` 符号 0 个、`sv_libp2p_fetch_run` T） | `9d3417e46f22a2a27bd84525fd360f886a4629d2862eb398617d7f3c1759cf9f`，11,548,176B |
| `.scratch/fg/sv_fetch_android_fixed` | bionic PIE fetch 宿主（NDK r27 `aarch64-linux-android28-clang -O2 -march=armv8-a -pie -Wl,--allow-multiple-definition -Wl,--gc-sections`，fe_harness.c + 本 obj + F-D psb/psh/dbg/shim_android.o，链接 RC=0） | `4df2bebba336159b6b74cfa2811083b0658dc183b53d1840f4f65aa3069430a3`，45,428,176B |
| `.scratch/fd/sv_libp2p_serve`（Mac serve，源未改，复用） | darwin exe | `1a02b9000c5b7ce3dde077aae217abfd7e8c9936253e5351f944384fff43f321`，18,180,048B |
| 设备 `/data/local/tmp/sv_snapshot_android`（restore 驱动，F-D 件复用） | bionic PIE | 设备端实测 `85c22d38…7fdf` == fd_libp2p_slice.md 登记 |
| 设备 `/data/local/tmp/sv_fetch_fg` | 与 Mac 侧逐字节同 | 设备端实测 `4df2bebb…30a3` |

- serve 输入五件 Mac 侧 SHA 逐一核对 == 模块常量（f1_ball.svblock `0175b22c…`、ck-1200 `fed24d6f…`、ck-2400 `16c89b37…`、ck-3600 `64721332…`、ballbalance.csgworld `b444f023…`）。
- serve 每轮 `SV_SERVE_READY port=38130 bytes=28897` + 5×`SV_SERVE_PART` sha 与常量一致，每连接 `served key=sv-closure offset=0 length=28897`。

## 2. Mac serve → 安卓 fetch（修复版），5 独立轮

方式：每轮独立 serve 进程（0.0.0.0:38130，ready 后设备 adb 起 fetch，host=192.168.1.8），轮内 `rm -rf out_rN` 后新目录落盘；adb pty 吞 stdio 规避 = 重定向文件后 cat。逐轮五文件 adb pull 回 Mac `shasum -a 256` 对拍。

| 轮 | rc | SV_FETCH_BYTES | 逐文件 SHA | SV_FETCH_DIAL_MS | SV_FETCH_MS（请求→收全） | pull 回对拍 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0 | 28897 | 5/5 ok=1 | 1164 | 1272 | 5/5 == 常量 |
| 2 | 0 | 28897 | 5/5 ok=1 | 1080 | 1248 | 5/5 == 常量 |
| 3 | 0 | 28897 | 5/5 ok=1 | 1084 | 1172 | 5/5 == 常量 |
| 4 | 0 | 28897 | 5/5 ok=1 | 1052 | 1176 | 5/5 == 常量 |
| 5 | 0 | 28897 | 5/5 ok=1 | 1016 | 1120 | 5/5 == 常量 |

- 每轮 diag（svStage→stderr）：`STAGE2 dial_ok → negotiate_ok → read_ok → part i=0..4 shaOk=1 → parts_done → conn_closed`，零 ORCMISS、零 SIGSEGV。
- **5/5 全 PASS**：修复后调用序列（直调原语 + 显式 settings + dial）在真机安卓宿主形功能正确。

### 与 F-D 修复前基线对照（同为 Mac serve → 安卓 fetch，同载荷）

| | F-D 修复前（OneShot 包装，3 轮） | F-G 修复后（直调重组，5 轮） |
| --- | --- | --- |
| SV_FETCH_MS | 1248 / 1156 / 1220（均值 1208） | 1272 / 1248 / 1172 / 1176 / 1120（均值 1198） |
| SV_FETCH_DIAL_MS | 1176 / 1080 / 1148 | 1164 / 1080 / 1084 / 1052 / 1016 |
| rc / 字节 / SHA | 3/3 全对 | 5/5 全对 |

同量级（均值差 <1%），重组未引入性能回退；唯一源码差异 = dial 调用点形状（F-D 基线 exe `f26901f2…` vs 本轮 `4df2bebb…`）。

## 3. 压缩闭包端到端：设备本机 restore（用 fetch 落地件）

第 2 节 fetch 落地件直接作 restore 输入（ck-1200/2400/3600 分别取 out_r1/r2/r3——即三个不同 fetch 轮的落地物），F-D G3 先例的 `sv_snapshot_android`（SHA 与登记一致）。命令形：

```
/data/local/tmp/sv_snapshot_android restore --block /data/local/tmp/sv_fg/out_rN/f1_ball.svblock \
  --world /data/local/tmp/sv_fg/out_rN/ballbalance.csgworld --ckpt ck-NNNN --ahead 100 \
  --res-dir /data/local/tmp/sv_fg/out_rN
```

| 轮 | 来源 fetch 轮 | rc | replayCidMatch | finalTick | restore |
| --- | --- | --- | --- | --- | --- |
| ck-1200 | out_r1（第 1 轮） | 0 | 1 | 1300 | ok |
| ck-2400 | out_r2（第 2 轮） | 0 | 1 | 2500 | ok |
| ck-3600 | out_r3（第 3 轮） | 0 | 1 | 3700 | ok |

- decodeCid==replayCid 内置对拍逐轮命中；checkpoint+ahead 推进与 F-D G3（1300/2500/3700）逐字一致。
- 用法备注（非缺陷）：`--ckpt` 取 **id**（`ck-1200`），payload 路径由 `--res-dir` 拼出；传整路径会报 `FAIL ckpt not in block: <路径>`（驱动按块内快照记录匹配 id，首轮误传路径 rc=1，改 id 后 3/3 绿，已在案）。

## 4. 边界声明（不许预记的部分）

1. **安卓宿主形验证 ≠ ohos 形已修**。ORCMISS 崩溃是 ohos 目标独有（§9.2：同源 android/darwin obj 修复前即 3/3 绿），本轮安卓绿证明的是：修复（调用点重组）语义正确、且未在 android 宿主形引入新回归。ohos 生成码上的同族大结构拷贝 orc_miss 上游后端欠账仍在案，**鸿蒙真机回归装机 HAP `b30f26708eb333b1…`（versionCode 1000009）并 3 轮 SV_FETCH_OK=1 后，ohos 形闭环才算达成**。
2. restore 驱动与 serve 均为 F-D 冻结件复用（源未改动，SHA 对拍确认），本轮未重编；fetch 修复不波及两者。
3. 跨机方向本轮为 Mac(WLAN 192.168.1.8) → 安卓(USB)；「安卓 serve → 鸿蒙 fetch」方向不在本任务白名单。

## 5. 结论

**PASS-安卓面全绿**：修复后 fetch 代码路径在真机宿主形 5/5（MS 1120–1272ms，与修复前基线同量级）、5 件 SHA 逐轮全对拍、restore 3/3（finalTick 1300/2500/3700）——「28,897B 压缩闭包上线 → 设备 fetch 完成即拥有可恢复世界 → 本机重演」数字闭环在安卓真机成立。鸿蒙 HAP 装机回归（`b30f2670…`）是 ohos 形 ORCMISS 闭环的唯一剩余步骤，设备回归后照 fe_hap_libp2p.md §9.4 执行。

逐轮原始产物：`.scratch/fg/{serve_r1..5.log, out_r1..5/, fg_wlan_rounds.sh}`；设备端 `/data/local/tmp/sv_fg/{reply_r*, diag_r*, restore_ck*}.txt`、`/data/local/tmp/sv_fg/out_r1..3/`。设备侧测试进程无遗留（serve 为 Mac 侧进程，轮轮即杀；设备仅留可复用 exe/载荷/结果）。
